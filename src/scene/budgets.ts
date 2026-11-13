/** 技术红线，与 CLAUDE.md 保持一致。 */
export const BUDGETS = {
  targetFps: { high: 60, mid: 45 },
  maxDrawCalls: { high: 120, mid: 60 },
  maxPixelRatio: { high: 2, mid: 1.25 },
  /** 首页 3D 相关 JS（gzip）上限，KB */
  sceneJsGzipKB: 250,
} as const;
