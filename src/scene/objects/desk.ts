import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox, speckle, woodGrain } from '../util';

/** 书桌和桌上的小物：桌垫、键盘、鼠标、冒着热气的咖啡、笔记本和钢笔、插着毛笔的笔筒。 */
export const desk: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const batch = new Batch();
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  const { desk: D, floorY } = L;

  // 橡木台面 + 黑色钢架
  const oak = std({ roughness: 0.5, map: bin.add(canvasTex(1024, 512, (g, w, h) => {
    woodGrain(g, 0, 0, w, h, '#d6b88e', '120,80,40', 11, 260);
    for (const y of [h * 0.33, h * 0.66]) { g.fillStyle = 'rgba(90,55,25,.25)'; g.fillRect(0, y, w, 1.5); } // 拼板缝
  })) });
  batch.add(oak, rbox(D.w, D.t, D.d, 0.008), [0, -D.t / 2, 0]);
  const steel = std({ color: 0x1b1c1e, roughness: 0.4, metalness: 0.75 });
  const legH = -floorY - D.t;
  for (const x of [-D.w / 2 + 0.14, D.w / 2 - 0.14]) {
    for (const z of [-D.d / 2 + 0.09, D.d / 2 - 0.09]) batch.add(steel, rbox(0.04, legH, 0.04, 0.006), [x, floorY + legH / 2, z]);
    batch.add(steel, rbox(0.04, 0.04, D.d - 0.14, 0.006), [x, -D.t - 0.02, 0]);
    batch.add(steel, rbox(0.04, 0.025, D.d - 0.14, 0.006), [x, floorY + 0.0125, 0]);
  }
  batch.add(steel, rbox(D.w - 0.28, 0.04, 0.02, 0.006), [0, -D.t - 0.02, -D.d / 2 + 0.09]);

  // 毛毡桌垫
  const felt = std({ roughness: 1, map: bin.add(canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h); speckle(g, w, h, 12, 6000, '255,255,255', 0.07); speckle(g, w, h, 13, 6000, '0,0,0', 0.12); })) });
  batch.add(felt, rbox(0.86, 0.004, 0.34, 0.002), [0.07, 0.002, 0.24]);

  // 键盘：铝底座 + 独立键帽
  const alu = std({ color: 0xc7cace, roughness: 0.32, metalness: 0.85 });
  const kx = 0, kz = 0.24, u = 0.0185;
  batch.add(alu, rbox(15 * u + 0.012, 0.011, 5 * u + 0.012, 0.004), [kx, 0.0095, kz]);
  const rows = [
    [...Array(13).fill(1), 2],
    [1.5, ...Array(12).fill(1), 1.5],
    [1.75, ...Array(11).fill(1), 2.25],
    [2.25, ...Array(10).fill(1), 2.75],
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
  ];
  const keyGeo = bin.add(rbox(u - 0.002, 0.006, u - 0.002, 0.0022, 2));
  const keyMat = std({ color: 0xf4f4f2, roughness: 0.55 });
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, rows.reduce((n, r) => n + r.length, 0));
  const m4 = new THREE.Matrix4();
  let ki = 0;
  rows.forEach((row, r) => {
    let x = kx - 7.5 * u;
    for (const wU of row) {
      m4.makeScale((wU * u - 0.002) / (u - 0.002), 1, 1).setPosition(x + (wU * u) / 2, 0.0175, kz + (r - 2) * u);
      keys.setMatrixAt(ki++, m4);
      x += wU * u;
    }
  });
  keys.castShadow = high;
  group.add(keys);

  // 鼠标
  const white = std({ color: 0xf5f5f3, roughness: 0.28 });
  batch.add(white, new THREE.SphereGeometry(1, 24, 16), [0.3, 0.006, 0.25], [0, 0, 0], [0.03, 0.019, 0.052]);
  batch.add(steel, new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), [0.3, 0.021, 0.228], [0, 0, Math.PI / 2]);

  // 咖啡杯：旋转成型，有壁厚；软木杯垫
  const mx = -0.47, mz = 0.29;
  const ceramic = std({ color: 0xfaf8f3, roughness: 0.16 });
  const cup = new THREE.LatheGeometry([
    [0, 0], [0.033, 0], [0.036, 0.004], [0.041, 0.085], [0.042, 0.092], [0.039, 0.092], [0.037, 0.085], [0.033, 0.012], [0, 0.012],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 36);
  batch.add(ceramic, cup, [mx, 0.006, mz]);
  batch.add(ceramic, new THREE.TorusGeometry(0.024, 0.006, 10, 20, Math.PI), [mx + 0.04, 0.055, mz], [0, 0, -Math.PI / 2]);
  batch.add(std({ color: 0x9b3d2c, roughness: 0.3 }), new THREE.CylinderGeometry(0.0412, 0.0405, 0.012, 36, 1, true), [mx, 0.072, mz]);
  batch.add(std({ color: 0x2b170c, roughness: 0.15 }), new THREE.CircleGeometry(0.037, 32).rotateX(-Math.PI / 2), [mx, 0.088, mz]);
  const cork = std({ roughness: 1, map: bin.add(canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#b98e5e'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14, 900, '60,35,10', 0.3); })) });
  batch.add(cork, new THREE.CylinderGeometry(0.055, 0.055, 0.006, 32), [mx, 0.003, mz]);

  // 笔记本（皮面、书签带、松紧带）和钢笔
  const nx = -0.75, nz = 0.27, nr = 0.22;
  const leather = std({ roughness: 0.6, map: bin.add(canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1e2a36'; g.fillRect(0, 0, w, h); speckle(g, w, h, 15, 3000, '255,255,255', 0.06); })) });
  const paper = std({ color: 0xf1ead8, roughness: 0.9 });
  batch.add(paper, new THREE.BoxGeometry(0.146, 0.014, 0.206), [nx, 0.009, nz], [0, nr, 0]);
  batch.add(leather, rbox(0.152, 0.003, 0.212, 0.0015), [nx, 0.0015, nz], [0, nr, 0]);
  batch.add(leather, rbox(0.152, 0.003, 0.212, 0.0015), [nx, 0.0175, nz], [0, nr, 0]);
  const off = (dx: number, dz: number): [number, number] => [nx + dx * Math.cos(nr) + dz * Math.sin(nr), nz - dx * Math.sin(nr) + dz * Math.cos(nr)];
  const [ex, ez] = off(0.05, 0);
  batch.add(steel, new THREE.BoxGeometry(0.008, 0.0005, 0.213), [ex, 0.0193, ez], [0, nr, 0]);
  const [rx, rz] = off(-0.02, 0.115);
  batch.add(std({ color: 0xb3261e, roughness: 0.8 }), new THREE.BoxGeometry(0.006, 0.0006, 0.03), [rx, 0.009, rz], [0, nr, 0]);
  const penBody = std({ color: 0x14213d, roughness: 0.2, metalness: 0.3 });
  const brass = std({ color: 0xd9a441, roughness: 0.25, metalness: 0.95 });
  const pr = nr + 1.15, [px, pz] = off(-0.01, -0.01);
  batch.add(penBody, new THREE.CylinderGeometry(0.0055, 0.005, 0.13, 16), [px, 0.0245, pz], [Math.PI / 2, pr, 0]);
  batch.add(brass, new THREE.CylinderGeometry(0.0057, 0.0057, 0.006, 16), [px + Math.sin(pr) * 0.02, 0.0245, pz + Math.cos(pr) * 0.02], [Math.PI / 2, pr, 0]);
  batch.add(brass, new THREE.ConeGeometry(0.005, 0.016, 12), [px + Math.sin(pr) * 0.073, 0.0245, pz + Math.cos(pr) * 0.073], [Math.PI / 2, pr, 0]);
  batch.add(brass, new THREE.BoxGeometry(0.0025, 0.0015, 0.04), [px - Math.sin(pr) * 0.04, 0.0305, pz - Math.cos(pr) * 0.04], [0, pr, 0]);

  // 笔筒：深色木筒，插着两支毛笔和两支铅笔
  const bx = -1.03, bz = -0.3;
  const cupWood = std({ roughness: 0.5, map: bin.add(canvasTex(256, 128, (g, w, h) => woodGrain(g, 0, 0, w, h, '#4a2c1a', '15,8,4', 31, 90))) });
  batch.add(cupWood, new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.105], [0.04, 0.108], [0.036, 0.108], [0.036, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)), 32), [bx, 0, bz]);
  const bamboo = std({ color: 0xc9a66b, roughness: 0.5 });
  const hair = std({ color: 0x2a221c, roughness: 0.9 });
  const tip = std({ color: 0xe9e2d0, roughness: 0.9 });
  // 沿着倾斜后的笔杆方向走 k 米（和 place() 的 YXZ 旋转一致）
  const along = (dx: number, dz: number, tx: number, tz: number, k: number): [number, number, number] =>
    [bx + dx - Math.sin(tz) * k, 0.012 + Math.cos(tz) * Math.cos(tx) * k, bz + dz + Math.cos(tz) * Math.sin(tx) * k];
  const brush = (dx: number, dz: number, tx: number, tz: number, len: number) => {
    const p = (k: number) => along(dx, dz, tx, tz, k);
    batch.add(bamboo, new THREE.CylinderGeometry(0.0038, 0.0038, len, 10), p(len / 2), [tx, 0, tz]);
    batch.add(tip, new THREE.CylinderGeometry(0.0044, 0.0044, 0.012, 10), p(len + 0.006), [tx, 0, tz]);
    batch.add(hair, new THREE.ConeGeometry(0.0062, 0.036, 12), p(len + 0.03), [tx, 0, tz]);
  };
  brush(-0.012, 0.008, 0.1, 0.12, 0.17);
  brush(0.014, -0.008, -0.08, -0.14, 0.15);
  const pencil = (dx: number, dz: number, tx: number, tz: number, color: number) => {
    const p = (k: number) => along(dx, dz, tx, tz, k);
    batch.add(std({ color, roughness: 0.45 }), new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, 6), p(0.075), [tx, 0, tz]);
    batch.add(std({ color: 0xe8a0a0, roughness: 0.8 }), new THREE.CylinderGeometry(0.0036, 0.0036, 0.01, 8), p(0.156), [tx, 0, tz]);
  };
  pencil(0.004, 0.018, 0.16, -0.05, 0xe0b23a);
  pencil(-0.006, -0.018, -0.17, 0.06, 0x3b6ea5);

  // 接触阴影
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);
  const blobs: [number, number, number, number][] = [
    [kx, kz, 0.19, 0.075], [0.3, 0.25, 0.045, 0.065], [mx, mz, 0.075, 0.075], [nx, nz, 0.11, 0.14], [bx, bz, 0.065, 0.065],
  ];
  blobs.forEach(([x, z, a, b], i) => batch.add(contact, blob(a, b), [x, 0.0046 + i * 0.0001, z]));

  batch.build(group, bin, { cast: high, receive: high, noCast: [contact, felt] });

  // 咖啡的热气
  const steamTex = bin.add(canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }));
  const steam = Array.from({ length: high ? 5 : 3 }, (_, i) => {
    const mat = bin.add(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false, color: 0xfff3e2 }));
    const s = new THREE.Sprite(mat);
    group.add(s);
    return { s, mat, life: i / 5, seed: i * 1.7 };
  });

  scene.add(group);
  return {
    frame(dt, t) {
      for (const p of steam) {
        p.life = (p.life + dt * 0.22) % 1;
        const k = p.life;
        p.s.position.set(mx + Math.sin(p.seed + k * 4 + t * 0.3) * 0.012 * (1 + k * 2), 0.1 + k * 0.16, mz + Math.cos(p.seed * 2 + k * 3) * 0.01);
        p.s.scale.set(0.03 + k * 0.05, 0.05 + k * 0.07, 1);
        p.mat.opacity = Math.sin(k * Math.PI) * 0.22;
      }
    },
    stop() { scene.remove(group); keys.dispose(); bin.dispose(); },
  };
};
