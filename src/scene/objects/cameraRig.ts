import * as THREE from 'three';
import { on, type SceneObject } from '../types';
import { L, SUN_DIR } from '../layout';
import { damp } from '../tween';

/**
 * 相机。home：坐在桌前看向窗外，指针带视差；monitor：推近到显示器；book：稍微靠向书架；window：走到窗前看海。
 * 竖屏放不下整张桌子，改成左右拖动平移。
 */
export const cameraRig: SceneObject = ({ camera, bus }) => {
  let mode: 'home' | 'monitor' | 'book' | 'window' = 'home';
  let px = 0, py = 0, pan = -0.22, aspect = camera.aspect, first = true;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const tp = new THREE.Vector3(), tl = new THREE.Vector3();
  const off = [
    on(bus, 'monitor:focus', () => { mode = 'monitor'; }),
    on(bus, 'monitor:blur', () => { if (mode === 'monitor') mode = 'home'; }),
    on(bus, 'book:open', () => { mode = 'book'; }),
    on(bus, 'book:close', () => { if (mode === 'book') mode = 'home'; }),
    on(bus, 'window:focus', () => { mode = 'window'; }),
    on(bus, 'window:blur', () => { if (mode === 'window') mode = 'home'; }),
  ];
  return {
    frame(dt) {
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const m = L.monitor;
      if (mode === 'window') {
        // 走到窗前，朝着日出的方向看海；指针可以带着视线左右、上下看一点
        tp.set(px * 0.1, 0.92 + py * 0.04, L.wallZ + 0.2);
        tl.set(tp.x + SUN_DIR.x * 10 + px * 1.8, tp.y - 0.35 + py * 0.9, tp.z + SUN_DIR.z * 10);
      } else if (mode === 'monitor') {
        const dist = Math.max(m.h / 0.78, m.w / 0.92 / aspect) / 2 / tan;
        tl.set(m.x, m.cy, m.z);
        tp.set(m.x + px * 0.02, m.cy + py * 0.015, m.z + 0.02 + dist);
      } else if (aspect >= 1.1) {
        // 横屏：保证整张桌子都在画面里
        const z = Math.max(L.cam.pos[2], m.z + 1.22 / (tan * aspect));
        tp.set(L.cam.pos[0] + px * 0.22, L.cam.pos[1] + py * 0.08 + (z - L.cam.pos[2]) * 0.1, z);
        tl.set(L.cam.look[0] + px * 0.04, L.cam.look[1], L.cam.look[2]);
      } else {
        const dist = Math.min(0.64 / (tan * aspect), 4.6);
        tp.set(pan, 1.02, m.z + dist);
        tl.set(pan, 0.62, m.z);
      }
      if (mode === 'book') { tp.lerp(new THREE.Vector3(-0.7, 0.5, 1.5), 0.3); tl.lerp(new THREE.Vector3(-0.7, 0.15, L.books.z), 0.3); }
      if (first) { pos.copy(tp); look.copy(tl); first = false; }
      const k = mode === 'monitor' ? 4 : 3.2;
      pos.set(damp(pos.x, tp.x, k, dt), damp(pos.y, tp.y, k, dt), damp(pos.z, tp.z, k, dt));
      look.set(damp(look.x, tl.x, k, dt), damp(look.y, tl.y, k, dt), damp(look.z, tl.z, k, dt));
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    input(e) {
      if (e.type === 'pointer') { px = e.x; py = e.y; }
      if (e.type === 'drag') pan = THREE.MathUtils.clamp(pan - e.dx * 1.4, -0.8, 0.8);
      if (e.type === 'resize') aspect = e.width / Math.max(1, e.height);
    },
    stop() { off.forEach((f) => f()); },
  };
};
