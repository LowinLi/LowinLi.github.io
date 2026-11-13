import * as THREE from 'three';
import { BUDGETS } from './budgets';
import type { Mounted, SceneInput, SceneObject } from './types';
import type { Tier } from './tier';
import { orb } from './objects/orb';

/** 场景里挂载的物件清单。新物件：在 objects/ 下建文件，然后加到这里。 */
const OBJECTS: SceneObject[] = [orb];

export function start(canvas: HTMLCanvasElement, tier: Exclude<Tier, 'low'>) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, BUDGETS.maxPixelRatio[tier]));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 5);
  scene.add(key);

  const size = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    // 竖屏时拉远相机，让物件的横向占比和横屏一致
    camera.position.z = 5 / Math.min(1, Math.max(camera.aspect, 0.5));
    camera.updateProjectionMatrix();
    return { width: w, height: h };
  };
  const { width, height } = size();

  const ctx = { scene, camera, renderer, tier, width, height, audio: null as AudioContext | null };
  const mounted: Mounted[] = OBJECTS.map((o) => o(ctx));
  const send = (e: SceneInput) => mounted.forEach((m) => m.input?.(e));

  const onResize = () => send({ type: 'resize', ...size() });
  const onPointer = (e: PointerEvent) =>
    send({ type: 'pointer', x: (e.clientX / innerWidth) * 2 - 1, y: -((e.clientY / innerHeight) * 2 - 1) });
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    send({ type: 'scroll', progress: max > 0 ? scrollY / max : 0 });
  };
  const onFirstGesture = () => { ctx.audio ??= new AudioContext(); };
  addEventListener('resize', onResize);
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('pointerdown', onFirstGesture, { once: true });

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
    renderer.render(scene, camera);
  });

  // 暴露给 QA / 截图脚本读取的诊断信息
  (window as any).__scene = { tier, info: renderer.info };

  return () => {
    renderer.setAnimationLoop(null);
    mounted.forEach((m) => m.stop());
    io.disconnect();
    removeEventListener('resize', onResize);
    removeEventListener('pointermove', onPointer);
    removeEventListener('scroll', onScroll);
    renderer.dispose();
  };
}
