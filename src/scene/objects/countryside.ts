import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, canvasTex, leafGeo, place, rng, speckle, type V3 } from '../util';

/**
 * 窗外的乡下：窗前是一个农家菜园（白菜、生菜、小葱、辣椒、茄子、番茄、豆角架、南瓜，竹篱笆围着），
 * 篱笆外是成片的稻田，中间散着几户白墙灰瓦的人家和树，地平线上是几座不高的小山。
 *
 * 这些东西都不受室内灯光影响：用带顶点色的无光照材质，明暗是建模时按「朝上的面亮一些、远处的东西泛白」直接算进颜色里的。
 * 菜园里所有静态的东西合成一个网格。
 */
export const countryside: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const gy = L.groundY;
  const r = rng(2024);
  const mat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const batch = new Batch(['position', 'normal', 'uv', 'color']);
  const C = new THREE.Color(), HAZE = new THREE.Color(0.78, 0.8, 0.8);
  /** 摆好位置，按朝向和远近算出顶点色，放进合并队列 */
  const put = (geo: THREE.BufferGeometry, hex: number, pos?: V3, rot?: V3, scale?: V3 | number, o: { k?: number; haze?: number } = {}) => {
    place(geo, pos, rot, scale);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const n = geo.attributes.normal, cnt = geo.attributes.position.count, a = new Float32Array(cnt * 3);
    C.set(hex);
    const k = (o.k ?? 1) * (0.92 + r() * 0.16), hz = o.haze ?? 0;
    for (let i = 0; i < cnt; i++) {
      const s = k * (0.68 + 0.32 * Math.abs(n.getY(i)));
      a[i * 3] = C.r * s * (1 - hz) + HAZE.r * hz; a[i * 3 + 1] = C.g * s * (1 - hz) + HAZE.g * hz; a[i * 3 + 2] = C.b * s * (1 - hz) + HAZE.b * hz;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    batch.add(mat, geo);
  };
  const leaf = (len: number, width: number, bend = 0.6, fold = 0.2, segs = 4) => leafGeo({ len, width, bend, fold, segs });
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const skip = () => !high && r() < 0.2; // mid 档少种一些

  // ---------- 菜园的泥地：垄沟、中间通往篱笆门的小路、横着的一条小路 ----------
  const soil = bin.add(new THREE.MeshBasicMaterial({ map: bin.add(canvasTex(1024, 768, (g, w, h) => {
    g.fillStyle = '#6b5136'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 301, 14000, '30,18,8', 0.35); speckle(g, w, h, 302, 9000, '190,160,120', 0.25);
    const X = (x: number) => ((x + 9.5) / 19) * w, Z = (z: number) => ((z + 14.5) / 13.2) * h; // 画布上边是远处
    g.fillStyle = 'rgba(176,150,112,.85)';
    g.fillRect(X(-0.05), 0, X(1.05) - X(-0.05), h);                 // 中间的小路
    g.fillRect(0, Z(-8.55), w, Z(-7.85) - Z(-8.55));                // 横着的小路
    g.fillRect(0, Z(-3.0), w, h - Z(-3.0));                         // 屋檐下踩实的地
    speckle(g, w, h, 303, 5000, '60,40,20', 0.25);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${70 + r() * 40},${120 + r() * 50},50,${0.3 + r() * 0.4})`; const x = r() * w, y = r() < 0.5 ? r() * 30 : r() * h; g.fillRect(x < 30 || r() < 0.5 ? x : (r() < 0.5 ? r() * 26 : w - r() * 26), y, 3 + r() * 6, 2 + r() * 4); } // 杂草
  })) }));
  const ground = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(19, 13.2).rotateX(-Math.PI / 2)), soil);
  ground.position.set(0, gy, -7.9);
  group.add(ground);

  // ---------- 菜畦：一条条隆起的垄，沿着进深方向排 ----------
  type Crop = 'cabbage' | 'lettuce' | 'scallion' | 'chili' | 'eggplant' | 'tomato' | 'bean' | 'pumpkin';
  const bedX = [-6.2, -5.0, -3.8, -2.6, -1.4, 2.0, 3.2, 4.4, 5.6, 6.8];
  const bands: { z0: number; z1: number; crops: Crop[] }[] = [
    { z0: -7.5, z1: -3.3, crops: ['bean', 'tomato', 'chili', 'cabbage', 'scallion', 'scallion', 'cabbage', 'eggplant', 'tomato', 'bean'] },
    { z0: -13.2, z1: -8.9, crops: ['cabbage', 'lettuce', 'scallion', 'cabbage', 'chili', 'lettuce', 'cabbage', 'pumpkin', 'pumpkin', 'cabbage'] },
  ];
  const GREEN = [0x4f8a3a, 0x5c9a42, 0x437a33, 0x6aa84a];
  const plant = {
    cabbage(x: number, z: number, s = 1, light = false) {
      const n = 8, c = light ? [0x86bf5a, 0x9bcc66, 0x78b24f] : [0x5f9e48, 0x6fae52, 0x4f8f3e];
      for (let i = 0; i < n; i++) put(leaf(0.27 * s, 0.16 * s, light ? 0.5 : 0.9, 0.25), pick(c), [x, gy + 0.11, z], [0.35 + r() * 0.75, (i / n) * 6.28 + r(), 0]);
      if (!light) put(new THREE.SphereGeometry(0.06 * s, 7, 5), 0xb9dc86, [x, gy + 0.18, z], [0, 0, 0], [1, 1.1, 1]);
    },
    scallion(x: number, z: number) {
      for (let i = 0; i < 5; i++) put(leafGeo({ len: 0.26 + r() * 0.12, width: 0.007, bend: 0.25 + r() * 0.5, fold: 0.6, segs: 2 }), pick([0x3f8f45, 0x4a9a4c]), [x + (r() - 0.5) * 0.03, gy + 0.1, z + (r() - 0.5) * 0.03], [0.1 + r() * 0.35, r() * 6.28, 0]);
    },
    bush(x: number, z: number, fruit: 'chili' | 'eggplant') {
      const big = fruit === 'eggplant', hgt = big ? 0.5 : 0.4;
      put(new THREE.CylinderGeometry(0.008, 0.012, hgt, 5), 0x5a6b34, [x, gy + 0.1 + hgt / 2, z]);
      for (let i = 0; i < (big ? 11 : 13); i++) put(leaf(big ? 0.15 : 0.09, big ? 0.075 : 0.035, 0.5, 0.2, 3), pick(big ? [0x3f6f3a, 0x4a7d40] : GREEN), [x, gy + 0.18 + r() * (hgt - 0.1), z], [0.7 + r() * 0.7, r() * 6.28, 0]);
      for (let i = 0; i < (big ? 2 : 4); i++) {
        const a = r() * 6.28, d = 0.07 + r() * 0.06, y = gy + 0.2 + r() * 0.15;
        if (big) put(new THREE.SphereGeometry(0.035, 6, 5), 0x4b2a66, [x + Math.cos(a) * d, y, z + Math.sin(a) * d], [0.3, 0, 0], [1, 2.3, 1]);
        else put(new THREE.ConeGeometry(0.012, 0.07, 5), r() < 0.7 ? 0xc8281e : 0x3f8f3a, [x + Math.cos(a) * d, y, z + Math.sin(a) * d], [Math.PI, 0, 0]);
      }
    },
    tomato(x: number, z: number) {
      put(new THREE.CylinderGeometry(0.01, 0.01, 1.35, 5), 0xb9a36a, [x, gy + 0.1 + 0.675, z], [0.03, 0, 0.03]);
      for (let i = 0; i < 14; i++) put(leaf(0.13, 0.05, 0.6, 0.2, 3), pick(GREEN), [x, gy + 0.25 + r() * 0.95, z], [0.8 + r() * 0.6, r() * 6.28, 0]);
      for (let i = 0; i < 5; i++) { const a = r() * 6.28; put(new THREE.SphereGeometry(0.03, 6, 5), r() < 0.75 ? 0xd9301f : 0x8fae3a, [x + Math.cos(a) * 0.08, gy + 0.35 + r() * 0.6, z + Math.sin(a) * 0.08]); }
    },
    /** 一小段豆角架：两根竹竿交叉成人字，上面爬满叶子 */
    bean(x: number, z: number) {
      for (const s of [-1, 1]) {
        put(new THREE.CylinderGeometry(0.011, 0.013, 1.95, 5), 0xc2ab6c, [x + s * 0.14, gy + 0.1 + 0.93, z], [0, 0, s * 0.3]);
        for (let i = 0; i < 12; i++) { const t = 0.15 + r() * 0.8; put(leaf(0.1, 0.085, 0.4, 0.15, 3), pick(GREEN), [x + s * (0.28 - t * 0.28) + (r() - 0.5) * 0.12, gy + 0.1 + t * 1.8, z + (r() - 0.5) * 0.3], [0.9 + r() * 0.8, r() * 6.28, 0]); }
        for (let i = 0; i < 3; i++) put(new THREE.CylinderGeometry(0.006, 0.004, 0.2, 4), 0x6fae4a, [x + s * 0.12 + (r() - 0.5) * 0.1, gy + 0.6 + r() * 0.9, z + (r() - 0.5) * 0.2]);
      }
    },
    pumpkin(x: number, z: number) {
      for (let i = 0; i < 6; i++) put(leafGeo({ len: 0.2, width: 0.2, bend: 0.3, fold: 0.1, segs: 3, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.6)) }), pick([0x4a8a3c, 0x3f7a35, 0x5a9a44]), [x + (r() - 0.5) * 0.5, gy + 0.12 + r() * 0.1, z + (r() - 0.5) * 0.5], [1.2 + r() * 0.3, r() * 6.28, 0]);
      if (r() < 0.6) put(new THREE.SphereGeometry(0.15, 9, 6), r() < 0.7 ? 0xe08a2a : 0x7fa040, [x + (r() - 0.5) * 0.3, gy + 0.19, z + (r() - 0.5) * 0.3], [0, r() * 3, 0], [1, 0.68, 1]);
    },
  };
  for (const band of bands) {
    const len = band.z1 - band.z0, zc = (band.z0 + band.z1) / 2;
    bedX.forEach((x, bi) => {
      const crop = band.crops[bi];
      // 垄：一条压扁的圆柱
      put(new THREE.BoxGeometry(0.84, 0.11, len + 0.15), 0x5c4630, [x, gy + 0.05, zc], [0, 0, 0], 1, { k: 1.1 });
      const step = crop === 'scallion' ? 0.16 : crop === 'cabbage' || crop === 'lettuce' ? 0.36 : crop === 'bean' ? 0.6 : crop === 'pumpkin' ? 0.7 : 0.5;
      const rowsX = crop === 'scallion' ? [-0.2, 0, 0.2] : crop === 'cabbage' || crop === 'lettuce' ? [-0.17, 0.17] : [0];
      for (const dx of rowsX) for (let z = band.z0 + 0.2; z < band.z1 - 0.1; z += step) {
        if (skip()) continue;
        const px = x + dx + (r() - 0.5) * 0.04, pz = z + (r() - 0.5) * 0.05;
        if (crop === 'cabbage') plant.cabbage(px, pz, 0.85 + r() * 0.3);
        else if (crop === 'lettuce') plant.cabbage(px, pz, 0.7 + r() * 0.2, true);
        else if (crop === 'scallion') plant.scallion(px, pz);
        else if (crop === 'chili' || crop === 'eggplant') plant.bush(px, pz, crop);
        else if (crop === 'tomato') plant.tomato(px, pz);
        else if (crop === 'bean') plant.bean(px, pz);
        else plant.pumpkin(px, pz);
      }
      if (crop === 'bean') put(new THREE.CylinderGeometry(0.011, 0.011, len, 5), 0xc2ab6c, [x, gy + 0.1 + 1.72, zc], [Math.PI / 2, 0, 0]); // 架顶的横竿
    });
  }

  // ---------- 竹篱笆：后面一道（中间留门），两侧各一道（横路的位置留口，猫狗从这儿进出）----------
  const BAMBOO = [0xb9a468, 0xa8955c, 0xc7b274];
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.22), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      put(new THREE.CylinderGeometry(0.011, 0.013, 0.95 + r() * 0.12, 5), pick(BAMBOO), [x0 + (x1 - x0) * t, gy + 0.5, z0 + (z1 - z0) * t], [(r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08]);
    }
    for (const y of [0.3, 0.75]) put(new THREE.CylinderGeometry(0.012, 0.012, len, 5), 0x9c8850, [(x0 + x1) / 2, gy + y, (z0 + z1) / 2], [Math.PI / 2, ang, 0]);
  };
  fence(-8.6, -13.9, -0.15, -13.9); fence(1.15, -13.9, 8.6, -13.9);
  for (const x of [-8.6, 8.6]) { fence(x, -13.9, x, -8.75); fence(x, -7.65, x, -2.0); }
  // 中间小路上的踏脚石
  for (let z = -3.6; z > -13.5; z -= 0.75) put(new THREE.CylinderGeometry(0.2 + r() * 0.06, 0.22, 0.03, 9), 0x8d8a84, [0.5 + (r() - 0.5) * 0.25, gy + 0.012, z], [0, r() * 3, 0], [1, 1, 0.8 + r() * 0.3]);
  // 屋檐下的一口陶水缸
  put(new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.33, 0.25], [0.34, 0.45], [0.27, 0.62], [0.3, 0.66], [0.26, 0.66], [0.24, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 16), 0x5a3a26, [3.4, gy, -2.3]);
  put(new THREE.CircleGeometry(0.25, 16).rotateX(-Math.PI / 2), 0x5f7f86, [3.4, gy + 0.6, -2.3]);
  // 菜园角上的一棵柿子树：叶子落得差不多了，挂着橙红的柿子
  const tx = 7.6, tz = -11.6;
  put(new THREE.CylinderGeometry(0.07, 0.13, 1.7, 7), 0x4a3a2c, [tx, gy + 0.85, tz], [0, 0, 0.05]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28 + r(), up = 0.5 + r() * 0.5, len = 0.9 + r() * 0.7;
    const bx = tx + Math.sin(a) * Math.sin(up) * len / 2, bz = tz + Math.cos(a) * Math.sin(up) * len / 2, by = gy + 1.6 + Math.cos(up) * len / 2;
    put(new THREE.CylinderGeometry(0.015, 0.04, len, 5), 0x4a3a2c, [bx, by, bz], [up, a, 0]);
    const ex = tx + Math.sin(a) * Math.sin(up) * len, ez = tz + Math.cos(a) * Math.sin(up) * len, ey = gy + 1.6 + Math.cos(up) * len;
    put(new THREE.IcosahedronGeometry(0.34 + r() * 0.16, 0), pick([0x5a8a3a, 0x7a9a3a, 0xa8983a]), [ex, ey + 0.1, ez], [r(), r(), 0], [1, 0.75, 1]);
    for (let j = 0; j < 3; j++) put(new THREE.SphereGeometry(0.05, 7, 5), 0xe8742a, [ex + (r() - 0.5) * 0.6, ey - 0.15 - r() * 0.2, ez + (r() - 0.5) * 0.6], [0, 0, 0], [1, 0.85, 1]);
  }

  // ---------- 篱笆外：稻草人、田间的树和人家（越远越泛白）----------
  const sx = -10, sz = -26;
  put(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), 0x8a744a, [sx, gy + 1.0, sz]);
  put(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), 0x8a744a, [sx, gy + 1.45, sz], [0, 0, Math.PI / 2]);
  put(new THREE.BoxGeometry(0.5, 0.6, 0.12), 0x9a4a3a, [sx, gy + 1.3, sz]);
  put(new THREE.SphereGeometry(0.14, 8, 6), 0xd9c08a, [sx, gy + 1.78, sz]);
  put(new THREE.ConeGeometry(0.34, 0.2, 10), 0xcfae62, [sx, gy + 1.95, sz]);
  const hazeAt = (z: number) => Math.min(0.75, Math.max(0, (-z - 30) / 420));
  const house = (x: number, z: number, w: number, rot: number) => {
    const hz = hazeAt(z);
    put(new THREE.BoxGeometry(w, 3.2, 6), 0xe9e4d8, [x, gy + 1.6, z], [0, rot, 0], 1, { haze: hz });
    put(new THREE.CylinderGeometry(0.01, 3.9, 2.0, 4, 1), 0x4a4f56, [x, gy + 4.2, z], [0, rot + Math.PI / 4, 0], [w / 5.2, 1, 1.25], { haze: hz }); // 灰瓦坡顶
  };
  house(-38, -95, 9, 0.2); house(-24, -120, 8, -0.3); house(46, -110, 10, 0.1); house(70, -150, 9, 0.5); house(-80, -170, 9, -0.2); house(18, -190, 8, 0.3); house(-55, -230, 10, 0);
  const tree = (x: number, z: number, s: number) => {
    const hz = hazeAt(z);
    put(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.2 * s, 5), 0x4a3a2c, [x, gy + 1.1 * s, z], [0, 0, 0], 1, { haze: hz });
    put(new THREE.IcosahedronGeometry(1.7 * s, 0), pick([0x3f6f3a, 0x4a7a40, 0x35633a]), [x, gy + 3.2 * s, z], [r(), r(), 0], [1, 1.15, 1], { haze: hz });
  };
  for (let i = 0; i < (high ? 70 : 36); i++) {
    const z = -55 - r() * 260, x = (r() - 0.5) * (160 + -z * 1.4);
    tree(x, z, 1.1 + r() * 1.4);
    if (r() < 0.5) tree(x + 2 + r() * 2, z + r() * 3, 0.9 + r());
  }
  for (const [hx, hz2] of [[-38, -95], [46, -110], [-24, -120], [70, -150]]) for (let i = 0; i < 4; i++) tree(hx + (r() - 0.5) * 16, hz2 - 4 - r() * 5, 1.4 + r()); // 房前屋后的树
  // 田间一条路边的一排杨树
  for (let i = 0; i < 16; i++) { const x = -90 + i * 12 + r() * 3, z = -75 - i * 2.2; put(new THREE.ConeGeometry(1.1, 8, 6), 0x42703c, [x, gy + 5, z], [0, 0, 0], 1, { haze: hazeAt(z) }); }

  // ---------- 地平线上的小山：两层，近的深、远的淡，朝阳那儿留一个豁口 ----------
  const ridge = (z: number, base: number, amp: number, seed: number, top: number, bottom: number, hz: number) => {
    const pos: number[] = [], idx: number[] = [], W = 1500, N = 150, sunX = -0.068 * z; // 太阳方向在这个距离上对应的 x（负值在左边）要取反后代入下面的式子
    for (let i = 0; i <= N; i++) {
      const x = -W / 2 + (i / N) * W;
      const dip = 1 - 0.75 * Math.exp(-Math.pow((x + sunX) / 70, 2));
      const hgt = (base + amp * (0.5 + 0.5 * Math.sin(x * 0.006 + seed)) * (0.6 + 0.4 * Math.sin(x * 0.017 + seed * 2.3)) + amp * 0.18 * Math.sin(x * 0.05 + seed * 5)) * dip;
      pos.push(x, gy - 2, z, x, gy + Math.max(2, hgt), z);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const col = new Float32Array((N + 1) * 6), ct = new THREE.Color(top).lerp(HAZE, hz), cb = new THREE.Color(bottom).lerp(HAZE, hz);
    for (let i = 0; i <= N; i++) { cb.toArray(col, i * 6); ct.toArray(col, i * 6 + 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    batch.add(mat, g);
  };
  ridge(-430, 16, 34, 1.3, 0x6f8f96, 0x8fa6a2, 0.45);
  ridge(-360, 8, 22, 4.1, 0x4f7462, 0x6f9272, 0.3);

  const meshes = batch.build(group, bin);
  meshes.forEach((m) => { m.frustumCulled = false; });

  // ---------- 稻田：一大块一大块拼起来的田，田埂把它们隔开；有的已经黄了，有的还绿，有的刚放了水 ----------
  const FW = 900, FD = 470;
  const fields = bin.add(new THREE.MeshBasicMaterial({ map: bin.add(canvasTex(2048, 1070, (g, w, h) => {
    const rr = rng(77);
    g.fillStyle = '#8a7a4a'; g.fillRect(0, 0, w, h); // 田埂的土色
    const palette = ['#7fae3f', '#8cb845', '#6fa23a', '#a8bf4a', '#c9c24f', '#d8c85a', '#93b84a', '#b9c852'];
    let y = h;
    while (y > 0) {
      const rowH = 60 + rr() * 90; let x = -rr() * 100;
      while (x < w) {
        const pw = 110 + rr() * 220, water = rr() < 0.1;
        g.fillStyle = water ? '#b9c9cf' : palette[Math.floor(rr() * palette.length)];
        g.fillRect(x + 3, y - rowH + 3, pw - 6, rowH - 6);
        // 一行行的秧
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
    // 最近的一条田：留给实体的稻丛，底色统一成绿的
    g.fillStyle = '#7aa83c'; g.fillRect(0, h - 78, w, 78);
    g.fillStyle = '#8a7a4a'; g.fillRect(0, h - 82, w, 4);
    speckle(g, w, h, 78, 20000, '30,60,10', 0.12);
    // 越远越泛白的晨雾
    const fog = g.createLinearGradient(0, h, 0, 0);
    fog.addColorStop(0, 'rgba(200,205,200,0)'); fog.addColorStop(0.45, 'rgba(200,205,200,.28)'); fog.addColorStop(1, 'rgba(205,210,208,.72)');
    g.fillStyle = fog; g.fillRect(0, 0, w, h);
  })) }));
  const field = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2)), fields);
  field.position.set(0, gy - 0.03, -14.4 - FD / 2);
  field.frustumCulled = false;
  group.add(field);
  // 屋子两侧和脚下再垫一块草地，免得从侧面看出去是空的
  const grass = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(FW, 60).rotateX(-Math.PI / 2)), bin.add(new THREE.MeshBasicMaterial({ color: 0x6f8f45 })));
  grass.position.set(0, gy - 0.04, 14);
  group.add(grass);

  // 最近那条田里一丛丛的稻子（实体，随风轻轻摆）
  const tuft = new THREE.BufferGeometry();
  {
    const pos: number[] = [], col: number[] = [], cg = new THREE.Color(0x5f9a34), cy = new THREE.Color(0xcfc45a);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * 6.28, lean = 0.12 + (b % 3) * 0.07, hgt = 0.55 + (b % 2) * 0.12, wd = 0.022;
      const tx2 = Math.cos(a) * lean, tz2 = Math.sin(a) * lean, px = -Math.sin(a) * wd, pz = Math.cos(a) * wd;
      pos.push(-px, 0, -pz, px, 0, pz, tx2, hgt, tz2);
      col.push(cg.r * 0.8, cg.g * 0.8, cg.b * 0.8, cg.r * 0.8, cg.g * 0.8, cg.b * 0.8, cy.r, cy.g, cy.b);
    }
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tuft.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  bin.add(tuft);
  const stepX = high ? 0.5 : 0.8, stepZ = high ? 0.55 : 0.9, x0 = -24, x1 = 24, z0 = -15.6, z1 = -42;
  const count = Math.floor((x1 - x0) / stepX) * Math.floor((z0 - z1) / stepZ);
  const rice = new THREE.InstancedMesh(tuft, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  let ri = 0;
  for (let x = x0; x < x1 - 0.01 && ri < count; x += stepX) for (let z = z0; z > z1 + 0.01 && ri < count; z -= stepZ) {
    e.set(0, r() * 6.28, 0); q.setFromEuler(e);
    rice.setMatrixAt(ri++, m4.compose(p3.set(x + (r() - 0.5) * 0.15, gy, z + (r() - 0.5) * 0.15), q, s3.setScalar(0.8 + r() * 0.5)));
  }
  rice.count = ri;
  rice.frustumCulled = false;
  group.add(rice);

  // 屋外的东西不参与环境光遮蔽：密密的稻丛和菜叶会被压成一片黑
  group.traverse((o) => { o.userData.noAO = true; });
  scene.add(group);
  return {
    frame(_dt, t) { rice.rotation.z = Math.sin(t * 0.6) * 0.004; },
    stop() { scene.remove(group); rice.dispose(); bin.dispose(); },
  };
};
