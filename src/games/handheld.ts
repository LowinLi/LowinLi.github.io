/**
 * 书架上那台掌机里的游戏（用户要的）：一个主页菜单 + 十二个小游戏（贪吃蛇、小飞机在这里，另外十个在 minigames.ts）。
 * 纯 canvas 2D，不依赖 three.js，打开掌机时才按需加载（不占首屏）。low 档没有 3D，也能通过「游戏」按钮打开同一个界面玩。
 *
 * - 主页：照着真实掌机的 HOME 菜单排（用户要的「和真实的 switch 尽可能对齐」）：浅灰底；左上用户头像，右上时间、Wi‑Fi、电量；
 *   中间一排横着滚动的正方形游戏图块，选中的那块描一圈闪动的青色框、标题用青色字写在图块上方；下面一排圆形功能按钮
 *  （成绩、声音、操作说明、休眠），选中时上方出名字；最底下一条细线，左边手柄图标，右边「Ⓐ 开始」。没有用任何商标和官方图标。
 *   左右键在一排里挪，上下键在图块和圆按钮之间切换，A 确定；点图块直接开始。
 * - 贪吃蛇：方向键或屏幕上滑动、手柄十字键控制；吃一个苹果长一节、越来越快；撞墙或撞到自己就结束。
 * - 小飞机：横版，点一下（空格 / A）往上飞一下，不点就慢慢往下掉；躲开上下的管道一直往前飞，速度越来越快；
 *   左上角记飞了多少米，撞上管道或地面就结束。
 * 两个游戏的最好成绩记在 localStorage。HOME 键回主页。
 *
 * 画布的逻辑尺寸是 640×360（16:9），按设备像素比放大绘制。
 */
import { W, H, store, ctxA, beep, boom, rr, text, panel, music, sfx, audioPrefs, type Game, type Key } from './kit';
import { MINI, drawMiniIcon } from './minigames';
import { fishGame, drawFishIcon } from './fish';
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
    state: () => state,
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
    state: () => state,
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
  { id: 'fish', name: '鱼吃鱼', sub: '吃小鱼长大，躲开大鱼和鲨鱼', color: ['#29b6f6', '#01579b'], make: fishGame },
  { id: 'snake', name: '贪吃蛇', sub: '吃苹果，越长越快', color: ['#4caf50', '#1b6b3a'], make: snake },
  { id: 'plane', name: '小飞机', sub: '点一下飞一下，看能飞多远', color: ['#46a6f0', '#1c5fa8'], make: plane },
  ...MINI,
];
/** 每个游戏放哪首背景音乐（反应力、节奏黑块不放：一个要安静，一个自己就是曲子） */
const BGM: Record<string, string | null> = { fish: 'chill', snake: 'bright', plane: 'chill', mole: 'bright', catch: 'bright', bricks: 'drive', runner: 'drive', reaction: null, memory: 'think', merge: 'think', stack: 'chill', pong: 'drive', tiles: null };
// 主页版式（640×360，真机 1280×720 的一半）：图块 128 见方、间隔 7，第一块离左边 46；圆按钮直径 40、间隔 58
const TS = 128, TG = 7, TX0 = 46, TY = 92, BY = 272, BR = 20, BGAP = 58;
const BTNS = [
  { id: 'records', name: '成绩', color: '#2c8ff0' },
  { id: 'sound', name: '声音', color: '#f2793b' },
  { id: 'help', name: '操作说明', color: '#7a7f88' },
  { id: 'sleep', name: '休眠', color: '#7a7f88' },
] as const;
/** 主页的状态（3D 掌机屏幕上画的那一帧也用它，默认值就是刚开机的样子） */
const HS = { row: 0 as 0 | 1, btn: 0, scroll: 0, page: null as null | 'records' | 'help' };
const tileX = (i: number) => TX0 + i * (TS + TG) - HS.scroll;
const btnX = (i: number) => W / 2 + (i - (BTNS.length - 1) / 2) * BGAP;
const BEST_FMT: Record<string, (v: number) => string> = {
  fish: (v) => `${v} 分`, snake: (v) => `${v} 个苹果`, plane: (v) => `${v} 米`, mole: (v) => `${v} 分`, catch: (v) => `${v} 分`, bricks: (v) => `${v} 分`, runner: (v) => `${v} 米`,
  reaction: (v) => (v ? `${v} 毫秒` : '—'), memory: (v) => (v ? `${v} 次` : '—'), merge: (v) => `${v} 分`, stack: (v) => `${v} 层`, pong: (v) => `赢 ${v} 局`, tiles: (v) => `${v} 块`,
};

