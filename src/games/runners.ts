/**
 * 和「小猫跳跳」一路的五个小游戏（用户要的「小猫的游戏很好玩，类似的游戏，可以再做 5 个；游戏里的素材可以画的再复杂一点」）：
 * 一两个键就能玩、小动物主角、越来越快。画面都是 canvas 现画的，但比早先那几个细：渐变上色、描边、高光、阴影、几层视差背景。
 *
 * - 狗狗快跑：黄狗一直往前跑，点 / A / 上 跳（空中还能再跳一次），下 / 往下划 趴下钻过乌鸦；跳过篱笆和南瓜，捡骨头。
 * - 熊猫爬竹：熊猫抱着竹子往上爬，点左半边 / ← 爬到左边、点右半边 / → 爬到右边；别撞上竹枝，体力条见底就掉下去。
 * - 兔子蹦蹦：兔子踩着云朵自己往上蹦，鼠标 / 手指左右挪（或 ← →）控制落点；蘑菇弹得高，枯枝一踩就断，掉下去结束。
 * - 青蛙过河：点 / A / 上 往前跳一格，← → 横着跳（也可以左右划）；河里只能踩在漂着的木头和荷叶上，被冲出画面也算掉水。
 * - 企鹅滑雪：企鹅顺着雪坡往下滑，鼠标 / 手指左右挪（或 ← →）；从红蓝旗门中间穿过加分，撞上松树、石头、雪人就摔。
 *
 * 和 minigames.ts 一样：640×360 逻辑尺寸，最好成绩记在 localStorage 的 game.<id>.best。
 */
import { W, H, store, rr, text, panel, Fx, sfx, hudPill, vignette, keyChip, type Game, type Key } from './kit';

type St = 'ready' | 'play' | 'over';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const bestKey = (id: string) => `game.${id}.best`;
type G = CanvasRenderingContext2D;
const wrap = (x: number, span: number) => ((x % span) + span) % span;

