import * as THREE from 'three';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { blob, canvasTex, contactMaterial, rng } from '../util';
import { MACHINE } from './coffee';

/**
 * 两杯咖啡和咖啡机的出咖啡按钮。
 *
 * 杯位有两个：书桌上的杯垫、咖啡机接水盘。两只杯子（红边马克杯、带碟子的拿铁杯）各占一个。
 * - 点一只杯子：把它端起来，放到镜头跟前（镜头不动），微微朝你倾，能看清拉花。
 * - 端着时再点它：凑到嘴边喝一口，液面降 1/3，拉花被喝散；三口喝完露出杯底的咖啡渍，杯子自动放回原处。
 * - 点旁边 / ESC / 返回：把杯子放回原处。
 * - 点桌上的空杯：和咖啡机下的杯子对调——满的端到桌上，空的放回咖啡机下。
 * - 点咖啡机上的按钮：机器下的杯子是空的，就打一杯新的（两道咖啡流下来、液面升满、浮出拉花）。
 *
 * 发出 cup:focus {p: [x,y,z]}（端起杯子，景深对焦到杯子）/ cup:blur（放下）、cup:state {msg}（HTML 层显示提示）。
 */
type Slot = 'desk' | 'machine';
const SLOT_POS: Record<Slot, THREE.Vector3> = {
  desk: new THREE.Vector3(-0.47, 0.006, 0.29),
  machine: new THREE.Vector3(L.coffee.x, MACHINE.trayY, MACHINE.cupZ),
};

/**
 * 液面的贴图：拉花（心形、叶子）、被喝散的奶泡、刚流进来的油脂、喝完的杯底渍。每张都配一张粗糙度图：
 * 奶泡是哑的（粗糙），油脂是湿亮的（光滑），液面才像液体。
 * 画法照着真的拿铁：油脂是中间浅、边上深的棕色，带「虎斑」；奶泡是柔边的乳白色，边缘晕出一圈浅棕，上面有细小的气泡；
 * 液面和杯壁相接的地方有一圈深色，最外面一道细细的亮边（弯月面反光）。
 */
