import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
import { L } from '../layout';
import { drawAward, drawXiaozan } from '../medals';
import { Batch, blob, canvasTex, contactMaterial, rbox, rng, speckle, usePhotoTexture } from '../util';

/**
 * 右墙边的书架（用户要的：「在房间右侧加一个书架，书架顶上放着附件这两张照片的荣誉」）。
 * - 书架：深色实木（和书桌同一张胡桃木照片贴图，压暗），顶上一圈出檐的檐板、四层隔板、底座；格子里摆着几排书、一摞平放的书和一只青瓷罐。
 * - 顶上两座奖杯照着用户给的照片做：竹间 7 周年「匠心独运奖」（2022.08.25，蓝紫渐变 + 星球）、
 *   竹间 6 周年「最具潜力奖」（2021.08.25，深蓝星空 + 星座连线）。黑色梯形底座正面烫金字；
 *   上面是一片印刷的水晶（顶边是 V 形，金字竖排、名字、EMOTIBOT），后面两片交叉的水晶（一片透明往左高、一片带色往右高）。
 *   金字用 metalnessMap 做成半金属，再加一点只在金字上的自发光（全金属时只映出灰墙，金字发暗）。
 * - 两座奖杯中间立着三枚荣誉勋章（用户后来要的，给的是截图）：2025 Q2、2025 Q4 两枚「百度小赞」、一枚「2023 季度 Award」。
 *   勋章图案直接从用户的截图里抠出来（public/assets/trophies/，背景色按距离渐隐成透明），贴在一片薄薄的勋章上，
 *   立在黑色亚克力小支架上，脚下一块印着名字的小铭牌。
 * 默认视角看不到这里（转到右边才看得到），不投实时阴影——书架的影子烘在光照贴图里（tools/bake_lighting.py）。
 */
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
const S = L.trophyShelf;

/** 三枚勋章：图案文件、铭牌上的两行字 */
const MEDALS = [
  { img: 'xiaozan', l1: '百度小赞', l2: '2025 Q2' },
  { img: 'xiaozan', l1: '百度小赞', l2: '2025 Q4' },
  { img: 'award-2023', l1: '季度 Award', l2: '2023' },
];
type Award = { title: string; name: string; base: string; date: string; theme: 'planets' | 'stars'; tint: number; logo2: boolean };
const AWARDS: Award[] = [
  { title: '匠心独运奖', name: '李龙威', base: '竹间7周年', date: '2022.08.25', theme: 'planets', tint: 0x6f86e8, logo2: false },
  { title: '最具潜力奖', name: '李龙威', base: '竹间6周年', date: '2021.08.25', theme: 'stars', tint: 0x9b84ea, logo2: true },
];

/** 金字：渐变金 + 一点颗粒（颜色图）；同样的位置在金属度图上画白色 */
const gold = (g: CanvasRenderingContext2D, y0: number, y1: number) => {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#f6dc8a'); gr.addColorStop(0.45, '#d9ad45'); gr.addColorStop(0.55, '#c99a33'); gr.addColorStop(1, '#f0cf73');
  return gr;
};

