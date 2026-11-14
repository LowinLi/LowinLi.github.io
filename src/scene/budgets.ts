/** 技术红线，与 CLAUDE.md 保持一致。 */
export const BUDGETS = {
  targetFps: { high: 60, mid: 45 },
  // high 档含阴影通道（每个投影物体多画一次）；实测 high≈290、mid≈155
  maxDrawCalls: { high: 340, mid: 180 },
  maxPixelRatio: { high: 2, mid: 1.25 },
  /** 首页 3D 相关 JS（gzip）上限，KB */
  sceneJsGzipKB: 250,
} as const;
