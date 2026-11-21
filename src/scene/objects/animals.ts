import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset, canvasTex } from '../util';
import { addFace, addFur } from '../animalDetail';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
import { baa, bark, cluck, crow, meow, moo, oink, squeal } from '../animalSounds';
import { createLivestock } from '../livestock';
import { L } from '../layout';
import { applyDayTint, SKY } from '../daytime';

type Tint = number | ((x: number, y: number, z: number) => number);
/** 给几何体上顶点色：朝上的面亮一些（屋外的东西不吃室内灯光）。颜色可以按位置给，用来画花纹 */
const paint = (g: THREE.BufferGeometry, tint: Tint) => {
  const n = g.attributes.normal, p = g.attributes.position, c = new THREE.Color(), a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    c.set(typeof tint === 'number' ? tint : tint(p.getX(i), p.getY(i), p.getZ(i)));
    const s = 0.62 + 0.38 * (n.getY(i) * 0.5 + 0.5) + 0.08 * Math.abs(n.getX(i));
    a[i * 3] = c.r * s; a[i * 3 + 1] = c.g * s; a[i * 3 + 2] = c.b * s;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  return out;
};
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g; };

interface Spec { len: number; legLen: number; bodyR: number; headR: number; coat: number; stripe: number; belly: number; ear: number; nose: number; kind: 'cat' | 'dog'; speed: number }

/**
 * 菜园里的活物：
 * - 一只橘猫和一条黄狗时不时沿着菜园中间的横路走过，走到半路停下来站一会儿。猫偶尔贴着窗根走。
 *   用的是带骨骼动画的模型（Quaternius，CC0）：走路和站立两套动作，切换时交叉淡入淡出。模型加载完成前 / 失败时用代码拼的版本顶替。
 * - 稻田里一头站着甩尾巴的水牛（同一来源的牛模型，改成水牛的深灰色）。
 * - 三只鸡在路边踱步、低头啄食。
 * - 两三只蝴蝶在菜地上飞。
 * - 隔一阵有一小群鸟从远处的天上飞过。
 * - 走到窗前看窗外时有叫声（用户要的）：鸡隔一会儿咯咯几声、远处偶尔一声公鸡打鸣；狗、猫在画面里走过时偶尔叫，
 *   停下来朝屋里看的时候更容易叫。声音按左右位置做声像、按距离变小。只在窗前时有，回座位就停。
 * - 跟着一天里的时刻（daytime.ts，用户要的「晚上鸡猫狗都不出来了，只有偶尔飞过的猫头鹰和老鼠，也都配有声音；白天加一点蛐蛐叫」）：
 *   天黑以后鸡、猫、狗、水牛、蝴蝶、鸟群都不出来；隔一阵有一只猫头鹰从月亮那边的天上扑扇着飞过，远处树上时不时「呼——呼呼」叫；
 *   窗根底下被屋里灯光照亮的那一小块地上，偶尔窜过一只老鼠，跑跑停停，吱吱叫。白天窗前有一层轻轻的蛐蛐叫。
 */
