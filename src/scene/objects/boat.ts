import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';

/** 远处海面上一艘慢慢驶过的帆船，逆光下只是个暖色的剪影。 */
export const boat: SceneObject = ({ scene }) => {
  const bin = new Bin();
  const root = new THREE.Group();
  const hullMat = bin.add(new THREE.MeshBasicMaterial({ color: 0x2b2733 }));
  const sailMat = bin.add(new THREE.MeshBasicMaterial({ color: 0xffd9b0, side: THREE.DoubleSide }));
  const tri = (pts: number[]) => { const g = bin.add(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g; };
  // 船身：两头收尖的梯形
  root.add(new THREE.Mesh(tri([-4.6, 1.1, 0, 5.2, 1.3, 0, 3.6, 0, 0,  -4.6, 1.1, 0, 3.6, 0, 0, -3.4, 0, 0]), hullMat));
  root.add(new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.12, 12, 0.12)), hullMat)).position.set(0.3, 7, 0);
  root.add(new THREE.Mesh(tri([0.1, 2, 0, 0.1, 12.6, 0, -4.2, 2, 0]), sailMat));   // 主帆
  root.add(new THREE.Mesh(tri([0.6, 2.2, 0, 0.6, 11.5, 0, 5, 1.8, 0]), sailMat));  // 前帆
  root.position.set(-34, L.seaY - 0.3, -250);
  scene.add(root);
  return {
    frame(dt, t) {
      root.position.x += dt * 0.35;
      if (root.position.x > 70) root.position.x = -70;
      root.rotation.z = Math.sin(t * 0.7) * 0.03;
      root.position.y = L.seaY - 0.3 + Math.sin(t * 0.9) * 0.12;
    },
    stop() { scene.remove(root); bin.dispose(); },
  };
};