// ---------------- 共用的小画笔 ----------------
const intro = (g: G, t: number, title: string, how: string[], color: string) => {
  g.fillStyle = 'rgba(10,14,24,.45)'; g.fillRect(0, 0, W, H);
  const h = 74 + how.length * 28, x = W / 2 - 215, y = 58;
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 8; rr(g, x, y, 430, h, 20); g.fillStyle = '#fff'; g.fill(); g.restore();
  g.save(); rr(g, x, y, 430, h, 20); g.clip(); g.fillStyle = color; g.fillRect(x, y, 430, 7); g.globalAlpha = 0.07; g.beginPath(); g.arc(x + 400, y + 10, 70, 0, 7); g.fill(); g.restore();
  text(g, title, W / 2, y + 38, 28, color, 'center', 800);
  how.forEach((s2, i) => { const yy = y + 78 + i * 28; g.fillStyle = color; g.beginPath(); g.arc(x + 40, yy, 3, 0, 7); g.fill(); text(g, s2, x + 52, yy, 15, '#3a4150', 'left', 500); });
  g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); keyChip(g, W / 2, y + h + 32, 'A', '或点一下屏幕 · 开始'); g.globalAlpha = 1;
};
const hud = (g: G, left: string, right: string) => { if (left) hudPill(g, left, 12, 22, 'left'); if (right) hudPill(g, right, W - 12, 22, 'right'); };
type Pop = { x: number; y: number; s: string; c: string; life: number };
const drawPops = (g: G, pops: Pop[]) => { for (const p of pops) { g.globalAlpha = Math.min(1, p.life * 2); text(g, p.s, p.x, p.y - (1 - p.life) * 30, 20, p.c, 'center', 800, 'rgba(0,0,0,.4)'); } g.globalAlpha = 1; };
const agePops = (pops: Pop[], dt: number) => { for (const p of pops) p.life -= dt; return pops.filter((p) => p.life > 0); };
/** 眼睛：白眼球 + 深色瞳孔 + 两个高光 */
const eye = (g: G, x: number, y: number, r: number, lookX = 0, lookY = 0, blink = 0) => {
  if (blink > 0.5) { g.strokeStyle = '#2a1a10'; g.lineWidth = Math.max(1.5, r * 0.4); g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * 0.6, x + r, y); g.stroke(); return; }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = '#1d1410'; g.beginPath(); g.arc(x + lookX * r * 0.35, y + lookY * r * 0.35, r * 0.62, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x + lookX * r * 0.35 + r * 0.22, y + lookY * r * 0.35 - r * 0.25, r * 0.22, 0, 7); g.fill();
  g.beginPath(); g.arc(x + lookX * r * 0.35 - r * 0.18, y + lookY * r * 0.35 + r * 0.2, r * 0.1, 0, 7); g.fill();
};
/** 一朵蓬松的云：几团圆 + 底下一层浅灰阴影 */
const cloud = (g: G, x: number, y: number, s: number, a = 0.95) => {
  g.save(); g.globalAlpha = a;
  const puffs: [number, number, number][] = [[-30, 4, 18], [-12, -6, 22], [10, -10, 25], [30, -2, 19], [44, 6, 14], [0, 8, 20]];
  g.fillStyle = '#dfe8f2'; for (const [dx, dy, r] of puffs) { g.beginPath(); g.arc(x + dx * s, y + (dy + 4) * s, r * s, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; for (const [dx, dy, r] of puffs) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s * 0.95, 0, 7); g.fill(); }
  g.restore();
};
/** 一层起伏的山 / 丘：横向平移 scroll，渐变上色 */
const ridge = (g: G, scroll: number, base: number, amp: number, freq: number, top: string, bottom: string, seed: number) => {
  const gr = g.createLinearGradient(0, base - amp * 2, 0, base + 40); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.beginPath(); g.moveTo(-10, H + 10);
  for (let x = -10; x <= W + 10; x += 8) { const u = (x + scroll) * freq; g.lineTo(x, base - amp * (0.55 + 0.3 * Math.sin(u + seed) + 0.15 * Math.sin(u * 2.7 + seed * 2))); }
  g.lineTo(W + 10, H + 10); g.closePath(); g.fill();
};
/** 一棵圆冠小树（远景） */
const tree = (g: G, x: number, y: number, s: number, c1: string, c2: string) => {
  g.fillStyle = '#6b4a2e'; g.fillRect(x - 2.5 * s, y - 16 * s, 5 * s, 16 * s);
  const gr = g.createRadialGradient(x - 5 * s, y - 30 * s, 2, x, y - 24 * s, 18 * s); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; for (const [dx, dy, r] of [[0, -28, 13], [-9, -22, 10], [9, -21, 10], [0, -18, 11]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); }
};
const shadow = (g: G, x: number, y: number, rx: number, ry: number, a = 0.18) => { g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
const lerpC = (a: [number, number, number], b: [number, number, number], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

// ============================== 狗狗快跑 ==============================
function dogrun(): Game {
  const GY = 300, CX = 120;
  type O = { x: number; kind: 'fence' | 'pumpkin' | 'crow'; w: number; h: number; y: number; ph: number; passed?: boolean };
  type Bone = { x: number; y: number; got?: boolean };
  const fx = new Fx(); let rec = false, pops: Pop[] = [];
  let st: St = 'ready', y = 0, vy = 0, jumps = 0, duck = 0, obs: O[] = [], bones: Bone[] = [], speed = 270, dist = 0, nBones = 0, next = 0, nextBone = 0, run = 0, scroll = 0, guard = 0, blink = 0;
  let best = store.get(bestKey('dogrun'));
  const score = () => Math.floor(dist) + nBones * 10;
  const reset = () => { y = 0; vy = 0; jumps = 0; duck = 0; obs = []; bones = []; speed = 270; dist = 0; nBones = 0; next = 420; nextBone = 300; pops = []; };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const jump = () => {
    if (st !== 'play') { begin(); return; }
    duck = 0;
    if (jumps < 2) { vy = jumps ? 600 : 700; jumps++; sfx.jump(); fx.burst(CX - 8, GY - y, jumps === 2 ? '#fff' : ['#c9a77a', '#e8d2b0'], 7, 90, 3, jumps === 2 ? 0 : 300); }
  };
  const crouch = () => { if (st !== 'play') { begin(); return; } duck = 0.7; if (y > 0) vy = Math.min(vy, -700); sfx.whoosh(); };
  const lose = () => {
    st = 'over'; guard = 0.8; sfx.thud(); fx.shake = 0.35; fx.burst(CX + 10, GY - y - 24, ['#e0b45a', '#fff'], 16, 200);
    const s = score(); if (s > best) { best = s; store.set(bestKey('dogrun'), best); rec = true; fx.confetti(); sfx.win(); } else sfx.lose();
  };
  return {
    state: () => st,
    update(dt) {
      fx.update(dt); pops = agePops(pops, dt); guard = Math.max(0, guard - dt); blink = (blink + dt) % 3.2;
      run += dt * (st === 'play' ? speed / 20 : 4);
      if (st !== 'play') return;
      speed += dt * 8; dist += speed * dt / 40; scroll += speed * dt; duck = Math.max(0, duck - dt);
      vy -= 2300 * dt; y += vy * dt; if (y <= 0) { if (vy < -300) fx.burst(CX, GY, ['#c9a77a', '#e8d2b0'], 6, 70, 2.5); y = 0; vy = 0; jumps = 0; }
      if (Math.random() < dt * 12 && y === 0) fx.burst(CX - 22, GY - 2, '#d9bf98', 1, 40, 2.5, 0);
      next -= speed * dt; nextBone -= speed * dt;
      if (next <= 0) {
        const r = Math.random(), kind: O['kind'] = dist > 40 && r < 0.3 ? 'crow' : r < 0.65 ? 'fence' : 'pumpkin';
        obs.push(kind === 'crow' ? { x: W + 40, kind, w: 40, h: 22, y: GY - 62, ph: Math.random() * 6 } : kind === 'fence' ? { x: W + 40, kind, w: 48, h: 38, y: GY, ph: 0 } : { x: W + 40, kind, w: 38, h: 30, y: GY, ph: 0 });
        next = rand(280, 540) * (speed / 300);
      }
      if (nextBone <= 0) { const n = 1 + Math.floor(Math.random() * 3), hy = Math.random() < 0.5 ? 40 : 110; for (let i = 0; i < n; i++) bones.push({ x: W + 30 + i * 36, y: GY - hy - Math.sin(i / Math.max(1, n - 1) * Math.PI) * 20 }); nextBone = rand(380, 700); }
      for (const o of obs) { o.x -= speed * dt * (o.kind === 'crow' ? 1.15 : 1); o.ph += dt * 12; }
      for (const b of bones) b.x -= speed * dt;
      obs = obs.filter((o) => o.x > -70); bones = bones.filter((b) => b.x > -30 && !b.got);
      // 狗的身体框：趴下时又矮又长
      const dh = duck > 0 && y === 0 ? 24 : 46, top = GY - y - dh, left = CX - 26, right = CX + 30;
      for (const o of obs) {
        const oTop = o.kind === 'crow' ? o.y - o.h / 2 : o.y - o.h, oBot = o.kind === 'crow' ? o.y + o.h / 2 : o.y;
        if (right - 6 > o.x + 4 && left + 6 < o.x + o.w - 4 && top + 4 < oBot && GY - y > oTop + 6) { lose(); return; }
        if (!o.passed && o.x + o.w < left) { o.passed = true; if (o.kind === 'crow') pops.push({ x: CX, y: GY - 80, s: '钻过去了！', c: '#fff', life: 0.8 }); }
      }
      for (const b of bones) if (!b.got && Math.abs(b.x - CX) < 30 && b.y > top - 12 && b.y < GY - y + 8) { b.got = true; nBones++; sfx.coin(); fx.burst(b.x, b.y, ['#fff8e6', '#e8d9b8'], 8, 120, 3, 0); pops.push({ x: b.x, y: b.y - 10, s: '+10', c: '#ffe08a', life: 0.7 }); }
    },
    draw(g, t) {
      fx.begin(g, t);
      // 天空、太阳、云
      const bg = g.createLinearGradient(0, 0, 0, GY); bg.addColorStop(0, '#6fb8ef'); bg.addColorStop(0.7, '#bfe3fb'); bg.addColorStop(1, '#e8f4ff'); g.fillStyle = bg; g.fillRect(-20, -20, W + 40, GY + 20);
      const sun = g.createRadialGradient(540, 70, 8, 540, 70, 70); sun.addColorStop(0, 'rgba(255,252,220,1)'); sun.addColorStop(0.35, 'rgba(255,236,160,.7)'); sun.addColorStop(1, 'rgba(255,236,160,0)'); g.fillStyle = sun; g.fillRect(460, 0, 180, 150);
      for (let i = 0; i < 4; i++) cloud(g, wrap(i * 210 - scroll * 0.06, W + 200) - 100, 50 + (i % 2) * 34, 0.75 + (i % 3) * 0.15);
      ridge(g, scroll * 0.12, GY - 60, 60, 0.008, '#9cc3d9', '#b8d6e4', 1);
      ridge(g, scroll * 0.25, GY - 22, 40, 0.012, '#8fc46a', '#6fae4a', 4);
      for (let i = 0; i < 7; i++) tree(g, wrap(i * 120 - scroll * 0.25, W + 160) - 80, GY - 26 + (i % 2) * 6, 0.9 + (i % 3) * 0.15, '#7cc458', '#3f8a35');
      // 近处的木栅栏（背景）
      g.fillStyle = '#d9b98a'; for (let i = 0; i < 14; i++) { const x = wrap(i * 52 - scroll * 0.6, W + 52) - 26; rr(g, x, GY - 44, 8, 40, 3); g.fill(); }
      g.fillStyle = '#c9a473'; g.fillRect(0, GY - 36, W, 5); g.fillRect(0, GY - 20, W, 5);
      // 地面：土路 + 草边 + 石子
      const gg = g.createLinearGradient(0, GY, 0, H); gg.addColorStop(0, '#c99a62'); gg.addColorStop(1, '#a87a48'); g.fillStyle = gg; g.fillRect(0, GY, W, H - GY);
      g.fillStyle = '#6fae4a'; g.fillRect(0, GY - 2, W, 7);
      for (let i = 0; i < 40; i++) { const x = wrap(i * 23 - scroll, W + 23) - 10; g.fillStyle = i % 3 ? '#5f9e3e' : '#86c45e'; g.beginPath(); g.moveTo(x, GY + 3); g.lineTo(x + 3, GY - 7 - (i % 4) * 2); g.lineTo(x + 6, GY + 3); g.fill(); }
      for (let i = 0; i < 16; i++) { const x = wrap(i * 61 - scroll, W + 61) - 20, yy = GY + 16 + (i * 37) % 40; g.fillStyle = 'rgba(90,60,30,.35)'; g.beginPath(); g.ellipse(x, yy, 4 + (i % 3) * 2, 2.5, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,240,210,.35)'; g.beginPath(); g.ellipse(x - 1, yy - 1, 2, 1, 0, 0, 7); g.fill(); }
      // 骨头
      for (const b of bones) {
        const bob = Math.sin(t * 5 + b.x * 0.05) * 3;
        g.save(); g.translate(b.x, b.y + bob); g.rotate(-0.25);
        g.fillStyle = '#fff8e6'; g.strokeStyle = '#b8a27a'; g.lineWidth = 1.5;
        rr(g, -11, -3.5, 22, 7, 3); g.fill(); g.stroke();
        for (const sx of [-12, 12]) for (const sy of [-4, 4]) { g.beginPath(); g.arc(sx, sy, 4.5, 0, 7); g.fill(); g.stroke(); }
        g.fillStyle = '#fff8e6'; rr(g, -10, -3, 20, 6, 3); g.fill();
        g.restore();
      }
      // 障碍
      for (const o of obs) {
        if (o.kind === 'fence') {
          shadow(g, o.x + o.w / 2, GY + 3, o.w / 2 + 4, 4);
          for (let i = 0; i < 3; i++) { const px = o.x + 4 + i * 17; const pg = g.createLinearGradient(px, 0, px + 9, 0); pg.addColorStop(0, '#a8774a'); pg.addColorStop(1, '#7c5432'); g.fillStyle = pg; g.beginPath(); g.moveTo(px, GY); g.lineTo(px, GY - o.h + 6); g.lineTo(px + 4.5, GY - o.h); g.lineTo(px + 9, GY - o.h + 6); g.lineTo(px + 9, GY); g.fill(); g.strokeStyle = 'rgba(60,35,15,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 3, GY - o.h + 10); g.lineTo(px + 3, GY - 4); g.stroke(); }
          g.fillStyle = '#8c6038'; g.fillRect(o.x, GY - o.h + 12, o.w, 6); g.fillRect(o.x, GY - 16, o.w, 6);
        } else if (o.kind === 'pumpkin') {
          shadow(g, o.x + o.w / 2, GY + 2, o.w / 2 + 2, 4);
          const cx = o.x + o.w / 2, cy = GY - o.h / 2;
          for (const [dx, rx, c] of [[-10, 11, '#e07a1c'], [10, 11, '#e07a1c'], [0, 13, '#f39a2e']] as const) { const pg = g.createRadialGradient(cx + dx - 3, cy - 6, 2, cx + dx, cy, 16); pg.addColorStop(0, '#ffc463'); pg.addColorStop(1, c); g.fillStyle = pg; g.beginPath(); g.ellipse(cx + dx, cy, rx, o.h / 2, 0, 0, 7); g.fill(); }
          g.strokeStyle = 'rgba(150,70,10,.5)'; g.lineWidth = 1.2; for (const dx of [-6, 6]) { g.beginPath(); g.ellipse(cx + dx, cy, 4, o.h / 2 - 1, 0, 0, 7); g.stroke(); }
          g.fillStyle = '#5a7a2a'; g.fillRect(cx - 2, cy - o.h / 2 - 7, 4, 9); g.strokeStyle = '#6a9a34'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 1, cy - o.h / 2 - 4); g.quadraticCurveTo(cx + 12, cy - o.h / 2 - 12, cx + 14, cy - o.h / 2 - 2); g.stroke();
        } else { // 乌鸦：扇着翅膀低飞过来
          const f = Math.sin(o.ph);
          g.save(); g.translate(o.x + o.w / 2, o.y);
          g.fillStyle = '#1f2330';
          g.beginPath(); g.moveTo(-4, -2); g.quadraticCurveTo(-10, -18 * f - 6, -22, -16 * f - 2); g.quadraticCurveTo(-12, -2, -4, 2); g.fill();
          const bgd = g.createLinearGradient(0, -8, 0, 8); bgd.addColorStop(0, '#3a4054'); bgd.addColorStop(1, '#14161e'); g.fillStyle = bgd;
          g.beginPath(); g.ellipse(0, 0, 15, 8, -0.1, 0, 7); g.fill();
          g.beginPath(); g.moveTo(12, -1); g.lineTo(22, -4); g.lineTo(20, 4); g.fill();
          g.beginPath(); g.arc(-12, -3, 7, 0, 7); g.fill();
          g.fillStyle = '#f2b636'; g.beginPath(); g.moveTo(-18, -4); g.lineTo(-27, -1); g.lineTo(-18, 0); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(-14, -5, 2, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(-14.5, -5, 1, 0, 7); g.fill();
          g.fillStyle = '#2a2f40'; g.beginPath(); g.moveTo(2, 0); g.quadraticCurveTo(6, 18 * f + 8, 16, 14 * f + 6); g.quadraticCurveTo(10, 2, 2, 0); g.fill();
          g.restore();
          shadow(g, o.x + o.w / 2, GY + 3, 14, 3, 0.1);
        }
      }
      // 黄狗
      const ducking = duck > 0 && y === 0, cy = GY - y, ph = Math.sin(run), air = y > 0;
      shadow(g, CX, GY + 3, 28 - Math.min(16, y / 8), 4.5);
      g.save(); g.translate(CX, cy); if (ducking) g.scale(1.15, 0.6);
      const fur = g.createLinearGradient(0, -48, 0, -10); fur.addColorStop(0, '#c98d3a'); fur.addColorStop(0.5, '#e6b05c'); fur.addColorStop(1, '#f3d49a');
      // 尾巴（一直摇）
      g.strokeStyle = '#d29a48'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-24, -32); g.quadraticCurveTo(-36, -42 - Math.sin(t * 18) * 6, -34 + Math.sin(t * 18) * 5, -54); g.stroke();
      // 后腿、前腿
      for (const [lx, s, d] of [[-16, 1, 0], [-10, -1, 1], [14, -1, 0], [20, 1, 1]] as const) {
        const sw = air ? (lx < 0 ? -0.7 : 0.7) : ph * s * 0.7; g.save(); g.translate(lx, -18); g.rotate(sw);
        g.fillStyle = d ? '#d9a256' : '#c48c40'; rr(g, -4, 0, 8, 17, 4); g.fill(); g.fillStyle = '#f6e2bd'; g.beginPath(); g.ellipse(0, 17, 5, 3, 0, 0, 7); g.fill(); g.restore();
      }
      // 身子
      g.fillStyle = fur; g.beginPath(); g.ellipse(0, -30, 30, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#f6e2bd'; g.beginPath(); g.ellipse(6, -22, 18, 7, 0, 0, 7); g.fill(); // 肚子
      g.fillStyle = 'rgba(150,95,40,.35)'; g.beginPath(); g.ellipse(-6, -40, 18, 5, 0, 0, 7); g.fill(); // 背上深一道
      // 红项圈 + 铃铛
      g.fillStyle = '#d63b3b'; rr(g, 20, -44, 8, 18, 3); g.fill(); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(26, -26, 3.2, 0, 7); g.fill();
      // 头
      g.save(); g.translate(32, -48 + (air ? 0 : Math.abs(ph) * 1.5));
      g.fillStyle = fur; g.beginPath(); g.ellipse(0, 0, 15, 13, 0, 0, 7); g.fill();
      g.fillStyle = '#f6e2bd'; g.beginPath(); g.ellipse(11, 5, 10, 7, 0.1, 0, 7); g.fill(); // 嘴筒子
      g.fillStyle = '#2a1a12'; g.beginPath(); g.ellipse(20, 2, 4, 3.2, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(19, 1, 1.2, 0, 7); g.fill();
      if (!ducking) { g.fillStyle = '#f07a8a'; g.beginPath(); g.ellipse(13, 12 + Math.abs(ph) * 2, 3.5, 5, 0.2, 0, 7); g.fill(); } // 舌头
      eye(g, 6, -3, 4.2, 0.6, 0, blink > 3.05 ? 1 : 0);
      g.fillStyle = '#a8692a'; g.beginPath(); g.moveTo(-8, -10); g.quadraticCurveTo(-18, -2 + (air ? -6 : ph * 3), -12, 12); g.quadraticCurveTo(-6, 4, -4, -8); g.fill(); // 耷拉的耳朵
      g.restore();
      g.restore();
      drawPops(g, pops); fx.draw(g); g.restore(); vignette(g, 0.16);
      hud(g, `${Math.floor(dist)} 米 · 🦴 ${nBones}`, `${score()} 分 · 最好 ${best}`);
      if (st === 'ready') intro(g, t, '狗狗快跑', ['点一下（A / 上）跳，空中还能再跳一次', '乌鸦飞过来：按下（往下划）趴下钻过去', '捡骨头 +10 分，越跑越快'], '#c98d3a');
      if (st === 'over') panel(g, [['大黄摔了个跟头', 22], [`${score()} 分`, 26, '#c98d3a'], [`${Math.floor(dist)} 米 · 骨头 ${nBones} 根 · 最好 ${best}`, 15, '#6b7280']], t, rec);
    },
    key(k: Key) { if (k === 'a' || k === 'up') jump(); else if (k === 'down') crouch(); },
    tap() { jump(); },
    swipe(dx, dy) { if (dy > Math.abs(dx) * 0.6) crouch(); else jump(); },
  };
}

// ============================== 熊猫爬竹 ==============================
function panda(): Game {
  const SEG = 58, CXs = W / 2, BASE = 300;
  const fx = new Fx(); let rec = false;
  let st: St = 'ready', side: -1 | 1 = -1, level = 0, cam = 0, branches: (0 | -1 | 1)[] = [], energy = 1, drain = 0.12, guard = 0, hug = 0, fall = 0, leaves: { x: number; y: number; vx: number; vy: number; r: number; vr: number }[] = [];
  let best = store.get(bestKey('panda'));
  const gen = (i: number): 0 | -1 | 1 => { if (i < 3) return 0; const prev = branches[i - 1]; if (prev && Math.random() < 0.55) return 0; return Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); };
  const ensure = () => { while (branches.length < level + 12) branches.push(gen(branches.length)); };
  const reset = () => { side = -1; level = 0; cam = 0; branches = []; energy = 1; drain = 0.12; fall = 0; ensure(); };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const lose = (why: string) => {
    st = 'over'; guard = 0.8; fall = 0.001; sfx.thud(); fx.shake = 0.4; whyLost = why;
    for (let i = 0; i < 6; i++) leaves.push({ x: CXs + side * 30, y: 180, vx: rand(-60, 60), vy: rand(-80, 20), r: rand(0, 6), vr: rand(-4, 4) });
    if (level > best) { best = level; store.set(bestKey('panda'), best); rec = true; fx.confetti(); sfx.win(); } else sfx.lose();
  };
  let whyLost = '';
  const climb = (s: -1 | 1) => {
    if (st !== 'play') { begin(); return; }
    side = s; hug = 0.15;
    if (branches[level + 1] === s) { level++; lose('撞上竹枝了'); return; }
    level++; ensure(); energy = Math.min(1, energy + 0.09); sfx.tick(); if (level % 25 === 0) { sfx.bonus(); fx.burst(CXs, 140, ['#7cc458', '#d7f2a8'], 14, 140, 3, 0); }
    drain = 0.12 + Math.min(0.35, level * 0.004);
    if (Math.random() < 0.4) leaves.push({ x: CXs + rand(-60, 60), y: -10, vx: rand(-20, 20), vy: rand(30, 60), r: rand(0, 6), vr: rand(-2, 2) });
  };
  const yOf = (i: number) => BASE - (i - cam) * SEG; // 第 i 节竹子的下沿在屏幕上的高度
  return {
    state: () => st,
    update(dt) {
      fx.update(dt); guard = Math.max(0, guard - dt); hug = Math.max(0, hug - dt);
      cam += (level - cam) * Math.min(1, dt * 12);
      for (const l of leaves) { l.x += (l.vx + Math.sin(l.y * 0.05) * 20) * dt; l.y += l.vy * dt; l.r += l.vr * dt; }
      leaves = leaves.filter((l) => l.y < H + 20);
      if (fall > 0) fall += dt;
      if (st !== 'play') return;
      energy -= drain * dt; if (energy <= 0) { energy = 0; lose('没力气，滑下去了'); }
    },
    draw(g, t) {
      fx.begin(g, t);
      // 雾气里的青山：越爬越高，天色从青绿变成霞光
      const k = clamp(cam / 150, 0, 1);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, lerpC([170, 214, 196], [255, 196, 150], k)); bg.addColorStop(1, lerpC([232, 244, 226], [255, 232, 205], k)); g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
      for (let i = 0; i < 3; i++) ridge(g, i * 300 + cam * 2, 250 + i * 40 + cam * (1.5 + i) % 40, 90 - i * 20, 0.006 + i * 0.003, ['#9cc2b0', '#7fae96', '#5f9a7a'][i], ['#cfe3d6', '#a9cdb6', '#86b898'][i], i * 2.1);
      g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(wrap(i * 260 + t * 8, W + 300) - 150, 200 + i * 40, 200, 18, 0, 0, 7); g.fill(); } // 雾带
      // 背后几根远处的竹子
      for (let i = 0; i < 6; i++) { const x = 40 + i * 110 + (i % 2) * 20; if (Math.abs(x - CXs) < 70) continue; g.fillStyle = 'rgba(90,150,90,.35)'; g.fillRect(x, 0, 9, H); for (let y = wrap(cam * 20 + i * 30, 70); y < H; y += 70) { g.fillStyle = 'rgba(70,120,70,.4)'; g.fillRect(x - 1, y, 11, 3); } }
      // 主竹子：一节节，节上有一道竹节
      for (let i = Math.floor(cam) - 2; i < cam + 8; i++) {
        const y0 = yOf(i); if (y0 < -SEG || y0 > H + SEG) continue;
        const sg = g.createLinearGradient(CXs - 15, 0, CXs + 15, 0); sg.addColorStop(0, '#4f8f3a'); sg.addColorStop(0.35, '#9ed26a'); sg.addColorStop(0.6, '#7cbc52'); sg.addColorStop(1, '#3f7a2e');
        g.fillStyle = sg; g.fillRect(CXs - 14, y0 - SEG, 28, SEG);
        g.fillStyle = '#3d6e2c'; rr(g, CXs - 16, y0 - 4, 32, 6, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(CXs - 15, y0 - 3, 30, 1.5);
        const b = i >= 0 ? branches[i] : 0;
        if (b) { // 竹枝 + 一簇竹叶
          g.save(); g.translate(CXs + b * 14, y0 - SEG / 2); g.scale(b, 1);
          g.strokeStyle = '#4f8a36'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(40, -2, 92, -14); g.stroke();
          for (let j = 0; j < 6; j++) { const lx = 30 + j * 12, ly = -4 - j * 2; g.save(); g.translate(lx, ly); g.rotate(-0.5 + (j % 2) * 1.1 + Math.sin(t * 2 + j) * 0.08); const lg = g.createLinearGradient(0, 0, 30, 0); lg.addColorStop(0, '#5aa83e'); lg.addColorStop(1, '#a8dc78'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14, -7, 30, 0); g.quadraticCurveTo(14, 5, 0, 0); g.fill(); g.restore(); }
          g.restore();
        }
      }
      // 熊猫抱在竹子上（在 level 那一节）
      const py = yOf(level) - SEG / 2 + (fall > 0 ? fall * fall * 900 : 0), px = CXs + side * 24, sq = hug > 0 ? 1 - hug : 1;
      g.save(); g.translate(px, py); g.scale(-side, 1); if (fall > 0) g.rotate(fall * 6);
      const body = g.createRadialGradient(-6, -6, 4, 0, 0, 30); body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#dfe3e6');
      g.fillStyle = '#1e1f24'; // 后腿
      g.beginPath(); g.ellipse(14, 22, 9, 12, -0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(-4, 26, 9, 11, 0.3, 0, 7); g.fill();
      g.fillStyle = body; g.beginPath(); g.ellipse(4, 6, 21, 25, 0, 0, 7); g.fill();
      g.fillStyle = '#1e1f24'; g.beginPath(); g.ellipse(6, -10, 22, 9, 0, 0, 7); g.fill(); // 肩上一圈黑
      // 前爪抱着竹子（伸向竹子那一侧 = 本地 +x）
      for (const [yy, s] of [[-14, 1], [6, sq]] as const) { g.beginPath(); g.ellipse(22, yy, 11 * s + 2, 6.5, 0.2, 0, 7); g.fill(); g.fillStyle = '#3a3b44'; g.beginPath(); g.arc(30, yy + 1, 3, 0, 7); g.fill(); g.fillStyle = '#1e1f24'; }
      // 头
      g.save(); g.translate(-4, -30);
      g.fillStyle = '#1e1f24'; for (const ex of [-13, 13]) { g.beginPath(); g.arc(ex, -13, 7, 0, 7); g.fill(); }
      const hd = g.createRadialGradient(-5, -6, 3, 0, 0, 22); hd.addColorStop(0, '#fff'); hd.addColorStop(1, '#e4e7ea'); g.fillStyle = hd; g.beginPath(); g.ellipse(0, 0, 19, 17, 0, 0, 7); g.fill();
      g.fillStyle = '#1e1f24'; for (const ex of [-7, 7]) { g.beginPath(); g.ellipse(ex, -1, 5.5, 7, ex * 0.06, 0, 7); g.fill(); }
      eye(g, -7, -2, 2.6, 0.4, -0.2, fall > 0 ? 1 : 0); eye(g, 7, -2, 2.6, 0.4, -0.2, fall > 0 ? 1 : 0);
      g.fillStyle = '#1e1f24'; g.beginPath(); g.ellipse(0, 6, 3.5, 2.5, 0, 0, 7); g.fill();
      g.strokeStyle = '#1e1f24'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 8); g.lineTo(0, 10); g.quadraticCurveTo(-3, 13, -5, 11); g.moveTo(0, 10); g.quadraticCurveTo(3, 13, 5, 11); g.stroke();
      g.fillStyle = 'rgba(255,150,160,.45)'; for (const ex of [-12, 12]) { g.beginPath(); g.ellipse(ex, 6, 4, 2.5, 0, 0, 7); g.fill(); }
      g.restore(); g.restore();
      // 飘落的竹叶
      for (const l of leaves) { g.save(); g.translate(l.x, l.y); g.rotate(l.r); g.fillStyle = '#86c45e'; g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, -4, 8, 0); g.quadraticCurveTo(0, 3, -8, 0); g.fill(); g.restore(); }
      fx.draw(g); g.restore(); vignette(g, 0.2);
      // 体力条
      if (st === 'play') { g.fillStyle = 'rgba(0,0,0,.3)'; rr(g, W / 2 - 90, 46, 180, 12, 6); g.fill(); const eg = g.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0); eg.addColorStop(0, '#ff6b5a'); eg.addColorStop(0.5, '#ffd34d'); eg.addColorStop(1, '#7cd35a'); g.fillStyle = eg; rr(g, W / 2 - 90, 46, Math.max(12, 180 * energy), 12, 6); g.fill(); text(g, '体力', W / 2 - 100, 53, 12, '#fff', 'right', 700, 'rgba(0,0,0,.4)'); }
      hud(g, `${level} 节`, `最好 ${best} 节`);
      if (st === 'play' && level < 3) { text(g, '◀ 点左边', 90, H - 40, 18, '#fff', 'center', 800, 'rgba(0,0,0,.4)'); text(g, '点右边 ▶', W - 90, H - 40, 18, '#fff', 'center', 800, 'rgba(0,0,0,.4)'); }
      if (st === 'ready') intro(g, t, '熊猫爬竹', ['点屏幕左半边（←）爬到左边，右半边（→）爬到右边', '下一节哪边长着竹枝，就从另一边爬', '体力条一直在掉，爬一节回一点'], '#3f8a35');
      if (st === 'over') panel(g, [[whyLost || '掉下来啦', 22], [`${level} 节`, 26, '#3f8a35'], [`最好 ${best} 节`, 16, '#6b7280']], t, rec);
    },
    key(k: Key) { if (k === 'left') climb(-1); else if (k === 'right') climb(1); else if (k === 'a' && st !== 'play') begin(); },
    tap(x) { climb(x < W / 2 ? -1 : 1); },
  };
}

// ============================== 兔子蹦蹦 ==============================
function bunny(): Game {
  type P = { x: number; y: number; w: number; kind: 'cloud' | 'twig' | 'shroom'; broken?: number; vx: number };
  type C = { x: number; y: number; got?: boolean };
  const fx = new Fx(); let rec = false, pops: Pop[] = [];
  let st: St = 'ready', x = W / 2, y = 250, vy = 0, tx = W / 2, plats: P[] = [], carrots: C[] = [], top = 0, height = 0, nCarrot = 0, guard = 0, squash = 0, face = 1;
  let best = store.get(bestKey('bunny'));
  const score = () => Math.floor(height / 10) + nCarrot * 5;
  const addPlat = (py: number) => {
    const h = height + (250 - py), r = Math.random();
    const kind: P['kind'] = h > 400 && r < 0.14 ? 'twig' : r < 0.22 ? 'shroom' : 'cloud';
    const p: P = { x: rand(50, W - 50), y: py, w: kind === 'shroom' ? 40 : rand(62, 84), kind, vx: h > 1500 && Math.random() < 0.3 ? rand(-60, 60) : 0 };
    plats.push(p);
    if (Math.random() < 0.28 && kind !== 'twig') carrots.push({ x: p.x + rand(-20, 20), y: py - 34 });
  };
  const reset = () => {
    x = W / 2; y = 250; vy = -520; tx = W / 2; plats = []; carrots = []; height = 0; nCarrot = 0; pops = []; top = 300;
    plats.push({ x: W / 2, y: 300, w: 110, kind: 'cloud', vx: 0 });
    for (let py = 300 - 60; py > -60; py -= rand(50, 72)) addPlat(py);
    top = Math.min(...plats.map((p) => p.y));
  };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const lose = () => { st = 'over'; guard = 0.8; sfx.lose(); const s = score(); if (s > best) { best = s; store.set(bestKey('bunny'), best); rec = true; fx.confetti(); sfx.win(); } };
  reset(); vy = 0;
  return {
    state: () => st,
    update(dt) {
      fx.update(dt); pops = agePops(pops, dt); guard = Math.max(0, guard - dt); squash = Math.max(0, squash - dt * 4);
      if (st !== 'play') return;
      const dx = tx - x; const sp = clamp(dx * 6, -380, 380); x += sp * dt; if (Math.abs(sp) > 20) face = Math.sign(sp);
      if (x < -20) { x += W + 40; tx += W + 40; } if (x > W + 20) { x -= W + 40; tx -= W + 40; }
      const prevY = y; vy += 1300 * dt; y += vy * dt;
      for (const p of plats) {
        if (p.vx) { p.x += p.vx * dt; if (p.x < 40 || p.x > W - 40) p.vx *= -1; }
        if (p.broken !== undefined) { p.broken += dt; p.y += 300 * dt * p.broken * 4; continue; }
        if (vy > 0 && prevY <= p.y - 2 && y >= p.y - 2 && Math.abs(x - p.x) < p.w / 2 + 10) {
          if (p.kind === 'twig') { p.broken = 0; sfx.smash(); fx.burst(p.x, p.y, ['#8a6a40', '#b89060'], 10, 120, 3); continue; }
          y = p.y - 2; vy = p.kind === 'shroom' ? -900 : -560; squash = 1;
          if (p.kind === 'shroom') { sfx.bonus(); pops.push({ x: p.x, y: p.y - 30, s: '蹦！', c: '#ff8ab0', life: 0.7 }); } else sfx.jump();
          fx.burst(x, p.y, '#fff', 6, 70, 3, 0);
        }
      }
      // 起跳的草地：没爬高之前掉下来能在草地上弹起来（一开始往旁边一偏就掉出画面，太难了）
      const groundY = 300 + height;
      if (groundY < H + 10 && vy > 0 && prevY <= groundY && y >= groundY) { y = groundY; vy = -560; squash = 1; sfx.jump(); }
      // 往上走：镜头跟着兔子，把东西往下挪
      if (y < 150) { const d = 150 - y; y = 150; height += d; for (const p of plats) p.y += d; for (const c of carrots) c.y += d; top += d; }
      plats = plats.filter((p) => p.y < H + 40); carrots = carrots.filter((c) => c.y < H + 30 && !c.got);
      while (top > -40) { top -= rand(50, 70) + Math.min(30, height / 200); addPlat(top); }
      for (const c of carrots) if (!c.got && Math.abs(c.x - x) < 22 && Math.abs(c.y - (y - 22)) < 26) { c.got = true; nCarrot++; sfx.coin(); fx.burst(c.x, c.y, ['#ff9a3c', '#5aa83e'], 8, 110, 3, 0); pops.push({ x: c.x, y: c.y, s: '+5', c: '#ffb36b', life: 0.7 }); }
      if (y > H + 30) lose();
    },
    draw(g, t) {
      fx.begin(g, t);
      // 越高天越黑：白天 → 黄昏 → 星空
      const k = clamp(height / 4000, 0, 1);
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, k < 0.5 ? lerpC([120, 190, 240], [255, 160, 130], k * 2) : lerpC([255, 160, 130], [30, 34, 80], (k - 0.5) * 2));
      bg.addColorStop(1, k < 0.5 ? lerpC([210, 236, 255], [255, 220, 170], k * 2) : lerpC([255, 220, 170], [70, 60, 120], (k - 0.5) * 2));
      g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
      if (k > 0.55) { g.fillStyle = `rgba(255,255,255,${(k - 0.55) * 2})`; for (let i = 0; i < 40; i++) { const sx = (i * 97) % W, sy = wrap(i * 53 + height * 0.05, H); g.fillRect(sx, sy, 2, 2); } }
      for (let i = 0; i < 3; i++) cloud(g, wrap(i * 260 + t * 6, W + 200) - 100, wrap(i * 140 + height * 0.2, H + 100) - 50, 0.6, 0.4);
      if (height < 200) { g.save(); g.translate(0, height); ridge(g, 0, H + 20, 50, 0.01, '#8fc46a', '#6fae4a', 2); g.restore(); }
      if (300 + height < H + 10) { const gy2 = 300 + height; const gg = g.createLinearGradient(0, gy2, 0, gy2 + 60); gg.addColorStop(0, '#7cc458'); gg.addColorStop(1, '#4f8f3a'); g.fillStyle = gg; g.fillRect(0, gy2, W, 80); for (let i = 0; i < 40; i++) { const gx = i * 16 + (i % 3) * 3; g.fillStyle = i % 2 ? '#5fa83e' : '#9ad66a'; g.beginPath(); g.moveTo(gx, gy2 + 2); g.lineTo(gx + 3, gy2 - 8 - (i % 4) * 2); g.lineTo(gx + 6, gy2 + 2); g.fill(); } }
      // 胡萝卜
      for (const c of carrots) {
        const bob = Math.sin(t * 4 + c.x) * 3;
        g.save(); g.translate(c.x, c.y + bob); g.rotate(0.3);
        const cg = g.createLinearGradient(-6, 0, 6, 0); cg.addColorStop(0, '#ff8a2a'); cg.addColorStop(1, '#e8621a'); g.fillStyle = cg;
        g.beginPath(); g.moveTo(-6, -8); g.quadraticCurveTo(0, -11, 6, -8); g.lineTo(0, 14); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(160,60,10,.5)'; g.lineWidth = 1; for (const yy of [-3, 2, 7]) { g.beginPath(); g.moveTo(-4 + yy * 0.3, yy); g.lineTo(2 - yy * 0.2, yy + 1); g.stroke(); }
        g.fillStyle = '#4f9a3a'; for (const a of [-0.5, 0, 0.5]) { g.save(); g.translate(0, -9); g.rotate(a); g.beginPath(); g.ellipse(0, -7, 2.5, 7, 0, 0, 7); g.fill(); g.restore(); }
        g.restore();
      }
      // 平台
      for (const p of plats) {
        g.save(); if (p.broken !== undefined) { g.globalAlpha = Math.max(0, 1 - p.broken * 2); }
        if (p.kind === 'cloud') {
          const w = p.w;
          g.fillStyle = '#c9d8ea'; g.beginPath(); g.ellipse(p.x, p.y + 6, w / 2, 9, 0, 0, 7); g.fill();
          g.fillStyle = '#fff'; for (const [dx, r] of [[-w * 0.3, 10], [-w * 0.1, 13], [w * 0.12, 12], [w * 0.32, 9]]) { g.beginPath(); g.arc(p.x + dx, p.y + 1, r, Math.PI, 0); g.fill(); }
          g.fillRect(p.x - w / 2 + 4, p.y, w - 8, 6);
          g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(p.x - w * 0.12, p.y - 8, 6, 3, 0, 0, 7); g.fill();
        } else if (p.kind === 'twig') {
          const tg = g.createLinearGradient(0, p.y - 4, 0, p.y + 5); tg.addColorStop(0, '#b38a58'); tg.addColorStop(1, '#7a5530'); g.fillStyle = tg;
          if (p.broken !== undefined) { g.save(); g.translate(p.x - p.w / 4, p.y); g.rotate(-p.broken * 2); rr(g, -p.w / 4, -3, p.w / 2, 7, 3); g.fill(); g.restore(); g.save(); g.translate(p.x + p.w / 4, p.y); g.rotate(p.broken * 2); rr(g, -p.w / 4, -3, p.w / 2, 7, 3); g.fill(); g.restore(); }
          else { rr(g, p.x - p.w / 2, p.y - 3, p.w, 7, 3); g.fill(); g.strokeStyle = 'rgba(70,40,15,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x - 4, p.y - 3); g.lineTo(p.x + 2, p.y + 4); g.stroke(); g.fillStyle = '#6aa84f'; g.beginPath(); g.ellipse(p.x + p.w / 2 - 6, p.y - 6, 5, 2.5, -0.5, 0, 7); g.fill(); }
        } else { // 蘑菇弹簧
          const s = 1 + Math.sin(t * 6 + p.x) * 0.04;
          g.fillStyle = '#f4ead6'; rr(g, p.x - 7, p.y - 2, 14, 16, 4); g.fill();
          const mg = g.createRadialGradient(p.x - 6, p.y - 10, 2, p.x, p.y - 4, 24); mg.addColorStop(0, '#ff8aa8'); mg.addColorStop(1, '#d6305a'); g.fillStyle = mg;
          g.beginPath(); g.ellipse(p.x, p.y - 2, 22 * s, 13 * s, 0, Math.PI, 0); g.fill();
          g.fillStyle = '#fff'; for (const [dx, dy, r] of [[-9, -8, 3], [5, -10, 3.5], [13, -5, 2.5], [-15, -3, 2]]) { g.beginPath(); g.arc(p.x + dx, p.y + dy, r, 0, 7); g.fill(); }
        }
        g.restore();
      }
      // 兔子：落地时压扁一下
      const sq = squash, sx = 1 + sq * 0.25, sy = 1 - sq * 0.25, rising = vy < 0;
      g.save(); g.translate(x, y); g.scale(face * sx, sy);
      shadow(g, 0, 2, 14, 3, 0.12);
      const fur = g.createRadialGradient(-4, -24, 3, 0, -18, 22); fur.addColorStop(0, '#ffffff'); fur.addColorStop(1, '#e4e2ea');
      // 耳朵
      for (const [ex, a] of [[-6, -0.25], [5, 0.2]] as const) { g.save(); g.translate(ex, -34); g.rotate(a + (rising ? -0.1 : 0.25) * Math.sign(a)); g.fillStyle = fur; g.beginPath(); g.ellipse(0, -14, 5.5, 15, 0, 0, 7); g.fill(); g.fillStyle = '#ffb3c6'; g.beginPath(); g.ellipse(0, -13, 2.8, 11, 0, 0, 7); g.fill(); g.restore(); }
      g.fillStyle = fur; g.beginPath(); g.ellipse(-2, -14, 14, 13, 0, 0, 7); g.fill(); // 身子
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-15, -12, 6, 0, 7); g.fill(); // 尾巴球
      g.beginPath(); g.ellipse(6, -6, 6, 4, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(-8, -2, 7, 4, 0, 0, 7); g.fill(); // 爪
      g.fillStyle = fur; g.beginPath(); g.ellipse(4, -30, 12, 11, 0, 0, 7); g.fill(); // 头
      eye(g, 8, -32, 3.2, 0.5, rising ? -0.4 : 0.3);
      g.fillStyle = '#ff8aa8'; g.beginPath(); g.arc(15, -27, 2.2, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,150,170,.45)'; g.beginPath(); g.ellipse(9, -24, 3.5, 2, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#c8c4d0'; g.lineWidth = 0.8; rr(g, 12, -25, 3, 4, 1); g.fill(); g.stroke(); // 门牙
      g.strokeStyle = 'rgba(120,110,130,.6)'; g.beginPath(); for (const dy of [-1, 1]) { g.moveTo(14, -27 + dy); g.lineTo(22, -28 + dy * 3); } g.stroke(); // 胡须
      g.restore();
      drawPops(g, pops); fx.draw(g); g.restore(); vignette(g, 0.16);
      hud(g, `${Math.floor(height / 10)} 米 · 🥕 ${nCarrot}`, `${score()} 分 · 最好 ${best}`);
      if (st === 'ready') intro(g, t, '兔子蹦蹦', ['兔子自己往上蹦：鼠标 / 手指左右挪（或 ← →）', '粉蘑菇弹得特别高，枯树枝一踩就断', '捡胡萝卜 +5，掉下去就结束'], '#d6305a');
      if (st === 'over') panel(g, [['兔子掉下去啦', 22], [`${score()} 分`, 26, '#d6305a'], [`${Math.floor(height / 10)} 米 · 胡萝卜 ${nCarrot} 根 · 最好 ${best}`, 15, '#6b7280']], t, rec);
    },
    key(k: Key) { if (st !== 'play') { if (k === 'a') begin(); return; } if (k === 'left') tx = x - 90; if (k === 'right') tx = x + 90; },
    tap(px) { if (st !== 'play') { begin(); return; } tx = px; },
    point(px) { if (st === 'play') tx = px; },
  };
}

// ============================== 青蛙过河 ==============================
function frog(): Game {
  const ROW = 40, COLS = 16, CW = W / COLS; // 一行 40 像素高，横着 16 格
  type Lane = { kind: 'grass' | 'water'; dir: number; speed: number; items: { x: number; w: number; pad: boolean; fly?: boolean }[] };
  const fx = new Fx(); let rec = false, pops: Pop[] = [];
  let st: St = 'ready', lanes: Lane[] = [], row = 0, col = 8, fxp = 8 * CW + CW / 2, cam = 0, hop = 0, dead = 0, guard = 0, maxRow = 0, flies = 0, face = 0;
  let best = store.get(bestKey('frog'));
  const score = () => maxRow + flies * 5;
  const makeLane = (i: number): Lane => {
    if (i === 0 || i % 5 === 0 || Math.random() < 0.12) return { kind: 'grass', dir: 0, speed: 0, items: [] };
    const dir = i % 2 ? 1 : -1, speed = rand(40, 70) + Math.min(80, i * 0.8), pad = Math.random() < 0.4, items: Lane['items'] = [];
    let x = rand(0, 80);
    while (x < W + 200) { const w = pad ? CW * 1.3 : CW * rand(2.4, 4.2); items.push({ x, w, pad, fly: pad && Math.random() < 0.2 }); x += w + (pad ? rand(CW * 0.6, CW * 1.6) : rand(CW * 1.6, CW * 3.2)); }
    return { kind: 'water', dir, speed, items };
  };
  const laneAt = (i: number) => { while (lanes.length <= i) lanes.push(makeLane(lanes.length)); return lanes[i]; };
  const span = W + 200;
  const reset = () => { lanes = []; row = 0; col = 8; fxp = col * CW + CW / 2; cam = 0; hop = 0; dead = 0; maxRow = 0; flies = 0; pops = []; for (let i = 0; i < 14; i++) laneAt(i); };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const lose = (why: string) => { if (st !== 'play') return; st = 'over'; guard = 0.8; dead = 0.001; lostWhy = why; sfx.lose(); fx.burst(fxp, rowY(row), ['#8fd0ff', '#ffffff'], 18, 160); const s = score(); if (s > best) { best = s; store.set(bestKey('frog'), best); rec = true; fx.confetti(); sfx.win(); } };
  let lostWhy = '';
  const rowY = (i: number) => H - 40 - (i - cam) * ROW;
  const move = (dr: number, dc: number) => {
    if (st !== 'play') { begin(); return; }
    if (hop > 0) return;
    row = Math.max(0, row + dr); fxp = clamp(fxp + dc * CW, CW / 2, W - CW / 2); hop = 0.16; face = dc; sfx.jump();
    laneAt(row + 12);
    if (row > maxRow) { maxRow = row; if (maxRow % 10 === 0) { sfx.bonus(); pops.push({ x: fxp, y: rowY(row) - 20, s: `${maxRow} 行！`, c: '#fff', life: 0.9 }); } }
  };
  /** 青蛙脚下的东西（木头 / 荷叶）：按它们现在的位置算 */
  const under = (ln: Lane) => ln.items.find((it) => { const x0 = wrap(it.x, span) - 100; return fxp > x0 + 4 && fxp < x0 + it.w - 4; });
  return {
    state: () => st,
    update(dt) {
      fx.update(dt); pops = agePops(pops, dt); guard = Math.max(0, guard - dt);
      if (dead > 0) dead += dt;
      cam += (Math.max(0, row - 3) - cam) * Math.min(1, dt * 6);
      for (const ln of lanes) for (const it of ln.items) it.x += ln.dir * ln.speed * dt;
      if (st !== 'play') return;
      if (hop > 0) { hop = Math.max(0, hop - dt); if (hop > 0) return; }
      const ln = laneAt(row);
      if (ln.kind === 'water') {
        const it = under(ln);
        if (!it) { lose('扑通，掉水里了'); return; }
        fxp += ln.dir * ln.speed * dt; // 跟着木头漂
        if (it.fly) { it.fly = false; flies++; sfx.coin(); pops.push({ x: fxp, y: rowY(row) - 20, s: '+5 蜻蜓', c: '#bff0ff', life: 0.8 }); }
        if (fxp < 4 || fxp > W - 4) lose('被冲走了');
      }
    },
    draw(g, t) {
      fx.begin(g, t);
      g.fillStyle = '#2f7fb8'; g.fillRect(-20, -20, W + 40, H + 40);
      const first = Math.floor(cam) - 1;
      for (let i = Math.max(0, first); i < first + 12; i++) {
        const ln = laneAt(i), y0 = rowY(i) - ROW / 2;
        if (ln.kind === 'grass') {
          const gg = g.createLinearGradient(0, y0, 0, y0 + ROW); gg.addColorStop(0, '#8ccf5e'); gg.addColorStop(1, '#5fa83e'); g.fillStyle = gg; g.fillRect(0, y0, W, ROW);
          for (let k = 0; k < 22; k++) { const x = (k * 37 + i * 53) % W; g.fillStyle = k % 3 ? '#4f9a35' : '#a6dc78'; g.beginPath(); g.moveTo(x, y0 + ROW); g.lineTo(x + 2, y0 + ROW - 12 - (k % 4) * 3); g.lineTo(x + 5, y0 + ROW); g.fill(); }
          for (let k = 0; k < 3; k++) { const x = (k * 211 + i * 97) % W; g.fillStyle = ['#ffd34d', '#ff8ab0', '#ffffff'][k]; for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.26) * 3, y0 + 14 + Math.sin(p * 1.26) * 3, 2.2, 0, 7); g.fill(); } g.fillStyle = '#e8a020'; g.beginPath(); g.arc(x, y0 + 14, 1.6, 0, 7); g.fill(); }
        } else {
          const wg = g.createLinearGradient(0, y0, 0, y0 + ROW); wg.addColorStop(0, '#3a8fcc'); wg.addColorStop(1, '#2a76b0'); g.fillStyle = wg; g.fillRect(0, y0, W, ROW);
          g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; for (let k = 0; k < 8; k++) { const x = wrap(k * 90 + t * ln.dir * ln.speed * 0.6 + i * 37, W + 60) - 30; g.beginPath(); g.moveTo(x, y0 + 12 + (k % 3) * 8); g.quadraticCurveTo(x + 10, y0 + 9 + (k % 3) * 8, x + 20, y0 + 12 + (k % 3) * 8); g.stroke(); }
          for (const it of ln.items) {
            const x0 = wrap(it.x, span) - 100, cy = y0 + ROW / 2;
            if (it.pad) { // 荷叶：一圈深浅、一道缺口、叶脉，偶尔一朵荷花 / 一只蜻蜓
              const r = it.w / 2 - 2, cx = x0 + it.w / 2;
              g.fillStyle = 'rgba(0,40,80,.25)'; g.beginPath(); g.ellipse(cx + 2, cy + 3, r, r * 0.72, 0, 0, 7); g.fill();
              const pg = g.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r); pg.addColorStop(0, '#8fd46a'); pg.addColorStop(1, '#3f8f3a'); g.fillStyle = pg;
              g.beginPath(); g.moveTo(cx, cy); g.ellipse(cx, cy, r, r * 0.72, 0, 0.35, Math.PI * 2 - 0.05); g.closePath(); g.fill();
              g.strokeStyle = 'rgba(30,90,30,.5)'; g.lineWidth = 1; for (let a = 0.6; a < 6.2; a += 0.7) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.62); g.stroke(); }
              if (it.fly) { const fy = cy - 14 + Math.sin(t * 8) * 2; g.fillStyle = 'rgba(200,240,255,.8)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 7, fy - 2, 7, 2.5, s * (0.2 + Math.sin(t * 40) * 0.2), 0, 7); g.fill(); } g.fillStyle = '#2fa0d8'; rr(g, cx - 10, fy - 1.5, 20, 3, 1.5); g.fill(); g.fillStyle = '#1d6a9a'; g.beginPath(); g.arc(cx - 10, fy, 2.5, 0, 7); g.fill(); }
            } else { // 木头：树皮纹、两头年轮
              g.fillStyle = 'rgba(0,40,80,.25)'; rr(g, x0 + 3, cy - 10, it.w, 22, 10); g.fill();
              const lg = g.createLinearGradient(0, cy - 12, 0, cy + 12); lg.addColorStop(0, '#a87a4a'); lg.addColorStop(0.45, '#8a5e34'); lg.addColorStop(1, '#5e3c1e'); g.fillStyle = lg;
              rr(g, x0, cy - 12, it.w, 22, 10); g.fill();
              g.strokeStyle = 'rgba(50,30,10,.45)'; g.lineWidth = 1.2; for (let k = 10; k < it.w - 10; k += 14) { g.beginPath(); g.moveTo(x0 + k, cy - 8); g.quadraticCurveTo(x0 + k + 6, cy - 2, x0 + k + 2, cy + 6); g.stroke(); }
              for (const ex of [x0 + 8, x0 + it.w - 8]) { g.fillStyle = '#d8b27a'; g.beginPath(); g.ellipse(ex, cy - 1, 6, 10, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,80,40,.6)'; g.beginPath(); g.ellipse(ex, cy - 1, 3.5, 6, 0, 0, 7); g.stroke(); }
              g.fillStyle = '#6aa84f'; g.beginPath(); g.ellipse(x0 + it.w * 0.6, cy - 11, 5, 2.5, 0.3, 0, 7); g.fill(); // 一点青苔
            }
          }
        }
      }
      // 青蛙
      const fy = rowY(row) - (hop > 0 ? Math.sin((1 - hop / 0.16) * Math.PI) * 14 : 0);
      if (dead > 0) { g.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.8 - dead)})`; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(fxp, rowY(row), 8 + dead * 40 + k * 8, 4 + dead * 14 + k * 3, 0, 0, 7); g.stroke(); } }
      else {
        g.save(); g.translate(fxp, fy); g.rotate(face * 0.3);
        shadow(g, 0, 10 + (rowY(row) - fy), 13, 4, 0.2);
        const stretch = hop > 0 ? 1 : 0;
        g.fillStyle = '#3f8f2e'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 12, 8 + stretch * 4, 6, 4 + stretch * 4, s * 0.4, 0, 7); g.fill(); } // 后腿
        const bg2 = g.createRadialGradient(-3, -4, 2, 0, 0, 16); bg2.addColorStop(0, '#9de06a'); bg2.addColorStop(1, '#4f9e34'); g.fillStyle = bg2;
        g.beginPath(); g.ellipse(0, 0, 13, 12, 0, 0, 7); g.fill();
        g.fillStyle = '#2f7a22'; for (const [dx, dy, r] of [[-5, 3, 2.2], [4, 5, 1.8], [6, -2, 1.5], [-6, -4, 1.4]]) { g.beginPath(); g.arc(dx, dy, r, 0, 7); g.fill(); } // 斑点
        g.fillStyle = '#e8f6c8'; g.beginPath(); g.ellipse(0, 7, 7, 4, 0, 0, 7); g.fill();
        g.fillStyle = bg2; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 7, -10, 6, 0, 7); g.fill(); }
        eye(g, -7, -11, 4, 0, -0.3); eye(g, 7, -11, 4, 0, -0.3);
        g.strokeStyle = '#2a5a1a'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, -3, 5, 0.3, Math.PI - 0.3); g.stroke();
        g.fillStyle = 'rgba(255,140,150,.5)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 8, -3, 2.5, 1.5, 0, 0, 7); g.fill(); }
        g.restore();
      }
      drawPops(g, pops); fx.draw(g); g.restore(); vignette(g, 0.18);
      hud(g, `${maxRow} 行 · 蜻蜓 ${flies}`, `${score()} 分 · 最好 ${best}`);
      if (st === 'ready') intro(g, t, '青蛙过河', ['点一下（A / 上）往前跳一格，← → 或左右划横着跳', '河里只能踩木头和荷叶，会跟着漂', '吃到荷叶上的蜻蜓 +5，被冲出画面也算掉水'], '#2f7a22');
      if (st === 'over') panel(g, [[lostWhy || '掉水里了', 22], [`${score()} 分`, 26, '#2f7a22'], [`过了 ${maxRow} 行 · 最好 ${best}`, 15, '#6b7280']], t, rec);
    },
    key(k: Key) { if (k === 'up' || k === 'a') move(1, 0); else if (k === 'down') move(-1, 0); else if (k === 'left') move(0, -1); else if (k === 'right') move(0, 1); },
    tap() { move(1, 0); },
    swipe(dx, dy) { if (Math.abs(dx) > Math.abs(dy)) move(0, Math.sign(dx)); else move(dy < 0 ? 1 : -1, 0); },
  };
}

// ============================== 企鹅滑雪 ==============================
function penguin(): Game {
  const PY = 110;
  type O = { x: number; y: number; kind: 'tree' | 'rock' | 'snowman' | 'gate' | 'fish'; w: number; hit?: boolean; got?: boolean; sway: number };
  const fx = new Fx(); let rec = false, pops: Pop[] = [];
  let st: St = 'ready', x = W / 2, tx = W / 2, vx = 0, speed = 200, dist = 0, gates = 0, fish = 0, obs: O[] = [], next = 0, guard = 0, crash = 0, trail: { x: number; y: number }[] = [], sc = 0;
  let best = store.get(bestKey('penguin'));
  const score = () => Math.floor(dist) + gates * 10 + fish * 5;
  const reset = () => { x = W / 2; tx = W / 2; vx = 0; speed = 200; dist = 0; gates = 0; fish = 0; obs = []; next = 80; crash = 0; trail = []; pops = []; };
  const begin = () => { if (guard > 0) return; reset(); st = 'play'; rec = false; sfx.start(); };
  const lose = (what: string) => { st = 'over'; guard = 0.8; crash = 0.001; lostWhat = what; sfx.thud(); fx.shake = 0.4; fx.burst(x, PY, ['#ffffff', '#dfefff'], 22, 200, 4); const s = score(); if (s > best) { best = s; store.set(bestKey('penguin'), best); rec = true; fx.confetti(); sfx.win(); } else sfx.lose(); };
  let lostWhat = '';
  return {
    state: () => st,
    update(dt) {
      fx.update(dt); pops = agePops(pops, dt); guard = Math.max(0, guard - dt); sc += dt;
      for (const o of obs) o.sway += dt;
      if (crash > 0) crash += dt;
      if (st !== 'play') return;
      speed = Math.min(520, speed + dt * 7); dist += speed * dt / 30;
      vx += ((tx - x) * 5 - vx) * Math.min(1, dt * 6); x = clamp(x + vx * dt, 20, W - 20);
      const dy = speed * dt;
      for (const o of obs) o.y -= dy;
      for (const p of trail) p.y -= dy;
      trail.push({ x, y: PY + 14 }); trail = trail.filter((p) => p.y > -10).slice(-160);
      obs = obs.filter((o) => o.y > -60);
      next -= dy;
      if (next <= 0) {
        const r = Math.random();
        if (r < 0.22) { const gx = rand(120, W - 120); obs.push({ x: gx, y: H + 40, kind: 'gate', w: rand(110, 150) - Math.min(40, dist / 40), sway: 0 }); }
        else if (r < 0.32) obs.push({ x: rand(40, W - 40), y: H + 30, kind: 'fish', w: 16, sway: 0 });
        else { const kind: O['kind'] = r < 0.72 ? 'tree' : r < 0.86 ? 'rock' : 'snowman'; obs.push({ x: rand(30, W - 30), y: H + 40, kind, w: kind === 'tree' ? 22 : kind === 'rock' ? 20 : 18, sway: Math.random() * 6 }); }
        next = rand(50, 95) * (300 / Math.max(260, speed)) * 1.4;
      }
      for (const o of obs) {
        if (o.kind === 'gate') {
          if (!o.hit && o.y < PY) { o.hit = true; if (Math.abs(x - o.x) < o.w / 2) { gates++; sfx.coin(); pops.push({ x, y: PY + 30, s: '旗门 +10', c: '#ffe08a', life: 0.8 }); } }
          if (Math.abs(o.y - PY) < 8 && Math.abs(Math.abs(x - o.x) - o.w / 2) < 8) { lose('撞上旗杆了'); return; }
        } else if (o.kind === 'fish') {
          if (!o.got && Math.abs(o.y - PY) < 18 && Math.abs(o.x - x) < 20) { o.got = true; fish++; sfx.bonus(); fx.burst(o.x, o.y, ['#9fd8ff', '#fff'], 8, 100, 3, 0); pops.push({ x, y: PY + 30, s: '+5', c: '#9fd8ff', life: 0.7 }); }
        } else if (Math.abs(o.y - PY) < 14 && Math.abs(o.x - x) < o.w * 0.6 + 8) { lose(o.kind === 'tree' ? '撞树上了' : o.kind === 'rock' ? '绊在石头上' : '一头扎进雪人里'); return; }
      }
    },
    draw(g, t) {
      fx.begin(g, t);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#f4f9ff'); bg.addColorStop(1, '#dbe9f7'); g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
      // 雪面的起伏阴影
      g.fillStyle = 'rgba(150,180,220,.18)'; for (let i = 0; i < 6; i++) { const yy = wrap(i * 90 - dist * 30 * 0.9, H + 120) - 60; g.beginPath(); g.ellipse((i * 173) % W, yy, 160, 26, 0.15, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 30; i++) { const yy = wrap(i * 47 - dist * 30, H + 20) - 10; g.fillRect((i * 131) % W, yy, 2, 2); } // 闪闪的雪粒
      // 滑过的两道雪痕
      g.strokeStyle = 'rgba(140,170,210,.55)'; g.lineWidth = 2; for (const off of [-5, 5]) { g.beginPath(); trail.forEach((p, i) => (i ? g.lineTo(p.x + off, p.y) : g.moveTo(p.x + off, p.y))); g.stroke(); }
      const sorted = [...obs].sort((a, b) => a.y - b.y);
      const drawObj = (o: O) => {
        if (o.kind === 'tree') {
          shadow(g, o.x + 8, o.y + 4, 18, 5, 0.15);
          g.fillStyle = '#6b4a2e'; g.fillRect(o.x - 3, o.y - 8, 6, 12);
          for (let k = 0; k < 3; k++) { const yy = o.y - 6 - k * 13, w = 24 - k * 6; const tg = g.createLinearGradient(o.x - w, 0, o.x + w, 0); tg.addColorStop(0, '#2f6a3e'); tg.addColorStop(1, '#1e4a2c'); g.fillStyle = tg; g.beginPath(); g.moveTo(o.x - w, yy); g.lineTo(o.x, yy - 20); g.lineTo(o.x + w, yy); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(o.x - w * 0.55, yy - 9); g.lineTo(o.x, yy - 20); g.lineTo(o.x + w * 0.55, yy - 9); g.quadraticCurveTo(o.x, yy - 6, o.x - w * 0.55, yy - 9); g.fill(); }
        } else if (o.kind === 'rock') {
          shadow(g, o.x + 4, o.y + 4, 16, 4, 0.15);
          const rg = g.createLinearGradient(0, o.y - 14, 0, o.y + 4); rg.addColorStop(0, '#9aa2ad'); rg.addColorStop(1, '#5f6670'); g.fillStyle = rg;
          g.beginPath(); g.moveTo(o.x - 16, o.y + 2); g.lineTo(o.x - 10, o.y - 10); g.lineTo(o.x + 2, o.y - 15); g.lineTo(o.x + 14, o.y - 6); g.lineTo(o.x + 16, o.y + 2); g.closePath(); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(o.x - 10, o.y - 10); g.lineTo(o.x + 2, o.y - 15); g.lineTo(o.x + 10, o.y - 9); g.quadraticCurveTo(o.x, o.y - 8, o.x - 10, o.y - 10); g.fill();
        } else if (o.kind === 'snowman') {
          shadow(g, o.x + 5, o.y + 4, 15, 4, 0.15);
          for (const [yy, r] of [[-8, 13], [-28, 9.5]] as const) { const sg = g.createRadialGradient(o.x - 4, o.y + yy - 4, 2, o.x, o.y + yy, r); sg.addColorStop(0, '#fff'); sg.addColorStop(1, '#d6e4f2'); g.fillStyle = sg; g.beginPath(); g.arc(o.x, o.y + yy, r, 0, 7); g.fill(); }
          g.fillStyle = '#d63b3b'; rr(g, o.x - 10, o.y - 21, 20, 5, 2); g.fill(); g.fillRect(o.x + 4, o.y - 19, 5, 10); // 围巾
          g.fillStyle = '#222'; g.beginPath(); g.arc(o.x - 3.5, o.y - 31, 1.5, 0, 7); g.arc(o.x + 3.5, o.y - 31, 1.5, 0, 7); g.fill();
          g.fillStyle = '#f07a1c'; g.beginPath(); g.moveTo(o.x, o.y - 28); g.lineTo(o.x + 10, o.y - 26); g.lineTo(o.x, o.y - 25); g.fill();
          g.fillStyle = '#2a2a33'; g.fillRect(o.x - 8, o.y - 40, 16, 3); g.fillRect(o.x - 5, o.y - 50, 10, 10); // 帽子
          g.fillStyle = '#333'; for (const yy of [-12, -6]) { g.beginPath(); g.arc(o.x, o.y + yy, 1.3, 0, 7); g.fill(); }
        } else if (o.kind === 'gate') {
          for (const s of [-1, 1]) {
            const fx2 = o.x + s * o.w / 2, wave = Math.sin(o.sway * 6 + s) * 3;
            shadow(g, fx2 + 4, o.y + 3, 6, 2, 0.15);
            g.fillStyle = '#555'; g.fillRect(fx2 - 1.2, o.y - 34, 2.4, 36);
            g.fillStyle = s < 0 ? '#e03a3a' : '#2f6fe0'; g.beginPath(); g.moveTo(fx2, o.y - 34); g.lineTo(fx2 + 16 * -s + wave, o.y - 28); g.lineTo(fx2, o.y - 22); g.fill();
          }
          g.strokeStyle = 'rgba(255,220,90,.35)'; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(o.x - o.w / 2, o.y); g.lineTo(o.x + o.w / 2, o.y); g.stroke(); g.setLineDash([]);
        } else if (!o.got) { // 小鱼
          g.save(); g.translate(o.x, o.y + Math.sin(o.sway * 5) * 2);
          const fg = g.createLinearGradient(0, -6, 0, 6); fg.addColorStop(0, '#8fd0ff'); fg.addColorStop(1, '#3a8fd8'); g.fillStyle = fg;
          g.beginPath(); g.ellipse(0, 0, 10, 5.5, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(-8, 0); g.lineTo(-16, -6); g.lineTo(-16, 6); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(5, -1.5, 1.6, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-3, -4, 6, 1.5);
          g.restore();
        }
      };
      for (const o of sorted) if (o.y <= PY) drawObj(o);
      // 企鹅（侧着身子随转向倾斜）
      const lean = clamp(vx / 300, -0.6, 0.6);
      g.save(); g.translate(x, PY); if (crash > 0) g.rotate(crash * 9);
      shadow(g, 3, 16, 14, 4, 0.18);
      g.rotate(lean);
      g.strokeStyle = '#2a2f3a'; g.lineWidth = 3; g.lineCap = 'round'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5, 10); g.lineTo(s * 5 + 2, 26); g.stroke(); } // 滑雪板
      g.fillStyle = '#f39a2e'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 5, 12, 4, 2.5, 0, 0, 7); g.fill(); }
      const pb = g.createLinearGradient(-12, 0, 12, 0); pb.addColorStop(0, '#2b3242'); pb.addColorStop(1, '#151a24'); g.fillStyle = pb;
      g.beginPath(); g.ellipse(0, -4, 12, 16, 0, 0, 7); g.fill();
      g.fillStyle = '#fbfbfd'; g.beginPath(); g.ellipse(0, 0, 8, 12, 0, 0, 7); g.fill();
      g.fillStyle = pb; for (const s of [-1, 1]) { g.save(); g.translate(s * 11, -4); g.rotate(s * (0.5 + Math.sin(sc * 10) * 0.15)); g.beginPath(); g.ellipse(0, 6, 3.5, 9, 0, 0, 7); g.fill(); g.restore(); } // 翅膀
      g.fillStyle = pb; g.beginPath(); g.arc(0, -18, 9, 0, 7); g.fill();
      g.fillStyle = '#fbfbfd'; g.beginPath(); g.ellipse(0, -16, 6, 5, 0, 0, 7); g.fill();
      eye(g, -3, -19, 2.2, 0, 0.6); eye(g, 3, -19, 2.2, 0, 0.6);
      g.fillStyle = '#f39a2e'; g.beginPath(); g.moveTo(-3, -14); g.lineTo(0, -9); g.lineTo(3, -14); g.fill();
      // 红围巾，飘在身后
      g.fillStyle = '#e03a3a'; rr(g, -8, -12, 16, 4, 2); g.fill(); g.beginPath(); g.moveTo(-6, -10); g.quadraticCurveTo(-14 - lean * 10, -24 + Math.sin(sc * 14) * 3, -20 - lean * 14, -30); g.lineTo(-16, -22); g.quadraticCurveTo(-11, -14, -4, -9); g.fill();
      g.restore();
      for (const o of sorted) if (o.y > PY) drawObj(o);
      drawPops(g, pops); fx.draw(g); g.restore(); vignette(g, 0.14);
      hud(g, `${Math.floor(dist)} 米 · 旗门 ${gates}`, `${score()} 分 · 最好 ${best}`);
      if (st === 'ready') intro(g, t, '企鹅滑雪', ['鼠标 / 手指左右挪（或 ← →）带企鹅拐弯', '从红旗和蓝旗中间穿过 +10，捡小鱼 +5', '别撞松树、石头和雪人，越滑越快'], '#2f6fe0');
      if (st === 'over') panel(g, [[lostWhat || '摔了一跤', 22], [`${score()} 分`, 26, '#2f6fe0'], [`${Math.floor(dist)} 米 · 旗门 ${gates} · 小鱼 ${fish} · 最好 ${best}`, 14, '#6b7280']], t, rec);
    },
    key(k: Key) { if (st !== 'play') { if (k === 'a') begin(); return; } if (k === 'left') tx = clamp(x - 110, 20, W - 20); if (k === 'right') tx = clamp(x + 110, 20, W - 20); },
    tap(px) { if (st !== 'play') { begin(); return; } tx = px; },
    point(px) { if (st === 'play') tx = px; },
  };
}

// ---------------- 主页图块上的小图（动画）----------------
export function drawRunnerIcon(g: G, id: string, cx: number, cy: number, t: number) {
  switch (id) {
    case 'dogrun': {
      g.fillStyle = '#c99a62'; g.fillRect(cx - 64, cy + 30, 128, 20); g.fillStyle = '#6fae4a'; g.fillRect(cx - 64, cy + 28, 128, 5);
      const jy = Math.abs(Math.sin(t * 3)) * 20;
      g.save(); g.translate(cx - 14, cy + 28 - jy);
      g.fillStyle = '#e6b05c'; g.beginPath(); g.ellipse(0, -16, 22, 11, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(22, -30, 11, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#a8692a'; g.beginPath(); g.ellipse(15, -28, 5, 9, 0.3, 0, 7); g.fill();
      g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(32, -29, 3, 0, 7); g.fill(); eye(g, 24, -33, 3, 0.5);
      g.fillStyle = '#d63b3b'; g.fillRect(12, -24, 5, 10);
      g.restore();
      g.save(); g.translate(cx + 36, cy + 14); g.rotate(-0.3); g.fillStyle = '#fff8e6'; rr(g, -9, -3, 18, 6, 3); g.fill(); for (const s of [-9, 9]) for (const s2 of [-3, 3]) { g.beginPath(); g.arc(s, s2, 4, 0, 7); g.fill(); } g.restore();
      break;
    }
    case 'panda': {
      const sg = g.createLinearGradient(cx - 8, 0, cx + 8, 0); sg.addColorStop(0, '#4f8f3a'); sg.addColorStop(0.4, '#9ed26a'); sg.addColorStop(1, '#3f7a2e'); g.fillStyle = sg; g.fillRect(cx - 8, cy - 60, 16, 120);
      g.fillStyle = '#3d6e2c'; for (const y of [-40, 0, 40]) g.fillRect(cx - 9, cy + y, 18, 4);
      const by = Math.sin(t * 2) * 6;
      g.fillStyle = '#1e1f24'; g.beginPath(); g.ellipse(cx - 16, cy + 8 + by, 11, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx - 22, cy + 10 + by, 12, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#1e1f24'; for (const ex of [-31, -15]) { g.beginPath(); g.arc(cx + ex, cy - 14 + by, 5, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 23, cy - 6 + by, 11, 0, 7); g.fill();
      g.fillStyle = '#1e1f24'; for (const ex of [-27, -19]) { g.beginPath(); g.ellipse(cx + ex, cy - 7 + by, 3, 4, 0, 0, 7); g.fill(); }
      g.fillStyle = '#7cc458'; g.save(); g.translate(cx + 8, cy - 28); g.rotate(-0.3); g.beginPath(); g.ellipse(18, 0, 18, 5, 0, 0, 7); g.fill(); g.restore();
      break;
    }
    case 'bunny': {
      cloud(g, cx, cy + 34, 0.7);
      const jy = Math.abs(Math.sin(t * 3)) * 34;
      g.save(); g.translate(cx, cy + 26 - jy);
      g.fillStyle = '#fff'; for (const [ex, a] of [[-5, -0.2], [5, 0.2]] as const) { g.save(); g.translate(ex, -30); g.rotate(a); g.beginPath(); g.ellipse(0, -10, 4.5, 12, 0, 0, 7); g.fill(); g.fillStyle = '#ffb3c6'; g.beginPath(); g.ellipse(0, -10, 2.2, 8, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.restore(); }
      g.beginPath(); g.ellipse(0, -10, 13, 12, 0, 0, 7); g.fill(); g.beginPath(); g.arc(3, -26, 10, 0, 7); g.fill();
      eye(g, 6, -27, 2.8, 0.4); g.fillStyle = '#ff8aa8'; g.beginPath(); g.arc(12, -23, 2, 0, 7); g.fill();
      g.restore();
      g.save(); g.translate(cx + 40, cy - 30); g.rotate(0.4); g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(-5, -6); g.lineTo(5, -6); g.lineTo(0, 12); g.fill(); g.fillStyle = '#4f9a3a'; g.beginPath(); g.ellipse(0, -10, 2, 6, 0, 0, 7); g.fill(); g.restore();
      break;
    }
    case 'frog': {
      g.fillStyle = '#3a8fcc'; g.fillRect(cx - 64, cy - 40, 128, 80);
      g.fillStyle = '#8a5e34'; rr(g, cx - 58 + Math.sin(t) * 10, cy + 10, 70, 18, 9); g.fill();
      g.fillStyle = '#4f9e34'; g.beginPath(); g.moveTo(cx + 30, cy - 18); g.ellipse(cx + 30, cy - 18, 18, 13, 0, 0.35, Math.PI * 2 - 0.05); g.closePath(); g.fill();
      const jy = Math.abs(Math.sin(t * 3)) * 14;
      g.save(); g.translate(cx - 20, cy + 6 - jy);
      g.fillStyle = '#6fc048'; g.beginPath(); g.ellipse(0, 0, 13, 11, 0, 0, 7); g.fill(); for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 7, -10, 6, 0, 7); g.fill(); }
      eye(g, -7, -11, 4, 0, -0.3); eye(g, 7, -11, 4, 0, -0.3);
      g.strokeStyle = '#2a5a1a'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, -2, 5, 0.3, Math.PI - 0.3); g.stroke();
      g.restore();
      break;
    }
    case 'penguin': {
      g.fillStyle = '#eef5fd'; g.fillRect(cx - 64, cy - 50, 128, 100);
      for (const [x, y] of [[-40, -20], [40, 20]]) { g.fillStyle = '#1e4a2c'; g.beginPath(); g.moveTo(cx + x - 14, cy + y); g.lineTo(cx + x, cy + y - 26); g.lineTo(cx + x + 14, cy + y); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx + x - 6, cy + y - 14); g.lineTo(cx + x, cy + y - 26); g.lineTo(cx + x + 6, cy + y - 14); g.fill(); }
      const px = cx + Math.sin(t * 2) * 18;
      g.save(); g.translate(px, cy); g.rotate(Math.cos(t * 2) * 0.3);
      g.fillStyle = '#1d2230'; g.beginPath(); g.ellipse(0, 0, 13, 17, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 3, 8, 12, 0, 0, 7); g.fill();
      g.fillStyle = '#1d2230'; g.beginPath(); g.arc(0, -16, 9, 0, 7); g.fill(); eye(g, -3, -17, 2.2, 0, 0.5); eye(g, 3, -17, 2.2, 0, 0.5);
      g.fillStyle = '#f39a2e'; g.beginPath(); g.moveTo(-3, -12); g.lineTo(0, -7); g.lineTo(3, -12); g.fill();
      g.fillStyle = '#e03a3a'; rr(g, -8, -10, 16, 4, 2); g.fill();
      g.restore();
      break;
    }
  }
}

export const RUNNERS = [
  { id: 'dogrun', name: '狗狗快跑', sub: '跳篱笆、钻乌鸦、捡骨头', color: ['#ffcf7a', '#c98d3a'], make: dogrun },
  { id: 'panda', name: '熊猫爬竹', sub: '左右爬，别撞上竹枝', color: ['#a8dc78', '#3f8a35'], make: panda },
  { id: 'bunny', name: '兔子蹦蹦', sub: '踩着云朵往上蹦', color: ['#ffb3c6', '#d6305a'], make: bunny },
  { id: 'frog', name: '青蛙过河', sub: '踩着木头和荷叶过河', color: ['#7fd0ff', '#2f7a22'], make: frog },
  { id: 'penguin', name: '企鹅滑雪', sub: '穿旗门，躲松树和雪人', color: ['#cfe6ff', '#2f6fe0'], make: penguin },
] as const;
