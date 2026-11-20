/**
 * 掌机里另外十个小游戏（用户要的「给 switch 再增加 10 个小游戏，要求简单的，交互性强的」）。
 * 每个都能用十字键 / A 键（键盘方向键、空格）玩，也能直接在屏幕上点、拖：
 *
 * - 打地鼠：九个洞里冒地鼠，点它（或方向键挪锤子 + A）。金地鼠 +3，小白兔别打（−3）。30 秒。
 * - 接水果：拖动（或左右键）挪竹篮接住掉下来的水果，金苹果 +5；漏一个、接到炸弹都掉一颗心，三颗心。
 * - 打砖块：拖动（或左右键）挪挡板，A / 点一下发球，打碎上面的砖；三条命，清完一屏更快。
 * - 小猫跳跳：橘猫一直往前跑，点一下（A / 上）跳过白菜和葱，空中还能再跳一次；越跑越快。
 * - 反应力：等屏幕变绿马上点，五轮取平均毫秒数；变绿前点了算抢跑。
 * - 翻牌配对：十二张牌六对，一次翻两张，一样的留着；看几步翻完。
 * - 数字合并：方向键或在屏幕上滑，相同的数字撞在一起合成两倍；格子满了动不了就结束。
 * - 叠叠高：方块左右来回滑，点一下落下，伸出去的部分被切掉；对得准不切还连击。
 * - 乒乓：拖动（或上下键）挪左边的球拍，和电脑打，先得 5 分赢。
 * - 节奏黑块：四列往下走的格子，每行点那块黑的（← ↓ ↑ → 对应四列），点一下响一个音；点错或漏了结束。
 *
 * 画面逻辑尺寸 640×360，和贪吃蛇、小飞机一样；最好成绩记在 localStorage 的 game.<id>.best。
 */
import { W, H, store, beep, boom, rr, text, panel, type Game, type Key } from './kit';

type St = 'ready' | 'play' | 'over';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const bestKey = (id: string) => `game.${id}.best`;
/** 开局说明：标题 + 几行玩法 + 闪烁的「开始」 */
const intro = (g: CanvasRenderingContext2D, t: number, title: string, how: string[], color: string) => {
  g.fillStyle = 'rgba(10,14,24,.45)'; g.fillRect(0, 0, W, H);
  rr(g, W / 2 - 210, 64, 420, 66 + how.length * 28, 18); g.fillStyle = 'rgba(255,255,255,.96)'; g.fill();
  text(g, title, W / 2, 100, 28, color, 'center', 800);
  how.forEach((s, i) => text(g, s, W / 2, 140 + i * 28, 15, '#3a4150', 'center', 500));
  g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
  text(g, '按 A 或点一下屏幕开始', W / 2, 162 + how.length * 28 + 28, 16, '#fff', 'center', 700, 'rgba(0,0,0,.35)');
  g.globalAlpha = 1;
};
/** 顶上一条成绩栏 */
const hud = (g: CanvasRenderingContext2D, left: string, right: string, color = '#fff') => {
  text(g, left, 16, 20, 17, color, 'left', 700, 'rgba(0,0,0,.35)');
  text(g, right, W - 16, 20, 17, color, 'right', 700, 'rgba(0,0,0,.35)');
};
type Pop = { x: number; y: number; s: string; c: string; life: number };
const drawPops = (g: CanvasRenderingContext2D, pops: Pop[]) => { for (const p of pops) { g.globalAlpha = Math.min(1, p.life * 2); text(g, p.s, p.x, p.y - (1 - p.life) * 30, 22, p.c, 'center', 800, 'rgba(0,0,0,.4)'); } g.globalAlpha = 1; };
const agePops = (pops: Pop[], dt: number) => { for (const p of pops) p.life -= dt; return pops.filter((p) => p.life > 0); };

// ============================== 打地鼠 ==============================
function mole(): Game {
  const HX = [200, 320, 440], HY = [148, 226, 304];
  type M = { up: number; life: number; kind: 0 | 1 | 2; hit: number };
  let holes: M[] = [], st: St = 'ready', time = 30, score = 0, best = store.get(bestKey('mole')), spawn = 0, cur = 4, swing = 0, sx = 0, sy = 0, pops: Pop[] = [], guard = 0;
  const reset = () => { holes = Array.from({ length: 9 }, () => ({ up: 0, life: 0, kind: 0 as const, hit: 0 })); time = 30; score = 0; spawn = 0.4; pops = []; };
  reset();
  const whack = (i: number) => {
    const m = holes[i]; swing = 0.2; sx = HX[i % 3]; sy = HY[(i / 3) | 0] - 30;
    if (m.life > 0 && m.hit <= 0 && m.up > 0.4) {
      m.hit = 0.4; const d = m.kind === 2 ? -3 : m.kind === 1 ? 3 : 1; score = Math.max(0, score + d);
      pops.push({ x: sx, y: sy - 30, s: (d > 0 ? '+' : '') + d, c: d > 0 ? '#ffd23f' : '#ff5a4f', life: 0.8 });
      if (d > 0) { beep(900, 300, 0.12, 'square', 0.06); beep(1400, 1400, 0.05, 'triangle', 0.04); } else beep(220, 110, 0.3, 'sawtooth', 0.06);
    } else beep(150, 90, 0.06, 'triangle', 0.05);
  };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  return {
    update(dt) {
      swing = Math.max(0, swing - dt); pops = agePops(pops, dt); guard = Math.max(0, guard - dt);
      if (st !== 'play') return;
      time -= dt;
      if (time <= 0) { time = 0; st = 'over'; guard = 0.8; if (score > best) { best = score; store.set(bestKey('mole'), best); } beep(660, 330, 0.4, 'triangle', 0.07); return; }
      const lv = 1 - time / 30;
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 0.7 - lv * 0.38 + Math.random() * 0.25;
        const free = holes.map((m, i) => (m.life <= 0 ? i : -1)).filter((i) => i >= 0);
        if (free.length) { const r = Math.random(); holes[free[(Math.random() * free.length) | 0]] = { up: 0, life: 1.15 - lv * 0.45, kind: r < 0.1 ? 1 : r < 0.24 ? 2 : 0, hit: 0 }; }
      }
      for (const m of holes) {
        if (m.life <= 0) continue;
        if (m.hit > 0) { m.hit -= dt; m.up = Math.max(0, m.up - dt * 2.5); if (m.hit <= 0) { m.life = 0; m.up = 0; } continue; }
        m.life -= dt; m.up = Math.min(1, m.up + dt * 7); if (m.life < 0.15) m.up = Math.max(0, m.life / 0.15);
      }
    },
    draw(g, t) {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#9be06d'); bg.addColorStop(1, '#4f9a3a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, 50 + ((i * 53) % 300), 3, 8);
      holes.forEach((m, i) => {
        const x = HX[i % 3], y = HY[(i / 3) | 0];
        g.fillStyle = '#3b2414'; g.beginPath(); g.ellipse(x, y, 46, 15, 0, 0, 7); g.fill();
        if (m.life > 0) {
          g.save(); g.beginPath(); g.rect(x - 60, y - 110, 120, 110); g.clip();
          const by = y + 44 - m.up * 56;
          const body = m.kind === 1 ? '#f2c230' : m.kind === 2 ? '#f6f2ea' : '#8a5a3a';
          if (m.kind === 2) { g.fillStyle = body; for (const ex of [-12, 12]) { g.beginPath(); g.ellipse(x + ex, by - 46, 7, 22, ex * 0.01, 0, 7); g.fill(); } g.fillStyle = '#f4b6c2'; for (const ex of [-12, 12]) { g.beginPath(); g.ellipse(x + ex, by - 46, 3.5, 15, 0, 0, 7); g.fill(); } }
          g.fillStyle = body; g.beginPath(); g.ellipse(x, by, 30, 36, 0, 0, 7); g.fill();
          g.fillStyle = m.kind === 1 ? '#fbe08a' : m.kind === 2 ? '#fff' : '#c79a72'; g.beginPath(); g.ellipse(x, by + 8, 18, 16, 0, 0, 7); g.fill();
          if (m.hit > 0) { g.strokeStyle = '#222'; g.lineWidth = 2.5; for (const ex of [-10, 10]) { g.beginPath(); g.moveTo(x + ex - 4, by - 14); g.lineTo(x + ex + 4, by - 6); g.moveTo(x + ex + 4, by - 14); g.lineTo(x + ex - 4, by - 6); g.stroke(); } }
          else { g.fillStyle = '#1a1a1a'; for (const ex of [-10, 10]) { g.beginPath(); g.arc(x + ex, by - 10, 4, 0, 7); g.fill(); } g.fillStyle = '#fff'; for (const ex of [-9, 11]) { g.beginPath(); g.arc(x + ex, by - 11, 1.4, 0, 7); g.fill(); } }
          g.fillStyle = m.kind === 2 ? '#f08aa0' : '#e86a7a'; g.beginPath(); g.ellipse(x, by, 5, 4, 0, 0, 7); g.fill();
          if (m.kind !== 2) { g.fillStyle = '#fff'; g.fillRect(x - 4, by + 6, 3.5, 5); g.fillRect(x + 0.5, by + 6, 3.5, 5); }
          if (m.kind === 1) { g.fillStyle = '#fff'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 12); g.beginPath(); g.arc(x + 20, by - 26, 3, 0, 7); g.fill(); g.globalAlpha = 1; }
          g.restore();
        }
        g.fillStyle = '#6b4a2a'; g.beginPath(); g.ellipse(x, y + 2, 48, 13, 0, 0, Math.PI); g.fill(); // 洞口前沿的土
        if (st === 'play' && i === cur) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); g.ellipse(x, y - 20, 56, 52, 0, 0, 7); g.stroke(); g.setLineDash([]); }
      });
      if (swing > 0) { // 锤子
        g.save(); g.translate(sx + 34, sy - 10); g.rotate(-0.9 + (1 - swing / 0.2) * 1.4);
        g.fillStyle = '#a8743f'; g.fillRect(-4, -4, 8, 54); g.fillStyle = '#d24a3a'; rr(g, -22, -22, 44, 24, 6); g.fill(); g.restore();
      }
      drawPops(g, pops);
      hud(g, `⏱ ${Math.ceil(time)} 秒`, `得分 ${score} · 最好 ${best}`);
      if (st === 'ready') intro(g, t, '打地鼠', ['地鼠冒头就点它（或方向键挪锤子，按 A 砸）', '金地鼠 +3 · 小白兔别打（−3）', '30 秒'], '#5a3a1a');
      if (st === 'over') panel(g, [['时间到！', 22], [`得分 ${score}`, 26, '#d2691e'], [`最好 ${best}`, 16, '#6b7280']], t);
    },
    key(k: Key) {
      if (st !== 'play') { if (k === 'a') begin(); return; }
      if (k === 'left' && cur % 3) cur--; else if (k === 'right' && cur % 3 < 2) cur++; else if (k === 'up' && cur > 2) cur -= 3; else if (k === 'down' && cur < 6) cur += 3; else if (k === 'a') whack(cur);
    },
    tap(x, y) {
      if (st !== 'play') { begin(); return; }
      let bi = -1, bd = 1e9; for (let i = 0; i < 9; i++) { const d = Math.hypot(x - HX[i % 3], (y - HY[(i / 3) | 0] + 25) * 0.9); if (d < bd) { bd = d; bi = i; } }
      if (bd < 72) { cur = bi; whack(bi); }
    },
  };
}

