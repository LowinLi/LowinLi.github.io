/**
 * 鱼吃鱼（用户要的）：
 * - 开局先挑一条鱼：红、黄、蓝、绿（左右键 / 点卡片选，A 确定）。
 * - 进了大海以后，方向键让鱼朝那个方向一直游；或者在屏幕上移动鼠标 / 手指，鱼朝指针游过去（到了就停）。
 * - 比自己小的鱼游过去就吃掉，吃得越多长得越大（一共 5 级）；比自己大的鱼平时不理你，
 *   但你凑得太近（招惹它）它会先愣一下冒个「!」，然后追你几秒，被追上就被吃掉——赶紧跑。不招惹它就不咬。
 * - 长到 3 级有绝招：点鼠标左键（或 A）往前猛冲一下，冲的时候嘴张得更大、能一口吞掉面前的小鱼；冲完要歇 1.4 秒。
 * - 开局一分钟后才来第一条鲨鱼（用户要的），之后隔一阵来一条：屏幕边上先闪「鲨鱼来了」，它进来以后会主动追你七八秒再游走，鲨鱼谁也吃不了它，只能逃。
 * 被吃掉就结束；分数按吃掉的鱼算（大鱼分多），最好成绩记在 game.fish.best。
 */
import { W, H, store, rr, text, panel, Fx, sfx, hudPill, vignette, keyChip, type Game, type Key } from './kit';

type St = 'ready' | 'play' | 'over';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BEST = 'game.fish.best';

/** 四条能选的鱼：主色、深色（背和鳍）、浅色（肚子） */
const PICKS = [
  { name: '红鱼', c: '#ef4b3c', d: '#a8231a', l: '#ffb3a6' },
  { name: '黄鱼', c: '#f7c531', d: '#c98a0c', l: '#fff0b0' },
  { name: '蓝鱼', c: '#3b8df2', d: '#1c4fa8', l: '#b8dcff' },
  { name: '绿鱼', c: '#3fbf6a', d: '#1d7a3f', l: '#bff0cc' },
] as const;
/** 野鱼的配色 */
const WILD = [
  { c: '#ff9a3c', d: '#c25f10', l: '#ffe0b8' },
  { c: '#a77bf0', d: '#6a3fc0', l: '#e3d4ff' },
  { c: '#2ec4c4', d: '#14807f', l: '#c2f2f2' },
  { c: '#ff7aa8', d: '#c23d6c', l: '#ffd6e5' },
  { c: '#b8c4d0', d: '#6f7f90', l: '#eef3f7' },
];
/** 每一级的身长半径和要攒够的经验 */
const LV_R = [0, 15, 20, 26, 33, 41];
const LV_XP = [0, 0, 6, 16, 30, 50];

type Pal = { c: string; d: string; l: string };
type Npc = { x: number; y: number; vx: number; vy: number; r: number; pal: Pal; ph: number; angry: number; wind: number; chomp: number; ang: number; flee: boolean };
type Shark = { x: number; y: number; vx: number; vy: number; ang: number; hunt: number; ph: number; chomp: number; leaving: boolean };
type Pop = { x: number; y: number; s: string; c: string; life: number; size: number };

