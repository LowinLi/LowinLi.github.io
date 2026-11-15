import * as THREE from 'three';
import { BUDGETS } from './budgets';
import { emit, on, type MountContext, type Mounted, type PickHandlers, type SceneInput, type SceneObject, type SiteData } from './types';
import type { Tier } from './tier';
import { createPost } from './post';
import { seaSky } from './objects/seaSky';
import { boat } from './objects/boat';
import { desk } from './objects/desk';
import { room } from './objects/room';
import { monitor } from './objects/monitor';
import { bookshelf } from './objects/bookshelf';
import { gramophone } from './objects/gramophone';
import { plants } from './objects/plants';
import { gulls } from './objects/gulls';
import { dust } from './objects/dust';
import { cameraRig } from './objects/cameraRig';

/** 场景里挂载的物件清单。新物件：在 objects/ 下建文件，然后加到这里。cameraRig 放最后。 */
const OBJECTS: SceneObject[] = [seaSky, boat, room, desk, monitor, bookshelf, gramophone, plants, gulls, dust, cameraRig];

export function start(canvas: HTMLCanvasElement, tier: Exclude<Tier, 'low'>, data: SiteData, bus: EventTarget) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, BUDGETS.maxPixelRatio[tier]));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  if (tier === 'high') {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  let monitorFocused = false;
  const offs = [
    on(bus, 'monitor:focus', () => { monitorFocused = true; }),
    on(bus, 'monitor:blur', () => { monitorFocused = false; }),
    on(bus, 'scene:changed', () => post?.refresh()),
  ];

  const onResize = () => send({ type: 'resize', ...size() });
  let downAt: { x: number; y: number } | null = null;
  let lastX = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    send({ type: 'pointer', x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) });
    if (downAt) { send({ type: 'drag', dx: (e.clientX - lastX) / r.width }); lastX = e.clientX; }
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
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; lastX = e.clientX; };
  const onUp = (e: PointerEvent) => {
    const start = downAt; downAt = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const res = cast(e);
    if (res) pickables.get(res.owner)?.click?.(res.hit);
    else if (monitorFocused) emit(bus, 'monitor:blur'); // 点显示器外面退出
  };
  const onCancel = () => { downAt = null; };
  addEventListener('resize', onResize);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // 不在视口内或标签页隐藏时停止渲染
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible || document.hidden) return;
    const t = clock.elapsedTime;
    for (const m of mounted) m.frame(dt, t);
    renderer.info.reset();
    if (post) post.render(dt); else renderer.render(scene, camera);
  });

  // 暴露给 QA / 截图脚本读取的诊断信息
  (window as any).__scene = { tier, info: renderer.info, bus, emit: (type: string, d?: unknown) => emit(bus, type, d) };

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
    void audioCtx?.close();
    post?.dispose();
    renderer.dispose();
  };
}
