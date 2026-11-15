import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';

/** 给几何体整体上一个顶点色，朝上的面亮一些（屋外的东西不吃室内灯光） */
const paint = (g: THREE.BufferGeometry, hex: number) => {
  const n = g.attributes.normal, c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length / 3; i++) { const s = 0.66 + 0.34 * Math.max(n.getY(i), 0) + 0.1 * Math.abs(n.getX(i)); a[i * 3] = c.r * s; a[i * 3 + 1] = c.g * s; a[i * 3 + 2] = c.b * s; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  return out;
};
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g; };

interface Spec { len: number; legLen: number; bodyR: number; headR: number; coat: number; belly: number; ear: number; nose: number; kind: 'cat' | 'dog'; speed: number }

/**
 * 时不时从菜园里走过的一只橘猫和一条黄狗：四条腿交替迈步，尾巴摆动，走到半路会停下来站一会儿。
 * 大多数时候走菜园中间那条横路（坐在桌前就能看到），猫偶尔会贴着窗根走。
 */
export const animals: SceneObject = ({ scene }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const mat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const gy = L.groundY;

  const build = (s: Spec) => {
    const root = new THREE.Group(), by = s.legLen + s.bodyR * 0.85;
    // 躯干、头、口鼻、耳朵合成一个网格。头朝 +z
    const torso = paint(new THREE.SphereGeometry(1, 10, 8).scale(s.bodyR * 0.8, s.bodyR, s.len / 2).translate(0, by, 0), s.coat);
    const chest = paint(new THREE.SphereGeometry(s.bodyR * 0.62, 8, 6).translate(0, by - s.bodyR * 0.25, s.len * 0.3), s.belly);
    const hz = s.len / 2 + s.headR * 0.55, hy = by + s.bodyR * (s.kind === 'cat' ? 0.55 : 0.75);
    const head = paint(new THREE.SphereGeometry(s.headR, 10, 8).translate(0, hy, hz), s.coat);
    const snoutLen = s.kind === 'dog' ? s.headR * 1.0 : s.headR * 0.45;
    const snout = paint(new THREE.SphereGeometry(s.headR * 0.55, 8, 6).scale(1, 0.8, snoutLen / (s.headR * 0.55)).translate(0, hy - s.headR * 0.25, hz + s.headR * 0.7), s.belly);
    const nose = paint(new THREE.SphereGeometry(s.headR * 0.14, 6, 5).translate(0, hy - s.headR * 0.18, hz + s.headR * 0.7 + snoutLen * 0.9), s.nose);
    const ears = [-1, 1].map((k) => {
      const g = s.kind === 'cat'
        ? new THREE.ConeGeometry(s.headR * 0.38, s.headR * 0.7, 4).translate(k * s.headR * 0.55, hy + s.headR * 0.95, hz - s.headR * 0.1)
        : new THREE.SphereGeometry(s.headR * 0.42, 6, 5).scale(0.5, 1.2, 0.9).translate(k * s.headR * 0.85, hy + s.headR * 0.35, hz - s.headR * 0.2); // 耷拉的耳朵
      return paint(g, s.ear);
    });
    root.add(new THREE.Mesh(bin.add(merge([torso, chest, head, snout, nose, ...ears])), mat));
    // 四条腿：各自绕髋部摆动
    const legGeo = bin.add(merge([
      paint(new THREE.CylinderGeometry(s.bodyR * 0.24, s.bodyR * 0.18, s.legLen, 6).translate(0, -s.legLen / 2, 0), s.coat),
      paint(new THREE.SphereGeometry(s.bodyR * 0.24, 6, 5).scale(1, 0.6, 1.3).translate(0, -s.legLen + s.bodyR * 0.08, s.bodyR * 0.08), s.belly),
    ]));
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const m = new THREE.Mesh(legGeo, mat);
      m.position.set(sx * s.bodyR * 0.42, s.legLen + s.bodyR * 0.1, sz * s.len * 0.3);
      root.add(m);
      return { m, phase: sx * sz > 0 ? 0 : Math.PI }; // 对角的两条腿同步
    });
    // 尾巴：猫的又长又翘，狗的短而上卷
    const tailLen = s.kind === 'cat' ? s.len * 0.85 : s.len * 0.5;
    const curve = new THREE.CatmullRomCurve3(s.kind === 'cat'
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, tailLen * 0.35, -tailLen * 0.3), new THREE.Vector3(0, tailLen * 0.8, -tailLen * 0.35), new THREE.Vector3(0, tailLen, -tailLen * 0.15)]
      : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, tailLen * 0.5, -tailLen * 0.4), new THREE.Vector3(0, tailLen * 0.9, -tailLen * 0.15), new THREE.Vector3(0, tailLen * 0.8, tailLen * 0.2)]);
    const tail = new THREE.Mesh(bin.add(paint(new THREE.TubeGeometry(curve, 10, s.bodyR * 0.16, 6), s.coat)), mat);
    tail.position.set(0, by + s.bodyR * 0.4, -s.len / 2 + s.bodyR * 0.2);
    root.add(tail);
    root.visible = false;
    group.add(root);
    return { root, legs, tail, spec: s, state: 'wait' as 'wait' | 'walk' | 'pause', timer: 0, dir: 1, z: -8.2, pauseAt: 0, paused: false, phase: 0, stride: 0 };
  };
  const cat = build({ kind: 'cat', len: 0.42, legLen: 0.16, bodyR: 0.09, headR: 0.075, coat: 0xd98a3a, belly: 0xf3ead8, ear: 0xc9772c, nose: 0xd98a8a, speed: 0.85 });
  const dog = build({ kind: 'dog', len: 0.62, legLen: 0.3, bodyR: 0.14, headR: 0.11, coat: 0xc9a15a, belly: 0xe6d3a4, ear: 0x8f6a34, nose: 0x1c1a18, speed: 1.25 });
  cat.timer = 3; dog.timer = 14;
  group.traverse((o) => { o.userData.noAO = true; });
  scene.add(group);

  const EDGE = 9.6;
  return {
    frame(dt, t) {
      for (const a of [cat, dog]) {
        if (a.state === 'wait') {
          a.timer -= dt;
          if (a.timer > 0) continue;
          a.state = 'walk'; a.dir = Math.random() < 0.5 ? 1 : -1; a.paused = false;
          // 猫有时贴着窗根走；其余时候都走菜园中间的横路
          a.z = a.spec.kind === 'cat' && Math.random() < 0.3 ? -2.5 : -8.2 + (Math.random() - 0.5) * 0.3;
          a.pauseAt = (Math.random() - 0.5) * 5;
          a.root.position.set(-a.dir * EDGE, gy, a.z);
          a.root.rotation.y = a.dir * Math.PI / 2;
          a.root.visible = true;
        }
        const moving = a.state === 'walk';
        a.stride += ((moving ? 1 : 0) - a.stride) * Math.min(1, dt * 6);
        if (moving) {
          a.root.position.x += a.dir * a.spec.speed * dt;
          a.phase += dt * a.spec.speed * (a.spec.kind === 'cat' ? 16 : 11);
          if (!a.paused && (a.root.position.x - a.pauseAt) * a.dir > 0) { a.paused = true; a.state = 'pause'; a.timer = 2 + Math.random() * 2.5; }
          if (Math.abs(a.root.position.x) > EDGE) { a.state = 'wait'; a.root.visible = false; a.timer = 9 + Math.random() * 14; }
        } else if (a.state === 'pause') {
          a.timer -= dt;
          // 停下来的时候朝屋子这边看一眼
          a.root.rotation.y += ((a.dir * Math.PI / 2) * 0.55 - a.root.rotation.y) * Math.min(1, dt * 2);
          if (a.timer <= 0) a.state = 'walk';
        }
        if (a.state === 'walk') a.root.rotation.y += (a.dir * Math.PI / 2 - a.root.rotation.y) * Math.min(1, dt * 4);
        for (const l of a.legs) l.m.rotation.x = Math.sin(a.phase + l.phase) * 0.55 * a.stride;
        a.root.position.y = gy + Math.abs(Math.sin(a.phase)) * 0.008 * a.stride;
        a.tail.rotation.z = Math.sin(t * (a.spec.kind === 'dog' ? 7 : 2.2) + a.spec.len * 9) * (a.spec.kind === 'dog' ? 0.45 : 0.25);
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
