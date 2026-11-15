import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, canvasTex, leafGeo, place, rbox, rng, speckle, type V3 } from '../util';

/**
 * 窗外的乡下：窗前是一个农家菜园（白菜、生菜、小葱、辣椒、茄子、番茄、豆角架、南瓜、玉米、向日葵；竹篱笆、柴门、水井、柿子树），
 * 篱笆外是一块块稻田（田里有农人和水牛、稻草人），散着几户白墙灰瓦的人家、竹林、杨树和草垛，地平线上是三层不高的小山，山脚有晨雾。
 *
 * 这些东西都不受室内灯光影响：用带顶点色的无光照材质，明暗是建模时直接算进颜色里的——
 * 朝上的面亮、朝下的面暗，叶子从叶柄到叶尖有深浅、中脉偏浅，越远越泛白；地上的影子是单独一层半透明的暗色片（清晨的长影子，朝屋子这边拖）。
 * 菜园里所有静态的东西合成一个网格。
 */
export const countryside: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const gy = L.groundY;
  const r = rng(2024);
  const mat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const shadowMat = bin.add(new THREE.MeshBasicMaterial({ color: 0x14200c, transparent: true, opacity: 0.4, depthWrite: false }));
  const batch = new Batch(['position', 'normal', 'uv', 'color']);
  const shadows = new Batch();
  const C = new THREE.Color(), B = new THREE.Color(), HAZE = new THREE.Color(0.78, 0.8, 0.8);
  interface Opt { k?: number; haze?: number; leaf?: boolean; base?: number; rib?: boolean; jitter?: number }
  /** 摆好位置，按朝向、叶片上的位置和远近算出顶点色，放进合并队列 */
  const put = (geo: THREE.BufferGeometry, hex: number, pos?: V3, rot?: V3, scale?: V3 | number, o: Opt = {}) => {
    place(geo, pos, rot, scale);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const n = geo.attributes.normal, uv = geo.attributes.uv, cnt = geo.attributes.position.count, a = new Float32Array(cnt * 3);
    C.set(hex); if (o.base !== undefined) B.set(o.base);
    const k = (o.k ?? 1) * (0.92 + r() * 0.16), hz = o.haze ?? 0;
    for (let i = 0; i < cnt; i++) {
      const ny = n.getY(i);
      let s = k * (o.leaf ? 0.72 + 0.28 * Math.abs(ny) : 0.56 + 0.44 * (ny * 0.5 + 0.5));
      let cr = C.r, cg = C.g, cb = C.b;
      if (uv && o.base !== undefined) { const t = Math.min(1, uv.getY(i) * 2.6); cr = B.r + (cr - B.r) * t; cg = B.g + (cg - B.g) * t; cb = B.b + (cb - B.b) * t; }
      if (uv && o.rib) s *= 1 + Math.max(0, 1 - Math.abs(uv.getX(i) - 0.5) * 5) * 0.5; // 中脉偏浅
      if (o.jitter) s *= 1 + (r() - 0.5) * o.jitter;                                       // 树冠上一簇簇叶子的明暗
      a[i * 3] = cr * s * (1 - hz) + HAZE.r * hz; a[i * 3 + 1] = cg * s * (1 - hz) + HAZE.g * hz; a[i * 3 + 2] = cb * s * (1 - hz) + HAZE.b * hz;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    batch.add(mat, geo);
  };
  /** 地上的一片影子：太阳在正前方偏低，影子朝屋子这边（+z）拖长 */
  const shade = (x: number, z: number, rx: number, len: number, y = gy + 0.012) =>
    shadows.add(shadowMat, new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), [x + len * 0.1, y, z + len * 0.8], [0, 0, 0], [rx, 1, len]);
  const leaf = (len: number, width: number, bend = 0.6, fold = 0.2, segs = 4) => leafGeo({ len, width, bend, fold, segs });
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const skip = () => !high && r() < 0.2; // mid 档少种一些
  const hazeAt = (z: number) => Math.min(0.75, Math.max(0, (-z - 30) / 420));
  /** 一团凹凸不平的树冠 */
  const lump = (rad: number, seed: number, detail = 1) => {
    const g = new THREE.IcosahedronGeometry(rad, detail), p = g.attributes.position, v = new THREE.Vector3(), nrm = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const f = 1 + 0.2 * Math.sin(v.x * 5 + seed) * Math.sin(v.y * 4 + seed * 2) + 0.12 * Math.sin(v.z * 9 + seed * 3) + 0.06 * Math.sin(v.x * 17 + v.y * 13 + seed);
      p.setXYZ(i, v.x * rad * f, v.y * rad * f, v.z * rad * f);
      v.toArray(nrm, i * 3); // 用球面法线：明暗是平滑过渡的，不是一块块的面
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    return g;
  };

  // ---------- 菜园的泥地 ----------
  const soil = bin.add(new THREE.MeshBasicMaterial({ map: bin.add(canvasTex(1024, 768, (g, w, h) => {
    g.fillStyle = '#6b5136'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 301, 16000, '30,18,8', 0.35); speckle(g, w, h, 302, 10000, '190,160,120', 0.25);
    const X = (x: number) => ((x + 9.5) / 19) * w, Z = (z: number) => ((z + 14.5) / 13.2) * h; // 画布上边是远处
    const path = (x0: number, y0: number, pw: number, ph: number) => { g.fillStyle = 'rgba(176,150,112,.85)'; g.fillRect(x0, y0, pw, ph); };
    path(X(-0.05), 0, X(1.05) - X(-0.05), h); path(0, Z(-8.55), w, Z(-7.85) - Z(-8.55)); path(0, Z(-3.0), w, h - Z(-3.0));
    speckle(g, w, h, 303, 7000, '60,40,20', 0.25);
    for (let i = 0; i < 500; i++) { // 路边和墙根的杂草、落叶
      const edge = r() < 0.5, x = edge ? (r() < 0.5 ? r() * 30 : w - r() * 30) : r() * w, y = edge ? r() * h : (r() < 0.5 ? r() * 26 : Z(-8.55) - 8 + r() * 46);
      g.fillStyle = r() < 0.8 ? `rgba(${70 + r() * 40},${120 + r() * 50},50,${0.3 + r() * 0.4})` : `rgba(170,120,50,${0.4 + r() * 0.3})`; g.fillRect(x, y, 3 + r() * 6, 2 + r() * 4);
    }
  })) }));
  const ground = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(19, 13.2).rotateX(-Math.PI / 2)), soil);
  ground.position.set(0, gy, -7.9);
  group.add(ground);

  // ---------- 菜畦 ----------
  type Crop = 'cabbage' | 'lettuce' | 'scallion' | 'chili' | 'eggplant' | 'tomato' | 'bean' | 'pumpkin' | 'corn';
  const bedX = [-6.2, -5.0, -3.8, -2.6, -1.4, 2.0, 3.2, 4.4, 5.6, 6.8];
  const bands: { z0: number; z1: number; crops: Crop[] }[] = [
    { z0: -7.5, z1: -3.3, crops: ['bean', 'tomato', 'chili', 'cabbage', 'scallion', 'scallion', 'cabbage', 'eggplant', 'tomato', 'bean'] },
    { z0: -13.2, z1: -8.9, crops: ['corn', 'lettuce', 'scallion', 'cabbage', 'chili', 'lettuce', 'cabbage', 'pumpkin', 'pumpkin', 'corn'] },
  ];
  const GREEN = [0x4f8a3a, 0x5c9a42, 0x437a33, 0x6aa84a];
  const by = gy + 0.12; // 垄面的高度
  const plant = {
    cabbage(x: number, z: number, s = 1, light = false) {
      const c = light ? [0x86bf5a, 0x9bcc66, 0x78b24f] : [0x4f9240, 0x5fa24a, 0x437f36];
      // 外圈摊开的老叶 + 里圈抱着的嫩叶，叶柄发白
      for (let i = 0; i < 7; i++) put(leaf(0.3 * s, 0.17 * s, 1.0, 0.22, 5), pick(c), [x, by, z], [0.95 + r() * 0.35, (i / 7) * 6.28 + r() * 0.5, 0], 1, { leaf: true, base: 0xdbe8c0, rib: true });
      for (let i = 0; i < 6; i++) put(leaf(0.2 * s, 0.14 * s, light ? 0.3 : -0.5, 0.3, 4), light ? 0xa9d672 : 0x8cc660, [x, by + 0.01, z], [0.25 + r() * 0.3, (i / 6) * 6.28 + r() * 0.5, 0], 1, { leaf: true, base: 0xf0f5dc, rib: true });
      if (!light) put(new THREE.SphereGeometry(0.055 * s, 8, 6), 0xc8e496, [x, by + 0.08, z], [0, 0, 0], [1, 1.25, 1]);
      shade(x, z, 0.2 * s, 0.24 * s, by + 0.004);
    },
    scallion(x: number, z: number) {
      for (let i = 0; i < 6; i++) put(leafGeo({ len: 0.28 + r() * 0.14, width: 0.008, bend: 0.25 + r() * 0.6, fold: 0.6, segs: 3 }), pick([0x3f8f45, 0x4a9a4c]), [x + (r() - 0.5) * 0.03, by, z + (r() - 0.5) * 0.03], [0.1 + r() * 0.35, r() * 6.28, 0], 1, { leaf: true, base: 0xf2f4e6 });
    },
    bush(x: number, z: number, fruit: 'chili' | 'eggplant') {
      const big = fruit === 'eggplant', hgt = big ? 0.55 : 0.42;
      put(new THREE.CylinderGeometry(0.008, 0.013, hgt, 5), 0x5a6b34, [x, by + hgt / 2, z]);
      for (let i = 0; i < 3; i++) { const a = r() * 6.28; put(new THREE.CylinderGeometry(0.004, 0.007, 0.2, 4), 0x5a6b34, [x + Math.sin(a) * 0.06, by + hgt * 0.7, z + Math.cos(a) * 0.06], [0.7, a, 0]); }
      for (let i = 0; i < (big ? 15 : 18); i++) put(leaf(big ? 0.16 : 0.09, big ? 0.085 : 0.036, 0.5, 0.2, 3), pick(big ? [0x3f6f3a, 0x4a7d40, 0x356338] : GREEN), [x + (r() - 0.5) * 0.14, by + 0.1 + r() * (hgt - 0.05), z + (r() - 0.5) * 0.14], [0.7 + r() * 0.7, r() * 6.28, 0], 1, { leaf: true, rib: true });
      for (let i = 0; i < (big ? 3 : 6); i++) {
        const a = r() * 6.28, d = 0.07 + r() * 0.07, y = by + 0.12 + r() * 0.18;
        if (big) { put(new THREE.SphereGeometry(0.032, 7, 6), 0x4b2a66, [x + Math.cos(a) * d, y, z + Math.sin(a) * d], [0.3, a, 0], [1, 2.6, 1]); put(new THREE.ConeGeometry(0.02, 0.03, 5), 0x4a7d40, [x + Math.cos(a) * d, y + 0.08, z + Math.sin(a) * d]); }
        else put(new THREE.ConeGeometry(0.011, 0.075, 5), r() < 0.7 ? 0xc8281e : 0x3f8f3a, [x + Math.cos(a) * d, y, z + Math.sin(a) * d], [Math.PI + (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4]);
      }
      shade(x, z, 0.16, 0.3, by + 0.004);
    },
    tomato(x: number, z: number) {
      put(new THREE.CylinderGeometry(0.01, 0.011, 1.4, 5), 0xb9a36a, [x, by + 0.7, z], [0.03, 0, 0.03]);
      put(new THREE.CylinderGeometry(0.007, 0.01, 1.15, 5), 0x4f7a34, [x + 0.02, by + 0.58, z], [0.02, 0, -0.03]);
      for (let i = 0; i < 20; i++) put(leaf(0.14, 0.055, 0.7, 0.2, 3), pick(GREEN), [x + (r() - 0.5) * 0.1, by + 0.15 + r() * 1.0, z + (r() - 0.5) * 0.1], [0.8 + r() * 0.6, r() * 6.28, 0], 1, { leaf: true, rib: true });
      for (let i = 0; i < 3; i++) { // 一串一串的果
        const a = r() * 6.28, y = by + 0.3 + r() * 0.6, cx = x + Math.cos(a) * 0.09, cz = z + Math.sin(a) * 0.09;
        for (let j = 0; j < 3; j++) put(new THREE.SphereGeometry(0.028, 7, 6), r() < 0.7 ? 0xd9301f : r() < 0.5 ? 0xe88a2a : 0x8fae3a, [cx + (r() - 0.5) * 0.05, y - j * 0.04, cz + (r() - 0.5) * 0.05]);
      }
      shade(x, z, 0.14, 0.9, by + 0.004);
    },
    /** 一小段豆角架：两根竹竿交叉成人字，爬满叶子，垂着长豆角 */
    bean(x: number, z: number) {
      for (const s of [-1, 1]) {
        put(new THREE.CylinderGeometry(0.011, 0.013, 1.95, 5), 0xc2ab6c, [x + s * 0.14, by + 0.93, z], [0, 0, s * 0.3]);
        for (let i = 0; i < 16; i++) { const t = 0.12 + r() * 0.85; put(leaf(0.1, 0.09, 0.4, 0.15, 3), pick(GREEN), [x + s * (0.28 - t * 0.28) + (r() - 0.5) * 0.14, by + t * 1.8, z + (r() - 0.5) * 0.36], [0.9 + r() * 0.8, r() * 6.28, 0], 1, { leaf: true, rib: true }); }
        for (let i = 0; i < 4; i++) put(new THREE.CylinderGeometry(0.006, 0.004, 0.24 + r() * 0.14, 4), 0x6fae4a, [x + s * 0.1 + (r() - 0.5) * 0.12, by + 0.55 + r() * 0.9, z + (r() - 0.5) * 0.25], [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2]);
      }
      shade(x, z, 0.3, 1.2, by + 0.004);
    },
    pumpkin(x: number, z: number) {
      for (let i = 0; i < 7; i++) put(leafGeo({ len: 0.22, width: 0.21, bend: 0.3, fold: 0.1, segs: 3, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.6)) }), pick([0x4a8a3c, 0x3f7a35, 0x5a9a44]), [x + (r() - 0.5) * 0.55, by + r() * 0.1, z + (r() - 0.5) * 0.55], [1.15 + r() * 0.35, r() * 6.28, 0], 1, { leaf: true, rib: true });
      if (r() < 0.65) { // 带棱的南瓜
        const g = new THREE.SphereGeometry(0.16, 16, 8), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 - 0.09 * Math.abs(Math.sin(a * 4)); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
        g.computeVertexNormals();
        const px = x + (r() - 0.5) * 0.3, pz = z + (r() - 0.5) * 0.3;
        put(g, r() < 0.7 ? 0xe08a2a : 0x7fa040, [px, by + 0.1, pz], [0, r() * 3, 0], [1, 0.68, 1]);
        put(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 5), 0x6b7a3a, [px, by + 0.22, pz], [0.3, 0, 0]);
        shade(px, pz, 0.17, 0.22, by + 0.004);
      }
    },
    corn(x: number, z: number) {
      const hgt = 1.6 + r() * 0.4;
      put(new THREE.CylinderGeometry(0.012, 0.02, hgt, 6), 0x6f9a3c, [x, by + hgt / 2, z], [0.03, 0, 0.02]);
      for (let i = 0; i < 9; i++) put(leafGeo({ len: 0.55 + r() * 0.2, width: 0.045, bend: 1.3 + r() * 0.5, fold: 0.35, segs: 6, shape: (t) => (0.5 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.5))) * (1 - Math.pow(t, 4)) }), pick([0x5a9a3a, 0x6aa846, 0x4f8a34]), [x, by + 0.25 + (i / 9) * (hgt - 0.4), z], [0.5 + r() * 0.3, i * 2.4 + r(), 0], 1, { leaf: true, rib: true });
      for (let i = 0; i < 2; i++) { const a = r() * 6.28; put(new THREE.SphereGeometry(0.035, 7, 6), 0xb9c95a, [x + Math.sin(a) * 0.05, by + hgt * (0.45 + i * 0.12), z + Math.cos(a) * 0.05], [0.35, a, 0], [1, 3, 1]); }
      put(new THREE.ConeGeometry(0.05, 0.22, 5), 0xd8c070, [x, by + hgt + 0.1, z]); // 顶上的天花
      shade(x, z, 0.2, 1.3, by + 0.004);
    },
  };
  for (const band of bands) {
    const len = band.z1 - band.z0, zc = (band.z0 + band.z1) / 2;
    bedX.forEach((x, bi) => {
      const crop = band.crops[bi];
      put(rbox(0.86, 0.12, len + 0.15, 0.05, 2), 0x5c4630, [x, gy + 0.06, zc], [0, 0, 0], 1, { k: 1.12 }); // 垄
      const step = crop === 'scallion' ? 0.16 : crop === 'cabbage' || crop === 'lettuce' ? 0.38 : crop === 'bean' ? 0.6 : crop === 'pumpkin' ? 0.7 : crop === 'corn' ? 0.42 : 0.5;
      const rowsX = crop === 'scallion' ? [-0.2, 0, 0.2] : crop === 'cabbage' || crop === 'lettuce' ? [-0.18, 0.18] : crop === 'corn' ? [-0.17, 0.17] : [0];
      for (const dx of rowsX) for (let z = band.z0 + 0.2; z < band.z1 - 0.1; z += step) {
        if (skip()) continue;
        const px = x + dx + (r() - 0.5) * 0.04, pz = z + (r() - 0.5) * 0.05;
        if (crop === 'cabbage') plant.cabbage(px, pz, 0.85 + r() * 0.3);
        else if (crop === 'lettuce') plant.cabbage(px, pz, 0.7 + r() * 0.2, true);
        else if (crop === 'scallion') plant.scallion(px, pz);
        else if (crop === 'chili' || crop === 'eggplant') plant.bush(px, pz, crop);
        else plant[crop](px, pz);
      }
      if (crop === 'bean') put(new THREE.CylinderGeometry(0.011, 0.011, len, 5), 0xc2ab6c, [x, by + 1.72, zc], [Math.PI / 2, 0, 0]); // 架顶的横竿
    });
  }

  // ---------- 竹篱笆（每隔两米一根粗桩）、柴门、后篱笆前的一排向日葵 ----------
  const BAMBOO = [0xb9a468, 0xa8955c, 0xc7b274];
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.2), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, post = i % 10 === 0, hh = post ? 1.15 : 0.92 + r() * 0.14;
      put(new THREE.CylinderGeometry(post ? 0.028 : 0.011, post ? 0.032 : 0.013, hh, post ? 7 : 5), post ? 0x8a744a : pick(BAMBOO), [x0 + (x1 - x0) * t, gy + hh / 2, z0 + (z1 - z0) * t], [(r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08]);
    }
    for (const y of [0.28, 0.74]) for (const off of [-0.014, 0.014]) put(new THREE.CylinderGeometry(0.011, 0.011, len, 5), 0x9c8850, [(x0 + x1) / 2 + Math.cos(ang) * off, gy + y, (z0 + z1) / 2 - Math.sin(ang) * off], [Math.PI / 2, ang, 0]);
    shadows.add(shadowMat, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [(x0 + x1) / 2 + 0.15, gy + 0.011, (z0 + z1) / 2 + 1.2], [0, Math.abs(x1 - x0) > 0.1 ? 0 : 0, 0], [Math.abs(x1 - x0) + 0.3, 1, Math.abs(z1 - z0) + 2.4]);
  };
  fence(-8.6, -13.9, -0.15, -13.9); fence(1.15, -13.9, 8.6, -13.9);
  for (const x of [-8.6, 8.6]) { fence(x, -13.9, x, -8.75); fence(x, -7.65, x, -2.0); }
  // 敞开的柴门：几根横竖的树枝钉成的门扇
  for (let i = 0; i < 6; i++) put(new THREE.CylinderGeometry(0.014, 0.016, 1.0, 5), 0x7a6444, [1.15 + 0.1 + i * 0.16 * 0.5, gy + 0.5, -13.9 - 0.1 - i * 0.16 * 0.86], [0, 0, (r() - 0.5) * 0.1]);
  for (const y of [0.25, 0.8]) put(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), 0x6a5638, [1.45, gy + y, -14.42], [Math.PI / 2, -0.53, 0]);
  for (let x = -7.8; x < 8.2; x += 0.95) {
    if (x > -0.9 && x < 1.9) continue;
    const sx = x + (r() - 0.5) * 0.3, sz = -13.45 + (r() - 0.5) * 0.15, hgt = 1.5 + r() * 0.5, tilt = 0.25 + r() * 0.3, yaw = (r() - 0.5) * 0.8;
    put(new THREE.CylinderGeometry(0.014, 0.022, hgt, 6), 0x5f8a3a, [sx, gy + hgt / 2, sz], [0.04, 0, (r() - 0.5) * 0.06]);
    for (let i = 0; i < 7; i++) put(leafGeo({ len: 0.24, width: 0.17, bend: 0.8, fold: 0.15, segs: 4 }), pick(GREEN), [sx, gy + 0.3 + (i / 7) * (hgt - 0.5), sz], [0.9 + r() * 0.4, i * 2.4, 0], 1, { leaf: true, rib: true });
    // 花盘朝着屋子这边微微低头
    const hy = gy + hgt + 0.02, hz2 = sz + 0.05;
    put(new THREE.RingGeometry(0.1, 0.24, 18, 1), 0xf2c21a, [sx, hy, hz2], [-tilt, yaw, 0], 1, { leaf: true, k: 1.15 });
    put(new THREE.RingGeometry(0.09, 0.2, 18, 1), 0xe8a814, [sx, hy, hz2 + 0.004], [-tilt, yaw + 0.17, 0], 1, { leaf: true, k: 1.1 });
    put(new THREE.CircleGeometry(0.11, 16), 0x5a3a1c, [sx, hy, hz2 + 0.008], [-tilt, yaw, 0], 1, { leaf: true });
    put(new THREE.CircleGeometry(0.13, 12), 0x4f7a34, [sx, hy, hz2 - 0.01], [-tilt, yaw, 0], 1, { leaf: true });
    shade(sx, sz, 0.15, 1.4);
  }

  // ---------- 菜园里的零碎：踏脚石、水缸、水井和木桶、箩筐、靠在篱笆上的锄头 ----------
  for (let z = -3.6; z > -13.5; z -= 0.75) put(new THREE.CylinderGeometry(0.2 + r() * 0.06, 0.22, 0.03, 9), 0x8d8a84, [0.5 + (r() - 0.5) * 0.25, gy + 0.012, z], [0, r() * 3, 0], [1, 1, 0.8 + r() * 0.3]);
  put(new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.33, 0.25], [0.34, 0.45], [0.27, 0.62], [0.3, 0.66], [0.26, 0.66], [0.24, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 20), 0x5a3a26, [3.4, gy, -2.3]);
  put(new THREE.CircleGeometry(0.25, 20).rotateX(-Math.PI / 2), 0x6f8f96, [3.4, gy + 0.6, -2.3]);
  shade(3.4, -2.3, 0.36, 0.5);
  const wx = -3.7, wz = -2.5; // 水井：一圈石头井台 + 井绳架 + 木桶
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; put(rbox(0.26, 0.42, 0.2, 0.04, 2), pick([0x8d8a84, 0x9a968e, 0x7f7c76]), [wx + Math.cos(a) * 0.5, gy + 0.21, wz + Math.sin(a) * 0.5], [0, -a + Math.PI / 2, 0]); }
  put(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), 0x1f2a2c, [wx, gy + 0.2, wz]);
  for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.035, 0.04, 1.3, 6), 0x6a5236, [wx + s * 0.62, gy + 0.65, wz]);
  put(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), 0x7a5e3c, [wx, gy + 1.25, wz], [0, 0, Math.PI / 2]);
  put(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4), 0xcbb98a, [wx, gy + 0.9, wz]);
  put(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 12, 1, true), 0x8a6a44, [wx + 0.85, gy + 0.12, wz + 0.3]);
  shade(wx, wz, 0.7, 1.1);
  const bx = 1.5, bz = -6.2; // 箩筐（里面的菜是模型，在 animals.ts 里加载）
  put(new THREE.CylinderGeometry(0.2, 0.15, 0.22, 14, 1, true), 0xb89858, [bx, gy + 0.11, bz]);
  shade(bx, bz, 0.22, 0.3);
  put(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5), 0x8a6a44, [8.45, gy + 0.72, -5.2], [0, 0, 0.18]);
  put(new THREE.BoxGeometry(0.16, 0.02, 0.1), 0x4a4c50, [8.34, gy + 0.03, -5.2], [0, 0, 0.5]);

  // ---------- 树：树干、分枝、几团凹凸的树冠（上亮下暗）；杨树瘦高，竹子一丛一丛 ----------
  const tree = (x: number, z: number, s: number, kind: 'round' | 'poplar' | 'bamboo' | 'persimmon') => {
    const hz = hazeAt(z), o = { haze: hz };
    if (kind === 'bamboo') {
      for (let i = 0; i < 7; i++) {
        const cx = x + (r() - 0.5) * 2.2 * s, cz = z + (r() - 0.5) * 1.6 * s, hh = (5.5 + r() * 3) * s, lean = (r() - 0.5) * 0.14;
        put(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, hh, 5), 0x7fa04a, [cx, gy + hh / 2, cz], [lean, 0, lean], 1, o);
        for (let j = 0; j < 4; j++) put(lump(0.7 * s, i + j), pick([0x6f9a40, 0x86ae4a, 0x5f8a38]), [cx + lean * hh * 0.4 + (r() - 0.5) * 0.9, gy + hh * (0.62 + j * 0.11), cz + (r() - 0.5) * 0.9], [r(), r(), 0], [1, 0.5, 1], { haze: hz, jitter: 0.3 });
      }
      shade(x, z, 1.6 * s, 7 * s);
      return;
    }
    const tall = kind === 'poplar', th = (tall ? 3 : 2.2) * s, near = z > -90, det = near ? 2 : 1, foliage = { haze: hz, jitter: near ? 0.34 : 0.22 };
    put(new THREE.CylinderGeometry(0.11 * s, 0.2 * s, th, 7), 0x4a3a2c, [x, gy + th / 2, z], [(r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08], 1, o);
    if (tall) {
      // 杨树：一整条瘦高的树冠，再贴两团小的打破轮廓
      put(lump(1, x, det), 0x4f8240, [x, gy + th * 0.7 + 3.4 * s, z], [0, r() * 6, 0], [0.85 * s, 3.5 * s, 0.85 * s], foliage);
      for (let i = 0; i < 3; i++) put(lump(0.6 * s, x + i, 1), pick([0x5a8f44, 0x437a38]), [x + (r() - 0.5) * 0.7 * s, gy + th + (0.6 + i * 1.9) * s, z + (r() - 0.5) * 0.7 * s], [0, r() * 6, 0], [1, 1.6, 1], foliage);
    } else {
      const n = kind === 'persimmon' ? 7 : near ? 13 : 9;
      for (let i = 0; i < n; i++) {
        // 树冠由一圈圈小团组成：越靠上越小、越亮
        const up = r(), spread = (1 - up * 0.6) * 1.35 * s, a2 = r() * 6.28;
        const lx = Math.cos(a2) * spread * Math.sqrt(r()), lz = Math.sin(a2) * spread * Math.sqrt(r()), ly = th + (0.2 + up * 2.2) * s, rad = (0.95 - up * 0.3 + r() * 0.25) * s;
        const hex = kind === 'persimmon' ? pick([0x6a8a3a, 0x8a983a, 0xa8983a]) : up > 0.65 ? pick([0x7a9e46, 0x86a84a]) : up > 0.3 ? pick([0x4f7f3c, 0x5a8a40]) : pick([0x35633a, 0x3f6f3a]);
        if (i < 4) put(new THREE.CylinderGeometry(0.03 * s, 0.07 * s, 1.6 * s, 5), 0x4a3a2c, [x + lx * 0.4, gy + th + 0.3 * s, z + lz * 0.4], [Math.atan2(Math.hypot(lx, lz), 1.2 * s), Math.atan2(lx, lz), 0], 1, o);
        put(lump(rad, i * 1.7 + x, det), hex, [x + lx, gy + ly, z + lz], [r(), r(), 0], [1, 0.8, 1], foliage);
        if (kind === 'persimmon') for (let j = 0; j < 4; j++) put(new THREE.SphereGeometry(0.055, 8, 6), 0xe8742a, [x + lx + (r() - 0.5) * rad * 1.8, gy + ly - rad * 0.6 - r() * 0.2, z + lz + (r() - 0.5) * rad * 1.8], [0, 0, 0], [1, 0.85, 1]);
      }
    }
    shade(x, z, (tall ? 0.8 : 1.7) * s, (tall ? 9 : 5) * s);
  };
  tree(7.6, -11.6, 0.55, 'persimmon'); // 菜园角上的柿子树

  // ---------- 人家：白墙、灰瓦人字顶带屋檐屋脊、墙裙、门窗、红对联、偏房、烟囱 ----------
  const chimneys: THREE.Vector3[] = [];
  const roof = (w: number, d: number, rise: number, over: number) => {
    const hw = w / 2 + over, hd = d / 2 + over, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, -hw, rise, 0, hw, rise, 0], 3));
    g.setIndex([3, 2, 5, 3, 5, 4, 1, 0, 4, 1, 4, 5, 0, 3, 4, 2, 1, 5]);
    return g.toNonIndexed();
  };
  const house = (x: number, z: number, w: number, d: number, rot: number, smoke = false) => {
    const o = { haze: hazeAt(z) }, c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, gy + ly, z - lx * s + lz * c];
    put(new THREE.BoxGeometry(w, 3.0, d), 0xebe6da, at(0, 1.5, 0), [0, rot, 0], 1, o);
    put(new THREE.BoxGeometry(w + 0.06, 0.6, d + 0.06), 0x8f8f8c, at(0, 0.3, 0), [0, rot, 0], 1, o);              // 墙裙
    put(roof(w, d, 1.7, 0.55), 0x4b5058, at(0, 3.0, 0), [0, rot, 0], 1, o);
    put(new THREE.BoxGeometry(w + 1.3, 0.16, 0.24), 0x3a3e44, at(0, 4.72, 0), [0, rot, 0], 1, o);                 // 屋脊
    for (const sz of [-1, 1]) put(new THREE.BoxGeometry(w + 1.1, 0.07, 0.12), 0x6a6e72, at(0, 3.0, sz * (d / 2 + 0.52)), [0, rot, 0], 1, o); // 檐口
    put(new THREE.BoxGeometry(1.1, 2.0, 0.06), 0x4a3020, at(0, 1.0, d / 2 + 0.02), [0, rot, 0], 1, o);            // 门
    for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.2, 1.7, 0.03), 0xc8281e, at(sx * 0.78, 1.15, d / 2 + 0.03), [0, rot, 0], 1, o); // 对联
    put(new THREE.BoxGeometry(1.2, 0.24, 0.03), 0xc8281e, at(0, 2.2, d / 2 + 0.03), [0, rot, 0], 1, o);
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(1.1, 0.95, 0.05), 0x2a3238, at(sx * (w / 2 - 1.2), 1.7, d / 2 + 0.02), [0, rot, 0], 1, o); // 窗
      put(new THREE.BoxGeometry(1.2, 0.07, 0.07), 0x6a5236, at(sx * (w / 2 - 1.2), 1.2, d / 2 + 0.04), [0, rot, 0], 1, o);
    }
    // 偏房：矮一截，单坡顶
    put(new THREE.BoxGeometry(w * 0.4, 2.2, d * 0.7), 0xe3ddd0, at(w / 2 + w * 0.2, 1.1, -d * 0.1), [0, rot, 0], 1, o);
    put(new THREE.BoxGeometry(w * 0.46, 0.12, d * 0.86), 0x4b5058, at(w / 2 + w * 0.2, 2.4, -d * 0.1), [0.16, rot, 0], 1, o);
    put(new THREE.BoxGeometry(0.5, 1.0, 0.5), 0x8a8a86, at(-w / 4, 4.3, -d / 4), [0, rot, 0], 1, o);              // 烟囱
    if (smoke) chimneys.push(new THREE.Vector3(...at(-w / 4, 4.9, -d / 4)));
    shade(x, z + d / 2, w * 0.65, 5);
  };
  const haystack = (x: number, z: number) => {
    const o = { haze: hazeAt(z) };
    put(new THREE.CylinderGeometry(1.5, 1.7, 1.6, 12), 0xcfae5a, [x, gy + 0.8, z], [0, 0, 0], 1, o);
    put(new THREE.ConeGeometry(1.8, 1.5, 12), 0xd9ba66, [x, gy + 2.3, z], [0, 0, 0], 1, o);
    shade(x, z, 1.7, 3);
  };
  // 最近的一户在左前方，能看清门窗和对联；后面一丛竹子，旁边两个草垛
  house(-15, -50, 9, 6, 0.35, true); tree(-21, -57, 1.2, 'bamboo'); tree(-10, -58, 1.0, 'bamboo'); haystack(-7.5, -47); haystack(-23, -46.5);
  tree(-19.5, -44.5, 1.1, 'round');
  house(-40, -96, 9.5, 6, 0.2); house(-24, -124, 8.5, 6, -0.3, true); house(44, -106, 10, 6.5, 0.1, true); house(72, -150, 9, 6, 0.5);
  house(-82, -172, 9, 6, -0.2); house(20, -192, 8.5, 6, 0.3); house(-55, -232, 10, 6, 0); house(110, -210, 9, 6, -0.4);
  for (const [hx, hz2] of [[-40, -96], [44, -106], [-24, -124], [72, -150], [20, -192]]) {
    tree(hx - 7, hz2 - 7, 1.1, 'bamboo');
    for (let i = 0; i < 3; i++) tree(hx + (r() - 0.5) * 18, hz2 - 5 - r() * 6, 1.3 + r() * 0.8, 'round');
    if (r() < 0.7) haystack(hx + 8 + r() * 3, hz2 + 4);
  }
  for (let i = 0; i < (high ? 60 : 30); i++) {
    const z = -62 - r() * 250, x = (r() - 0.5) * (170 + -z * 1.4);
    tree(x, z, 1.1 + r() * 1.3, 'round');
    if (r() < 0.45) tree(x + 2.5 + r() * 2, z + r() * 3, 0.9 + r(), 'round');
  }
  // 田间一条土路，路边一排杨树
  for (let i = 0; i < 18; i++) { const x = -100 + i * 11 + r() * 3, z = -76 - i * 2.4; tree(x, z, 0.85 + r() * 0.3, 'poplar'); }

  // ---------- 稻田里：田埂、稻草人、锄地的农人和一头水牛 ----------
  const dike = (x0: number, z0: number, x1: number, z1: number) => put(rbox(Math.abs(x1 - x0) + 0.5, 0.22, Math.abs(z1 - z0) + 0.5, 0.1, 2), 0x7a7a44, [(x0 + x1) / 2, gy + 0.05, (z0 + z1) / 2]);
  dike(-60, -15.2, 60, -15.2); dike(-60, -46, 60, -46); dike(-9.5, -15.2, -9.5, -46); dike(12, -15.2, 12, -46);
  const sx = -11.5, sz = -27; // 稻草人：草帽、破布衫、稻草的手
  put(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), 0x8a744a, [sx, gy + 1.0, sz]);
  put(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 5), 0x8a744a, [sx, gy + 1.45, sz], [0, 0, Math.PI / 2]);
  put(new THREE.BoxGeometry(0.5, 0.62, 0.14), 0x9a4a3a, [sx, gy + 1.3, sz]);
  for (const s of [-1, 1]) { put(new THREE.BoxGeometry(0.42, 0.2, 0.12), 0x9a4a3a, [sx + s * 0.44, gy + 1.45, sz]); put(new THREE.ConeGeometry(0.07, 0.2, 6), 0xd9c08a, [sx + s * 0.78, gy + 1.45, sz], [0, 0, -s * Math.PI / 2]); }
  put(new THREE.SphereGeometry(0.14, 10, 8), 0xd9c08a, [sx, gy + 1.78, sz]);
  put(new THREE.ConeGeometry(0.36, 0.2, 12), 0xcfae62, [sx, gy + 1.96, sz]);
  const fx = 4.5, fz = -24; // 农人：弯着腰，戴草帽，手里一把锄头
  for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.07, 0.06, 0.8, 6), 0x3a4a5c, [fx + s * 0.1, gy + 0.4, fz]);
  put(new THREE.CylinderGeometry(0.17, 0.15, 0.62, 8), 0x6f8aa0, [fx, gy + 1.02, fz - 0.14], [-0.6, 0, 0]);
  put(new THREE.SphereGeometry(0.11, 10, 8), 0xd9a878, [fx, gy + 1.36, fz - 0.38]);
  put(new THREE.ConeGeometry(0.3, 0.16, 12), 0xd9ba66, [fx, gy + 1.5, fz - 0.38], [-0.3, 0, 0]);
  put(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 5), 0x8a6a44, [fx + 0.05, gy + 0.75, fz - 0.75], [-0.75, 0, 0]);
  shade(fx, fz, 0.3, 1.6);
  const ox = 8.5, oz = -30; // 水牛是带动画的模型，在 animals.ts 里；这里只留它的影子
  shade(ox, oz, 0.55, 2.4);

  // ---------- 地平线上的小山：三层，近的深、远的淡，山脚发白；朝阳那儿留一个豁口 ----------
  const ridge = (z: number, base: number, amp: number, seed: number, top: number, foot: number, hz: number, bumpy = 0) => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [], W = 1700, N = 220, ROWS = 4, sunX = -0.068 * z;
    const ct = new THREE.Color(top).lerp(HAZE, hz), cf = new THREE.Color(foot).lerp(HAZE, Math.min(0.9, hz + 0.25)), cc = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const x = -W / 2 + (i / N) * W;
      const dip = 1 - 0.78 * Math.exp(-Math.pow((x + sunX) / 70, 2));
      const hgt = Math.max(2, (base + amp * (0.5 + 0.5 * Math.sin(x * 0.006 + seed)) * (0.6 + 0.4 * Math.sin(x * 0.017 + seed * 2.3)) + amp * 0.18 * Math.sin(x * 0.05 + seed * 5)) * dip
        + bumpy * (Math.sin(x * 0.9 + seed) * 0.5 + Math.sin(x * 2.3 + seed * 3) * 0.5)); // 山脊上起伏的树影
      const patch = 0.9 + 0.1 * Math.sin(x * 0.04 + seed * 7); // 一片深一片浅的林子
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;
        pos.push(x, gy - 2 + (hgt + 2) * t, z);
        cc.copy(cf).lerp(ct, Math.pow(t, 0.7)).multiplyScalar(0.92 + 0.08 * t * patch).toArray(col, col.length);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < ROWS; j++) { const a = i * (ROWS + 1) + j, b = a + ROWS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    batch.add(mat, g);
  };
  ridge(-440, 18, 36, 1.3, 0x6f8f9a, 0x9fb2b0, 0.45);
  ridge(-380, 10, 24, 4.1, 0x4f7466, 0x86a08c, 0.3, 0.8);
  ridge(-310, 4, 13, 2.2, 0x3f6a48, 0x7a9a6a, 0.18, 1.4);

  const meshes = batch.build(group, bin);
  meshes.forEach((m) => { m.frustumCulled = false; });
  shadows.build(group, bin).forEach((m) => { m.frustumCulled = false; m.renderOrder = 1; });

  // ---------- 稻田的底色：一大块一大块拼起来的田，田埂、土路、水渠把它们隔开 ----------
  const FW = 900, FD = 470;
  const fields = bin.add(new THREE.MeshBasicMaterial({ map: bin.add(canvasTex(2048, 1070, (g, w, h) => {
    const rr = rng(77);
    g.fillStyle = '#8a7a4a'; g.fillRect(0, 0, w, h); // 田埂的土色
    const palette = ['#7fae3f', '#8cb845', '#6fa23a', '#a8bf4a', '#c9c24f', '#d8c85a', '#93b84a', '#b9c852'];
    let y = h;
    while (y > 0) {
      const rowH = 60 + rr() * 90; let x = -rr() * 100;
      while (x < w) {
        const pw = 110 + rr() * 220, water = rr() < 0.12;
        if (water) { const sky = g.createLinearGradient(0, y - rowH, 0, y); sky.addColorStop(0, '#c9d2dc'); sky.addColorStop(1, '#e6cdb8'); g.fillStyle = sky; } // 水田映着朝霞
        else g.fillStyle = palette[Math.floor(rr() * palette.length)];
        g.fillRect(x + 3, y - rowH + 3, pw - 6, rowH - 6);
        g.strokeStyle = water ? 'rgba(90,140,70,.55)' : 'rgba(40,80,20,.22)'; g.lineWidth = 1;
        const vertical = rr() < 0.5;
        for (let k = 4; k < (vertical ? pw : rowH) - 4; k += water ? 7 : 4) {
          g.beginPath();
          if (vertical) { g.moveTo(x + k, y - rowH + 5); g.lineTo(x + k, y - 5); } else { g.moveTo(x + 5, y - rowH + k); g.lineTo(x + pw - 5, y - rowH + k); }
          g.stroke();
        }
        x += pw;
      }
      y -= rowH;
    }
    // 一条斜穿田野的土路和它旁边的水渠
    g.strokeStyle = '#b9a47a'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, h - 200); g.lineTo(w, h - 300); g.stroke();
    g.strokeStyle = '#a9bcc8'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h - 190); g.lineTo(w, h - 290); g.stroke();
    // 最近的一条田留给实体的稻丛：左边一块熟了，中间青的，右边半黄
    const X = (x: number) => ((x + FW / 2) / FW) * w;
    g.fillStyle = '#b9b04a'; g.fillRect(0, h - 78, X(-9.5), 78); g.fillStyle = '#7aa83c'; g.fillRect(X(-9.5), h - 78, X(12) - X(-9.5), 78); g.fillStyle = '#9ab544'; g.fillRect(X(12), h - 78, w - X(12), 78);
    speckle(g, w, h, 78, 24000, '30,60,10', 0.12);
    const fog = g.createLinearGradient(0, h, 0, 0); // 越远越泛白的晨雾
    fog.addColorStop(0, 'rgba(200,205,200,0)'); fog.addColorStop(0.45, 'rgba(200,205,200,.28)'); fog.addColorStop(1, 'rgba(205,210,208,.72)');
    g.fillStyle = fog; g.fillRect(0, 0, w, h);
  })) }));
  const field = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2)), fields);
  field.position.set(0, gy - 0.03, -14.4 - FD / 2);
  field.frustumCulled = false;
  group.add(field);
  const grass = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(FW, 60).rotateX(-Math.PI / 2)), bin.add(new THREE.MeshBasicMaterial({ color: 0x6f8f45 })));
  grass.position.set(0, gy - 0.04, 14);
  group.add(grass);

  // ---------- 一丛丛的稻子（实例化）：叶子向外披，叶尖弯下来，顶上垂着稻穗 ----------
  const bladeGeo = (blades: number, hgt: number, ears: boolean) => {
    const pos: number[] = [], col: number[] = [], cg = new THREE.Color(0x5a9434), ct = new THREE.Color(0x9fb84a), ce = new THREE.Color(0xd9c25a);
    const push = (c: THREE.Color, k: number, ...v: number[]) => { pos.push(...v); col.push(c.r * k, c.g * k, c.b * k); };
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * 6.28 + (b % 2) * 0.3, lean = 0.1 + (b % 3) * 0.07, hh = hgt * (0.85 + (b % 4) * 0.08), wd = hgt * 0.035;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz * wd, pz = dx * wd;
      const mx = dx * lean, mz = dz * lean, my = hh * 0.7, tx = dx * lean * 2.3, tz = dz * lean * 2.3, ty = hh * (ears && b % 3 === 0 ? 0.78 : 0.95);
      push(cg, 0.75, -px, 0, -pz); push(cg, 0.75, px, 0, pz); push(cg, 1, mx + px * 0.7, my, mz + pz * 0.7);
      push(cg, 0.75, -px, 0, -pz); push(cg, 1, mx + px * 0.7, my, mz + pz * 0.7); push(cg, 1, mx - px * 0.7, my, mz - pz * 0.7);
      const tip = ears && b % 3 === 0 ? ce : ct;
      push(cg, 1, mx - px * 0.7, my, mz - pz * 0.7); push(cg, 1, mx + px * 0.7, my, mz + pz * 0.7); push(tip, 1.05, tx, ty, tz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return bin.add(g);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), ic = new THREE.Color();
  const stepX = high ? 0.5 : 0.85, stepZ = high ? 0.55 : 0.95;
  const riceGeo = bladeGeo(9, 0.72, true);
  const spots: [number, number][] = [];
  for (let x = -30; x < 30; x += stepX) for (let z = -15.7; z > -45.4; z -= stepZ) if (Math.abs(x + 9.5) > 0.45 && Math.abs(x - 12) > 0.45) spots.push([x, z]);
  const rice = new THREE.InstancedMesh(riceGeo, mat, spots.length);
  spots.forEach(([x, z], i) => {
    e.set(0, r() * 6.28, 0); q.setFromEuler(e);
    rice.setMatrixAt(i, m4.compose(p3.set(x + (r() - 0.5) * 0.15, gy, z + (r() - 0.5) * 0.15), q, s3.setScalar(0.8 + r() * 0.5)));
    // 三块田成熟的程度不一样
    const v = 0.9 + r() * 0.2;
    if (x < -9.5) ic.setRGB(2.0 * v, 1.12 * v, 0.7 * v); else if (x > 12) ic.setRGB(1.45 * v, 1.08 * v, 0.8 * v); else ic.setRGB(v, v, v);
    rice.setColorAt(i, ic);
  });
  rice.frustumCulled = false;
  group.add(rice);

  // 篱笆脚下、路边、田埂上的杂草（实例化）
  const weedGeo = bladeGeo(6, 0.2, false);
  const weedSpots: V3[] = [];
  const along = (x0: number, z0: number, x1: number, z1: number, n: number, spread: number) => { for (let i = 0; i < n; i++) { const t = r(); weedSpots.push([x0 + (x1 - x0) * t + (r() - 0.5) * spread, gy, z0 + (z1 - z0) * t + (r() - 0.5) * spread]); } };
  const wn = high ? 1 : 0.5;
  along(-8.6, -13.9, 8.6, -13.9, 260 * wn, 0.5); along(-8.6, -13.9, -8.6, -2, 180 * wn, 0.5); along(8.6, -13.9, 8.6, -2, 180 * wn, 0.5);
  along(-9, -14.8, 9, -14.8, 200 * wn, 1.0); along(-0.1, -13.5, -0.1, -3.2, 40 * wn, 0.12); along(1.1, -13.5, 1.1, -3.2, 40 * wn, 0.12);
  along(-9, -8.6, 9, -8.6, 40 * wn, 0.1); along(-9, -7.8, 9, -7.8, 40 * wn, 0.1); along(-60, -15.2, 60, -15.2, 400 * wn, 0.5); along(-8, -2.0, 8, -2.0, 120 * wn, 0.5);
  const weeds = new THREE.InstancedMesh(weedGeo, mat, weedSpots.length);
  weedSpots.forEach((p, i) => {
    e.set(0, r() * 6.28, 0); q.setFromEuler(e);
    weeds.setMatrixAt(i, m4.compose(p3.set(...p), q, s3.setScalar(0.45 + r() * 0.7)));
    const v = 0.8 + r() * 0.3; ic.setRGB(v * (r() < 0.2 ? 1.3 : 1), v, v * 0.8); weeds.setColorAt(i, ic);
  });
  weeds.frustumCulled = false;
  group.add(weeds);

  // ---------- 晨雾：远处几道横着的薄雾，把一层层的树和山隔开 ----------
  const mistTex = bin.add(canvasTex(8, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.55, 'rgba(255,255,255,.9)'); grad.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  for (const [z, hh, op] of [[-300, 20, 0.5], [-215, 14, 0.32], [-140, 9, 0.2]] as const) {
    const m = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(1500, hh)), bin.add(new THREE.MeshBasicMaterial({ map: mistTex, color: 0xe6e8e4, transparent: true, opacity: op, depthWrite: false })));
    m.position.set(0, gy + hh / 2 - 1, z); m.renderOrder = 2; m.frustumCulled = false;
    group.add(m);
  }

  // ---------- 炊烟：几户人家的烟囱里慢慢升起来 ----------
  const smokeTex = bin.add(canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }));
  const puffs = chimneys.flatMap((c, ci) => Array.from({ length: high ? 6 : 4 }, (_, i) => {
    const m = bin.add(new THREE.SpriteMaterial({ map: smokeTex, color: 0xdfe0e2, transparent: true, opacity: 0, depthWrite: false }));
    const s = new THREE.Sprite(m); s.renderOrder = 3; group.add(s);
    return { s, m, origin: c, life: i / 6, seed: ci * 3 + i };
  }));

  // 屋外的东西不参与环境光遮蔽：密密的稻丛和菜叶会被压成一片黑
  group.traverse((o) => { o.userData.noAO = true; });
  scene.add(group);
  return {
    frame(dt, t) {
      rice.rotation.z = Math.sin(t * 0.6) * 0.004;
      for (const p of puffs) {
        p.life = (p.life + dt * 0.06) % 1;
        const k = p.life;
        p.s.position.set(p.origin.x + k * k * 9 + Math.sin(p.seed + k * 5) * 0.6, p.origin.y + k * 11, p.origin.z + Math.cos(p.seed * 2 + k * 3) * 0.5);
        p.s.scale.setScalar(1.2 + k * 6);
        p.m.opacity = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 0.42;
      }
    },
    stop() { scene.remove(group); rice.dispose(); weeds.dispose(); bin.dispose(); },
  };
};
