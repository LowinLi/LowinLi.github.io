/** 技术红线，与 CLAUDE.md 保持一致。 */
export const BUDGETS = {
  targetFps: { high: 60, mid: 45 },
  // high 档含阴影通道和后期处理的几次全屏绘制；实测 high≈200、mid≈105
  maxDrawCalls: { high: 260, mid: 140 },
  maxPixelRatio: { high: 2, mid: 1.25 },
  /** 首页 3D 相关 JS（gzip）上限，KB */
  sceneJsGzipKB: 250,
} as const;
