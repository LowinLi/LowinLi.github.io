import * as THREE from 'three';
import { emit, on, type SceneObject } from '../types';
import { LAYOUT, tvScreenCenter } from '../layout';
import { TAPES } from '../../tapes';
import { MONO, PHOSPHOR, PHOSPHOR_DIM, SCREEN_BG, type TapeInstance } from '../../tapes/types';

const W = 640, H = 480;
const K = 0.09; // 屏幕弧度，shader 和指针映射共用

/**
 * CRT 电视 + 录像机。播放磁带：监听 tape:loaded，ESC / tape:eject 退出。
 * 发出 tape:state {playing: id | null}、tape:ejected {id}。
 */
export const crt: SceneObject = ({ scene, renderer, tier, data, bus, pick, audio }) => {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const add = <T extends THREE.Object3D>(o: T) => { group.add(o); return o; };
  const std = (color: number, rough: number, metal = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    disposables.push(m); return m;
  };
  const boxGeo = (w: number, h: number, d: number) => { const g = new THREE.BoxGeometry(w, h, d); disposables.push(g); return g; };
  const { tv, vcr, screen } = LAYOUT;
  const shadow = tier === 'high';

  // 录像机
  const vcrMesh = add(new THREE.Mesh(boxGeo(tv.w - 0.04, vcr.h, tv.d - 0.1), std(0x1e1c1b, 0.5, 0.3)));
  vcrMesh.position.set(tv.x, vcr.h / 2, tv.z - 0.02);
  vcrMesh.castShadow = vcrMesh.receiveShadow = shadow;
  const slot = add(new THREE.Mesh(boxGeo(0.4, 0.035, 0.01), std(0x050505, 0.9)));
  slot.position.set(tv.x - 0.12, vcr.h * 0.55, tv.z + (tv.d - 0.1) / 2 - 0.02 + 0.006);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x331100 });
  disposables.push(ledMat);
  const led = add(new THREE.Mesh(boxGeo(0.06, 0.018, 0.005), ledMat));
  led.position.set(tv.x + 0.25, vcr.h * 0.55, slot.position.z + 0.001);

  // 电视外壳：后面一块收窄的盒子模拟显像管屁股
  const shell = std(0xcfc3ad, 0.55);
  const body = add(new THREE.Mesh(boxGeo(tv.w, tv.h, tv.d * 0.55), shell));
  body.position.set(tv.x, vcr.h + tv.h / 2, tv.z + tv.d * 0.225);
  const back = add(new THREE.Mesh(boxGeo(tv.w * 0.7, tv.h * 0.75, tv.d * 0.45), shell));
  back.position.set(tv.x, vcr.h + tv.h * 0.45, tv.z - tv.d * 0.27);
  for (const m of [body, back]) m.castShadow = m.receiveShadow = shadow;
  // 屏幕四周的深色凹框
  const sc = tvScreenCenter();
  const bezel = add(new THREE.Mesh(boxGeo(screen.w + 0.06, screen.h + 0.06, 0.01), std(0x161412, 0.7)));
  bezel.position.set(sc.x - 0.07, sc.y, sc.z - 0.008); // 前表面要落在屏幕后面
  // 旋钮
  const knobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16); disposables.push(knobGeo);
  for (const dy of [0.12, 0.02]) {
    const k = add(new THREE.Mesh(knobGeo, std(0x2a2522, 0.4)));
    k.rotation.x = Math.PI / 2; k.position.set(tv.x + tv.w / 2 - 0.08, sc.y + dy, sc.z + 0.005);
  }

  // 屏幕：2D canvas → CanvasTexture → CRT shader
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  disposables.push(tex);
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uNoise: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv; uniform sampler2D uMap; uniform float uTime, uNoise, uPower;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*43.1)*43758.5453); }
      void main(){
        vec2 c = vUv*2.-1.;
        c *= 1. + ${K.toFixed(3)} * dot(c,c);
        vec2 uv = c*.5+.5;
        if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }
        // 水平抖动 + 色散
        float jitter = (rnd(vec2(floor(uv.y*120.), 1.)) - .5) * .004 * uNoise;
        uv.x += jitter;
        vec3 col;
        col.r = texture2D(uMap, uv + vec2(.0015,0.)).r;
        col.g = texture2D(uMap, uv).g;
        col.b = texture2D(uMap, uv - vec2(.0015,0.)).b;
        float scan = .78 + .22 * sin(uv.y * 480. * 3.14159);
        col *= scan;
        col += (rnd(uv*vec2(640.,480.)) - .5) * (.022 + .9*uNoise);
        col *= 1. - .45 * pow(length(c)*.72, 3.);        // 暗角
        col *= .96 + .04 * sin(uTime*60.);                // 刷新闪烁
        col *= uPower;
        gl_FragColor = vec4(col*1.1, 1.);
        #include <colorspace_fragment>
      }`,
  });
  disposables.push(screenMat);
  const screenGeo = new THREE.PlaneGeometry(screen.w, screen.h);
  disposables.push(screenGeo);
  const screenMesh = add(new THREE.Mesh(screenGeo, screenMat));
  screenMesh.position.set(sc.x - 0.07, sc.y, sc.z);

  // 屏幕在桌面上投下的光
  const glow = add(new THREE.PointLight(0xffa040, 0, 2.2, 1.8));
  glow.position.set(sc.x - 0.07, sc.y, sc.z + 0.35);

  scene.add(group);

  // ---- 播放器状态 ----
  let tape: TapeInstance | null = null;
  let tapeId: string | null = null;
  let noise = 0.0;
  let pointerDown = false;
  let idleT = 0;

  const navigate = (url: string) => { location.href = url; };
  const drawIdle = (t: number) => {
    ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PHOSPHOR; ctx.font = `bold 30px ${MONO}`;
    ctx.fillText('NO SIGNAL', 48, 70);
    ctx.font = `20px ${MONO}`; ctx.fillStyle = PHOSPHOR_DIM;
    ctx.fillText('CH 03', W - 120, 70);
    ctx.fillStyle = '#e9c99a'; ctx.font = `22px ${MONO}`;
    if (Math.floor(t * 1.5) % 2 === 0) ctx.fillText('▶ 从右边挑一盘磁带', 48, H / 2);
    const d = new Date();
    ctx.fillStyle = PHOSPHOR_DIM; ctx.font = `18px ${MONO}`;
    ctx.fillText(d.toTimeString().slice(0, 8), 48, H - 32);
  };

  const clunk = (freq: number) => {
    const ac = audio(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.05, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.13);
  };

  const off: (() => void)[] = [];
  off.push(on<{ id: string }>(bus, 'tape:loaded', ({ id }) => {
    const def = TAPES.find((t) => t.id === id); if (!def) return;
    tape?.stop();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, 0, W, H);
    tape = def.mount({ canvas, ctx, width: W, height: H, audio, data, navigate });
    tapeId = id; noise = 1;
    ledMat.color.set(0xff3311);
    clunk(90);
    emit(bus, 'tape:state', { playing: id });
  }));
  const eject = () => {
    if (!tapeId) return;
    const id = tapeId;
    tape?.stop(); tape = null; tapeId = null; noise = 1;
    ledMat.color.set(0x331100);
    clunk(70);
    emit(bus, 'tape:state', { playing: null });
    emit(bus, 'tape:ejected', { id });
  };
  off.push(on(bus, 'tape:eject', eject));

  // 指针映射到画布像素：跟 shader 用同一条弧度公式
  const toCanvas = (hit: THREE.Intersection) => {
    const uv = hit.uv!;
    let cx = uv.x * 2 - 1, cy = uv.y * 2 - 1;
    const f = 1 + K * (cx * cx + cy * cy);
    cx *= f; cy *= f;
    return { x: (cx * 0.5 + 0.5) * W, y: (1 - (cy * 0.5 + 0.5)) * H };
  };
  pick(screenMesh, {
    move(hit) { const p = toCanvas(hit); tape?.input?.({ type: 'pointer', ...p, down: pointerDown }); },
    click(hit) { if (tape) tape.input?.({ type: 'click', ...toCanvas(hit) }); },
  });
  const el = renderer.domElement;
  const down = () => { pointerDown = true; };
  const up = () => { pointerDown = false; tape?.input?.({ type: 'pointer', x: -1, y: -1, down: false }); };
  el.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);

  return {
    frame(dt, t) {
      noise = Math.max(0, noise - dt * 2.2);
      screenMat.uniforms.uTime.value = t;
      screenMat.uniforms.uNoise.value = noise;
      if (tape) tape.frame(dt, t); else { idleT += dt; drawIdle(idleT); }
      tex.needsUpdate = true;
      glow.intensity = tape ? 0.9 + Math.sin(t * 50) * 0.04 : 0.35;
    },
    input(e) {
      if (e.type !== 'key' || !tape) return;
      if (e.key === 'Escape') eject();
      else tape.input?.({ type: 'key', key: e.key });
    },
    stop() {
      tape?.stop();
      off.forEach((f) => f());
      el.removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
      scene.remove(group);
      disposables.forEach((d) => d.dispose());
    },
  };
};
