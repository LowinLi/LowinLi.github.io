import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, type SceneObject } from '../types';
import { L, SUN_LIGHT_DIR } from '../layout';

/** 房间：带大窗的墙、木地板、现代书桌、键盘鼠标杯子，以及晨光。 */
export const room: SceneObject = ({ scene, renderer, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const mat = (color: number, rough = 0.8, metal = 0) => bin.add(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  // 静态盒子先攒起来，最后按材质合并成一个网格，省 draw call
  const batches = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const b = batches.get(m) ?? { geos: [], shadow };
    b.geos.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    batches.set(m, b);
  };

  // 环境反射，让金属和釉面有东西可映
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = bin.add(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  // 墙：四块围出窗洞，这样阳光只从窗户进来
  const { win, wallZ, floorY } = L;
  const wall = mat(0xd9d2c6, 0.95);
  const top = 2.7, th = 0.16, zc = wallZ - th / 2;
  box(5, top - floorY, th, wall, win.x0 - 2.5, (top + floorY) / 2, zc);
  box(5, top - floorY, th, wall, win.x1 + 2.5, (top + floorY) / 2, zc);
  box(win.x1 - win.x0, win.y0 - floorY, th, wall, 0, (win.y0 + floorY) / 2, zc);
  box(win.x1 - win.x0, top - win.y1, th, wall, 0, (top + win.y1) / 2, zc);
  // 窗框和窗台
  const frame = mat(0x2b2d31, 0.5, 0.6);
  const fw = 0.035, wy = (win.y0 + win.y1) / 2, wh = win.y1 - win.y0, ww = win.x1 - win.x0;
  box(ww, fw, 0.07, frame, 0, win.y1 - fw / 2, wallZ - 0.06);
  box(ww, fw, 0.07, frame, 0, win.y0 + fw / 2, wallZ - 0.06);
  for (const x of [win.x0 + fw / 2, -0.52, 0.52, win.x1 - fw / 2]) box(fw, wh, 0.07, frame, x, wy, wallZ - 0.06);
  box(ww + 0.1, 0.03, 0.22, mat(0xf4f0e8, 0.6), 0, win.y0 - 0.015, wallZ + 0.05);

  // 地板
  box(14, 0.1, 9, mat(0xa98663, 0.55), 0, floorY - 0.05, 1.5, false);
  box(3.2, 0.012, 2.2, mat(0xd8d2c6, 1), 0, floorY + 0.006, 0.9, false); // 地毯

  // 书桌：浅色橡木台面 + 黑色钢架
  const { desk } = L;
  box(desk.w, desk.t, desk.d, mat(0xd9bf9a, 0.5), 0, -desk.t / 2, 0);
  const steel = mat(0x1d1e20, 0.45, 0.7);
  for (const x of [-desk.w / 2 + 0.12, desk.w / 2 - 0.12]) {
    for (const z of [-desk.d / 2 + 0.08, desk.d / 2 - 0.08]) box(0.035, -floorY - desk.t, 0.035, steel, x, (floorY - desk.t) / 2, z);
    box(0.035, 0.035, desk.d - 0.16, steel, x, floorY + 0.02, 0);
  }

  // 键盘、鼠标、杯子
  const alu = mat(0xc9ccd1, 0.35, 0.6);
  box(0.44, 0.012, 0.14, alu, 0, 0.006, 0.2);
  const keys = bin.add(new THREE.MeshStandardMaterial({ color: 0xf3f3f1, roughness: 0.6 }));
  const keyGeo = bin.add(new THREE.BoxGeometry(0.024, 0.006, 0.022));
  const keyMesh = new THREE.InstancedMesh(keyGeo, keys, 15 * 4);
  const m4 = new THREE.Matrix4();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) keyMesh.setMatrixAt(r * 15 + c, m4.makeTranslation(-0.196 + c * 0.028, 0.015, 0.155 + r * 0.03));
  group.add(keyMesh);
  const mouse = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.032, 16, 10)), mat(0xf3f3f1, 0.4));
  mouse.scale.set(1, 0.55, 1.6); mouse.position.set(0.36, 0.012, 0.22); mouse.castShadow = high;
  group.add(mouse);
  const mug = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.042, 0.036, 0.09, 24)), mat(0xf7f4ee, 0.25));
  mug.position.set(-0.46, 0.045, 0.28); mug.castShadow = high;
  const coffee = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.037, 24)), mat(0x2a1a10, 0.3));
  coffee.rotation.x = -Math.PI / 2; coffee.position.set(-0.46, 0.086, 0.28);
  const handle = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.026, 0.007, 8, 16, Math.PI)), mug.material);
  handle.rotation.z = -Math.PI / 2; handle.position.set(-0.418, 0.047, 0.28);
  group.add(mug, coffee, handle);

  // 光：朝阳从窗外斜照进来，冷色天光补暗部，身后一点暖色补光
  const sun = new THREE.DirectionalLight(0xffc48a, 3.4);
  sun.position.copy(SUN_LIGHT_DIR).multiplyScalar(14);
  sun.target.position.set(0, 0, 0);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -3.2; c.right = 3.2; c.top = 3; c.bottom = -2.5; c.near = 1; c.far = 30;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  }
  const hemi = new THREE.HemisphereLight(0xc9d8ff, 0x6b5846, 0.6);
  const fill = new THREE.PointLight(0xffe2c4, 1.1, 8, 1.2);
  fill.position.set(0.4, 1.5, 2.6);
  group.add(sun, sun.target, hemi, fill);

  for (const [m, b] of batches) {
    const mesh = new THREE.Mesh(bin.add(mergeGeometries(b.geos)), m);
    b.geos.forEach((g) => g.dispose());
    mesh.castShadow = high && b.shadow; mesh.receiveShadow = high;
    group.add(mesh);
  }
  scene.add(group);
  return {
    frame() {},
    stop() {
      scene.remove(group);
      scene.environment = null;
      keyMesh.dispose();
      bin.dispose();
    },
  };
};
