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
  const K = L.kitchen, fy = L.floorY, TOP = K.h;
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  // 灶台自己的坐标：x 沿着灶台（站在前面看往右为正）、z 朝人（正面）、y 从地面算。背靠左墙、正面朝 +x
  const root = new THREE.Group();
  root.position.set(K.x, fy, K.z); root.rotation.y = Math.PI / 2;
  scene.add(root);
  const world = new THREE.Group(); scene.add(world); // 飞向锅、飞向盘子的东西
  root.updateMatrixWorld(true);
  const W = (x: number, y: number, z: number) => root.localToWorld(new THREE.Vector3(x, y, z));

  // ---------------- 灶台柜子 ----------------
  const wood = std({ roughness: 0.75, map: bin.add(canvasTex(512, 256, (g, w, h) => woodGrain(g, 0, 0, w, h, '#5a3a22', '#3e2616', 7), [1.5, 1])) });
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
  b.add(contactMaterial(bin, high ? 0.35 : 0.55), blob(K.len + 0.15, K.depth + 0.12), [0, 0.012, 0]);
  b.add(contactMaterial(bin, high ? 0.35 : 0.55), blob(0.4, 0.4), [gx, 0.013, 0]);
  b.build(root, bin, { cast: high, receive: high, collapse: true });

  // ---------------- 煤气灶 ----------------
  const ST = { x: 0, w: 0.58, d: 0.36, h: 0.07 }, Y0 = TOP + ST.h;
  const BURN = [new THREE.Vector3(-0.14, Y0, -0.02), new THREE.Vector3(0.15, Y0, -0.02)];
  const sb = new Batch();
  const steelDark = std({ color: 0x3a3c40, roughness: 0.35, metalness: 0.7 });
  const iron = std({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.4 });
  sb.add(steelDark, rbox(ST.w, ST.h, ST.d, 0.01), [ST.x, TOP + ST.h / 2, 0]);
  for (const bp of BURN) {
    sb.add(iron, new THREE.CylinderGeometry(0.05, 0.055, 0.015, 20), [bp.x, Y0 + 0.007, bp.z]);
    // 炉架：四根铸铁爪
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; sb.add(iron, new THREE.BoxGeometry(0.075, 0.018, 0.012), [bp.x + Math.cos(a) * 0.09, Y0 + 0.02, bp.z + Math.sin(a) * 0.09], [0, -a, 0]); }
    sb.add(iron, new THREE.TorusGeometry(0.12, 0.006, 4, 24).rotateX(Math.PI / 2), [bp.x, Y0 + 0.012, bp.z]);
  }
  sb.build(root, bin, { receive: high, collapse: true });
  // 旋钮：前面板上两个；左边那个管炒锅这个火
  const knobM = std({ color: 0x18181a, roughness: 0.4 });
  const knobs = BURN.map((bp) => {
    const k = new THREE.Group(); k.position.set(bp.x, TOP + ST.h / 2, ST.d / 2 + 0.012); root.add(k);
    k.add(new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.022, 0.024, 0.02, 16).rotateX(Math.PI / 2)), knobM));
    k.add(new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.006, 0.03, 0.01).translate(0, 0, 0.012)), std({ color: 0xc9c9c9, roughness: 0.3, metalness: 0.8 })));
    k.userData.keepsStove = true;
    return k;
  });
  // 火苗：一圈蓝色的小火舌（加色混合，轻轻跳），点着了才画
  const flameGeo = bin.add(new THREE.ConeGeometry(0.008, 0.035, 5, 1, true).translate(0, 0.0175, 0));
  const FL = 18;
  const flame = new THREE.InstancedMesh(flameGeo, bin.add(new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })), FL);
  flame.visible = false; flame.userData.noAO = true; root.add(flame);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();

  // ---------------- 炒锅、炒勺 ----------------
  const WOK = BURN[0].clone().setY(Y0 + 0.03);
  const wokProf = [[0, 0], [0.06, 0.003], [0.11, 0.016], [0.145, 0.04], [0.165, 0.07], [0.172, 0.085]];
  const wokY = (r: number) => { for (let i = 1; i < wokProf.length; i++) { const [r0, y0] = wokProf[i - 1], [r1, y1] = wokProf[i]; if (r <= r1) return y0 + (y1 - y0) * (r - r0) / (r1 - r0); } return 0.085; };
  const wok = new THREE.Group(); wok.position.copy(WOK); root.add(wok);
  {
    const wb = new Batch();
    wb.add(std({ color: 0x232325, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }), new THREE.LatheGeometry(wokProf.map(([r, y]) => new THREE.Vector2(r, y)), 36));
    const handleM = std({ color: 0x5a3820, roughness: 0.6 });
    wb.add(handleM, new THREE.CylinderGeometry(0.014, 0.017, 0.2, 10).rotateX(Math.PI / 2), [-0.06, 0.09, 0.27], [0.18, -0.25, 0]); // 长木柄（朝人、偏左）
    wb.add(std({ color: 0x2a2a2c, roughness: 0.5, metalness: 0.5 }), new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8).rotateX(Math.PI / 2), [-0.02, 0.082, 0.18], [0.18, -0.25, 0]);
    wb.build(wok, bin, { receive: high });
    wok.children.forEach((c) => { c.castShadow = false; });
  }
  wok.userData.keepsStove = true;
  // 锅里的油：一张金黄的半透明圆片；热了会冒烟
  const oilM = bin.add(new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }));
  const oilDisc = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.1, 28).rotateX(-Math.PI / 2)), oilM);
  oilDisc.position.y = 0.006; oilDisc.visible = false; wok.add(oilDisc);
  // 炒勺：铁勺头 + 长木柄。平时斜搁在锅右前方的台面上，翻炒时伸进锅里铲一下
  const SPAT_HOME = { p: new THREE.Vector3(0.05, TOP + 0.005, 0.24), r: new THREE.Euler(0, -0.9, 0) };
  const spatula = new THREE.Group(); spatula.position.copy(SPAT_HOME.p); spatula.rotation.copy(SPAT_HOME.r); root.add(spatula);
  const spatGlow = std({ color: 0x5a3820, roughness: 0.6, emissive: 0xffb050, emissiveIntensity: 0 });
  {
    const sb2 = new Batch();
    sb2.add(std({ color: 0x3a3a3c, roughness: 0.35, metalness: 0.8 }), new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38).scale(1, 0.5, 1.1), [0, 0.03, 0]);
    sb2.add(std({ color: 0x8a8d90, roughness: 0.35, metalness: 0.8 }), new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).rotateZ(Math.PI / 2 - 0.35), [0.07, 0.03, 0]);
    sb2.build(spatula, bin, { receive: high });
    const handle = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.009, 0.011, 0.17, 8).rotateZ(Math.PI / 2 - 0.25)), spatGlow);
    handle.position.set(0.2, 0.06, 0); spatula.add(handle);
  }
  spatula.userData.keepsStove = true;

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
  type Chunk = { veg: Veg; r: number; a: number; s: THREE.Vector3; rot: THREE.Euler; seed: number };
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
  const layout = (im: THREE.InstancedMesh, list: Chunk[], surf: (r: number) => number, rMax: number, jump: number, t: number, done: number, burnt: number) => {
    im.count = list.length;
    list.forEach((c, i) => {
      const rr = c.r * rMax, h = surf(rr) + c.s.y * 0.8 + (i % 3) * 0.004 * (1 - rr / rMax) + Math.max(0, Math.sin(t * 9 + c.seed * 7)) * jump * (0.5 + (c.seed % 0.5));
      v.set(Math.cos(c.a) * rr, h, Math.sin(c.a) * rr);
      m4.compose(v, q.setFromEuler(c.rot), s3.copy(c.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, chunkColor(c, done, burnt, tmpC));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
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
    if (phase !== 'cooking' || stirT >= 0) return;
    stirT = 0; tone(700, 0.08, 0.06, 0, 500, 'triangle'); noise(0.35, 3200, 0.6, 0.3, 'highpass');
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
          v.set(BURN[0].x + Math.cos(a) * 0.045, Y0 + 0.012, BURN[0].z + Math.sin(a) * 0.045);
          q.setFromEuler(e.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5));
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
      // 翻炒：炒勺伸进锅里铲一下，锅颠一下，菜往上跳
      let jump = phase === 'cooking' && fire ? 0.004 : 0;
      if (stirT >= 0) {
        stirT = Math.min(1, stirT + dt / 0.6);
        const k = Math.sin(stirT * Math.PI);
        spatula.position.lerpVectors(SPAT_HOME.p, WOK.clone().add(new THREE.Vector3(0.02, 0.05, 0.06)), k);
        spatula.rotation.set(0, SPAT_HOME.r.y * (1 - k) - 0.3 * k, -0.6 * k + Math.sin(stirT * Math.PI * 2) * 0.3);
        wok.rotation.x = Math.sin(stirT * Math.PI * 2) * 0.08; wok.position.y = WOK.y + k * 0.015;
        jump = 0.03 * k;
        if (stirT >= 1) { stirT = -1; spatula.position.copy(SPAT_HOME.p); spatula.rotation.copy(SPAT_HOME.r); wok.rotation.x = 0; wok.position.y = WOK.y; }
      }
      // 锅里的菜
      if (pot.length) layout(wokChunks, pot, (r) => wokY(r) + 0.006, 0.12, jump, t, stirs, burnt);
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