export const animals: SceneObject = ({ scene, tier, camera, bus, audio, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const mat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const gy = L.groundY;
  const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(bin.add(g), mat);

  // ---------- 猫和狗 ----------
  const build = (s: Spec) => {
    const root = new THREE.Group(), by = s.legLen + s.bodyR * 0.85, cat = s.kind === 'cat';
    // 躯干：猫的背上有一道道深色的斑纹；胸口和肚子颜色浅
    const coat = (_x: number, y: number, z: number) => (y < by - s.bodyR * 0.45 ? s.belly : cat && Math.sin(z * 62) > 0.35 && y > by ? s.stripe : s.coat);
    const parts = [
      paint(new THREE.SphereGeometry(1, 16, 12).scale(s.bodyR * 0.8, s.bodyR, s.len / 2).translate(0, by, 0), coat),
      paint(new THREE.SphereGeometry(s.bodyR * 0.66, 10, 8).translate(0, by - s.bodyR * 0.2, s.len * 0.3), s.belly),
      paint(new THREE.SphereGeometry(s.bodyR * 0.78, 10, 8).translate(0, by + s.bodyR * 0.02, -s.len * 0.3), s.coat), // 后胯
      paint(new THREE.CylinderGeometry(s.headR * 0.62, s.bodyR * 0.62, s.bodyR * 1.1, 8).rotateX(0.9).translate(0, by + s.bodyR * 0.45, s.len / 2 - s.bodyR * 0.1), s.coat), // 脖子
    ];
    if (!cat) parts.push(paint(new THREE.TorusGeometry(s.headR * 0.62, s.headR * 0.09, 6, 14).rotateX(Math.PI / 2 - 0.9).translate(0, by + s.bodyR * 0.62, s.len / 2 + s.bodyR * 0.1), 0xb3261e)); // 红项圈
    root.add(mesh(merge(parts)));
    // 头单独一个节点：走路时点头，停下来时转过去看
    const head = new THREE.Group();
    head.position.set(0, by + s.bodyR * (cat ? 0.6 : 0.82), s.len / 2 + s.headR * 0.5);
    const snoutLen = cat ? s.headR * 0.45 : s.headR * 1.05, hp: THREE.BufferGeometry[] = [
      paint(new THREE.SphereGeometry(s.headR, 12, 10).scale(1, 0.92, 1), (_x, y, z) => (cat && y > s.headR * 0.3 && Math.sin(z * 90) > 0.4 ? s.stripe : s.coat)),
      paint(new THREE.SphereGeometry(s.headR * 0.55, 10, 8).scale(1, 0.78, snoutLen / (s.headR * 0.55)).translate(0, -s.headR * 0.25, s.headR * 0.7), s.belly),
      paint(new THREE.SphereGeometry(s.headR * 0.15, 6, 5).translate(0, -s.headR * 0.17, s.headR * 0.7 + snoutLen * 0.9), s.nose),
    ];
    for (const k of [-1, 1]) {
      hp.push(paint(new THREE.SphereGeometry(s.headR * 0.13, 6, 5).translate(k * s.headR * 0.42, s.headR * 0.18, s.headR * 0.78), cat ? 0x3a4a1c : 0x1c1814)); // 眼睛
      if (cat) {
        hp.push(paint(new THREE.ConeGeometry(s.headR * 0.4, s.headR * 0.75, 4).translate(k * s.headR * 0.58, s.headR * 0.95, -s.headR * 0.05), s.ear));
        hp.push(paint(new THREE.ConeGeometry(s.headR * 0.22, s.headR * 0.45, 4).translate(k * s.headR * 0.58, s.headR * 0.88, s.headR * 0.03), 0xe8a8a0)); // 耳朵里面
      } else hp.push(paint(new THREE.SphereGeometry(s.headR * 0.45, 8, 6).scale(0.45, 1.25, 0.9).translate(k * s.headR * 0.9, s.headR * 0.25, -s.headR * 0.15), s.ear)); // 耷拉的耳朵
    }
    head.add(mesh(merge(hp)));
    root.add(head);
    // 四条腿：各自绕髋部摆动，爪子颜色浅
    const legGeo = bin.add(merge([
      paint(new THREE.CylinderGeometry(s.bodyR * 0.26, s.bodyR * 0.17, s.legLen, 7).translate(0, -s.legLen / 2, 0), (_x, y) => (y < -s.legLen * 0.72 ? s.belly : s.coat)),
      paint(new THREE.SphereGeometry(s.bodyR * 0.24, 7, 5).scale(1, 0.6, 1.35).translate(0, -s.legLen + s.bodyR * 0.08, s.bodyR * 0.09), s.belly),
    ]));
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const m = new THREE.Mesh(legGeo, mat);
      m.position.set(sx * s.bodyR * 0.42, s.legLen + s.bodyR * 0.1, sz * s.len * 0.3);
      root.add(m);
      return { m, phase: sx * sz > 0 ? 0 : Math.PI }; // 对角的两条腿同步
    });
    // 尾巴：猫的又长又翘、尾尖深色，狗的短而上卷
    const tailLen = cat ? s.len * 0.9 : s.len * 0.5;
    const curve = new THREE.CatmullRomCurve3(cat
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, tailLen * 0.35, -tailLen * 0.3), new THREE.Vector3(0, tailLen * 0.8, -tailLen * 0.35), new THREE.Vector3(0, tailLen, -tailLen * 0.12)]
      : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, tailLen * 0.5, -tailLen * 0.4), new THREE.Vector3(0, tailLen * 0.9, -tailLen * 0.15), new THREE.Vector3(0, tailLen * 0.8, tailLen * 0.2)]);
    const tail = mesh(paint(new THREE.TubeGeometry(curve, 14, s.bodyR * 0.17, 7), (_x, y) => (cat && (y > tailLen * 0.8 || Math.sin(y * 70) > 0.5) ? s.stripe : s.coat)));
    tail.position.set(0, by + s.bodyR * 0.4, -s.len / 2 + s.bodyR * 0.2);
    root.add(tail);
    root.visible = false;
    group.add(root);
    return { root, head, legs, tail, spec: s, state: 'wait' as 'wait' | 'walk' | 'pause', timer: 0, dir: 1, z: -8.2, pauseAt: 0, paused: false, phase: 0, stride: 0,
      mixer: null as THREE.AnimationMixer | null, walk: null as THREE.AnimationAction | null, idle: null as THREE.AnimationAction | null };
  };
  const cat = build({ kind: 'cat', len: 0.42, legLen: 0.16, bodyR: 0.09, headR: 0.075, coat: 0xd98a3a, stripe: 0xa85e20, belly: 0xf3ead8, ear: 0xc9772c, nose: 0xd98a8a, speed: 0.85 });
  const dog = build({ kind: 'dog', len: 0.62, legLen: 0.3, bodyR: 0.14, headR: 0.11, coat: 0xc9a15a, stripe: 0xc9a15a, belly: 0xe6d3a4, ear: 0x8f6a34, nose: 0x1c1a18, speed: 1.25 });
  cat.timer = 3; dog.timer = 14;
  // 调试：?pets=1 把猫狗放到书桌上、面朝镜头一直站着，方便近距离看五官和毛色
  const debugPets = new URLSearchParams(location.search).has('pets');
  // 调试：?owl=1 让猫头鹰一直在窗外近处扇着翅膀（不管白天黑夜），方便看细节
  const debugOwl = new URLSearchParams(location.search).has('owl');
  const baseY = debugPets ? 0 : gy;
  if (debugPets) {
    for (const [a, x] of [[cat, -0.3], [dog, 0.32]] as const) {
      a.state = 'pause'; a.timer = 1e9; a.dir = 0; a.paused = true;
      a.root.position.set(x, 0, 0.42); a.root.rotation.y = 0; a.root.visible = true;
    }
  }

  // ---------- 带骨骼动画的模型 ----------
  // 屋外的东西不吃室内的灯：材质换成以自发光为主的 Lambert，只留一点受光，好让身体有明暗
  let stopped = false, buffalo: THREE.Object3D | null = null;
  const loaded: THREE.Object3D[] = [], mixers: THREE.AnimationMixer[] = [];
  const loader = new GLTFLoader();
  // precise：按蒙皮以后的顶点量高度（猪、羊是 FBX 转的，几何是厘米、骨架里再缩 0.01，只量几何会差一百倍）
  const prepare = (model: THREE.Object3D, recolor: Record<string, number>, height: number, precise = false) => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const swap = (old: THREE.Material) => {
        const c = new THREE.Color(recolor[old.name] ?? (old as THREE.MeshStandardMaterial).color.getHex());
        const mm = bin.add(new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.5), emissive: c.clone().multiplyScalar(0.62), flatShading: true }));
        mm.name = old.name;
        old.dispose();
        return mm;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
      m.frustumCulled = false; // 蒙皮网格的包围盒不跟着骨骼动
      m.userData.noAO = true;
    });
    if (precise) model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, precise);
    model.scale.multiplyScalar(height / (box.max.y - box.min.y));
    return model;
  };
  const blinks: ((dt: number) => void)[] = [];
  /** 毛发花纹：先在静止姿态下量出模型的长、高、宽各是哪根轴，以及脚和头顶的高度 */
  const furUp = (model: THREE.Object3D, kind: 'cat' | 'dog', coat: string[]) => {
    const skinned = model.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh | undefined;
    if (!skinned) return;
    skinned.geometry.computeBoundingBox();
    const size = skinned.geometry.boundingBox!.getSize(new THREE.Vector3());
    const order = (['x', 'y', 'z'] as const).slice().sort((p, q) => size[q] - size[p]); // 最长 = 身长，其次 = 高，最短 = 宽
    model.updateMatrixWorld(true);
    const at = (n: string) => { const b = model.getObjectByName(n); return b ? skinned.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null; };
    const headP = at('Bone003'), footP = at('Bone016');
    if (!headP || !footP) return;
    const U = order[1];
    const mats = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
    for (const mm of mats as THREE.MeshLambertMaterial[]) {
      if (mm.name === 'Pink') continue;
      addFur(mm, { kind, axes: { L: order[0], U, W: order[2] }, foot: footP[U], head: headP[U] + (headP[U] - footP[U]) * 0.15, main: coat.includes(mm.name) });
    }
  };
  const useAnimal = (a: typeof cat, file: string, recolor: Record<string, number>, height: number) => {
    loader.loadAsync(asset(`models/animals/${file}.glb`)).then((gltf) => {
      if (stopped) return;
      const model = prepare(gltf.scene, recolor, height);
      const kind = a.spec.kind;
      furUp(model, kind, kind === 'cat' ? ['Grey'] : ['Dog']);
      blinks.push(addFace(bin, model, kind));
      model.rotation.y = -Math.PI / 2; // 模型的头朝 +x，转到朝 +z（和代码拼的版本一致）
      a.root.children.forEach((c) => { c.visible = false; });
      a.root.add(model);
      a.mixer = new THREE.AnimationMixer(model); mixers.push(a.mixer);
      const clip = (n: string) => gltf.animations.find((c) => c.name.toLowerCase().includes(n));
      const w = clip('walk'), i = clip('idle');
      if (w) { a.walk = a.mixer.clipAction(w); a.walk.play(); a.walk.timeScale = a.spec.kind === 'cat' ? 1.5 : 1.3; }
      if (i) { a.idle = a.mixer.clipAction(i); a.idle.play(); a.idle.setEffectiveWeight(0); }
      loaded.push(model);
    }).catch((e) => console.warn(`[scene] 动物模型 ${file} 加载失败，继续用程序版本`, e));
  };
  useAnimal(cat, 'cat', { Grey: 0xd98a3a, White: 0xf6efe0, Pink: 0xe8a8a0 }, 0.34);   // 灰猫改成橘猫
  useAnimal(dog, 'dog', { Dog: 0xc9a15a }, 0.58);                                       // 改成黄狗
  // 稻田里的水牛：站着，偶尔甩甩尾巴、动动头
  loader.loadAsync(asset('models/animals/cow.glb')).then((gltf) => {
    if (stopped) return;
    const model = prepare(gltf.scene, { White: 0x4a4a54, Black: 0x33333b, Pink: 0x6a5a5e }, 1.45);
    model.position.set(8.5, gy, -30); model.rotation.y = 2.2;
    group.add(model); buffalo = model;
    const mixer = new THREE.AnimationMixer(model); mixers.push(mixer);
    const idle = gltf.animations.find((c) => c.name === 'Idle');
    if (idle) mixer.clipAction(idle).play();
    loaded.push(model);
  }).catch((e) => console.warn('[scene] 水牛模型加载失败', e));
  // 箩筐里原来放着 Kenney Food Kit 的菜（低多边形卡通风格），窗外改写实以后拿掉了，箩筐空着

  // ---------- 鸡：在横路左边那一片踱步、低头啄食 ----------
  const hens = [0xb5522a, 0xe9e2d2, 0x3a2e28].map((coat, i) => {
    const root = new THREE.Group();
    root.add(mesh(merge([
      paint(new THREE.SphereGeometry(1, 12, 9).scale(0.085, 0.09, 0.12).translate(0, 0.2, 0), coat),
      paint(new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(-2.2).translate(0, 0.27, -0.13), coat),                    // 翘起来的尾羽
      paint(new THREE.SphereGeometry(0.05, 8, 6).scale(0.5, 1, 1.5).translate(0.075, 0.2, -0.01), coat),               // 翅膀
      paint(new THREE.SphereGeometry(0.05, 8, 6).scale(0.5, 1, 1.5).translate(-0.075, 0.2, -0.01), coat),
      ...[-1, 1].map((k) => paint(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4).translate(k * 0.035, 0.06, 0.01), 0xd9a02a)),
    ])));
    const head = new THREE.Group(); head.position.set(0, 0.24, 0.09);
    head.add(mesh(merge([
      paint(new THREE.CylinderGeometry(0.022, 0.035, 0.1, 6).translate(0, 0.04, 0.01), coat),
      paint(new THREE.SphereGeometry(0.034, 8, 6).translate(0, 0.1, 0.02), coat),
      paint(new THREE.ConeGeometry(0.012, 0.035, 5).rotateX(Math.PI / 2).translate(0, 0.095, 0.065), 0xe0a020),         // 喙
      paint(new THREE.SphereGeometry(0.02, 6, 5).scale(0.4, 1, 1.3).translate(0, 0.14, 0.02), 0xc8201a),                // 鸡冠
      paint(new THREE.SphereGeometry(0.012, 5, 4).scale(0.5, 1.4, 1).translate(0, 0.07, 0.05), 0xc8201a),               // 肉垂
    ])));
    root.add(head);
    root.position.set(-4.5 + i * 1.3, gy, -8.2 + (i % 2) * 0.35);
    root.rotation.y = i * 2;
    group.add(root);
    return { root, head, tx: root.position.x, tz: root.position.z, state: 'peck' as 'peck' | 'walk', timer: 1 + i, seed: i * 2.1, caught: false, flyT: -1, from: new THREE.Vector3() };
  });
  // 抓鸡（用户要的「也可以把窗外的鸡抓回来做成鸡肉，和蔬菜一起炒」）：站在窗前点一只鸡，它扑腾着飞进屋，
  // 灶台上多一盘鸡肉（kitchen 收 pantry:add）。一共三只，抓完就没了，刷新页面才回来。
  // 每只鸡一个看不见的大一圈点击球（HIT_LAYER，不画）；带 keepsWindow：在窗前点它不会回座位
  const henHit = new THREE.SphereGeometry(0.3, 8, 6), henHitMat = new THREE.MeshBasicMaterial();
  hens.forEach((h) => {
    const hit = new THREE.Mesh(henHit, henHitMat); hit.position.y = 0.18; hit.layers.set(HIT_LAYER); hit.userData.keepsWindow = true;
    h.root.add(hit);
    pick(hit, { click: () => {
      if (h.caught || h.flyT >= 0 || SKY.day <= 0.45) return;
      if (!atWindow) { emit(bus, 'window:focus'); return; }
      h.flyT = 0; h.from.copy(h.root.position);
      emitAt(h.root.getWorldPosition(tmp), voice('cluck'), 1.6);
      emit(bus, 'cup:state', { msg: '抓到一只鸡！' });
    } });
  });
  bin.add(henHit); bin.add(henHitMat);

  // ---------- 蝴蝶：两片翅膀扇动，在菜地上绕来绕去 ----------
  const wing = (side: number, hex: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.02, side * 0.06, 0, 0.05, side * 0.05, 0, -0.01, 0, 0, 0.02, side * 0.05, 0, -0.01, side * 0.035, 0, -0.05, 0, 0, 0.02, side * 0.035, 0, -0.05, 0, 0, -0.02], 3));
    g.computeVertexNormals();
    return paint(g, hex);
  };
  const butterflies = [0xfdfbf0, 0xf2d24a, 0xfdfbf0].slice(0, tier === 'high' ? 3 : 2).map((hex, i) => {
    const root = new THREE.Group(), l = mesh(wing(-1, hex)), r = mesh(wing(1, hex));
    root.add(l, r); group.add(root);
    return { root, l, r, seed: i * 2.7, cx: [-3.2, 3.8, -1.8][i], cz: [-5.6, -10.4, -10.8][i] };
  });

  // ---------- 鸟群：隔一阵从远处的天上飞过 ----------
  const birdWing = (side: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, side * 0.55, 0.02, -0.06, 0, 0, -0.14], 3));
    g.computeVertexNormals();
    return bin.add(paint(g, 0x2a2c32));
  };
  const wl = birdWing(-1), wr = birdWing(1);
  const flock = Array.from({ length: 6 }, (_, i) => {
    const root = new THREE.Group(), l = new THREE.Mesh(wl, mat), r = new THREE.Mesh(wr, mat);
    root.add(l, r); root.visible = false; group.add(root);
    return { root, l, r, ox: -(i % 3) * 2.2 - (i > 2 ? 1.1 : 0), oy: (i % 2) * 0.9 - (i > 2 ? 1.4 : 0), oz: (i - 2.5) * 1.6, phase: i * 1.3 };
  });
  const flight = { active: false, wait: 8, x: 0, dir: 1, y: 14, z: -70 };

  // ---------- 夜里：猫头鹰 ----------
  // 用户嫌过原来那只「有点简陋」（几个球和锥 + 两片三角翅膀）。现在照着灰林鸮做：
  // - 一张 512 的羽毛图集（canvas 现画）：背上的斑驳褐色羽毛和胸前的纵纹、面盘（放射状细纹 + 深色外圈 + 浅色眉）、
  //   翅膀（上半截覆羽的浅斑、下半截飞羽的横斑、后缘一排扇贝形羽尖）、一根根带横斑的初级飞羽、尾羽。镂空的羽尖用 alphaTest。
  // - 翅膀分两节：内翼（臂）在肩上转、外翼（手）在腕上转，手尖再张开五根「手指」似的初级飞羽；扇的时候外翼比内翼慢半拍，
  //   下扇时飞羽张开、上扇时收拢；滑翔时两翼微微上翘。尾巴是五根扇开的尾羽，脚爪收在尾下。
  // - 头单独一个 group，飞过的时候扭过来看着屋里（猫头鹰的头能转很大角度）；眼睛是亮黄的虹膜 + 黑瞳孔 + 一点高光。
  // 不乘夜色（夜里一切都压得很暗，它要在月光天空前看得出来），亮度在 frame 里按天色自己调；顶点色是「上亮下暗」的月光明暗。
  const OWL_TEX = bin.add(canvasTex(512, 512, (g) => {
    const rnd = (() => { let s2 = 7; return () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; }; })();
    // A 身体羽毛 (0,0)-(256,256)：上半截深褐斑驳，下半截（胸腹）浅黄褐带深色纵纹
    const bg = g.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, '#5a4330'); bg.addColorStop(0.55, '#7a5c40'); bg.addColorStop(1, '#bfa27a');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
    // 一片片小羽毛：上半截按行错开排的小鳞片（深色羽芯 + 浅色羽缘），再撒细斑
    for (let y = 4; y < 150; y += 7) for (let x = (y % 14 ? 0 : 4); x < 256; x += 8) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '52,36,24' : '72,52,34'},.85)`; g.beginPath(); g.ellipse(x, y, 4.2, 3.4, 0, 0, Math.PI); g.fill();
      if (rnd() < 0.35) { g.fillStyle = 'rgba(214,188,150,.75)'; g.beginPath(); g.arc(x + 1, y + 1.5, 1.2, 0, 7); g.fill(); }
    }
    for (let i = 0; i < 140; i++) { const x = rnd() * 256, y = 130 + rnd() * 120; g.strokeStyle = 'rgba(70,46,28,.55)'; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + 6 + rnd() * 7); g.stroke(); }
    // B 面盘 (256,0)-(512,256)：一个圆，外面透明
    const cx = 384, cy = 128;
    const fd = g.createRadialGradient(cx, cy, 8, cx, cy, 124); fd.addColorStop(0, '#d9c29c'); fd.addColorStop(0.75, '#b89a72'); fd.addColorStop(0.9, '#5a4028'); fd.addColorStop(1, '#3a2818');
    g.fillStyle = fd; g.beginPath(); g.arc(cx, cy, 124, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,64,40,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 90; i++) { const an = (i / 90) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(an) * 30, cy + Math.sin(an) * 30); g.lineTo(cx + Math.cos(an) * 112, cy + Math.sin(an) * 112); g.stroke(); }
    g.strokeStyle = '#efe4cf'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 70, cy - 52); g.quadraticCurveTo(cx - 20, cy - 70, cx, cy - 20); g.quadraticCurveTo(cx + 20, cy - 70, cx + 70, cy - 52); g.stroke(); // 浅色「眉」
    g.fillStyle = 'rgba(60,40,25,.55)'; for (const k of [-1, 1]) { g.beginPath(); g.arc(cx + k * 48, cy - 6, 34, 0, 7); g.fill(); } // 眼周一圈深色
    // C 翅膀 (0,256)-(256,384)：上半截覆羽（浅斑），下半截飞羽（横斑），后缘扇贝形羽尖（镂空）
    g.fillStyle = '#5e4632'; g.fillRect(0, 256, 256, 100);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(215,190,150,${0.35 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * 256, 258 + rnd() * 45, 1.5 + rnd() * 2.5, 0, 7); g.fill(); }
    for (let x = 0; x < 256; x += 21) { g.strokeStyle = 'rgba(30,20,12,.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, 300); g.lineTo(x + 4, 356); g.stroke(); }
    for (let y = 308; y < 356; y += 11) { g.fillStyle = 'rgba(190,160,120,.55)'; g.fillRect(0, y, 256, 4); }
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(0, 356, 256, 28);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#5e4632'; for (let x = 0; x < 256; x += 21) { g.beginPath(); g.ellipse(x + 10.5, 356, 10, 14, 0, 0, Math.PI); g.fill(); g.fillStyle = 'rgba(190,160,120,.5)'; g.fillRect(x + 2, 360, 17, 3); g.fillStyle = '#5e4632'; }
    // D 一根初级飞羽 (256,256)-(384,384)：竖着画，尖朝上，横斑，外面透明
    const feather = (x0: number, w: number, base: string, bar: string) => {
      g.save(); g.beginPath(); g.moveTo(x0 + 64, 262); g.quadraticCurveTo(x0 + 64 + w, 300, x0 + 64 + w * 0.8, 382); g.lineTo(x0 + 64 - w * 0.8, 382); g.quadraticCurveTo(x0 + 64 - w, 300, x0 + 64, 262); g.closePath(); g.clip();
      g.fillStyle = base; g.fillRect(x0, 256, 128, 128);
      for (let y = 270; y < 384; y += 13) { g.fillStyle = bar; g.fillRect(x0, y, 128, 5); }
      g.strokeStyle = 'rgba(240,225,200,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 64, 264); g.lineTo(x0 + 64, 384); g.stroke(); // 羽轴
      g.restore();
    };
    feather(256, 30, '#5a4230', 'rgba(200,170,130,.55)');
    feather(384, 44, '#6a4e36', 'rgba(205,178,140,.5)'); // E 尾羽 (384,256)-(512,384)
  }));
  OWL_TEX.colorSpace = THREE.SRGBColorSpace;
  /** 把几何体原来 0–1 的 uv 挪到图集里的一块（canvas 像素坐标，y 向下） */
  const atlas = (geo: THREE.BufferGeometry, x: number, y: number, w: number, h: number, flipV = false) => {
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const vv = flipV ? 1 - uv.getY(i) : uv.getY(i); uv.setXY(i, (x + uv.getX(i) * w) / 512, 1 - (y + h - vv * h) / 512); } return geo;
  };
  /** 月光的明暗写进顶点色：朝上的面亮、朝下的暗（保留 uv） */
  const moonShade = (geo: THREE.BufferGeometry, k = 1) => {
    const n = geo.attributes.normal, a = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { const s2 = (0.62 + 0.38 * (n.getY(i) * 0.5 + 0.5)) * k; a.set([s2, s2, s2], i * 3); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return geo;
  };
  /** 一根羽毛：从原点往 +x 伸出去的长条（宽 w、长 len），uv 指向图集里的那根羽毛（竖着画的，尖朝上 → 这里尖朝 +x） */
  const featherGeo = (len: number, w: number, ax: number) => atlas(new THREE.PlaneGeometry(w, len).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0).rotateX(-Math.PI / 2), ax, 256, 128, 128);
  const owlMat = bin.add(new THREE.MeshBasicMaterial({ map: OWL_TEX, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 }));
  const eyeMat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const owl = new THREE.Group();
  // 身子：前粗后细的蛋形（往 +z 飞），背上深、胸腹浅（uv 的 v 方向就是从背到腹）
  const bodyGeo = new THREE.SphereGeometry(1, 18, 14); { const P = bodyGeo.attributes.position; for (let i = 0; i < P.count; i++) { const z = P.getZ(i); P.setXYZ(i, P.getX(i) * 0.115 * (1 - 0.18 * Math.max(0, -z)), P.getY(i) * 0.1, z * 0.19); } bodyGeo.computeVertexNormals(); }
  owl.add(new THREE.Mesh(bin.add(moonShade(atlas(bodyGeo, 0, 0, 256, 256))), owlMat));
  // 头：一个 group，脖子处转；圆脑袋 + 微凹的面盘 + 眼睛 + 弯钩小嘴 + 两撮耳羽
  const owlHead = new THREE.Group(); owlHead.position.set(0, 0.05, 0.14); owl.add(owlHead);
  owlHead.add(new THREE.Mesh(bin.add(moonShade(atlas(new THREE.SphereGeometry(0.1, 16, 12).scale(1, 0.95, 0.9), 0, 0, 256, 140))), owlMat));
  const disc = new THREE.CircleGeometry(0.088, 24); { const P = disc.attributes.position; for (let i = 0; i < P.count; i++) { const r2 = P.getX(i) ** 2 + P.getY(i) ** 2; P.setZ(i, -r2 * 3.2); } disc.computeVertexNormals(); }
  const discM = new THREE.Mesh(bin.add(moonShade(atlas(disc, 256, 0, 256, 256), 1.15)), owlMat); discM.position.set(0, 0.0, 0.1); owlHead.add(discM); // 面盘在脑袋前面（脑袋前沿在 0.09）
  const eye = (k: number) => [
    paint(new THREE.SphereGeometry(0.02, 12, 10).scale(1, 1, 0.45).translate(k * 0.036, 0.008, 0.099), 0xf0b420),
    paint(new THREE.CircleGeometry(0.011, 12).translate(k * 0.036, 0.008, 0.1083), 0x0a0806),
    paint(new THREE.CircleGeometry(0.0038, 8).translate(k * 0.036 + 0.005, 0.014, 0.1088), 0xffffff),
  ];
  owlHead.add(new THREE.Mesh(bin.add(merge([...eye(-1), ...eye(1), paint(new THREE.ConeGeometry(0.009, 0.028, 6).rotateX(Math.PI * 0.62).translate(0, -0.016, 0.106), 0x6b6058)])), eyeMat));
  for (const k of [-1, 1]) { const tuft = new THREE.Mesh(bin.add(moonShade(featherGeo(0.06, 0.03, 256).rotateZ(Math.PI / 2).rotateY(Math.PI / 2))), owlMat); tuft.position.set(k * 0.055, 0.075, 0.02); tuft.rotation.set(-0.3, 0, -k * 0.35); owlHead.add(tuft); }
  // 尾：五根扇开的尾羽；脚爪收在尾下
  const tail = new THREE.Group(); tail.position.set(0, -0.01, -0.17); owl.add(tail);
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(bin.add(moonShade(featherGeo(0.13, 0.045, 384))), owlMat); f.rotation.set(0, Math.PI / 2 + (i - 2) * 0.17, 0); f.position.y = -Math.abs(i - 2) * 0.003; tail.add(f); }
  owl.add(new THREE.Mesh(bin.add(merge([-1, 1].map((k) => paint(new THREE.ConeGeometry(0.014, 0.05, 6).rotateX(-Math.PI / 2 - 0.3).translate(k * 0.03, -0.075, -0.06), 0xb8a070)))), eyeMat));
  // 翅膀：肩 → 内翼（臂，宽、带覆羽）→ 腕 → 外翼（手）→ 五根张开的初级飞羽
  const owlWing = (side: number) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.08, 0.035, 0.03); owl.add(shoulder);
    // 内翼：x 方向伸 0.25，前缘直、后缘往后拖（弦长 0.24 → 0.2）
    const inner = new THREE.PlaneGeometry(0.25, 0.22, 4, 2).rotateX(-Math.PI / 2).translate(0.125, 0, -0.05);
    { const P = inner.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setXYZ(i, side * x, 0.012 * (1 - Math.abs(z + 0.05) / 0.11), z + (z < -0.05 ? -0.02 * (x / 0.25) : 0)); } inner.computeVertexNormals(); } // 前缘略鼓（翼型）
    shoulder.add(new THREE.Mesh(bin.add(moonShade(atlas(inner, 0, 256, 140, 128, true))), owlMat));
    const wrist = new THREE.Group(); wrist.position.set(side * 0.25, 0, 0.0); shoulder.add(wrist);
    const outer = new THREE.PlaneGeometry(0.16, 0.18, 3, 2).rotateX(-Math.PI / 2).translate(0.08, 0, -0.05);
    { const P = outer.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setXYZ(i, side * x, 0, z * (1 - 0.35 * x / 0.16) + 0.01 * x / 0.16); } outer.computeVertexNormals(); }
    wrist.add(new THREE.Mesh(bin.add(moonShade(atlas(outer, 120, 256, 136, 128, true))), owlMat));
    const prim = new THREE.Group(); prim.position.set(side * 0.15, 0, -0.03); wrist.add(prim);
    const fingers: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(bin.add(moonShade(featherGeo(0.15 - i * 0.012, 0.042, 256))), owlMat); f.scale.x = side; prim.add(f); fingers.push(f); }
    return { shoulder, wrist, fingers, side };
  };
  const owlL = owlWing(-1), owlR = owlWing(1);
  owl.visible = false; group.add(owl);
  owl.traverse((o) => { o.userData.noAO = true; });
  const owlFly = { active: false, wait: new URLSearchParams(location.search).has('owl') ? 0 : 6, x: 0, dir: 1, y: 7, z: -30, hooted: false };

  // ---------- 夜里：菜园横路上的老鼠 ----------
  // 窗根底下那块地从屋里看不到（窗台挡着，坐在桌前往外看，最近也只看到五六米开外），所以老鼠在白天猫狗走的那条横路上跑
  // 老鼠：灰褐色的小身子、粉耳朵、细长尾巴，四条腿是快速倒腾的短条
  const mouseMat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const mouse = new THREE.Group();
  mouse.add(new THREE.Mesh(bin.add(merge([
    paint(new THREE.SphereGeometry(1, 10, 8).scale(0.032, 0.028, 0.06).translate(0, 0.03, 0), 0x6e6258),
    paint(new THREE.ConeGeometry(0.022, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.03, 0.075), 0x6e6258),   // 尖嘴
    ...[-1, 1].map((k) => paint(new THREE.CircleGeometry(0.014, 8).translate(k * 0.016, 0.058, 0.045), 0xd8a0a0)), // 耳朵
    paint(new THREE.SphereGeometry(0.005, 5, 4).translate(0, 0.032, 0.1), 0x201818),                           // 鼻尖
    paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.025, -0.055), new THREE.Vector3(0.01, 0.012, -0.1), new THREE.Vector3(-0.012, 0.006, -0.15), new THREE.Vector3(0.006, 0.004, -0.2)]), 8, 0.003, 4), 0xb89890),
  ])), mouseMat));
  const mouseLegs = [-1, 1].flatMap((k) => [0.03, -0.03].map((z) => { const m = new THREE.Mesh(bin.add(paint(new THREE.BoxGeometry(0.008, 0.02, 0.012).translate(0, -0.01, 0), 0x5a4e46)), mouseMat); m.position.set(k * 0.02, 0.018, z); mouse.add(m); return m; }));
  mouse.visible = false; group.add(mouse);
  mouse.scale.setScalar(2.2); // 七八米外看，真实大小只有几个像素
  const mouseRun = { active: false, wait: 5, x: 0, dir: 1, z: -8, stopT: 0, nextStop: 0, phase: 0 };

  // 屋外的东西不参与环境光遮蔽
  group.traverse((o) => { o.userData.noAO = true; });
  // 一天里的色调（夜里压暗）：猫头鹰、老鼠自己管颜色，不乘
  const tintTree = (root: THREE.Object3D) => root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m) && m !== owlMat && m !== eyeMat && m !== mouseMat) applyDayTint(m); });
  tintTree(group);
  let tintedModels = 0;
  scene.add(group);

  const EDGE = 9.6;

  // ---- 叫声：在窗前是原音量，在屋里也听得到、只有两成（用户要的「在屋里也能听到室外的声音，不过比较小，大约 20%」）----
  // AudioContext 要在用户手势里拿：第一次在页面上按下鼠标 / 手指 / 按键时拿（window:focus 本身也是点击触发的）
  let actx: AudioContext | null = null, out: GainNode | null = null, atWindow = false;
  const OUT_GAIN = 0.55, INDOOR = 0.2;
  const ensureAudio = () => {
    if (actx?.state === 'running') return;
    try { actx = audio(); } catch { actx = null; }
    if (actx && !out) {
      out = actx.createGain(); out.gain.value = OUT_GAIN * (atWindow ? 1 : INDOOR); out.connect(actx.destination);
      resetTimers(); // 第一次拿到声音时错开各种叫声，别一起响
    }
    if (actx) loadSprite(actx);
  };
  const gestures = ['pointerdown', 'keydown'] as const;
  gestures.forEach((g) => addEventListener(g, ensureAudio, { passive: true }));
  // 标签页藏起来时场景不再逐帧更新，循环的蛐蛐声也要停
  const onHide = () => { if (out && actx) out.gain.setTargetAtTime(document.hidden ? 0 : OUT_GAIN * (atWindow ? 1 : INDOOR), actx.currentTime, 0.1); };
  document.addEventListener('visibilitychange', onHide);
  const timers = { hen: 0, rooster: 0, dog: 0, cat: 0, owl: 0, squeak: 0 };
  let crickets: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  function resetTimers() {
    timers.hen = 1 + Math.random() * 2; timers.rooster = 3 + Math.random() * 4; timers.dog = 1.5 + Math.random() * 3; timers.cat = 2 + Math.random() * 4;
    timers.owl = 2 + Math.random() * 4; timers.squeak = 1;
  }
  const offs = [
    on(bus, 'window:focus', () => {
      atWindow = true;
      ensureAudio();
      resetTimers();
    }),
    on(bus, 'window:blur', () => { atWindow = false; }),
  ];
  // 录音（tools/build_animal_sounds.py 拼的声音精灵：一个 mp3 + 每段的起止），第一次走到窗前才下载；到之前、失败时用合成的
  type Kind = 'crow' | 'cluck' | 'bark' | 'meow' | 'owl' | 'squeak' | 'cricket' | 'moo' | 'baa' | 'oink' | 'squeal';
  let sprite: { buf: AudioBuffer; clips: Record<Kind, [number, number][]> } | null = null, spriteLoading = false;
  const loadSprite = (ctx: AudioContext) => {
    if (spriteLoading) return; spriteLoading = true;
    Promise.all([
      fetch(asset('sounds/animals.json')).then((r) => r.json() as Promise<Record<Kind, [number, number][]>>),
      fetch(asset('sounds/animals.mp3')).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)),
    ]).then(([clips, buf]) => { if (!stopped) sprite = { buf, clips }; }).catch(() => {});
  };
  // 猫头鹰、老鼠、蛐蛐只有录音：录音没到就不出声
  const none = () => {};
  const SYNTH: Record<Kind, (ctx: AudioContext, dest: AudioNode, t0: number) => void> = { crow, cluck, bark, meow, owl: none, squeak: none, cricket: none, moo, baa, oink: (a, b, t) => oink(a, b, t), squeal };
  /** 播一声：有录音就随机挑一段（音高随机差一点，听着不像同一段），狗叫连着来一到三下 */
  const voice = (kind: Kind) => (ctx: AudioContext, dest: AudioNode, t0: number) => {
    const list = sprite?.clips[kind];
    if (!sprite || !list) { SYNTH[kind](ctx, dest, t0); return; } // 没有录音的（或录音还没到）用合成的
    const n = kind === 'bark' || kind === 'squeak' ? 1 + Math.floor(Math.random() * 3) : kind === 'oink' ? 2 + Math.floor(Math.random() * 2) : 1; // 猪哼哼也连着两三声
    let t = t0;
    for (let i = 0; i < n; i++) {
      const [off, dur] = list[Math.floor(Math.random() * list.length)];
      const src = ctx.createBufferSource(); src.buffer = sprite.buf; src.playbackRate.value = 0.94 + Math.random() * 0.12;
      src.connect(dest); src.start(t, off, dur); src.onended = () => src.disconnect();
      t += dur / src.playbackRate.value + 0.08 + Math.random() * 0.12;
    }
  };
  /** 在世界坐标 p 处出一声：按离镜头的距离衰减，按左右做声像 */
  const emitAt = (p: THREE.Vector3, play: (ctx: AudioContext, dest: AudioNode, t0: number) => void, loud = 1) => {
    if (!actx || !out || actx.state !== 'running') return;
    const d = p.distanceTo(camera.position);
    const g = actx.createGain(); g.gain.value = loud * Math.min(1, 5 / Math.max(d, 1));
    const pan = actx.createStereoPanner();
    const rel = p.clone().applyMatrix4(camera.matrixWorldInverse); pan.pan.value = THREE.MathUtils.clamp(rel.x / Math.max(-rel.z, 1) * 0.8, -0.9, 0.9);
    g.connect(pan).connect(out);
    play(actx, g, actx.currentTime + 0.02);
    setTimeout(() => { g.disconnect(); pan.disconnect(); }, 6000);
  };
  const tmp = new THREE.Vector3();
  // 猪圈、羊圈、牛棚里的牲口（livestock.ts）：借这里的叫声通道
  const livestock = createLivestock({ group, loader, camera, bus, pick, prepare, loaded, stopped: () => stopped, atWindow: () => atWindow,
    voice: (kind, p, loud) => { ensureAudio(); emitAt(p, voice(kind), loud); } });
  /** 蛐蛐：白天在窗前时一层循环的底噪，跟着天色淡入淡出（夜里只有猫头鹰和老鼠） */
  const cricketBed = (dt: number) => {
    const want = actx && sprite?.clips.cricket && !document.hidden ? 0.13 * SKY.day : 0;
    if (!crickets && want > 0.005 && actx && out && sprite) {
      const [off, dur] = sprite.clips.cricket[0];
      const src = actx.createBufferSource(); src.buffer = sprite.buf; src.loop = true; src.loopStart = off + 0.05; src.loopEnd = off + dur - 0.05;
      const gain = actx.createGain(); gain.gain.value = 0;
      src.connect(gain).connect(out); src.start(actx.currentTime + 0.02, off + Math.random() * (dur - 1));
      crickets = { src, gain };
    }
    if (crickets) {
      const g = crickets.gain.gain; g.value += (want - g.value) * Math.min(1, dt * 1.5);
      if (want === 0 && g.value < 0.003) { crickets.src.stop(); crickets.src.disconnect(); crickets.gain.disconnect(); crickets = null; }
    }
  };
  const sounds = (dt: number) => {
    cricketBed(dt);
    if (!actx || document.hidden) return;
    // 总音量：窗前 1，屋里两成，平滑过渡
    if (out) { const g = OUT_GAIN * (atWindow ? 1 : INDOOR); out.gain.value += (g - out.gain.value) * Math.min(1, dt * 3); }
    const dayOut = SKY.day > 0.45;
    timers.owl -= dt; timers.squeak -= dt;
    if (!dayOut) {
      // 远处树上的猫头鹰：左右两边随机，隔十几二十秒一声
      if (timers.owl <= 0) { timers.owl = 14 + Math.random() * 18; emitAt(tmp.set((Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8), gy + 6, -24 - Math.random() * 10), voice('owl'), 1.3); }
      if (mouseRun.active && timers.squeak <= 0) { timers.squeak = 1.5 + Math.random() * 3; emitAt(mouse.getWorldPosition(tmp), voice('squeak'), 0.55); }
      return;
    }
    timers.hen -= dt; timers.rooster -= dt; timers.dog -= dt; timers.cat -= dt;
    if (timers.hen <= 0) { timers.hen = 4 + Math.random() * 7; const free = hens.filter((x) => !x.caught); const h = free[Math.floor(Math.random() * free.length)]; if (h) emitAt(h.root.getWorldPosition(tmp), voice('cluck'), 0.8); }
    // 公鸡不在画面里：是远处哪户人家的，声音从左后方远远传来
    if (timers.rooster <= 0) { timers.rooster = 25 + Math.random() * 30; emitAt(tmp.set(-14, gy + 1, -26), voice('crow'), 1.6); }
    for (const [a, key] of [[dog, 'dog'], [cat, 'cat']] as const) {
      const seen = a.root.visible && a.state !== 'wait' && Math.abs(a.root.position.x) < EDGE - 1;
      if (!seen) continue;
      timers[key] -= a.state === 'pause' ? dt * 2 : 0; // 停下来朝屋里看的时候叫得勤一点
      if (timers[key] <= 0) {
        timers[key] = key === 'dog' ? 4 + Math.random() * 7 : 5 + Math.random() * 8;
        emitAt(a.root.getWorldPosition(tmp).setY(gy + 0.4), voice(key === 'dog' ? 'bark' : 'meow'), key === 'dog' ? 1 : 0.75);
      }
    }
  };

  /** 夜里的猫头鹰和老鼠 */
  const nightLife = (dt: number, t: number, night: boolean) => {
    // 猫头鹰：从月亮那边的天上横着飞过，扇几下、滑一段
    if (!owlFly.active) {
      owlFly.wait -= dt;
      if (owlFly.wait <= 0 && (night || debugOwl)) {
        owlFly.active = true; owlFly.dir = Math.random() < 0.5 ? 1 : -1; owlFly.x = -owlFly.dir * 32; owlFly.hooted = false;
        owlFly.y = 5 + Math.random() * 3; owlFly.z = -22 - Math.random() * 8; owl.visible = true;
        // 斜着朝屋子这边飞、身子往下压一点：从窗里看得到张开的翅膀和圆脸，正侧面飞只看得到一条
        owl.rotation.set(0.12, owlFly.dir * (Math.PI / 2 - 0.55), 0, 'YXZ');
      } else if (owlFly.wait <= 0) owlFly.wait = 4;
    } else {
      owlFly.x += owlFly.dir * 5.5 * dt;
      const cyc = (t * 0.55) % 1, flapping = cyc < 0.55;   // 扇一阵、滑一阵
      // 扇翅：内翼在肩上上下摆，外翼比内翼慢半拍、上扇时往里收一点；下扇时手尖的飞羽张开、上扇时收拢；滑翔时两翼平伸微翘
      const ph = t * 8.5, amp = flapping ? 1 : 0;
      const a1 = 0.1 + amp * 0.62 * Math.sin(ph), a2 = 0.06 + amp * (0.45 * Math.sin(ph - 0.7) - 0.12), spread = 0.16 + amp * 0.1 * (1 - Math.sin(ph)) * 0.5;
      for (const w of [owlL, owlR]) {
        w.shoulder.rotation.z = w.side * a1; w.wrist.rotation.z = w.side * a2; w.wrist.rotation.y = -w.side * amp * 0.12 * Math.max(0, Math.cos(ph));
        w.fingers.forEach((f, i) => { f.rotation.y = -w.side * (i - 1.5) * spread; f.rotation.z = w.side * i * 0.03; });
      }
      owl.position.set(owlFly.x, owlFly.y + Math.sin(t * 1.3) * 0.5 - (flapping ? 0.05 * Math.sin(ph) : (cyc - 0.55) * 0.6), owlFly.z);
      owl.scale.setScalar(2.6); // 远处看着太小，放大一点（实际翼展一米出头）
      if (debugOwl) { owlFly.x = 0; owl.position.set(Math.sin(t * 0.4) * 0.5, 1.35, -5.2); owl.scale.setScalar(1.8); }
      // 头扭过来看着屋里：镜头方向换到身子的坐标里，取左右、上下的角度（转头最多 100°）
      owl.updateMatrixWorld(); tmp.copy(camera.position); owl.worldToLocal(tmp); tmp.sub(owlHead.position);
      owlHead.rotation.set(THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.6, 0.6) * 0.8, THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.75, 1.75), 0, 'YXZ');
      if (!owlFly.hooted && Math.abs(owlFly.x) < 6 ) { owlFly.hooted = true; emitAt(owl.position, voice('owl'), 1.2); }
      if (Math.abs(owlFly.x) > 34) { owlFly.active = false; owl.visible = false; owlFly.wait = 22 + Math.random() * 25; }
    }
    // 老鼠：沿窗根从一头窜到另一头，跑一段停一下、左右张望
    if (!mouseRun.active) {
      mouseRun.wait -= dt;
      if (mouseRun.wait <= 0 && night) {
        mouseRun.active = true; mouseRun.dir = Math.random() < 0.5 ? 1 : -1; mouseRun.x = -mouseRun.dir * 3.2;
        mouseRun.z = -7.95 - Math.random() * 0.35; // 白天猫狗走的那条横路 mouseRun.stopT = 0; mouseRun.nextStop = 0.6 + Math.random() * 0.8;
        mouse.visible = true; mouse.rotation.y = mouseRun.dir * Math.PI / 2; timers.squeak = 0.4;
      } else if (mouseRun.wait <= 0) mouseRun.wait = 4;
    } else {
      if (mouseRun.stopT > 0) {
        mouseRun.stopT -= dt;
        mouse.rotation.y = mouseRun.dir * Math.PI / 2 + Math.sin(t * 9) * 0.35; // 停下来东张西望
      } else {
        mouseRun.x += mouseRun.dir * 2.0 * dt; mouseRun.phase += dt * 40;
        mouse.rotation.y = mouseRun.dir * Math.PI / 2;
        mouseRun.nextStop -= dt;
        if (mouseRun.nextStop <= 0) { mouseRun.stopT = 0.4 + Math.random() * 0.9; mouseRun.nextStop = 0.5 + Math.random() * 1.0; }
      }
      mouse.position.set(mouseRun.x, gy + Math.abs(Math.sin(mouseRun.phase)) * 0.006, mouseRun.z);
      mouseLegs.forEach((m, i) => { m.rotation.x = mouseRun.stopT > 0 ? 0 : Math.sin(mouseRun.phase + i * 1.6) * 0.9; });
      // 月光下：比周围的菜地稍亮一点（灰褐色的毛被月光照着），看得出一个小东西在动
      mouseMat.color.setScalar(SKY.day > 0.5 ? 1 : 0.42);
      if (Math.abs(mouseRun.x) > 3.3) { mouseRun.active = false; mouse.visible = false; mouseRun.wait = 14 + Math.random() * 18; }
    }
    // 猫头鹰在月光下是剪影：颜色按天色压，但不像其他东西压得那么狠，眼睛还看得出
    owlMat.color.setScalar(0.45 + 0.55 * SKY.day); eyeMat.color.setScalar(0.85 + 0.15 * SKY.day); // 眼睛在月光下也亮（眼底反光）
  };

  return {
    frame(dt, t) {
      sounds(dt);
      if (loaded.length !== tintedModels) { tintedModels = loaded.length; tintTree(group); }
      const dayOut = SKY.day > 0.45 || debugPets, night = !dayOut;
      for (const h of hens) h.root.visible = dayOut && !h.caught;
      for (const b of butterflies) b.root.visible = SKY.day > 0.6;
      if (buffalo) buffalo.visible = dayOut;
      nightLife(dt, t, night);
      for (const m of mixers) m.update(dt);
      livestock.frame(dt, t);
      for (const b of blinks) b(dt);
      for (const a of [cat, dog]) {
        const isCat = a.spec.kind === 'cat';
        if (a.state === 'wait') {
          a.timer -= dt;
          if (a.timer > 0 || night) continue; // 天黑了猫狗不出来
          a.state = 'walk'; a.dir = Math.random() < 0.5 ? 1 : -1; a.paused = false;
          // 猫有时贴着窗根走；其余时候都走菜园中间的横路
          a.z = isCat && Math.random() < 0.3 ? -2.5 : -8.2 + (Math.random() - 0.5) * 0.3;
          a.pauseAt = (Math.random() - 0.5) * 5;
          a.root.position.set(-a.dir * EDGE, gy, a.z);
          a.root.rotation.y = a.dir * Math.PI / 2;
          a.root.visible = true;
        }
        const moving = a.state === 'walk';
        a.stride += ((moving ? 1 : 0) - a.stride) * Math.min(1, dt * 6);
        if (moving) {
          a.root.position.x += a.dir * a.spec.speed * dt;
          a.phase += dt * a.spec.speed * (isCat ? 16 : 11);
          if (!a.paused && (a.root.position.x - a.pauseAt) * a.dir > 0) { a.paused = true; a.state = 'pause'; a.timer = 2.5 + Math.random() * 2.5; }
          if (Math.abs(a.root.position.x) > EDGE) { a.state = 'wait'; a.root.visible = false; a.timer = 9 + Math.random() * 14; }
        } else if (a.state === 'pause') {
          a.timer -= dt;
          if (a.timer <= 0) a.state = 'walk';
        }
        // 停下来时把头转向屋子这边；走路时头随步子轻轻点
        const look = a.state === 'pause' ? -a.dir * 1.0 : 0;
        a.head.rotation.y += (look - a.head.rotation.y) * Math.min(1, dt * 3);
        a.head.rotation.x = Math.sin(a.phase * 2) * 0.05 * a.stride + (a.state === 'pause' ? -0.1 : 0);
        for (const l of a.legs) l.m.rotation.x = Math.sin(a.phase + l.phase) * 0.55 * a.stride;
        a.root.position.y = baseY + (a.mixer ? 0 : Math.abs(Math.sin(a.phase)) * 0.008 * a.stride);
        if (a.mixer) {
          // 走和站两套动作按步幅混合；停下来时身子朝屋里侧过来一点
          a.walk?.setEffectiveWeight(a.stride); a.idle?.setEffectiveWeight(1 - a.stride);
          const want = a.state === 'pause' ? a.dir * 0.75 : a.dir * Math.PI / 2;
          a.root.rotation.y += (want - a.root.rotation.y) * Math.min(1, dt * 3);
        }
        a.tail.rotation.z = Math.sin(t * (isCat ? 2.2 : 7) + a.spec.len * 9) * (isCat ? 0.25 : 0.45);
        a.tail.rotation.x = isCat ? Math.sin(t * 1.3) * 0.12 : 0;
      }

      for (const h of hens) {
        // 被抓的鸡：扑腾着往窗口飞（一路打转、越来越小），到了窗口就进屋了
        if (h.flyT >= 0) {
          h.flyT = Math.min(1, h.flyT + dt / 1.4);
          const k = h.flyT, to = tmp.set(0.3, 0.2, L.wallZ - 0.35);
          h.root.position.lerpVectors(h.from, to, k); h.root.position.y += Math.sin(k * Math.PI) * 1.2;
          h.root.rotation.y += dt * 9; h.root.scale.setScalar(1 - 0.7 * k * k);
          h.head.rotation.x = Math.sin(t * 30) * 0.4;
          if (h.flyT >= 1) {
            h.flyT = -1; h.caught = true; h.root.visible = false;
            emit(bus, 'pantry:add', { item: 'chicken' });
            emit(bus, 'cup:state', { msg: hens.every((x) => x.caught) ? '三只鸡都抓回来了 · 去灶台（底部「做饭」）用鸡肉炒菜' : '抓回来了 · 灶台上多了一盘鸡肉（底部「做饭」）' });
            setTimeout(() => emit(bus, 'cup:state', null), 3200);
          }
          continue;
        }
        if (h.caught) continue;
        h.timer -= dt;
        if (h.state === 'peck') {
          // 低头啄两下，抬头看看
          const k = (t * 2.2 + h.seed) % 3;
          h.head.rotation.x = k < 1.2 ? 1.3 * Math.abs(Math.sin(k * Math.PI * 2.5)) : 0;
          if (h.timer <= 0) { h.state = 'walk'; h.timer = 1.5 + Math.random() * 2; h.tx = -5.5 + Math.random() * 4.2; h.tz = -8.55 + Math.random() * 0.75; }
        } else {
          const dx = h.tx - h.root.position.x, dz = h.tz - h.root.position.z, d = Math.hypot(dx, dz);
          if (d > 0.05) {
            h.root.position.x += (dx / d) * 0.3 * dt; h.root.position.z += (dz / d) * 0.3 * dt;
            const want = Math.atan2(dx, dz); let diff = want - h.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            h.root.rotation.y += diff * Math.min(1, dt * 5);
          }
          h.head.rotation.x = 0; h.head.position.z = 0.09 + Math.sin(t * 9 + h.seed) * 0.012; // 走路时一探一探的脖子
          if (h.timer <= 0 || d <= 0.05) { h.state = 'peck'; h.timer = 2 + Math.random() * 3; }
        }
      }

      for (const b of butterflies) {
        const a = t * 0.5 + b.seed;
        b.root.position.set(b.cx + Math.sin(a) * 1.6 + Math.sin(a * 2.7) * 0.3, gy + 0.55 + Math.sin(a * 3.1) * 0.22 + Math.sin(t * 9 + b.seed) * 0.03, b.cz + Math.cos(a * 0.8) * 1.3);
        b.root.rotation.y = Math.atan2(Math.cos(a) * 1.6, -Math.sin(a * 0.8) * 1.04);
        const flap = Math.abs(Math.sin(t * 14 + b.seed)) * 1.2;
        b.l.rotation.z = -flap; b.r.rotation.z = flap;
      }

      if (!flight.active) {
        flight.wait -= dt;
        if (flight.wait <= 0 && night) flight.wait = 5;
        if (flight.wait <= 0) { flight.active = true; flight.dir = Math.random() < 0.5 ? 1 : -1; flight.x = -flight.dir * 75; flight.y = 12 + Math.random() * 8; flight.z = -60 - Math.random() * 40; flock.forEach((f) => { f.root.visible = true; f.root.rotation.y = flight.dir * Math.PI / 2; }); }
      } else {
        flight.x += flight.dir * 9 * dt;
        for (const f of flock) {
          f.root.position.set(flight.x + flight.dir * f.ox, flight.y + f.oy + Math.sin(t * 1.1 + f.phase) * 0.4, flight.z + f.oz);
          const flap = Math.sin(t * 9 + f.phase) * 0.7;
          f.l.rotation.z = -flap; f.r.rotation.z = flap;
        }
        if (Math.abs(flight.x) > 80) { flight.active = false; flight.wait = 18 + Math.random() * 20; flock.forEach((f) => { f.root.visible = false; }); }
      }
    },
    stop() {
      stopped = true; offs.forEach((f) => f()); out?.disconnect();
      gestures.forEach((g) => removeEventListener(g, ensureAudio)); document.removeEventListener('visibilitychange', onHide);
      if (crickets) { crickets.src.stop(); crickets.src.disconnect(); crickets.gain.disconnect(); }
      mixers.forEach((m) => m.stopAllAction()); livestock.stop();
      for (const m of loaded) m.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh) { x.geometry.dispose(); const mm = x.material as THREE.MeshLambertMaterial; mm.map?.dispose?.(); } });
      scene.remove(group); bin.dispose();
    },
  };
};