// ============================== 接水果 ==============================
function catcher(): Game {
  type It = { x: number; y: number; vy: number; kind: 'apple' | 'pear' | 'orange' | 'gold' | 'bomb'; rot: number };
  let st: St = 'ready', bx = W / 2, tx = W / 2, items: It[] = [], lives = 3, score = 0, best = store.get(bestKey('catch')), spawn = 0, shake = 0, pops: Pop[] = [], guard = 0, el = 0;
  const reset = () => { items = []; lives = 3; score = 0; spawn = 0.5; el = 0; pops = []; };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  const lose = () => { lives--; shake = 0.3; if (lives <= 0) { st = 'over'; guard = 0.8; boom(); if (score > best) { best = score; store.set(bestKey('catch'), best); } } };
  const COL: Record<It['kind'], string> = { apple: '#e8463c', pear: '#c9d84a', orange: '#f59a2a', gold: '#ffd23f', bomb: '#222' };
  return {
    update(dt) {
      pops = agePops(pops, dt); shake = Math.max(0, shake - dt); guard = Math.max(0, guard - dt);
      bx += (tx - bx) * Math.min(1, dt * 14);
      if (st !== 'play') return;
      el += dt; spawn -= dt;
      const sp = 1 + el / 40;
      if (spawn <= 0) {
        spawn = Math.max(0.35, 0.95 - el / 60) * rand(0.7, 1.2);
        const r = Math.random(), kind: It['kind'] = r < 0.18 ? 'bomb' : r < 0.24 ? 'gold' : r < 0.5 ? 'apple' : r < 0.75 ? 'pear' : 'orange';
        items.push({ x: rand(40, W - 40), y: -20, vy: rand(120, 170) * sp, kind, rot: rand(0, 6) });
      }
      for (const it of items) { it.vy += 120 * dt; it.y += it.vy * dt; it.rot += dt * 2; }
      items = items.filter((it) => {
        if (it.y > 300 && it.y < 330 && Math.abs(it.x - bx) < 50) {
          if (it.kind === 'bomb') { lose(); boom(); pops.push({ x: it.x, y: 280, s: '💥', c: '#fff', life: 0.8 }); }
          else { const d = it.kind === 'gold' ? 5 : 1; score += d; pops.push({ x: it.x, y: 280, s: `+${d}`, c: it.kind === 'gold' ? '#ffd23f' : '#fff', life: 0.7 }); beep(it.kind === 'gold' ? 1200 : 700, it.kind === 'gold' ? 1800 : 1000, 0.08, 'triangle', 0.06); }
          return false;
        }
        if (it.y > H + 20) { if (it.kind !== 'bomb' && st === 'play') { lose(); beep(300, 150, 0.2, 'sawtooth', 0.05); } return false; }
        return true;
      });
    },
    draw(g, t) {
      g.save(); if (shake > 0) g.translate(Math.sin(t * 90) * shake * 12, 0);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#bfe7ff'); bg.addColorStop(1, '#eaf7ff'); g.fillStyle = bg; g.fillRect(-20, 0, W + 40, H);
      g.fillStyle = '#6aa84f'; g.fillRect(-20, 330, W + 40, 30);
      g.fillStyle = '#3d7a2e'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(i * 110 + 20, -10, 60, 0, 7); g.fill(); } // 头顶的树冠
      for (const it of items) {
        g.save(); g.translate(it.x, it.y); g.rotate(it.rot * (it.kind === 'bomb' ? 0.3 : 0.1));
        if (it.kind === 'bomb') {
          g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill(); g.strokeStyle = '#8a6a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(6, -24, 12, -22); g.stroke();
          g.fillStyle = Math.sin(t * 30) > 0 ? '#ffd23f' : '#ff5a1f'; g.beginPath(); g.arc(12, -22, 4, 0, 7); g.fill();
          g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(-5, -5, 4, 0, 7); g.fill();
        } else {
          g.fillStyle = COL[it.kind]; g.beginPath(); if (it.kind === 'pear') g.ellipse(0, 3, 13, 16, 0, 0, 7); else g.arc(0, 0, 15, 0, 7); g.fill();
          g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(-5, -5, 4, 0, 7); g.fill();
          g.strokeStyle = '#5a3a1a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -14); g.lineTo(2, -21); g.stroke();
          g.fillStyle = '#3d9a3a'; g.beginPath(); g.ellipse(7, -19, 6, 3, -0.5, 0, 7); g.fill();
          if (it.kind === 'gold') { g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 14); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 19, 0, 7); g.stroke(); g.globalAlpha = 1; }
        }
        g.restore();
      }
      // 竹篮
      g.fillStyle = '#c48a3c'; g.beginPath(); g.moveTo(bx - 52, 300); g.lineTo(bx + 52, 300); g.lineTo(bx + 40, 334); g.lineTo(bx - 40, 334); g.closePath(); g.fill();
      g.strokeStyle = '#8a5a26'; g.lineWidth = 2; for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(bx + i * 11, 300); g.lineTo(bx + i * 9, 334); g.stroke(); }
      for (const yy of [310, 322]) { g.beginPath(); g.moveTo(bx - 50, yy); g.lineTo(bx + 50, yy); g.stroke(); }
      g.fillStyle = '#a06a2a'; rr(g, bx - 56, 296, 112, 8, 4); g.fill();
      drawPops(g, pops);
      g.restore();
      hud(g, '❤'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives)), `得分 ${score} · 最好 ${best}`, '#ff5a6a');
      if (st === 'ready') intro(g, t, '接水果', ['拖动（或左右键）挪竹篮，接住掉下来的水果', '金苹果 +5 · 别接炸弹', '漏掉水果、接到炸弹都会掉一颗心'], '#c0392b');
      if (st === 'over') panel(g, [['篮子装满啦', 22], [`得分 ${score}`, 26, '#d2691e'], [`最好 ${best}`, 16, '#6b7280']], t);
    },
    key(k) { if (st !== 'play') { if (k === 'a') begin(); return; } if (k === 'left') tx = clamp(tx - 70, 50, W - 50); if (k === 'right') tx = clamp(tx + 70, 50, W - 50); },
    tap(x) { if (st !== 'play') { begin(); return; } tx = clamp(x, 50, W - 50); },
    point(x) { if (st === 'play') tx = clamp(x, 50, W - 50); },
  };
}

