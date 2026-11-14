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

## 场景概念：海边小楼的办公室，清晨
相机坐在一张现代书桌前，正对一面大窗。窗外是大海，太阳刚升起一半，时不时有海鸥飞过。晨光从窗外斜照进来，在桌面上拉出长影子。
桌上从左到右：一盆阔叶、一排书（技术书 + 几本线装古籍）、显示器（屏幕上画着百度首页）、一盆多肉、留声机和三张唱片；右侧地上一盆虎尾兰。

| 点什么 | 发生什么 |
| --- | --- |
| 书 | 书从书架抽出来，HTML 阅读器翻开显示内容。古籍竖排、从右往左翻 |
| 显示器 | 镜头推近，真正的 `<input>` 叠在屏幕画的搜索框上；回车在新标签页打开 baidu.com 的搜索结果 |
| 唱片 | 唱片飞到留声机转盘上开始转，播放实时合成的音乐；再点一次或点留声机停止 |
| 盆栽 | 晃动（阻尼弹簧） |

页面左下角的 HTML 按钮（关于我 / 文章 / 搜索 / 音乐）和 3D 物件等价，用于键盘操作和无障碍。
阅读器是纯 HTML，不依赖 WebGL：low 档下「关于我」「文章」两本书照样能翻开。

内容在哪里改：
- 首页文案：`src/site.ts`
- 书和书里的内容：`src/books.ts`（技术书是读书笔记，古籍是原文选段；「关于我」「文章索引」两本由 site 和文章列表生成）
- 唱片：`src/tracks.ts`（元数据）+ `src/scene/music.ts`（合成器，没有音频文件）

## 组件接口
**场景物件**（`src/scene/objects/*.ts`，类型在 `src/scene/types.ts`）：
```ts
(ctx: { scene, camera, renderer, tier, width, height, audio(), data, bus, pick() }) => { frame(dt, t), input?(e), stop() }
```
- 一个物件一个文件，写好后加进 `runtime.ts` 的 `OBJECTS` 列表（`cameraRig` 必须放最后）。
- 物件之间不互相 import，只通过 `bus` 通信，共享的坐标放在 `layout.ts`。
- 可以点击或悬停的网格用 `ctx.pick(obj, { click, move, hover })` 注册，由 runtime 统一做射线检测。
- 自己创建的 geometry、material、texture 都放进 `Bin`，在 `stop()` 里 `bin.dispose()` 并从 scene 移除。
- `audio()` 只能在用户点击触发的回调里调用（浏览器不允许无手势发声）。
- `bus` 由 `Scene.astro` 创建并传进 runtime，所以 HTML 层和 3D 层收发的是同一组事件。

## bus 事件
| 事件 | 发出方 | 含义 |
| --- | --- | --- |
| `book:open {id}` | bookshelf / HTML 按钮 | 翻开一本书。阅读器、bookshelf、cameraRig 都监听 |
| `book:close` | 阅读器 / ESC | 合上书 |
| `monitor:focus` | monitor / HTML 按钮 | 镜头推到显示器，显示搜索输入框 |
| `monitor:blur` | ESC / 返回按钮 / 点显示器外面 | 退出显示器 |
| `monitor:rect {x,y,w,h}` | monitor（聚焦时每帧） | 屏幕在画布上的像素矩形，HTML 输入框据此定位 |
| `disc:play {id}` | gramophone / HTML 按钮 | 请求播放一张唱片 |
| `disc:stop` | gramophone / HTML 按钮 | 停止 |
| `music:state {id,title}` 或 `null` | gramophone | 唱片落到转盘、音乐真正开始 / 停止 |

调试：浏览器控制台里 `__scene.emit('book:open', {id:'lunyu'})`。

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
- draw call：high ≤ 340，mid ≤ 180（high 档含阴影通道；截图脚本的报告会读 `window.__scene.info.render.calls`。目前约 290 / 155）
- 3D 相关 JS gzip 后 ≤ 250 KB（目前 runtime 约 150 KB）
- 任何宽度下都不能有横向滚动
- 性能优化要附上优化前后的多角度截图像素对比，证明帧率提升不是靠降画质换来的

## 设计方向
- 当前方向：海边清晨。窗外是暖橙到淡蓝的日出天空，室内是偏冷的天光加上从窗外打进来的暖色阳光。家具是浅色橡木和黑色钢架，留声机的黄铜喇叭是画面里最亮的暖色点。
- 天空和海是同一个着色器（`objects/seaSky.ts`）：按视线方向计算，海面是真正的透视平面，反射天空并带太阳光路。太阳方向在 `layout.ts` 的 `SUN_DIR`，正好在海平线上，所以只露出一半。
- 相机高度要让海平线落在显示器上沿之上，太阳偏左，避免被显示器挡住。
- 竖屏放不下整张桌子：镜头靠近，左右拖动平移（`cameraRig` 的 `drag` 输入），不要一味把镜头拉远。
- 显示器里的百度首页是画在 canvas 上的示意页面，屏幕底部有一行说明；真正的搜索交给 baidu.com。不要在站内仿造登录等功能。
- **已否决的方向**（附原因，不要再提）：
  - React Three Fiber：场景固定、物件少，声明式没优势，只多一层 reconciler 开销。
  - 完整的 L3 写实管线（Blender 建模 + 全场景烘焙）：惊艳程度相对工时投入最差。
  - 主页和博客拆成两个站：已合并成一个 Astro 站。
  - 用 GSAP 或 Lenis：动画都是阻尼跟随（`scene/tween.ts` 的 `damp`），不值得多加依赖。
  - 深夜书桌 + CRT 电视 + 录像带（第一版）：用户觉得粗糙，已整体替换成现在的场景。
  - 把书的内容画在 3D 贴图上：字小、手机上看不清、不能选中也不能点链接，所以用 HTML 阅读器。
  - 用 iframe 嵌入真正的百度：iframe 进不了 WebGL 贴图，而且对方可以禁止被嵌入。

## 已知坑
- glTF 规范不支持 lightmap。烘焙图先塞进 emission 通道导出，在 Three.js 里再手动赋给 `material.lightMap`（UV2）。
- pip 安装的 `bpy` 不能编码视频：先输出 PNG 序列，再用系统 ffmpeg 合成。
- worktree 之间不共享 `node_modules`，每个都要单独 `npm install`；被 gitignore 的文件写进 `.worktreeinclude`。
- 截图脚本在无 GPU 环境下用 SwiftShader 渲染，只有约 5 fps，所以动画要多等几秒再截图。档位用 `?tier=` 强制指定；自动检测会把 SwiftShader 判成 low，这是预期行为。
- 自定义 `ShaderMaterial` 的片元着色器最后必须加 `#include <colorspace_fragment>`，否则输出是线性空间，画面会明显偏暗。
- 叠在一起的平面要留出 z 间距，否则会互相遮挡或闪烁。
- 竖排文字（古籍）依赖字体自带的竖排度量。截图环境里的文泉驿字体竖排会叠字，这是环境问题；验证竖排版式时在测试里临时注入 `font-family: Unifont`。
- 截图环境里渲染很慢，场景时间也跟着变慢：海鸥要等二三十秒才飞进画面，镜头推近要等 7 秒以上。
- 没有环境贴图时金属材质几乎是黑的，所以 `room.ts` 用 `RoomEnvironment` 生成了一张低强度的环境贴图。
- Hexo 的标签插件（`{% ... %}`）迁移后不会被渲染，需要手动改写。
