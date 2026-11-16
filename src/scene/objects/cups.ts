import * as THREE from 'three';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { blob, canvasTex, contactMaterial, speckle } from '../util';
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

/** 液面的贴图：拉花（叶子或心形）、被喝散的奶泡、刚流进来的油脂、喝完的杯底渍 */
function surfaceTextures(bin: Bin) {
  const make = (draw: (g: CanvasRenderingContext2D, c: number) => void) => bin.add(canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const crema = g.createRadialGradient(c, c, 8, c, c, c);
    crema.addColorStop(0, '#c08045'); crema.addColorStop(0.7, '#a4622f'); crema.addColorStop(0.93, '#7a4420'); crema.addColorStop(1, '#5a3014');
    g.fillStyle = crema; g.fillRect(0, 0, w, w);
    speckle(g, w, w, 71, 700, '70,35,10', 0.25); speckle(g, w, w, 72, 400, '240,200,150', 0.2);
    draw(g, c);
  }));
  const foam = '#fbf3e4';
  const leaf = make((g, c) => {
    g.strokeStyle = foam; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = 200 - i * 20, half = 64 - i * 5.5;
      g.lineWidth = 10 - i * 0.7;
      g.beginPath(); g.moveTo(c - half, y - 16); g.quadraticCurveTo(c, y + 22, c + half, y - 16); g.stroke();
    }
    g.fillStyle = foam; g.beginPath(); g.moveTo(c, 70); g.bezierCurveTo(c - 32, 46, c - 18, 22, c, 40); g.bezierCurveTo(c + 18, 22, c + 32, 46, c, 70); g.fill();
    g.strokeStyle = '#a4622f'; g.lineWidth = 3; g.beginPath(); g.moveTo(c, 218); g.lineTo(c, 56); g.stroke();
  });
  const heart = make((g, c) => {
    // 一圈圈套在一起的心
    for (let i = 0; i < 4; i++) {
      const s = 1 - i * 0.22;
      g.fillStyle = i % 2 ? '#b06a35' : foam;
      g.beginPath(); g.moveTo(c, c + 70 * s); g.bezierCurveTo(c - 110 * s, c - 10 * s, c - 50 * s, c - 95 * s, c, c - 38 * s); g.bezierCurveTo(c + 50 * s, c - 95 * s, c + 110 * s, c - 10 * s, c, c + 70 * s); g.fill();
    }
    g.strokeStyle = '#a4622f'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(c, c - 60); g.lineTo(c, c + 76); g.stroke();
  });
  const sipped = make((g, c) => {
    // 喝过之后：奶泡散成不规则的几块，靠近杯沿一圈
    g.fillStyle = 'rgba(251,243,228,.75)';
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.4, d = 40 + (i % 3) * 22; g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 24 - (i % 3) * 5, 14, a, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(251,243,228,.4)'; g.beginPath(); g.arc(c, c, c * 0.93, 0, 7); g.arc(c, c, c * 0.8, 0, 7, true); g.fill();
  });
  const crema = make(() => {});
  const dregs = bin.add(canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, w, w);            // 白瓷杯底
    const r = g.createRadialGradient(c, c, 10, c, c, c);
    r.addColorStop(0, 'rgba(90,50,20,.75)'); r.addColorStop(0.55, 'rgba(110,62,26,.35)'); r.addColorStop(0.8, 'rgba(160,110,60,.15)'); r.addColorStop(1, 'rgba(160,110,60,0)');
    g.fillStyle = r; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    speckle(g, w, w, 73, 500, '60,30,10', 0.35);
  }));
  return { leaf, heart, sipped, crema, dregs };
}

/** 杯子的内壁轮廓（半径随高度变化），液面的半径要跟着它 */
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
    id: string; root: THREE.Group; body: THREE.Group; surface: THREE.Mesh; surfMat: THREE.MeshStandardMaterial; art: THREE.Texture;
    prof: [number, number][]; full: number; empty: number; level: number; shown: number; slot: Slot;
    from: THREE.Vector3; to: THREE.Vector3; move: number; sip: number; steam: { s: THREE.Sprite; m: THREE.SpriteMaterial; life: number; seed: number }[];
  }
  const steamTex = bin.add(canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }));
  const hitGeo = bin.add(new THREE.CylinderGeometry(0.058, 0.058, 0.11, 12));
  const hitMat = bin.add(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  const makeCup = (id: string, slot: Slot, build: (body: THREE.Group) => { prof: [number, number][]; base: number; art: THREE.Texture }) => {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const { prof, base, art } = build(body);
    const surfMat = bin.add(new THREE.MeshStandardMaterial({ map: art, roughness: 0.3 }));
    const surface = new THREE.Mesh(bin.add(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)), surfMat);
    surface.rotation.y = 0.4;
    body.add(surface);
    const sh = new THREE.Mesh(bin.add(blob(0.06, 0.06)), contact); sh.position.y = 0.0006; root.add(sh);
    body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = high; m.receiveShadow = high; } });
    root.position.copy(SLOT_POS[slot]);
    root.userData.keepsCup = true;
    root.userData.cupId = id;
    group.add(root);
    const top = prof[prof.length - 1][1];
    const cup: Cup = { id, root, body, surface, surfMat, art, prof: prof.map(([r, y]) => [r, y + base]) as [number, number][], full: top - 0.004 + base, empty: prof[0][1] + base + 0.0015, level: 3, shown: 3, slot,
      from: root.position.clone(), to: root.position.clone(), move: 1, sip: 0, steam: [] };
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
  // 端在眼前的位置（相机坐标系）：略偏右下，离镜头 0.3 米；竖屏离远一点免得出画
  const HOLD = new THREE.Vector3(0.03, -0.085, -0.3), TILT = 0.55;
  const holdPose = (c: Cup, k: number, pos: THREE.Vector3, quat: THREE.Quaternion) => {
    const far = Math.max(1, 0.75 / camera.aspect);
    // 喝一口（k 从 0 到 1 再回 0）：往镜头凑、往上抬、杯口朝你倾得更厉害
    pos.set(HOLD.x, HOLD.y + k * 0.035, HOLD.z * far + k * 0.1).applyMatrix4(camera.matrixWorld);
    quat.copy(camera.quaternion).multiply(tmpQ.setFromEuler(tmpE.set(TILT + k * 0.75, -0.5, 0, 'YXZ')));
    void c;
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
    brewing = BREW; c.surfMat.map = tex.crema; c.surfMat.needsUpdate = true;
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
            if (c.level > 0) { c.surfMat.map = tex.sipped; c.surfMat.needsUpdate = true; }
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
        const y = surfaceY(c, c.shown), r = innerR(c.prof, y) - 0.0006;
        c.surface.position.y = y; c.surface.scale.set(r, 1, r);
        if (c.shown < 0.04 && c.surfMat.map !== tex.dregs && brewing <= 0) { c.surfMat.map = tex.dregs; c.surfMat.needsUpdate = true; }
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
        if (c.surfMat.map === tex.dregs) { c.surfMat.map = tex.crema; c.surfMat.needsUpdate = true; }
        if (brewing <= 0) {
          c.level = 3; c.shown = 3; c.surfMat.map = c.art; c.surfMat.needsUpdate = true;
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