/** 印刷面：背景（渐变、星球或星空）+ 竖排奖项名 + 横排名字 + logo。返回颜色图和金属度图 */
function panelTextures(bin: Bin, a: Award) {
  const W = 360, H = 860;
  const draw = (metal: boolean, glow = false) => canvasTex(W, H, (g) => {
    if (!metal) {
      const bg = g.createLinearGradient(0, 0, 0, H);
      if (a.theme === 'planets') { bg.addColorStop(0, '#6e8fe8'); bg.addColorStop(0.45, '#8c8be6'); bg.addColorStop(0.8, '#9c86dc'); bg.addColorStop(1, '#5a4aa8'); }
      else { bg.addColorStop(0, '#6f8de0'); bg.addColorStop(0.5, '#3f67d2'); bg.addColorStop(0.85, '#2f4fae'); bg.addColorStop(1, '#1d2a5c'); }
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // 中间一片柔和的亮光（照片上水晶中部发白）
      const glow = g.createRadialGradient(W * 0.45, H * 0.55, 10, W * 0.45, H * 0.55, W * 0.9);
      glow.addColorStop(0, 'rgba(235,225,255,.35)'); glow.addColorStop(1, 'rgba(235,225,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      const q = rng(a.theme === 'planets' ? 7 : 6);
      if (a.theme === 'planets') {
        const planet = (x: number, y: number, r: number, c: string, ring: boolean) => {
          const pg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r); pg.addColorStop(0, '#f2eaff'); pg.addColorStop(1, c);
          g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
          if (ring) { g.strokeStyle = 'rgba(240,230,255,.75)'; g.lineWidth = r * 0.18; g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.45, -0.35, 0, 7); g.stroke(); }
        };
        planet(W * 0.8, H * 0.24, 26, '#b9a6e6', true); planet(W * 0.12, H * 0.13, 14, '#9d8fe0', true);
        planet(W * 0.1, H * 0.42, 12, '#c7b6ef', false); planet(W * 0.86, H * 0.36, 7, '#a98ad8', false); planet(W * 0.92, H * 0.62, 9, '#b39ae2', false);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + q() * 0.5})`; g.beginPath(); g.arc(q() * W, q() * H, 0.8 + q() * 2.2, 0, 7); g.fill(); }
      } else {
        for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + q() * 0.6})`; g.beginPath(); g.arc(q() * W, q() * H, 0.6 + q() * 2.2, 0, 7); g.fill(); }
        // 星座连线（照片右上角）
        g.strokeStyle = 'rgba(220,230,255,.55)'; g.lineWidth = 1.4;
        const pts: [number, number][] = [[W * 0.98, H * 0.18], [W * 0.82, H * 0.24], [W * 0.66, H * 0.27], [W * 0.7, H * 0.36], [W * 0.88, H * 0.42], [W * 0.66, H * 0.27], [W * 0.5, H * 0.33]];
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        for (const [x, y] of pts) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
        speckle(g, W, H, 9, 3000, '255,255,255', 0.12);
      }
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
    const ink = (y0: number, y1: number) => (metal && !glow ? '#fff' : gold(g, y0, y1));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // 竖排奖项名
    const chars = [...a.title], size = 62, top = H * 0.19, step = size * 1.3;
    g.font = `500 ${size}px ${SANS}`;
    chars.forEach((ch, i) => { const y = top + i * step; g.fillStyle = ink(y - size / 2, y + size / 2); g.fillText(ch, W * 0.46, y); });
    // 名字
    const ny = top + chars.length * step + size * 0.9;
    g.font = `600 ${size * 0.92}px ${SANS}`; g.fillStyle = ink(ny - size / 2, ny + size / 2); g.fillText(a.name, W * 0.48, ny);
    // logo：一个小书形标 + EMOTIBOT（2021 那座上面还有「竹间」两个字）
    const ly = H * 0.93;
    g.fillStyle = glow ? '#000' : metal ? '#666' : 'rgba(250,236,200,.9)';
    if (a.logo2) { g.font = `500 22px ${SANS}`; g.fillText('竹间', W * 0.53, ly - 30); g.fillRect(W * 0.38, ly - 40, 16, 18); }
    g.font = `600 18px ${SANS}`; g.fillText('E M O T I B O T', W * 0.5, ly);
    if (!a.logo2) g.fillRect(W * 0.25, ly - 9, 14, 16);
  });
  const map = bin.add(draw(false)), metal = bin.add(draw(true)), glow = bin.add(draw(true, true));
  map.anisotropy = 8;
  return { map, metal, glow };
}

