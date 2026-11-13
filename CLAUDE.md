# 个人主页 + 博客（Astro + vanilla Three.js）

方案文档：https://claude.ai/artifact/Fo73TMHbA4pHftx8QgpcTn
范围已定稿：**只做 L1（内容与架构）+ L2（交互层）**。L3 写实资产管线不铺开，最多做一个物件验证（Phase 3，可选）。

## 命令
- `npm run dev`：开发服务器，地址 http://localhost:4321
- `npm run build`：输出到 `dist/`（Cloudflare Pages 的输出目录填 `dist`，不是 `public`）
- `npm run preview`：本地预览构建结果
- `npm run shots -- <url> <outDir>`：在 390/768/1440 三个宽度 × high/mid/low 三档截图，同时检查控制台报错和横向滚动。改了视觉后**必须**跑它并真的打开截图看过，不许没渲染就说「看起来不错」。
- `npm run migrate:hexo -- <hexo 仓库路径>`：迁移 Hexo 文章

## 架构
- 一个站，路由分治：`/` 是主页，带唯一一个 3D island（`src/components/Scene.astro`）；`/posts/**` 是零 JS 的静态页。**文章页不允许出现 `<script>`。**
- 文章在 `src/content/posts/`，schema 在 `src/content.config.ts`。
- 3D 代码全在 `src/scene/`。three.js 只能通过 `runtime.ts` 动态 import 进来，不能被首页的首屏 bundle 静态引用。

## 组件接口（`src/scene/types.ts`）
每个可交互物件一个文件，放 `src/scene/objects/`，导出一个 `SceneObject`：
```ts
(ctx: { scene, camera, renderer, tier, width, height, audio }) => { frame(dt, t), input?(e), stop() }
```
- 物件之间不互相引用，只通过 `input` 接收 pointer / scroll / resize 事件。
- `stop()` 必须 dispose 掉自己创建的 geometry、material、texture，并从 scene 移除。
- 新物件写好后加进 `runtime.ts` 的 `OBJECTS` 列表。
- `audio` 在用户首次点击前是 `null`，物件要处理这种情况。

## 降级档位（`src/scene/tier.ts`）
URL 加 `?tier=high|mid|low` 可以强制指定档位。

| 档位 | 判定 | 渲染策略 |
| --- | --- | --- |
| high | 默认 | 完整 3D + 后处理，像素比 ≤ 2 |
| mid | 弱 GPU 或 deviceMemory ≤ 4 | 简化几何与粒子数，关闭后处理，像素比 ≤ 1.25 |
| low | 不支持 WebGL / 软件渲染 / `prefers-reduced-motion` / 内存 ≤ 2 GB / 核数 ≤ 2 | 只用 CSS 静态回退，不加载 three.js |

每个新功能都要同时说明它在三档下分别怎么表现。low 档的页面必须完整可用。

## 技术红线（`src/scene/budgets.ts`）
- 帧率：high 60 fps，mid 45 fps
- draw call：high ≤ 120，mid ≤ 60（截图脚本的报告会读 `window.__scene.info.render.calls`）
- 3D 相关 JS gzip 后 ≤ 250 KB（目前 runtime 约 131 KB）
- 任何宽度下都不能有横向滚动
- 性能优化要附上优化前后的多角度截图像素对比，证明帧率提升不是靠降画质换来的

## 设计方向
- 当前：占位，一个程序化球体（`objects/orb.ts`），只用来验证接口和降级。Phase 1 会替换掉。
- **已否决的方向**（附原因，不要再提）：
  - React Three Fiber：场景固定、物件少，声明式没优势，只多一层 reconciler 开销。
  - 完整的 L3 写实管线（Blender 建模 + 全场景烘焙）：惊艳程度相对工时投入最差。
  - 主页和博客拆成两个站：已合并成一个 Astro 站。

## 已知坑
- glTF 规范不支持 lightmap。烘焙图先塞进 emission 通道导出，在 Three.js 里再手动赋给 `material.lightMap`（UV2）。
- pip 安装的 `bpy` 不能编码视频：先输出 PNG 序列，再用系统 ffmpeg 合成。
- worktree 之间不共享 `node_modules`，每个都要单独 `npm install`；被 gitignore 的文件写进 `.worktreeinclude`。
- 截图脚本在无 GPU 环境下用 SwiftShader 渲染，所以 `?tier=` 是强制指定的；自动检测会把 SwiftShader 判成 low，这是预期行为。
- Hexo 的标签插件（`{% ... %}`）迁移后不会被渲染，需要手动改写。