// ============================== 打砖块 ==============================
function bricks(): Game {
  const COLS = 9, ROWS = 5, BW = 62, BH = 18, X0 = (W - COLS * (BW + 4)) / 2 + 2, Y0 = 50, PY = 330;
  type B = { x: number; y: number; hp: number; c: string };
  let st: St = 'ready', px = W / 2, tpx = W / 2, ball = { x: W / 2, y: PY - 12, vx: 0, vy: 0, stuck: true }, list: B[] = [], lives = 3, score = 0, best = store.get(bestKey('bricks')), level = 1, speed = 330, guard = 0, pops: Pop[] = [];
  const ROWC = ['#ef5350', '#ffa726', '#ffee58', '#66bb6a', '#42a5f5'];
  const build = () => { list = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) list.push({ x: X0 + c * (BW + 4), y: Y0 + r * (BH + 5), hp: r === 0 && level > 1 ? 2 : 1, c: ROWC[r] }); };
  const reset = () => { lives = 3; score = 0; level = 1; speed = 330; build(); ball.stuck = true; pops = []; };
  reset();
  const launch = () => { if (!ball.stuck) return; ball.stuck = false; const a = rand(-0.5, 0.5); ball.vx = Math.sin(a) * speed; ball.vy = -Math.cos(a) * speed; beep(600, 900, 0.06, 'square', 0.04); };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt); pops = agePops(pops, dt);
      px += (tpx - px) * Math.min(1, dt * 16);
      if (ball.stuck) { ball.x = px; ball.y = PY - 12; }
      if (st !== 'play' || ball.stuck) return;
      for (let n = 0; n < 4; n++) {
        const h = dt / 4; ball.x += ball.vx * h; ball.y += ball.vy * h;
        if (ball.x < 8) { ball.x = 8; ball.vx = Math.abs(ball.vx); beep(400, 400, 0.03, 'square', 0.02); }
        if (ball.x > W - 8) { ball.x = W - 8; ball.vx = -Math.abs(ball.vx); beep(400, 400, 0.03, 'square', 0.02); }
        if (ball.y < 40) { ball.y = 40; ball.vy = Math.abs(ball.vy); }
        if (ball.vy > 0 && ball.y > PY - 8 && ball.y < PY + 8 && Math.abs(ball.x - px) < 50) {
          const off = (ball.x - px) / 50, a = off * 1.05, sp = Math.hypot(ball.vx, ball.vy);
          ball.vx = Math.sin(a) * sp; ball.vy = -Math.cos(a) * sp; ball.y = PY - 8; beep(520, 520, 0.05, 'square', 0.04);
        }
        for (const b of list) {
          if (b.hp <= 0) continue;
          if (ball.x + 7 > b.x && ball.x - 7 < b.x + BW && ball.y + 7 > b.y && ball.y - 7 < b.y + BH) {
            const ox = Math.min(ball.x + 7 - b.x, b.x + BW - (ball.x - 7)), oy = Math.min(ball.y + 7 - b.y, b.y + BH - (ball.y - 7));
            if (ox < oy) ball.vx *= -1; else ball.vy *= -1;
            b.hp--; if (b.hp <= 0) { score += 10; pops.push({ x: b.x + BW / 2, y: b.y, s: '+10', c: '#fff', life: 0.5 }); beep(880 + (b.y - Y0) * -3, 1200, 0.07, 'triangle', 0.05); } else beep(300, 300, 0.05, 'square', 0.04);
            break;
          }
        }
      }
      list = list.filter((b) => b.hp > 0);
      if (!list.length) { level++; speed *= 1.12; build(); ball.stuck = true; beep(660, 1320, 0.3, 'triangle', 0.06); }
      if (ball.y > H + 10) {
        lives--; ball.stuck = true; boom();
        if (lives <= 0) { st = 'over'; guard = 0.8; if (score > best) { best = score; store.set(bestKey('bricks'), best); } }
      }
    },
    draw(g, t) {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d2b53'); bg.addColorStop(1, '#3a2a6b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (const b of list) { g.fillStyle = b.c; rr(g, b.x, b.y, BW, BH, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(b.x + 3, b.y + 3, BW - 6, 4); if (b.hp > 1) { g.strokeStyle = '#fff'; g.lineWidth = 2; rr(g, b.x + 1, b.y + 1, BW - 2, BH - 2, 4); g.stroke(); } }
      g.fillStyle = '#e0e6ff'; rr(g, px - 50, PY, 100, 12, 6); g.fill(); g.fillStyle = '#7f9cff'; rr(g, px - 50, PY + 7, 100, 5, 3); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ball.x, ball.y, 7, 0, 7); g.fill();
      drawPops(g, pops);
      hud(g, `第 ${level} 关 · ${'●'.repeat(Math.max(0, lives))}`, `得分 ${score} · 最好 ${best}`);
      if (st === 'play' && ball.stuck) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); text(g, '按 A 或点一下发球', W / 2, 260, 16); g.globalAlpha = 1; }
      if (st === 'ready') intro(g, t, '打砖块', ['拖动（或左右键）挪挡板，接住球', '打在挡板边上球会斜着弹出去', '三条命 · 清完一屏下一关更快'], '#3a2a6b');
      if (st === 'over') panel(g, [['球掉光啦', 22], [`得分 ${score}`, 26, '#5b4bd6'], [`最好 ${best}`, 16, '#6b7280']], t);
    },
    key(k) { if (st !== 'play') { if (k === 'a') begin(); return; } if (k === 'left') tpx = clamp(tpx - 60, 50, W - 50); if (k === 'right') tpx = clamp(tpx + 60, 50, W - 50); if (k === 'a' || k === 'up') launch(); },
    tap(x) { if (st !== 'play') { begin(); return; } tpx = clamp(x, 50, W - 50); launch(); },
    point(x) { if (st === 'play') tpx = clamp(x, 50, W - 50); },
  };
}