/** 画一条鱼：中心 (x, y)、半径 r、朝向 ang；肚子总是朝下（往左游时上下翻过来） */
function drawFish(g: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, p: Pal, ph: number, mouth: number, look = 0) {
  g.save(); g.translate(x, y); g.rotate(ang); if (Math.cos(ang) < 0) g.scale(1, -1);
  const tail = Math.sin(ph) * 0.35;
  // 尾巴
  g.save(); g.translate(-r * 0.85, 0); g.rotate(tail);
  g.fillStyle = p.d; g.beginPath(); g.moveTo(r * 0.15, 0); g.quadraticCurveTo(-r * 0.5, -r * 0.2, -r * 0.75, -r * 0.7); g.quadraticCurveTo(-r * 0.5, 0, -r * 0.75, r * 0.7); g.quadraticCurveTo(-r * 0.5, r * 0.2, r * 0.15, 0); g.fill();
  g.restore();
  // 背鳍、腹鳍
  g.fillStyle = p.d;
  g.beginPath(); g.moveTo(-r * 0.4, -r * 0.55); g.quadraticCurveTo(-r * 0.05, -r * 1.15, r * 0.35, -r * 0.6); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-r * 0.25, r * 0.5); g.quadraticCurveTo(-r * 0.05, r * 0.95, r * 0.2, r * 0.55); g.closePath(); g.fill();
  // 身子：主色渐变，肚子浅
  const body = g.createLinearGradient(0, -r * 0.7, 0, r * 0.7); body.addColorStop(0, p.d); body.addColorStop(0.35, p.c); body.addColorStop(0.8, p.l); body.addColorStop(1, p.l);
  g.fillStyle = body;
  const m = mouth * 0.5; // 张嘴：前面切掉一块楔形
  g.beginPath();
  g.ellipse(0, 0, r, r * 0.68, 0, m, Math.PI * 2 - m);
  if (m > 0.02) g.lineTo(r * 0.55, 0);
  g.closePath(); g.fill();
  // 鳞片的细弧线
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = Math.max(1, r * 0.06);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-r * 0.15 - i * r * 0.25, 0, r * 0.4, -0.9, 0.9); g.stroke(); }
  // 鳃线
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = Math.max(1, r * 0.07); g.beginPath(); g.arc(r * 0.35, 0, r * 0.5, 2.2, 4.1); g.stroke();
  // 胸鳍（跟着划水）
  g.save(); g.translate(r * 0.05, r * 0.12); g.rotate(0.5 + Math.sin(ph * 1.3) * 0.3); g.fillStyle = p.d; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(-r * 0.18, 0, r * 0.25, r * 0.1, 0, 0, 7); g.fill(); g.restore();
  // 眼睛
  const ex = r * 0.5, ey = -r * 0.2, er = Math.max(2.2, r * 0.17);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, er, 0, 7); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(ex + er * 0.25 + look, ey, er * 0.58, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + er * 0.4, ey - er * 0.3, er * 0.22, 0, 7); g.fill();
  g.restore();
}

/** 鲨鱼：灰背白肚、高背鳍、新月形尾巴、一排牙 */
function drawShark(g: CanvasRenderingContext2D, s: Shark, t: number) {
  const r = 62;
  g.save(); g.translate(s.x, s.y); g.rotate(s.ang); if (Math.cos(s.ang) < 0) g.scale(1, -1);
  const tail = Math.sin(s.ph) * 0.25;
  g.save(); g.translate(-r * 1.15, 0); g.rotate(tail); g.fillStyle = '#5d6b78';
  g.beginPath(); g.moveTo(r * 0.2, 0); g.lineTo(-r * 0.35, -r * 0.62); g.quadraticCurveTo(-r * 0.15, 0, -r * 0.3, r * 0.42); g.closePath(); g.fill(); g.restore();
  g.fillStyle = '#5d6b78';
  g.beginPath(); g.moveTo(-r * 0.2, -r * 0.33); g.lineTo(r * 0.05, -r * 0.95); g.lineTo(r * 0.3, -r * 0.33); g.closePath(); g.fill(); // 背鳍
  g.beginPath(); g.moveTo(-r * 0.75, -r * 0.18); g.lineTo(-r * 0.62, -r * 0.42); g.lineTo(-r * 0.5, -r * 0.18); g.fill();
  g.beginPath(); g.moveTo(r * 0.05, r * 0.2); g.lineTo(-r * 0.35, r * 0.62); g.lineTo(r * 0.3, r * 0.25); g.closePath(); g.fill(); // 胸鳍
  const body = g.createLinearGradient(0, -r * 0.4, 0, r * 0.4); body.addColorStop(0, '#4f5d6a'); body.addColorStop(0.45, '#8394a3'); body.addColorStop(0.62, '#e9eef2'); body.addColorStop(1, '#f6f8fa');
  g.fillStyle = body; g.beginPath();
  g.moveTo(r * 1.15, 0.02 * r);
  g.bezierCurveTo(r * 0.9, -r * 0.42, -r * 0.5, -r * 0.42, -r * 1.2, -r * 0.06);
  g.lineTo(-r * 1.2, r * 0.06);
  g.bezierCurveTo(-r * 0.5, r * 0.36, r * 0.8, r * 0.4, r * 1.15, 0.02 * r);
  g.fill();
  // 鳃裂
  g.strokeStyle = 'rgba(40,50,60,.45)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(r * (0.42 - i * 0.08), -r * 0.12); g.lineTo(r * (0.38 - i * 0.08), r * 0.12); g.stroke(); }
  // 嘴和牙
  const open = 0.4 + Math.max(s.chomp, s.hunt > 0 ? 0.35 + 0.25 * Math.sin(t * 8) : 0) * 0.8;
  g.fillStyle = '#4a1a22'; g.beginPath(); g.moveTo(r * 1.02, r * 0.1); g.quadraticCurveTo(r * 0.75, r * (0.12 + open * 0.25), r * 0.55, r * 0.14); g.quadraticCurveTo(r * 0.8, r * 0.1, r * 1.02, r * 0.1); g.fill();
  g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { const tx = r * (0.62 + i * 0.08); g.beginPath(); g.moveTo(tx, r * 0.12); g.lineTo(tx + 3, r * 0.12 + 6); g.lineTo(tx + 6, r * 0.12); g.fill(); }
  // 眼睛：小而黑，追你的时候有一道红光
  g.fillStyle = '#111'; g.beginPath(); g.arc(r * 0.72, -r * 0.1, 4, 0, 7); g.fill();
  if (s.hunt > 0) { g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(r * 0.73, -r * 0.11, 1.6, 0, 7); g.fill(); }
  g.restore();
}

