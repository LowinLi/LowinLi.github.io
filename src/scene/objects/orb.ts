import * as THREE from 'three';
import type { SceneObject } from '../types';

/** 示例物件：一个随指针倾斜、随滚动下沉的程序化球体。用来验证接口和降级，可删。 */
export const orb: SceneObject = ({ scene, tier }) => {
  const detail = tier === 'high' ? 64 : 24;
  const geo = new THREE.IcosahedronGeometry(1, Math.floor(detail / 16));
  const mat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.35, metalness: 0.1, flatShading: tier === 'mid' });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  let tx = 0, ty = 0, sink = 0;
  return {
    frame(dt, t) {
      mesh.rotation.y += dt * 0.3;
      mesh.rotation.x += ((ty * 0.4) - mesh.rotation.x) * Math.min(1, dt * 4);
      mesh.rotation.z += ((-tx * 0.4) - mesh.rotation.z) * Math.min(1, dt * 4);
      mesh.position.y = Math.sin(t * 0.8) * 0.05 - sink;
    },
    input(e) {
      if (e.type === 'pointer') { tx = e.x; ty = e.y; }
      if (e.type === 'scroll') sink = e.progress * 1.5;
    },
    stop() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
};
