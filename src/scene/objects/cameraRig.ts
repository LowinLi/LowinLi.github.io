import * as THREE from 'three';
import { on, type SceneObject } from '../types';
import { L, SUN_DIR } from '../layout';
import { damp } from '../tween';

const AZ_MAX = 1.1, EL_MIN = -0.07, EL_MAX = 0.8;

/**
 * 相机。
 * home：围着书桌的环绕视角——拖动旋转，滚轮 / 双指缩放（zoom 由 runtime 传进来），指针带一点视差。
 *       拉远时自动抬高一点，能俯看整间办公室；拉近时视线压低到桌面。
 * monitor：推近到显示器；book：稍微靠向书架；window：走到窗前看菜园。
 */
export const cameraRig: SceneObject = ({ camera, bus }) => {
  let mode: 'home' | 'monitor' | 'book' | 'window' | 'fridge' | 'shelf' = 'home';
  let px = 0, py = 0, aspect = camera.aspect, first = true;
  let az = 0, el = 0, zoom = 1;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const tp = new THREE.Vector3(), tl = new THREE.Vector3();
  const off = [
    on(bus, 'monitor:focus', () => { mode = 'monitor'; }),
    on(bus, 'monitor:blur', () => { if (mode === 'monitor') mode = 'home'; }),
    on(bus, 'book:open', () => { mode = 'book'; }),
    on(bus, 'book:close', () => { if (mode === 'book') mode = 'home'; }),
    on(bus, 'window:focus', () => { mode = 'window'; }),
    on(bus, 'window:blur', () => { if (mode === 'window') mode = 'home'; }),
    on(bus, 'fridge:open', () => { mode = 'fridge'; }),
    on(bus, 'fridge:close', () => { if (mode === 'fridge') mode = 'home'; }),
    on(bus, 'shelf:focus', () => { mode = 'shelf'; }),
    on(bus, 'shelf:blur', () => { if (mode === 'shelf') mode = 'home'; }),
    on(bus, 'view:reset', () => { az = 0; el = 0; }),
  ];
  const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
  return {
    frame(dt) {
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const m = L.monitor;
      if (mode === 'window') {
        // 走到窗前、探出窗外（越过窗棂，不让格子挡住视线），朝着日出的方向看；指针可以带着视线左右、上下看一点
        tp.set(px * 0.1, 0.92 + py * 0.04, L.wallZ - 0.32);
        tl.set(tp.x + SUN_DIR.x * 10 + px * 1.8, tp.y - 0.35 + py * 0.9, tp.z + SUN_DIR.z * 10);
      } else if (mode === 'fridge') {
        // 站到冰箱跟前，整台冰箱和左边的垃圾桶都在画面里；竖屏只顾冰箱
        const f = L.fridge, dist = Math.max(2.3, 0.45 / (tan * aspect));
        tl.set(f.x - 0.15 + px * 0.05, L.floorY + 0.7 + py * 0.04, f.z + 0.1);
        tp.set(f.x - 0.38, L.floorY + 1.05, f.z + f.d / 2 + dist);
      } else if (mode === 'shelf') {
        // 站到右墙边书架的正前方，对着书架上半截和顶上的两座奖杯（竖屏时退远一点，宽度放得下）
        // 竖屏放不下整个书架宽度：只框住顶上的奖杯和最上面一格，走近一点
        const S = L.trophyShelf, tall = aspect < 1, dist = tall ? Math.max(1.1, 0.36 / (tan * aspect)) : Math.max(1.6, 0.62 / (tan * aspect));
        const cy = tall ? 1.58 : 1.4;
        tl.set(S.x, L.floorY + cy + py * 0.05, S.z + px * 0.05);
        tp.set(S.x - S.d / 2 - dist, L.floorY + cy + 0.12 + py * 0.04, S.z + px * 0.08);
      } else if (mode === 'monitor') {
        const dist = Math.max(m.h / 0.78, m.w / 0.92 / aspect) / 2 / tan;
        tl.set(m.x, m.cy, m.z);
        tp.set(m.x + px * 0.02, m.cy + py * 0.015, m.z + 0.02 + dist);
      } else {
        const wide = aspect >= 1.1;
        // 默认距离：横屏要把书桌左边（x≈-1.2）到右墙边的书架和奖杯（x≈3.0）都框进来（用户要开场就看到书架）——
        // 视线中心往右挪到两者中间，距离按这 4.2 米的宽度算；竖屏放不下，先对着显示器，靠缩放和旋转看其余部分
        const base = wide ? Math.max(2.72, 2.4 / (tan * aspect) + 0.3) : Math.min(0.64 / (tan * aspect), 4.6);
        const cx = wide ? 1.0 : 0;
        const out = smooth(zoom, 1.15, 2.4), near = smooth(1 - zoom, 0, 0.55);
        const dist = base * zoom;
        // 横屏退得远，抬高一点越过书桌前的圈椅往下看
        const e = (wide ? 0.19 : 0.1) + el + out * 0.26;
        const a = az + px * 0.07;
        tl.set(cx * (1 - near), lerp(wide ? 0.5 : 0.62, 0.34, near) - out * 0.15, m.z + out * 0.5);
        tp.set(tl.x + Math.sin(a) * Math.cos(e) * dist, tl.y + Math.sin(e) * dist + py * 0.06, tl.z + Math.cos(a) * Math.cos(e) * dist);
        tp.y = Math.max(tp.y, L.floorY + 0.25);
      }
      if (mode === 'book') { tp.lerp(new THREE.Vector3(-0.7, 0.5, 1.5), 0.3); tl.lerp(new THREE.Vector3(-0.7, 0.15, L.books.z), 0.3); }
      if (first) { pos.copy(tp); look.copy(tl); first = false; }
      const k = mode === 'monitor' ? 4 : mode === 'home' ? 5 : 3.2;
      pos.set(damp(pos.x, tp.x, k, dt), damp(pos.y, tp.y, k, dt), damp(pos.z, tp.z, k, dt));
      look.set(damp(look.x, tl.x, k, dt), damp(look.y, tl.y, k, dt), damp(look.z, tl.z, k, dt));
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    input(e) {
      if (e.type === 'pointer') { px = e.x; py = e.y; }
      if (e.type === 'drag' && mode === 'home') {
        az = THREE.MathUtils.clamp(az - e.dx * 2.6, -AZ_MAX, AZ_MAX);
        el = THREE.MathUtils.clamp(el + e.dy * 1.5, EL_MIN, EL_MAX);
      }
      if (e.type === 'zoom') zoom = e.k;
      if (e.type === 'resize') aspect = e.width / Math.max(1, e.height);
    },
    stop() { off.forEach((f) => f()); },
  };
};