function drawIcon(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, t: number) {
  if (id === 'fish') { drawFishIcon(g, cx, cy, t); return; }
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
  g.fillStyle = '#ebebeb'; g.fillRect(0, 0, W, H);
  // ---- 顶栏：左上用户头像（圆形、白边），右上时间、Wi-Fi、电量 ----
  g.save(); g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(34, 32, 17, 0, 7); g.fill(); g.restore();
  const av = g.createLinearGradient(20, 18, 48, 46); av.addColorStop(0, '#ffb15c'); av.addColorStop(1, '#f07a2c'); g.fillStyle = av; g.beginPath(); g.arc(34, 32, 15, 0, 7); g.fill();
  g.fillStyle = '#fff3e4'; g.beginPath(); g.moveTo(25, 28); g.lineTo(27, 19); g.lineTo(31, 25); g.fill(); g.beginPath(); g.moveTo(37, 25); g.lineTo(41, 19); g.lineTo(43, 28); g.fill(); // 一只橘猫头像的耳朵
  g.fillStyle = '#5a3416'; g.beginPath(); g.arc(30, 32, 1.8, 0, 7); g.arc(38, 32, 1.8, 0, 7); g.fill(); g.fillStyle = '#ff9fb0'; g.beginPath(); g.arc(34, 36, 1.6, 0, 7); g.fill();
  const d = new Date();
  text(g, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, W - 92, 32, 15, '#3c3c3c', 'right', 500);
  g.strokeStyle = '#3c3c3c'; g.lineWidth = 1.8; g.lineCap = 'round';
  for (const r of [4, 8, 12]) { g.beginPath(); g.arc(W - 74, 38, r, -Math.PI * 0.75, -Math.PI * 0.25); g.stroke(); }
  g.fillStyle = '#3c3c3c'; g.beginPath(); g.arc(W - 74, 38, 1.6, 0, 7); g.fill();
  g.lineWidth = 1.4; rr(g, W - 56, 26, 24, 12, 2.5); g.stroke(); g.fillRect(W - 31, 29.5, 2, 5); g.fillRect(W - 54, 28, 20, 8);
  // ---- 图块上方：选中的游戏名（青色）----
  const on0 = HS.row === 0 && !HS.page;
  const sx = tileX(sel);
  if (on0) text(g, GAMES[sel].name, clamp2(sx + TS / 2, 60, W - 60), TY - 15, 15, '#00a2d8', 'center', 600);
  // ---- 一排正方形游戏图块（横着滚动）----
  GAMES.forEach((game, i) => {
    const x = tileX(i); if (x > W + 10 || x + TS < -10) return;
    g.save(); g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.fillStyle = '#fff'; g.fillRect(x, TY, TS, TS); g.restore();
    g.save(); g.beginPath(); g.rect(x, TY, TS, TS); g.clip();
    const cg = g.createLinearGradient(x, TY, x + TS, TY + TS); cg.addColorStop(0, game.color[0]); cg.addColorStop(1, game.color[1]); g.fillStyle = cg; g.fillRect(x, TY, TS, TS);
    const hl = g.createRadialGradient(x + TS * 0.3, TY + TS * 0.2, 4, x + TS * 0.3, TY + TS * 0.2, TS * 0.9); hl.addColorStop(0, 'rgba(255,255,255,.28)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, TY, TS, TS);
    g.translate(x + TS / 2, TY + 54); g.scale(0.72, 0.72); drawIcon(g, game.id, 0, 0, i === sel ? t : 0); g.restore();
    text(g, game.name, x + TS / 2, TY + TS - 18, 17, '#fff', 'center', 900, 'rgba(0,0,0,.28)'); // 封面上的「游戏标志」
  });
  if (on0) { // 选中框：离图块 3 像素，一圈青色，亮度一闪一闪
    const k = 0.5 + 0.5 * Math.sin(t * 5);
    g.strokeStyle = `rgb(${Math.round(0 + 90 * k)},${Math.round(195 + 45 * k)},${Math.round(227 + 28 * k)})`; g.lineWidth = 3.5;
    g.strokeRect(sx - 4, TY - 4, TS + 8, TS + 8);
  }
  // ---- 圆形功能按钮 ----
  BTNS.forEach((b, i) => {
    const x = btnX(i), on = HS.row === 1 && HS.btn === i && !HS.page;
    g.save(); g.shadowColor = 'rgba(0,0,0,.16)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, BY, BR, 0, 7); g.fill(); g.restore();
    drawBtnIcon(g, b.id, x, BY, b.color);
    if (on) {
      const k = 0.5 + 0.5 * Math.sin(t * 5);
      g.strokeStyle = `rgb(${Math.round(90 * k)},${Math.round(195 + 45 * k)},${Math.round(227 + 28 * k)})`; g.lineWidth = 3; g.beginPath(); g.arc(x, BY, BR + 4, 0, 7); g.stroke();
      text(g, b.id === 'sound' ? (audioPrefs.muted ? '声音：关' : '声音：开') : b.name, x, BY - BR - 16, 13, '#00a2d8', 'center', 600);
    }
  });
  // ---- 底栏：细线、左边手柄、右边按键提示 ----
  g.fillStyle = '#c9c9c9'; g.fillRect(24, 318, W - 48, 1);
  g.fillStyle = '#4a4a4a'; rr(g, 34, 330, 9, 20, 4.5); g.fill(); rr(g, 46, 330, 9, 20, 4.5); g.fill(); // 一对手柄的剪影
  g.fillStyle = '#ebebeb'; g.beginPath(); g.arc(38.5, 336, 1.8, 0, 7); g.arc(50.5, 344, 1.8, 0, 7); g.fill();
  g.fillStyle = '#3c3c3c'; g.beginPath(); g.arc(W - 86, 340, 9, 0, 7); g.fill(); text(g, 'A', W - 86, 340.5, 11, '#ebebeb', 'center', 800);
  text(g, HS.row === 0 ? '开始' : '确定', W - 72, 340, 13, '#3c3c3c', 'left', 500);
  // ---- 「成绩」「操作说明」两个小页面 ----
  if (HS.page) {
    g.fillStyle = '#ebebeb'; g.fillRect(0, 0, W, H);
    text(g, HS.page === 'records' ? '成绩' : '操作说明', 40, 34, 20, '#3c3c3c', 'left', 700);
    g.fillStyle = '#c9c9c9'; g.fillRect(24, 54, W - 48, 1);
    if (HS.page === 'records') {
      GAMES.forEach((game, i) => {
        const col = i % 2, row = Math.floor(i / 2), x = 40 + col * 290, y = 78 + row * 38;
        g.fillStyle = game.color[0]; rr(g, x, y - 12, 24, 24, 5); g.fill();
        text(g, game.name, x + 34, y, 14, '#3c3c3c', 'left', 600);
        const key = `game.${game.id}.best`, v = store.get(key);
        text(g, BEST_FMT[game.id]?.(v) ?? String(v), x + 262, y, 14, v ? '#00a2d8' : '#9a9a9a', 'right', 700);
        g.fillStyle = '#dadada'; g.fillRect(x, y + 17, 262, 1);
      });
    } else {
      [['十字键 / 方向键 / WASD', '移动、选择'], ['A / 空格 / 回车 / J', '确定、跳、发球、翻牌'], ['B / X / 退格', '从游戏退回主页'], ['HOME / H', '回到主页'], ['ESC / 「放下」', '把掌机放回书架上'], ['直接点、拖屏幕', '所有游戏都能用手指玩']].forEach(([k, v], i) => {
        const y = 86 + i * 38; text(g, k, 48, y, 15, '#3c3c3c', 'left', 700); text(g, v, W - 48, y, 15, '#5a5a5a', 'right', 500); g.fillStyle = '#dadada'; g.fillRect(40, y + 18, W - 80, 1);
      });
    }
    g.fillStyle = '#3c3c3c'; g.beginPath(); g.arc(W - 86, 340, 9, 0, 7); g.fill(); text(g, 'B', W - 86, 340.5, 11, '#ebebeb', 'center', 800); text(g, '返回', W - 72, 340, 13, '#3c3c3c', 'left', 500);
  }
}
const clamp2 = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 圆形功能按钮上的小图标 */
function drawBtnIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, c: string) {
  g.save(); g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  if (id === 'records') { // 奖杯
    g.beginPath(); g.moveTo(x - 7, y - 8); g.lineTo(x + 7, y - 8); g.lineTo(x + 6, y - 1); g.quadraticCurveTo(x, y + 4, x - 6, y - 1); g.closePath(); g.fill();
    g.beginPath(); g.arc(x - 8, y - 4, 3.5, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(x + 8, y - 4, 3.5, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
    g.fillRect(x - 1.2, y + 2, 2.4, 4); rr(g, x - 5, y + 6, 10, 3, 1); g.fill();
  } else if (id === 'sound') { // 喇叭，静音时打叉
    g.beginPath(); g.moveTo(x - 9, y - 3.5); g.lineTo(x - 5, y - 3.5); g.lineTo(x, y - 8); g.lineTo(x, y + 8); g.lineTo(x - 5, y + 3.5); g.lineTo(x - 9, y + 3.5); g.closePath(); g.fill();
    if (audioPrefs.muted) { g.beginPath(); g.moveTo(x + 4, y - 4); g.lineTo(x + 10, y + 4); g.moveTo(x + 10, y - 4); g.lineTo(x + 4, y + 4); g.stroke(); }
    else { g.beginPath(); g.arc(x + 1, y, 5, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(x + 1, y, 9, -0.8, 0.8); g.stroke(); }
  } else if (id === 'help') { // 一对手柄
    rr(g, x - 10, y - 8, 8, 16, 4); g.fill(); rr(g, x + 2, y - 8, 8, 16, 4); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 6, y - 3, 1.6, 0, 7); g.arc(x + 6, y + 3, 1.6, 0, 7); g.fill();
  } else { // 电源
    g.beginPath(); g.arc(x, y + 1, 7.5, -Math.PI * 0.32, Math.PI * 1.32); g.stroke(); g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, y - 1); g.stroke();
  }
  g.restore();
}

/** 掌机：管理主页 / 游戏切换、输入和绘制循环 */
export function createHandheld(canvas: HTMLCanvasElement, opts: { onSleep?: () => void } = {}) {
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
    if (game) { game.update(dt); game.draw(g, t); }
    else { // 让选中的图块留在画面里：左右各留 46 像素
      const n = GAMES.length, maxScroll = Math.max(0, TX0 * 2 + n * (TS + TG) - TG - W);
      const want = clamp2(HS.scroll, sel * (TS + TG) + TS + TX0 - (W - TX0), sel * (TS + TG));
      HS.scroll += (clamp2(want, 0, maxScroll) - HS.scroll) * Math.min(1, dt * 12);
      drawHome(g, sel, t);
    }
    music.play(game && game.state?.() === 'play' ? BGM[GAMES[sel].id] ?? null : null); // 只在玩的时候放背景音乐
    raf = requestAnimationFrame(loop);
  };
  const startGame = (i: number) => { sel = i; ctxA(); sfx.start(); game = GAMES[i].make(); };
  const toLocal = (e: { clientX: number; clientY: number }) => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; };
  let down: { x: number; y: number; id: number } | null = null, swiped = false, pdown: { x: number; y: number } | null = null;
  const pressBtn = () => {
    const b = BTNS[HS.btn].id; ctxA();
    if (b === 'records' || b === 'help') { HS.page = b; sfx.pop(); }
    else if (b === 'sound') { audioPrefs.toggle(); if (!audioPrefs.muted) sfx.coin(); }
    else { sfx.tick(); opts.onSleep?.(); }
  };
  const onDown = (e: PointerEvent) => {
    e.preventDefault(); const p = toLocal(e); down = { ...p, id: e.pointerId }; pdown = { ...p }; swiped = false;
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
    if (!game) { // 主页：横着划一下翻几块；点图块直接开始；点圆按钮就按
      if (HS.page) { HS.page = null; sfx.tick(); return; }
      const dx = p.x - (pdown?.x ?? p.x);
      if (Math.abs(dx) > 30) { sel = clamp2(sel + (dx < 0 ? 3 : -3), 0, GAMES.length - 1); HS.row = 0; sfx.tick(); return; }
      const i = GAMES.findIndex((_, j) => { const x = tileX(j); return p.x >= x && p.x <= x + TS && p.y >= TY && p.y <= TY + TS; });
      if (i >= 0) { HS.row = 0; startGame(i); return; }
      const bi = BTNS.findIndex((_, j) => Math.hypot(p.x - btnX(j), p.y - BY) < BR + 6);
      if (bi >= 0) { HS.row = 1; HS.btn = bi; pressBtn(); }
      return;
    }
    if (game.swipe && !swiped) game.tap(p.x, p.y);
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  return {
    start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } },
    /** 暂停（掌机放下时）：停掉绘制循环，游戏状态留着 */
    stop() { cancelAnimationFrame(raf); raf = 0; music.stop(); },
    key(k: Key) {
      ctxA();
      if (k === 'home') { if (game) { game = null; music.stop(); beep(500, 300, 0.08, 'triangle', 0.04); } return; }
      if (!game) {
        if (HS.page) { if (k === 'a' || k === 'b') { HS.page = null; sfx.tick(); } return; }
        const n = GAMES.length;
        if (k === 'down' && HS.row === 0) { HS.row = 1; sfx.tick(); }
        else if (k === 'up' && HS.row === 1) { HS.row = 0; sfx.tick(); }
        else if (k === 'left' || k === 'right') {
          const d = k === 'left' ? -1 : 1;
          if (HS.row === 0) { const nx = clamp2(sel + d, 0, n - 1); if (nx !== sel) { sel = nx; sfx.tick(); } }
          else { const nx = clamp2(HS.btn + d, 0, BTNS.length - 1); if (nx !== HS.btn) { HS.btn = nx; sfx.tick(); } }
        } else if (k === 'a') { if (HS.row === 0) startGame(sel); else pressBtn(); }
        return;
      }
      if (k === 'b' && game) { game = null; music.stop(); return; }
      game.key(k);
    },
    destroy() { this.stop(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); },
  };
}
