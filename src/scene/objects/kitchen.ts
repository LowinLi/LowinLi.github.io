import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
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
type Veg = 'tomato' | 'egg' | 'cabbage' | 'scallion' | 'lettuce' | 'chicken' | 'pork' | 'mutton' | 'beef' | 'chili';
/** 不在筐里、要从外面弄来的：抓来的鸡、猪、羊、牛，园子里摘的辣椒（pantry:add 收），一份一碟摆在台面前沿 */
type Pantry = 'chicken' | 'pork' | 'mutton' | 'beef' | 'chili';
type BasketVeg = Exclude<Veg, Pantry>;
const MEATS: Veg[] = ['chicken', 'pork', 'mutton', 'beef'];
const VEG_NAME: Record<Veg, string> = { tomato: '番茄', egg: '鸡蛋', cabbage: '白菜', scallion: '葱', lettuce: '生菜', chicken: '鸡肉', pork: '猪肉', mutton: '羊肉', beef: '牛肉', chili: '辣椒' };
const VEG_COLOR: Record<Veg, number> = { tomato: 0xd8321e, egg: 0xf2c94c, cabbage: 0xd3e2a8, scallion: 0x4f9a3a, lettuce: 0x7cc24a, chicken: 0xeeb4a4, pork: 0xe8a090, mutton: 0xb8443e, beef: 0x9a2a24, chili: 0xd02a1c };
// 一份的块数：用户说「菜放到锅里多一点」，从 8~15 块提到 13~24 块
const VEG_PORTION: Record<Veg, number> = { tomato: 13, egg: 14, cabbage: 24, scallion: 22, lettuce: 22, chicken: 16, pork: 16, mutton: 15, beef: 16, chili: 16 };
/** 菜谱：放进去的菜（用 + 连起来，顺序随便，下面会排好序）→ 菜名、基础喜欢程度（1–5）、一句评价 */
const RECIPES_RAW: Record<string, [string, number, string]> = {
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
  // 园子里摘的辣椒（用户要的「院子里的辣椒也要可以摘过来做成辣的菜肴」）
  'chili': ['炒辣椒', 2, '光吃辣椒，辣得直冒汗'],
  'chili+egg': ['尖椒炒蛋', 5, '辣椒的鲜辣配鸡蛋的香，绝配'],
  'cabbage+chili': ['辣炒白菜', 4, '脆生生、辣乎乎'],
  'chili+lettuce': ['辣炒生菜', 3, '生菜一辣就蔫了，味道还行'],
  'chili+tomato': ['辣味番茄', 3, '酸辣口，有点意思'],
  'chili+scallion': ['葱椒小炒', 2, '又冲又辣，下饭但吃不多'],
  'chili+egg+tomato': ['香辣番茄炒蛋', 4, '西红柿炒蛋多了一丝辣，更开胃'],
  'cabbage+chili+egg': ['尖椒白菜炒蛋', 4, '有菜有蛋有辣味'],
  'chicken+chili': ['辣子鸡', 5, '满盘红辣椒里找鸡肉，外焦里嫩'],
  'chicken+chili+scallion': ['宫保鸡丁', 5, '葱段、辣椒、鸡丁，糊辣荔枝口'],
  'chicken+chili+egg': ['香辣鸡蛋鸡丁', 4, '辣、香、嫩'],
  // 猪圈里抓的猪（用户要的「圈里养着猪、羊、牛……抓他们做猪肉羊肉牛肉，可以在锅里做菜吃。菜肴可以根据不同组合再丰富一下」）
  'pork': ['小炒肉片', 4, '肥瘦相间，越嚼越香'],
  'chili+pork': ['辣椒炒肉', 5, '湘菜下饭王，一口肉一口饭'],
  'pork+scallion': ['葱爆肉片', 5, '大葱一爆，肉片焦香'],
  'chili+pork+scallion': ['农家小炒肉', 5, '辣椒、葱、五花肉，满满锅气'],
  'cabbage+pork': ['白菜炒肉', 4, '肉香都进了白菜里，家常味'],
  'cabbage+chili+pork': ['手撕白菜炒肉', 5, '白菜脆、肉片香、辣得正好'],
  'egg+pork': ['木须肉', 5, '肉片滑嫩、鸡蛋金黄，老北京味儿'],
  'egg+pork+scallion': ['葱香木须肉', 5, '多了葱香，更地道'],
  'pork+tomato': ['番茄肉片', 4, '酸甜开胃，汤汁拌饭'],
  'lettuce+pork': ['生菜炒肉', 4, '清脆里带着肉香'],
  'chili+egg+pork': ['尖椒肉片炒蛋', 4, '三样一锅，香辣下饭'],
  // 羊圈里的羊
  'mutton': ['小炒羊肉', 4, '羊肉嫩，带一点点膻香'],
  'mutton+scallion': ['葱爆羊肉', 5, '北方名菜，大葱压住了膻味'],
  'chili+mutton': ['香辣羊肉', 5, '辣椒配羊肉，越吃越暖'],
  'chili+mutton+scallion': ['麻辣葱爆羊肉', 5, '又辣又香，冬天吃最好'],
  'cabbage+mutton': ['白菜炒羊肉', 4, '白菜吸饱了羊肉的鲜'],
  'mutton+tomato': ['番茄羊肉', 4, '番茄解腻，汤也好喝'],
  'lettuce+mutton': ['生菜炒羊肉', 3, '有点怪，但能吃'],
  'egg+mutton': ['羊肉炒蛋', 3, '味道冲了点'],
  // 牛棚里的牛
  'beef': ['小炒牛肉', 4, '牛肉片嫩，有嚼劲'],
  'beef+chili': ['小炒黄牛肉', 5, '湘菜招牌，鲜辣嫩滑'],
  'beef+tomato': ['番茄牛肉', 5, '酸甜浓汤，拌饭一绝'],
  'beef+scallion': ['葱爆牛肉', 5, '葱香牛肉，下饭硬菜'],
  'beef+chili+scallion': ['葱椒牛肉', 5, '葱香、辣香、肉香'],
  'beef+scallion+tomato': ['葱香番茄牛肉', 5, '有汤有肉，暖胃'],
  'beef+egg': ['滑蛋牛肉', 5, '蛋滑肉嫩，一口一个满足'],
  'beef+cabbage': ['白菜炒牛肉', 4, '清甜的白菜配牛肉'],
  'beef+lettuce': ['生菜牛肉', 4, '生菜脆，牛肉嫩'],
  'beef+chili+tomato': ['酸辣番茄牛肉', 5, '酸、辣、鲜，汤汁都想喝光'],
  // 几样肉一起
  'beef+pork': ['牛肉猪肉双拼', 3, '两样肉一锅炒，香是香，就是有点腻'],
  'chicken+pork': ['鸡肉猪肉双拼', 3, '两样肉一锅炒，有点腻'],
  'mutton+pork': ['羊肉猪肉双拼', 3, '膻香加肉香，有点腻'],
  'beef+mutton': ['牛羊双拼', 4, '草原风味，配点葱更好'],
  'beef+mutton+scallion': ['葱爆牛羊肉', 5, '大葱一爆，牛羊肉都香'],
  'beef+chicken+mutton+pork': ['全肉大餐', 3, '四样肉一锅，过年都没这么丰盛'],
};
const RECIPES: Record<string, [string, number, string]> = Object.fromEntries(Object.entries(RECIPES_RAW).map(([k, v]) => [k.split('+').sort().join('+'), v]));
/** 炒的肉在菜名里叫什么 */
const MEAT_DISH: Partial<Record<Veg, string>> = { chicken: '鸡', pork: '肉', mutton: '羊肉', beef: '牛肉' };
const recipeOf = (set: Veg[]): [string, number, string] => {
  const key = [...set].sort().join('+');
  if (RECIPES[key]) return RECIPES[key];
  if (set.length >= 5) return ['乱炖大杂烩', 2, '什么都往里放，味道有点乱'];
  const hot = set.includes('chili'), meats = set.filter((x) => MEATS.includes(x));
  // 加了辣椒、去掉辣椒以后有现成的菜：名字前加「香辣」
  if (hot && set.length > 1) { const base = RECIPES[set.filter((x) => x !== 'chili').sort().join('+')]; if (base) return [`香辣${base[0]}`, base[1], `${base[2]}，加了辣椒更下饭`]; }
  if (meats.length >= 2) return [`${hot ? '香辣' : ''}农家杂肉小炒`, 3, '几样肉一锅出，香是香，有点腻'];
  if (meats.length === 1) return [`${hot ? '香辣' : ''}农家小炒${MEAT_DISH[meats[0]]}`, 4, '有肉有菜，香'];
  if (hot) return ['香辣小炒', 3, '辣乎乎的一盘素菜'];
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

  // ---------------- 食材几何的小工具：顶点色画细节（果皮 / 果肉 / 籽、蛋白、菜帮、鸡皮），噪声鼓包 ----------------
  type RGB = [number, number, number];
  const hash3 = (x: number, y: number, z: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x: number, y: number, z: number) => 0.5 * Math.sin(x * 2.1 + y * 1.3) * Math.sin(z * 1.7 - x * 0.9) + 0.3 * Math.sin(x * 4.3 - z * 3.1 + y * 2.7) + 0.2 * Math.sin(y * 6.1 + z * 5.3 + x * 1.1);
  const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul3 = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
  /** 法线已经算好的几何 → 去 uv、转非索引、按 f(位置, 法线) 上顶点色 */
  const paint = (geo: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3) => RGB) => {
    const g = geo.index ? geo.toNonIndexed() : geo; if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), a = new Float32Array(P.count * 3), pp = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { pp.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i); a.set(f(pp, nn), i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g;
  };
  /** 先合并顶点（不然鼓包时面会裂开），再按 fn 改每个顶点的位置，最后算光滑法线 */
  const reshape = (geo: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void) => {
    geo.deleteAttribute('normal'); if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    const g = mergeVertices(geo), P = g.getAttribute('position'), pp = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { pp.fromBufferAttribute(P, i); fn(pp); P.setXYZ(i, pp.x, pp.y, pp.z); }
    g.computeVertexNormals(); return g;
  };
  /** 一片菜叶（单位大小，长 1.6 沿 z、宽 2 沿 x）：叶缘不齐、整片往上兜、边上起皱；中间一道白色菜帮 */
  const leafPiece = (ruffle: number, cup: number, base: RGB, rib: RGB, edge: RGB, seed: number) => {
    const g = new THREE.PlaneGeometry(2, 1.6, 10, 8), P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i);
      x *= 1 + 0.12 * Math.sin(y * 6 + seed); y *= 1 + 0.1 * Math.sin(x * 5 + seed * 2);
      const z = cup * x * x + ruffle * Math.sin(x * 9 + y * 6 + seed) * Math.max(0, Math.abs(x) - 0.35) + ruffle * 0.6 * Math.sin(y * 11 + seed) * Math.max(0, Math.abs(y) - 0.5) + 0.04 * Math.sin(y * 3 + seed);
      P.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals(); g.rotateX(-Math.PI / 2);
    return paint(g, (p) => {
      const ax = Math.abs(p.x), n = hash3(p.x * 9, p.z * 9, seed) * 0.08;
      if (ax < 0.16) return mix3(rib, base, ax / 0.16 * 0.3);
      return mul3(mix3(base, edge, Math.min(1, (ax - 0.16) / 0.9)), 0.96 + n);
    });
  };

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
  let soyBottle!: THREE.Group, vinBottle!: THREE.Group;
  {
    const cb = new Batch();
    const boardM = std({ roughness: 0.7, map: bin.add(canvasTex(256, 256, (g, w, h) => {
      woodGrain(g, 0, 0, w, h, '#c99a62', '120,80,45', 11, 70); speckle(g, w, h, 5, 500, '60,30,10', 0.08);
      g.strokeStyle = 'rgba(80,40,20,0.18)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 30, y + (Math.random() - 0.5) * 6); g.stroke(); } // 刀痕
    })) });
    cb.add(boardM, rbox(0.28, 0.38, 0.022, 0.008), [-0.5, TOP + 0.19, WALLZ + 0.04], [-0.1, 0, 0]);
    cb.add(std({ color: 0x3a2414, roughness: 0.8 }), new THREE.TorusGeometry(0.012, 0.003, 5, 12), [-0.5, TOP + 0.34, WALLZ + 0.026], [-0.1, 0, 0]);
    // 酱油、陈醋：各自一个 group（能点、能提起来往锅里倒），原点在瓶底中心
    const bottle = (x: number, glass: number, cap: number, label: THREE.Texture) => {
      const g = new THREE.Group(); g.position.set(x, TOP, WALLZ + 0.055); g.rotation.order = 'YXZ'; root.add(g);
      const bb = new Batch();
      bb.add(std({ color: glass, roughness: 0.08, metalness: 0.2 }), new THREE.LatheGeometry([[0, 0], [0.027, 0], [0.029, 0.006], [0.029, 0.11], [0.022, 0.135], [0.011, 0.155], [0.011, 0.17], [0, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 20));
      bb.add(std({ color: cap, roughness: 0.4 }), new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 12), [0, 0.178, 0]);
      bb.add(std({ map: label, roughness: 0.6 }), new THREE.CylinderGeometry(0.0295, 0.0295, 0.055, 20, 1, true, -Math.PI / 2), [0, 0.06, 0]);
      bb.build(g, bin, { receive: high });
      g.userData.keepsStove = true;
      return g;
    };
    const labelOf = (txt: string, bg: string, fg: string) => bin.add(canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.fillRect(0, 8, w, 3); g.fillRect(0, h - 11, w, 3);
      g.font = `bold 40px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w * 0.25, h / 2 + 2); g.fillText(txt, w * 0.75, h / 2 + 2);
    }));
    soyBottle = bottle(0.45, 0x2a1306, 0xb51e16, labelOf('酱油', '#f3e2b0', '#8a1a12'));
    vinBottle = bottle(0.53, 0x1d1a12, 0xe1b33a, labelOf('陈醋', '#efe9da', '#1d3d6a'));
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
  const flameGeo = bin.add(new THREE.ConeGeometry(0.006, 0.02, 5, 1, true).translate(0, 0.01, 0));
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
  // 用户指出过「菜像是悬空的」：原来的油是一张平的圆片，锅是弧的——圆片边从锅底外面穿出来一圈，锅坡上的菜底下也没有油。
  // 现在油是一层贴着锅面的薄膜（按 wokY 抬高），往外渐隐；菜底下再垫一层同样贴锅面的软阴影（锅里菜越多越深）
  const radialAlpha = (inner: number, k = 1) => bin.add(canvasTex(128, 128, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(inner, `rgba(255,255,255,${k * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); }));
  const wokFilm = (R: number, lift: number) => {
    const g = new THREE.RingGeometry(0.0001, R, 48, 10).rotateX(-Math.PI / 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, wokY(Math.hypot(P.getX(i), P.getZ(i))) + lift);
    g.computeVertexNormals(); return bin.add(g);
  };
  const oilM = bin.add(new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false, alphaMap: radialAlpha(0.55), polygonOffset: true, polygonOffsetFactor: -1 }));
  const oilDisc = new THREE.Mesh(wokFilm(0.12, 0.0012), oilM);
  oilDisc.visible = false; wok.add(oilDisc);
  const foodShadowM = bin.add(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, alphaMap: radialAlpha(0.35), polygonOffset: true, polygonOffsetFactor: -2 }));
  const foodShadow = new THREE.Mesh(wokFilm(0.15, 0.002), foodShadowM); foodShadow.visible = false; wok.add(foodShadow);

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
  spatula.userData.keepsStove = true; spatula.name = 'spatula'; wok.name = 'wok';
  { // 锅铲很细，点不准：沿着铲面到柄尾套一根看不见的粗一点的点击区（HIT_LAYER，不画）
    const dir = SP_END.clone().normalize(), hit = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.02, 0.02, SP_END.length() + 0.06, 8)), bin.add(new THREE.MeshBasicMaterial()));
    hit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); hit.position.copy(SP_END).multiplyScalar(0.5).addScaledVector(dir, -0.02);
    hit.layers.set(HIT_LAYER); spatula.add(hit);
  }
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
  const mergeVeg = (parts: THREE.BufferGeometry[], mat = vegMat) => { const bb = new Batch(['position', 'normal', 'color']); parts.forEach((p) => bb.add(mat, p)); const grp = new THREE.Group(); bb.build(grp, bin); return grp; };
  const glossy = std({ vertexColors: true, roughness: 0.22 });
  // 番茄：有棱、顶上一个小窝、五片绿萼 + 一截果柄；肩上偏橙
  const tomatoGeo = (seed: number, r = 0.032) => {
    const body = reshape(new THREE.SphereGeometry(1, 28, 18), (p) => {
      const th = Math.acos(THREE.MathUtils.clamp(p.y, -1, 1)), ph = Math.atan2(p.z, p.x);
      const rib = 1 - 0.055 * Math.pow(1 - Math.abs(Math.cos(2.5 * ph + seed)), 1.5) * Math.sin(th);
      p.multiplyScalar(rib * r); p.y *= 0.84; p.y -= 0.006 * Math.exp(-((th / 0.4) ** 2)); p.y += 0.004 * Math.exp(-(((Math.PI - th) / 0.6) ** 2)) * 0;
    });
    const parts = [paint(body, (p) => { const k = 0.92 + hash3(p.x * 400, p.y * 400, p.z * 400) * 0.08; return mul3(mix3([0.8, 0.09, 0.05], [0.9, 0.36, 0.1], THREE.MathUtils.smoothstep(p.y / r, 0.35, 0.8) * 0.6), k); })];
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + seed;
      const sep = new THREE.ConeGeometry(0.0035, 0.02, 4).rotateZ(-Math.PI / 2).scale(1, 0.35, 1).translate(0.01, 0, 0).rotateZ(-0.25).rotateY(a).translate(0, r * 0.82 - 0.004, 0);
      parts.push(paint(sep, () => [0.24, 0.46, 0.15]));
    }
    parts.push(paint(new THREE.CylinderGeometry(0.0022, 0.003, 0.011, 6).translate(0, r * 0.82 + 0.003, 0), () => [0.3, 0.45, 0.18]));
    return parts;
  };
  // 鸡蛋：一头大一头小，浅褐色带细斑
  const eggGeo = () => paint(new THREE.LatheGeometry(Array.from({ length: 17 }, (_, i) => { const t = (i / 16) * Math.PI; return new THREE.Vector2(Math.max(0.0001, Math.sin(t) * 0.0195 * (1 + 0.1 * Math.cos(t))), -Math.cos(t) * 0.026); }), 20),
    (p) => { const sp = hash3(p.x * 900, p.y * 900, p.z * 900); return sp > 0.94 ? [0.6, 0.44, 0.3] : mul3([0.84, 0.66, 0.48], 0.96 + sp * 0.05); });
  // 大白菜：躺着放的一棵——长圆的芯 + 四层包着的叶子，下半截白、上头叶子绿、叶缘起皱、一道道白帮
  const cabbageGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    const L = 0.07, R = 0.042;
    const col = (p: THREE.Vector3): RGB => { const t = THREE.MathUtils.smoothstep(p.y / L, -0.1, 0.75); const rib = Math.pow(Math.abs(Math.cos(Math.atan2(p.z, p.x) * 3.5)), 6); return mix3(mix3([0.86, 0.88, 0.76], [0.42, 0.66, 0.22], t), [0.9, 0.92, 0.8], rib * 0.6 * (1 - t * 0.5)); };
    parts.push(paint(reshape(new THREE.SphereGeometry(1, 20, 14), (p) => { p.set(p.x * R * 0.85, p.y * L * 0.95, p.z * R * 0.85); }), col));
    for (let k = 0; k < 4; k++) {
      const leaf = reshape(new THREE.SphereGeometry(1, 16, 14, 0, 2.3, 0.3, 2.5), (p) => {
        const top = Math.max(0, p.y - 0.2);
        const wob = 1 + 0.08 * Math.sin(Math.atan2(p.z, p.x) * 9 + p.y * 7 + k) * top;
        p.set(p.x * R * (1 + k * 0.05) * wob, p.y * L * (1 + k * 0.02), p.z * R * (1 + k * 0.05) * wob);
      }).rotateY(k * 1.7);
      parts.push(paint(leaf, col));
    }
    return parts.map((g) => g.rotateZ(Math.PI / 2 - 0.25));
  };
  // 生菜：一圈往上兜、边缘大波浪的嫩叶
  const lettuceGeo = () => {
    const parts: THREE.BufferGeometry[] = [paint(reshape(new THREE.IcosahedronGeometry(0.018, 2), (p) => p.multiplyScalar(1 + 0.15 * vnoise(p.x * 200, p.y * 200, p.z * 200))), () => [0.62, 0.82, 0.4])];
    for (let i = 0; i < 10; i++) {
      const lf = leafPiece(0.28, 0.35, [0.5, 0.78, 0.28], [0.8, 0.93, 0.6], [0.36, 0.64, 0.18], i * 1.3).translate(0, 0, -0.8).rotateX(0.5 + (i % 3) * 0.25).rotateY(i * 2.4).scale(0.026, 0.026, 0.026);
      parts.push(lf);
    }
    return parts;
  };
  // 一把葱：葱白（底下圆鼓的头和一撮须根）→ 两三根往外岔开的空心葱叶；红绳扎着
  const scallionGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const oy = (i % 2) * 0.007, oz = (i - 2) * 0.0065;
      parts.push(paint(new THREE.CylinderGeometry(0.0042, 0.0048, 0.08, 8).rotateZ(Math.PI / 2).translate(-0.04, oy, oz), (p) => mix3([0.95, 0.96, 0.88], [0.62, 0.8, 0.45], THREE.MathUtils.smoothstep(p.x, -0.03, 0.0))));
      parts.push(paint(new THREE.SphereGeometry(0.0058, 8, 6).scale(1.1, 1, 1).translate(-0.081, oy, oz), () => [0.96, 0.95, 0.88]));
      for (let r2 = 0; r2 < 4; r2++) parts.push(paint(new THREE.CylinderGeometry(0.0005, 0.0006, 0.014, 3).rotateZ(Math.PI / 2 + (r2 - 1.5) * 0.35).translate(-0.092, oy + (r2 - 1.5) * 0.002, oz), () => [0.86, 0.8, 0.66]));
      for (let l = 0; l < 2; l++) {
        const lf = new THREE.CylinderGeometry(0.0011, 0.0038, 0.13, 6).rotateZ(-Math.PI / 2).translate(0.065, 0, 0).rotateY((l - 0.5) * 0.12 + (i - 2) * 0.04).rotateZ((l - 0.5) * 0.08).translate(0, oy, oz);
        parts.push(paint(lf, (p) => mul3(mix3([0.45, 0.7, 0.32], [0.24, 0.52, 0.16], THREE.MathUtils.smoothstep(p.x, 0, 0.08)), 0.95 + 0.05 * Math.sin(p.x * 300))));
      }
    }
    parts.push(paint(new THREE.TorusGeometry(0.013, 0.0013, 5, 18).rotateY(Math.PI / 2).translate(-0.02, 0.003, 0), () => [0.75, 0.1, 0.08]));
    return parts;
  };
  const vegMeshes: Record<BasketVeg, THREE.Object3D> & Partial<Record<Pantry, THREE.Object3D>> = {
    cabbage: mergeVeg(cabbageGeo()),
    lettuce: mergeVeg(lettuceGeo()),
    tomato: mergeVeg([...tomatoGeo(0.3), ...tomatoGeo(1.7).map((g) => g.rotateZ(0.5).translate(0.065, 0, 0.01))], glossy),
    egg: mergeVeg([[0, 0], [0.04, 0.012], [0.02, -0.035]].map(([x, z], i) => eggGeo().rotateZ(1.25 + i * 0.25).rotateY(i * 1.1).translate(x, 0, z)), glossy),
    scallion: mergeVeg(scallionGeo().map((g) => g.rotateY(0.15))),
  };
  const VEG_POS: Record<BasketVeg, [number, number, number]> = { cabbage: [-0.04, 0.05, -0.045], lettuce: [0.06, 0.045, -0.05], tomato: [-0.075, 0.032, 0.055], egg: [0.03, 0.026, 0.07], scallion: [-0.02, 0.07, -0.085] };
  (Object.keys(VEG_POS) as BasketVeg[]).forEach((k) => {
    const m = vegMeshes[k]; const [x, y, z] = VEG_POS[k];
    m.position.set(BASKET.x + x, TOP + y, BASKET.z + z); m.userData.keepsStove = true; root.add(m);
    if (k === 'scallion') m.rotation.z = 0.32; // 一把葱斜靠在筐的后沿上，葱叶探出筐外，不压着别的菜
    pick(m, { click: () => onVeg(k) });
  });

  // ---------------- 切好下锅的菜块（单位大小，锅里、盘里的实例化网格用）----------------
  const FOOD_GEO: Record<Veg, THREE.BufferGeometry> = (() => {
    // 番茄瓣：一瓣球面的皮 + 两个切面（外圈红果肉、中间一圈带籽的果胶）
    const WA = 1.05;
    const cut = (rot: number) => new THREE.RingGeometry(0.001, 1, 10, 6, -Math.PI / 2, Math.PI).rotateY(rot);
    const tomatoCol = (p: THREE.Vector3): RGB => {
      const d = p.length();
      if (d > 0.97) return mul3([0.82, 0.11, 0.06], 0.94 + hash3(p.x * 50, p.y * 50, p.z * 50) * 0.08);
      if (d > 0.82) return [0.86, 0.2, 0.11];
      if (d > 0.4 && d < 0.76 && Math.abs(p.y) < 0.62) return hash3(p.x * 31, p.y * 31, p.z * 31) > 0.72 ? [0.96, 0.86, 0.52] : [0.95, 0.5, 0.25];
      return [0.9, 0.32, 0.18];
    };
    const tomato = mergeGeometries([new THREE.SphereGeometry(1, 8, 10, 0, WA), cut(Math.PI), cut(Math.PI + WA)].map((g) => paint(g, tomatoCol)))!.scale(1, 0.9, 1);
    // 炒蛋：一团团蓬松、皱巴巴的蛋块，黄里夹着没炒匀的蛋白、底下有一点焦黄
    const egg = paint(reshape(new THREE.IcosahedronGeometry(1, 3), (p) => { const k = 1 + 0.3 * vnoise(p.x * 2.4, p.y * 2.4, p.z * 2.4); p.multiplyScalar(k); p.y *= 0.55; }),
      (p, n) => { const w = vnoise(p.x * 3 + 5, p.y * 3, p.z * 3 - 2); const c: RGB = w > 0.5 ? [0.97, 0.93, 0.8] : mix3([0.98, 0.72, 0.16], [0.99, 0.82, 0.3], hash3(p.x * 20, p.y * 20, p.z * 20)); return n.y < -0.5 ? mix3(c, [0.86, 0.58, 0.24], 0.5) : c; });
    const cabbage = leafPiece(0.08, 0.28, [0.86, 0.92, 0.66], [0.97, 0.97, 0.9], [0.62, 0.78, 0.38], 2.3);
    const lettuce = leafPiece(0.24, 0.18, [0.45, 0.74, 0.25], [0.78, 0.92, 0.55], [0.3, 0.58, 0.15], 4.1);
    // 葱段：空心的小管，顺着一道道浅色的细纹
    const scallion = paint(new THREE.CylinderGeometry(1, 1, 2.6, 10, 1, true).rotateZ(Math.PI / 2), (p) => mul3([0.3, 0.6, 0.21], 0.86 + 0.14 * Math.sin(Math.atan2(p.z, p.y) * 8)));
    // 鸡块：圆角、鼓鼓囊囊的肉块，一面带鸡皮（浅黄、有毛孔），肉上有顺着的肌理
    const chicken = paint(reshape(new THREE.BoxGeometry(1.5, 1.1, 1.25, 4, 3, 4), (p) => {
      const sph = p.clone().normalize().multiplyScalar(0.78); p.lerp(sph, 0.35); p.multiplyScalar(1 + 0.12 * vnoise(p.x * 2.5, p.y * 2.5, p.z * 2.5));
    }), (p, n) => n.y > 0.45 ? mul3([0.9, 0.76, 0.52], hash3(p.x * 40, p.y * 40, p.z * 40) > 0.85 ? 0.88 : 1) : mul3([0.8, 0.42, 0.37], 0.92 + 0.08 * Math.sin(p.x * 24 + p.z * 6)));
    // 猪肉片：五花，一层层的肉皮、肥膘、瘦肉，边上微微卷
    const pork = paint(reshape(new THREE.BoxGeometry(2, 0.32, 1.3, 8, 1, 5), (p) => { p.y += 0.07 * Math.sin(p.x * 2.4) + 0.04 * vnoise(p.x * 3, 0, p.z * 3); }), (p) => {
      const z = p.z + 0.04 * Math.sin(p.x * 5), k = 0.95 + hash3(p.x * 30, p.y * 30, p.z * 30) * 0.08;
      if (z > 0.5) return [0.93, 0.78, 0.6];                       // 肉皮
      if (z > 0.26 || (z > -0.22 && z < -0.06)) return mul3([0.97, 0.93, 0.86], k); // 肥膘
      return mul3(z < -0.22 ? [0.8, 0.34, 0.33] : [0.86, 0.42, 0.4], k);         // 瘦肉
    });
    // 羊肉片：薄薄的一片，微微卷边，红肉里一道道弯弯的白色油花
    const mutton = paint(reshape(new THREE.BoxGeometry(1.8, 0.16, 1.3, 8, 1, 6), (p) => { p.y += 0.12 * (p.x * p.x) * 0.5 + 0.04 * vnoise(p.x * 3, 0, p.z * 3); }),
      (p) => Math.abs(Math.sin(p.x * 3.2 + Math.sin(p.z * 4) * 0.8)) < 0.22 ? [0.96, 0.91, 0.85] : mul3([0.72, 0.24, 0.25], 0.92 + hash3(p.x * 40, p.y * 40, p.z * 40) * 0.1));
    // 牛肉片：深红色、顺着一道道肌理，偶尔一点白筋
    const beef = paint(reshape(new THREE.BoxGeometry(1.9, 0.22, 1.25, 8, 1, 5), (p) => { p.y += 0.05 * Math.sin(p.z * 3 + p.x) + 0.03 * vnoise(p.x * 4, 0, p.z * 4); }),
      (p) => hash3(p.x * 60, p.y * 60, p.z * 60) > 0.95 ? [0.92, 0.86, 0.8] : mul3([0.6, 0.17, 0.16], 0.86 + 0.14 * Math.sin(p.x * 26 + p.z * 4)));
    // 辣椒段：一截截红亮的空心小管，切口一圈浅色的肉
    const chili = paint(new THREE.CylinderGeometry(1, 0.9, 1.5, 10, 1, true).rotateZ(Math.PI / 2), (p) => mul3([0.86, 0.1, 0.06], 0.88 + 0.12 * Math.sin(Math.atan2(p.z, p.y) * 5) + (Math.abs(p.x) > 0.68 ? 0.15 : 0)));
    return { tomato, egg, cabbage, lettuce, scallion, chicken, pork, mutton, beef, chili };
  })();
  Object.values(FOOD_GEO).forEach((g) => bin.add(g));

  // ---------------- 外面弄来的：鸡肉、猪肉、羊肉、牛肉、辣椒。每样一碟摆在台面前沿（不挡旋钮），有了才出现 ----------------
  // 鸡是窗外抓的（animals.ts）；猪、羊、牛是圈里抓的（livestock.ts）；辣椒是园子里摘的（countryside.ts）。都走 pantry:add {item}
  const stock: Record<Pantry, number> = { chicken: 0, pork: 0, mutton: 0, beef: 0, chili: 0 };
  const pantryMesh = {} as Record<Pantry, THREE.Group>;
  const dishGeo = (s2: number) => shade(new THREE.LatheGeometry([[0, 0.003], [0.07, 0.003], [0.085, 0.014], [0.088, 0.016], [0, 0.006]].map(([r2, y]) => new THREE.Vector2(r2 * s2, y * Math.min(1, s2 * 1.2))), 28), 0xf3f1ea, 0.01);
  const pantryDish = (k: Pantry, x: number, z: number, parts: THREE.BufferGeometry[]) => {
    const g = new THREE.Group(); g.position.set(x, TOP, z); g.visible = false; g.userData.keepsStove = true; root.add(g);
    g.add(mergeVeg(parts)); pantryMesh[k] = g; vegMeshes[k] = g;
    pick(g, { click: () => onVeg(k) });
  };
  {
    // 鸡肉：一盘切好的生鸡块 + 一只鸡腿
    const parts = [dishGeo(1)];
    for (let i = 0; i < 7; i++) { const a = i * 2.4, rr = 0.018 + (i % 3) * 0.016, sc = 0.012 + (i % 3) * 0.0015; parts.push(FOOD_GEO.chicken.clone().scale(sc, sc, sc).rotateY(a * 1.7).translate(Math.cos(a) * rr - 0.01, 0.016 + (i % 2) * 0.005, Math.sin(a) * rr)); }
    const leg = paint(new THREE.LatheGeometry([[0, 0], [0.0045, 0.001], [0.005, 0.012], [0.0045, 0.022], [0.008, 0.032], [0.014, 0.046], [0.016, 0.06], [0.012, 0.072], [0, 0.076]].map(([r2, y]) => new THREE.Vector2(r2, y)), 14),
      (p2) => p2.y < 0.011 ? [0.93, 0.9, 0.82] : mul3([0.88, 0.7, 0.48], hash3(p2.x * 500, p2.y * 500, p2.z * 500) > 0.88 ? 0.9 : 1));
    parts.push(leg.rotateZ(Math.PI / 2 - 0.1).rotateY(0.6).translate(0.035, 0.024, 0.03));
    pantryDish('chicken', 0.3, 0.2, parts);
    // 猪肉、羊肉、牛肉：小碟里码着几片生肉
    const slices = (k: 'pork' | 'mutton' | 'beef', sc: number, n: number) => {
      const out = [dishGeo(0.66)];
      for (let i = 0; i < n; i++) { const a = i * 2.1 + 0.4, rr = i ? 0.016 + (i % 2) * 0.008 : 0; out.push(FOOD_GEO[k].clone().scale(sc, sc, sc).rotateY(a).rotateX(k === 'mutton' ? 0 : (i % 2 ? 0.12 : -0.1)).translate(Math.cos(a) * rr, 0.012 + i * 0.0035, Math.sin(a) * rr)); }
      return out;
    };
    pantryDish('pork', -0.5, 0.245, slices('pork', 0.016, 6));
    pantryDish('mutton', -0.31, 0.25, slices('mutton', 0.013, 6));
    pantryDish('beef', 0.0, 0.25, slices('beef', 0.016, 6));
    // 辣椒：小碟里几根整辣椒（弯弯的红椒，青色的蒂）
    const chilis = [dishGeo(0.6)];
    for (let i = 0; i < 6; i++) {
      const body = paint(reshape(new THREE.CylinderGeometry(0.0075, 0.0015, 0.048, 8, 6).translate(0, -0.024, 0), (p) => { const t2 = -p.y / 0.048; p.x += t2 * t2 * 0.008; }), (p) => p.y > -0.004 ? [0.3, 0.52, 0.2] : mul3([0.84, 0.1, 0.06], 0.9 + 0.1 * Math.sin(p.x * 900)));
      // 顺着一个方向并排躺着，蒂朝一边
      chilis.push(body.rotateZ(Math.PI / 2).rotateY(0.5 + (i % 2 ? 0.25 : -0.2) + (i - 2.5) * 0.06).translate(-0.018 + (i % 3) * 0.004, 0.011 + (i > 3 ? 0.008 : 0), -0.022 + i * 0.009));
    }
    pantryDish('chili', 0.51, 0.245, chilis);
  }
  const NEED: Record<Pantry, string> = { chicken: '没有鸡肉了 · 去窗外抓一只鸡', pork: '没有猪肉了 · 去窗外猪圈双击一头猪', mutton: '没有羊肉了 · 去窗外羊圈双击一只羊', beef: '没有牛肉了 · 去窗外牛棚双击一头牛', chili: '没有辣椒了 · 去窗外园子里点辣椒秧摘一把' };
  on(bus, 'pantry:add', (d: { item: string }) => {
    const k = d?.item as Pantry;
    if (!(k in stock)) return;
    stock[k]++; pantryMesh[k].visible = true; if (focused) refresh();
  });

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
  // 盘里菜底下的软阴影
  const plateShadowM = bin.add(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, alphaMap: radialAlpha(0.3) }));
  const plateShadowMesh = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.09, 32).rotateX(-Math.PI / 2)), plateShadowM);
  plateShadowMesh.position.y = 0.0089; plateShadowMesh.visible = false; plate.add(plateShadowMesh);

  // ---------------- 菜块：锅里、盘里各一组实例化网格（每样菜一个，几何各不相同；顶点色是生的样子，实例颜色乘上去管熟没熟、糊没糊）----------------
  const MAX = 128; // 每样菜的实例上限，也是锅里总块数上限
  const VEGS: Veg[] = ['tomato', 'egg', 'cabbage', 'lettuce', 'scallion', 'chicken', 'pork', 'mutton', 'beef', 'chili'];
  const chunkMat = std({ vertexColors: true, roughness: 0.32, metalness: 0.02, side: THREE.DoubleSide });
  type ChunkSet = Record<Veg, THREE.InstancedMesh>;
  const makeChunks = (parent: THREE.Object3D): ChunkSet => {
    const set = {} as ChunkSet;
    for (const k of VEGS) {
      const im = new THREE.InstancedMesh(FOOD_GEO[k], chunkMat, MAX); im.count = 0; im.visible = false; im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
      parent.add(im); set[k] = im;
    }
    return set;
  };
  const wokChunks = makeChunks(wok), plateChunks = makeChunks(plate);
  const clearChunks = (set: ChunkSet) => { for (const k of VEGS) { set[k].count = 0; set[k].visible = false; } };
  /** 一块菜：r（0–1，按锅的半径算）、a 角度、hh 半高；翻炒 / 颠勺时从 (fr, fa) 被抛起、在空中翻个身落到 (r, a)（时间按动作进度 u 算，t0–t1） */
  type Chunk = { veg: Veg; r: number; a: number; s: THREE.Vector3; hh: number; low: number; rot: THREE.Euler; seed: number; eat?: number; fr?: number; fa?: number; t0?: number; t1?: number; hop?: number; spin?: THREE.Euler; frot?: THREE.Euler };
  let pot: Chunk[] = [];
  const SIZE: Record<Veg, [number, number]> = { tomato: [0.019, 0.014], egg: [0.021, 0.011], cabbage: [0.02, 0.004], lettuce: [0.02, 0.004], scallion: [0.0055, 0.005], chicken: [0.014, 0.009], pork: [0.017, 0.004], mutton: [0.016, 0.003], beef: [0.016, 0.003], chili: [0.0075, 0.0075] };
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  const FLAT = (v: Veg) => v === 'cabbage' || v === 'lettuce' || v === 'scallion' || v === 'pork' || v === 'mutton' || v === 'beef' || v === 'chili';
  /** 叶子、葱段基本平躺着（随便转个方向，稍微歪一点）；块状的随便滚 */
  const randRot = (v: Veg, out = new THREE.Euler()) => FLAT(v) ? out.set((rnd() - 0.5) * 0.8, rnd() * 6.3, (rnd() - 0.5) * 0.8) : out.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
  // 每样菜取几十个顶点当样本：块转了个方向以后，算出它最低的那个点在原点下面多深（用户指出过「锅里的蔬菜有点悬空」：
  // 以前按一个固定的半高往上垫，叶子、躺着的番茄瓣都垫高了；现在让最低点正好贴着锅面）
  const SAMPLES: Record<Veg, THREE.Vector3[]> = {} as Record<Veg, THREE.Vector3[]>;
  for (const k of VEGS) { const P = FOOD_GEO[k].getAttribute('position'), step = Math.max(1, Math.floor(P.count / 90)), arr: THREE.Vector3[] = []; for (let i = 0; i < P.count; i += step) arr.push(new THREE.Vector3().fromBufferAttribute(P, i)); SAMPLES[k] = arr; }
  const qL = new THREE.Quaternion(), vL = new THREE.Vector3();
  const lowOf = (c: Chunk) => { qL.setFromEuler(c.rot); let lo = 0; for (const p of SAMPLES[c.veg]) { const y = vL.copy(p).multiply(c.s).applyQuaternion(qL).y; if (y < lo) lo = y; } return c.low = -lo; };
  const newChunk = (veg: Veg): Chunk => { const v2 = 0.82 + rnd() * 0.4, [sz, hh] = SIZE[veg]; const c: Chunk = { veg, r: Math.pow(rnd(), 0.8) * 0.82, a: rnd() * Math.PI * 2, s: new THREE.Vector3(sz, sz, sz).multiplyScalar(v2), hh: hh * v2, low: 0, rot: randRot(veg), seed: rnd() * 10 }; lowOf(c); return c; };
  /** 熟了以后的色调（乘在生的顶点色上）：番茄变深变软、蛋金黄、菜叶蔫绿、鸡肉从粉炒到金黄 */
  const COOKED: Record<Veg, RGB> = { tomato: [0.88, 0.8, 0.78], egg: [1, 0.9, 0.74], cabbage: [0.88, 0.94, 0.72], lettuce: [0.72, 0.84, 0.56], scallion: [0.82, 0.9, 0.7], chicken: [1.02, 0.86, 0.6], pork: [0.86, 1.12, 1.0], mutton: [0.75, 1.35, 1.05], beef: [0.72, 1.5, 1.3], chili: [0.95, 0.9, 0.85] };
  const BURNT = new THREE.Color(0.11, 0.08, 0.065);
  const chunkColor = (c: Chunk, done: number, burnt: number, out: THREE.Color) => {
    const k = Math.min(1, done / 3), ck = COOKED[c.veg], v2 = 0.92 + (c.seed % 1) * 0.16;
    out.setRGB(1 + (ck[0] - 1) * k, 1 + (ck[1] - 1) * k, 1 + (ck[2] - 1) * k).multiplyScalar(v2);
    if (c.veg === 'scallion' && c.seed % 1 < 0.3) out.multiply(tmpPale); // 三成是葱白段
    if (soyTint > 0) out.lerp(tmpSoy.copy(out).multiply(SOY_COL), Math.min(1, soyTint * 0.55)); // 放了酱油：裹上一层酱色
    return out.lerp(BURNT, burnt);
  };
  const tmpC = new THREE.Color(), tmpPale = new THREE.Color(2.5, 1.5, 3.3), tmpSoy = new THREE.Color(), SOY_COL = new THREE.Color(0.72, 0.5, 0.32);
  let soyTint = 0;
  const eA = new THREE.Euler(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qS = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), nS = new THREE.Vector3();
  const mouth = new THREE.Vector3(); // 吃的时候菜飞去的地方（盘子坐标），每帧按镜头算
  const idx = Object.fromEntries(VEGS.map((k) => [k, 0])) as Record<Veg, number>;
  /** 摆菜：surf(r) 是表面高度；u ≥ 0 时按每块的 t0–t1 抛起翻身；slx/slz 是整锅菜被晃到一边的量（锅壁处会顺着往上爬） */
  const layout = (set: ChunkSet, list: Chunk[], surf: (r: number) => number, rMax: number, jump: number, t: number, done: number, burnt: number, u = -1, slx = 0, slz = 0) => {
    for (const k of VEGS) idx[k] = 0;
    list.forEach((c, i) => {
      let x = Math.cos(c.a) * c.r * rMax, z = Math.sin(c.a) * c.r * rMax, lift = 0;
      q.setFromEuler(c.rot);
      if (u >= 0 && c.t0 !== undefined && c.t1 !== undefined && c.fr !== undefined && c.fa !== undefined) {
        const k = THREE.MathUtils.clamp((u - c.t0) / (c.t1 - c.t0), 0, 1), ke = k * k * (3 - 2 * k);
        const x0 = Math.cos(c.fa) * c.fr * rMax, z0 = Math.sin(c.fa) * c.fr * rMax;
        x = x0 + (x - x0) * ke; z = z0 + (z - z0) * ke;
        lift = Math.sin(k * Math.PI) * (c.hop ?? 0.03);
        if (c.frot && c.spin) { qA.setFromEuler(c.frot); qB.setFromEuler(eA.set(c.rot.x + c.spin.x * (1 - ke), c.rot.y + c.spin.y * (1 - ke), c.rot.z + c.spin.z * (1 - ke))); q.copy(qA).slerp(qB, ke); }
      }
      // 晃：每块跟得不一样多，在锅底的跟得多、已经在锅壁上的少
      const w = (0.65 + 0.55 * ((c.seed * 3.7) % 1)) * (lift > 0.004 ? 0.3 : 1);
      x += slx * w; z += slz * w;
      let rr = Math.hypot(x, z); const lim = rMax * 1.25; if (rr > lim) { x *= lim / rr; z *= lim / rr; rr = lim; }
      // 贴着表面：按表面坡度把块倾过去（锅壁上的叶子顺着锅壁躺），最低点落在表面上、只往下陷一点点；
      // 中间的少数块叠在别的块上面一层；热锅里轻轻跳（以前跳得高，一半时间看着悬空）
      const sl2 = (surf(rr + 0.003) - surf(Math.max(0, rr - 0.003))) / 0.006;
      if (rr > 1e-4) { nS.set(-x / rr * sl2, 1, -z / rr * sl2).normalize(); q.premultiply(qS.setFromUnitVectors(UP, nS)); }
      const stack = (i % 4 === 0 ? 1 : 0) * 0.6 * c.hh * Math.max(0, 1 - rr / (rMax * 0.7));
      let h = surf(rr) + c.low * 0.85 + stack + Math.max(0, Math.sin(t * 9 + c.seed * 7)) * jump * (0.5 + (c.seed % 0.5)) + lift;
      const sc = s3.copy(c.s);
      if (c.eat !== undefined) { // 被筷子夹起来：从盘里飞到嘴边、越飞越小
        const k = Math.min(1, c.eat), ke = k * k * (3 - 2 * k);
        x += (mouth.x - x) * ke; z += (mouth.z - z) * ke; h += (mouth.y - h) * ke + Math.sin(k * Math.PI) * 0.05;
        sc.multiplyScalar(1 - 0.5 * ke);
      }
      v.set(x, h, z);
      const im = set[c.veg], j = idx[c.veg]++;
      m4.compose(v, q, sc);
      im.setMatrixAt(j, m4);
      im.setColorAt(j, chunkColor(c, done, burnt, tmpC));
    });
    for (const k of VEGS) { const im = set[k]; im.count = idx[k]; im.visible = idx[k] > 0; if (idx[k]) { im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; } }
  };
  /** 开始翻 / 颠一下：每块菜记下现在的位置，挑一个新位置。
   *  翻（锅铲从靠人那边推到对面）：离人近的先被铲到，对面的最后翻回来，抛得低；
   *  颠勺：整锅差不多同时腾空，抛得高、翻得猛 */
  const tossPlan = (flip: boolean) => {
    const hx = Math.sin(STROKE_YAW), hz = Math.cos(STROKE_YAW);
    for (const c of pot) {
      c.fr = c.r; c.fa = c.a; c.frot = c.rot.clone();
      if (flip) { c.t0 = 0.3 + rnd() * 0.08; c.t1 = 0.74 + rnd() * 0.2; c.hop = 0.07 + rnd() * 0.06; }
      else {
        const proj = (Math.cos(c.a) * hx + Math.sin(c.a) * hz) * c.r; // -1（对面）… 1（靠人）
        c.t0 = 0.2 + 0.32 * (1 - (proj + 1) / 2) + rnd() * 0.04;
        c.t1 = Math.min(0.97, Math.max(c.t0 + 0.25, 0.68 + rnd() * 0.24));
        c.hop = 0.025 + rnd() * 0.04;
      }
      c.r = Math.pow(rnd(), 0.8) * 0.82; c.a = rnd() * Math.PI * 2; // 菜大多落回锅底，少数挂在锅坡上
      const sp = flip ? 1.7 : 1;
      c.spin = new THREE.Euler((rnd() - 0.5) * 7 * sp, (rnd() - 0.5) * 4 * sp, (rnd() - 0.5) * 7 * sp);
      if (FLAT(c.veg)) c.spin.x = Math.round(c.spin.x / Math.PI) * Math.PI; // 叶子翻个面还是平躺着落下
      randRot(c.veg, c.rot); lowOf(c);
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
  let pourT = -1, stirT = -1, plateT = -1, tossT = -1, flips = 0;
  let queued: 'stir' | 'toss' | null = null;
  // 整锅菜被晃到一边的量（锅局部坐标的 x、z）：弹簧追着目标走，所以推一下、颠一下以后会来回晃几下
  const sl = new THREE.Vector2(), slV = new THREE.Vector2(), slT = new THREE.Vector2();
  const DIRH = new THREE.Vector3(Math.sin(WOK_HY), 0, Math.cos(WOK_HY)), TILT_AX = new THREE.Vector3(DIRH.z, 0, -DIRH.x);
  const wokOff = new THREE.Vector3(), wokQ = new THREE.Quaternion(), qT = new THREE.Quaternion(), X_AX = new THREE.Vector3(1, 0, 0);
  const stirFrom: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const tmpPose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  let plated: { list: Chunk[]; done: number; burnt: number; tomato: boolean; smoke: number; soy: number; hearts: number; hot: boolean } | null = null;
  // 酱油、陈醋（用户要的「可以放酱油、陈醋，放得合适可以适当提升效果」）：这一锅各倒了几下
  let soy = 0, vin = 0;
  let pourC: { g: THREE.Group; home: THREE.Vector3; t: number; kind: 'soy' | 'vin'; hit: boolean } | null = null;
  const streamM = std({ color: 0x2a1206, roughness: 0.1 });
  const stream = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0022, 0.0018, 1, 6).translate(0, -0.5, 0)), streamM);
  stream.visible = false; root.add(stream);
  // 吃（用户要的「做好的菜可以吃，吃的时候要有吃的声音，好吃和不好吃声音不一样」）：一双竹筷子夹一筷子送到嘴边，三口吃完
  let bite = -1, bites = 0, moreBite = false;
  const chop = new THREE.Group(); chop.visible = false; world.add(chop);
  {
    const bamboo = std({ color: 0xd9b47c, roughness: 0.55 }), cb3 = new Batch();
    for (const sx of [-1, 1]) cb3.add(bamboo, new THREE.CylinderGeometry(0.0016, 0.0032, 0.23, 6).rotateX(Math.PI / 2).translate(0, 0, 0.115), [sx * 0.003, 0, 0], [0, sx * 0.035, 0]);
    cb3.build(chop, bin);
  }
  const CHOP_DIR = new THREE.Vector3(0.35, 0.45, 0.82).normalize(), Z_AX = new THREE.Vector3(0, 0, 1), qChop = new THREE.Quaternion().setFromUnitVectors(Z_AX, CHOP_DIR);
  const pickPt = new THREE.Vector3(), mouthW = new THREE.Vector3(), camFwd = new THREE.Vector3(), camUp = new THREE.Vector3();
  const flies: { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; done: () => void }[] = [];
  const say = (msg: string | null) => { if (focused) emit(bus, 'cup:state', msg ? { msg } : null); };
  const vegIn = () => [...new Set(pot.map((c) => c.veg))];
  const hint = (): string => {
    if (phase === 'plating') return '出锅……';
    if (phase === 'cooking') {
      if (!fire) return '火关了，菜在锅里等着 · 拧旋钮点火接着炒';
      if (prompt) return '翻一下！点锅铲';
      return `炒着呢……（翻了 ${stirs}/3 次${flips ? ` · 颠了 ${flips} 下勺` : ''}）${stirs === 0 ? ' · 还能再放菜' : ''} · 点锅颠勺 · 酱油、陈醋点了倒一点`;
    }
    if (!fire && !oil) return '拧灶台前面左边的旋钮点火';
    if (!oil) return '点油壶，往锅里倒油';
    if (!fire) return '锅里有油了 · 拧旋钮点火';
    if (heat < 1) return '油在热……等它冒烟';
    const have = (Object.keys(stock) as Pantry[]).filter((k) => stock[k] > 0).map((k) => `${VEG_NAME[k]}${stock[k] > 1 ? ` ×${stock[k]}` : ''}`);
    return `油冒烟了 · 点筐里的菜放进锅（可以放好几样）${have.length ? ` · 台面上还有${have.join('、')}` : ' · 窗外的鸡、猪、羊、牛能抓来炒，园子里的辣椒能摘'}`;
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
    if (k in stock && stock[k as Pantry] <= 0) { say(NEED[k as Pantry]); setTimeout(refresh, 1800); return; }
    if (!oil) { say('先倒油'); setTimeout(refresh, 1300); return; }
    if (phase === 'cooking' && stirs > 0) { say('已经开炒了，下一锅再放'); setTimeout(refresh, 1300); return; }
    if (pot.length + VEG_PORTION[k] > MAX) { say('锅满了'); setTimeout(refresh, 1300); return; }
    // 菜从筐里飞进锅
    const src = vegMeshes[k]!;
    const fly = src.clone(); fly.position.copy(src.getWorldPosition(new THREE.Vector3())); fly.rotation.y = Math.PI / 2; world.add(fly);
    if (k in stock) { const p2 = k as Pantry; stock[p2]--; pantryMesh[p2].visible = stock[p2] > 0; }
    const to = wok.localToWorld(new THREE.Vector3(0, 0.05, 0));
    flies.push({ obj: fly, from: fly.position.clone(), to, t: 0, done: () => {
      world.remove(fly);
      for (let i = 0; i < VEG_PORTION[k]; i++) pot.push(newChunk(k));
      noise(0.6, 3000, 0.5, 0.4, 'highpass'); // 下锅「刺啦」一声
      if (phase === 'prep') { phase = 'cooking'; ct = 0; stirs = 0; flips = 0; soy = 0; vin = 0; nextPrompt = 3; prompt = false; burnt = 0; reactions.length = 0; oilCold = heat < 1; }
      slV.x += (rnd() - 0.5) * 0.4; slV.y += 0.3; // 菜落进锅里，整锅晃一下
      refresh();
    } });
  };
  const onStir = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    if (phase === 'cooking' && (stirT >= 0 || tossT >= 0)) { queued = stirT >= 0 ? null : 'stir'; return; } // 正在颠勺：颠完马上翻
    if (phase !== 'cooking') { if (phase === 'prep') { say('先点火倒油、下菜，再用锅铲翻'); setTimeout(refresh, 1500); } return; }
    stirT = 0; stirFrom.p.copy(spatula.position); stirFrom.q.copy(spatula.quaternion); tossPlan(false);
    noise(0.45, 1800, 0.8, 0.12, 'bandpass', 0.12); // 铲子刮锅底「嚓」
    tone(620, 0.07, 0.05, 0.5, 420, 'triangle'); noise(0.4, 3200, 0.6, 0.3, 'highpass', 0.5); // 翻过来、菜落回锅里「刺啦」
    if (prompt) {
      reactions.push(ct - promptAt); stirs++; prompt = false; nextPrompt = ct + 3;
      spatGlow.emissiveIntensity = 0;
      if (stirs >= 3) setTimeout(() => finish(false), 650);
    }
    refresh();
  };
  /** 颠勺（用户要的「点炒锅颠勺，能适当增加菜品红心」）：锅往前一送、猛地往回一带、远边抬起，整锅菜腾空翻个身落回来。
   *  一锅里颠满两下，出锅多一颗心（最多 5 颗）；不算「翻一下」，提醒了还得用锅铲翻 */
  const onToss = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    if (phase !== 'cooking') { if (phase === 'prep') { say(oil ? '锅里还没菜 · 下了菜再颠勺' : '先点火、倒油、下菜，再颠勺'); setTimeout(refresh, 1500); } return; }
    if (tossT >= 0 || stirT >= 0) { queued = tossT >= 0 ? null : 'toss'; return; } // 锅铲还在翻：翻完马上颠
    tossT = 0; flips++; tossPlan(true);
    noise(0.35, 380, 0.7, 0.25, 'lowpass', 0.12); // 锅底擦过锅架「呼」的一下
    noise(0.5, 3400, 0.6, 0.35, 'highpass', 0.62); // 落回锅里「刺啦」
    tone(520, 0.06, 0.04, 0.6, 380, 'triangle');
    refresh();
  };
  // ---- 吃的声音：嚼（好吃的嚼得脆、快；不好吃的嚼得慢）+ 一声「嗯～」/「呃……」/ 糊了咳嗽，全是现合成的 ----
  const chew = (n: number, gap: number, f: number, g: number) => { for (let i = 0; i < n; i++) noise(0.06 + Math.random() * 0.04, f * (0.8 + Math.random() * 0.4), 1.2, g * (0.7 + Math.random() * 0.5), 'bandpass', i * gap); };
  /** 闭着嘴哼一声：锯齿波声带 + 低通（鼻音「嗯」），音高按 f0 → f1 → f2 走，带一点颤音 */
  const hum = (f0: number, f1: number, f2: number, dur: number, at: number, gain: number) => {
    if (!ac) return;
    const t0 = ac.currentTime + 0.01 + at, o = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.45); o.frequency.linearRampToValueAtTime(f2, t0 + dur);
    vib.frequency.value = 5.5; vg.gain.value = f0 * 0.025; vib.connect(vg).connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 560; lp.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.06); g.gain.setValueAtTime(gain, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp).connect(g).connect(ac.destination); o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
    o.onended = () => { o.disconnect(); vib.disconnect(); vg.disconnect(); lp.disconnect(); g.disconnect(); };
  };
  const eatSound = (hearts: number, isBurnt: boolean) => {
    if (isBurnt) { chew(5, 0.2, 650, 0.38); for (const at of [1.05, 1.32]) { noise(0.16, 900, 0.7, 0.55, 'bandpass', at); hum(270, 230, 190, 0.14, at, 0.05); } return '咳咳……全是糊味';
    }
    if (hearts >= 4) { chew(6, 0.14, 2300, 0.22); hum(170, 240, 205, 0.6, 0.95, 0.14); if (hearts >= 5) hum(225, 310, 270, 0.22, 1.65, 0.12); return hearts >= 5 ? '嗯～太香了！' : '嗯～好吃！'; }
    if (hearts === 3) { chew(5, 0.19, 1800, 0.2); hum(165, 178, 160, 0.3, 1.05, 0.09); return '嗯，还行'; }
    chew(4, 0.32, 1400, 0.16); hum(185, 150, 105, 0.75, 1.4, 0.11); return '呃……不太好吃';
  };
  const onPlate = () => {
    if (!focused) { emit(bus, 'stove:focus'); return; }
    if (!plated || phase === 'plating') return;
    if (bite >= 0) { moreBite = true; return; } // 正在嚼：嚼完接着夹下一筷子
    const left = plated.list.filter((c) => c.eat === undefined);
    if (!left.length) return;
    ensureAudio();
    // 这一筷子夹三分之一（最后一口夹完）：挑挨着的几块
    const n = Math.ceil(left.length / Math.max(1, 3 - bites)), a0 = rnd() * Math.PI * 2;
    left.sort((p1, p2) => Math.abs(Math.sin((p1.a - a0) / 2)) * p1.r - Math.abs(Math.sin((p2.a - a0) / 2)) * p2.r).slice(0, n).forEach((c) => { c.eat = 0; });
    const first = left[0]; pickPt.set(Math.cos(first.a) * first.r * 0.085, 0.03, Math.sin(first.a) * first.r * 0.085);
    bite = 0; bites++;
  };
  // ---- 倒酱油 / 陈醋：提起瓶子到锅上方、一歪，一道细细的酱色流进锅里，「滋啦」一声 ----
  const onCond = (kind: 'soy' | 'vin') => {
    if (!focused) { emit(bus, 'stove:focus'); return; } ensureAudio();
    const label = kind === 'soy' ? '酱油' : '醋';
    if (phase !== 'cooking') { if (phase === 'prep') { say(`下了菜再放${label}`); setTimeout(refresh, 1500); } return; }
    if (pourC) return;
    if ((kind === 'soy' ? soy : vin) >= 3) { say(`${label}够多了，再放就没法吃了`); setTimeout(refresh, 1500); return; }
    const g = kind === 'soy' ? soyBottle : vinBottle;
    pourC = { g, home: g.position.clone(), t: 0, kind, hit: false };
    streamM.color.setHex(kind === 'soy' ? 0x2a1206 : 0x3b2512);
  };
  pick(soyBottle, { click: () => onCond('soy') });
  pick(vinBottle, { click: () => onCond('vin') });
  knobs.forEach((k) => pick(k, { click: onKnob }));
  pick(oilBottle, { click: onOil });
  pick(spatula, { click: onStir });
  pick(wok, { click: onToss });
  pick(plate, { click: onPlate });

  /** 出锅：锅里的菜飞到盘子上；算菜名和喜欢程度，发 dish:show */
  /** 点了醋改名：醋溜、酸辣 */
  const VIN_NAME: Record<string, string> = { '清炒白菜': '醋溜白菜', '清炒生菜': '醋溜生菜', '辣炒白菜': '酸辣白菜', '辣炒生菜': '酸辣生菜', '香辣小炒': '酸辣小炒' };
  const finish = (isBurnt: boolean) => {
    if (phase !== 'cooking') return;
    phase = 'plating'; prompt = false; queued = null; spatGlow.emissiveIntensity = 0;
    const set = vegIn();
    const [name0, base, comment0] = recipeOf(set);
    // 评价（用户要的「做菜的评价不错，也要再丰富一点」）：菜名、红心之外，卡片上还有几个小标签（火候、锅气、口味……）、
    // 一句尝起来怎么样（按放了什么菜挑）、做的过程哪里好哪里差（每条好几种说法，随机挑），最后一句「食客」的点评
    const any = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    let hearts = base, name = name0;
    const tags: string[] = [], notes: string[] = [];
    const meats = set.filter((x) => MEATS.includes(x)), hot = set.includes('chili'), veg = set.some((x) => x === 'cabbage' || x === 'lettuce' || x === 'scallion');
    if (isBurnt) { hearts = 0; name = `糊了的${name0}`; tags.push('糊了'); notes.push(any(['黑乎乎的……下次提醒了就快翻', '一股焦味，锅底都黑了', '炒成了炭，下回手快点'])); }
    else {
      const avg = reactions.reduce((a, x) => a + x, 0) / Math.max(1, reactions.length);
      if (oilCold) { hearts--; tags.push('粘锅'); notes.push(any(['油还没热就下锅了，有点粘', '油温不够就下菜，吃着有点水', '冷锅冷油，菜有点塌'])); }
      if (avg > 1.3) { hearts--; tags.push('焦边'); notes.push(any(['翻得慢了点，有点焦边', '翻晚了，底下有点糊味', '手慢了半拍，边上焦了'])); }
      else if (avg < 0.7 && !oilCold) { tags.push('火候正好'); notes.push(any(['火候正好', '每次都翻得及时，一点没焦', '翻得又快又匀，火候拿捏得准'])); }
      if (flips >= 2) { hearts++; tags.push('锅气足'); notes.push(any([`颠了 ${flips} 下勺，锅气十足`, `${flips} 下颠勺，有大厨的范儿`, '颠勺颠得漂亮，香味全炒出来了'])); }
      // 调料：放一下、放对了菜加一颗心；放多了扣一颗。酱油配肉、白菜、生菜、葱（番茄、光炒蛋不放）；醋配白菜、生菜（醋溜）
      const soyLover = set.some((x) => MEATS.includes(x) || x === 'cabbage' || x === 'lettuce' || x === 'scallion') && !set.includes('tomato');
      const vinLover = (set.includes('cabbage') || set.includes('lettuce')) && !set.includes('tomato') && !set.includes('egg');
      if (soy === 1) { if (soyLover) { hearts++; tags.push('酱香'); notes.push(any(['一勺酱油提鲜上色', '酱油点得刚好，颜色红亮', '酱油一烹，香味一下就出来了'])); } else notes.push(any(['这道菜其实不用放酱油', '酱油抢了原本的味'])); }
      else if (soy >= 2) { hearts--; tags.push('偏咸'); notes.push(any(['酱油放多了，齁咸', '咸得要喝两碗水', '酱油倒多了，颜色发黑'])); }
      if (vin === 1) { if (vinLover) { hearts++; tags.push('酸香'); notes.push(any(['沿锅边点了醋，酸香开胃', '一点醋，脆生生又开胃'])); name = VIN_NAME[name0] ?? name; } else notes.push(any(['醋放得有点怪', '这道菜放醋，味道有点打架'])); }
      else if (vin >= 2) { hearts--; tags.push('太酸'); notes.push(any(['醋放多了，酸得倒牙', '酸得眯起了眼睛'])); }
      hearts = Math.max(1, Math.min(5, hearts));
    }
    // 口味标签和一句「尝起来」：按放了什么挑
    if (!isBurnt) {
      if (hot) tags.push('香辣'); if (set.includes('tomato')) tags.push('酸甜'); if (meats.length && veg) tags.push('荤素搭配');
      else if (meats.length >= 2) tags.push('硬菜'); else if (!meats.length && !set.includes('egg')) tags.push('清淡');
      if (set.length >= 3) tags.push('料足');
    }
    const TASTE: [boolean, string[]][] = [
      [hot && meats.length > 0, ['辣得过瘾，越吃越想吃', '香辣下饭，米饭不够了', '辣椒的香全裹在肉上']],
      [hot, ['辣乎乎的，额头冒汗', '一口下去辣得直吸气']],
      [set.includes('beef'), ['牛肉片嫩，嚼着有劲', '牛肉吸饱了汁，越嚼越香']],
      [set.includes('mutton'), ['羊肉鲜嫩，一点不膻', '羊肉香，吃完身上暖暖的']],
      [set.includes('pork'), ['肥瘦相间，油润不腻', '肉片焦香，满口肉味']],
      [set.includes('chicken'), ['鸡肉紧实，越嚼越香', '散养鸡就是香']],
      [set.includes('tomato'), ['番茄炒出了沙，汤汁浓', '酸甜的汤汁拌饭正好']],
      [set.includes('egg'), ['鸡蛋金黄蓬松', '蛋炒得嫩，一夹就散']],
      [veg, ['清清爽爽，一股菜园的清香', '脆嫩爽口，吃着不腻']],
    ];
    const taste = isBurnt ? '' : any(TASTE.find(([ok]) => ok)?.[1] ?? ['家常味道']);
    const comment = isBurnt ? comment0 : `${comment0}。${taste}`;
    const VERDICT: Record<number, string[]> = {
      0: ['锅都快烧穿了……', '黑乎乎的，猫都不吃', '还是叫外卖吧'],
      1: ['……还是叫外卖吧', '吃了两口就放下了', '下次换个做法试试'],
      2: ['有点难以下咽', '能吃，但不太想吃第二口', '味道怪怪的'],
      3: ['能吃，还有进步空间', '味道一般般，凑合', '中规中矩的家常菜'],
      4: ['挺好吃，下次还做', '家常味，吃着舒服', '有妈妈做的味道了'],
      5: ['这手艺能开饭馆了！', '再来一盘！', '香得邻居都探头来看', '吃得盘子都舔干净了'],
    };
    const by = any(['隔壁王大爷', '楼下张婶', '窗外的橘猫', '门口的大黄', '自己', '路过的邮递员']);
    const verdict = any(VERDICT[hearts] ?? VERDICT[3]);
    const list = pot; pot = [];
    plateT = 0;
    const from = wok.localToWorld(new THREE.Vector3(0, 0.05, 0)), to = plate.localToWorld(new THREE.Vector3(0, 0.03, 0));
    const fly = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.06, 10, 8).scale(1, 0.4, 1)), std({ color: isBurnt ? 0x1d140e : VEG_COLOR[list[0]?.veg ?? 'egg'], roughness: 0.5 }));
    fly.position.copy(from); world.add(fly);
    flies.push({ obj: fly, from, to, t: 0, done: () => {
      world.remove(fly);
      plated = { list: list.map((c) => ({ ...c, r: Math.min(1, c.r * 1.05), eat: undefined })), done: 3, burnt: isBurnt ? 1 : 0, tomato: set.includes('tomato') && !isBurnt, smoke: isBurnt ? 1 : 0.6, soy, hearts, hot: set.includes('chili') };
      bites = 0; bite = -1; moreBite = false; chop.visible = false;
      sauce.visible = !isBurnt; (sauce.material as THREE.MeshStandardMaterial).color.setHex(set.includes('tomato') ? 0xc0391e : soy > 0 ? 0x6a3818 : 0xd9a52a);
      (sauce.material as THREE.MeshStandardMaterial).opacity = set.includes('tomato') ? 0.85 : soy > 0 ? 0.75 : 0.45;
      emit(bus, 'dish:show', { name, hearts, comment, notes, tags: [...new Set(tags)].slice(0, 5), verdict, by, burnt: isBurnt });
      // 一锅做完：关火、锅里的油用完了
      setFire(false); oil = 0; heat = 0; oilDisc.visible = false;
      phase = 'prep'; burnt = 0; clearChunks(wokChunks);
      say(isBurnt ? '糊了……点盘子尝一口？' : '出锅！点盘子吃一口（三口吃完）');
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
          q.setFromEuler(e.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15)); // 贴着锅底往外舔，火苗尖不能高过锅底（用户指出过火从锅里穿出来）
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
        if (pourT > 0.42 && pourT < 0.7) { oilDisc.visible = true; oilM.opacity = 0.7 * Math.min(1, (pourT - 0.42) / 0.25); if (pourT - dt / 2.2 <= 0.42) noise(0.8, 500, 1.2, 0.2); } // 油铺开：薄膜贴着锅面，不能缩放（缩了就离开锅面），改成慢慢显出来
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
      const sm = THREE.MathUtils.smootherstep;
      const bump = (x: number, a2: number, b2: number) => Math.sin(Math.PI * THREE.MathUtils.clamp((x - a2) / (b2 - a2), 0, 1));
      let jump = phase === 'cooking' && fire ? 0.0015 : 0, u = -1;
      wokOff.set(0, 0, 0); wokQ.identity(); slT.set(0, 0);
      if (stirT >= 0) {
        stirT = Math.min(1, stirT + dt / 0.95); u = stirT;
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
        const kick = bump(u, 0.5, 0.9);
        wokOff.set(-Math.sin(STROKE_YAW) * kick * 0.012, bump(u, 0.62, 0.87) * 0.012, -Math.cos(STROKE_YAW) * kick * 0.012);
        wokQ.setFromAxisAngle(X_AX, -kick * 0.05);
        // 菜被铲子推着往对面挤，翻过来以后又晃回来
        const push = sm(u, 0.16, 0.55) * (1 - sm(u, 0.55, 0.78));
        slT.set(-Math.sin(STROKE_YAW), -Math.cos(STROKE_YAW)).multiplyScalar(0.045 * push);
        if (stirT >= 1) { stirT = -1; for (const c of pot) c.t0 = c.t1 = undefined; if (queued === 'toss') { queued = null; setTimeout(onToss, 0); } }
      }
      if (tossT >= 0) {
        // 颠勺 0.8 秒：往前一送（菜因为惯性往人这边溜）→ 猛地往回一带、锅抬起来、远边翘高（菜腾空翻身）→ 落回、锅放回火上
        tossT = Math.min(1, tossT + dt / 0.8); u = tossT;
        const away = 0.04 * sm(u, 0, 0.28) * (1 - sm(u, 0.28, 0.5)) - 0.012 * bump(u, 0.45, 0.8);
        wokOff.addScaledVector(DIRH, -away); wokOff.y += 0.03 * bump(u, 0.3, 0.75);
        wokQ.multiply(qT.setFromAxisAngle(TILT_AX, 0.24 * bump(u, 0.28, 0.72) - 0.06 * bump(u, 0, 0.3)));
        slT.set(DIRH.x, DIRH.z).multiplyScalar(0.035 * bump(u, 0, 0.32) - 0.03 * bump(u, 0.78, 1));
        if (tossT >= 1) { tossT = -1; for (const c of pot) c.t0 = c.t1 = undefined; slV.x -= DIRH.x * 0.35; slV.y -= DIRH.z * 0.35; if (queued === 'stir') { queued = null; setTimeout(onStir, 0); } }
      }
      wok.position.copy(WOK).add(wokOff); wok.quaternion.copy(wokQ);
      if (stirT < 0) {
        // 平时：开炒以后搁在锅里（柄靠着锅沿，跟着锅一起动），别的时候挂回墙上；换地方时顺着走过去
        const inPot = phase === 'cooking' || phase === 'plating';
        const gp = inPot ? tmpPose.p.copy(REST.p).sub(WOK).applyQuaternion(wokQ).add(wok.position) : HANG.p;
        const gq = inPot ? tmpPose.q.copy(wokQ).multiply(REST.q) : HANG.q;
        if (tossT >= 0 && spatula.position.distanceTo(gp) < 0.08) { spatula.position.copy(gp); spatula.quaternion.copy(gq); }
        else { const k = 1 - Math.exp(-dt * 7); spatula.position.lerp(gp, k); spatula.quaternion.slerp(gq, k); }
      }
      // 晃：弹簧（约 1.6 赫兹、几下就停），分小步积分
      for (let n = 0, steps = Math.ceil(dt / 0.012), h = dt / Math.max(1, steps); n < steps; n++) {
        slV.x += ((slT.x - sl.x) * 100 - slV.x * 5) * h; slV.y += ((slT.y - sl.y) * 100 - slV.y * 5) * h;
        sl.x += slV.x * h; sl.y += slV.y * h;
      }
      // 倒酱油 / 陈醋
      if (pourC) {
        const pc = pourC, sm2 = THREE.MathUtils.smootherstep;
        pc.t = Math.min(1, pc.t + dt / 1.6);
        const go = sm2(pc.t, 0, 0.3) * (1 - sm2(pc.t, 0.8, 1)), tilt = sm2(pc.t, 0.3, 0.42) * (1 - sm2(pc.t, 0.62, 0.74));
        pc.g.position.lerpVectors(pc.home, v.copy(WOK).add(new THREE.Vector3(0.1, 0.2, 0.03)), go);
        pc.g.rotation.set(0, 0, 2.1 * tilt);
        stream.visible = tilt > 0.75;
        if (stream.visible) {
          pc.g.updateMatrix(); const tip = new THREE.Vector3(0, 0.186, 0).applyMatrix4(pc.g.matrix), end = wok.position.clone().add(new THREE.Vector3(0.03, 0.02, 0.01));
          const d = end.clone().sub(tip); stream.position.copy(tip); stream.scale.set(1, d.length(), 1); stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
        }
        if (!pc.hit && pc.t > 0.45) {
          pc.hit = true; if (pc.kind === 'soy') soy++; else vin++;
          noise(0.9, 2600, 0.5, 0.45, 'highpass'); noise(0.5, 700, 0.8, 0.12, 'bandpass', 0.05); slV.y += 0.15; refresh();
        }
        if (pc.t >= 1) { pc.g.position.copy(pc.home); pc.g.rotation.set(0, 0, 0); stream.visible = false; pourC = null; }
      }
      // 锅里的菜
      soyTint = soy;
      foodShadow.visible = pot.length > 0; foodShadowM.opacity = Math.min(1, pot.length / 36) * 0.6;
      foodShadow.position.set(sl.x * 0.5, 0, sl.y * 0.5); // 跟着整锅菜晃
      if (pot.length) layout(wokChunks, pot, (r) => wokY(r) + 0.0045, 0.12, jump, t, stirs, burnt, u, sl.x, sl.y);
      else clearChunks(wokChunks);
      // 吃：筷子从嘴边伸下来夹住 → 带着这一筷子菜送到嘴边（菜飞向镜头、变小）→ 嚼、出声 → 筷子收走
      if (bite >= 0 && plated) {
        const pl = plated;
        bite += dt / 1.15;
        camera.getWorldDirection(camFwd); camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        mouthW.copy(camera.position).addScaledVector(camFwd, 0.14).addScaledVector(camUp, -0.045);
        plate.worldToLocal(mouth.copy(mouthW));
        const kE = Math.max(0, (bite - 0.32) / 0.5);
        for (const c of pl.list) if (c.eat !== undefined) c.eat = kE;
        const pickW = plate.localToWorld(v.copy(pickPt)).clone(), above = mouthW.clone().addScaledVector(camUp, 0.06);
        chop.visible = bite < 0.95;
        if (bite < 0.32) chop.position.lerpVectors(above, pickW, THREE.MathUtils.smootherstep(bite, 0, 0.32));
        else chop.position.lerpVectors(pickW, mouthW, Math.min(1, THREE.MathUtils.smootherstep(kE, 0, 1)));
        chop.quaternion.copy(camera.quaternion).multiply(qChop);
        if (bite >= 0.8 && bite - dt / 1.15 < 0.8) { const said = eatSound(pl.hearts, !!pl.burnt); if (pl.hot && !pl.burnt) { noise(0.5, 5200, 0.7, 0.1, 'highpass', 1.25); noise(0.4, 4800, 0.7, 0.08, 'highpass', 1.85); } say(pl.hot && !pl.burnt ? `${said} 嘶——好辣！` : said); } // 辣的菜吃完倒吸两口凉气
        if (bite >= 1) {
          bite = -1; chop.visible = false;
          pl.list = pl.list.filter((c) => c.eat === undefined);
          if (moreBite && pl.list.length) { moreBite = false; setTimeout(onPlate, 350); } else moreBite = false;
          if (!pl.list.length) {
            setTimeout(() => { if (plated === pl) { plated = null; clearChunks(plateChunks); sauce.visible = false; emit(bus, 'dish:hide'); say('吃光了，盘子干干净净 · 再来一锅？'); setTimeout(refresh, 2200); } }, 1600);
          } else setTimeout(() => { if (plated === pl && bite < 0) say(`还剩 ${3 - bites} 口 · 点盘子接着吃`); }, 1600);
        }
      }
      // 盘里的菜：堆在中间、外圈低；糊了冒黑烟
      plateShadowMesh.visible = !!plated && plated.list.length > 0;
      if (plated) plateShadowM.opacity = Math.min(1, plated.list.length / 20) * 0.45;
      if (plated) {
        soyTint = plated.soy;
        layout(plateChunks, plated.list, (r) => 0.0085 + Math.max(0, 0.012 - r * 0.12), 0.085, 0, t, plated.done, plated.burnt);
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
