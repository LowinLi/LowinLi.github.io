/** 技术红线，与 CLAUDE.md 保持一致。 */
export const BUDGETS = {
  targetFps: { high: 60, mid: 45 },
  // high 档含阴影通道、环境光遮蔽通道（各把场景重画一遍）和后期的全屏绘制。
  // 实测：默认视角 high≈380、mid≈110；拉远看全屋（家具都进画面）high≈450、mid≈135
  maxDrawCalls: { high: 520, mid: 160 },
  maxPixelRatio: { high: 1.5, mid: 1.25 },
  /** 首页 3D 相关 JS（gzip）上限，KB */
  sceneJsGzipKB: 250,
} as const;
