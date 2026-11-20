import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox, speckle, woodGrain } from '../util';

const SANS = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif';

/**
 * 左墙前段的灶台：炒菜（用户要的「加一口锅，可以煤气灶点着，可以倒油，等它冒烟，可以把蔬菜放进来炒菜，
 * 每隔 3 秒提醒用炒勺翻一下，提醒后隔 2 秒不翻就糊了，黑乎乎的盛到盘子里；炒三次就熟了。不同蔬菜炒出不同的菜，
 * 根据炒得及不及时、加了哪些菜，菜的样子和喜欢程度不同，喜欢程度用 n 颗红色小心心表示」）。
 *
 * 台面上从左到右（站在灶台前看）：一只白瓷盘、双眼煤气灶（左边那个眼上坐着一口黑铁炒锅，锅边搁着炒勺；
 * 前面两个旋钮）、一壶花生油、一只装着番茄、鸡蛋、白菜、葱、生菜的竹筐；地上一只红色液化气罐。
 *
 * 流程：拧左边的旋钮点火（蓝火苗）→ 点油壶倒油 → 油慢慢热，冒烟了 → 点筐里的菜放进锅（可以放好几样）→ 开炒：
 * 每 3 秒提醒「翻一下」，点炒勺（或锅）翻；提醒后 2 秒没翻就糊了，黑乎乎地盛到盘子里；连翻三次就熟了，盛盘。
 * 盛好以后上方出一张小卡片：菜名、n 颗红心（0–5）、一句评价。评分 = 菜谱本身（`RECIPES`）− 油没热就下菜 − 翻得慢。
 *
 * 菜的样子：锅里、盘里各是一个实例化网格（一块块小料，每块一个颜色），按放进去的菜分配：番茄是红色的块、
 * 鸡蛋是蓬松的黄块、白菜是浅绿的片、生菜是翠绿的片、葱是小绿段；翻得越多颜色越熟，糊了全变成焦黑。
 * 有番茄的菜盘底有一汪红汤汁。
 * 三档：high / mid 一样；low 档没有 3D。
 */
type Veg = 'tomato' | 'egg' | 'cabbage' | 'scallion' | 'lettuce' | 'chicken';
type BasketVeg = Exclude<Veg, 'chicken'>;
const VEG_NAME: Record<Veg, string> = { tomato: '番茄', egg: '鸡蛋', cabbage: '白菜', scallion: '葱', lettuce: '生菜', chicken: '鸡肉' };
const VEG_COLOR: Record<Veg, number> = { tomato: 0xd8321e, egg: 0xf2c94c, cabbage: 0xd3e2a8, scallion: 0x4f9a3a, lettuce: 0x7cc24a, chicken: 0xeeb4a4 };
const VEG_PORTION: Record<Veg, number> = { tomato: 7, egg: 8, cabbage: 9, scallion: 10, lettuce: 9, chicken: 9 };
/** 菜谱：放进去的菜（排好序用 + 连起来）→ 菜名、基础喜欢程度（1–5）、一句评价 */
const RECIPES: Record<string, [string, number, string]> = {
  'egg+tomato': ['西红柿炒鸡蛋', 5, '酸甜下饭，家常第一名'],
  'egg+scallion': ['葱花炒鸡蛋', 5, '葱香扑鼻，蛋又嫩又香'],
  'egg': ['炒鸡蛋', 4, '金黄蓬松，简单就好吃'],
  'cabbage': ['清炒白菜', 4, '脆甜爽口'],
  'lettuce': ['清炒生菜', 4, '翠绿清爽'],
  'cabbage+scallion': ['葱炒白菜', 4, '葱一爆，白菜都香了'],
  'cabbage+egg': ['白菜炒蛋', 4, '清淡又有蛋香'],
  'egg+lettuce': ['生菜炒蛋', 4, '嫩生菜裹着鸡蛋'],
  'cabbage+tomato': ['番茄炒白菜', 3, '酸酸的，还行'],
  'lettuce+tomato': ['番茄炒生菜', 3, '有点怪，但能吃'],
  'tomato': ['炒番茄', 3, '就是一锅番茄汤……'],
  'scallion': ['炒大葱', 2, '光吃葱，有点冲'],
  'scallion+tomato': ['番茄炒葱', 3, '酸里带点葱香'],
  'lettuce+scallion': ['葱炒生菜', 3, '清清爽爽'],
  'egg+scallion+tomato': ['葱香番茄蛋', 5, '撒了葱花的西红柿炒蛋，更香了'],
  // 窗外抓回来的鸡（用户要的「把窗外的鸡抓回来做成鸡肉，和蔬菜一起炒」）
  'chicken': ['小炒鸡块', 4, '自家散养的鸡，肉香'],
  'chicken+scallion': ['葱爆鸡丁', 5, '葱香裹着鸡肉，下饭神器'],
  'chicken+tomato': ['番茄鸡块', 5, '酸甜汤汁拌饭绝了'],
  'cabbage+chicken': ['白菜炒鸡', 4, '鸡肉的鲜都进了白菜里'],
  'chicken+lettuce': ['生菜鸡丁', 4, '清爽不腻'],
  'chicken+egg': ['鸡蛋炒鸡肉', 3, '一锅「亲子」，味道还行'],
  'chicken+scallion+tomato': ['葱香番茄鸡', 5, '有汤有肉有葱香'],
  'cabbage+chicken+scallion': ['葱爆白菜鸡', 5, '农家硬菜'],
};
const recipeOf = (set: Veg[]): [string, number, string] => {
  const key = [...set].sort().join('+');
  if (RECIPES[key]) return RECIPES[key];
  if (set.length >= 5) return ['乱炖大杂烩', 2, '什么都往里放，味道有点乱'];
  if (set.includes('chicken')) return ['农家小炒鸡', 4, '有肉有菜，香'];
  return set.includes('egg') ? ['农家小炒', 3, '几样菜一锅出，农家味'] : ['什锦素炒', 3, '素素的一盘'];
};