export type Surf = { map: THREE.Texture; rough: THREE.Texture };
function surfaceTextures(bin: Bin) {
  const S = 512, c = S / 2;
  const rnd = rng(91);
  const hasFilter = typeof (document.createElement('canvas').getContext('2d') as unknown as { filter?: unknown }).filter === 'string';
  /**
   * 柔边：先画到一张临时画布上，再整张模糊着贴回来（ctx.filter 对每一次绘制都做一次全画布模糊，
   * 直接在模糊状态下画几千个小点会把页面卡死）。不支持 filter 的浏览器（老 Safari）就抖动着贴几遍近似。
   */
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
  const tg = tmp.getContext('2d')!;
  const soft = (g: CanvasRenderingContext2D, px: number, draw: (g: CanvasRenderingContext2D) => void) => {
    tg.clearRect(0, 0, S, S); draw(tg);
    if (hasFilter) { g.filter = `blur(${px}px)`; g.drawImage(tmp, 0, 0); g.filter = 'none'; return; }
    const a = g.globalAlpha; g.globalAlpha = a / 6;
    for (let k = 0; k < 6; k++) g.drawImage(tmp, Math.cos(k) * px * 0.6, Math.sin(k) * px * 0.6);
    g.globalAlpha = a;
  };
  const crema = (g: CanvasRenderingContext2D) => {
    const grad = g.createRadialGradient(c, c, 10, c, c, c);
    grad.addColorStop(0, '#b0733d'); grad.addColorStop(0.55, '#985a28'); grad.addColorStop(0.86, '#7a4118'); grad.addColorStop(0.97, '#5a2f12'); grad.addColorStop(1, '#3e200b');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    // 虎斑：深浅交错的小斑点，模糊开
    soft(g, 2.2, (g) => {
      for (let i = 0; i < 2600; i++) {
        const a = rnd() * 6.283, d = Math.sqrt(rnd()) * c * 0.95;
        g.fillStyle = rnd() < 0.55 ? `rgba(70,32,8,${0.06 + rnd() * 0.08})` : `rgba(230,170,110,${0.05 + rnd() * 0.07})`;
        g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + rnd() * 6, 1 + rnd() * 3, a, 0, 7); g.fill();
      }
    });
  };
  const rim = (g: CanvasRenderingContext2D) => {
    g.strokeStyle = 'rgba(45,22,6,.55)'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c - 8, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,232,205,.45)'; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, c - 3, 0, 7); g.stroke(); // 弯月面的亮边
  };
  const FOAM = '#f5e9d6';
  /** 奶泡：先画一圈晕开的浅棕边，再画柔边的乳白，最后撒细气泡 */
  const foam = (g: CanvasRenderingContext2D, path: (g: CanvasRenderingContext2D) => void) => {
    soft(g, 7, (g) => { g.fillStyle = 'rgba(214,160,104,.55)'; path(g); g.fill(); });
    soft(g, 1.6, (g) => { g.fillStyle = FOAM; path(g); g.fill(); });
    g.save(); path(g); g.clip();
    for (let i = 0; i < 1800; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(190,150,110,.18)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.4, 0, 7); g.fill(); }
    g.restore();
  };
  const make = (draw: (g: CanvasRenderingContext2D) => void, base = true): Surf => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    if (base) crema(g);
    draw(g);
    if (base) rim(g);
    // 粗糙度图：浅色（奶泡）粗糙、深色（油脂）光滑
    const rc = document.createElement('canvas'); rc.width = rc.height = S;
    const rg = rc.getContext('2d')!, src = g.getImageData(0, 0, S, S), dst = rg.createImageData(S, S);
    for (let i = 0; i < src.data.length; i += 4) {
      const l = (src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11) / 255;
      const t = Math.min(1, Math.max(0, (l - 0.45) / 0.35));
      const v = Math.round((base ? 0.1 + t * 0.5 : 0.25 + t * 0.2) * 255);
      dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = v; dst.data[i + 3] = 255;
    }
    rg.putImageData(dst, 0, 0);
    const map = bin.add(new THREE.CanvasTexture(cv)), rough = bin.add(new THREE.CanvasTexture(rc));
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    return { map, rough };
  };
  // 心形：几层心叠在一起，中间一道拉花针拖出来的细线；形状略歪，手拉的不会完全对称
  const heart = make((g) => {
    const H = (s: number, dx: number) => (gg: CanvasRenderingContext2D) => {
      gg.beginPath(); gg.moveTo(c + dx, c + 118 * s);
      gg.bezierCurveTo(c - 190 * s + dx, c - 10 * s, c - 92 * s, c - 168 * s, c + dx * 0.5, c - 62 * s);
      gg.bezierCurveTo(c + 98 * s, c - 160 * s, c + 182 * s + dx, c - 6 * s, c + dx, c + 118 * s); gg.closePath();
    };
    foam(g, H(1, 4));
    for (const [s, dx] of [[0.72, 3], [0.46, 1]] as const) { soft(g, 2, (g) => { g.fillStyle = 'rgba(178,112,58,.9)'; H(s + 0.06, dx)(g); g.fill(); }); foam(g, H(s, dx)); }
    soft(g, 1.2, (g) => { g.strokeStyle = 'rgba(160,98,48,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(c + 2, c - 120); g.quadraticCurveTo(c + 6, c, c + 4, c + 132); g.stroke(); });
  });
  // 郁金香（tulip）：三团一团比一团小的奶泡从下往上叠，最上面一团是小心形，一道细线从顶上拖到底。
  // 液面是平的、从斜上方看会被压扁到三分之一左右，一层层细叶片（rosetta）压扁后只剩几道线，所以用整团的 tulip
  const leaf = make((g) => {
    const blob2 = (cy: number, rx: number, ry: number) => (gg: CanvasRenderingContext2D) => {
      gg.beginPath(); gg.moveTo(c - rx, cy);
      gg.bezierCurveTo(c - rx, cy - ry * 1.3, c + rx, cy - ry * 1.3, c + rx, cy);
      gg.bezierCurveTo(c + rx * 0.9, cy + ry * 0.7, c + rx * 0.2, cy + ry * 0.55, c, cy + ry * 0.35);
      gg.bezierCurveTo(c - rx * 0.2, cy + ry * 0.55, c - rx * 0.9, cy + ry * 0.7, c - rx, cy); gg.closePath();
    };
    foam(g, blob2(c + 112, 150, 86));
    soft(g, 2, (g) => { g.fillStyle = 'rgba(176,110,56,.9)'; blob2(c + 22, 120, 72)(g); g.fill(); });
    foam(g, blob2(c + 18, 112, 68));
    soft(g, 2, (g) => { g.fillStyle = 'rgba(176,110,56,.9)'; blob2(c - 62, 90, 58)(g); g.fill(); });
    foam(g, blob2(c - 66, 84, 54));
    foam(g, (gg) => { gg.beginPath(); gg.moveTo(c, c - 112); gg.bezierCurveTo(c - 52, c - 150, c - 30, c - 196, c, c - 168); gg.bezierCurveTo(c + 30, c - 196, c + 52, c - 150, c, c - 112); gg.closePath(); });
    soft(g, 1.2, (g) => { g.strokeStyle = 'rgba(160,98,48,.9)'; g.lineWidth = 4; g.beginPath(); g.moveTo(c, c - 176); g.lineTo(c, c + 200); g.stroke(); });
  });
  // 喝过之后：奶泡散成一圈不规则的碎片，杯壁那一圈留着泡沫的「蕾丝」
  const sipped = make((g) => {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.283, d = c * (0.45 + rnd() * 0.42), rx = 18 + rnd() * 40, ry = 10 + rnd() * 22;
      foam(g, (gg) => { gg.beginPath(); gg.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, rx, ry, a + 1.57, 0, 7); });
    }
    soft(g, 3, (g) => { g.strokeStyle = 'rgba(240,222,196,.55)'; g.lineWidth = 16; g.beginPath(); g.arc(c, c, c * 0.9, 0, 7); g.stroke(); });
  });
  const cremaOnly = make(() => {});
  // 杯底：白瓷上一层没喝净的咖啡渍，中间深、往外淡，还有几滴
  const dregs = make((g) => {
    g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, S, S);
    const r = g.createRadialGradient(c, c, 20, c, c, c);
    r.addColorStop(0, 'rgba(92,52,22,.8)'); r.addColorStop(0.5, 'rgba(110,64,28,.45)'); r.addColorStop(0.8, 'rgba(150,100,60,.18)'); r.addColorStop(1, 'rgba(150,100,60,0)');
    g.fillStyle = r; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.283, d = c * (0.4 + rnd() * 0.5); g.fillStyle = `rgba(80,42,14,${0.3 + rnd() * 0.4})`; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + rnd() * 5, 0, 7); g.fill(); }
  }, false);
  return { leaf, heart, sipped, crema: cremaOnly, dregs };
}

