/**
 * 书架上那台掌机里的游戏（用户要的）：一个主页菜单 + 十二个小游戏（贪吃蛇、小飞机在这里，另外十个在 minigames.ts）。
 * 纯 canvas 2D，不依赖 three.js，打开掌机时才按需加载（不占首屏）。low 档没有 3D，也能通过「游戏」按钮打开同一个界面玩。
 *
 * - 主页：4×3 的游戏卡片，十字键选、A 开始；点卡片直接开始。
 * - 贪吃蛇：方向键或屏幕上滑动、手柄十字键控制；吃一个苹果长一节、越来越快；撞墙或撞到自己就结束。
 * - 小飞机：横版，点一下（空格 / A）往上飞一下，不点就慢慢往下掉；躲开上下的管道一直往前飞，速度越来越快；
 *   左上角记飞了多少米，撞上管道或地面就结束。
 * 两个游戏的最好成绩记在 localStorage。HOME 键回主页。
 *
 * 画布的逻辑尺寸是 640×360（16:9），按设备像素比放大绘制。
 */
import { W, H, store, ctxA, beep, boom, rr, text, panel, type Game, type Key } from './kit';
import { MINI, drawMiniIcon } from './minigames';
export type { Key } from './kit';

// ---------------- 贪吃蛇 ----------------
function snake(): Game {
  const C = 20, CW = W / C, CH = (H - 40) / C, OY = 40; // 顶上 40 像素是分数栏
  type P = { x: number; y: number };
  let body: P[] = [], dir: P = { x: 1, y: 0 }, queue: P[] = [], food: P = { x: 0, y: 0 }, acc = 0, state: 'ready' | 'play' | 'over' = 'ready', score = 0, best = store.get('game.snake.best'), flash = 0, prev: P[] = [];
  const reset = () => {
    body = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]; prev = body.map((p) => ({ ...p }));
    dir = { x: 1, y: 0 }; queue = []; score = 0; acc = 0; place();
  };
  const place = () => {
    do { food = { x: Math.floor(Math.random() * CW), y: Math.floor(Math.random() * CH) }; } while (body.some((p) => p.x === food.x && p.y === food.y));
  };
  const speed = () => Math.min(15, 6.5 + score * 0.3); // 每秒走几格，吃得越多越快
  const turn = (d: P) => {
    if (state !== 'play') { if (state === 'ready') { state = 'play'; ctxA(); } else if (state === 'over') { reset(); state = 'play'; } return; }
    const last = queue[queue.length - 1] ?? dir;
    if (last.x === -d.x && last.y === -d.y) return; // 不能直接掉头
    if (last.x === d.x && last.y === d.y) return;
    if (queue.length < 2) queue.push(d);
  };
  const step = () => {
    if (queue.length) dir = queue.shift()!;
    prev = body.map((p) => ({ ...p }));
    const h = { x: body[0].x + dir.x, y: body[0].y + dir.y };
    if (h.x < 0 || h.y < 0 || h.x >= CW || h.y >= CH || body.slice(0, -1).some((p) => p.x === h.x && p.y === h.y)) {
      state = 'over'; flash = 1; beep(220, 60, 0.4, 'sawtooth', 0.08);
      if (score > best) { best = score; store.set('game.snake.best', best); }
      return;
    }
    body.unshift(h);
    if (h.x === food.x && h.y === food.y) { score++; place(); beep(660, 1320, 0.09, 'square', 0.05); prev.unshift({ ...prev[0] }); }
    else body.pop();
  };
  reset();
  return {
    update(dt) {
      flash = Math.max(0, flash - dt * 2);
      if (state !== 'play') return;
      acc += dt * speed();
      while (acc >= 1 && state === 'play') { acc -= 1; step(); }
    },
    draw(g, t) {
      // 场地：深浅两种绿的格子
      g.fillStyle = '#1f3a24'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { g.fillStyle = (x + y) % 2 ? '#a9d26a' : '#b4da74'; g.fillRect(x * C, OY + y * C, C, C); }
      // 苹果：一跳一跳的
      const fx = food.x * C + C / 2, fy = OY + food.y * C + C / 2 + Math.sin(t * 6) * 1.2;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(fx, OY + food.y * C + C - 2, 7, 2.5, 0, 0, 7); g.fill();
      const ag = g.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, 9); ag.addColorStop(0, '#ff8a7a'); ag.addColorStop(1, '#d2232a');
      g.fillStyle = ag; g.beginPath(); g.arc(fx, fy, 8, 0, 7); g.fill();
      g.strokeStyle = '#5a3a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy - 7); g.lineTo(fx + 1, fy - 11); g.stroke();
      g.fillStyle = '#3c9a3c'; g.beginPath(); g.ellipse(fx + 4, fy - 10, 4, 2, -0.5, 0, 7); g.fill();
      // 蛇：按上一步和这一步之间插值，走起来是连续滑动的
      const k = state === 'play' ? Math.min(1, acc) : 1;
      const pts = body.map((p, i) => { const q = prev[i] ?? p; return { x: (q.x + (p.x - q.x) * k) * C + C / 2, y: OY + (q.y + (p.y - q.y) * k) * C + C / 2 }; });
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = C - 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x + 2, p.y + 3) : g.moveTo(p.x + 2, p.y + 3))); g.stroke();
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i], s = i / Math.max(1, pts.length - 1);
        g.fillStyle = `hsl(${140 - s * 20}, ${62 - s * 10}%, ${38 + (i % 2) * 4 - s * 6}%)`;
        g.beginPath(); g.arc(p.x, p.y, C / 2 - 1 - s * 2.5, 0, 7); g.fill();
        if (i < pts.length - 1) { const q = pts[i + 1]; g.strokeStyle = g.fillStyle; g.lineWidth = C - 2 - s * 5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
      }
      // 头：两只眼睛朝前看
      const hd = pts[0], d = queue[0] && state === 'play' ? dir : dir;
      for (const side of [-1, 1]) {
        const ex = hd.x + d.x * 4 - d.y * side * 5, ey = hd.y + d.y * 4 + d.x * side * 5;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, 3.6, 0, 7); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(ex + d.x * 1.3, ey + d.y * 1.3, 1.9, 0, 7); g.fill();
      }
      if (state === 'over' && Math.sin(t * 20) > 0) { g.fillStyle = 'rgba(255,60,60,.25)'; g.beginPath(); g.arc(hd.x, hd.y, C, 0, 7); g.fill(); }
      // 分数栏
      g.fillStyle = '#1f3a24'; g.fillRect(0, 0, W, OY);
      text(g, '贪吃蛇', 16, 20, 18, '#e8f5d0', 'left', 700);
      text(g, `🍎 ${score}`, W / 2, 20, 18, '#fff', 'center', 700);
      text(g, `最高 ${best}`, W - 16, 20, 15, '#cfe6b0', 'right', 500);
      if (flash) { g.fillStyle = `rgba(255,255,255,${flash * 0.5})`; g.fillRect(0, 0, W, H); }
      if (state === 'ready') {
        g.fillStyle = 'rgba(10,30,14,.45)'; g.fillRect(0, OY, W, H - OY);
        text(g, '贪吃蛇', W / 2, H / 2 - 30, 34, '#fff', 'center', 800);
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        text(g, '方向键 / 十字键 / 在屏幕上滑动 开始', W / 2, H / 2 + 18, 16, '#fff', 'center', 500);
        g.globalAlpha = 1;
      }
      if (state === 'over') panel(g, [['撞到了！', 26, '#c0392b'], [`吃了 ${score} 个苹果`, 18], [`最高 ${best}`, 15, '#6a7385']], t);
    },
    key(k) {
      if (k === 'up') turn({ x: 0, y: -1 }); else if (k === 'down') turn({ x: 0, y: 1 }); else if (k === 'left') turn({ x: -1, y: 0 }); else if (k === 'right') turn({ x: 1, y: 0 });
      else if (k === 'a' && state !== 'play') turn(dir);
    },
    tap() { if (state !== 'play') turn(dir); },
    swipe(dx, dy) { if (Math.abs(dx) > Math.abs(dy)) turn({ x: Math.sign(dx), y: 0 }); else turn({ x: 0, y: Math.sign(dy) }); },
  };
}

