import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '../util';
import { addFace, addFur } from '../animalDetail';
import { Bin, on, type SceneObject } from '../types';
import { bark, cluck, crow, meow } from '../animalSounds';
import { L } from '../layout';

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
 */
export const animals: SceneObject = ({ scene, tier, camera, bus, audio }) => {
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
  const baseY = debugPets ? 0 : gy;
  if (debugPets) {
    for (const [a, x] of [[cat, -0.3], [dog, 0.32]] as const) {
      a.state = 'pause'; a.timer = 1e9; a.dir = 0; a.paused = true;
      a.root.position.set(x, 0, 0.42); a.root.rotation.y = 0; a.root.visible = true;
    }
  }

  // ---------- 带骨骼动画的模型 ----------
  // 屋外的东西不吃室内的灯：材质换成以自发光为主的 Lambert，只留一点受光，好让身体有明暗
  let stopped = false;
  const loaded: THREE.Object3D[] = [], mixers: THREE.AnimationMixer[] = [];
  const loader = new GLTFLoader();
  const prepare = (model: THREE.Object3D, recolor: Record<string, number>, height: number) => {
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
    const box = new THREE.Box3().setFromObject(model);
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
    group.add(model);
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
    return { root, head, tx: root.position.x, tz: root.position.z, state: 'peck' as 'peck' | 'walk', timer: 1 + i, seed: i * 2.1 };
  });

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

  // 屋外的东西不参与环境光遮蔽
  group.traverse((o) => { o.userData.noAO = true; });
  scene.add(group);

  const EDGE = 9.6;

  // ---- 叫声：只在窗前时排。AudioContext 要在用户点击里拿（window:focus 是点击触发的，同步派发）----
  let actx: AudioContext | null = null, out: GainNode | null = null, atWindow = false;
  const timers = { hen: 0, rooster: 0, dog: 0, cat: 0 };
  const offs = [
    on(bus, 'window:focus', () => {
      try { actx = audio(); } catch { actx = null; }
      if (actx && !out) { out = actx.createGain(); out.gain.value = 0.55; out.connect(actx.destination); }
      atWindow = true;
      timers.hen = 1 + Math.random() * 2; timers.rooster = 3 + Math.random() * 4; timers.dog = 1.5 + Math.random() * 3; timers.cat = 2 + Math.random() * 4;
    }),
    on(bus, 'window:blur', () => { atWindow = false; }),
  ];
  /** 在世界坐标 p 处出一声：按离镜头的距离衰减，按左右做声像 */
  const emitAt = (p: THREE.Vector3, play: (ctx: AudioContext, dest: AudioNode, t0: number) => void, loud = 1) => {
    if (!actx || !out || actx.state !== 'running') return;
    const d = p.distanceTo(camera.position);
    const g = actx.createGain(); g.gain.value = loud * Math.min(1, 5 / Math.max(d, 1));
    const pan = actx.createStereoPanner();
    const rel = p.clone().applyMatrix4(camera.matrixWorldInverse); pan.pan.value = THREE.MathUtils.clamp(rel.x / Math.max(-rel.z, 1) * 0.8, -0.9, 0.9);
    g.connect(pan).connect(out);
    play(actx, g, actx.currentTime + 0.02);
    setTimeout(() => { g.disconnect(); pan.disconnect(); }, 3000);
  };
  const tmp = new THREE.Vector3();
  const sounds = (dt: number) => {
    if (!atWindow || !actx) return;
    timers.hen -= dt; timers.rooster -= dt; timers.dog -= dt; timers.cat -= dt;
    if (timers.hen <= 0) { timers.hen = 4 + Math.random() * 7; const h = hens[Math.floor(Math.random() * hens.length)]; emitAt(h.root.getWorldPosition(tmp), cluck, 0.8); }
    // 公鸡不在画面里：是远处哪户人家的，声音从左后方远远传来
    if (timers.rooster <= 0) { timers.rooster = 25 + Math.random() * 30; emitAt(tmp.set(-14, gy + 1, -26), crow, 1.6); }
    for (const [a, key] of [[dog, 'dog'], [cat, 'cat']] as const) {
      const seen = a.root.visible && a.state !== 'wait' && Math.abs(a.root.position.x) < EDGE - 1;
      if (!seen) continue;
      timers[key] -= a.state === 'pause' ? dt * 2 : 0; // 停下来朝屋里看的时候叫得勤一点
      if (timers[key] <= 0) {
        timers[key] = key === 'dog' ? 4 + Math.random() * 7 : 5 + Math.random() * 8;
        emitAt(a.root.getWorldPosition(tmp).setY(gy + 0.4), key === 'dog' ? bark : meow, key === 'dog' ? 1 : 0.75);
      }
    }
  };

  return {
    frame(dt, t) {
      sounds(dt);
      for (const m of mixers) m.update(dt);
      for (const b of blinks) b(dt);
      for (const a of [cat, dog]) {
        const isCat = a.spec.kind === 'cat';
        if (a.state === 'wait') {
          a.timer -= dt;
          if (a.timer > 0) continue;
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
      mixers.forEach((m) => m.stopAllAction());
      for (const m of loaded) m.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh) { x.geometry.dispose(); const mm = x.material as THREE.MeshLambertMaterial; mm.map?.dispose?.(); } });
      scene.remove(group); bin.dispose();
    },
  };
};