/** 杯子的内壁轮廓（半径随高度变化），液面的半径要跟着它 */
const SEG = 40; // 液面一圈的点数
const innerR = (prof: [number, number][], h: number) => {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (h <= y1) return r0 + (r1 - r0) * ((h - y0) / Math.max(1e-6, y1 - y0));
  }
  return prof[prof.length - 1][0];
};

export const cups: SceneObject = ({ scene, camera, tier, bus, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const ceramic = bin.add(new THREE.MeshStandardMaterial({ color: 0xfaf8f3, roughness: 0.14 }));
  const tex = surfaceTextures(bin);
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);
  const L3 = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

  interface Cup {
    id: string; root: THREE.Group; body: THREE.Group; surface: THREE.Mesh; surfMat: THREE.MeshPhysicalMaterial; art: Surf;
    slosh: THREE.Vector2; sloshV: THREE.Vector2; lastP: THREE.Vector3; lastV: THREE.Vector3;
    prof: [number, number][]; full: number; empty: number; level: number; shown: number; slot: Slot;
    from: THREE.Vector3; to: THREE.Vector3; move: number; sip: number; steam: { s: THREE.Sprite; m: THREE.SpriteMaterial; life: number; seed: number }[];
  }
  const steamTex = bin.add(canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }));
  const hitGeo = bin.add(new THREE.CylinderGeometry(0.058, 0.058, 0.11, 12));
  const hitMat = bin.add(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  const makeCup = (id: string, slot: Slot, build: (body: THREE.Group) => { prof: [number, number][]; base: number; art: Surf }) => {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const { prof, base, art } = build(body);
    // 液面：湿亮的清漆层 + 粗糙度图（奶泡哑、油脂亮），映出天光才像液体
    const surfMat = bin.add(new THREE.MeshPhysicalMaterial({ map: art.map, roughnessMap: art.rough, roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.05, envMapIntensity: 0.38 }));
    // 液面的形状每帧重算（见 levelSurface）：一个中心点 + 一圈 SEG 个点的扇形
    const sg = bin.add(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2), 2));
    sg.setIndex(Array.from({ length: SEG }, (_, k) => [0, 1 + ((k + 1) % SEG), 1 + k]).flat());
    const surface = new THREE.Mesh(sg, surfMat);
    surface.frustumCulled = false;
    body.add(surface);
    const sh = new THREE.Mesh(bin.add(blob(0.06, 0.06)), contact); sh.position.y = 0.0006; root.add(sh);
    body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = high; m.receiveShadow = high; } });
    root.position.copy(SLOT_POS[slot]);
    root.userData.keepsCup = true;
    root.userData.cupId = id;
    group.add(root);
    const top = prof[prof.length - 1][1];
    const cup: Cup = { id, root, body, surface, surfMat, art, prof: prof.map(([r, y]) => [r, y + base]) as [number, number][], full: top - 0.004 + base, empty: prof[0][1] + base + 0.0015, level: 3, shown: 3, slot,
      from: root.position.clone(), to: root.position.clone(), move: 1, sip: 0, steam: [],
      slosh: new THREE.Vector2(), sloshV: new THREE.Vector2(), lastP: root.position.clone(), lastV: new THREE.Vector3() };
    for (let i = 0; i < (high ? 4 : 2); i++) {
      const m = bin.add(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false, color: 0xfff3e2 }));
      const s = new THREE.Sprite(m); group.add(s); cup.steam.push({ s, m, life: i / 4, seed: i * 1.9 + id.length });
    }
    // 看不见的点击区：比杯子大一圈、高一截，矮的拿铁杯也好点，点杯口上方也不会穿到后面的笔记本
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 0.055; hit.layers.set(HIT_LAYER); root.add(hit);
        pick(root, { click: () => onCupClick(cup) });
    return cup;
  };

  // 红边马克杯：内壁从杯底 (0.033, 0.012) 到杯口 (0.037, 0.085)
  const mug = makeCup('mug', 'desk', (body) => {
    body.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(L3([[0, 0], [0.033, 0], [0.036, 0.004], [0.041, 0.085], [0.042, 0.092], [0.039, 0.092], [0.037, 0.085], [0.033, 0.012], [0, 0.012]]), 40)), ceramic));
    const handle = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.024, 0.006, 10, 20, Math.PI)), ceramic); handle.position.set(0.04, 0.049, 0); handle.rotation.z = -Math.PI / 2; body.add(handle);
    body.add(new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0412, 0.0405, 0.012, 40, 1, true).translate(0, 0.066, 0)), bin.add(new THREE.MeshStandardMaterial({ color: 0x9b3d2c, roughness: 0.3 }))));
    return { prof: [[0.033, 0.012], [0.037, 0.085], [0.039, 0.092]], base: 0, art: tex.heart };
  });
  // 拿铁杯和碟子：杯子坐在碟子上（高 0.008），内壁从 (0.024, 0.012) 到 (0.036, 0.05)
  const latte = makeCup('latte', 'machine', (body) => {
    body.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(L3([[0, 0], [0.036, 0], [0.05, 0.004], [0.052, 0.008], [0.03, 0.008]]), 40)), ceramic));
    const cupG = new THREE.Mesh(bin.add(new THREE.LatheGeometry(L3([[0, 0], [0.022, 0], [0.027, 0.006], [0.04, 0.05], [0.041, 0.056], [0.0385, 0.056], [0.036, 0.05], [0.024, 0.012], [0, 0.012]]), 40)), ceramic);
    cupG.position.y = 0.008; body.add(cupG);
    const handle = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.016, 0.0045, 8, 16, Math.PI)), ceramic); handle.position.set(0.04, 0.04, 0); handle.rotation.z = -Math.PI / 2; body.add(handle);
    return { prof: [[0.024, 0.012], [0.036, 0.05], [0.0385, 0.056]], base: 0.008, art: tex.leaf };
  });
  const all = [mug, latte];
  scene.add(group);

  // ---- 出咖啡的按钮（咖啡机面板右边）：一圈会亮的绿灯 + 中间一个小杯子图标 ----
  const btnTex = bin.add(canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#26272a'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.strokeStyle = '#f5f2ea'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c - 26, c - 14); g.lineTo(c - 20, c + 24); g.lineTo(c + 14, c + 24); g.lineTo(c + 20, c - 14); g.closePath(); g.stroke();
    g.beginPath(); g.arc(c + 26, c + 3, 10, -Math.PI / 2, Math.PI / 2); g.stroke();
    for (const dx of [-10, 4]) { g.beginPath(); g.moveTo(c + dx, c - 24); g.quadraticCurveTo(c + dx + 6, c - 32, c + dx, c - 40); g.stroke(); }
  }));
  const btn = new THREE.Group();
  btn.position.set(MACHINE.buttonX, MACHINE.buttonY, MACHINE.panelZ + 0.004);
  const cap = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.015, 0.016, 0.012, 24).rotateX(Math.PI / 2)), [
    bin.add(new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.4 })), bin.add(new THREE.MeshStandardMaterial({ map: btnTex, roughness: 0.4 })), bin.add(new THREE.MeshStandardMaterial({ color: 0x1a1b1d })),
  ]);
  cap.position.z = 0.006;
  const ringMat = bin.add(new THREE.MeshBasicMaterial({ color: 0x3fd36a }));
  const ring = new THREE.Mesh(bin.add(new THREE.RingGeometry(0.0165, 0.0195, 32)), ringMat); ring.position.z = 0.0015;
  btn.add(cap, ring);
  btn.userData.keepsMachine = true; // 看着杯子时点按钮不算「点旁边」
  group.add(btn);
  let press = 0;
  pick(btn, { click: () => brew() });

  // ---- 咖啡流：从两个出水嘴流到杯子里 ----
  const streamMat = bin.add(new THREE.MeshBasicMaterial({ color: 0x5a3214, transparent: true, opacity: 0 }));
  const streams = [-0.011, 0.011].map((dx) => {
    const m = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0022, 0.0018, 1, 6).translate(0, -0.5, 0)), streamMat);
    m.position.set(L.coffee.x + dx, MACHINE.spoutY, MACHINE.cupZ); m.visible = false; group.add(m);
    return m;
  });
  let brewing = 0; // >0 表示正在出咖啡，单位秒
  const BREW = 3.2;

  // ---- 状态和提示 ----
  let held: Cup | null = null;
  const say = (msg: string | null) => emit(bus, 'cup:state', msg ? { msg } : null);
  const hint = (c: Cup) => {
    if (c.level > 0) return `点杯子喝一口 · 还剩 ${['', '三分之一', '三分之二', '满满一杯'][c.level]}`;
    return c.slot === 'desk' ? '喝完了 · 点桌上的空杯，和咖啡机下的那杯换一下' : '喝完了 · 点咖啡机上的按钮再打一杯';
  };
  const surfaceY = (c: Cup, lv: number) => c.empty + (c.full - c.empty) * (lv / 3);
  const setSurf = (c: Cup, t: Surf) => { c.surfMat.map = t.map; c.surfMat.roughnessMap = t.rough; c.surfMat.needsUpdate = true; };
  /**
   * 液面永远是水平的：杯子端起来、倾斜，液面不跟着歪，而是一个水平面和杯子内壁的交线围成的形状（杯子歪了它就成了偏向低处的椭圆，
   * 凑到嘴边喝时液面涌到杯沿）。在杯子自己的坐标系里，用「世界的上方向」（再加一点晃动）当平面法线，过中轴上液面高度那一点；
   * 每个方位角上沿内壁二分查找和平面的交点（最高到杯沿）。
   */
  const qInv = new THREE.Quaternion(), nL = new THREE.Vector3(), up = new THREE.Vector3();
  const levelSurface = (c: Cup, y: number) => {
    c.body.updateWorldMatrix(true, false);
    c.body.getWorldQuaternion(qInv).invert();
    nL.copy(up.set(c.slosh.x, 1, c.slosh.y).normalize()).applyQuaternion(qInv);
    const g = c.surface.geometry, P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute, U = g.attributes.uv as THREE.BufferAttribute;
    const h0 = c.prof[0][1], h1 = c.prof[c.prof.length - 1][1], rArt = innerR(c.prof, y);
    P.setXYZ(0, 0, y, 0); U.setXY(0, 0.5, 0.5);
    for (let k = 0; k < SEG; k++) {
      const th = (k / SEG) * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th);
      const f = (h: number) => { const R = innerR(c.prof, h); return nL.x * R * cx + nL.y * (h - y) + nL.z * R * sz; };
      let lo = h0, hi = h1;
      if (f(lo) > 0) hi = lo; else if (f(hi) < 0) lo = hi;
      else for (let it = 0; it < 16; it++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
      const h = (lo + hi) / 2, R = innerR(c.prof, h) - 0.0006;
      P.setXYZ(k + 1, R * cx, h, R * sz);
      // 拉花贴图跟着杯子转（转 0.4 是让心形 / 叶子朝镜头摆正）
      const ux = (R * cx) / (2 * rArt), uz = (R * sz) / (2 * rArt), a = 0.4;
      U.setXY(k + 1, 0.5 + ux * Math.cos(a) - uz * Math.sin(a), 0.5 + ux * Math.sin(a) + uz * Math.cos(a));
    }
    for (let k = 0; k <= SEG; k++) N.setXYZ(k, nL.x, nL.y, nL.z);
    P.needsUpdate = true; N.needsUpdate = true; U.needsUpdate = true;
  };
  /** 晃动：杯子移动时液面往加速度的反方向歪一下，再像弹簧一样晃回来 */
  const vNow = new THREE.Vector3(), acc = new THREE.Vector3();
  const slosh = (c: Cup, dt: number) => {
    if (dt <= 0) return;
    vNow.copy(c.root.position).sub(c.lastP).divideScalar(dt);
    acc.copy(vNow).sub(c.lastV).divideScalar(dt);
    c.lastP.copy(c.root.position); c.lastV.copy(vNow);
    const k = 90, damping = 6, gain = 0.012;
    c.sloshV.x += (-k * c.slosh.x - damping * c.sloshV.x - acc.x * gain * k) * dt;
    c.sloshV.y += (-k * c.slosh.y - damping * c.sloshV.y - acc.z * gain * k) * dt;
    c.slosh.addScaledVector(c.sloshV, dt).clampLength(0, 0.22);
  };
  // 端在眼前的位置（相机坐标系）：略偏右下，离镜头 0.3 米；竖屏离远一点免得出画
  // 液面是水平的，要从上往下看才看得到拉花：杯子端得比眼睛低一截（俯角三十多度），杯身只微微朝你倾
  const HOLD = new THREE.Vector3(0.04, -0.105, -0.25), TILT = 0.3;
  const holdPose = (c: Cup, k: number, pos: THREE.Vector3, quat: THREE.Quaternion) => {
    const far = Math.max(1, 0.75 / camera.aspect);
    // 喝一口（k 从 0 到 1 再回 0）：往镜头凑、往上抬、杯口朝你倾得更厉害
    pos.set(HOLD.x, HOLD.y + (c.id === 'latte' ? 0.035 : 0) + k * 0.035, HOLD.z * far + k * 0.1).applyMatrix4(camera.matrixWorld); // 拿铁杯矮，端高一点
    quat.copy(camera.quaternion).multiply(tmpQ.setFromEuler(tmpE.set(TILT + k * 0.75, -0.5, 0, 'YXZ')));
  };
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion(), ident = new THREE.Quaternion();
  const hold = (c: Cup) => {
    held = c;
    camera.updateMatrixWorld();
    holdPose(c, 0, want, wantQ);
    emit(bus, 'cup:focus', { p: want.toArray(), by: 'cups' });
    say(hint(c));
  };
  const putDown = () => { if (held) { held = null; emit(bus, 'cup:blur'); } };
  const onCupClick = (c: Cup) => {
    if (brewing > 0 && c.slot === 'machine') return;
    if (c.move < 1) return;
    if (c.level === 0 && c.slot === 'desk' && held !== c) { swap(); return; }
    if (c.level === 0) { putDown(); say(hint(c)); return; }
    if (held !== c) { if (held) putDown(); hold(c); return; }
    if (c.sip === 0) c.sip = 0.0001; // 喝一口的动画在 frame 里推进，喝到一半时液面降一格
  };
  const swap = () => {
    const other = all.find((x) => x.slot === 'machine')!, empty = all.find((x) => x.slot === 'desk')!;
    if (!other || !empty || brewing > 0) return;
    putDown();
    for (const [c, s] of [[other, 'desk'], [empty, 'machine']] as const) { c.slot = s; c.from.copy(c.root.position); c.to.copy(SLOT_POS[s]); c.move = 0; }
    say(null);
  };
  const brew = () => {
    const c = all.find((x) => x.slot === 'machine');
    press = 1;
    if (!c || brewing > 0) return;
    if (held === c) putDown();
    if (c.level > 0) { say('机器下的杯子还没喝完'); setTimeout(() => held || say(null), 1800); return; }
    brewing = BREW; setSurf(c, tex.crema);
    say('正在出咖啡…');
  };
  const off = [
    on(bus, 'cup:blur', () => { held = null; say(null); }),
    // 端起了桌上的饭菜：手里的杯子先放下（不发 blur，那边已经接管了焦点）
    on<{ by?: string }>(bus, 'cup:focus', ({ by } = {}) => { if (by !== 'cups') held = null; }),
    on(bus, 'monitor:focus', () => { putDown(); say(null); }),
    on(bus, 'window:focus', () => { putDown(); say(null); }),
  ];

  return {
    frame(dt, t) {
      camera.updateMatrixWorld();
      for (const c of all) {
        // 喝一口：0 → 1，喝到一半时液面降一格
        let k = 0;
        if (c.sip > 0) {
          const before = c.sip;
          c.sip += dt / 1.3;
          if (before < 0.5 && c.sip >= 0.5) {
            c.level--;
            if (c.level > 0) { setSurf(c, tex.sipped); }
            say(hint(c));
          }
          if (c.sip >= 1) {
            c.sip = 0;
            // 喝完了：放回原处，提示留几秒
            if (c.level === 0 && held === c) { putDown(); say(hint(c)); setTimeout(() => held || say(null), 4000); }
          }
          k = Math.sin(Math.min(1, c.sip) * Math.PI);
        }
        if (c.move < 1) {
          // 对调：沿一条抬起来的弧线飞过去
          c.move = Math.min(1, c.move + dt / 0.9);
          const e = c.move < 0.5 ? 2 * c.move * c.move : 1 - Math.pow(-2 * c.move + 2, 2) / 2;
          c.root.position.lerpVectors(c.from, c.to, e);
          c.root.position.y += Math.sin(e * Math.PI) * 0.16;
          c.root.quaternion.slerp(ident, 1 - Math.exp(-8 * dt));
        } else {
          // 端在眼前，或者放在杯位上；两者之间平滑地飞过去
          if (held === c) holdPose(c, k, want, wantQ); else { want.copy(SLOT_POS[c.slot]); wantQ.identity(); }
          const f = 1 - Math.exp(-(held === c ? 9 : 7) * dt);
          const lift = held !== c ? Math.min(0.12, c.root.position.distanceTo(want) * 0.4) : 0; // 放回去时先抬一点再落下
          c.root.position.lerp(want.setY(want.y + lift), f);
          c.root.quaternion.slerp(wantQ, f);
        }
        c.root.userData.level = c.level; c.root.userData.slot = c.slot; // 给调试和测试看
        // 液面：位置和半径跟着内壁走；空了就换成杯底的咖啡渍
        c.shown = damp(c.shown, c.level, 6, dt);
        slosh(c, dt);
        levelSurface(c, surfaceY(c, c.shown));
        if (c.shown < 0.04 && c.surfMat.map !== tex.dregs.map && brewing <= 0) { setSurf(c, tex.dregs); }
        // 热气：有咖啡时才冒
        // 热气只在镜头离得近时画：远处本来就看不清，每缕热气却要一次 draw call
        const hot = c.level > 0 && c.move >= 1 && c.sip === 0 && camera.position.distanceTo(c.root.position) < 1.6;
        for (const p of c.steam) {
          p.life = (p.life + dt * 0.25) % 1;
          const k = p.life;
          c.root.localToWorld(p.s.position.set(0, c.full + 0.012, 0));
          p.s.position.x += Math.sin(p.seed + k * 4 + t * 0.3) * 0.01 * (1 + k * 2); p.s.position.y += k * 0.08; p.s.position.z += Math.cos(p.seed * 2 + k * 3) * 0.008;
          p.s.scale.set(0.025 + k * 0.035, 0.035 + k * 0.045, 1);
          p.m.opacity = hot ? Math.sin(k * Math.PI) * 0.22 : damp(p.m.opacity, 0, 5, dt);
          p.s.visible = p.m.opacity > 0.01; // 全透明的精灵也要占一次 draw call
        }
      }
      // 出咖啡：咖啡流落到液面，液面从杯底升满，最后浮出拉花
      if (brewing > 0) {
        brewing -= dt;
        const c = all.find((x) => x.slot === 'machine')!;
        const k = 1 - Math.max(0, brewing) / BREW;
        c.level = 0; c.shown = Math.min(3, k * 3.2); // 直接驱动显示的液面
        const y = c.root.position.y + surfaceY(c, c.shown);
        for (const s of streams) { s.visible = k < 0.92; s.scale.y = Math.max(0.001, MACHINE.spoutY - y); }
        streamMat.opacity = Math.min(1, k * 8) * (k < 0.85 ? 1 : (0.92 - k) / 0.07);
        if (c.surfMat.map === tex.dregs.map) { setSurf(c, tex.crema); }
        if (brewing <= 0) {
          c.level = 3; c.shown = 3; setSurf(c, c.art);
          for (const s of streams) s.visible = false;
          say(null);
        }
      }
      // 按钮：按下去弹回来；有空杯等着的时候绿灯一闪一闪
      press = Math.max(0, press - dt * 4);
      cap.position.z = 0.006 - Math.sin(press * Math.PI) * 0.004;
      const waiting = all.some((c) => c.slot === 'machine' && c.level === 0) && brewing <= 0;
      ringMat.color.setHex(brewing > 0 ? 0xffb347 : 0x3fd36a).multiplyScalar(waiting ? 0.55 + 0.45 * Math.sin(t * 5) : brewing > 0 ? 1 : 0.6);
    },
    stop() { off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