// ---------------- 小飞机 ----------------
function plane(): Game {
  const GROUND = H - 34, PX = 150, PPM = 32; // 32 像素算 1 米
  type Pipe = { x: number; gap: number; h: number; passed: boolean };
  type Puff = { x: number; y: number; r: number; life: number; vx: number; vy: number; c: string };
  let y = H / 2, vy = 0, speed = 0, dist = 0, pipes: Pipe[] = [], puffs: Puff[] = [], state: 'ready' | 'play' | 'over' = 'ready', best = store.get('game.plane.best'), shake = 0, scroll = 0, overT = 0, nextGap = 0;
  const clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 110 + Math.random() * 60, y: 30 + Math.random() * 110, s: 0.6 + Math.random() * 0.7 }));
  const reset = () => { y = H / 2 - 20; vy = 0; speed = 150; dist = 0; pipes = []; puffs = []; nextGap = 360; overT = 0; };
  const flap = () => {
    if (state === 'ready') { state = 'play'; ctxA(); }
    if (state === 'over') { if (overT > 0.5) { reset(); state = 'ready'; } return; }
    vy = -290; beep(380, 760, 0.12, 'triangle', 0.05);
    for (let i = 0; i < 3; i++) puffs.push({ x: PX - 22, y: y + 4, r: 4 + Math.random() * 3, life: 1, vx: -40 - Math.random() * 40, vy: (Math.random() - 0.5) * 30, c: '255,255,255' });
  };
  const crash = () => {
    state = 'over'; shake = 1; boom(); overT = 0;
    const m = Math.floor(dist); if (m > best) { best = m; store.set('game.plane.best', best); }
    for (let i = 0; i < 26; i++) { const a = Math.random() * 7, s = 60 + Math.random() * 220; puffs.push({ x: PX, y, r: 3 + Math.random() * 7, life: 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: i % 3 ? '255,150,40' : '90,90,90' }); }
  };
  reset();
  return {
    update(dt) {
      dt = Math.min(dt, 1 / 30);
      overT += dt; shake = Math.max(0, shake - dt * 2.5);
      for (const p of puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4; p.r += dt * 10; }
      puffs = puffs.filter((p) => p.life > 0);
      if (state === 'ready') { y = H / 2 - 20 + Math.sin(performance.now() / 300) * 8; scroll += 60 * dt; return; }
      if (state === 'over') { if (y < GROUND - 10) { vy += 900 * dt; y = Math.min(GROUND - 10, y + vy * dt); } return; }
      speed = Math.min(380, speed + 5 * dt);      // 越飞越快
      const dx = speed * dt; scroll += dx; dist += dx / PPM;
      vy = Math.min(420, vy + 820 * dt); y += vy * dt;
      if (y < 14) { y = 14; vy = Math.max(0, vy); }
      if (Math.random() < dt * 14) puffs.push({ x: PX - 24, y: y + 3, r: 2.5, life: 0.6, vx: -speed * 0.6, vy: (Math.random() - 0.5) * 10, c: '255,255,255' });
      // 管道：间距和缺口都随速度收紧一点
      nextGap -= dx;
      if (nextGap <= 0) {
        const gap = Math.max(112, 150 - (speed - 150) * 0.12);
        pipes.push({ x: W + 40, gap, h: 50 + Math.random() * (GROUND - 100 - gap), passed: false });
        nextGap = Math.max(200, 270 - (speed - 150) * 0.2);
      }
      for (const p of pipes) {
        p.x -= dx;
        if (!p.passed && p.x + 32 < PX) { p.passed = true; beep(880, 990, 0.05, 'square', 0.025); }
        // 碰撞：飞机按一个椭圆近似（半宽 22、半高 9）
        if (PX + 20 > p.x - 32 && PX - 20 < p.x + 32 && (y - 8 < p.h || y + 8 > p.h + p.gap)) crash();
      }
      pipes = pipes.filter((p) => p.x > -80);
      if (y + 10 >= GROUND) { y = GROUND - 10; crash(); }
    },
    draw(g, t) {
      g.save();
      if (shake) g.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 12 * shake);
      // 天空：清晨的渐变 + 太阳
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#6fb6e8'); sky.addColorStop(0.65, '#bfe3f2'); sky.addColorStop(1, '#f6e2b8');
      g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
      const sun = g.createRadialGradient(520, 80, 4, 520, 80, 70); sun.addColorStop(0, 'rgba(255,250,220,1)'); sun.addColorStop(0.25, 'rgba(255,236,170,.9)'); sun.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = sun; g.fillRect(420, -20, 220, 200);
      // 云：慢一点的视差
      for (const c of clouds) {
        const x = ((c.x - scroll * 0.15 * c.s) % (W + 200) + W + 200) % (W + 200) - 100;
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (const [ox, oy, r] of [[0, 0, 18], [18, -8, 22], [40, 0, 17], [20, 6, 18]]) { g.beginPath(); g.arc(x + ox * c.s, c.y + oy * c.s, r * c.s, 0, 7); g.fill(); }
      }
      // 远山、近山两层视差
      for (const [k, col, base, amp] of [[0.25, '#8fb3a6', GROUND - 70, 38], [0.5, '#6f9a6c', GROUND - 30, 26]] as const) {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, GROUND);
        for (let x = 0; x <= W; x += 16) { const u = (x + scroll * k) / 90; g.lineTo(x, base - Math.abs(Math.sin(u)) * amp - Math.sin(u * 2.3) * amp * 0.25); }
        g.lineTo(W, GROUND); g.fill();
      }
      // 管道：带口沿和明暗的金属管
      for (const p of pipes) {
        for (const [top, y0, y1] of [[true, -10, p.h], [false, p.h + p.gap, GROUND]] as const) {
          const pg = g.createLinearGradient(p.x - 28, 0, p.x + 28, 0);
          pg.addColorStop(0, '#2f6f63'); pg.addColorStop(0.35, '#7fd0b9'); pg.addColorStop(0.55, '#4fa894'); pg.addColorStop(1, '#245a50');
          g.fillStyle = pg; g.fillRect(p.x - 26, y0, 52, y1 - y0);
          const lipY = top ? y1 - 18 : y0;
          g.fillRect(p.x - 32, lipY, 64, 18);
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(p.x - 32, lipY, 64, 18); g.strokeRect(p.x - 26, y0, 52, y1 - y0);
          g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(p.x - 18, y0, 5, y1 - y0);
        }
      }
      // 地面：草皮 + 移动的土块
      g.fillStyle = '#7bbf4e'; g.fillRect(-20, GROUND, W + 40, 8);
      g.fillStyle = '#c9a46a'; g.fillRect(-20, GROUND + 8, W + 40, H - GROUND);
      g.fillStyle = '#b48c55'; for (let x = -((scroll) % 40); x < W; x += 40) g.fillRect(x, GROUND + 16, 20, 4);
      // 拖出来的烟
      for (const p of puffs) { g.fillStyle = `rgba(${p.c},${Math.max(0, p.life) * 0.7})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      // 飞机：红色的螺旋桨小飞机，机头随速度上扬或下栽
      if (!(state === 'over' && overT > 0.05 && Math.floor(overT * 12) % 2 && overT < 0.6)) {
        g.save(); g.translate(PX, y); g.rotate(Math.max(-0.45, Math.min(0.9, vy / 600)));
        g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(2, 12, 18, 3, 0, 0, 7); g.fill();
        g.fillStyle = '#b02a24'; g.beginPath(); g.moveTo(-26, -2); g.lineTo(-34, -14); g.lineTo(-27, -14); g.lineTo(-18, -4); g.fill();   // 尾翼
        const bodyG = g.createLinearGradient(0, -9, 0, 9); bodyG.addColorStop(0, '#ff6a55'); bodyG.addColorStop(1, '#c4302a');
        g.fillStyle = bodyG; g.beginPath(); g.ellipse(-2, 0, 26, 8.5, 0, 0, 7); g.fill();                                            // 机身
        g.fillStyle = '#f2f2f2'; g.fillRect(-24, -1.5, 40, 3);                                                                       // 白色腰线
        g.fillStyle = '#9fd6ff'; g.beginPath(); g.ellipse(2, -7, 8, 5, 0, Math.PI, 0); g.fill();                                     // 座舱
        g.fillStyle = '#8f1f1a'; rr(g, -10, 1, 22, 6, 3); g.fill();                                                                   // 下翼
        g.fillStyle = '#d9d9d9'; g.beginPath(); g.arc(24, 0, 4, 0, 7); g.fill();                                                    // 桨毂
        const pr = Math.abs(Math.sin(t * 60)) * 13 + 3;
        g.fillStyle = 'rgba(60,60,60,.55)'; g.beginPath(); g.ellipse(27, 0, 2, pr, 0, 0, 7); g.fill();                              // 转动的螺旋桨
        g.restore();
      }
      g.restore();
      // 里程
      rr(g, 12, 10, 150, 34, 17); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
      text(g, `${Math.floor(dist)} 米`, 87, 27, 19, '#fff', 'center', 800);
      text(g, `最远 ${best} 米`, W - 16, 27, 15, '#18324a', 'right', 600);
      if (state === 'play') text(g, `${Math.round(speed / PPM * 3.6)} km/h`, W - 16, 48, 12, '#18324acc', 'right', 500);
      if (state === 'ready') {
        text(g, '小飞机', W / 2, H / 2 - 70, 34, '#fff', 'center', 800, 'rgba(24,50,74,.55)');
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        text(g, '点一下（空格 / A）往上飞，躲开管道', W / 2, H / 2 + 60, 16, '#fff', 'center', 700, 'rgba(24,50,74,.7)');
        g.globalAlpha = 1;
      }
      if (state === 'over' && overT > 0.5) panel(g, [['坠毁！', 26, '#c0392b'], [`飞了 ${Math.floor(dist)} 米`, 18], [`最远 ${best} 米`, 15, '#6a7385']], t);
    },
    key(k) { if (k === 'a' || k === 'up') flap(); },
    tap() { flap(); },
  };
}

// ---------------- 主页 ----------------
const GAMES: { id: string; name: string; sub: string; color: readonly string[]; make: () => Game }[] = [
  { id: 'snake', name: '贪吃蛇', sub: '吃苹果，越长越快', color: ['#4caf50', '#1b6b3a'], make: snake },
  { id: 'plane', name: '小飞机', sub: '点一下飞一下，看能飞多远', color: ['#46a6f0', '#1c5fa8'], make: plane },
  ...MINI,
];
const COLS = 4, CW = 138, CH = 74, GX = 12, GY = 10, GX0 = (W - (COLS * CW + (COLS - 1) * GX)) / 2, GY0 = 52;
const cardAt = (i: number) => ({ x: GX0 + (i % COLS) * (CW + GX), y: GY0 + Math.floor(i / COLS) * (CH + GY) });

function drawIcon(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, t: number) {
  if (id !== 'snake' && id !== 'plane') { drawMiniIcon(g, id, cx, cy, t); return; }
  if (id === 'snake') {
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#d8f5b0'; g.lineWidth = 16;
    g.beginPath(); for (let i = 0; i <= 20; i++) { const x = cx - 50 + i * 5, y = cy + Math.sin(i * 0.45 + t * 3) * 12; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const hy = cy + Math.sin(20 * 0.45 + t * 3) * 12;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + 52, hy - 3, 3.5, 0, 7); g.fill(); g.fillStyle = '#123'; g.beginPath(); g.arc(cx + 53, hy - 3, 1.8, 0, 7); g.fill();
    g.fillStyle = '#ff5a4f'; g.beginPath(); g.arc(cx + 80, cy - 18, 8, 0, 7); g.fill();
  } else {
    g.fillStyle = 'rgba(255,255,255,.85)'; for (const [x, y, r] of [[-50, -20, 12], [-36, -26, 15], [-22, -20, 11], [40, 22, 10], [52, 17, 13]]) { g.beginPath(); g.arc(cx + x, cy + y, r, 0, 7); g.fill(); }
    g.save(); g.translate(cx, cy + Math.sin(t * 3) * 5); g.rotate(-0.15);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 34, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#e8463c'; g.beginPath(); g.moveTo(-30, -2); g.lineTo(-40, -18); g.lineTo(-30, -18); g.lineTo(-20, -5); g.fill();
    g.fillStyle = '#e8463c'; g.fillRect(-12, 2, 26, 7);
    g.fillStyle = '#9fd6ff'; g.beginPath(); g.ellipse(4, -8, 9, 6, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(60,60,60,.5)'; g.beginPath(); g.ellipse(37, 0, 2, Math.abs(Math.sin(t * 40)) * 14 + 3, 0, 0, 7); g.fill();
    g.restore();
  }
}

/** 掌机的主页画面（3D 模型的屏幕贴图也用它画一帧） */
export function drawHome(g: CanvasRenderingContext2D, sel: number, t: number) {
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#f4f5f7'); bg.addColorStop(1, '#e3e6eb');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 顶栏：头像、时间、电量
  g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(30, 28, 13, 0, 7); g.fill();
  text(g, '🙂', 30, 29, 14);
  const d = new Date();
  text(g, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, W - 70, 28, 16, '#2b2f38', 'right', 600);
  g.strokeStyle = '#2b2f38'; g.lineWidth = 1.5; rr(g, W - 58, 20, 28, 15, 3); g.stroke(); g.fillStyle = '#2b2f38'; g.fillRect(W - 29, 24, 3, 7); g.fillStyle = '#3bb54a'; g.fillRect(W - 55, 23, 20, 9);
  // 4×3 的游戏卡片：渐变底、缩小的动画图标、名字；选中的那张往上浮一点、描一圈亮边
  GAMES.forEach((game, i) => {
    const { x, y } = cardAt(i), on = i === sel, lift = on ? 3 + Math.sin(t * 4) : 0;
    g.save(); g.translate(0, -lift);
    g.fillStyle = 'rgba(0,0,0,.12)'; rr(g, x + 2, y + 4 + lift, CW, CH, 11); g.fill();
    const cg = g.createLinearGradient(x, y, x + CW, y + CH); cg.addColorStop(0, game.color[0]); cg.addColorStop(1, game.color[1]);
    g.fillStyle = cg; rr(g, x, y, CW, CH, 11); g.fill();
    g.save(); rr(g, x, y, CW, CH, 11); g.clip(); g.translate(x + CW / 2, y + 29); g.scale(0.4, 0.4); drawIcon(g, game.id, 0, 0, t); g.restore();
    text(g, game.name, x + CW / 2, y + CH - 13, 15, '#fff', 'center', 800, 'rgba(0,0,0,.25)');
    if (on) { g.strokeStyle = '#2fd5ff'; g.lineWidth = 3.5; rr(g, x - 4, y - 4, CW + 8, CH + 8, 14); g.stroke(); }
    g.restore();
  });
  text(g, GAMES[sel].sub, W / 2, 316, 15, '#2b2f38', 'center', 600);
  text(g, '十字键选择 · A 或点卡片开始 · HOME 回到这里', W / 2, 341, 12, '#7a808c', 'center', 500);
}

/** 掌机：管理主页 / 游戏切换、输入和绘制循环 */
export function createHandheld(canvas: HTMLCanvasElement) {
  const g = canvas.getContext('2d')!;
  let sel = 0, game: Game | null = null, raf = 0, last = 0, t = 0;
  const fit = () => {
    const r = Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, canvas.clientWidth / W));
    const w = Math.round(W * r), h = Math.round(H * r);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  };
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    fit();
    if (game) { game.update(dt); game.draw(g, t); } else drawHome(g, sel, t);
    raf = requestAnimationFrame(loop);
  };
  const startGame = (i: number) => { sel = i; ctxA(); beep(520, 1040, 0.1, 'triangle', 0.05); game = GAMES[i].make(); };
  const toLocal = (e: { clientX: number; clientY: number }) => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; };
  let down: { x: number; y: number; id: number } | null = null, swiped = false;
  const onDown = (e: PointerEvent) => {
    e.preventDefault(); const p = toLocal(e); down = { ...p, id: e.pointerId }; swiped = false;
    if (game && !game.swipe) game.tap(p.x, p.y); // 小飞机：按下就飞，不等抬起
    game?.point?.(p.x, p.y);
  };
  const onMove = (e: PointerEvent) => {
    if (game?.point && (!down || down.id === e.pointerId)) { const p = toLocal(e); game.point(p.x, p.y); } // 挡板、篮子跟着手指 / 鼠标走
    if (!down || down.id !== e.pointerId || !game?.swipe || swiped) return;
    const p = toLocal(e), dx = p.x - down.x, dy = p.y - down.y;
    if (Math.hypot(dx, dy) > 24) { game.swipe(dx, dy); swiped = true; }
  };
  const onUp = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const p = toLocal(e); down = null;
    if (!game) { // 主页：点哪张卡片开哪个
      const i = GAMES.findIndex((_, j) => { const c = cardAt(j); return p.x >= c.x && p.x <= c.x + CW && p.y >= c.y && p.y <= c.y + CH; });
      if (i >= 0) startGame(i);
      return;
    }
    if (game.swipe && !swiped) game.tap(p.x, p.y);
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  return {
    start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } },
    /** 暂停（掌机放下时）：停掉绘制循环，游戏状态留着 */
    stop() { cancelAnimationFrame(raf); raf = 0; },
    key(k: Key) {
      ctxA();
      if (k === 'home') { if (game) { game = null; beep(500, 300, 0.08, 'triangle', 0.04); } return; }
      if (!game) {
        const n = GAMES.length, prev = sel;
        if (k === 'left') sel = (sel + n - 1) % n; else if (k === 'right') sel = (sel + 1) % n;
        else if (k === 'up' && sel >= COLS) sel -= COLS; else if (k === 'down' && sel + COLS < n) sel += COLS;
        if (sel !== prev) beep(700, 700, 0.04, 'square', 0.03);
        else if (k === 'a') startGame(sel);
        return;
      }
      if (k === 'b' && game) { game = null; return; }
      game.key(k);
    },
    destroy() { this.stop(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); },
  };
}
