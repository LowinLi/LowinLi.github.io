import * as THREE from 'three';
import { on, type SceneObject } from '../types';
import { LAYOUT, tvScreenCenter } from '../layout';
import { damp } from '../tween';

/** 相机：默认俯看书桌，指针带一点视差；播放磁带时推近到屏幕。 */
export const cameraRig: SceneObject = ({ camera, bus }) => {
  const look = new THREE.Vector3(...LAYOUT.camHome.look);
  const pos = new THREE.Vector3(...LAYOUT.camHome.pos);
  let px = 0, py = 0, focus = 0, focusTarget = 0, aspect = camera.aspect;
  const sc = tvScreenCenter();
  const off = on<{ playing: string | null }>(bus, 'tape:state', ({ playing }) => { focusTarget = playing ? 1 : 0; });

  const homePos = new THREE.Vector3(), homeLook = new THREE.Vector3();
  const tvLook = new THREE.Vector3(sc.x - 0.07, sc.y, sc.z);
  const tvPos = new THREE.Vector3();
  return {
    frame(dt) {
      focus = damp(focus, focusTarget, 4, dt);
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      if (aspect >= 1.1) {
        // 偏窄的横屏（如 1024）往后退，保证台灯到磁带都在画面里
        const z = Math.max(pos.z, 1.3 / (Math.tan(vfov / 2) * aspect));
        homePos.set(pos.x + px * 0.25, pos.y + py * 0.12 + (z - pos.z) * 0.2, z);
        homeLook.copy(look);
      } else {
        // 竖屏：从更高处往下看，让桌面填满纵向空间；横向只保证电视 + 磁带在画面内
        // 注视点放在桌子后上方，桌子前沿落在画面下部、窗户在上部
        const tan = Math.tan(vfov / 2);
        const dist = Math.max(0.82 / (tan * aspect), 1.5 / tan);
        const tilt = THREE.MathUtils.degToRad(30);
        homeLook.set(-0.02, 0.75, -0.3);
        homePos.set(homeLook.x + px * 0.1, homeLook.y + Math.sin(tilt) * dist, homeLook.z + Math.cos(tilt) * dist);
      }
      // 屏幕填满约 85% 的较短边
      const fitH = 0.5 / 0.85, fitW = 0.66 / 0.85 / aspect;
      const dist = Math.max(fitH, fitW) / 2 / Math.tan(vfov / 2);
      tvPos.set(tvLook.x + px * 0.03, tvLook.y + py * 0.02, tvLook.z + dist);
      camera.position.lerpVectors(homePos, tvPos, focus);
      camera.lookAt(new THREE.Vector3().lerpVectors(homeLook, tvLook, focus));
    },
    input(e) {
      if (e.type === 'pointer') { px = damp(px, e.x, 1, 1); py = damp(py, e.y, 1, 1); }
      if (e.type === 'resize') aspect = e.width / Math.max(1, e.height);
    },
    stop() { off(); },
  };
};
