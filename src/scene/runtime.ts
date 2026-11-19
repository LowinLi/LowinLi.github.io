import * as THREE from 'three';
import { nudge, setHours, setPreset, toReal } from './daytime';
import { L } from './layout';
import { BUDGETS } from './budgets';
import { emit, HIT_LAYER, on, type MountContext, type Mounted, type PickHandlers, type SceneInput, type SceneObject, type SiteData } from './types';
import type { Tier } from './tier';
import { createPost } from './post';
import { sky } from './objects/sky';
import { countryside } from './objects/countryside';
import { animals } from './objects/animals';
import { desk } from './objects/desk';
import { room } from './objects/room';
import { monitor } from './objects/monitor';
import { bookshelf } from './objects/bookshelf';
import { calendar } from './objects/calendar';
import { meal } from './objects/meal';
import { fridge } from './objects/fridge';
import { recorder } from './objects/recorder';
import { coffee } from './objects/coffee';
import { cups } from './objects/cups';
import { plants } from './objects/plants';
import { furniture } from './objects/furniture';
import { mirror } from './objects/mirror';
import { dust } from './objects/dust';
import { handheld } from './objects/handheld';
import { trophyShelf } from './objects/trophyShelf';
import { basket } from './objects/basket';
import { tea } from './objects/tea';
import { kitchen } from './objects/kitchen';
import { cameraRig } from './objects/cameraRig';

/** 场景里挂载的物件清单。新物件：在 objects/ 下建文件，然后加到这里。cameraRig 放最后。 */
const OBJECTS: SceneObject[] = [sky, countryside, animals, room, furniture, mirror, desk, monitor, bookshelf, recorder, coffee, cups, meal, calendar, fridge, handheld, trophyShelf, basket, plants, dust, tea, kitchen, cameraRig];

