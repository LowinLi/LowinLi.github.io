/** 技术红线，与 CLAUDE.md 保持一致。 */
export const BUDGETS = {
  targetFps: { high: 60, mid: 45 },
  // high 档含阴影通道、环境光遮蔽通道（各把场景重画一遍）和后期的全屏绘制。
  // 实测：默认视角 high≈380、mid≈110；拉远看全屋（家具都进画面）high≈450、mid≈135
  maxDrawCalls: { high: 520, mid: 160 },
  maxPixelRatio: { high: 1.5, mid: 1.25 },
  /**
   * 每帧最多画多少像素（绘图缓冲区的宽 × 高）。大屏、外接 4K/5K 显示器上按像素比 1.5 算会到 800 多万像素，
   * 再乘上后期处理的好几张全尺寸缓冲，显卡一直顶满。用户的 Mac 出现过开着页面几分钟后整机卡死重启。
   */
  maxPixels: { high: 2.4e6, mid: 1.2e6 },
  /** 首页 3D 相关 JS（gzip）上限，KB */
  sceneJsGzipKB: 250,
} as const;
