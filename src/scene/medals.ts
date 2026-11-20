/**
 * 书架上三枚荣誉勋章的图案（用户给的是截图，抠出来只有一百多像素、「看不清楚」，所以照着截图用 canvas 矢量重画，1024 见方、透明底）：
 * - 百度小赞：金色圆环 + 橙色圆盘，正中一朵五瓣红梅（中心金星），顶上一个带红星的小金冠，左右金色卷叶，
 *   下面一对粉红的翅膀、一条红色绶带、正中一颗金框红菱形（里面一朵小白花）。
 * - 季度 Award：玫瑰金五角星（每个角一半亮一半暗，像斜切面），中间藏蓝圆环（一圈玫瑰金小字）+ 藏蓝圆心里一只浅粉色的爪印，
 *   下面一条藏蓝横幅写着「季度AWARD」。
 * 坐标都按 1024 画布写；调用方把画布 scale 到实际尺寸。
 */
type G = CanvasRenderingContext2D;
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

const lin = (g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
const rad = (g: G, x: number, y: number, r0: number, r1: number, stops: [number, string][]) => { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
const star = (g: G, cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2) => {
  g.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath();
};
const GOLD: [number, string][] = [[0, '#fff1c4'], [0.35, '#f2c46e'], [0.6, '#d68b34'], [0.8, '#f6cf82'], [1, '#b8692a']];

/** 百度小赞 */
export function drawXiaozan(g: G) {
  const cx = 512, cy = 470;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // ---- 绶带尾巴（最底下，从圆盘后面垂下来，末端 V 字剪口）----
  for (const k of [-1, 1]) {
    g.fillStyle = lin(g, cx + k * 60, 760, cx + k * 170, 980, [[0, '#e0202e'], [1, '#a50f1c']]);
    g.beginPath(); g.moveTo(cx + k * 40, 760); g.lineTo(cx + k * 140, 770); g.lineTo(cx + k * 175, 905); g.lineTo(cx + k * 135, 880); g.lineTo(cx + k * 100, 915); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,160,160,.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + k * 70, 780); g.lineTo(cx + k * 125, 880); g.stroke();
  }
  // ---- 左右金色卷叶 ----
  for (const k of [-1, 1]) {
    g.fillStyle = lin(g, cx + k * 280, 400, cx + k * 420, 600, GOLD);
    g.beginPath(); g.moveTo(cx + k * 260, 380); g.bezierCurveTo(cx + k * 420, 420, cx + k * 440, 560, cx + k * 380, 640); g.bezierCurveTo(cx + k * 400, 560, cx + k * 360, 500, cx + k * 280, 470); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + k * 300, 560); g.bezierCurveTo(cx + k * 400, 600, cx + k * 420, 680, cx + k * 350, 720); g.bezierCurveTo(cx + k * 360, 660, cx + k * 330, 620, cx + k * 280, 610); g.closePath(); g.fill();
    g.strokeStyle = '#a65a1e'; g.lineWidth = 4; g.stroke();
  }
  // ---- 顶上的粉红小蝴蝶结（圆环左上、右上）----
  for (const k of [-1, 1]) {
    g.fillStyle = lin(g, cx + k * 120, 180, cx + k * 280, 260, [[0, '#ff8d9a'], [1, '#e3324a']]);
    g.beginPath(); g.moveTo(cx + k * 90, 210); g.quadraticCurveTo(cx + k * 200, 140, cx + k * 300, 220); g.quadraticCurveTo(cx + k * 210, 210, cx + k * 120, 250); g.closePath(); g.fill();
  }
  // ---- 金色外圈 ----
  g.fillStyle = lin(g, cx - 300, cy - 300, cx + 300, cy + 300, GOLD); g.beginPath(); g.arc(cx, cy, 300, 0, 7); g.fill();
  g.strokeStyle = '#9c5320'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = 'rgba(255,240,200,.7)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 282, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
  // 外圈上左右两颗红宝石小花
  for (const k of [-1, 1]) { const x = cx + k * 268, y = cy + 6; g.fillStyle = '#d61f2c'; for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 11, 0, 7); g.fill(); } g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
  // ---- 橙色内盘：深一圈 + 亮的圆心 ----
  g.fillStyle = lin(g, cx, cy - 240, cx, cy + 240, [[0, '#f8b265'], [1, '#d9692a']]); g.beginPath(); g.arc(cx, cy, 240, 0, 7); g.fill();
  g.strokeStyle = '#b5561f'; g.lineWidth = 8; g.stroke();
  g.fillStyle = rad(g, cx - 40, cy - 60, 20, 210, [[0, '#ffd7a0'], [0.6, '#f6a65c'], [1, '#e8823a']]); g.beginPath(); g.arc(cx, cy, 205, 0, 7); g.fill();
  // 内盘上沿一道「猫耳」形的浅色描边（截图里圆盘上方有两个小凸起）
  g.strokeStyle = 'rgba(255,230,190,.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 150, cy - 150); g.quadraticCurveTo(cx - 130, cy - 205, cx - 80, cy - 190); g.quadraticCurveTo(cx, cy - 215, cx + 80, cy - 190); g.quadraticCurveTo(cx + 130, cy - 205, cx + 150, cy - 150); g.stroke();
  // ---- 五瓣红梅 ----
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI / 2, px = cx + Math.cos(a) * 82, py = cy + 10 + Math.sin(a) * 82;
    g.fillStyle = rad(g, px - Math.cos(a) * 30, py - Math.sin(a) * 30, 10, 105, [[0, '#ff9a9a'], [0.5, '#f0303c'], [1, '#c4121f']]);
    g.beginPath(); g.ellipse(px, py, 92, 80, a + Math.PI / 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(150,10,20,.45)'; g.lineWidth = 4; g.stroke();
  }
  g.fillStyle = rad(g, cx, cy + 10, 5, 70, [[0, '#ffe08a'], [1, '#f2a33a']]); g.beginPath(); g.arc(cx, cy + 10, 60, 0, 7); g.fill();
  g.fillStyle = '#e8343c'; star(g, cx, cy + 12, 44, 18); g.fill(); g.fillStyle = '#fff2c0'; star(g, cx, cy + 12, 24, 10); g.fill();
  g.fillStyle = '#ffe9a8'; for (let p = 0; p < 10; p++) { const a = (p / 10) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 74, cy + 10 + Math.sin(a) * 74, 6, 0, 7); g.fill(); } // 花蕊
  // ---- 顶上的金冠 + 红星 ----
  g.fillStyle = lin(g, cx, 120, cx, 230, GOLD);
  g.beginPath(); g.moveTo(cx - 70, 230); g.lineTo(cx - 80, 160); g.lineTo(cx - 35, 185); g.lineTo(cx, 110); g.lineTo(cx + 35, 185); g.lineTo(cx + 80, 160); g.lineTo(cx + 70, 230); g.closePath(); g.fill();
  g.strokeStyle = '#9c5320'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#d61f2c'; star(g, cx, 196, 30, 13); g.fill();
  // ---- 一对粉红的翅膀：压在圆环下半截前面，每边五根羽毛从下方中间往外、往上扇开（外长内短），白色羽轴 ----
  for (const k of [-1, 1]) {
    const px = cx + k * 70, py = 730;
    for (let f = 4; f >= 0; f--) {
      const ang = (0.18 + f * 0.17), len = 300 - f * 26, w = 46 - f * 3;
      const ex = px + k * Math.cos(ang) * len, ey = py - Math.sin(ang) * len;
      g.save(); g.translate(px, py); g.rotate(k > 0 ? -ang : Math.PI + ang);
      g.fillStyle = lin(g, 0, 0, len, 0, [[0, '#ffc2c8'], [0.45, '#ff6a7c'], [1, '#d42240']]);
      g.beginPath(); g.moveTo(0, -w * 0.35); g.quadraticCurveTo(len * 0.55, -w, len, 0); g.quadraticCurveTo(len * 0.55, w * 0.9, 0, w * 0.35); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(160,20,40,.35)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(len * 0.12, 0); g.lineTo(len * 0.8, -2); g.stroke();
      g.restore(); void ex; void ey;
    }
  }
  // ---- 绶带横条 + 金框红菱形 ----
  g.fillStyle = lin(g, cx, 700, cx, 790, [[0, '#ea2c3a'], [1, '#b0101e']]);
  g.beginPath(); g.moveTo(cx - 200, 705); g.quadraticCurveTo(cx, 745, cx + 200, 705); g.lineTo(cx + 210, 770); g.quadraticCurveTo(cx, 810, cx - 210, 770); g.closePath(); g.fill();
  g.fillStyle = lin(g, cx - 80, 660, cx + 80, 860, GOLD); g.beginPath(); g.moveTo(cx, 650); g.lineTo(cx + 85, 755); g.lineTo(cx, 860); g.lineTo(cx - 85, 755); g.closePath(); g.fill();
  g.strokeStyle = '#9c5320'; g.lineWidth = 5; g.stroke();
  g.fillStyle = lin(g, cx, 680, cx, 830, [[0, '#ff4a55'], [1, '#c2101f']]); g.beginPath(); g.moveTo(cx, 680); g.lineTo(cx + 60, 755); g.lineTo(cx, 830); g.lineTo(cx - 60, 755); g.closePath(); g.fill();
  g.fillStyle = '#fff4e6'; for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 14, 755 + Math.sin(a) * 14, 12, 0, 7); g.fill(); }
  g.fillStyle = '#f6b23c'; g.beginPath(); g.arc(cx, 755, 8, 0, 7); g.fill();
  g.restore();
}