export const kitchen: SceneObject = ({ scene, camera, tier, bus, pick, audio }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const K = L.kitchen, fy = L.floorY, TOP = K.h, WALLZ = -K.depth / 2;
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  // 灶台自己的坐标：x 沿着灶台（站在前面看往右为正）、z 朝人（正面）、y 从地面算。背靠左墙、正面朝 +x
  const root = new THREE.Group();
  root.position.set(K.x, fy, K.z); root.rotation.y = Math.PI / 2;
  scene.add(root);
  const world = new THREE.Group(); scene.add(world); // 飞向锅、飞向盘子的东西
  root.updateMatrixWorld(true);
  const W = (x: number, y: number, z: number) => root.localToWorld(new THREE.Vector3(x, y, z));

  // ---------------- 灶台柜子 ----------------
  const wood = std({ roughness: 0.75, map: bin.add(canvasTex(512, 256, (g, w, h) => woodGrain(g, 0, 0, w, h, '#5a3a22', '40,22,12', 7), [1.5, 1])) });
  const tile = std({ roughness: 0.25, map: bin.add(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4, 800, '120,110,90', 0.05);
    g.strokeStyle = '#c9c3b6'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  }, [4, 2])), bumpScale: 0 });
  const b = new Batch();
  b.add(wood, rbox(K.len, TOP - 0.03, K.depth, 0.01), [0, (TOP - 0.03) / 2, 0]);
  b.add(tile, new THREE.BoxGeometry(K.len + 0.02, 0.03, K.depth + 0.02), [0, TOP - 0.015, 0]);
  // 柜门：两扇，铜拉手
  const doorM = std({ roughness: 0.7, color: 0x4a2e1b });
  for (const x of [-0.32, 0.32]) {
    b.add(doorM, rbox(0.6, TOP - 0.16, 0.012, 0.005), [x, (TOP - 0.03) / 2 + 0.01, K.depth / 2 + 0.006]);
    b.add(std({ color: 0xb8913f, roughness: 0.3, metalness: 0.9 }), new THREE.CylinderGeometry(0.007, 0.007, 0.08, 8), [x + (x < 0 ? 0.24 : -0.24), TOP * 0.6, K.depth / 2 + 0.02]);
  }
  // 液化气罐：灶台左边地上，红色，带护圈和阀门
  const red = std({ color: 0xb8231c, roughness: 0.45, metalness: 0.2 });
  const gx = -K.len / 2 - 0.2;
  b.add(red, new THREE.CylinderGeometry(0.15, 0.15, 0.45, 20), [gx, 0.235, 0]);
  b.add(red, new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), [gx, 0.46, 0]);
  b.add(std({ color: 0x8a8d90, roughness: 0.4, metalness: 0.8 }), new THREE.TorusGeometry(0.09, 0.012, 6, 16).rotateX(Math.PI / 2), [gx, 0.56, 0]);
  b.add(std({ color: 0x8a8d90, roughness: 0.4, metalness: 0.8 }), new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), [gx, 0.53, 0]);
  // 柜门上的凸起面板（门框感）、踢脚板、台面前沿的木压条
  const panelM = std({ roughness: 0.65, color: 0x553420 });
  for (const x of [-0.32, 0.32]) b.add(panelM, rbox(0.48, TOP - 0.3, 0.01, 0.004), [x, (TOP - 0.03) / 2 + 0.01, K.depth / 2 + 0.014]);
  b.add(std({ roughness: 0.8, color: 0x2a1a10 }), new THREE.BoxGeometry(K.len - 0.02, 0.07, 0.01), [0, 0.035, K.depth / 2 - 0.03]);
  b.add(wood, rbox(K.len + 0.03, 0.022, 0.025, 0.006), [0, TOP - 0.012, K.depth / 2 + 0.008]);
  // 液化气罐的减压阀和一根橘红色的胶皮管，从柜子侧面钻进去接到灶上
  b.add(std({ color: 0x222224, roughness: 0.5, metalness: 0.4 }), new THREE.CylinderGeometry(0.025, 0.028, 0.035, 14), [gx, 0.575, 0]);
  b.add(std({ color: 0xc9a23c, roughness: 0.3, metalness: 0.9 }), new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8).rotateZ(Math.PI / 2), [gx + 0.035, 0.58, 0]);
  b.add(std({ color: 0xd3612a, roughness: 0.6 }), new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(gx + 0.055, 0.58, 0), new THREE.Vector3(gx + 0.11, 0.6, 0.04), new THREE.Vector3(gx + 0.16, 0.42, 0.1), new THREE.Vector3(gx + 0.15, 0.2, 0.15), new THREE.Vector3(-K.len / 2 - 0.02, 0.3, 0.14), new THREE.Vector3(-K.len / 2 + 0.01, 0.32, 0.12),
  ]), 40, 0.0075, 8), [0, 0, 0]);
  b.add(contactMaterial(bin, high ? 0.35 : 0.55), blob(K.len + 0.15, K.depth + 0.12), [0, 0.012, 0]);
  b.add(contactMaterial(bin, high ? 0.35 : 0.55), blob(0.4, 0.4), [gx, 0.013, 0]);
  b.build(root, bin, { cast: high, receive: high, collapse: true });
  // 台面靠墙一排：靠墙斜立的菜板、灶后面的酱油、陈醋、一罐盐
  {
    const cb = new Batch();
    const boardM = std({ roughness: 0.7, map: bin.add(canvasTex(256, 256, (g, w, h) => {
      woodGrain(g, 0, 0, w, h, '#c99a62', '120,80,45', 11, 70); speckle(g, w, h, 5, 500, '60,30,10', 0.08);
      g.strokeStyle = 'rgba(80,40,20,0.18)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 30, y + (Math.random() - 0.5) * 6); g.stroke(); } // 刀痕
    })) });
    cb.add(boardM, rbox(0.28, 0.38, 0.022, 0.008), [-0.5, TOP + 0.19, WALLZ + 0.04], [-0.1, 0, 0]);
    cb.add(std({ color: 0x3a2414, roughness: 0.8 }), new THREE.TorusGeometry(0.012, 0.003, 5, 12), [-0.5, TOP + 0.34, WALLZ + 0.026], [-0.1, 0, 0]);
    const bottle = (x: number, glass: number, cap: number, label: THREE.Texture) => {
      cb.add(std({ color: glass, roughness: 0.08, metalness: 0.2 }), new THREE.LatheGeometry([[0, 0], [0.027, 0], [0.029, 0.006], [0.029, 0.11], [0.022, 0.135], [0.011, 0.155], [0.011, 0.17], [0, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 20), [x, TOP, WALLZ + 0.055]);
      cb.add(std({ color: cap, roughness: 0.4 }), new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 12), [x, TOP + 0.178, WALLZ + 0.055]);
      cb.add(std({ map: label, roughness: 0.6 }), new THREE.CylinderGeometry(0.0295, 0.0295, 0.055, 20, 1, true, -Math.PI / 2), [x, TOP + 0.06, WALLZ + 0.055]);
    };
    const labelOf = (txt: string, bg: string, fg: string) => bin.add(canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.fillRect(0, 8, w, 3); g.fillRect(0, h - 11, w, 3);
      g.font = `bold 40px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w * 0.25, h / 2 + 2); g.fillText(txt, w * 0.75, h / 2 + 2);
    }));
    bottle(0.45, 0x2a1306, 0xb51e16, labelOf('酱油', '#f3e2b0', '#8a1a12'));
    bottle(0.53, 0x1d1a12, 0xe1b33a, labelOf('陈醋', '#efe9da', '#1d3d6a'));
    // 盐罐：白瓷、一道青花线、带钮的盖子
    const jar = new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.034, 0.01], [0.036, 0.05], [0.031, 0.068], [0.026, 0.07], [0, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 24).toNonIndexed();
    { const pp = jar.getAttribute('position'), cc = new Float32Array(pp.count * 3); for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), blue = (y > 0.036 && y < 0.044) || (y > 0.012 && y < 0.015); cc.set(blue ? [0.2, 0.33, 0.62] : [0.95, 0.95, 0.92], i * 3); } jar.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); }
    const cb2 = new Batch(['position', 'normal', 'uv', 'color']);
    cb2.add(std({ vertexColors: true, roughness: 0.18 }), jar, [-0.31, TOP, WALLZ + 0.06]);
    cb2.build(root, bin, { receive: high });
    cb.add(std({ color: 0xf1f0ea, roughness: 0.2 }), new THREE.CylinderGeometry(0.029, 0.031, 0.008, 22), [-0.31, TOP + 0.074, WALLZ + 0.06]);
    cb.add(std({ color: 0x2c4f8f, roughness: 0.3 }), new THREE.SphereGeometry(0.008, 12, 8), [-0.31, TOP + 0.082, WALLZ + 0.06]);
    cb.add(contactMaterial(bin, high ? 0.3 : 0.5), blob(0.07, 0.04), [-0.31, TOP + 0.001, WALLZ + 0.06]);
    cb.add(contactMaterial(bin, high ? 0.3 : 0.5), blob(0.12, 0.05), [0.49, TOP + 0.001, WALLZ + 0.055]);
    cb.build(root, bin, { receive: high, collapse: true });
  }

  // ---------------- 墙上：白瓷砖护墙（中间一行青花砖）+ 挂杆，挂着锅铲、炒勺、漏勺 ----------------
  {
    const wb2 = new Batch();
    const tiles = std({ roughness: 0.22, map: bin.add(canvasTex(1024, 512, (g, w, h) => {
      const nx = 13.2, ny = 6.2, tw = w / nx, th = h / ny;
      g.fillStyle = '#b9b3a7'; g.fillRect(0, 0, w, h);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 14; i++) {
        const x = i * tw, y = h - (j + 1) * th, k = 236 + ((i * 7 + j * 13) % 9) - 4;
        const grd = g.createLinearGradient(x, y, x + tw, y + th); grd.addColorStop(0, `rgb(${k + 6},${k + 5},${k})`); grd.addColorStop(1, `rgb(${k - 8},${k - 9},${k - 13})`);
        g.fillStyle = grd; g.fillRect(x + 2, y + 2, tw - 4, th - 4);
        if (j === 4) { // 青花腰线：每块砖一朵缠枝花
          const cx = x + tw / 2, cy = y + th / 2; g.strokeStyle = '#2c4f8f'; g.fillStyle = '#2c4f8f'; g.lineWidth = 2.5;
          g.beginPath(); g.arc(cx, cy, th * 0.16, 0, Math.PI * 2); g.fill();
          for (let p2 = 0; p2 < 4; p2++) { const a2 = p2 * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.ellipse(cx + Math.cos(a2) * th * 0.27, cy + Math.sin(a2) * th * 0.27, th * 0.11, th * 0.05, a2, 0, Math.PI * 2); g.fill(); }
          g.globalAlpha = 0.6; g.strokeRect(x + 7, y + 7, tw - 14, th - 14); g.globalAlpha = 1;
        }
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 5, y + 5, tw * 0.5, 2); // 釉面的高光边
      }
    })), bumpScale: 0 });
    wb2.add(tiles, new THREE.PlaneGeometry(K.len + 0.02, 0.62), [0, TOP + 0.31, WALLZ + 0.004]);
    const trim = std({ color: 0xe9e4d8, roughness: 0.35 });
    wb2.add(trim, rbox(K.len + 0.04, 0.02, 0.018, 0.006), [0, TOP + 0.625, WALLZ + 0.009]);
    // 挂杆：两个托架、一根不锈钢杆、四个 S 钩
    const chrome = std({ color: 0xd0d3d6, roughness: 0.18, metalness: 1 });
    wb2.add(chrome, new THREE.CylinderGeometry(0.0055, 0.0055, 0.56, 10).rotateZ(Math.PI / 2), [0.2, TOP + 0.57, WALLZ + 0.035]);
    for (const x of [-0.06, 0.46]) { wb2.add(chrome, new THREE.CylinderGeometry(0.004, 0.004, 0.035, 8).rotateX(Math.PI / 2), [x, TOP + 0.57, WALLZ + 0.018]); wb2.add(chrome, new THREE.CylinderGeometry(0.012, 0.012, 0.004, 14).rotateX(Math.PI / 2), [x, TOP + 0.57, WALLZ + 0.006]); }
    for (const x of [0.06, 0.2, 0.34]) wb2.add(chrome, new THREE.TorusGeometry(0.009, 0.0018, 5, 12, Math.PI * 1.6), [x, TOP + 0.56, WALLZ + 0.035], [0, Math.PI / 2, -0.4]);
    // 炒勺（半球勺头 + 长柄 + 木把），漏勺（带孔的圆片），都挂在杆上
    const ironW = std({ color: 0x2c2c2e, roughness: 0.4, metalness: 0.75, side: THREE.DoubleSide });
    const woodH = std({ color: 0x6a4126, roughness: 0.55 });
    wb2.add(ironW, new THREE.SphereGeometry(0.048, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.62, 1).rotateX(Math.PI / 2), [0.2, TOP + 0.2, WALLZ + 0.05]);
    wb2.add(ironW, new THREE.TorusGeometry(0.048, 0.0025, 4, 24), [0.2, TOP + 0.2, WALLZ + 0.05]);
    wb2.add(chrome, new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), [0.2, TOP + 0.345, WALLZ + 0.05]);
    wb2.add(woodH, new THREE.CylinderGeometry(0.009, 0.011, 0.11, 10), [0.2, TOP + 0.5, WALLZ + 0.05]);
    wb2.add(chrome, new THREE.TorusGeometry(0.06, 0.0025, 4, 28), [0.34, TOP + 0.24, WALLZ + 0.045]);
    wb2.add(chrome, new THREE.CylinderGeometry(0.004, 0.004, 0.17, 8), [0.34, TOP + 0.385, WALLZ + 0.045]);
    wb2.add(woodH, new THREE.CylinderGeometry(0.009, 0.011, 0.1, 10), [0.34, TOP + 0.515, WALLZ + 0.045]);
    wb2.build(root, bin, { receive: high, collapse: true, keep: [tiles] });
    const holes = bin.add(new THREE.MeshStandardMaterial({ color: 0xc8cbce, roughness: 0.25, metalness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5, alphaMap: bin.add(canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.fillStyle = '#000';
      for (let r2 = 10; r2 < 60; r2 += 11) for (let k = 0, n = Math.max(1, Math.round(r2 * 0.55)); k < n; k++) { const a2 = (k / n) * Math.PI * 2; g.beginPath(); g.arc(64 + Math.cos(a2) * r2, 64 + Math.sin(a2) * r2, 3, 0, Math.PI * 2); g.fill(); }
    })) }));
    const sk = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.06, 28)), holes); sk.position.set(0.34, TOP + 0.24, WALLZ + 0.045); root.add(sk);
  }

  // ---------------- 煤气灶：黑色钢化玻璃面板 + 拉丝不锈钢框；每个灶眼是不锈钢承液盘、铜火盖（一圈出火孔）+ 黑瓷火盖帽、五爪铸铁锅架 ----------------
  const ST = { x: 0, w: 0.58, d: 0.36, h: 0.07 }, Y0 = TOP + ST.h;
  const BURN = [new THREE.Vector3(-0.14, Y0, -0.02), new THREE.Vector3(0.15, Y0, -0.02)];
  const brushed = bin.add(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9ea2a6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const y = Math.random() * h, l = 20 + Math.random() * 120, x = Math.random() * w; g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},${0.04 + Math.random() * 0.08})`; g.fillRect(x, y, l, 1); }
  }));
  const steel = std({ color: 0xffffff, map: brushed, roughness: 0.32, metalness: 0.9 });
  const glassTop = std({ color: 0xffffff, roughness: 0.08, metalness: 0.3, map: bin.add(canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
    // 面板上印的：灶眼外的一圈细白线、四角的小点
    g.strokeStyle = 'rgba(220,220,220,0.35)'; g.lineWidth = 2;
    for (const bp of BURN) { const cx = (bp.x / (ST.w - 0.02) + 0.5) * w, cy = (bp.z / (ST.d - 0.02) + 0.5) * h; g.beginPath(); g.arc(cx, cy, 118, 0, Math.PI * 2); g.stroke(); g.setLineDash([4, 8]); g.beginPath(); g.arc(cx, cy, 128, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    g.fillStyle = 'rgba(220,220,220,0.4)'; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  })), bumpScale: 0 });
  const panel = std({ color: 0xffffff, roughness: 0.25, metalness: 0.2, map: bin.add(canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(235,235,235,0.75)'; g.font = `bold 15px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const bp of BURN) {
      const cx = (bp.x / (ST.w - 0.02) + 0.5) * w;
      g.fillText('关', cx, 9); g.fillText('大火', cx - 46, h / 2); g.fillText('小火', cx + 46, h / 2);
      g.beginPath(); g.moveTo(cx - 60, h - 6); g.lineTo(cx + 60, h - 14); g.lineTo(cx + 60, h - 6); g.closePath(); g.fill(); // 火力大小的楔形
    }
  })), bumpScale: 0 });
  const sb = new Batch();
  const iron = std({ color: 0x1b1b1d, roughness: 0.7, metalness: 0.35 });
  const brass = std({ color: 0xb08a4a, roughness: 0.4, metalness: 0.85, map: bin.add(canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#d8c09a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1e10';
    for (let i = 0; i < 32; i++) g.fillRect(i * 8 + 2, h * 0.3, 3, h * 0.45); // 出火孔
  })), bumpScale: 0 });
  const enamel = std({ color: 0x141414, roughness: 0.25, metalness: 0.1 });
  sb.add(steel, rbox(ST.w, ST.h, ST.d, 0.012), [ST.x, TOP + ST.h / 2, 0]);
  sb.add(glassTop, new THREE.PlaneGeometry(ST.w - 0.02, ST.d - 0.02).rotateX(-Math.PI / 2), [ST.x, Y0 + 0.0008, 0]);
  sb.add(panel, new THREE.PlaneGeometry(ST.w - 0.03, ST.h - 0.02), [ST.x, TOP + ST.h / 2, ST.d / 2 + 0.0012]);
  // 四个橡胶脚
  for (const [x, z] of [[-0.26, -0.15], [0.26, -0.15], [-0.26, 0.15], [0.26, 0.15]]) sb.add(iron, new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), [x, TOP + 0.002, z]);
  for (const bp of BURN) {
    sb.add(steel, new THREE.LatheGeometry([[0.03, 0.001], [0.07, 0.002], [0.082, 0.006], [0.086, 0.007], [0.087, 0.004], [0.088, 0.001]].map(([r, y]) => new THREE.Vector2(r, y)), 32), [bp.x, Y0, bp.z]);
    sb.add(enamel, new THREE.CylinderGeometry(0.042, 0.045, 0.012, 24), [bp.x, Y0 + 0.006, bp.z]);
    sb.add(brass, new THREE.CylinderGeometry(0.038, 0.04, 0.011, 32, 1, true), [bp.x, Y0 + 0.0175, bp.z]);
    sb.add(brass, new THREE.RingGeometry(0.026, 0.038, 32).rotateX(-Math.PI / 2), [bp.x, Y0 + 0.023, bp.z]);
    sb.add(enamel, new THREE.CylinderGeometry(0.027, 0.029, 0.006, 24), [bp.x, Y0 + 0.025, bp.z]);
    sb.add(brass, new THREE.CylinderGeometry(0.012, 0.014, 0.008, 16), [bp.x, Y0 + 0.016, bp.z]); // 中心小火盖（藏在帽下，露一圈）
    // 五爪锅架：外圈铸铁环 + 五个往里伸的爪，爪顶托住锅底
    sb.add(iron, new THREE.TorusGeometry(0.098, 0.006, 5, 30).rotateX(Math.PI / 2), [bp.x, Y0 + 0.006, bp.z]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + 0.3;
      sb.add(iron, new THREE.BoxGeometry(0.044, 0.024, 0.008), [bp.x + Math.cos(a) * 0.077, Y0 + 0.018, bp.z + Math.sin(a) * 0.077], [0, -a, 0]);
      sb.add(iron, new THREE.BoxGeometry(0.012, 0.012, 0.012), [bp.x + Math.cos(a) * 0.098, Y0 + 0.008, bp.z + Math.sin(a) * 0.098], [0, -a, 0]);
    }
  }
  sb.build(root, bin, { receive: high, collapse: true });
  // 旋钮：镀铬底圈 + 黑色旋钮（带防滑纹的握把，握把头上一道白色指示线）；左边那个管炒锅这个火
  const knobM = std({ color: 0x1a1a1c, roughness: 0.35, metalness: 0.2 });
  const chromeK = std({ color: 0xd8dadd, roughness: 0.15, metalness: 1 });
  const knobs = BURN.map((bp) => {
    const k = new THREE.Group(); k.position.set(bp.x, TOP + ST.h / 2, ST.d / 2 + 0.002); root.add(k);
    const kb = new Batch();
    kb.add(chromeK, new THREE.TorusGeometry(0.026, 0.0035, 6, 28), [0, 0, 0.002]);
    kb.add(knobM, new THREE.CylinderGeometry(0.022, 0.024, 0.016, 24).rotateX(Math.PI / 2), [0, 0, 0.009]);
    kb.add(knobM, new THREE.CylinderGeometry(0.018, 0.022, 0.006, 24).rotateX(Math.PI / 2), [0, 0, 0.02]);
    kb.add(knobM, rbox(0.01, 0.038, 0.014, 0.004), [0, 0, 0.028]); // 握把
    for (let i = -1; i <= 1; i += 2) kb.add(knobM, new THREE.BoxGeometry(0.0015, 0.03, 0.004), [i * 0.0055, 0, 0.029]);
    kb.add(std({ color: 0xf2f2f2, roughness: 0.4 }), new THREE.BoxGeometry(0.0025, 0.012, 0.002), [0, 0.012, 0.0355]);
    kb.build(k, bin, { receive: high });
    k.userData.keepsStove = true;
    return k;
  });
  // 火苗：从铜火盖侧面那圈出火孔斜着往外冒的蓝色小火舌（加色混合，轻轻跳），点着了才画
  const flameGeo = bin.add(new THREE.ConeGeometry(0.006, 0.03, 5, 1, true).translate(0, 0.015, 0));
  const FL = 28;
  const flame = new THREE.InstancedMesh(flameGeo, bin.add(new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })), FL);
  flame.visible = false; flame.userData.noAO = true; flame.frustumCulled = false; root.add(flame);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();

  // ---------------- 炒锅：锤纹黑铁锅（锅沿卷边、铆钉、长柄木把、对面一个小耳朵）----------------
  const WOK = BURN[0].clone().setY(Y0 + 0.03);
  const wokProf = [[0, 0], [0.06, 0.003], [0.11, 0.016], [0.145, 0.04], [0.165, 0.07], [0.172, 0.085]];
  const wokY = (r: number) => { for (let i = 1; i < wokProf.length; i++) { const [r0, y0] = wokProf[i - 1], [r1, y1] = wokProf[i]; if (r <= r1) return y0 + (y1 - y0) * (r - r0) / (r1 - r0); } return 0.085; };
  const wok = new THREE.Group(); wok.position.copy(WOK); root.add(wok);
  const WOK_HY = -0.25; // 长柄朝人、偏左
  {
    const hammer = bin.add(canvasTex(512, 256, (g, w, h) => {
      // 锤纹：一个个浅坑（亮边 + 暗心），锅底一圈烧出来的蓝紫色
      g.fillStyle = '#3a3a3d'; g.fillRect(0, 0, w, h);
      const tint = g.createLinearGradient(0, 0, 0, h); tint.addColorStop(0, 'rgba(70,60,90,0.5)'); tint.addColorStop(0.35, 'rgba(90,70,50,0.25)'); tint.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = tint; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 5 + Math.random() * 7;
        const grd = g.createRadialGradient(x - 1, y - 1, 0, x, y, r); grd.addColorStop(0, 'rgba(0,0,0,0.16)'); grd.addColorStop(0.7, 'rgba(0,0,0,0.04)'); grd.addColorStop(1, 'rgba(255,255,255,0.07)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }, [3, 1]));
    const wokM = std({ color: 0xffffff, map: hammer, bumpMap: hammer, bumpScale: 0.6, roughness: 0.38, metalness: 0.7, side: THREE.DoubleSide });
    const wb = new Batch();
    wb.add(wokM, new THREE.LatheGeometry(wokProf.map(([r, y]) => new THREE.Vector2(r, y)), 48));
    const rimM = std({ color: 0x2a2a2c, roughness: 0.35, metalness: 0.75 });
    wb.add(rimM, new THREE.TorusGeometry(0.172, 0.0032, 6, 64).rotateX(Math.PI / 2), [0, 0.085, 0]);
    // 长柄：铆在锅沿下的铁套管 + 木把 + 尾端挂环
    const dir = new THREE.Vector3(Math.sin(WOK_HY), 0, Math.cos(WOK_HY));
    const at = (d: number, y: number): [number, number, number] => [dir.x * d, y, dir.z * d];
    const pitch = -0.2;
    wb.add(rimM, new THREE.CylinderGeometry(0.009, 0.011, 0.085, 12).rotateX(Math.PI / 2), at(0.205, 0.084 + 0.04 * 0.2), [pitch, WOK_HY, 0]);
    wb.add(rimM, rbox(0.03, 0.03, 0.006, 0.003), at(0.168, 0.074), [0.25, WOK_HY, 0]); // 铆钉板
    for (const sx of [-1, 1]) wb.add(std({ color: 0x8a8a8c, roughness: 0.3, metalness: 0.9 }), new THREE.SphereGeometry(0.003, 8, 6), [dir.x * 0.171 + dir.z * sx * 0.008, 0.074, dir.z * 0.171 - dir.x * sx * 0.008]);
    const woodW = std({ color: 0x6a4024, roughness: 0.5, map: bin.add(canvasTex(128, 64, (g, w, h) => woodGrain(g, 0, 0, w, h, '#7a4a2a', '50,26,12', 3, 40))) });
    wb.add(woodW, new THREE.CylinderGeometry(0.0135, 0.016, 0.17, 14).rotateX(Math.PI / 2), at(0.33, 0.084 + 0.165 * 0.2), [pitch, WOK_HY, 0]);
    wb.add(rimM, new THREE.CylinderGeometry(0.0145, 0.0145, 0.012, 14).rotateX(Math.PI / 2), at(0.25, 0.084 + 0.085 * 0.2), [pitch, WOK_HY, 0]);
    wb.add(rimM, new THREE.TorusGeometry(0.009, 0.0022, 5, 14), at(0.425, 0.084 + 0.26 * 0.2), [pitch, WOK_HY, 0]);
    // 对面的小耳朵（端锅用）
    wb.add(rimM, new THREE.TorusGeometry(0.022, 0.0045, 6, 14, Math.PI).rotateX(Math.PI / 2), at(-0.168, 0.077), [0, WOK_HY + Math.PI, 0]);
    wb.build(wok, bin, { receive: high });
    wok.children.forEach((c) => { c.castShadow = false; });
  }
  wok.userData.keepsStove = true;
  // 锅里的油：一张金黄的半透明圆片；热了会冒烟
  const oilM = bin.add(new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }));
  const oilDisc = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.1, 28).rotateX(-Math.PI / 2)), oilM);
  oilDisc.position.y = 0.006; oilDisc.visible = false; wok.add(oilDisc);

  // ---------------- 锅铲：微微上翘的不锈钢铲面、焊在铲面后沿的弯颈、细长柄、木把（尾端挂孔）----------------
  // 锅铲自己的坐标：原点在铲面中心的底面，铲尖朝 -z，柄往 +z、往上翘。平时挂在墙上的挂杆上，下菜开炒以后搁在锅里（柄靠在锅沿上）
  const spatula = new THREE.Group(); root.add(spatula);
  spatula.rotation.order = 'YXZ';
  const spatGlow = std({ color: 0x6a4126, roughness: 0.55, emissive: 0xffb050, emissiveIntensity: 0 });
  const SP_END = new THREE.Vector3(0, 0.178, 0.36); // 柄尾（挂孔）
  {
    const ssteel = std({ color: 0xd2d5d8, roughness: 0.22, metalness: 1, side: THREE.DoubleSide });
    const sh = new THREE.Shape();
    sh.moveTo(-0.04, -0.036); sh.lineTo(0.04, -0.036); sh.lineTo(0.05, 0.04);
    sh.quadraticCurveTo(0.051, 0.056, 0.036, 0.057); sh.quadraticCurveTo(0, 0.062, -0.036, 0.057); sh.quadraticCurveTo(-0.051, 0.056, -0.05, 0.04); sh.closePath();
    const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.0022, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
    const bp2 = blade.getAttribute('position');
    for (let i = 0; i < bp2.count; i++) { const x = bp2.getX(i); bp2.setY(i, bp2.getY(i) + 3.2 * x * x); } // 两边微微翘起，像一只浅铲
    blade.computeVertexNormals();
    const neck = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.002, 0.028), new THREE.Vector3(0, 0.012, 0.05), new THREE.Vector3(0, 0.04, 0.082), new THREE.Vector3(0, 0.12, 0.23)]), 20, 0.0042, 8);
    const sp2 = new Batch();
    sp2.add(ssteel, blade);
    sp2.add(ssteel, neck);
    sp2.add(ssteel, rbox(0.03, 0.004, 0.014, 0.0015), [0, 0.003, 0.03]); // 焊接片
    sp2.add(ssteel, new THREE.CylinderGeometry(0.0115, 0.0115, 0.014, 12).rotateX(Math.PI / 2), [0, 0.123, 0.236], [-Math.atan2(0.058, 0.13), 0, 0]);
    sp2.build(spatula, bin, { receive: high });
    const handle = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0105, 0.0128, 0.125, 12).rotateX(Math.PI / 2)), spatGlow);
    handle.position.set(0, 0.151, 0.302); handle.rotation.x = -Math.atan2(0.058, 0.13); spatula.add(handle);
    const ring = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.0045, 0.0018, 5, 10).rotateY(Math.PI / 2)), ssteel); ring.position.copy(SP_END).add(new THREE.Vector3(0, 0.002, 0.004)); spatula.add(ring);
  }
  spatula.userData.keepsStove = true;
  // 姿势：位置 + 四元数。挂在墙上 / 搁在锅里 / 翻炒时按铲面在锅里的位置现算
  type Pose = { p: THREE.Vector3; q: THREE.Quaternion };
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const quatOf = (pitch: number, yaw: number, roll = 0) => new THREE.Quaternion().setFromEuler(eul.set(pitch, yaw, roll, 'YXZ'));
  const HANG: Pose = (() => { const qq = quatOf(-Math.atan2(SP_END.z, SP_END.y) + 0.02, 0); const hook = new THREE.Vector3(0.06, TOP + 0.553, WALLZ + 0.04); return { p: hook.sub(SP_END.clone().applyQuaternion(qq)), q: qq }; })();
  /** 铲面在锅里沿「朝人」方向 h 的位置 s（正 = 靠人那边）：贴着锅面，铲尖、铲心、铲尾都不穿锅 */
  const STROKE_YAW = 0.35;
  const slope = (r: number) => (wokY(r + 0.004) - wokY(Math.max(0, r - 0.004))) / 0.008;
  const inWok = (s: number, yaw: number, lift = 0, pitchAdd = 0, roll = 0): Pose => {
    const pitch = THREE.MathUtils.clamp(-Math.sign(s) * Math.atan(slope(Math.abs(s))), -0.62, 0.24) + pitchAdd;
    let y = -1;
    for (const sz of [-0.058, -0.03, 0, 0.03]) y = Math.max(y, wokY(Math.abs(s + sz * Math.cos(pitch))) + 0.003 + sz * Math.sin(pitch));
    const h = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    return { p: WOK.clone().addScaledVector(h, s).setY(WOK.y + y + lift), q: quatOf(pitch, yaw, roll) };
  };
  const REST = inWok(0.085, 0.62);
  spatula.position.copy(HANG.p); spatula.quaternion.copy(HANG.q);

  // ---------------- 油壶 ----------------
  const OIL_HOME = new THREE.Vector3(0.36, TOP, -0.17);
  const oilBottle = new THREE.Group(); oilBottle.position.copy(OIL_HOME); oilBottle.rotation.order = 'YXZ'; root.add(oilBottle);
  {
    const ob = new Batch();
    const labelTex = bin.add(canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#c21d14'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffe9a6'; g.font = `bold 46px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('花生油', w * 0.25, h / 2); g.fillText('花生油', w * 0.75, h / 2);
    }));
    ob.add(bin.add(new THREE.MeshPhysicalMaterial({ color: 0xe7b53a, roughness: 0.15, transmission: 0.3, thickness: 0.05, transparent: true, opacity: 0.88 })),
      new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.17], [0.03, 0.2], [0.013, 0.215], [0.013, 0.23], [0, 0.23]].map(([x, y]) => new THREE.Vector2(x, y)), 20));
    ob.add(std({ map: labelTex, roughness: 0.5, bumpScale: 0 }), new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 20, 1, true, -Math.PI / 2), [0, 0.09, 0]); // 从 -90° 开始绕，接缝不朝人（同可乐罐）
    ob.add(std({ color: 0xc21d14, roughness: 0.4 }), new THREE.CylinderGeometry(0.015, 0.015, 0.02, 12), [0, 0.24, 0]);
    ob.build(oilBottle, bin, { receive: high });
  }
  oilBottle.userData.keepsStove = true;
  const OIL_TIP = new THREE.Vector3(0, 0.235, 0);

  // ---------------- 菜筐和菜 ----------------
  const BASKET = new THREE.Vector3(0.5, TOP, 0.03);
  const bk = new Batch(['position', 'normal', 'uv', 'color']);
  const weave = std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, map: bin.add(canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#7a5a34'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) { g.fillStyle = `rgb(${190 + ((x + y) % 30)},${155 + (x % 20)},${100})`; g.fillRect(x + ((y / 8) % 2 ? 8 : 0), y + 1, 13, 6); }
  }, [3, 1])), bumpScale: 0 });
  const tintGeo = (geo: THREE.BufferGeometry, hex: number) => { const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
  bk.add(weave, tintGeo(new THREE.CylinderGeometry(0.15, 0.12, 0.08, 20, 1, true), 0xffffff), [BASKET.x, TOP + 0.04, BASKET.z]);
  bk.add(weave, tintGeo(new THREE.CircleGeometry(0.12, 20).rotateX(-Math.PI / 2), 0xd8c8a0), [BASKET.x, TOP + 0.004, BASKET.z]);
  bk.add(weave, tintGeo(new THREE.TorusGeometry(0.15, 0.008, 5, 24).rotateX(Math.PI / 2), 0x8a6a40), [BASKET.x, TOP + 0.08, BASKET.z]);
  // 筐不挡点击：筐壁比里面的菜高，不然点菜总点到筐上
  for (const m of bk.build(root, bin, { receive: high })) m.raycast = () => {};
  // 菜：每样一个网格（顶点色），各自点得到
  const vegMat = std({ vertexColors: true, roughness: 0.45 });
  const shade = (geo: THREE.BufferGeometry, hex: number, vary = 0.15) => {
    const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3), p = g.getAttribute('position'), nn = (g.computeVertexNormals(), g.getAttribute('normal'));
    for (let i = 0; i < n; i++) { const k = 0.8 + 0.2 * nn.getY(i) + (Math.sin(p.getX(i) * 300 + p.getZ(i) * 170) * vary); a.set([c.r * k, c.g * k, c.b * k], i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
  };
  const mergeVeg = (parts: THREE.BufferGeometry[]) => { const bb = new Batch(['position', 'normal', 'color']); parts.forEach((p) => bb.add(vegMat, p)); const grp = new THREE.Group(); bb.build(grp, bin); return grp; };
  const vegMeshes: Record<BasketVeg, THREE.Object3D> & { chicken?: THREE.Object3D } = {
    cabbage: mergeVeg([shade(new THREE.SphereGeometry(0.055, 16, 12).scale(1, 0.9, 1), 0xd6e5ac, 0.08), ...[0, 1, 2, 3].map((i) => shade(new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI).scale(0.9, 1, 0.35).rotateY(i * 1.6).translate(Math.cos(i * 1.6) * 0.03, -0.005, -Math.sin(i * 1.6) * 0.03), 0x9ec36a, 0.1))]),
    lettuce: mergeVeg([0, 1, 2, 3, 4, 5].map((i) => shade(new THREE.SphereGeometry(0.04, 10, 8, 0, Math.PI).scale(1, 0.8, 0.4).rotateX(-0.5).rotateY(i * 1.05).translate(Math.cos(i * 1.05) * 0.018, 0.01, -Math.sin(i * 1.05) * 0.018), 0x7cc24a, 0.12))),
    tomato: mergeVeg([[0, 0], [0.065, 0.01]].map(([x, z]) => shade(new THREE.SphereGeometry(0.032, 14, 10).scale(1, 0.85, 1).translate(x, 0, z), 0xd8321e, 0.05))),
    egg: mergeVeg([[0, 0], [0.04, 0.012], [0.02, -0.035]].map(([x, z], i) => shade(new THREE.SphereGeometry(0.02, 12, 10).scale(1, 1.3, 1).rotateZ(1.2 + i * 0.3).translate(x, 0, z), 0xf2dcc0, 0.03))),
    scallion: mergeVeg([0, 1, 2, 3, 4].map((i) => shade(new THREE.CylinderGeometry(0.0045, 0.0045, 0.2, 6).rotateZ(Math.PI / 2 - 0.1).translate(0, i * 0.006, (i - 2) * 0.008), i % 2 ? 0x4f9a3a : 0x6cae4a, 0.05))),
  };
  const VEG_POS: Record<BasketVeg, [number, number, number]> = { cabbage: [-0.05, 0.06, -0.04], lettuce: [0.05, 0.055, -0.05], tomato: [-0.07, 0.035, 0.06], egg: [0.03, 0.03, 0.07], scallion: [0.0, 0.085, 0.0] };
  (Object.keys(VEG_POS) as BasketVeg[]).forEach((k) => {
    const m = vegMeshes[k]; const [x, y, z] = VEG_POS[k];
    m.position.set(BASKET.x + x, TOP + y, BASKET.z + z); m.userData.keepsStove = true; root.add(m);
    pick(m, { click: () => onVeg(k) });
  });

  // ---------------- 鸡肉：窗外抓回来的鸡，一盘切好的生鸡块（粉色的块 + 一点鸡皮的浅黄），抓到才出现 ----------------
  let chickenStock = 0;
  const meat = new THREE.Group(); meat.position.set(0.3, TOP, 0.2); meat.visible = false; meat.userData.keepsStove = true; root.add(meat);
  {
    const dish = new THREE.LatheGeometry([[0, 0.003], [0.07, 0.003], [0.085, 0.014], [0.088, 0.016], [0, 0.006]].map(([r2, y]) => new THREE.Vector2(r2, y)), 28);
    const parts = [shade(dish, 0xf3f1ea, 0.01)];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 0.02 + (i % 3) * 0.018; parts.push(shade(new THREE.BoxGeometry(0.022, 0.014, 0.018, 2, 1, 2).rotateY(a).translate(Math.cos(a) * rr, 0.016 + (i % 2) * 0.006, Math.sin(a) * rr), i % 4 === 0 ? 0xf2dcb0 : 0xeeb0a0, 0.08)); }
    meat.add(mergeVeg(parts));
  }
  vegMeshes.chicken = meat;
  pick(meat, { click: () => onVeg('chicken') });
  on(bus, 'pantry:add', (d: { item: string }) => { if (d?.item === 'chicken') { chickenStock++; meat.visible = true; if (focused) refresh(); } });

  // ---------------- 盘子 ----------------
  const PLATE = new THREE.Vector3(-0.47, TOP + 0.004, 0.02);
  const plate = new THREE.Group(); plate.position.copy(PLATE); root.add(plate);
  {
    const pb = new Batch(['position', 'normal', 'uv', 'color']);
    const prof = [[0, 0.004], [0.08, 0.004], [0.1, 0.008], [0.125, 0.022], [0.13, 0.024], [0.128, 0.026], [0.1, 0.012], [0.08, 0.008], [0, 0.008]].map(([r, y]) => new THREE.Vector2(r, y));
    const pg = new THREE.LatheGeometry(prof, 40).toNonIndexed(); const pp = pg.getAttribute('position'), pc = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i++) { const r = Math.hypot(pp.getX(i), pp.getZ(i)), blue = r > 0.112 && r < 0.12; pc.set(blue ? [0.18, 0.32, 0.62] : [0.95, 0.95, 0.93], i * 3); }
    pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    pb.add(std({ vertexColors: true, roughness: 0.2, side: THREE.DoubleSide }), pg);
    pb.add(contactMaterial(bin, high ? 0.3 : 0.5), blob(0.3, 0.3), [0, 0.001, 0]);
    pb.build(plate, bin, { receive: high });
  }
  plate.userData.keepsStove = true;
  const sauce = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2)), std({ color: 0xc0391e, roughness: 0.1, transparent: true, opacity: 0.85, depthWrite: false }));
  sauce.position.y = 0.0095; sauce.visible = false; plate.add(sauce);

  // ---------------- 菜块：锅里、盘里各一个实例化网格 ----------------
  const MAX = 48;
  const chunkGeo = bin.add(new THREE.IcosahedronGeometry(1, 1));
  const chunkMat = std({ roughness: 0.35, metalness: 0.05 });
  const makeChunks = (parent: THREE.Object3D) => {
    const im = new THREE.InstancedMesh(chunkGeo, chunkMat, MAX); im.count = 0; im.frustumCulled = false; parent.add(im);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    return im;
  };
  const wokChunks = makeChunks(wok), plateChunks = makeChunks(plate);
  /** 一块菜：r（0–1，按锅的半径算）、a 角度；翻炒时从 (fr, fa) 被铲起、在空中翻个身落到 (r, a)（时间按翻炒进度 u 算，t0–t1） */
  type Chunk = { veg: Veg; r: number; a: number; s: THREE.Vector3; rot: THREE.Euler; seed: number; fr?: number; fa?: number; t0?: number; t1?: number; hop?: number; spin?: THREE.Euler; frot?: THREE.Euler };
  let pot: Chunk[] = [];
  const scaleFor = (veg: Veg, r: () => number) => veg === 'tomato' ? new THREE.Vector3(0.016, 0.011, 0.013).multiplyScalar(0.85 + r() * 0.4)
    : veg === 'egg' ? new THREE.Vector3(0.017, 0.01, 0.015).multiplyScalar(0.8 + r() * 0.5)
    : veg === 'scallion' ? new THREE.Vector3(0.006, 0.005, 0.012).multiplyScalar(0.8 + r() * 0.4)
    : veg === 'chicken' ? new THREE.Vector3(0.015, 0.011, 0.013).multiplyScalar(0.85 + r() * 0.35)
    : new THREE.Vector3(0.024, 0.0035, 0.018).multiplyScalar(0.8 + r() * 0.5);
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  /** 颜色：熟的程度 0–3 慢慢变深一点、变亮油；糊了变成焦黑 */
  const chunkColor = (c: Chunk, done: number, burnt: number, out: THREE.Color) => {
    out.setHex(VEG_COLOR[c.veg]);
    if (c.veg === 'egg') out.lerp(new THREE.Color(0xe8a93a), done * 0.12);
    else if (c.veg === 'cabbage' || c.veg === 'lettuce') out.lerp(new THREE.Color(0x8aa84a), done * 0.12);
    else if (c.veg === 'tomato') out.lerp(new THREE.Color(0xb3200f), done * 0.12);
    else if (c.veg === 'chicken') out.lerp(new THREE.Color(0xc98a4a), Math.min(1, done * 0.3)); // 生鸡肉的粉色炒成金黄
    out.multiplyScalar(0.92 + (c.seed % 1) * 0.16);
    return out.lerp(new THREE.Color(0x1d140e), burnt);
  };
  const tmpC = new THREE.Color();
  const eA = new THREE.Euler(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  const layout = (im: THREE.InstancedMesh, list: Chunk[], surf: (r: number) => number, rMax: number, jump: number, t: number, done: number, burnt: number, u = -1) => {
    im.count = list.length;
    list.forEach((c, i) => {
      let rr = c.r * rMax, ang = c.a, lift = 0;
      q.setFromEuler(c.rot);
      if (u >= 0 && c.t0 !== undefined && c.t1 !== undefined && c.fr !== undefined && c.fa !== undefined) {
        // 被铲起来：先贴着锅面往前推一小段，再抛起、翻身、落到新位置
        const k = THREE.MathUtils.clamp((u - c.t0) / (c.t1 - c.t0), 0, 1), ke = k * k * (3 - 2 * k);
        const x0 = Math.cos(c.fa) * c.fr * rMax, z0 = Math.sin(c.fa) * c.fr * rMax, x1 = Math.cos(c.a) * rr, z1 = Math.sin(c.a) * rr;
        const x = x0 + (x1 - x0) * ke, z = z0 + (z1 - z0) * ke;
        rr = Math.hypot(x, z); ang = Math.atan2(z, x);
        lift = Math.sin(k * Math.PI) * (c.hop ?? 0.03);
        if (c.frot && c.spin) { qA.setFromEuler(c.frot); qB.setFromEuler(eA.set(c.rot.x + c.spin.x * (1 - ke), c.rot.y + c.spin.y * (1 - ke), c.rot.z + c.spin.z * (1 - ke))); q.copy(qA).slerp(qB, ke); }
      }
      const h = surf(Math.min(rr, rMax)) + c.s.y * 0.8 + (i % 3) * 0.004 * (1 - rr / rMax) + Math.max(0, Math.sin(t * 9 + c.seed * 7)) * jump * (0.5 + (c.seed % 0.5)) + lift;
      v.set(Math.cos(ang) * rr, h, Math.sin(ang) * rr);
      m4.compose(v, q, s3.copy(c.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, chunkColor(c, done, burnt, tmpC));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
  /** 开始翻一下：每块菜记下现在的位置，挑一个新位置；铲子从靠人那边推到对面，所以离人近的先被铲到、对面的最后被翻回来 */
  const tossPlan = () => {
    const hx = Math.sin(STROKE_YAW), hz = Math.cos(STROKE_YAW);
    for (const c of pot) {
      c.fr = c.r; c.fa = c.a; c.frot = c.rot.clone();
      const proj = (Math.cos(c.a) * hx + Math.sin(c.a) * hz) * c.r; // -1（对面）… 1（靠人）
      c.t0 = 0.2 + 0.32 * (1 - (proj + 1) / 2) + rnd() * 0.04;
      c.t1 = Math.min(0.97, Math.max(c.t0 + 0.25, 0.68 + rnd() * 0.24));
      c.hop = 0.025 + rnd() * 0.04;
      c.r = Math.sqrt(rnd()) * 0.95; c.a = rnd() * Math.PI * 2;
      c.spin = new THREE.Euler((rnd() - 0.5) * 7, (rnd() - 0.5) * 4, (rnd() - 0.5) * 7);
      c.rot.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
    }
  };

  // ---------------- 热气、油烟 ----------------
  const smokeTex = bin.add(canvasTex(64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }));
  const smokes = Array.from({ length: 6 }, (_, i) => { const sp = new THREE.Sprite(bin.add(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }))); sp.visible = false; world.add(sp); return { sp, ph: i / 6 }; });
  const updSmoke = (src: THREE.Vector3, strength: number, dark: number, t: number) => {
    for (const s of smokes) {
      const k = (t * 0.5 + s.ph) % 1; s.sp.visible = strength > 0.02;
      if (!s.sp.visible) continue;
      s.sp.position.set(src.x + Math.sin(t * 2 + s.ph * 9) * 0.03 * k, src.y + k * 0.3, src.z + Math.cos(t * 1.7 + s.ph * 5) * 0.03 * k);
      s.sp.scale.setScalar(0.05 + k * 0.12);
      const mm = s.sp.material as THREE.SpriteMaterial; mm.opacity = Math.sin(k * Math.PI) * 0.55 * strength; mm.color.setScalar(1 - dark * 0.75);
    }
  };

  // ---------------- 声音（现合成）----------------
  let ac: AudioContext | null = null, sizzle: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  const ensureAudio = () => { try { ac ??= audio(); } catch { ac = null; } };
  const tone = (f: number, dur: number, gain: number, at = 0, f2 = f, type: OscillatorType = 'sine') => {
    if (!ac) return; const t0 = ac.currentTime + 0.01 + at, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
  };
  const noise = (dur: number, f: number, q2: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0) => {
    if (!ac) return; const t0 = ac.currentTime + 0.01 + at, buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q2; const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl).connect(g).connect(ac.destination); src.start(t0); src.onended = () => { src.disconnect(); fl.disconnect(); g.disconnect(); };
  };
  const setSizzle = (level: number) => {
    if (!ac) return;
    if (!sizzle && level > 0.01) {
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35);
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 2500; const g = ac.createGain(); g.gain.value = 0;
      src.connect(fl).connect(g).connect(ac.destination); src.start(); sizzle = { src, g };
    }
    if (sizzle) sizzle.g.gain.setTargetAtTime(level * 0.25, ac.currentTime, 0.15);
  };

  // ---------------- 状态 ----------------
  let focused = false, fire = false, oil = 0, heat = 0; // oil：0 没油，1 有油；heat 0–1，1 = 冒烟
  let phase: 'prep' | 'cooking' | 'plating' = 'prep';
  let ct = 0, stirs = 0, nextPrompt = 3, prompt = false, promptAt = 0, burnt = 0, oilCold = false;
  const reactions: number[] = [];
  let pourT = -1, stirT = -1, plateT = -1;
  const stirFrom: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const tmpPose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  let plated: { list: Chunk[]; done: number; burnt: number; tomato: boolean; smoke: number } | null = null;
  const flies: { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; done: () => void }[] = [];
  const say = (msg: string | null) => { if (focused) emit(bus, 'cup:state', msg ? { msg } : null); };
  const vegIn = () => [...new Set(pot.map((c) => c.veg))];
  const hint = (): string => {
    if (phase === 'plating') return '出锅……';
    if (phase === 'cooking') {
      if (!fire) return '火关了，菜在锅里等着 · 拧旋钮点火接着炒';
      if (prompt) return '翻一下！点炒勺（或锅）';
      return `炒着呢……（翻了 ${stirs}/3 次）${stirs === 0 ? ' · 还能再放菜' : ''}`;
    }
    if (!fire && !oil) return '拧灶台前面左边的旋钮点火';
    if (!oil) return '点油壶，往锅里倒油';
    if (!fire) return '锅里有油了 · 拧旋钮点火';
    if (heat < 1) return '油在热……等它冒烟';
    return `油冒烟了 · 点筐里的菜放进锅（可以放好几样）${chickenStock > 0 ? ` · 还有 ${chickenStock} 盘鸡肉` : ' · 窗外的鸡也能抓来炒'}`;
  };
  const refresh = () => say(hint());
  const setFire = (on2: boolean) => {
    fire = on2; knobs[0].rotation.z = fire ? -Math.PI / 2 : 0;
    if (fire) { tone(2400, 0.03, 0.12); tone(2400, 0.03, 0.12, 0.12); noise(0.5, 600, 0.6, 0.35, 'lowpass', 0.22); }
    else noise(0.15, 400, 0.6, 0.15, 'lowpass');
    refresh();
  };

  const onKnob = () => { if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio(); if (phase === 'plating') return; setFire(!fire); };
  const onOil = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    if (phase !== 'prep' || pourT >= 0) return;
    if (oil) { say('锅里已经有油了'); setTimeout(refresh, 1300); return; }
    pourT = 0;
  };
  const onVeg = (k: Veg) => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    if (phase === 'plating' || pourT >= 0) return;
    if (k === 'chicken' && chickenStock <= 0) { say('没有鸡肉了 · 去窗外抓一只鸡'); setTimeout(refresh, 1500); return; }
    if (!oil) { say('先倒油'); setTimeout(refresh, 1300); return; }
    if (phase === 'cooking' && stirs > 0) { say('已经开炒了，下一锅再放'); setTimeout(refresh, 1300); return; }
    if (pot.length + VEG_PORTION[k] > MAX) { say('锅满了'); setTimeout(refresh, 1300); return; }
    // 菜从筐里飞进锅
    const src = vegMeshes[k]!;
    const fly = src.clone(); fly.position.copy(src.getWorldPosition(new THREE.Vector3())); fly.rotation.y = Math.PI / 2; world.add(fly);
    if (k === 'chicken') { chickenStock--; meat.visible = chickenStock > 0; }
    const to = wok.localToWorld(new THREE.Vector3(0, 0.05, 0));
    flies.push({ obj: fly, from: fly.position.clone(), to, t: 0, done: () => {
      world.remove(fly);
      for (let i = 0; i < VEG_PORTION[k]; i++) pot.push({ veg: k, r: Math.sqrt(rnd()) * 0.95, a: rnd() * Math.PI * 2, s: scaleFor(k, rnd), rot: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3), seed: rnd() * 10 });
      noise(0.6, 3000, 0.5, 0.4, 'highpass'); // 下锅「刺啦」一声
      if (phase === 'prep') { phase = 'cooking'; ct = 0; stirs = 0; nextPrompt = 3; prompt = false; burnt = 0; reactions.length = 0; oilCold = heat < 1; }
      refresh();
    } });
  };
  const onStir = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    if (phase !== 'cooking' || stirT >= 0) { if (phase === 'prep') { say('先点火倒油、下菜，再用锅铲翻'); setTimeout(refresh, 1500); } return; }
    stirT = 0; stirFrom.p.copy(spatula.position); stirFrom.q.copy(spatula.quaternion); tossPlan();
    noise(0.45, 1800, 0.8, 0.12, 'bandpass', 0.12); // 铲子刮锅底「嚓」
    tone(620, 0.07, 0.05, 0.5, 420, 'triangle'); noise(0.4, 3200, 0.6, 0.3, 'highpass', 0.5); // 翻过来、菜落回锅里「刺啦」
    if (prompt) {
      reactions.push(ct - promptAt); stirs++; prompt = false; nextPrompt = ct + 3;
      spatGlow.emissiveIntensity = 0;
      if (stirs >= 3) setTimeout(() => finish(false), 650);
    }
    refresh();
  };
  const onPlate = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; }
    if (plated && phase !== 'plating') { plated = null; plateChunks.count = 0; sauce.visible = false; emit(bus, 'dish:hide'); say('盘子收拾干净了'); setTimeout(refresh, 1300); }
  };
  knobs.forEach((k) => pick(k, { click: onKnob }));
  pick(oilBottle, { click: onOil });
  pick(spatula, { click: onStir });
  pick(wok, { click: onStir });
  pick(plate, { click: onPlate });

  /** 出锅：锅里的菜飞到盘子上；算菜名和喜欢程度，发 dish:show */
  const finish = (isBurnt: boolean) => {
    if (phase !== 'cooking') return;
    phase = 'plating'; prompt = false; spatGlow.emissiveIntensity = 0;
    const set = vegIn();
    const [name0, base, comment0] = recipeOf(set);
    let hearts = base, comment = comment0, name = name0;
    if (isBurnt) { hearts = 0; name = `糊了的${name0}`; comment = '黑乎乎的……下次提醒了就快翻'; }
    else {
      const avg = reactions.reduce((a, x) => a + x, 0) / Math.max(1, reactions.length);
      const notes: string[] = [];
      if (oilCold) { hearts--; notes.push('油还没热就下锅了，有点粘'); }
      if (avg > 1.3) { hearts--; notes.push('翻得慢了点，有点焦边'); }
      else if (avg < 0.7 && !oilCold) notes.push('火候正好');
      hearts = Math.max(1, Math.min(5, hearts));
      if (notes.length) comment = `${comment0}。${notes.join('，')}`;
    }
    const list = pot; pot = [];
    plateT = 0;
    const from = wok.localToWorld(new THREE.Vector3(0, 0.05, 0)), to = plate.localToWorld(new THREE.Vector3(0, 0.03, 0));
    const fly = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.06, 10, 8).scale(1, 0.4, 1)), std({ color: isBurnt ? 0x1d140e : VEG_COLOR[list[0]?.veg ?? 'egg'], roughness: 0.5 }));
    fly.position.copy(from); world.add(fly);
    flies.push({ obj: fly, from, to, t: 0, done: () => {
      world.remove(fly);
      plated = { list: list.map((c) => ({ ...c, r: Math.min(1, c.r * 1.05) })), done: 3, burnt: isBurnt ? 1 : 0, tomato: set.includes('tomato') && !isBurnt, smoke: isBurnt ? 1 : 0.6 };
      sauce.visible = !isBurnt; (sauce.material as THREE.MeshStandardMaterial).color.setHex(set.includes('tomato') ? 0xc0391e : 0xd9a52a);
      (sauce.material as THREE.MeshStandardMaterial).opacity = set.includes('tomato') ? 0.85 : 0.45;
      emit(bus, 'dish:show', { name, hearts, comment, burnt: isBurnt });
      // 一锅做完：关火、锅里的油用完了
      setFire(false); oil = 0; heat = 0; oilDisc.visible = false;
      phase = 'prep'; burnt = 0; wokChunks.count = 0;
      say(isBurnt ? '糊了……点盘子收拾，再来一锅' : '出锅！点盘子收拾，再来一锅');
    } });
    if (isBurnt) { tone(140, 0.6, 0.12, 0, 90, 'sawtooth'); }
    else { tone(880, 0.12, 0.08); tone(1320, 0.2, 0.06, 0.1); }
    setSizzle(0);
  };

  const off = [
    on(bus, 'stove:focus', () => { focused = true; refresh(); }),
    on(bus, 'stove:blur', () => { focused = false; emit(bus, 'dish:hide'); }),
  ];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.keepsStove) o.userData.keepsStove = true; });
  root.userData.keepsStove = true;
  pick(root, { click: () => { if (!focused) emit(bus, 'stove:focus'); } });

  return {
    frame(dt, t) {
      // 火苗
      flame.visible = fire;
      if (fire) {
        for (let i = 0; i < FL; i++) {
          const a = (i / FL) * Math.PI * 2, fl = 0.8 + 0.35 * Math.sin(t * 23 + i * 2.1) + 0.15 * Math.sin(t * 37 + i);
          v.set(BURN[0].x + Math.cos(a) * 0.04, Y0 + 0.018, BURN[0].z + Math.sin(a) * 0.04);
          q.setFromEuler(e.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95));
          m4.compose(v, q, s3.set(1, fl, 1)); flame.setMatrixAt(i, m4);
        }
        flame.instanceMatrix.needsUpdate = true;
      }
      // 倒油：油壶提起来、挪到锅上方、倾倒，一道金黄的油流，锅里出现一汪油
      if (pourT >= 0) {
        pourT = Math.min(1, pourT + dt / 2.2);
        const go = THREE.MathUtils.smootherstep(pourT, 0, 0.3) * (1 - THREE.MathUtils.smootherstep(pourT, 0.8, 1)), tilt = THREE.MathUtils.smootherstep(pourT, 0.3, 0.42) * (1 - THREE.MathUtils.smootherstep(pourT, 0.68, 0.8));
        const target = WOK.clone().add(new THREE.Vector3(0.12, 0.2, -0.02));
        oilBottle.position.lerpVectors(OIL_HOME, target, go);
        oilBottle.rotation.set(0, 0, 2.0 * tilt);
        if (pourT > 0.42 && pourT < 0.7) { oilDisc.visible = true; oilDisc.scale.setScalar(Math.min(1, (pourT - 0.42) / 0.25)); if (pourT - dt / 2.2 <= 0.42) noise(0.8, 500, 1.2, 0.2); }
        if (pourT >= 1) { pourT = -1; oil = 1; oilBottle.position.copy(OIL_HOME); oilBottle.rotation.set(0, 0, 0); refresh(); }
      }
      // 油温：有火有油慢慢热，4 秒冒烟
      if (oil && fire && phase === 'prep') { const was = heat; heat = Math.min(1.4, heat + dt / 4); if (was < 1 && heat >= 1) refresh(); }
      else if (!fire) heat = Math.max(0, heat - dt / 8);
      oilM.color.setHex(0xd9a52a).lerp(new THREE.Color(0xf0c24a), Math.min(1, heat));
      // 炒：每 3 秒提醒翻一下，提醒后 2 秒没翻就糊了
      if (phase === 'cooking' && fire) {
        ct += dt;
        if (!prompt && ct >= nextPrompt) { prompt = true; promptAt = ct; tone(1180, 0.15, 0.08); tone(1580, 0.18, 0.06, 0.12); refresh(); }
        if (prompt) {
          spatGlow.emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 14);
          burnt = Math.max(0, (ct - promptAt - 1.2) / 0.8) * 0.6; // 快到时间了，锅里先开始发黑
          if (ct - promptAt > 2) { burnt = 1; finish(true); }
        }
      }
      setSizzle(phase === 'cooking' && fire ? 1 : oil && fire && heat > 0.6 ? 0.25 : 0);
      // 翻炒（用户嫌过「炒勺炒菜的动作不够逼真」）：锅铲从搁着的地方抬起来，铲面贴着锅底从靠人这边推到对面锅壁，
      // 顺着锅壁往上一铲、手腕一翻把菜翻回来；菜按被铲到的先后抛起、翻个身落到新位置；锅跟着往前一送、一颠
      let jump = phase === 'cooking' && fire ? 0.004 : 0, u = -1;
      if (stirT >= 0) {
        stirT = Math.min(1, stirT + dt / 0.95); u = stirT;
        const sm = THREE.MathUtils.smootherstep;
        const S0 = inWok(0.115, STROKE_YAW), S1 = inWok(-0.085, STROKE_YAW);
        const FLIP = inWok(-0.02, STROKE_YAW + 0.15, 0.065, 0.55, -1.15);
        const mix = (A: Pose, B: Pose, k: number, arc = 0) => { tmpPose.p.lerpVectors(A.p, B.p, k); tmpPose.p.y += Math.sin(k * Math.PI) * arc; tmpPose.q.copy(A.q).slerp(B.q, k); return tmpPose; };
        let P: Pose;
        if (u < 0.16) P = mix(stirFrom, S0, sm(u, 0, 0.16), 0.03);
        else if (u < 0.55) { const k = sm(u, 0.16, 0.55); P = inWok(0.115 - 0.2 * k, STROKE_YAW + Math.sin(k * Math.PI) * 0.08); }
        else if (u < 0.74) P = mix(S1, FLIP, sm(u, 0.55, 0.74));
        else P = mix(FLIP, REST, sm(u, 0.74, 1), 0.02);
        spatula.position.copy(P.p); spatula.quaternion.copy(P.q);
        // 锅：推的时候稳着，翻的那一下往前送、再往回一颠
        const toss = Math.sin(THREE.MathUtils.clamp((u - 0.5) / 0.4, 0, 1) * Math.PI);
        wok.position.set(WOK.x - Math.sin(STROKE_YAW) * toss * 0.012, WOK.y + Math.max(0, Math.sin(THREE.MathUtils.clamp((u - 0.62) / 0.25, 0, 1) * Math.PI)) * 0.012, WOK.z - Math.cos(STROKE_YAW) * toss * 0.012);
        wok.rotation.x = -toss * 0.05;
        if (stirT >= 1) { stirT = -1; wok.position.copy(WOK); wok.rotation.x = 0; for (const c of pot) c.t0 = c.t1 = undefined; }
      } else {
        // 平时：开炒以后搁在锅里（柄靠着锅沿），别的时候挂回墙上；换地方时顺着走过去
        const goal = phase === 'cooking' || phase === 'plating' ? REST : HANG, k = 1 - Math.exp(-dt * 7);
        spatula.position.lerp(goal.p, k); spatula.quaternion.slerp(goal.q, k);
      }
      // 锅里的菜
      if (pot.length) layout(wokChunks, pot, (r) => wokY(r) + 0.006, 0.12, jump, t, stirs, burnt, u);
      else wokChunks.count = 0;
      // 盘里的菜：堆在中间、外圈低；糊了冒黑烟
      if (plated) {
        layout(plateChunks, plated.list, (r) => 0.012 + Math.max(0, 0.03 - r * 0.3), 0.085, 0, t, plated.done, plated.burnt);
        plated.smoke = Math.max(plated.burnt ? 0.4 : 0, plated.smoke - dt / 12);
      }
      // 烟：油冒烟时白烟；炒着时白汽；糊了黑烟；刚盛盘的菜冒一会儿热气
      const wokTop = wok.localToWorld(v.set(0, 0.06, 0)).clone();
      if (phase === 'cooking' || (oil && heat >= 1)) updSmoke(wokTop, phase === 'cooking' ? 0.8 + burnt : Math.min(1, heat - 0.9) * 2, burnt, t);
      else if (plated && plated.smoke > 0.02) updSmoke(plate.localToWorld(v.set(0, 0.03, 0)).clone(), plated.smoke, plated.burnt, t);
      else updSmoke(wokTop, 0, 0, t);
      // 飞行中的东西
      for (let i = flies.length - 1; i >= 0; i--) {
        const f = flies[i]; f.t = Math.min(1, f.t + dt / 0.55);
        f.obj.position.lerpVectors(f.from, f.to, f.t); f.obj.position.y += Math.sin(f.t * Math.PI) * 0.12;
        if (f.t >= 1) { flies.splice(i, 1); f.done(); }
      }
      if (plateT >= 0) { plateT += dt; if (plateT > 1) plateT = -1; }
      void camera;
    },
    stop() {
      off.forEach((f) => f()); sizzle?.src.stop(); sizzle?.src.disconnect();
      scene.remove(root, world); bin.dispose();
    },
  };
};