// ============================== 小猫跳跳 ==============================
function runner(): Game {
  const GY = 296, CX = 112;
  type O = { x: number; w: number; h: number; kind: 0 | 1 };
  let st: St = 'ready', y = 0, vy = 0, jumps = 0, obs: O[] = [], speed = 260, dist = 0, best = store.get(bestKey('runner')), next = 0, run = 0, scroll = 0, guard = 0;
  const reset = () => { y = 0; vy = 0; jumps = 0; obs = []; speed = 260; dist = 0; next = 400; };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  const jump = () => {
    if (st !== 'play') { begin(); return; }
    if (jumps < 2) { vy = jumps ? 620 : 720; jumps++; beep(jumps === 1 ? 500 : 700, jumps === 1 ? 900 : 1200, 0.1, 'square', 0.04); }
  };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt); run += dt * (st === 'play' ? speed / 22 : 4);
      if (st !== 'play') return;
      speed += dt * 9; dist += speed * dt / 40; scroll += speed * dt;
      vy -= 2300 * dt; y += vy * dt; if (y <= 0) { y = 0; vy = 0; jumps = 0; }
      next -= speed * dt;
      if (next <= 0) { const kind: O['kind'] = Math.random() < 0.35 ? 1 : 0; obs.push({ x: W + 30, w: kind ? 22 : 40, h: kind ? 62 : 30, kind }); next = rand(260, 520) * (speed / 300); }
      for (const o of obs) o.x -= speed * dt;
      obs = obs.filter((o) => o.x > -60);
      for (const o of obs) {
        if (CX + 22 > o.x + 5 && CX - 18 < o.x + o.w - 5 && GY - y > GY - o.h + 6) {
          st = 'over'; guard = 0.8; boom(); const m = Math.floor(dist); if (m > best) { best = m; store.set(bestKey('runner'), best); }
        }
      }
    },
    draw(g, t) {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#ffe9c7'); bg.addColorStop(1, '#ffd2a1'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 4; i++) { const x = ((i * 230 - scroll * 0.2) % (W + 200) + W + 200) % (W + 200) - 100; g.beginPath(); g.ellipse(x, 60 + i * 17, 40, 14, 0, 0, 7); g.fill(); }
      g.fillStyle = '#9ccf7a'; for (let i = 0; i < 5; i++) { const x = ((i * 190 - scroll * 0.45) % (W + 200) + W + 200) % (W + 200) - 100; g.beginPath(); g.ellipse(x, GY + 8, 120, 60, 0, Math.PI, 0); g.fill(); }
      g.fillStyle = '#8a5a34'; g.fillRect(0, GY, W, H - GY); g.fillStyle = '#6fae4a'; g.fillRect(0, GY, W, 8);
      g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 12; i++) { const x = ((i * 70 - scroll) % W + W) % W; g.fillRect(x, GY + 20, 26, 4); }
      for (const o of obs) {
        if (o.kind === 0) { // 白菜
          g.fillStyle = '#d6e9a8'; g.beginPath(); g.ellipse(o.x + o.w / 2, GY - 14, o.w / 2, 16, 0, 0, 7); g.fill();
          g.fillStyle = '#6aa84f'; for (const dx of [-12, 0, 12]) { g.beginPath(); g.ellipse(o.x + o.w / 2 + dx, GY - 22, 9, 12, dx * 0.04, 0, 7); g.fill(); }
        } else { // 一把葱
          for (let i = 0; i < 4; i++) { g.fillStyle = '#4f9a3a'; g.fillRect(o.x + i * 5, GY - o.h, 4, o.h - 16); g.fillStyle = '#f4f4e6'; g.fillRect(o.x + i * 5, GY - 16, 4, 16); }
          g.fillStyle = '#c0392b'; g.fillRect(o.x - 1, GY - 20, o.w, 4);
        }
      }
      // 橘猫
      const cy = GY - y, ph = Math.sin(run), air = y > 0;
      g.save(); g.translate(CX, cy);
      g.strokeStyle = '#e8892e'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-20, -22); g.quadraticCurveTo(-38, -30 - ph * 6, -32, -46); g.stroke();
      g.fillStyle = '#f39a3d';
      for (const [lx, s] of [[-12, 1], [12, -1]] as const) { const sw = air ? 0.5 : ph * s * 0.6; g.save(); g.translate(lx, -12); g.rotate(sw); g.fillRect(-3, 0, 6, 13); g.restore(); }
      g.beginPath(); g.ellipse(0, -22, 24, 13, 0, 0, 7); g.fill();
      g.fillStyle = '#e07a26'; for (const sx2 of [-8, 0, 8]) g.fillRect(sx2 - 2, -33, 3, 8);
      g.fillStyle = '#f39a3d'; g.beginPath(); g.arc(22, -34, 13, 0, 7); g.fill();
      g.beginPath(); g.moveTo(13, -42); g.lineTo(15, -55); g.lineTo(22, -45); g.fill(); g.beginPath(); g.moveTo(24, -45); g.lineTo(31, -55); g.lineTo(33, -41); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(27, -36, 2.2, 0, 7); g.fill(); g.fillStyle = '#f08aa0'; g.beginPath(); g.arc(34, -32, 2, 0, 7); g.fill();
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(CX, GY + 3, 24 - Math.min(14, y / 8), 4, 0, 0, 7); g.fill();
      hud(g, `${Math.floor(dist)} 米`, `最好 ${best} 米`, '#7a3d12');
      if (st === 'ready') intro(g, t, '小猫跳跳', ['点一下（A / 上）跳，空中还能再跳一次', '跳过白菜和一把把的葱', '越跑越快，看能跑多远'], '#e07a26');
      if (st === 'over') panel(g, [['小猫绊倒啦', 22], [`${Math.floor(dist)} 米`, 26, '#e07a26'], [`最好 ${best} 米`, 16, '#6b7280']], t);
    },
    key(k) { if (k === 'a' || k === 'up') jump(); },
    tap() { jump(); },
  };
}

// ============================== 反应力 ==============================
function reaction(): Game {
  type P = 'ready' | 'wait' | 'go' | 'shown' | 'early' | 'over';
  let ph: P = 'ready', clock = 0, at = 0, times: number[] = [], last = 0, best = store.get(bestKey('reaction')), guard = 0;
  const startRound = () => { ph = 'wait'; at = clock + rand(1.2, 3.4); };
  const press = () => {
    if (guard > 0) return;
    if (ph === 'ready' || ph === 'over') { times = []; startRound(); return; }
    if (ph === 'wait') { ph = 'early'; at = clock + 1.2; beep(200, 120, 0.25, 'sawtooth', 0.06); return; }
    if (ph === 'go') {
      last = Math.round((clock - at) * 1000); times.push(last); ph = 'shown'; at = clock + 1.1; beep(1000, 1500, 0.08, 'triangle', 0.06);
      if (times.length >= 5) {
        const avg = Math.round(times.reduce((a, x) => a + x, 0) / times.length);
        if (!best || avg < best) { best = avg; store.set(bestKey('reaction'), best); }
        ph = 'over'; guard = 0.9;
      }
    }
  };
  const rate = (ms: number) => (ms < 220 ? '闪电手！' : ms < 280 ? '反应很快' : ms < 350 ? '还不错' : '再练练');
  return {
    update(dt) {
      clock += dt; guard = Math.max(0, guard - dt);
      if (ph === 'wait' && clock >= at) { ph = 'go'; at = clock; beep(880, 880, 0.05, 'square', 0.04); }
      if ((ph === 'shown' || ph === 'early') && clock >= at) startRound();
    },
    draw(g, t) {
      const col = ph === 'wait' ? '#d64545' : ph === 'go' ? '#2fbf5b' : ph === 'early' ? '#f39c12' : '#3b6fd8';
      g.fillStyle = col; g.fillRect(0, 0, W, H);
      if (ph === 'wait') { text(g, '等它变绿……', W / 2, H / 2 - 10, 40, '#fff', 'center', 800); text(g, '变绿了马上点', W / 2, H / 2 + 36, 17, 'rgba(255,255,255,.85)'); }
      if (ph === 'go') text(g, '点！', W / 2, H / 2, 72, '#fff', 'center', 900);
      if (ph === 'early') { text(g, '太早了！', W / 2, H / 2 - 10, 44, '#fff', 'center', 800); text(g, '这一轮重来', W / 2, H / 2 + 36, 17, 'rgba(255,255,255,.85)'); }
      if (ph === 'shown') { text(g, `${last} 毫秒`, W / 2, H / 2 - 10, 50, '#fff', 'center', 800); text(g, rate(last), W / 2, H / 2 + 38, 18, 'rgba(255,255,255,.9)'); }
      for (let i = 0; i < 5; i++) { g.fillStyle = i < times.length ? '#fff' : 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(W / 2 - 48 + i * 24, H - 34, 7, 0, 7); g.fill(); }
      hud(g, `第 ${Math.min(5, times.length + 1)} / 5 轮`, best ? `最好平均 ${best} 毫秒` : '');
      if (ph === 'ready') intro(g, t, '反应力', ['屏幕从红变绿的一瞬间点一下（或按 A）', '变绿之前点了算抢跑', '五轮，算平均毫秒数'], '#3b6fd8');
      if (ph === 'over') { const avg = Math.round(times.reduce((a, x) => a + x, 0) / times.length); panel(g, [[`平均 ${avg} 毫秒`, 24, '#3b6fd8'], [rate(avg), 20], [`最好 ${best} 毫秒`, 16, '#6b7280']], t); }
    },
    key(k) { if (k === 'a') press(); },
    tap() { press(); },
  };
}

