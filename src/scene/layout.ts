/** 场景里的关键坐标，物件之间共享。单位：米，桌面 y = 0。 */
export const LAYOUT = {
  tv: { x: -0.2, z: 0, w: 0.9, h: 0.72, d: 0.75 },
  vcr: { h: 0.12 },
  screen: { w: 0.66, h: 0.5 },
  tapes: { x: 0.68, z: 0.2 },
  camHome: { pos: [0.02, 0.92, 2.5], look: [-0.06, 0.32, 0] },
} as const;

export const tvScreenCenter = () => ({
  x: LAYOUT.tv.x,
  y: LAYOUT.vcr.h + LAYOUT.tv.h / 2 + 0.02,
  z: LAYOUT.tv.z + LAYOUT.tv.d / 2 + 0.006,
});

export const vcrSlot = () => ({ x: LAYOUT.tv.x, y: LAYOUT.vcr.h * 0.55, z: LAYOUT.tv.z + LAYOUT.tv.d / 2 - 0.05 });