/** 季度 Award */
export function drawAward(g: G) {
  const cx = 512, cy = 480;
  g.save(); g.lineJoin = 'round';
  // ---- 玫瑰金五角星：每个角分成两半，一半亮一半暗（斜切面）----
  const R = 470, r = 205, pts = (i: number, rr: number) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const; };
  g.fillStyle = '#7d4b45'; star(g, cx, cy + 8, R + 6, r + 4); g.fill(); // 外沿暗边
  for (let i = 0; i < 10; i++) {
    const [x1, y1] = pts(i, i % 2 ? r : R), [x2, y2] = pts(i + 1, (i + 1) % 2 ? r : R);
    g.fillStyle = i % 2 ? lin(g, cx, cy, x1, y1, [[0, '#c98a7c'], [1, '#9c5f56']]) : lin(g, cx, cy, x1, y1, [[0, '#f6d0c2'], [1, '#e2a796']]);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(255,235,225,.6)'; g.lineWidth = 3; star(g, cx, cy, R - 14, r - 6); g.stroke();
  // ---- 中间：玫瑰金圈 → 藏蓝环（一圈小字）→ 玫瑰金细圈 → 藏蓝圆心 + 爪印 ----
  g.fillStyle = lin(g, cx - 240, cy - 240, cx + 240, cy + 240, [[0, '#f7d6c9'], [0.5, '#d49a8a'], [1, '#a8685e']]); g.beginPath(); g.arc(cx, cy, 245, 0, 7); g.fill();
  g.fillStyle = lin(g, cx, cy - 225, cx, cy + 225, [[0, '#33508f'], [1, '#1c2c5a']]); g.beginPath(); g.arc(cx, cy, 225, 0, 7); g.fill();
  // 环上的字
  g.fillStyle = '#f0c3b2'; g.font = `700 40px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ringText = 'QUARTERLY ★ AWARD ★ QUARTERLY ★ AWARD ★ ';
  for (let i = 0; i < ringText.length; i++) { const a = -Math.PI / 2 + (i / ringText.length) * Math.PI * 2; g.save(); g.translate(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190); g.rotate(a + Math.PI / 2); g.fillText(ringText[i], 0, 0); g.restore(); }
  g.fillStyle = lin(g, cx - 160, cy - 160, cx + 160, cy + 160, [[0, '#f7d6c9'], [1, '#b47468']]); g.beginPath(); g.arc(cx, cy, 158, 0, 7); g.fill();
  g.fillStyle = rad(g, cx - 30, cy - 40, 10, 150, [[0, '#3f63b0'], [1, '#1a2a58']]); g.beginPath(); g.arc(cx, cy, 145, 0, 7); g.fill();
  // 爪印：四个脚趾 + 一个掌垫
  g.fillStyle = lin(g, cx, cy - 100, cx, cy + 100, [[0, '#ffe3d8'], [1, '#e9b3a2']]);
  for (const [dx, dy, rx, ry, rot] of [[-62, -40, 24, 31, -0.35], [-22, -78, 25, 33, -0.1], [24, -78, 25, 33, 0.1], [64, -40, 24, 31, 0.35]] as const) { g.beginPath(); g.ellipse(cx + dx, cy + dy, rx, ry, rot, 0, 7); g.fill(); }
  g.beginPath(); g.moveTo(cx, cy - 8); g.bezierCurveTo(cx + 62, cy - 12, cx + 82, cy + 58, cx + 46, cy + 78); g.bezierCurveTo(cx + 20, cy + 92, cx - 20, cy + 92, cx - 46, cy + 78); g.bezierCurveTo(cx - 82, cy + 58, cx - 62, cy - 12, cx, cy - 8); g.fill();
  // ---- 下面的藏蓝横幅「季度AWARD」----
  const by = 800;
  g.fillStyle = lin(g, cx, by - 46, cx, by + 46, [[0, '#2c4583'], [1, '#18264f']]);
  g.beginPath(); g.moveTo(cx - 280, by - 42); g.lineTo(cx + 280, by - 42); g.lineTo(cx + 300, by); g.lineTo(cx + 280, by + 42); g.lineTo(cx - 280, by + 42); g.lineTo(cx - 300, by); g.closePath(); g.fill();
  g.strokeStyle = '#e9b7a6'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#f2c6b5'; g.font = `800 60px ${SANS}`; g.fillText('季度AWARD', cx, by + 3);
  for (const k of [-1, 1]) { star(g, cx + k * 245, by, 16, 7); g.fill(); }
  g.restore();
}