// ============================== 翻牌配对 ==============================
function memory(): Game {
  const SYM = ['🍎', '🥬', '🍅', '🐔', '🐱', '🐶'], CW = 92, CH = 80, GX = 14, GY = 12, X0 = (W - (4 * CW + 3 * GX)) / 2, Y0 = 62;
  type C = { s: string; open: boolean; done: boolean; f: number };
  let st: St = 'ready', cards: C[] = [], sel = 0, first = -1, second = -1, lock = 0, moves = 0, time = 0, best = store.get(bestKey('memory')), guard = 0;
  const reset = () => {
    const deck = [...SYM, ...SYM]; for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
    cards = deck.map((s) => ({ s, open: false, done: false, f: 0 })); first = second = -1; lock = 0; moves = 0; time = 0; sel = 0;
  };
  reset();
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  const flip = (i: number) => {
    const c = cards[i]; if (lock > 0 || c.open || c.done) return;
    c.open = true; beep(600, 800, 0.05, 'triangle', 0.04);
    if (first < 0) { first = i; return; }
    second = i; moves++;
    if (cards[first].s === c.s) {
      cards[first].done = c.done = true; first = second = -1; beep(880, 1320, 0.15, 'triangle', 0.06);
      if (cards.every((x) => x.done)) { st = 'over'; guard = 0.9; if (!best || moves < best) { best = moves; store.set(bestKey('memory'), best); } }
    } else lock = 0.85;
  };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt);
      for (const c of cards) c.f += ((c.open || c.done ? 1 : 0) - c.f) * Math.min(1, dt * 12);
      if (st !== 'play') return;
      time += dt;
      if (lock > 0) { lock -= dt; if (lock <= 0) { cards[first].open = cards[second].open = false; first = second = -1; beep(300, 250, 0.06, 'triangle', 0.04); } }
    },
    draw(g, t) {
      const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#ffd6e0'); bg.addColorStop(1, '#d7e3ff'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      cards.forEach((c, i) => {
        const x = X0 + (i % 4) * (CW + GX), y = Y0 + ((i / 4) | 0) * (CH + GY), sx = Math.abs(Math.cos(c.f * Math.PI)), face = c.f > 0.5;
        g.save(); g.translate(x + CW / 2, y + CH / 2); g.scale(Math.max(0.04, sx), 1);
        g.fillStyle = 'rgba(0,0,0,.12)'; rr(g, -CW / 2 + 2, -CH / 2 + 4, CW, CH, 12); g.fill();
        if (face) { g.fillStyle = c.done ? '#eafbe7' : '#fff'; rr(g, -CW / 2, -CH / 2, CW, CH, 12); g.fill(); text(g, c.s, 0, 2, 40); }
        else { const cg = g.createLinearGradient(-CW / 2, -CH / 2, CW / 2, CH / 2); cg.addColorStop(0, '#7a5cff'); cg.addColorStop(1, '#ff6fa8'); g.fillStyle = cg; rr(g, -CW / 2, -CH / 2, CW, CH, 12); g.fill(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; rr(g, -CW / 2 + 7, -CH / 2 + 7, CW - 14, CH - 14, 8); g.stroke(); text(g, '?', 0, 2, 30, 'rgba(255,255,255,.85)', 'center', 800); }
        g.restore();
        if (st === 'play' && i === sel) { g.strokeStyle = '#2fd5ff'; g.lineWidth = 3; rr(g, x - 4, y - 4, CW + 8, CH + 8, 14); g.stroke(); }
      });
      hud(g, `翻了 ${moves} 次 · ${Math.floor(time)} 秒`, best ? `最少 ${best} 次` : '', '#3a3a5a');
      if (st === 'ready') intro(g, t, '翻牌配对', ['一次翻两张，一样的就留着', '点牌翻开（或方向键选、按 A 翻）', '用最少的次数翻完六对'], '#7a5cff');
      if (st === 'over') panel(g, [['全配上啦！', 22], [`${moves} 次 · ${Math.floor(time)} 秒`, 24, '#7a5cff'], [`最少 ${best} 次`, 16, '#6b7280']], t);
    },
    key(k) {
      if (st !== 'play') { if (k === 'a') begin(); return; }
      if (k === 'left' && sel % 4) sel--; else if (k === 'right' && sel % 4 < 3) sel++; else if (k === 'up' && sel > 3) sel -= 4; else if (k === 'down' && sel < 8) sel += 4; else if (k === 'a') flip(sel);
    },
    tap(x, y) {
      if (st !== 'play') { begin(); return; }
      const c = Math.floor((x - X0) / (CW + GX)), r = Math.floor((y - Y0) / (CH + GY));
      if (c >= 0 && c < 4 && r >= 0 && r < 3 && (x - X0) - c * (CW + GX) < CW && (y - Y0) - r * (CH + GY) < CH) { sel = r * 4 + c; flip(sel); }
    },
  };
}

// ============================== 数字合并 ==============================
function merge(): Game {
  const N = 4, CS = 64, GP = 8, BS = N * CS + (N + 1) * GP, BX = (W - BS) / 2, BY = 44;
  let st: St = 'ready', grid: number[][] = [], pop: number[][] = [], score = 0, best = store.get(bestKey('merge')), guard = 0, won = false;
  const empty = () => { const e: [number, number][] = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) e.push([r, c]); return e; };
  const add = () => { const e = empty(); if (!e.length) return; const [r, c] = e[(Math.random() * e.length) | 0]; grid[r][c] = Math.random() < 0.9 ? 2 : 4; pop[r][c] = 0.01; };
  const reset = () => { grid = Array.from({ length: N }, () => Array(N).fill(0)); pop = Array.from({ length: N }, () => Array(N).fill(1)); score = 0; won = false; add(); add(); };
  reset();
  const canMove = () => { if (empty().length) return true; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (c + 1 < N && grid[r][c] === grid[r][c + 1]) return true; if (r + 1 < N && grid[r][c] === grid[r + 1][c]) return true; } return false; };
  const move = (dr: number, dc: number) => {
    let moved = false, gained = 0;
    for (let i = 0; i < N; i++) {
      // 取出这一行 / 列（按移动方向排好），合并后放回去
      const cells: [number, number][] = [];
      for (let j = 0; j < N; j++) { const k = (dr > 0 || dc > 0) ? N - 1 - j : j; cells.push(dr ? [k, i] : [i, k]); }
      const vals = cells.map(([r, c]) => grid[r][c]).filter((v) => v);
      const out: number[] = [], merged: boolean[] = [];
      for (const v of vals) { if (out.length && out[out.length - 1] === v && !merged[out.length - 1]) { out[out.length - 1] = v * 2; merged[out.length - 1] = true; gained += v * 2; } else { out.push(v); merged.push(false); } }
      cells.forEach(([r, c], j) => { const nv = out[j] ?? 0; if (grid[r][c] !== nv) moved = true; grid[r][c] = nv; if (merged[j]) pop[r][c] = 0.3; });
    }
    if (!moved) { beep(160, 130, 0.05, 'triangle', 0.03); return; }
    score += gained; add();
    if (gained) beep(500 + Math.min(900, Math.log2(gained) * 60), 900 + Math.log2(gained) * 60, 0.08, 'triangle', 0.05); else beep(420, 380, 0.04, 'triangle', 0.03);
    if (!won && grid.some((row) => row.some((v) => v >= 2048))) { won = true; beep(660, 1320, 0.4, 'triangle', 0.07); }
    if (score > best) { best = score; store.set(bestKey('merge'), best); }
    if (!canMove()) { st = 'over'; guard = 0.9; boom(); }
  };
  const COL: Record<number, string> = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  return {
    update(dt) { guard = Math.max(0, guard - dt); for (const row of pop) for (let c = 0; c < N; c++) row[c] = Math.min(1, row[c] + dt * 6); },
    draw(g, t) {
      g.fillStyle = '#faf8ef'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#bbada0'; rr(g, BX, BY, BS, BS, 10); g.fill();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const x = BX + GP + c * (CS + GP), y = BY + GP + r * (CS + GP), v = grid[r][c];
        g.fillStyle = 'rgba(238,228,218,.35)'; rr(g, x, y, CS, CS, 6); g.fill();
        if (!v) continue;
        const p = pop[r][c], s = p < 1 ? (p < 0.5 ? 0.6 + p * 0.9 : 1.05 - (p - 0.5) * 0.1) : 1;
        g.save(); g.translate(x + CS / 2, y + CS / 2); g.scale(s, s);
        g.fillStyle = COL[v] ?? '#3c3a32'; rr(g, -CS / 2, -CS / 2, CS, CS, 6); g.fill();
        text(g, String(v), 0, 1, v < 100 ? 28 : v < 1000 ? 24 : 19, v <= 4 ? '#776e65' : '#fff', 'center', 800);
        g.restore();
      }
      text(g, '得分', 70, 120, 15, '#8f7a66'); text(g, String(score), 70, 150, 26, '#776e65', 'center', 800);
      text(g, '最好', W - 70, 120, 15, '#8f7a66'); text(g, String(best), W - 70, 150, 26, '#776e65', 'center', 800);
      if (won) text(g, '合出 2048 了！', 70, 220, 14, '#f65e3b', 'center', 700);
      if (st === 'ready') intro(g, t, '数字合并', ['方向键（或在屏幕上滑）把数字往一边推', '相同的数字撞在一起合成两倍', '格子满了推不动就结束'], '#f67c5f');
      if (st === 'over') panel(g, [['推不动了', 22], [`得分 ${score}`, 26, '#f67c5f'], [`最好 ${best}`, 16, '#6b7280']], t);
    },
    key(k) {
      if (st !== 'play') { if (k === 'a') begin(); return; }
      if (k === 'left') move(0, -1); else if (k === 'right') move(0, 1); else if (k === 'up') move(-1, 0); else if (k === 'down') move(1, 0);
    },
    tap() { if (st !== 'play') begin(); },
    swipe(dx, dy) { if (st !== 'play') { begin(); return; } if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1); else move(dy > 0 ? 1 : -1, 0); },
  };
}

