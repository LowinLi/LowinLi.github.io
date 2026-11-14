import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, type SceneObject } from '../types';

const WHITE = [0.96, 0.95, 0.93], GREY = [0.72, 0.75, 0.8], BLACK = [0.12, 0.12, 0.14], YELLOW = [0.95, 0.7, 0.2];
const paint = (g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number[]) => {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(fn(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
};
/** 一段翅膀：从原点向 side*x 伸出 len，翼弦从 c0 收到 c1，前缘略后掠 */
const wingGeo = (side: number, len: number, c0: number, c1: number, sweep: number, color: (t: number) => number[]) => {
  const n = 5, pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = side * len * t, c = c0 + (c1 - c0) * t, z = -sweep * t, y = Math.sin(t * Math.PI) * 0.012;
    pos.push(x, y, z + c * 0.4, x, y, z - c * 0.6);
    col.push(...color(t), ...color(t));
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** 窗外时不时飞过的海鸥：有头、喙、尾羽，翅膀分内外两段，扑几下再滑翔一段。 */
export const gulls: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const mat = bin.add(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  // 身体：纺锤形躯干 + 头 + 黄喙 + 扇形尾羽，合成一个网格。头朝 +z
  const torso = new THREE.SphereGeometry(1, 12, 8).scale(0.06, 0.055, 0.2);
  const tp = torso.attributes.position;
  for (let i = 0; i < tp.count; i++) { const z = tp.getZ(i); if (z < 0) { const k = 1 + (z / 0.2) * 0.55; tp.setX(i, tp.getX(i) * k); tp.setY(i, tp.getY(i) * k); } }
  const head = new THREE.SphereGeometry(0.042, 10, 8).translate(0, 0.022, 0.2);
  const beak = new THREE.ConeGeometry(0.012, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0.016, 0.265);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 0.06, 0, -0.3, -0.06, 0, -0.3], 3));
  tail.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  tail.computeVertexNormals();
  const parts = [paint(torso, () => WHITE), paint(head, () => WHITE), paint(beak, () => YELLOW), paint(tail, (_x, _y, z) => (z < -0.25 ? GREY : WHITE))]
    .map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
  const bodyGeo = bin.add(mergeGeometries(parts));
  [torso, head, beak, tail, ...parts].forEach((g) => g.dispose());

  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
  const inner = [1, -1].map((s) => bin.add(wingGeo(s, 0.3, 0.16, 0.13, 0.02, () => GREY)));
  const outer = [1, -1].map((s) => bin.add(wingGeo(s, 0.36, 0.13, 0.02, 0.1, (t) => mix(GREY, BLACK, Math.pow(t, 1.5)))));

  type Gull = { root: THREE.Group; wings: { a: THREE.Group; b: THREE.Mesh; s: number }[]; active: boolean; dir: number; speed: number; y: number; phase: number; wait: number };
  const birds: Gull[] = Array.from({ length: tier === 'high' ? 4 : 2 }, (_, i) => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(bodyGeo, mat));
    const wings = [0, 1].map((k) => {
      const s = k ? -1 : 1;
      const a = new THREE.Group(); a.position.set(s * 0.04, 0.02, 0.03);
      a.add(new THREE.Mesh(inner[k], mat));
      const b = new THREE.Mesh(outer[k], mat); b.position.set(s * 0.3, 0, -0.02);
      a.add(b); root.add(a);
      return { a, b, s };
    });
    root.visible = false;
    group.add(root);
    return { root, wings, active: false, dir: 1, speed: 3, y: 1, phase: i * 2, wait: 1.5 + i * 6 };
  });
  scene.add(group);

  const launch = (b: Gull) => {
    b.active = true; b.root.visible = true;
    b.dir = Math.random() < 0.5 ? 1 : -1;
    b.speed = 2.6 + Math.random() * 1.8;
    b.y = 0.9 + Math.random() * 1.6;
    b.root.position.set(-b.dir * (8 + Math.random() * 3), b.y, -5 - Math.random() * 9);
    b.root.rotation.y = b.dir * Math.PI / 2;
    b.root.scale.setScalar(1.2 + Math.random() * 0.5);
  };
  return {
    frame(dt, t) {
      for (const b of birds) {
        if (!b.active) { b.wait -= dt; if (b.wait <= 0) launch(b); continue; }
        b.phase += dt * 7.5;
        // 扑几下，滑一段：滑翔时翅膀平展略上扬，翼尖下垂
        const glide = Math.sin(t * 0.55 + b.y * 3) > 0.35;
        const up = glide ? 0.16 : Math.sin(b.phase) * 0.6;
        const tip = glide ? -0.22 : Math.sin(b.phase - 1.0) * 0.55 - 0.15;
        for (const w of b.wings) { w.a.rotation.z = w.s * up; w.b.rotation.z = w.s * tip; }
        b.root.position.x += b.dir * b.speed * dt;
        b.root.position.y = b.y + Math.sin(t * 0.8 + b.speed) * 0.18 + (glide ? 0 : Math.sin(b.phase) * -0.02);
        b.root.rotation.z = Math.sin(t * 0.6 + b.y) * 0.14;
        if (Math.abs(b.root.position.x) > 13) { b.active = false; b.root.visible = false; b.wait = 5 + Math.random() * 11; }
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