export function fishGame(): Game {
  const fx = new Fx();
  let st: St = 'ready', sel = 0, rec = false, guard = 0;
  let px = W / 2, py = H / 2, ang = 0, ph = 0, mouth = 0, lv = 1, xp = 0, score = 0, eaten = 0, best = store.get(BEST);
  let dirX = 0, dirY = 0, mode: 'key' | 'mouse' | 'idle' = 'idle', mx = W / 2, my = H / 2, lastPX = -1, lastPY = -1;
  let dash = 0, cool = 0, rTarget = LV_R[1], r = LV_R[1], inv = 0, el = 0;
  let npcs: Npc[] = [], shark: Shark | null = null, sharkIn = 60, warn = 0, warnSide = 1, spawn = 0, pops: Pop[] = [], dead = 0;
  // 场景装饰：气泡、水草、光柱
  const bubbles = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(1.5, 4), v: rand(14, 40) }));
  const weeds = Array.from({ length: 14 }, (_, i) => ({ x: i * 48 + rand(-10, 10), h: rand(40, 95), c: Math.random() < 0.5 ? '#2f8a5a' : '#3fa36b', ph: rand(0, 6) }));
  const pebbles = Array.from({ length: 30 }, () => ({ x: rand(0, W), y: rand(338, 358), r: rand(2, 6), c: ['#d8c79a', '#c9b484', '#e8dcb5', '#b9a57a'][Math.floor(rand(0, 4))] }));

  const say = (x: number, y: number, s: string, c = '#fff', size = 20) => pops.push({ x, y, s, c, life: 1, size });
  const reset = () => {
    px = W / 2; py = H / 2; ang = 0; lv = 1; xp = 0; score = 0; eaten = 0; r = rTarget = LV_R[1]; dash = cool = 0; inv = 1.5; el = 0;
    npcs = []; shark = null; sharkIn = 60; warn = 0; spawn = 0; pops = []; dirX = dirY = 0; mode = 'idle'; dead = 0; // 鲨鱼开局一分钟后才来（用户要的）
    for (let i = 0; i < 8; i++) addNpc(true, i < 2);
  };
  /** 加一条野鱼：大多比你小，三成左右比你大；从左右两边游进来 */
  function addNpc(anywhere = false, big = Math.random() < 0.3) {
    const rr0 = big ? r * rand(1.25, 1.9) : r * rand(0.4, 0.82);
    const nr = clamp(rr0, 6, 58);
    const side = Math.random() < 0.5 ? -1 : 1;
    const sp = rand(28, 62) * (big ? 0.8 : 1);
    const x = anywhere ? rand(30, W - 30) : side < 0 ? -nr - 10 : W + nr + 10;
    let y = rand(40, 320);
    if (anywhere && Math.hypot(x - px, y - py) < 120) y = py > H / 2 ? rand(40, 110) : rand(250, 320);
    npcs.push({ x, y, vx: -side * sp, vy: rand(-6, 6), r: nr, pal: WILD[Math.floor(rand(0, WILD.length))], ph: rand(0, 6), angry: 0, wind: 0, chomp: 0, ang: side < 0 ? 0 : Math.PI, flee: false });
  }
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const die = (by: string) => {
    if (inv > 0 || st !== 'play') return;
    st = 'over'; guard = 1; dead = 1; fx.shake = 0.5;
    fx.burst(px, py, [PICKS[sel].c, '#fff', '#ff3b3b'], 28, 200, 4.5, 60);
    say(px, py - 20, by, '#ff5a5a', 22);
    if (score > best) { best = score; store.set(BEST, best); rec = true; fx.confetti(); sfx.win(); } else sfx.lose();
  };
  const grow = (n: number) => {
    xp += n;
    while (lv < 5 && xp >= LV_XP[lv + 1]) {
      lv++; rTarget = LV_R[lv]; sfx.bonus();
      say(px, py - r - 20, lv === 3 ? 'Lv3！解锁冲刺绝招' : `长大了！Lv${lv}`, '#ffe066', lv === 3 ? 22 : 20);
      fx.burst(px, py, ['#ffe066', '#fff', PICKS[sel].c], 24, 180, 4, 0);
    }
  };
  const doDash = () => {
    if (st !== 'play') return;
    if (lv < 3) { if (cool <= 0) { say(px, py - r - 16, '长到 3 级才能冲刺', '#cfe8ff', 15); cool = 0.8; } return; }
    if (cool > 0 || dash > 0) return;
    dash = 0.42; cool = 1.4; sfx.whoosh();
  };

  // 调试：URL 带 ?fishdbg 时把内部状态挂到 window.__fish（测试脚本用它找最近的小鱼、直接升级试冲刺）
  if (typeof location !== 'undefined' && location.search.includes('fishdbg')) {
    (window as unknown as { __fish: unknown }).__fish = {
      get: () => ({ st, px, py, r, lv, xp, score, eaten, dash, cool, shark: shark && { x: shark.x, y: shark.y }, npcs: npcs.map((n) => ({ x: n.x, y: n.y, r: n.r, angry: n.angry > 0 })) }),
      grow, noShark: () => { sharkIn = 1e9; },
    };
  }
  return {
    state: () => (st === 'ready' ? 'ready' : st),
    update(dt) {
      fx.update(dt); guard = Math.max(0, guard - dt);
      for (const p of pops) p.life -= dt * 0.9; pops = pops.filter((p) => p.life > 0);
      for (const b of bubbles) { b.y -= b.v * dt; b.x += Math.sin(b.y * 0.05) * 0.2; if (b.y < -10) { b.y = H + 10; b.x = rand(0, W); } }
      if (st !== 'play') { ph += dt * 4; return; }
      el += dt; inv = Math.max(0, inv - dt); cool = Math.max(0, cool - dt); r += (rTarget - r) * Math.min(1, dt * 4);
      // ---- 自己的鱼 ----
      let want: number | null = null, spd = 118 - lv * 4;
      if (mode === 'key' && (dirX || dirY)) want = Math.atan2(dirY, dirX);
      else if (mode === 'mouse') { const dx = mx - px, dy = my - py, d = Math.hypot(dx, dy); if (d > r * 0.6) { want = Math.atan2(dy, dx); spd *= clamp(d / 36, 0.3, 1); } else spd = 0; }
      if (dash > 0) { dash -= dt; spd = 400; if (want === null) want = ang; }
      if (want !== null) {
        let da = want - ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        ang += da * Math.min(1, dt * (dash > 0 ? 4 : 9));
        px += Math.cos(ang) * spd * dt; py += Math.sin(ang) * spd * dt;
        ph += dt * (dash > 0 ? 22 : 9 + spd / 20);
      } else ph += dt * 3;
      px = clamp(px, r, W - r); py = clamp(py, 46 + r * 0.4, 336 - r * 0.5);
      mouth = Math.max(dash > 0 ? 0.9 : 0, mouth - dt * 3);
      // ---- 野鱼 ----
      spawn -= dt;
      // 保持小鱼至少 6 条、大鱼最多 3 条（吃掉的是小鱼，不管的话海里慢慢只剩大鱼）
      if (spawn <= 0) { const bigs = npcs.filter((n) => n.r > r * 0.92).length, smalls = npcs.length - bigs; if (smalls < 6 + Math.floor(lv / 2)) addNpc(false, false); else if (bigs < 3) addNpc(false, true); spawn = rand(0.5, 1.2); }
      for (const n of npcs) {
        n.ph += dt * 7; n.chomp = Math.max(0, n.chomp - dt * 3);
        const dx = px - n.x, dy = py - n.y, d = Math.hypot(dx, dy);
        const bigger = n.r > r * 0.92;
        if (bigger) {
          // 招惹：凑得太近（或在它跟前冲过去）它就生气
          if (n.angry <= 0 && d < n.r + r + 22 && inv <= 0) { n.angry = 3.2; n.wind = 0.45; sfx.wrong(); }
          if (n.angry > 0) {
            n.angry -= dt;
            if (n.wind > 0) { n.wind -= dt; n.vx *= 0.9; n.vy *= 0.9; }
            else { const cs = 112 - lv * 4 + n.r * 0.2; n.vx += (dx / d * cs - n.vx) * dt * 3; n.vy += (dy / d * cs - n.vy) * dt * 3; }
            if (n.wind <= 0 && d < n.r * 0.8 + r * 0.55) { n.chomp = 1; die('被大鱼吃掉了'); }
            if (n.angry <= 0) { const side = n.vx > 0 ? 1 : -1; n.vx = side * rand(30, 50); n.vy = 0; } // 气消了，接着游自己的
          }
          n.flee = false;
        } else {
          // 小鱼：你离得近就往反方向躲（躲得比你慢，追得上）
          n.flee = d < 75 + r;
          if (n.flee) { const fs = 50 + n.r * 0.9; n.vx += (-dx / d * fs - n.vx) * dt * 2.2; n.vy += (-dy / d * fs - n.vy) * dt * 2.2; }
          // 吃：碰到嘴边（冲刺时嘴大一圈）
          const reach = r * (dash > 0 ? 1.25 : 0.95) + n.r * 0.5;
          if (d < reach) {
            const pts = Math.max(1, Math.round(n.r / 6)); // 越大的鱼分越多
            n.r = -1; mouth = 1; eaten++;
            score += pts; grow(pts);
            sfx.pop(); fx.burst(n.x, n.y, [n.pal.c, '#fff'], 10, 120, 3, 0);
            say(n.x, n.y - 8, `+${pts}`, '#fff', 18);
          }
        }
        if (n.r > 0) {
          if (!n.flee && n.angry <= 0) { n.vy += Math.sin(n.ph * 0.15) * 4 * dt; n.vy *= 0.99; }
          n.x += n.vx * dt; n.y += n.vy * dt;
          if (n.y < 40 + n.r * 0.5 || n.y > 330 - n.r * 0.5) { n.vy *= -0.6; n.y = clamp(n.y, 40 + n.r * 0.5, 330 - n.r * 0.5); }
          const sp = Math.hypot(n.vx, n.vy); if (sp > 4) { let da = Math.atan2(n.vy, n.vx) - n.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; n.ang += da * Math.min(1, dt * 6); }
        }
      }
      npcs = npcs.filter((n) => n.r > 0 && n.x > -n.r - 40 && n.x < W + n.r + 40);
      // ---- 鲨鱼 ----
      if (!shark) {
        sharkIn -= dt;
        if (sharkIn < 1.6 && warn <= 0) { warn = 1.6; warnSide = px > W / 2 ? -1 : 1; sfx.wrong(); }
        if (warn > 0) warn -= dt;
        if (sharkIn <= 0) { const x = warnSide < 0 ? -90 : W + 90; shark = { x, y: clamp(py + rand(-60, 60), 70, 300), vx: -warnSide * 60, vy: 0, ang: warnSide < 0 ? 0 : Math.PI, hunt: rand(7, 9), ph: 0, chomp: 0, leaving: false }; }
      } else {
        const s = shark; s.ph += dt * 6; s.chomp = Math.max(0, s.chomp - dt * 2);
        const dx = px - s.x, dy = py - s.y, d = Math.hypot(dx, dy);
        if (s.hunt > 0) {
          s.hunt -= dt;
          const cs = 104 - lv * 2; // 比你平时略慢一点点：认真逃得掉，冲刺更稳
          s.vx += (dx / d * cs - s.vx) * dt * 1.6; s.vy += (dy / d * cs - s.vy) * dt * 1.6;
          if (s.hunt <= 0) { s.leaving = true; }
        } else { const side = s.x < W / 2 ? -1 : 1; s.vx += (side * 150 - s.vx) * dt; s.vy *= 0.97; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.y = clamp(s.y, 60, 310);
        let da = Math.atan2(s.vy, s.vx) - s.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; s.ang += da * Math.min(1, dt * 3);
        // 嘴在身子前面：用嘴的位置判断咬没咬到
        const mx2 = s.x + Math.cos(s.ang) * 52, my2 = s.y + Math.sin(s.ang) * 52;
        if (Math.hypot(px - mx2, py - my2) < 26 + r * 0.6 || d < 30 + r * 0.6) { s.chomp = 1; die('被鲨鱼吃掉了'); }
        // 鲨鱼路过顺便吃掉挡路的野鱼
        for (const n of npcs) if (Math.hypot(n.x - mx2, n.y - my2) < 22 + n.r * 0.5) { n.r = -1; s.chomp = 1; fx.burst(n.x, n.y, [n.pal.c, '#fff'], 8, 100, 3, 0); }
        npcs = npcs.filter((n) => n.r > 0);
        if (s.leaving && (s.x < -140 || s.x > W + 140)) { shark = null; sharkIn = rand(16, 26) - Math.min(8, el / 30); }
      }
    },
    draw(g, t) {
      fx.begin(g, t);
      // 海：上亮下深，几道斜光柱
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#46b8e8'); bg.addColorStop(0.5, '#1b7fc0'); bg.addColorStop(1, '#0d4a85');
      g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) { const x = 60 + i * 140 + Math.sin(t * 0.4 + i) * 20; const gr = g.createLinearGradient(0, 0, 0, 300); gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 30, 300); g.lineTo(x - 90, 300); g.closePath(); g.fill(); }
      g.restore();
      // 水面的波纹
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 6 + Math.sin(x * 0.05 + t * 2) * 3); g.stroke();
      // 沙地、石子、水草、珊瑚
      g.fillStyle = '#e3cf98'; g.beginPath(); g.moveTo(-20, H + 20); g.lineTo(-20, 342); for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, 338 + Math.sin(x * 0.03) * 5); g.lineTo(W + 20, H + 20); g.fill();
      for (const p of pebbles) { g.fillStyle = p.c; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, 7); g.fill(); }
      g.lineCap = 'round';
      for (const w of weeds) {
        g.strokeStyle = w.c; g.lineWidth = 5; g.beginPath(); g.moveTo(w.x, 344);
        for (let k = 1; k <= 6; k++) g.lineTo(w.x + Math.sin(t * 1.4 + w.ph + k * 0.6) * k * 2.2, 344 - (w.h * k) / 6);
        g.stroke();
      }
      for (const [cx, c] of [[120, '#ff7a8a'], [470, '#ff9f5a']] as const) { g.strokeStyle = c; g.lineWidth = 6; for (const a of [-0.6, -0.2, 0.25, 0.6]) { g.beginPath(); g.moveTo(cx, 344); g.quadraticCurveTo(cx + a * 30, 320, cx + a * 40, 300 - Math.abs(a) * 10); g.stroke(); } }
      g.lineCap = 'butt';
      // 气泡
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; for (const b of bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.stroke(); }

      if (st === 'ready') { drawPick(g, t); g.restore(); return; }

      // 野鱼（大的画在后面）
      for (const n of [...npcs].sort((a, b) => b.r - a.r)) {
        drawFish(g, n.x, n.y, n.r, n.ang, n.pal, n.ph, n.chomp || (n.angry > 0 && n.wind <= 0 ? 0.5 + 0.3 * Math.sin(t * 12) : 0));
        if (n.angry > 0) {
          const bob = Math.sin(t * 14) * 2;
          g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(n.x, n.y - n.r - 14 + bob, 9, 0, 7); g.fill(); text(g, '!', n.x, n.y - n.r - 13 + bob, 14, '#fff', 'center', 900);
        }
      }
      // 自己
      if (!dead) {
        if (dash > 0) { g.globalAlpha = 0.35; for (let k = 1; k <= 3; k++) drawFish(g, px - Math.cos(ang) * k * 14, py - Math.sin(ang) * k * 14, r, ang, PICKS[sel], ph - k, 0.9); g.globalAlpha = 1; }
        if (inv > 0 && Math.sin(t * 30) > 0) g.globalAlpha = 0.5;
        drawFish(g, px, py, r, ang, PICKS[sel], ph, mouth);
        g.globalAlpha = 1;
        // 头顶一个小箭头标出「这是你」
        g.fillStyle = 'rgba(255,255,255,.85)'; const ay = py - r - 10 + Math.sin(t * 5) * 2; g.beginPath(); g.moveTo(px - 5, ay - 6); g.lineTo(px + 5, ay - 6); g.lineTo(px, ay); g.fill();
      }
      if (shark) drawShark(g, shark, t);
      // 鲨鱼预警：从哪边来，哪边闪红
      if (warn > 0 && Math.sin(t * 16) > -0.2) {
        const x = warnSide < 0 ? 0 : W - 70; const gr = g.createLinearGradient(x + (warnSide < 0 ? 0 : 70), 0, x + (warnSide < 0 ? 70 : 0), 0); gr.addColorStop(0, 'rgba(255,40,40,.55)'); gr.addColorStop(1, 'rgba(255,40,40,0)');
        g.fillStyle = gr; g.fillRect(x, 0, 70, H);
        text(g, warnSide < 0 ? '◀ 鲨鱼来了！' : '鲨鱼来了！ ▶', warnSide < 0 ? 80 : W - 80, H / 2, 18, '#fff', warnSide < 0 ? 'left' : 'right', 800, 'rgba(120,0,0,.6)');
      }
      fx.draw(g);
      for (const p of pops) { g.globalAlpha = Math.min(1, p.life * 2); text(g, p.s, p.x, p.y - (1 - p.life) * 28, p.size, p.c, 'center', 800, 'rgba(0,0,0,.45)'); } g.globalAlpha = 1;
      g.restore();
      vignette(g, 0.25);
      // 成绩：等级 + 经验条、分数
      hudPill(g, `Lv${lv} ${PICKS[sel].name}`, 12, 22, 'left');
      const nx = lv < 5 ? LV_XP[lv + 1] : 0, px0 = 120, bw = 120;
      g.fillStyle = 'rgba(0,0,0,.3)'; rr(g, px0, 16, bw, 12, 6); g.fill();
      g.fillStyle = '#ffe066'; rr(g, px0, 16, Math.max(12, bw * (lv < 5 ? (xp - LV_XP[lv]) / (nx - LV_XP[lv]) : 1)), 12, 6); g.fill();
      text(g, lv < 5 ? `再吃 ${Math.max(0, nx - xp)} 分长大` : '最大了！', px0 + bw + 8, 23, 12, '#fff', 'left', 600, 'rgba(0,0,0,.4)');
      hudPill(g, `得分 ${score} · 最好 ${best}`, W - 12, 22, 'right');
      // 绝招冷却：右下角一个圆
      if (lv >= 3 && st === 'play') {
        const cx = W - 34, cy = H - 34; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
        g.strokeStyle = cool > 0 ? '#9fb3c8' : '#ffe066'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cool / 1.4)); g.stroke();
        text(g, '冲', cx, cy + 1, 16, cool > 0 ? '#c8d4e0' : '#fff', 'center', 800);
      }
      if (st === 'play' && el < 4) text(g, '方向键 / 移动鼠标游动 · 吃小的，躲大的和鲨鱼', W / 2, H - 22, 14, '#fff', 'center', 600, 'rgba(0,0,0,.45)');
      if (st === 'over') panel(g, [['你的鱼没了', 22], [`得分 ${score}`, 26, PICKS[sel].d], [`吃了 ${eaten} 条 · 长到 Lv${lv} · 最好 ${best}`, 15, '#6b7280']], t, rec);
    },
    key(k: Key) {
      if (st === 'ready') {
        if (k === 'left' || k === 'up') { sel = (sel + 3) % 4; sfx.tick(); }
        if (k === 'right' || k === 'down') { sel = (sel + 1) % 4; sfx.tick(); }
        if (k === 'a') begin();
        return;
      }
      if (st === 'over') { if (k === 'a' && guard <= 0) { st = 'ready'; sfx.tick(); } return; }
      if (k === 'a') { doDash(); return; }
      mode = 'key';
      if (k === 'left') { dirX = -1; dirY = 0; } if (k === 'right') { dirX = 1; dirY = 0; }
      if (k === 'up') { dirX = 0; dirY = -1; } if (k === 'down') { dirX = 0; dirY = 1; }
    },
    tap(x, y) {
      if (st === 'ready') {
        const i = cardAt(x, y);
        if (i >= 0) { if (i === sel) begin(); else { sel = i; sfx.tick(); } } else if (y > 300) begin();
        return;
      }
      if (st === 'over') { if (guard <= 0) { st = 'ready'; sfx.tick(); } return; }
      mode = 'mouse'; mx = x; my = y; doDash();
    },
    point(x, y) {
      if (st === 'ready') { const i = cardAt(x, y); if (i >= 0 && i !== sel) { sel = i; sfx.tick(); } return; }
      // 鼠标真的挪了才接管（不然停着的指针会一直和方向键抢）
      if (Math.abs(x - lastPX) + Math.abs(y - lastPY) > 3) { mode = 'mouse'; mx = x; my = y; }
      lastPX = x; lastPY = y;
    },
  };

  // ---- 选鱼页 ----
  function cardRect(i: number) { const w = 120, gap = 16, x0 = W / 2 - (w * 4 + gap * 3) / 2; return { x: x0 + i * (w + gap), y: 112, w, h: 150 }; }
  function cardAt(x: number, y: number) { for (let i = 0; i < 4; i++) { const c = cardRect(i); if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i; } return -1; }
  function drawPick(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = 'rgba(5,20,40,.35)'; g.fillRect(-20, -20, W + 40, H + 40);
    text(g, '鱼吃鱼', W / 2, 48, 32, '#fff', 'center', 900, 'rgba(0,40,80,.6)');
    text(g, '挑一条鱼下海：吃比你小的，躲比你大的和鲨鱼', W / 2, 84, 15, '#e6f4ff', 'center', 600, 'rgba(0,0,0,.35)');
    PICKS.forEach((p, i) => {
      const c = cardRect(i), on = i === sel, lift = on ? -6 + Math.sin(t * 4) * 2 : 0;
      g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = on ? 20 : 10; g.shadowOffsetY = 6; rr(g, c.x, c.y + lift, c.w, c.h, 16); g.fillStyle = on ? '#fff' : 'rgba(255,255,255,.82)'; g.fill(); g.restore();
      if (on) { g.strokeStyle = p.c; g.lineWidth = 4; rr(g, c.x - 2, c.y + lift - 2, c.w + 4, c.h + 4, 18); g.stroke(); }
      g.save(); rr(g, c.x, c.y + lift, c.w, c.h, 16); g.clip(); const gr = g.createLinearGradient(0, c.y, 0, c.y + 100); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#e9f7ff'); g.fillStyle = gr; g.fillRect(c.x, c.y + lift, c.w, 100); g.restore();
      drawFish(g, c.x + c.w / 2 + (on ? Math.sin(t * 2) * 6 : 0), c.y + 52 + lift, 30, 0, p, t * (on ? 9 : 3) + i, on ? Math.max(0, Math.sin(t * 3)) * 0.5 : 0);
      text(g, p.name, c.x + c.w / 2, c.y + 124 + lift, 18, on ? p.d : '#4a5566', 'center', 800);
    });
    g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); keyChip(g, W / 2, 300, 'A', '或再点一下选中的鱼 · 下海'); g.globalAlpha = 1;
    text(g, '方向键 / 移动鼠标游动 · 长到 3 级点鼠标左键（A）冲刺', W / 2, 336, 13, '#d8ecff', 'center', 600, 'rgba(0,0,0,.35)');
  }
}

/** 主页图块上的动画小图：一条大鱼追着张嘴，前面一条小鱼 */
export function drawFishIcon(g: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  const k = Math.sin(t * 2);
  drawFish(g, cx + 30 + k * 4, cy - 10, 12, 0, WILD[0], t * 10, 0);
  drawFish(g, cx - 12 + k * 6, cy + 8, 30, 0, PICKS[2], t * 8, Math.max(0, Math.sin(t * 4)) * 0.8);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 46 + i * 6, cy - 30 - ((t * 20 + i * 12) % 30), 2 + i, 0, 7); g.stroke(); }
}