// ============================== 叠叠高 ==============================
function stack(): Game {
  const BH = 22, BASEW = 220;
  type Bk = { x: number; w: number };
  type Fall = { x: number; w: number; y: number; vy: number; lv: number };
  let st: St = 'ready', tower: Bk[] = [], cur: Bk = { x: 0, w: BASEW }, dir = 1, speed = 180, cam = 0, falls: Fall[] = [], combo = 0, best = store.get(bestKey('stack')), guard = 0, pops: Pop[] = [];
  const reset = () => { tower = [{ x: W / 2 - BASEW / 2, w: BASEW }]; cur = { x: 0, w: BASEW }; dir = 1; speed = 180; cam = 0; falls = []; combo = 0; pops = []; };
  reset();
  const topY = (lv: number) => 300 - lv * BH + cam;
  const hue = (lv: number) => (lv * 11 + 190) % 360;
  const drop = () => {
    if (st !== 'play') { if (guard > 0) return; reset(); st = 'play'; return; }
    const prev = tower[tower.length - 1], lv = tower.length;
    const l = Math.max(cur.x, prev.x), r = Math.min(cur.x + cur.w, prev.x + prev.w);
    if (r - l <= 0) { falls.push({ ...cur, y: topY(lv), vy: 0, lv }); st = 'over'; guard = 0.9; boom(); const sc = tower.length - 1; if (sc > best) { best = sc; store.set(bestKey('stack'), best); } return; }
    if (Math.abs(cur.x - prev.x) < 5) { cur.x = prev.x; combo++; pops.push({ x: W / 2, y: topY(lv) - 30, s: combo > 1 ? `完美 ×${combo}` : '完美', c: '#fff', life: 0.8 }); beep(660 + combo * 80, 1320 + combo * 80, 0.12, 'triangle', 0.06); if (combo >= 3) cur.w = Math.min(BASEW, cur.w + 10); }
    else {
      combo = 0;
      if (cur.x < l) falls.push({ x: cur.x, w: l - cur.x, y: topY(lv), vy: 0, lv }); if (cur.x + cur.w > r) falls.push({ x: r, w: cur.x + cur.w - r, y: topY(lv), vy: 0, lv });
      cur = { x: l, w: r - l }; beep(400, 300, 0.07, 'square', 0.04);
    }
    tower.push({ ...cur });
    speed = Math.min(420, speed + 9);
    dir = Math.random() < 0.5 ? 1 : -1; cur = { x: dir > 0 ? -cur.w : W, w: cur.w };
  };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt); pops = agePops(pops, dt);
      for (const f of falls) { f.vy += 1400 * dt; f.y += f.vy * dt; }
      falls = falls.filter((f) => f.y < H + 60);
      cam += (Math.max(0, (tower.length - 6) * BH) - cam) * Math.min(1, dt * 5);
      if (st !== 'play') return;
      cur.x += dir * speed * dt;
      if (cur.x > W - cur.w + 40 && dir > 0) dir = -1; if (cur.x < -40 && dir < 0) dir = 1;
    },
    draw(g, t) {
      const lv = tower.length, bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `hsl(${hue(lv) + 20},60%,82%)`); bg.addColorStop(1, `hsl(${hue(lv)},55%,62%)`); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const slab = (x: number, y: number, w: number, l: number) => {
        g.fillStyle = `hsl(${hue(l)},65%,58%)`; g.fillRect(x, y, w, BH);
        g.fillStyle = `hsl(${hue(l)},70%,72%)`; g.fillRect(x, y, w, 6);
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + BH - 4, w, 4);
      };
      tower.forEach((b, i) => { const y = topY(i); if (y < H + 30) slab(b.x, y, b.w, i); });
      if (st === 'play') slab(cur.x, topY(lv), cur.w, lv);
      for (const f of falls) slab(f.x, f.y, f.w, f.lv);
      drawPops(g, pops);
      hud(g, `${tower.length - 1} 层`, `最好 ${best} 层`, '#fff');
      if (st === 'ready') intro(g, t, '叠叠高', ['方块左右来回滑，点一下（或按 A）落下', '伸出去的部分会被切掉，方块越来越窄', '对得准不切，连着对准还会变宽'], '#3a8fd8');
      if (st === 'over') panel(g, [['塔歪啦', 22], [`${tower.length - 1} 层`, 26, '#3a8fd8'], [`最好 ${best} 层`, 16, '#6b7280']], t);
    },
    key(k) { if (k === 'a' || k === 'down') drop(); },
    tap() { drop(); },
  };
}

