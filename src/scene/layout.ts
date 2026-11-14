import * as THREE from 'three';

/** 场景里的关键坐标，物件之间共享。单位：米，桌面 y = 0，相机朝 -z 看向窗外。 */
export const L = {
  floorY: -0.75,
  desk: { w: 2.3, d: 1.0, t: 0.04 },
  wallZ: -1.15,
  win: { x0: -1.3, x1: 1.3, y0: 0.14, y1: 1.85 },
  monitor: { x: 0, z: -0.2, w: 0.64, h: 0.37, cy: 0.37 },
  books: { x0: -0.9, z: -0.27 },
  gramophone: { x: 0.8, z: -0.2 },
  discs: { x: 0.6, z: 0.27 },
  cam: { pos: [0, 0.86, 2.5], look: [0, 0.55, -0.2] },
  seaY: -7,
} as const;

/** 太阳方向：正好在海平线上（露出一半）。只略偏左：海平线比显示器上沿高，不会被挡住，竖屏时也能看到 */
export const SUN_DIR = new THREE.Vector3(-0.068, 0.0, -1).normalize();
/** 照进房间的光稍微抬高一点，让阳光能铺在桌面上 */
export const SUN_LIGHT_DIR = new THREE.Vector3(-0.12, 0.24, -1).normalize();