/** 底座正面：黑底透明，烫金的「竹间X周年」+ 日期 */
function baseTextures(bin: Bin, a: Award) {
  const W = 512, H = 300;
  const draw = (metal: boolean, glow = false) => canvasTex(W, H, (g) => {
    if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); } else g.clearRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 92px ${SANS}`; g.fillStyle = metal && !glow ? '#fff' : gold(g, 100, 190); g.fillText(a.base, W / 2, H * 0.47);
    g.font = `500 34px ${SANS}`; g.fillStyle = metal && !glow ? '#fff' : '#e3c375'; g.fillText(a.date, W / 2, H * 0.8);
  });
  return { map: bin.add(draw(false)), metal: bin.add(draw(true)), glow: bin.add(draw(true, true)) };
}

/** 一片水晶的轮廓：底边窄、往上略宽，顶边按 top 给的几个点走 */
const panelShape = (bw: number, tw: number, top: [number, number][]) => {
  const s = new THREE.Shape();
  s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(tw / 2, top[top.length - 1][1]);
  for (let i = top.length - 2; i >= 0; i--) s.lineTo(top[i][0], top[i][1]);
  s.lineTo(-tw / 2, top[0][1]); s.closePath();
  return s;
};

export const trophyShelf: SceneObject = ({ scene, tier, pick, bus, data }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const fy = L.floorY;
  const root = new THREE.Group();
  root.position.set(S.x, fy, S.z);
  root.rotation.y = -Math.PI / 2; // 本地 +z（正面）朝世界 -x，背靠右墙
  scene.add(root);

  // ---------------- 书架 ----------------
  const wood = bin.add(new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.55 }));
  usePhotoTexture(bin, wood, 'walnut_veneer', { repeat: [1, 1.6], color: [0.42, 0.26, 0.18] });
  const W = S.w, D = S.d, H = S.h, T = 0.028;
  const b = new Batch();
  for (const sx of [-1, 1]) b.add(wood, rbox(T, H - 0.06, D, 0.004), [sx * (W / 2 - T / 2), (H - 0.06) / 2 + 0.03, 0]);
  b.add(wood, rbox(W + 0.06, 0.036, D + 0.04, 0.008), [0, H - 0.018, 0.01]);              // 出檐的顶板
  b.add(wood, rbox(W + 0.02, 0.02, D + 0.02, 0.004), [0, H - 0.046, 0.005]);              // 顶板下的一道线脚
  b.add(wood, rbox(W, 0.085, D - 0.01, 0.006), [0, 0.0425 + 0.005, 0]);                  // 底座
  b.add(wood, new THREE.BoxGeometry(W - 2 * T, H - 0.12, 0.012), [0, H / 2, -D / 2 + 0.006]); // 背板
  const SHELVES = [0.09, 0.45, 0.82, 1.18];
  for (const y of SHELVES.slice(1)) b.add(wood, rbox(W - 2 * T + 0.004, 0.022, D - 0.02, 0.003), [0, y, 0.005]);
  // 底座和顶上的回纹牙条（一排小方块，中式的味道）
  for (let i = 0; i < 11; i++) b.add(wood, rbox(0.04, 0.012, 0.012, 0.002), [-W / 2 + 0.09 + i * 0.072, H - 0.065, D / 2 - 0.004]);
  // 格子里的东西
  const deco = bin.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  const spineTex = bin.add(canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 18, w, 6); g.fillRect(0, h - 24, w, 6);
    g.fillStyle = 'rgba(255,230,160,.6)'; g.fillRect(8, 50, w - 16, 3); g.fillRect(14, 70, w - 28, 26); g.fillRect(8, h - 60, w - 16, 3);
    speckle(g, w, h, 3, 400, '0,0,0', 0.08);
  }));
  const bookMat = bin.add(new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.7 }));
  const books: { x: number; y: number; w: number; h: number; d: number; tilt: number; flat?: boolean; c: number }[] = [];
  const r = rng(31), COLS = [0x7a2a24, 0x2c4a6b, 0x355a3a, 0x6b5426, 0x3b3550, 0x8a6a3a, 0x1f3a4a, 0x5a2a3a, 0xb59c74, 0x23302a];
  const row = (y: number, x0: number, x1: number, hMax: number) => {
    let x = x0;
    while (x < x1) {
      const w = 0.022 + r() * 0.026, h = hMax * (0.72 + r() * 0.26);
      if (x + w > x1) break;
      books.push({ x: x + w / 2, y, w, h, d: 0.15 + r() * 0.07, tilt: 0, c: COLS[Math.floor(r() * COLS.length)] });
      x += w + 0.002;
    }
    // 最后一本斜靠着
    const lw = 0.03, lh = hMax * 0.85, lean = 0.32;
    books.push({ x: x + Math.sin(lean) * lh / 2 + lw / 2, y, w: lw, h: lh, d: 0.17, tilt: -lean, c: COLS[Math.floor(r() * COLS.length)] });
  };
  const inner = W / 2 - T - 0.01;
  row(SHELVES[0] + 0.0, -inner, 0.22, 0.32);
  row(SHELVES[1] + 0.011, -inner, -0.02, 0.3);
  row(SHELVES[3] + 0.011, 0.0, inner - 0.12, 0.26); // 顶格左边是开源项目那排（见下面）
  // 平放的一摞
  for (let i = 0; i < 4; i++) books.push({ x: 0.2 + (r() - 0.5) * 0.02, y: SHELVES[1] + 0.011 + i * 0.032, w: 0.24 - i * 0.015, h: 0.03, d: 0.17 - i * 0.008, tilt: 0, flat: true, c: COLS[Math.floor(r() * COLS.length)] });
  for (let i = 0; i < 3; i++) books.push({ x: -0.25, y: SHELVES[2] + 0.011 + i * 0.034, w: 0.22 - i * 0.02, h: 0.032, d: 0.16, tilt: 0, flat: true, c: COLS[Math.floor(r() * COLS.length)] });
  const bookMesh = new THREE.InstancedMesh(bin.add(new THREE.BoxGeometry(1, 1, 1)), bookMat, books.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  books.forEach((bk, i) => {
    const pos = new THREE.Vector3(bk.x, bk.y + bk.h / 2 * Math.cos(bk.tilt), -D / 2 + 0.02 + bk.d / 2);
    m.compose(pos, q.setFromEuler(e.set(0, bk.flat ? (r() - 0.5) * 0.15 : 0, bk.tilt)), new THREE.Vector3(bk.w, bk.h, bk.d));
    bookMesh.setMatrixAt(i, m); bookMesh.setColorAt(i, c.setHex(bk.c));
  });
  bookMesh.receiveShadow = high;
  root.add(bookMesh);
  // 青瓷罐、一只小香炉
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const tintGeo = (g: THREE.BufferGeometry, hex: number) => { const n = g.getAttribute('position').count, a = new Float32Array(n * 3), cc = new THREE.Color(hex); for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
  const db = new Batch(['position', 'normal', 'uv', 'color']);
  db.add(deco, tintGeo(lathe([[0, 0], [0.05, 0.004], [0.075, 0.06], [0.07, 0.13], [0.04, 0.165], [0.038, 0.18], [0.045, 0.185], [0, 0.186]]), 0x9cc3ad), [0.22, SHELVES[2] + 0.011, 0]);
  db.add(deco, tintGeo(lathe([[0, 0], [0.045, 0.002], [0.055, 0.035], [0.05, 0.06], [0.056, 0.064], [0, 0.064]]), 0x7a5a2a), [0.3, SHELVES[3] + 0.011, 0.02]);
  b.build(root, bin, { receive: high, collapse: true });
  db.build(root, bin, { receive: high, collapse: true });
  // 地上的接触阴影
  const cb = new Batch(); cb.add(contactMaterial(bin, high ? 0.35 : 0.6), blob(W + 0.14, D + 0.16), [0, 0.016, 0]); cb.build(root, bin);

  // ---------------- 奖杯 ----------------
  const glassClear = bin.add(new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }));
  const baseMat = bin.add(new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.3, metalness: 0.2, flatShading: true }));
  const groups: THREE.Group[] = [];
  const texs: { base: ReturnType<typeof baseTextures>; face?: ReturnType<typeof panelTextures> }[] = [];
  AWARDS.forEach((a, i) => {
    const t = new THREE.Group();
    t.position.set(i === 0 ? -0.2 : 0.2, H, 0.02);
    t.rotation.y = i === 0 ? 0.18 : -0.12; // 稍微朝屋里转一点
    root.add(t);
    // 底座：黑色梯形台（上 10.5×6、下 13×7.4、高 7 厘米）
    const bh = 0.07, tw = 0.105, bw = 0.13;
    const baseGeo = new THREE.CylinderGeometry(tw / Math.SQRT2, bw / Math.SQRT2, bh, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.57);
    const base = new THREE.Mesh(bin.add(baseGeo), baseMat); base.position.y = bh / 2; t.add(base); base.userData.part = 'base';
    const bt = baseTextures(bin, a); texs.push({ base: bt });
    const baseFace = new THREE.Mesh(bin.add(new THREE.PlaneGeometry((tw + bw) / 2 * 0.98, bh * 0.98)),
      bin.add(new THREE.MeshStandardMaterial({ map: bt.map, metalnessMap: bt.metal, metalness: 0.55, roughness: 0.35, emissive: 0xffffff, emissiveMap: bt.glow, emissiveIntensity: 0.32, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    const zFront = (bw * 0.57 + tw * 0.57) / 4; // 正面在半高处离中心的距离
    baseFace.position.set(0, bh / 2, zFront + 0.0006); baseFace.rotation.x = -Math.atan(((bw - tw) * 0.57 / 2) / bh);
    t.add(baseFace); baseFace.userData.part = 'baseFace';
    // 后面两片交叉的水晶：一片透明往左高，一片带色往右高
    const back = (shape: THREE.Shape, mat: THREE.Material, z: number, part: string) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.005, bevelEnabled: false });
      const mesh = new THREE.Mesh(bin.add(g), mat); mesh.position.set(0, bh - 0.004, z); mesh.renderOrder = 1; t.add(mesh); mesh.userData.part = part;
      if (part === 'tint') mesh.userData.tint = a.tint;
    };
    back(panelShape(0.07, 0.092, [[-0.046, 0.3], [0.046, 0.236]]), glassClear, -0.016, 'clear');
    back(panelShape(0.07, 0.098, [[-0.049, 0.232], [0.049, 0.284]]), bin.add(new THREE.MeshStandardMaterial({ color: a.tint, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })), -0.009, 'tint');
    // 正面印刷的那片：顶边是 V 形。印刷面单独一个网格，uv 按外接框归一化
    const frontShape = panelShape(0.07, 0.09, [[-0.045, 0.215], [0.006, 0.197], [0.045, 0.21]]);
    const edge = new THREE.Mesh(bin.add(new THREE.ExtrudeGeometry(frontShape, { depth: 0.006, bevelEnabled: false })), glassClear);
    edge.position.set(0, bh - 0.004, -0.003); edge.renderOrder = 2; t.add(edge); edge.userData.part = 'clear';
    const faceGeo = new THREE.ShapeGeometry(frontShape);
    const p = faceGeo.attributes.position, uv = faceGeo.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getX(k) + 0.045) / 0.09, p.getY(k) / 0.215);
    const pt = panelTextures(bin, a); texs[i].face = pt;
    const face = new THREE.Mesh(bin.add(faceGeo), bin.add(new THREE.MeshStandardMaterial({ map: pt.map, metalnessMap: pt.metal, metalness: 0.55, roughness: 0.28, emissive: 0xffffff, emissiveMap: pt.glow, emissiveIntensity: 0.3, envMapIntensity: 1.3, transparent: true, opacity: 0.93 })));
    face.position.set(0, bh - 0.004, 0.0032); face.renderOrder = 3; t.add(face); face.userData.part = 'face';
    groups.push(t);
  });
  // 两座奖杯同类的零件合成一个网格（12 个 → 5 个 draw call：开场视角能看到书架以后，high 档贴着 520 的上限）：
  // 底座、透明水晶、带色水晶（颜色进顶点色）、底座金字和印刷面（两座的贴图左右拼成一张，uv 各占一半）
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts = new Map<string, { geo: THREE.BufferGeometry; i: number; tint?: number }[]>();
  groups.forEach((g, i) => g.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(inv.clone().multiply(m.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    const list = parts.get(m.userData.part) ?? []; list.push({ geo, i, tint: m.userData.tint }); parts.set(m.userData.part, list);
  }));
  const atlas = (pick2: (t: (typeof texs)[number]) => THREE.Texture) => {
    const imgs = texs.map((t) => pick2(t).image as HTMLCanvasElement);
    return bin.add(canvasTex(imgs[0].width * 2, imgs[0].height, (g, w) => imgs.forEach((im, k) => g.drawImage(im, k * w / 2, 0))));
  };
  const build = (part: string, mat: THREE.Material, order: number) => {
    const list = parts.get(part)!;
    for (const { geo, i, tint } of list) {
      if (part === 'face' || part === 'baseFace') { const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.5 + i * 0.5); }
      if (part === 'tint') { const c = new THREE.Color(tint), a = new Float32Array(geo.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) a.set([c.r, c.g, c.b], k); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    }
    const mesh = new THREE.Mesh(bin.add(mergeGeometries(list.map((x) => x.geo))), mat);
    list.forEach((x) => x.geo.dispose());
    mesh.renderOrder = order; root.add(mesh);
  };
  const faceTex = { map: atlas((t) => t.face!.map), metal: atlas((t) => t.face!.metal), glow: atlas((t) => t.face!.glow) };
  const baseTex = { map: atlas((t) => t.base.map), metal: atlas((t) => t.base.metal), glow: atlas((t) => t.base.glow) };
  faceTex.map.anisotropy = 8;
  build('base', baseMat, 0);
  build('clear', glassClear, 1);
  build('tint', bin.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })), 1);
  build('baseFace', bin.add(new THREE.MeshStandardMaterial({ map: baseTex.map, metalnessMap: baseTex.metal, metalness: 0.55, roughness: 0.35, emissive: 0xffffff, emissiveMap: baseTex.glow, emissiveIntensity: 0.32, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), 2);
  build('face', bin.add(new THREE.MeshStandardMaterial({ map: faceTex.map, metalnessMap: faceTex.metal, metalness: 0.55, roughness: 0.28, emissive: 0xffffff, emissiveMap: faceTex.glow, emissiveIntensity: 0.3, envMapIntensity: 1.3, transparent: true, opacity: 0.93 })), 3);
  // 原来一座座搭的零件（只用来算位置）拿掉；它们的几何体、贴图、材质都在 bin 里，stop() 时一起释放
  groups.forEach((g) => root.remove(g));

  root.traverse((o) => { o.userData.noAO = true; });
  // ---------------- 顶格左边：开源项目（src/projects.ts）----------------
  // 一本书一个盒子，合成一个网格；书脊（+z 那面）贴一张图集里各自的那一列（竖着印项目名），其余面贴图集最后一列的白色 × 顶点色（书的颜色）
  const projects = data.projects ?? [];
  const PW = 0.036, PG = 0.004, PH = [0.27, 0.25, 0.28, 0.26, 0.27, 0.24, 0.26, 0.25];
  const cols = projects.length + 1;
  const spineAtlas = bin.add(canvasTex(cols * 96, 768, (g, w, h) => {
    const cw = w / cols;
    projects.forEach((pr, i) => {
      const x0 = i * cw;
      g.fillStyle = pr.color; g.fillRect(x0, 0, cw, h);
      speckle(g, cw, h, 20 + i, 600, '255,255,255', 0.05);
      g.fillStyle = '#e8c878'; g.fillRect(x0, 36, cw, 5); g.fillRect(x0, 48, cw, 2); g.fillRect(x0, h - 50, cw, 2); g.fillRect(x0, h - 42, cw, 5);
      // 项目名沿书脊竖着印（从上往下读），字号按长度缩
      g.save(); g.translate(x0 + cw / 2, h / 2); g.rotate(Math.PI / 2);
      const size = Math.min(44, 560 / Math.max(8, pr.name.length) * 1.7);
      g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f3e7c4';
      g.fillText(pr.name, 0, 0, h - 150);
      g.restore();
      g.fillStyle = '#e8c878'; g.beginPath(); g.arc(x0 + cw / 2, h - 90, 10, 0, 7); g.fill();
    });
    g.fillStyle = '#fff'; g.fillRect((cols - 1) * cw, 0, cw, h);
  }));
  spineAtlas.anisotropy = 8;
  const projGeos: THREE.BufferGeometry[] = [];
  const projX: number[] = [];
  projects.forEach((pr, i) => {
    const bh = PH[i % PH.length], bd = 0.19, x = -inner + PW / 2 + i * (PW + PG);
    projX.push(x);
    const g = new THREE.BoxGeometry(PW, bh, bd).toNonIndexed().translate(x, SHELVES[3] + 0.011 + bh / 2, -D / 2 + 0.02 + bd / 2);
    const uv = g.attributes.uv, n = g.attributes.normal, col = new Float32Array(uv.count * 3), cc = new THREE.Color(pr.color);
    for (let k = 0; k < uv.count; k++) {
      const spine = n.getZ(k) > 0.9;
      const c0 = spine ? i : cols - 1;
      uv.setX(k, (c0 + uv.getX(k)) / cols);
      col.set(spine ? [1, 1, 1] : [cc.r * 0.8, cc.g * 0.8, cc.b * 0.8], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    projGeos.push(g);
  });
  const projMesh = projGeos.length ? new THREE.Mesh(bin.add(mergeGeometries(projGeos)), bin.add(new THREE.MeshStandardMaterial({ map: spineAtlas, vertexColors: true, roughness: 0.6 }))) : null;
  projGeos.forEach((g) => g.dispose());
  if (projMesh) { projMesh.receiveShadow = high; projMesh.userData.noAO = true; root.add(projMesh); }

  // 点书架：镜头走到书架正前方看奖杯（cameraRig 的 shelf 模式）；底下提示两座奖杯的名字。点别处 / ESC / 返回回座位
  // 已经站在书架前时点项目书脊：弹出那个项目的卡片（HTML 层，project:open）
  root.userData.keepsShelf = true;
  const local = new THREE.Vector3();
  pick(root, { click: (hit) => {
    if (focused && projMesh && hit.object === projMesh) {
      local.copy(hit.point); root.worldToLocal(local);
      const i = projX.findIndex((x) => Math.abs(local.x - x) <= (PW + PG) / 2);
      if (i >= 0) { emit(bus, 'project:open', { id: projects[i].id }); return; }
    }
    if (!focused) emit(bus, 'shelf:focus');
  } });
  let focused = false;
  const offs = [
    on(bus, 'shelf:focus', () => { focused = true; emit(bus, 'cup:state', { msg: [...AWARDS.map((a) => `${a.title} · ${a.base.replace(/(\d)/, ' $1 ')} · ${a.date}`), '百度小赞 · 2025 Q2、Q4 · 季度 Award · 2023', '顶格左边那排是我的开源项目，点书脊看看'].join('\n') }); }), // 分行：竖屏一行放不下
    on(bus, 'shelf:blur', () => { if (focused) { focused = false; emit(bus, 'cup:state', null); } }),
  ];
  // ---------------- 荣誉勋章：两座奖杯中间一排三枚，立在小支架上 ----------------
  {
    // 图案是照着用户截图用 canvas 重画的矢量图（src/scene/medals.ts）：截图抠出来只有一百多像素，用户说「看不清楚」。
    // 省 draw call（用户要求「优化资源消耗」）：两种图案拼进一张 2048×1024 图集，三枚的正面、背面剪影、支架、铭牌各合成一个网格，
    // 一共 4 次 draw call（原来 12 次）；每枚勋章只留一块看不见的点击面（HIT_LAYER，相机不画）。
    const atlas = bin.add(canvasTex(2048, 1024, (c) => { drawXiaozan(c); c.save(); c.translate(1024, 0); drawAward(c); c.restore(); }));
    atlas.anisotropy = 16;
    const plates = bin.add(canvasTex(256, 192, (c, w) => MEDALS.forEach((m, i) => {
      const y = i * 64; c.fillStyle = '#1a1a1e'; c.fillRect(0, y, w, 64); c.strokeStyle = '#c9a24e'; c.lineWidth = 2; c.strokeRect(3, y + 3, w - 6, 58);
      c.fillStyle = '#e8c878'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 22px ${SANS}`; c.fillText(m.l1, w / 2, y + 22); c.font = `500 16px ${SANS}`; c.fillText(m.l2, w / 2, y + 46);
    })));
    const acrylic = bin.add(new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.15, metalness: 0.2 }));
    const hitMat = bin.add(new THREE.MeshBasicMaterial());
    const MS = 0.08; // 勋章直径 8 厘米
    const faces: THREE.BufferGeometry[] = [], backs: THREE.BufferGeometry[] = [], tags: THREE.BufferGeometry[] = [];
    const sb = new Batch();
    const uvMap = (geo: THREE.BufferGeometry, f: (u: number, v: number) => [number, number]) => {
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) { const [u, v] = f(uv.getX(k), uv.getY(k)); uv.setXY(k, u, v); }
      return geo;
    };
    MEDALS.forEach((m, i) => {
      const g = new THREE.Group(); g.position.set((i - 1) * 0.088, H, 0.088); g.rotation.y = (1 - i) * 0.12 - 0.04; root.add(g);
      const holder = new THREE.Group(); holder.position.set(0, 0.006 + MS / 2, -0.004); holder.rotation.x = -0.2; g.add(holder);
      g.updateMatrix(); holder.updateMatrix();
      const hm = g.matrix.clone().multiply(holder.matrix);
      // 支架：一块底板 + 一片往后斜靠的背板
      sb.add(acrylic, rbox(0.07, 0.005, 0.045, 0.002).translate(0, 0.0025, 0).applyMatrix4(g.matrix));
      sb.add(acrylic, rbox(0.03, 0.06, 0.003, 0.001).rotateX(-0.28).translate(0, 0.036, -0.016).applyMatrix4(g.matrix));
      // 勋章正面（图集左半/右半）；背后一片稍大的深金色剪影当厚度和边
      const off = m.img === 'xiaozan' ? 0 : 0.5;
      faces.push(uvMap(new THREE.PlaneGeometry(MS, MS), (u, v) => [u * 0.5 + off, v]).applyMatrix4(hm));
      backs.push(uvMap(new THREE.PlaneGeometry(MS * 1.03, MS * 1.03), (u, v) => [u * 0.5 + off, v]).translate(0, 0, -0.0025).applyMatrix4(hm));
      // 铭牌：底板前沿一块小牌子，两行字（图集第 i 行）
      tags.push(uvMap(new THREE.PlaneGeometry(0.06, 0.016), (u, v) => [u, 1 - (i + 1) / 3 + v / 3]).rotateX(-Math.PI / 2 + 0.5).translate(0, 0.009, 0.0227).applyMatrix4(g.matrix));
      // 点勋章：镜头凑到它跟前看（勋章只有 8 厘米，站在书架前也只有拇指大）
      const hit = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(MS, MS * 1.2)), hitMat); hit.layers.set(HIT_LAYER); holder.add(hit);
      g.userData.keepsShelf = true; g.userData.keepsInspect = true;
      pick(g, { click: () => {
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(hit.getWorldQuaternion(new THREE.Quaternion()));
        emit(bus, 'shelf:blur'); emit(bus, 'inspect:focus', { p: hit.getWorldPosition(new THREE.Vector3()).toArray(), n: n.toArray(), dist: 0.17 });
      } });
    });
    sb.build(root, bin, { receive: tier === 'high' });
    const merged = (list: THREE.BufferGeometry[], mat: THREE.Material) => root.add(new THREE.Mesh(bin.add(mergeGeometries(list)), bin.add(mat)));
    merged(backs, new THREE.MeshStandardMaterial({ color: 0x6b4a1e, alphaMap: atlas, alphaTest: 0.5, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
    merged(faces, new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, metalness: 0.35, roughness: 0.32, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.18 }));
    merged(tags, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3, map: plates }));
    [...faces, ...backs, ...tags].forEach((x) => x.dispose());
  }

  return {
    frame() {},
    stop() { offs.forEach((f) => f()); scene.remove(root); bin.dispose(); },
  };
};
