import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { canvasTex, rng } from '../util';

/** 阳光里慢慢飘的浮尘。 */
export const dust: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const n = tier === 'high' ? 260 : 110, r = rng(17);
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  // 不让浮尘飘到镜头跟前：太近的一粒会变成一个大光斑
  const box = { x: 1.25, y0: 0.08, y1: 1.7, z0: -1.0, z1: 0.7 };
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() * 2 - 1) * box.x; pos[i * 3 + 1] = box.y0 + r() * (box.y1 - box.y0); pos[i * 3 + 2] = box.z0 + r() * (box.z1 - box.z0);
    seed[i] = r() * 100;
  }
  const geo = bin.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = bin.add(new THREE.PointsMaterial({
    size: 0.008, sizeAttenuation: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd7a6,
    map: bin.add(canvasTex(32, 32, (g) => {
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    })),
  }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    frame(dt, t) {
      for (let i = 0; i < n; i++) {
        const s = seed[i], k = i * 3;
        pos[k] += Math.sin(t * 0.21 + s) * 0.012 * dt + 0.004 * dt;
        pos[k + 1] += (Math.sin(t * 0.33 + s * 1.7) * 0.014 - 0.003) * dt;
        pos[k + 2] += Math.cos(t * 0.19 + s * 0.6) * 0.012 * dt;
        if (pos[k] > box.x) pos[k] = -box.x;
        if (pos[k + 1] < box.y0) pos[k + 1] = box.y1;
      }
      geo.attributes.position.needsUpdate = true;
    },
    stop() { scene.remove(points); bin.dispose(); },
  };
};
