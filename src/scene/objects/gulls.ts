import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';

/** 窗外时不时飞过的海鸥：扑几下翅膀，滑翔一段。 */
export const gulls: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const white = bin.add(new THREE.MeshLambertMaterial({ color: 0xf4f1ec, side: THREE.DoubleSide }));
  const bodyGeo = bin.add(new THREE.SphereGeometry(1, 8, 6)); bodyGeo.scale(0.07, 0.06, 0.26);
  const wingGeo = bin.add(new THREE.BufferGeometry());
  // 翅根在原点，向 +x 伸出，中间折一下
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.09, 0, 0, 0.09, 0.3, 0.03, 0.05,   0, 0, -0.09, 0.3, 0.03, 0.05, 0.3, 0.03, -0.06,
    0.3, 0.03, -0.06, 0.3, 0.03, 0.05, 0.62, 0, -0.04,
  ], 3));
  wingGeo.computeVertexNormals();

  type Gull = { root: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; active: boolean; dir: number; speed: number; y: number; phase: number; wait: number };
  const birds: Gull[] = Array.from({ length: tier === 'high' ? 4 : 2 }, (_, i) => {
    const root = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, white), r = new THREE.Mesh(wingGeo, white);
    r.scale.x = -1;
    root.add(new THREE.Mesh(bodyGeo, white), l, r);
    root.visible = false;
    group.add(root);
    return { root, l, r, active: false, dir: 1, speed: 3, y: 1, phase: i * 2, wait: 1.5 + i * 7 };
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
        b.phase += dt * 7;
        // 扑几下，滑一段
        const glide = Math.sin(t * 0.55 + b.y * 3) > 0.35;
        const flap = glide ? 0.12 + Math.sin(b.phase * 0.25) * 0.05 : Math.sin(b.phase) * 0.6;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
        b.root.position.x += b.dir * b.speed * dt;
        b.root.position.y = b.y + Math.sin(t * 0.8 + b.speed) * 0.18;
        b.root.rotation.z = Math.sin(t * 0.6 + b.y) * 0.12;
        if (Math.abs(b.root.position.x) > 13) { b.active = false; b.root.visible = false; b.wait = 5 + Math.random() * 11; }
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