export function start(canvas: HTMLCanvasElement, tier: Exclude<Tier, 'low'>, data: SiteData, bus: EventTarget) {
  // high 档的抗锯齿在后期处理的离屏缓冲里做（多重采样），画布本身再开一份全屏多重采样缓冲是白占显存
  // 画布不透明（alpha: false）：three 自己建的上下文总是带透明通道，high 档后期处理以后，照片公告板（稻子、树、草）镂空的边缘
  // 透明度小于 1，页面上画布后面的底色（.scene 的浅杏色）就透出来，夜里成了一圈圈「荧光黄」的描边（用户截图指出过）
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 不可用');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: 'high-performance' });
  const basePR = Math.min(devicePixelRatio, BUDGETS.maxPixelRatio[tier]);
  let prScale = 1; // 自动降档时往下乘
  /** 像素比：设备像素比、档位上限、每帧像素上限三者取最小 */
  const pixelRatio = (w: number, h: number) => Math.max(0.5, Math.min(basePR * prScale, Math.sqrt(BUDGETS.maxPixels[tier] / Math.max(1, w * h))));
  renderer.setPixelRatio(pixelRatio(canvas.clientWidth, canvas.clientHeight));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  if (tier === 'high') {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // 场景基本是静止的：阴影贴图隔几帧更新一次就够（见渲染循环）
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);

  const post = tier === 'high' ? createPost(renderer, scene, camera) : null;
  renderer.info.autoReset = false;

  const size = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setPixelRatio(pixelRatio(w, h));
    renderer.setSize(w, h, false);
    post?.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    return { width: w, height: h };
  };
  const { width, height } = size();

  // ---- 射线拾取 ----
  const pickables = new Map<THREE.Object3D, PickHandlers>();
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(HIT_LAYER); // 看不见的点击区放在这一层：射线测得到，相机不画
  const ndc = new THREE.Vector2();
  let hovered: THREE.Object3D | null = null;
  const findOwner = (o: THREE.Object3D | null) => { while (o && !pickables.has(o)) o = o.parent; return o; };
  const cast = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...pickables.keys()], true).find((h) => h.object.visible);
    return hit ? { hit, owner: findOwner(hit.object)! } : null;
  };

  let audioCtx: AudioContext | null = null;
  const ctx: MountContext = {
    scene, camera, renderer, tier, width, height, data, bus,
    audio: () => { audioCtx ??= new AudioContext(); if (audioCtx.state === 'suspended') void audioCtx.resume(); return audioCtx; },
    pick: (obj, h) => { pickables.set(obj, h); },
  };
  // 每个物件挂进场景的东西都标上物件名（调试：数各物件占多少 draw call / 三角形）
  const mounted: Mounted[] = OBJECTS.map((o, i) => {
    const before = new Set(scene.children), m = o(ctx);
    for (const c of scene.children) if (!before.has(c)) c.userData.owner ??= i; // 名字会被压缩，用 OBJECTS 里的序号
    return m;
  });
  // 小于 7 厘米半径的零件不投实时阴影（按钮、旋钮、笔、杯子……）：影子小到看不出，桌上的东西本来就有接触阴影，
  // 每个投影的网格在阴影通道里都要多画一次（开场视角拉远看到书架以后，high 档贴着 520 的上限）。异步加进来的模型在 scene:changed 时再筛一遍
  const pruneCasters = () => scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || !m.castShadow) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const sc = m.getWorldScale(new THREE.Vector3()), r = (m.geometry.boundingSphere?.radius ?? 1) * Math.max(sc.x, sc.y, sc.z);
    if (r < 0.07) m.castShadow = false;
  });
  pruneCasters();
  const send = (e: SceneInput) => mounted.forEach((m) => m.input?.(e));
  send({ type: 'resize', width, height });

  const fridgeFocus = new THREE.Vector3(L.fridge.x, L.floorY + 0.7, L.fridge.z + L.fridge.d / 2);
  let monitorFocused = false, windowFocused = false, bookOpen = false, cupFocused = false, fridgeOpen = false, shelfFocused = false, clockFocused = false, inspectFocused = false, teaFocused = false, stoveFocused = false;
  const stoveFocus = new THREE.Vector3(L.kitchen.x, L.floorY + L.kitchen.h + 0.06, L.kitchen.z);
  const teaFocus = new THREE.Vector3(L.teaTable.x, L.floorY + L.teaTable.top + 0.06, L.teaTable.z);
  const clockFocus = new THREE.Vector3(L.clockDial.x, L.clockDial.y, L.clockDial.z);
  const shelfFocus = new THREE.Vector3(L.trophyShelf.x, L.floorY + L.trophyShelf.h + 0.15, L.trophyShelf.z);
  // 缩放：1 是默认距离。只在自由视角下生效（没在看显示器 / 窗外 / 书）
  const ZOOM_MIN = 0.45, ZOOM_MAX = 2.4; // 镜头位置夹在屋里（cameraRig），拉远到后面主要靠视角变广
  let zoomK = 1;
  const free = () => !monitorFocused && !windowFocused && !bookOpen && !cupFocused && !fridgeOpen && !shelfFocused && !clockFocused && !inspectFocused && !teaFocused && !stoveFocused;
  const setZoom = (k: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
    if (next === zoomK) return false;
    zoomK = next; send({ type: 'zoom', k: zoomK });
    return true;
  };
  const offs = [
    on(bus, 'monitor:focus', () => { monitorFocused = true; }),
    on(bus, 'monitor:blur', () => { monitorFocused = false; }),
    // 拨时间（座钟 / HTML 面板）：daytime.ts 记下和真实时间的差
    on<{ h?: number; at?: string }>(bus, 'time:set', ({ h, at }) => (at ? setPreset(at) : setHours(h ?? 12))),
    on(bus, 'time:real', () => toReal()),
    on<{ dh: number }>(bus, 'time:nudge', ({ dh }) => nudge(dh)),
    // 拨座钟：镜头站到表盘前，景深对焦表盘
    on(bus, 'clock:focus', () => { clockFocused = true; post?.setFocus(clockFocus); }),
    // 凑近看小东西（便利贴）/ 站到茶几前泡茶：景深对焦到那里，「点旁边退回」
    on<{ p: number[] }>(bus, 'inspect:focus', ({ p }) => { inspectFocused = true; post?.setFocus(new THREE.Vector3().fromArray(p)); }),
    on(bus, 'inspect:blur', () => { inspectFocused = false; post?.setFocus(null); }),
    on(bus, 'tea:focus', () => { teaFocused = true; post?.setFocus(teaFocus); }),
    on(bus, 'stove:focus', () => { stoveFocused = true; post?.setFocus(stoveFocus); }),
    on(bus, 'stove:blur', () => { stoveFocused = false; post?.setFocus(null); }),
    on(bus, 'tea:blur', () => { teaFocused = false; post?.setFocus(null); }),
    on<{ p: number[] } | null>(bus, 'tea:hold', (d) => { if (teaFocused) post?.setFocus(d ? new THREE.Vector3().fromArray(d.p) : teaFocus); }),
    on(bus, 'clock:blur', () => { clockFocused = false; post?.setFocus(null); }),
    on(bus, 'scene:changed', () => { post?.refresh(); pruneCasters(); collectCasters(); }),
    on(bus, 'book:open', () => { bookOpen = true; }),
    on<{ p: number[] }>(bus, 'cup:focus', ({ p }) => { cupFocused = true; post?.setFocus(new THREE.Vector3().fromArray(p)); }),
    on(bus, 'cup:blur', () => { cupFocused = false; post?.setFocus(null); }),
    // 冰箱：开着门时景深对焦在冰箱门口；手里拿着东西时对焦到那样东西
    on(bus, 'fridge:open', () => { fridgeOpen = true; post?.setFocus(fridgeFocus); }),
    on(bus, 'fridge:close', () => { fridgeOpen = false; post?.setFocus(null); }),
    on<{ p: number[] } | null>(bus, 'fridge:hold', (d) => { if (fridgeOpen) post?.setFocus(d ? new THREE.Vector3().fromArray(d.p) : fridgeFocus); }),
    on(bus, 'book:close', () => { bookOpen = false; }),
    on<{ dir: number }>(bus, 'view:zoom', ({ dir }) => { if (free()) setZoom(zoomK * (dir > 0 ? 0.75 : 1 / 0.75)); }),
    on(bus, 'view:reset', () => setZoom(1)),
    on(bus, 'window:focus', () => { windowFocused = true; post?.setFarBlur(false); }),
    // 看书架：景深对焦在书架顶上的奖杯
    on(bus, 'shelf:focus', () => { shelfFocused = true; post?.setFocus(shelfFocus); }),
    on(bus, 'shelf:blur', () => { shelfFocused = false; post?.setFocus(null); }),
    on(bus, 'window:blur', () => { windowFocused = false; post?.setFarBlur(true); }),
  ];

  const onResize = () => send({ type: 'resize', ...size() });
  let downAt: { x: number; y: number } | null = null;
  let lastX = 0, lastY = 0;
  // 双指缩放：记录当前按下的触点
  const touches = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    send({ type: 'pointer', x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) });
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && free()) setZoom(zoomK * (pinchDist / d));
      pinchDist = d;
      downAt = null; // 双指时不算拖动也不算点击
      return;
    }
    if (downAt) { send({ type: 'drag', dx: (e.clientX - lastX) / r.width, dy: (e.clientY - lastY) / r.height }); lastX = e.clientX; lastY = e.clientY; }
    const res = cast(e);
    const owner = res?.owner ?? null;
    if (owner !== hovered) {
      if (hovered) pickables.get(hovered)?.hover?.(false);
      if (owner) pickables.get(owner)?.hover?.(true);
      hovered = owner;
    }
    canvas.style.cursor = owner && pickables.get(owner)!.click ? 'pointer' : '';
    if (res) pickables.get(res.owner)?.move?.(res.hit);
  };
  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY }; lastX = e.clientX; lastY = e.clientY;
    if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinchDist = 0; }
    else canvas.setPointerCapture(e.pointerId); // 鼠标拖出画布也继续旋转
  };
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId); pinchDist = 0;
    const start = downAt; downAt = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const res = cast(e);
    // 「点旁边退回」：在窗前时点哪里都回到座位；看显示器时点屏幕以外的地方退出
    // 例外：窗外园子里能摘的菜（userData.keepsWindow）
    if (windowFocused) { if (res?.owner.userData.keepsWindow) pickables.get(res.owner)?.click?.(res.hit); else emit(bus, 'window:blur'); return; }
    if (monitorFocused && !res?.owner.userData.keepsMonitor) { emit(bus, 'monitor:blur'); return; }
    if (fridgeOpen && !res?.owner.userData.keepsFridge) { emit(bus, 'fridge:close'); return; }
    if (shelfFocused && !res?.owner.userData.keepsShelf) { emit(bus, 'shelf:blur'); return; }
    if (clockFocused && !res?.owner.userData.keepsClock) { emit(bus, 'clock:blur'); return; }
    if (inspectFocused && !res?.owner.userData.keepsInspect) { emit(bus, 'inspect:blur'); return; }
    if (teaFocused && !res?.owner.userData.keepsTea) { emit(bus, 'tea:blur'); return; }
    if (stoveFocused && !res?.owner.userData.keepsStove) { emit(bus, 'stove:blur'); return; }
    if (cupFocused && !res?.owner.userData.keepsCup && !res?.owner.userData.keepsMachine) { emit(bus, 'cup:blur'); return; }
    if (res) pickables.get(res.owner)?.click?.(res.hit);
  };
  const onCancel = (e: PointerEvent) => { downAt = null; touches.delete(e.pointerId); pinchDist = 0; };
  // 滚轮：向上拉近，向下拉远。首页只有这一屏，没有内容可滚，所以滚轮一律用来缩放
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (free()) setZoom(zoomK * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0013)));
  };
  addEventListener('resize', onResize);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // 不在视口内或标签页隐藏时停止渲染
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);

  // ---- 自动降档 ----
  // 没法预知访客的显卡：开头几秒量帧率，持续低于 30 帧就降一档（第 3 档的门槛是 20 帧），最多降三档，不再升回去。
  //   high：1 = 关掉遮蔽 / 景深 / 光束，像素比 ×0.8；2 = 关掉全部后期和阴影更新，像素比 ×0.65
  //   mid ：1 = 像素比 ×0.8；2 = 像素比 ×0.6
  //   两档共用的 3 = 像素比再 ×0.8，并且每秒最多画 20 帧
  //   像素比之外还有每帧像素上限（BUDGETS.maxPixels），大屏先被它压住
  let level = 0, autoDegrade = true, minGap = 0, last = 0, frames = 0, acc = 0, warm = 0, usePost = !!post, shadowEvery = 2, tick = 0;
  const degrade = () => {
    level++;
    if (tier === 'high') {
      if (level === 1) { post?.setLite(true); prScale = 0.8; shadowEvery = 4; }
      else if (level === 2) { usePost = false; shadowEvery = 0; prScale = 0.65; emit(bus, 'quality:nopost'); }
    } else if (level < 3) prScale = level === 1 ? 0.8 : 0.6;
    // 第 3 档（两档都降完还是很卡）：再缩一点分辨率，并且每秒最多画 20 帧，给显卡留出喘气的时间
    if (level === 3) { prScale *= 0.8; minGap = 50; }
    onResize();
    (window as any).__scene.level = level;
    console.info(`[scene] 帧率偏低，自动降到第 ${level} 档`);
  };

  // 调试：?prof 统计每帧物件逻辑（js）和渲染提交（render）的耗时、draw call（含阴影、遮蔽、镜子的重画）
  const prof = new URLSearchParams(location.search).has('prof') ? { n: 0, js: 0, render: 0, calls: 0 } : null;
  // ---- 加载进度（用户要的「页面没加载好的时候显示加载中，不要展示加载一半的状态」）----
  // 所有贴图、模型都走 three 的默认 LoadingManager：数它的进度，发 load:progress；
  // 「好了」= 没有在下的东西、并且 0.7 秒内没有新的下载开始、也没有新模型放进场景（scene:changed），再多画几帧（着色器编译完）。
  // 最多等 25 秒：网很慢或者哪个文件卡住时，照样把房间露出来（剩下的东西照常异步补上）。
  const mgr = THREE.DefaultLoadingManager;
  let ldTotal = 0, ldDone = 0, ldChange = performance.now(), ldFrames = 0, ldFinished = false, ldShown = -1;
  const t0Load = performance.now();
  mgr.onStart = (_u, l, t) => { ldDone = l; ldTotal = t; ldChange = performance.now(); };
  mgr.onProgress = (_u, l, t) => { ldDone = l; ldTotal = t; ldChange = performance.now(); };
  mgr.onLoad = () => { ldChange = performance.now(); };
  mgr.onError = () => { ldChange = performance.now(); };
  offs.push(on(bus, 'scene:changed', () => { ldChange = performance.now(); }));
  const checkLoaded = (now: number) => {
    if (ldFinished) return;
    ldFrames++;
    const p = ldTotal ? ldDone / ldTotal : 0;
    // 一批下完又会接着下下一批（光照贴图是一张到了再要下一张），比例会往回掉：显示的进度只增不减，到齐之前最多 95%
    const pct = Math.max(ldShown, Math.min(95, Math.floor(p * 95)));
    if (pct !== ldShown) { ldShown = pct; emit(bus, 'load:progress', { p: pct / 100 }); }
    const idle = ldDone >= ldTotal && now - ldChange > 700;
    if ((idle && ldFrames > 12) || now - t0Load > 25000) { ldFinished = true; emit(bus, 'load:done'); }
  };
  const sameMat = (a: Float32Array, b: THREE.Matrix4) => { const e = b.elements; for (let i = 0; i < 16; i++) if (Math.abs(a[i] - e[i]) > 1e-5) return false; return true; };
  const camPrev = new Float32Array(16), projPrev = new Float32Array(16);
  let stillFor = 0;
  // 投影网格的世界矩阵 + 显隐的快照（每帧比一遍，几百个网格不到 0.1 毫秒）
  let casters: THREE.Mesh[] = [], snap = new Float32Array(0);
  // userData.swayOnly：一直在轻轻晃的东西（盆栽的叶子），不算「动过」，不然阴影贴图隔帧就得重画一次；它们的影子跟着每 120 帧的定期重画走
  const collectCasters = () => { casters = []; scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow && !o.userData.swayOnly) casters.push(o as THREE.Mesh); }); snap = new Float32Array(casters.length * 17); };
  const castersMoved = () => {
    let moved = false;
    for (let i = 0; i < casters.length; i++) {
      const m = casters[i], e = m.matrixWorld.elements, o = i * 17;
      let vis = 1; for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible) { vis = 0; break; }
      if (snap[o + 16] !== vis) { snap[o + 16] = vis; moved = true; }
      for (let k = 0; k < 16; k++) if (snap[o + k] !== e[k]) { snap[o + k] = e[k]; moved = true; }
    }
    return moved;
  };
  collectCasters();
  // 帧率封顶：高刷屏（120 Hz）上不跑满，最多 60 帧；镜头停住、没人操作 6 秒以后降到 30 帧（场景里只剩钟摆、浮尘、窗外的猫狗在慢慢动）
  let lastInput = performance.now();
  const poke = () => { lastInput = performance.now(); };
  const pokeEvents = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;
  pokeEvents.forEach((e) => addEventListener(e, poke, { passive: true }));
  const clock = new THREE.Clock();
  // 量帧率：按时间窗（每 1.5 秒看一次平均帧率），不按帧数——很卡的时候一帧要零点几秒，按 90 帧算要等好几分钟。
  // 连着 3 帧都超过 0.25 秒就立刻降一档。以前「超过 0.5 秒的帧不算」，结果显卡越顶不住越不降档，一直顶满。
  // 只有刚从别的标签页切回来的那几帧不算（那几帧的间隔是标签页藏起来的时间）。
  let skip = 0, slow = 0;
  const onVis = () => { if (!document.hidden) { skip = 5; clock.getDelta(); } };
  document.addEventListener('visibilitychange', onVis);
  renderer.setAnimationLoop((now) => {
    const idle = stillFor > 1 && now - lastInput > 6000;
    const gap = Math.max(minGap, idle ? 25 : 10); // 60 Hz 屏：每帧都画 / 闲置隔一帧；120 Hz 屏：隔一帧 / 隔两帧（留余量，免得帧间隔抖一下就多跳一帧）
    if (now - last < gap) return;
    last = now;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.1);
    if (!visible || document.hidden) { frames = 0; acc = 0; slow = 0; skip = 5; return; }
    const t = clock.elapsedTime;
    const t0 = performance.now();
    renderer.info.reset();
    for (const m of mounted) m.frame(dt, t);
    const t1 = performance.now();
    camera.updateMatrixWorld();
    const still = sameMat(camPrev, camera.matrixWorld) && sameMat(projPrev, camera.projectionMatrix);
    camPrev.set(camera.matrixWorld.elements); projPrev.set(camera.projectionMatrix.elements);
    if (still) stillFor += raw; else stillFor = 0;
    // 阴影贴图只在投影的东西动过（或显隐变过）时才重画：开头 120 帧连续画（等模型加载），之后每帧比对一遍投影网格的世界矩阵
    if (tier === 'high') renderer.shadowMap.needsUpdate = tick < 120 || (shadowEvery > 0 && tick % shadowEvery === 0 && (castersMoved() || tick % 120 === 0));
    tick++;
    if (post && usePost) post.render(dt, still); else renderer.render(scene, camera);
    checkLoaded(performance.now());
    if (prof) { prof.n++; prof.js += t1 - t0; prof.render += performance.now() - t1; prof.calls += renderer.info.render.calls; }
    if (skip > 0) { skip--; return; }
    if (idle) { frames = 0; acc = 0; slow = 0; }
    else if (autoDegrade && level < 3) {
      warm += raw;
      if (warm > 3) {
        frames++; acc += raw;
        slow = raw > 0.25 ? slow + 1 : 0;
        if (slow >= 3 || (acc >= 1.5 && frames / acc < (level < 2 ? 30 : 20))) { degrade(); frames = 0; acc = 0; slow = 0; warm = 2; }
        else if (acc >= 1.5) { frames = 0; acc = 0; }
      }
    }
  });

  // 暴露给 QA / 截图脚本读取的诊断信息
  (window as any).__scene = { tier, level: 0, prof, info: renderer.info, scene, camera, bus, emit: (type: string, d?: unknown) => emit(bus, type, d),
    // 调试：屏幕上某一点点下去会命中谁（命中的网格和它的点击归属）
    pickAt: (x: number, y: number) => { const r = cast({ clientX: x, clientY: y } as PointerEvent); return r && { hit: r.hit.object.type + ':' + (r.hit.object as THREE.Mesh).geometry?.type, owner: r.owner.type + ':' + r.owner.name, uuid: r.owner.uuid }; } };
  // 调试：?level=1|2 直接从某一档开始（比如想看降档后的画面）
  const q = new URLSearchParams(location.search);
  for (let i = Math.min(3, Number(q.get('level')) || 0); i > 0; i--) degrade();
  // ?nodegrade：不自动降档。只给截图脚本用——没有显卡的截图环境一秒才一两帧，不锁住的话 high 档截出来全是降过档的样子
  if (q.has('nodegrade')) autoDegrade = false;
  // 调试：?hour=22 从晚上十点开始（和拨座钟一样，之后照样往前走）
  if (q.has('hour')) { const hv = q.get('hour')!; if (Number.isFinite(Number(hv))) setHours(Number(hv)); else setPreset(hv); }

  return () => {
    renderer.setAnimationLoop(null);
    mounted.forEach((m) => m.stop());
    offs.forEach((f) => f());
    io.disconnect();
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    pokeEvents.forEach((e) => removeEventListener(e, poke));
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('wheel', onWheel);
    void audioCtx?.close();
    post?.dispose();
    renderer.dispose();
  };
}
