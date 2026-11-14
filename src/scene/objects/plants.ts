import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';

/** 盆栽：桌上一盆阔叶、一盆多肉，地上一盆虎尾兰。点击会晃，悬停会轻轻动一下；平时有一点微风。 */
export const plants: SceneObject = ({ scene, tier, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const leafGeo = bin.add(new THREE.SphereGeometry(1, high ? 10 : 6, high ? 8 : 5));
  leafGeo.scale(0.34, 1, 0.06); leafGeo.translate(0, 1, 0); // 原点在叶柄
  const swordGeo = bin.add(new THREE.SphereGeometry(1, 6, 8));
  swordGeo.scale(0.13, 1, 0.03); swordGeo.translate(0, 1, 0);
  const fatGeo = bin.add(new THREE.SphereGeometry(1, 8, 6));
  fatGeo.scale(0.36, 1, 0.2); fatGeo.translate(0, 1, 0);
  const soil = bin.add(new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 1 }));
  const green = (c: number) => bin.add(new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }));

  type Leaf = { pivot: THREE.Group; tilt: number; w: number };
  type Plant = { top: THREE.Group; leaves: Leaf[]; ax: number; az: number; vx: number; vz: number; seed: number; stiff: number };
  const list: Plant[] = [];

  const make = (x: number, y: number, z: number, potR: number, potH: number, potColor: number, potRough: number, stiff: number) => {
    const root = new THREE.Group(); root.position.set(x, y, z);
    const pot = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(potR, potR * 0.78, potH, 28)), bin.add(new THREE.MeshStandardMaterial({ color: potColor, roughness: potRough })));
    pot.position.y = potH / 2; pot.castShadow = pot.receiveShadow = high;
    const dirt = new THREE.Mesh(bin.add(new THREE.CircleGeometry(potR * 0.94, 24)), soil);
    dirt.rotation.x = -Math.PI / 2; dirt.position.y = potH - 0.004;
    const top = new THREE.Group(); top.position.y = potH - 0.004;
    root.add(pot, dirt, top);
    group.add(root);
    const plant: Plant = { top, leaves: [], ax: 0, az: 0, vx: 0, vz: 0, seed: Math.random() * 10, stiff };
    const kick = (power: number) => { const a = Math.random() * Math.PI * 2; plant.vx += Math.cos(a) * power; plant.vz += Math.sin(a) * power; };
    pick(root, { click() { kick(7); }, hover(on) { if (on) kick(1.6); } });
    list.push(plant);
    return plant;
  };
  const leaf = (p: Plant, geo: THREE.BufferGeometry, mat: THREE.Material, yaw: number, tilt: number, size: number, y = 0) => {
    const yawG = new THREE.Group(); yawG.rotation.y = yaw; yawG.position.y = y;
    const pivot = new THREE.Group(); pivot.rotation.z = tilt;
    const mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(size); mesh.castShadow = high;
    pivot.add(mesh); yawG.add(pivot); p.top.add(yawG);
    p.leaves.push({ pivot, tilt, w: 0.6 + Math.random() * 0.8 });
  };

  // 1. 桌面左前：阔叶
  const a = make(-1.03, 0, 0.33, 0.07, 0.11, 0xf3efe8, 0.25, 55);
  const ga = [green(0x2f7d4a), green(0x3b9158), green(0x276b3f)];
  for (let i = 0; i < 11; i++) leaf(a, leafGeo, ga[i % 3], i * 2.4, 0.25 + (i / 11) * 0.75, 0.085 + ((i * 3) % 4) * 0.012, (i / 11) * 0.05);
  // 2. 显示器右边：多肉
  const b = make(0.44, 0, -0.3, 0.05, 0.06, 0xc8744e, 0.8, 110);
  const gb = [green(0x7fae8e), green(0x93bfa0)];
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 7 - ring * 2; i++) leaf(b, fatGeo, gb[(i + ring) % 2], i * (Math.PI * 2 / (7 - ring * 2)) + ring * 0.5, 1.05 - ring * 0.42, 0.034 - ring * 0.005, ring * 0.008);
  // 3. 地上：虎尾兰
  const c = make(1.62, L.floorY, -0.45, 0.2, 0.36, 0x3a3d42, 0.6, 38);
  const gc = [green(0x2c6a45), green(0x3f8452), green(0x24583a)];
  for (let i = 0; i < 12; i++) leaf(c, swordGeo, gc[i % 3], i * 2.4, 0.06 + ((i * 5) % 6) * 0.045, 0.34 + ((i * 7) % 5) * 0.045);

  scene.add(group);
  return {
    frame(dt, t) {
      for (const p of list) {
        // 阻尼弹簧
        p.vx += (-p.stiff * p.ax - 2.4 * p.vx) * dt; p.vz += (-p.stiff * p.az - 2.4 * p.vz) * dt;
        p.ax += p.vx * dt; p.az += p.vz * dt;
        const bx = p.ax + Math.sin(t * 0.9 + p.seed) * 0.012, bz = p.az + Math.cos(t * 0.7 + p.seed) * 0.012;
        p.top.rotation.z = bx * 0.25; p.top.rotation.x = bz * 0.25;
        for (const l of p.leaves) l.pivot.rotation.z = l.tilt + (bx + bz) * 0.22 * l.w + Math.sin(t * 1.3 + l.w * 9) * 0.008;
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