// ============================== 乒乓 ==============================
function pong(): Game {
  const PH = 64, PX = 24, AX = W - 24 - 10, WIN = 5;
  let st: St = 'ready', py = H / 2, tpy = H / 2, ay = H / 2, ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 }, me = 0, ai = 0, serve = 0, wins = store.get(bestKey('pong')), guard = 0, rally = 0;
  const kick = (dirX: number) => { const a = rand(-0.5, 0.5); ball = { x: W / 2, y: H / 2, vx: Math.cos(a) * 300 * dirX, vy: Math.sin(a) * 300 }; rally = 0; };
  const reset = () => { me = ai = 0; py = tpy = ay = H / 2; serve = 0.8; kick(Math.random() < 0.5 ? 1 : -1); };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt);
      py += (tpy - py) * Math.min(1, dt * 16);
      if (st !== 'play') return;
      if (serve > 0) { serve -= dt; return; }
      const aiSpeed = 210 + me * 25;
      const target = ball.vx > 0 ? ball.y : H / 2; ay += clamp(target - ay, -aiSpeed * dt, aiSpeed * dt);
      for (let n = 0; n < 3; n++) {
        const h = dt / 3; ball.x += ball.vx * h; ball.y += ball.vy * h;
        if (ball.y < 48) { ball.y = 48; ball.vy = Math.abs(ball.vy); } if (ball.y > H - 8) { ball.y = H - 8; ball.vy = -Math.abs(ball.vy); }
        const hit = (padY: number, side: number) => { const off = (ball.y - padY) / (PH / 2), sp = Math.min(720, Math.hypot(ball.vx, ball.vy) * 1.06), a = off * 0.9; ball.vx = Math.cos(a) * sp * side; ball.vy = Math.sin(a) * sp; rally++; beep(side > 0 ? 520 : 440, side > 0 ? 520 : 440, 0.05, 'square', 0.05); };
        if (ball.vx < 0 && ball.x < PX + 18 && ball.x > PX && Math.abs(ball.y - py) < PH / 2 + 6) hit(py, 1);
        if (ball.vx > 0 && ball.x > AX - 8 && ball.x < AX + 10 && Math.abs(ball.y - ay) < PH / 2 + 6) hit(ay, -1);
      }
      if (ball.x < -20 || ball.x > W + 20) {
        const mine = ball.x > W; if (mine) { me++; beep(880, 1320, 0.15, 'triangle', 0.06); } else { ai++; beep(300, 180, 0.2, 'sawtooth', 0.05); }
        if (me >= WIN || ai >= WIN) { st = 'over'; guard = 0.9; if (me >= WIN) { wins++; store.set(bestKey('pong'), wins); } }
        else { serve = 0.8; kick(mine ? -1 : 1); }
      }
    },
    draw(g, t) {
      g.fillStyle = '#1f6f4a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.strokeRect(6, 40, W - 12, H - 46);
      g.setLineDash([10, 10]); g.beginPath(); g.moveTo(W / 2, 40); g.lineTo(W / 2, H - 6); g.stroke(); g.setLineDash([]);
      text(g, String(me), W / 2 - 60, 80, 40, 'rgba(255,255,255,.35)', 'center', 800); text(g, String(ai), W / 2 + 60, 80, 40, 'rgba(255,255,255,.35)', 'center', 800);
      g.fillStyle = '#ff6a5a'; rr(g, PX, py - PH / 2, 10, PH, 5); g.fill();
      g.fillStyle = '#5aa8ff'; rr(g, AX, ay - PH / 2, 10, PH, 5); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ball.x, ball.y, 7, 0, 7); g.fill();
      hud(g, `你 ${me} : ${ai} 电脑`, `一共赢了 ${wins} 局`);
      if (st === 'play' && rally >= 6) text(g, `连续 ${rally} 拍`, W / 2, H - 24, 14, 'rgba(255,255,255,.7)');
      if (st === 'ready') intro(g, t, '乒乓', ['拖动（或上下键）挪左边的红球拍', '球打在拍子边上会斜着飞', '先得 5 分的赢'], '#1f6f4a');
      if (st === 'over') panel(g, [[me >= WIN ? '你赢了！' : '电脑赢了', 24, me >= WIN ? '#e8463c' : '#3a6fd8'], [`${me} : ${ai}`, 26], [`一共赢了 ${wins} 局`, 16, '#6b7280']], t);
    },
    key(k) { if (st !== 'play') { if (k === 'a') begin(); return; } if (k === 'up') tpy = clamp(tpy - 50, 40 + PH / 2, H - PH / 2); if (k === 'down') tpy = clamp(tpy + 50, 40 + PH / 2, H - PH / 2); },
    tap(_x, y) { if (st !== 'play') { begin(); return; } tpy = clamp(y, 40 + PH / 2, H - PH / 2); },
    point(_x, y) { if (st === 'play') tpy = clamp(y, 40 + PH / 2, H - PH / 2); },
  };
}

// ============================== 节奏黑块 ==============================
function tiles(): Game {
  const CW = W / 4, RH = 90;
  type Row = { col: number; done: boolean };
  // 一段五声音阶的小曲子（点一块响一个音）
  const MEL = [523, 587, 659, 784, 659, 587, 523, 440, 523, 587, 659, 659, 587, 523, 587, 392, 440, 523, 587, 659, 784, 880, 784, 659, 587, 523, 440, 523];
  let st: St = 'ready', rows: Row[] = [], off = 0, speed = 0, score = 0, best = store.get(bestKey('tiles')), guard = 0, bad: { r: number; c: number } | null = null, flashT = 0;
  const reset = () => { rows = Array.from({ length: 8 }, () => ({ col: (Math.random() * 4) | 0, done: false })); off = 0; speed = 0; score = 0; bad = null; };
  reset();
  // 第 i 行（0 在最下面）的顶边
  const rowY = (i: number) => H - (i + 1) * RH + off;
  const end = (r: number, c: number) => { st = 'over'; guard = 0.9; bad = { r, c }; flashT = 0; boom(); if (score > best) { best = score; store.set(bestKey('tiles'), best); } };
  const hit = (c: number) => {
    if (st === 'over') { if (guard <= 0) { reset(); st = 'ready'; } return; }
    const i = rows.findIndex((r) => !r.done); if (i < 0) return;
    if (rows[i].col !== c) { end(i, c); return; }
    rows[i].done = true; score++;
    const f = MEL[(score - 1) % MEL.length]; beep(f, f, 0.32, 'triangle', 0.09); beep(f * 2, f * 2, 0.18, 'sine', 0.03);
    if (st === 'ready') { st = 'play'; speed = 230; }
  };
  return {
    update(dt) {
      guard = Math.max(0, guard - dt); flashT += dt;
      if (st !== 'play') return;
      speed += dt * 7; off += speed * dt;
      // 最下面还没点的那块整块出了屏幕 → 漏了，结束；点过的行滑出去就换一行新的接在最上面
      const i = rows.findIndex((r) => !r.done);
      if (i >= 0 && rowY(i) >= H) { off = Math.min(off, H - rowY(i) + off - 2); end(i, rows[i].col); return; }
      while (off >= RH && rows[0].done) { off -= RH; rows.shift(); rows.push({ col: (Math.random() * 4) | 0, done: false }); }
    },
    draw(g, t) {
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      rows.forEach((r, i) => {
        const y = rowY(i); if (y > H || y + RH < 0) return;
        for (let c = 0; c < 4; c++) {
          const x = c * CW;
          if (bad && bad.r === i && bad.c === c && Math.sin(flashT * 18) > 0) { g.fillStyle = '#ff4d4d'; g.fillRect(x + 1, y + 1, CW - 2, RH - 2); continue; }
          if (c === r.col) { g.fillStyle = r.done ? '#d9dde5' : '#1d2433'; g.fillRect(x + 1, y + 1, CW - 2, RH - 2); }
        }
        if (st === 'ready' && i === 0) text(g, '开始', r.col * CW + CW / 2, y + RH / 2, 22, '#fff', 'center', 800);
      });
      g.strokeStyle = '#e3e6ec'; g.lineWidth = 1; for (let c = 1; c < 4; c++) { g.beginPath(); g.moveTo(c * CW, 0); g.lineTo(c * CW, H); g.stroke(); }
      ['←', '↓', '↑', '→'].forEach((s, c) => text(g, s, c * CW + CW / 2, H - 12, 12, 'rgba(120,130,150,.6)', 'center', 600));
      hud(g, `${score}`, `最好 ${best}`, '#ff4d6a');
      if (st === 'ready') { g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); text(g, '只点黑块：点最下面那块（← ↓ ↑ → 对应四列）', W / 2, 46, 15, '#5a6274', 'center', 600); g.globalAlpha = 1; }
      if (st === 'over') panel(g, [['点错啦', 22], [`${score} 块`, 26, '#1d2433'], [`最好 ${best} 块`, 16, '#6b7280']], t);
    },
    key(k) { const c = k === 'left' ? 0 : k === 'down' ? 1 : k === 'up' ? 2 : k === 'right' ? 3 : -1; if (c >= 0) hit(c); else if (k === 'a' && st === 'over') hit(0); },
    tap(x) { hit(clamp(Math.floor(x / CW), 0, 3)); },
  };
}

