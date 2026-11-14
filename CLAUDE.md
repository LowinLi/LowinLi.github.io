# 个人主页 + 博客（Astro + vanilla Three.js）

方案文档：https://claude.ai/artifact/Fo73TMHbA4pHftx8QgpcTn
范围已定稿：**只做 L1（内容与架构）+ L2（交互层）**。L3 写实资产管线不铺开，最多做一个物件验证（Phase 3，可选）。

## 命令
- `npm run dev`：开发服务器，地址 http://localhost:4321
- `npm run build`：输出到 `dist/`
- 部署：推送到 `main` 后，`.github/workflows/deploy.yml` 会自动构建并发布到 GitHub Pages。仓库的 Settings → Pages → Source 要选 **GitHub Actions**。
- `npm run preview`：本地预览构建结果
- `npm run shots -- <url> <outDir>`：在 390/768/1440 三个宽度 × high/mid/low 三档截图，同时检查控制台报错和横向滚动。改了视觉后**必须**跑它并真的打开截图看过，不许没渲染就说「看起来不错」。
- `npm run migrate:hexo -- <hexo 仓库路径>`：迁移 Hexo 文章

## 架构
- **站内链接一律用 `url('/path')`（`src/lib/url.ts`），不要直接写 `/path`。** 项目仓库的 Pages 地址在 `/<repo>/` 子路径下，直接写死的根路径会 404。可以用 `BASE=/test/ npm run build` 检查。
- 一个站，路由分治：`/` 是主页，带唯一一个 3D island（`src/components/Scene.astro`）；`/posts/**` 是零 JS 的静态页。**文章页不允许出现 `<script>`。**
- 文章在 `src/content/posts/`，schema 在 `src/content.config.ts`。
- 3D 代码全在 `src/scene/`。three.js 只能通过 `runtime.ts` 动态 import 进来，不能被首页的首屏 bundle 静态引用。

## 场景概念：深夜书桌
桌上有一台 CRT 电视（下面垫着录像机），旁边一摞录像带，左边一盏台灯，后墙有一扇窗，窗外是程序化生成的城市夜景（多层视差，没有用照片）。
点一盘磁带，它会飞进录像机，镜头推到屏幕前，电视开始播放这盘磁带。按 ESC、点「退出」或点屏幕外面都会退出。
页面左下角的 HTML 磁带按钮和 3D 磁带等价，用于键盘操作和无障碍；在 low 档它们退化成页内锚点。

## 两种组件接口
**场景物件**（`src/scene/objects/*.ts`，类型在 `src/scene/types.ts`）：
```ts
(ctx: { scene, camera, renderer, tier, width, height, audio(), data, bus, pick() }) => { frame(dt, t), input?(e), stop() }
```
- 一个物件一个文件，写好后加进 `runtime.ts` 的 `OBJECTS` 列表（`cameraRig` 必须放最后）。
- 物件之间不互相 import，只通过 `bus` 通信，共享的坐标放在 `layout.ts`。
- 可以点击或悬停的网格用 `ctx.pick(mesh, { click, move, hover })` 注册，由 runtime 统一做射线检测。
- `stop()` 必须 dispose 掉自己创建的 geometry、material、texture，并从 scene 移除。
- `audio()` 在用户第一次点击之前返回 `null`。

**磁带**（`src/tapes/*.ts`，类型在 `src/tapes/types.ts`）：在 CRT 的 640×480 2D 画布上运行的独立小程序。
```ts
{ id, label, color, mount({ canvas, ctx, width, height, audio, data, navigate }) => { frame(dt, t), input?(e), stop() } }
```
- 一盘磁带一个文件，写好后加进 `src/tapes/index.ts` 的 `TAPES`。磁带摞、HTML 按钮和播放器都从这里读取。
- 收到的输入有三种：`pointer`（画布像素坐标，已经做过屏幕弧度校正）、`click`、`key`。
- 配色只能用 `PHOSPHOR`、`PHOSPHOR_DIM` 和 `SCREEN_BG`（琥珀色荧光屏）。
- 有声音的磁带必须在 `stop()` 里把声音关掉。

## bus 事件
| 事件 | 发出方 | 含义 |
| --- | --- | --- |
| `tape:insert {id}` | shelf / HTML 按钮 | 请求插入一盘磁带（如果已有磁带在播，会先退出它） |
| `tape:loaded {id}` | shelf | 磁带已经进入录像机，crt 开始播放 |
| `tape:eject` | runtime / HTML 按钮 / crt | 请求退出当前磁带 |
| `tape:ejected {id}` | crt | 已退出，shelf 把磁带放回去 |
| `tape:state {playing}` | crt | 播放状态，`playing` 为 null 表示没在播。cameraRig 和 HTML 层都会监听 |

调试：浏览器控制台里 `__scene.emit('tape:insert', {id:'life'})`。

首页文案在 `src/site.ts`。

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
- 3D 相关 JS gzip 后 ≤ 250 KB（目前 runtime 约 140 KB）
- 任何宽度下都不能有横向滚动
- 性能优化要附上优化前后的多角度截图像素对比，证明帧率提升不是靠降画质换来的

## 设计方向
- 当前方向：深夜书桌。暖色台灯和冷色月光形成对比，屏幕是琥珀色荧光屏，带扫描线、弧度、色散和插入磁带时的雪花噪点。
- 竖屏时镜头从高处往下看，让桌面填满纵向空间；不要为了把整张桌子塞进画面而一味把镜头拉远。
- **已否决的方向**（附原因，不要再提）：
  - 用 GSAP 或 Lenis：目前只有几段补间动画，用 `scene/tween.ts` 就够了，不值得多加依赖。
  - React Three Fiber：场景固定、物件少，声明式没优势，只多一层 reconciler 开销。
  - 完整的 L3 写实管线（Blender 建模 + 全场景烘焙）：惊艳程度相对工时投入最差。
  - 主页和博客拆成两个站：已合并成一个 Astro 站。

## 已知坑
- glTF 规范不支持 lightmap。烘焙图先塞进 emission 通道导出，在 Three.js 里再手动赋给 `material.lightMap`（UV2）。
- pip 安装的 `bpy` 不能编码视频：先输出 PNG 序列，再用系统 ffmpeg 合成。
- worktree 之间不共享 `node_modules`，每个都要单独 `npm install`；被 gitignore 的文件写进 `.worktreeinclude`。
- 截图脚本在无 GPU 环境下用 SwiftShader 渲染，只有约 5 fps，所以动画要多等几秒再截图。档位用 `?tier=` 强制指定；自动检测会把 SwiftShader 判成 low，这是预期行为。
- 自定义 `ShaderMaterial` 的片元着色器最后必须加 `#include <colorspace_fragment>`，否则输出是线性空间，画面会明显偏暗。
- 叠在一起的平面要留出 z 间距：屏幕的边框曾经因为挡在屏幕平面前面，导致屏幕整块不显示。
- Hexo 的标签插件（`{% ... %}`）迁移后不会被渲染，需要手动改写。
