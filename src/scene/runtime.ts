import * as THREE from 'three';
import { BUDGETS } from './budgets';
import { emit, on, type MountContext, type Mounted, type PickHandlers, type SceneInput, type SceneObject, type SiteData } from './types';
import type { Tier } from './tier';
import { createPost } from './post';
import { sky } from './objects/sky';
import { countryside } from './objects/countryside';
import { animals } from './objects/animals';
import { desk } from './objects/desk';
import { room } from './objects/room';
import { monitor } from './objects/monitor';
import { bookshelf } from './objects/bookshelf';
import { gramophone } from './objects/gramophone';
import { plants } from './objects/plants';
import { furniture } from './objects/furniture';
import { dust } from './objects/dust';
import { cameraRig } from './objects/cameraRig';

/** 场景里挂载的物件清单。新物件：在 objects/ 下建文件，然后加到这里。cameraRig 放最后。 */
const OBJECTS: SceneObject[] = [sky, countryside, animals, room, furniture, desk, monitor, bookshelf, gramophone, plants, dust, cameraRig];

export function start(canvas: HTMLCanvasElement, tier: Exclude<Tier, 'low'>, data: SiteData, bus: EventTarget) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'high-performance' });
  const basePR = Math.min(devicePixelRatio, BUDGETS.maxPixelRatio[tier]);
  renderer.setPixelRatio(basePR);
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
  const mounted: Mounted[] = OBJECTS.map((o) => o(ctx));
  const send = (e: SceneInput) => mounted.forEach((m) => m.input?.(e));
  send({ type: 'resize', width, height });

  let monitorFocused = false, windowFocused = false, bookOpen = false;
  // 缩放：1 是默认距离。只在自由视角下生效（没在看显示器 / 窗外 / 书）
  const ZOOM_MIN = 0.45, ZOOM_MAX = 2.4;
  let zoomK = 1;
  const free = () => !monitorFocused && !windowFocused && !bookOpen;
  const setZoom = (k: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
    if (next === zoomK) return false;
    zoomK = next; send({ type: 'zoom', k: zoomK });
    return true;
  };
  const offs = [
    on(bus, 'monitor:focus', () => { monitorFocused = true; }),
    on(bus, 'monitor:blur', () => { monitorFocused = false; }),
    on(bus, 'scene:changed', () => post?.refresh()),
    on(bus, 'book:open', () => { bookOpen = true; }),
    on(bus, 'book:close', () => { bookOpen = false; }),
    on<{ dir: number }>(bus, 'view:zoom', ({ dir }) => { if (free()) setZoom(zoomK * (dir > 0 ? 0.75 : 1 / 0.75)); }),
    on(bus, 'view:reset', () => setZoom(1)),
    on(bus, 'window:focus', () => { windowFocused = true; post?.setFarBlur(false); }),
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
    if (windowFocused) { emit(bus, 'window:blur'); return; }
    if (monitorFocused && !res?.owner.userData.keepsMonitor) { emit(bus, 'monitor:blur'); return; }
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
  // 没法预知访客的显卡：开头几秒量帧率，持续低于 30 帧就降一档，最多降两档，不再升回去。
  //   high：1 = 关掉遮蔽 / 景深 / 光束，像素比 1.25；2 = 关掉全部后期和阴影更新，像素比 1
  //   mid ：1 = 像素比 1；2 = 像素比 0.75
  let level = 0, frames = 0, acc = 0, warm = 0, usePost = !!post, shadowEvery = 2, tick = 0;
  const degrade = () => {
    level++;
    if (tier === 'high') {
      if (level === 1) { post?.setLite(true); renderer.setPixelRatio(Math.min(basePR, 1.25)); shadowEvery = 4; }
      else { usePost = false; shadowEvery = 0; renderer.setPixelRatio(Math.min(basePR, 1)); emit(bus, 'quality:nopost'); }
    } else renderer.setPixelRatio(Math.min(basePR, level === 1 ? 1 : 0.75));
    onResize();
    (window as any).__scene.level = level;
    console.info(`[scene] 帧率偏低，自动降到第 ${level} 档`);
  };

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta(), dt = Math.min(raw, 0.1);
    if (!visible || document.hidden) { frames = 0; acc = 0; return; }
    const t = clock.elapsedTime;
    for (const m of mounted) m.frame(dt, t);
    renderer.info.reset();
    if (tier === 'high') renderer.shadowMap.needsUpdate = tick < 120 || (shadowEvery > 0 && tick % shadowEvery === 0); // 开头连续更新，等模型都加载进来
    tick++;
    if (post && usePost) post.render(dt); else renderer.render(scene, camera);
    // 量帧率：跳过开头 3 秒（加载、编译着色器），之后每 90 帧看一次平均值；单帧超过半秒的卡顿（切标签页回来）不算
    if (level < 2 && raw < 0.5) {
      warm += raw;
      if (warm > 3) { frames++; acc += raw; if (frames >= 90) { if (frames / acc < 30) degrade(); frames = 0; acc = 0; } }
    }
  });

  // 暴露给 QA / 截图脚本读取的诊断信息
  (window as any).__scene = { tier, level: 0, info: renderer.info, scene, bus, emit: (type: string, d?: unknown) => emit(bus, type, d) };
  // 调试：?level=1|2 直接从某一档开始（比如想看降档后的画面）
  for (let i = Math.min(2, Number(new URLSearchParams(location.search).get('level')) || 0); i > 0; i--) degrade();

  return () => {
    renderer.setAnimationLoop(null);
    mounted.forEach((m) => m.stop());
    offs.forEach((f) => f());
    io.disconnect();
    removeEventListener('resize', onResize);
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