// ============================== 菜单图标（按 100 宽左右画，主页上会缩小）==============================
export function drawMiniIcon(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, t: number) {
  switch (id) {
    case 'mole': {
      g.fillStyle = '#3b2414'; g.beginPath(); g.ellipse(cx, cy + 24, 50, 14, 0, 0, 7); g.fill();
      const up = 6 + Math.abs(Math.sin(t * 2.5)) * 10;
      g.save(); g.beginPath(); g.rect(cx - 60, cy - 60, 120, 84); g.clip();
      g.fillStyle = '#8a5a3a'; g.beginPath(); g.ellipse(cx, cy + 30 - up, 30, 36, 0, 0, 7); g.fill();
      g.fillStyle = '#1a1a1a'; for (const ex of [-10, 10]) { g.beginPath(); g.arc(cx + ex, cy + 6 - up, 4, 0, 7); g.fill(); }
      g.fillStyle = '#e86a7a'; g.beginPath(); g.ellipse(cx, cy + 16 - up, 5, 4, 0, 0, 7); g.fill(); g.restore();
      g.save(); g.translate(cx + 40, cy - 30); g.rotate(-0.5 + Math.sin(t * 5) * 0.3); g.fillStyle = '#a8743f'; g.fillRect(-4, -4, 8, 44); g.fillStyle = '#d24a3a'; rr(g, -20, -20, 40, 22, 5); g.fill(); g.restore();
      break;
    }
    case 'catch': {
      for (const [dx, c, ph] of [[-30, '#e8463c', 0], [10, '#f59a2a', 1.5], [38, '#c9d84a', 3]] as const) { const y = cy - 30 + ((t * 30 + ph * 20) % 40); g.fillStyle = c; g.beginPath(); g.arc(cx + dx, y, 11, 0, 7); g.fill(); }
      g.fillStyle = '#c48a3c'; g.beginPath(); g.moveTo(cx - 44, cy + 14); g.lineTo(cx + 44, cy + 14); g.lineTo(cx + 34, cy + 42); g.lineTo(cx - 34, cy + 42); g.closePath(); g.fill();
      g.fillStyle = '#a06a2a'; rr(g, cx - 48, cy + 10, 96, 8, 4); g.fill();
      break;
    }
    case 'bricks': {
      const cs = ['#ef5350', '#ffa726', '#66bb6a', '#42a5f5'];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { if ((r + c + Math.floor(t)) % 7 === 0) continue; g.fillStyle = cs[(r + c) % 4]; rr(g, cx - 60 + c * 24, cy - 40 + r * 13, 22, 10, 2); g.fill(); }
      const bx = cx + Math.sin(t * 2) * 40, by = cy + 10 + Math.abs(Math.cos(t * 3)) * -14;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); g.fillStyle = '#e0e6ff'; rr(g, cx - 30 + Math.sin(t * 2) * 30, cy + 30, 60, 9, 4); g.fill();
      break;
    }
    case 'runner': {
      g.fillStyle = '#8a5a34'; g.fillRect(cx - 70, cy + 30, 140, 20); g.fillStyle = '#6fae4a'; g.fillRect(cx - 70, cy + 30, 140, 5);
      g.fillStyle = '#d6e9a8'; g.beginPath(); g.ellipse(cx + 34, cy + 20, 16, 12, 0, 0, 7); g.fill();
      const jy = Math.abs(Math.sin(t * 3)) * 26;
      g.save(); g.translate(cx - 18, cy + 30 - jy); g.fillStyle = '#f39a3d'; g.beginPath(); g.ellipse(0, -20, 20, 11, 0, 0, 7); g.fill(); g.beginPath(); g.arc(18, -30, 11, 0, 7); g.fill();
      g.beginPath(); g.moveTo(10, -36); g.lineTo(12, -47); g.lineTo(18, -39); g.fill(); g.beginPath(); g.moveTo(20, -39); g.lineTo(26, -47); g.lineTo(28, -35); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(22, -31, 2, 0, 7); g.fill(); g.restore();
      break;
    }
    case 'reaction': {
      const on = Math.sin(t * 2) > 0; g.fillStyle = on ? '#2fbf5b' : '#d64545'; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 24, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(t * 4) * 18, cy - Math.cos(t * 4) * 18); g.stroke();
      text(g, on ? '点！' : '等', cx, cy + 50, 16, '#fff', 'center', 800);
      break;
    }
    case 'memory': {
      const sy = ['🍎', '🐱'];
      for (let i = 0; i < 3; i++) { const x = cx - 50 + i * 36, f = i === 1 ? Math.abs(Math.cos(t * 1.5)) : 1; g.save(); g.translate(x + 15, cy); g.scale(Math.max(0.05, f), 1); g.fillStyle = i === 1 && Math.cos(t * 1.5) < 0 ? '#fff' : '#7a5cff'; rr(g, -15, -22, 30, 44, 6); g.fill(); if (i === 1 && Math.cos(t * 1.5) < 0) text(g, sy[0], 0, 1, 18); g.restore(); }
      text(g, sy[1], cx + 52, cy - 26, 18);
      break;
    }
    case 'merge': {
      const v = [[2, 4], [8, 16]], cl = ['#eee4da', '#ede0c8', '#f2b179', '#f59563'];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.fillStyle = cl[r * 2 + c]; rr(g, cx - 42 + c * 44, cy - 42 + r * 44, 40, 40, 5); g.fill(); text(g, String(v[r][c]), cx - 22 + c * 44, cy - 21 + r * 44, 18, r ? '#fff' : '#776e65', 'center', 800); }
      break;
    }
    case 'stack': {
      for (let i = 0; i < 5; i++) { const w = 90 - i * 10, x = cx - w / 2 + (i === 4 ? Math.sin(t * 2.5) * 22 : (i % 2 ? 3 : -3)); g.fillStyle = `hsl(${(i * 30 + 190) % 360},65%,60%)`; g.fillRect(x, cy + 30 - i * 15, w, 13); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x, cy + 30 - i * 15, w, 4); }
      break;
    }
    case 'pong': {
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([5, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - 40); g.lineTo(cx, cy + 40); g.stroke(); g.setLineDash([]);
      const by = cy + Math.sin(t * 3) * 25, bx = cx + Math.sin(t * 2) * 50;
      g.fillStyle = '#ff6a5a'; rr(g, cx - 66, by - 18, 8, 36, 4); g.fill(); g.fillStyle = '#5aa8ff'; rr(g, cx + 58, cy - Math.sin(t * 3) * 20 - 18, 8, 36, 4); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill();
      break;
    }
    case 'tiles': {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r * 3 + 1) % 4 === c ? '#1d2433' : '#fff'; g.fillRect(cx - 56 + c * 28, cy - 42 + r * 28 + ((t * 20) % 28), 27, 27); }
      text(g, '♪', cx + 46, cy - 40, 22, '#fff', 'center', 800);
      break;
    }
  }
}

export const MINI = [
  { id: 'mole', name: '打地鼠', sub: '地鼠冒头就点它，30 秒看能打几只', color: ['#8bc34a', '#4e7d2b'], make: mole },
  { id: 'catch', name: '接水果', sub: '挪竹篮接水果，别接炸弹', color: ['#ff8a65', '#d84315'], make: catcher },
  { id: 'bricks', name: '打砖块', sub: '挪挡板接球，把砖块全打碎', color: ['#5c6bc0', '#283593'], make: bricks },
  { id: 'runner', name: '小猫跳跳', sub: '点一下跳过白菜和葱，看能跑多远', color: ['#ffb74d', '#ef6c00'], make: runner },
  { id: 'reaction', name: '反应力', sub: '屏幕变绿马上点，测测你的反应', color: ['#4fc3f7', '#0277bd'], make: reaction },
  { id: 'memory', name: '翻牌配对', sub: '一次翻两张，找出六对一样的', color: ['#ba68c8', '#6a1b9a'], make: memory },
  { id: 'merge', name: '数字合并', sub: '推一推，相同的数字合成两倍', color: ['#ffb38a', '#e65f3b'], make: merge },
  { id: 'stack', name: '叠叠高', sub: '点一下落下方块，叠得越高越好', color: ['#4db6ac', '#00695c'], make: stack },
  { id: 'pong', name: '乒乓', sub: '挪球拍和电脑对打，先得 5 分赢', color: ['#66bb6a', '#1b5e20'], make: pong },
  { id: 'tiles', name: '节奏黑块', sub: '只点黑块，一块一个音', color: ['#78909c', '#263238'], make: tiles },
] as const;
