import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rng } from '../util';

/**
 * 摘菜、收菜（用户要的）：
 * 1. 站在窗前看菜园时，点园子里的白菜、葱、生菜（countryside.ts 的看不见的点击球）→ 那棵菜的照片藏起来，
 *    一棵代码做的立体菜从那里划一道弧线飞进箩筐。筐最多装 6 个；冰箱总共放 9 个，放满了就不让摘。
 * 2. 回到屋里（window:blur）时筐里有菜：箩筐从园子里越过窗台，落到冰箱左前方的地上（站到冰箱跟前才看得到，提示会说）。
 * 3. 点筐里的菜（或点筐）：冰箱没开就先开门，然后一个一个飞进冰箱——先放菜筐抽屉，再放两层隔板的空位。
 *    冰箱里的菜只在开门时画（关门后跟着藏起来）。
 * 4. 菜放完了，空筐越过窗台送回园子原来的地方。再走到窗前时筐要是还在屋里（菜没放完），先把筐送回园子再摘。
 * 菜和筐都是有光照的材质（屋外的东西大多是无光照的，但这只筐要进屋）。提示文字借用 cup:state。
 */
type Kind = 'cabbage' | 'scallion' | 'lettuce';
const NAME: Record<Kind, string> = { cabbage: '白菜', scallion: '葱', lettuce: '生菜' };
const GARDEN = new THREE.Vector3(1.5, L.groundY, -6.2);
// 冰箱左前方的地上：站在冰箱跟前（fridge:open 的镜头）时在画面下沿看得到；默认视角被书桌挡着
const ROOM = new THREE.Vector3(1.4, L.floorY, -0.3);
// 越过窗台的路线（窗洞 x ±1.3、y 0.14–1.85，墙在 z = -1.15）
const VIA = [new THREE.Vector3(1.25, 0.15, -2.6), new THREE.Vector3(1.0, 0.45, -1.15), new THREE.Vector3(1.3, 0.2, -0.65)];
const CAP = 6;
/** 筐里的位置（筐的局部坐标，底面在 y = 0.02） */
const BSLOT: [number, number, number, number][] = [[-0.06, 0.016, -0.03, 0.4], [0.06, 0.016, -0.02, -0.6], [0, 0.016, 0.065, 1.2], [-0.045, 0.085, 0.03, 2.1], [0.05, 0.085, 0.02, -1.5], [0, 0.095, -0.05, 0.8]];
/** 冰箱里的位置（冰箱的局部坐标：原点在底面中心，正面朝 +z）：先菜筐抽屉，再下层隔板右边、上层隔板的空位 */
const FSLOT: [number, number, number][] = [[0.16, 0.122, -0.14], [0.16, 0.122, 0.09], [-0.02, 0.122, -0.15], [-0.02, 0.122, 0.08], [-0.19, 0.122, -0.15], [0.17, 0.36, -0.12], [0.17, 0.36, 0.08], [-0.17, 0.62, -0.12], [0.03, 0.62, -0.14]];

export const basket: SceneObject = ({ scene, tier, bus, pick }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const r = rng(77);
  const world = new THREE.Group(); scene.add(world);

  // ---------------- 箩筐：竹篾编的筐身 + 筐沿 + 筐底，一个网格 ----------------
  const weaveTex = bin.add(canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#6b5232'; g.fillRect(0, 0, w, h);
    const q = rng(5);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) { const o = (y / 8) % 2 ? 8 : 0; g.fillStyle = `rgb(${190 + q() * 30},${158 + q() * 25},${100 + q() * 20})`; g.fillRect(x + o, y + 1, 13, 6); }
    for (let x = 4; x < w; x += 16) { g.fillStyle = 'rgba(90,65,35,.5)'; g.fillRect(x, 0, 3, h); }
  }, [3, 1]));
  const weave = bin.add(new THREE.MeshStandardMaterial({ map: weaveTex, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const tint = (geo: THREE.BufferGeometry, hex: number) => {
    const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g;
  };
  const box = new THREE.Group(); world.add(box);
  const bb = new Batch(['position', 'normal', 'uv', 'color']);
  bb.add(weave, tint(new THREE.CylinderGeometry(0.21, 0.16, 0.15, 20, 1, true), 0xffffff), [0, 0.075, 0]); // 浅一点的菜篮：菜能从筐沿露出来
  bb.add(weave, tint(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2), 0xd8c8a0), [0, 0.012, 0]);
  bb.add(weave, tint(new THREE.TorusGeometry(0.21, 0.012, 6, 24).rotateX(Math.PI / 2), 0x8a6a40), [0, 0.15, 0]);
  bb.add(weave, tint(new THREE.TorusGeometry(0.161, 0.01, 6, 20).rotateX(Math.PI / 2), 0x7a5a34), [0, 0.008, 0]);
  // 两边的绳耳
  for (const s of [-1, 1]) bb.add(weave, tint(new THREE.TorusGeometry(0.035, 0.006, 5, 10, Math.PI), 0x9a7a4a), [s * 0.21, 0.15, 0], [0, Math.PI / 2, 0]);
  bb.build(box, bin, { receive: high });
  const cb = new Batch(); cb.add(contactMaterial(bin, high ? 0.4 : 0.6), blob(0.5, 0.5), [0, 0.004, 0]);
  const contact = cb.build(box, bin)[0]; contact.visible = false; // 只在屋里的地上画（园子里省一个 draw call，high 档默认视角贴着上限）
  box.position.copy(GARDEN);
  box.userData.keepsFridge = true; box.userData.keepsWindow = true;

  // ---------------- 菜：一种菜一个合并好的网格（顶点色），共用一个材质 ----------------
  const vegMat = bin.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
  const colorize = (g: THREE.BufferGeometry, f: (x: number, y: number, z: number) => number) => {
    const p = g.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { c.setHex(f(p.getX(i), p.getY(i), p.getZ(i))); a.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g;
  };
  const merge = (parts: THREE.BufferGeometry[]) => { const b = new Batch(['position', 'normal', 'uv', 'color']); const grp = new THREE.Group(); parts.forEach((p) => b.add(vegMat, p)); b.build(grp, bin); return (grp.children[0] as THREE.Mesh).geometry; };
  const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHex();
  /** 卷心的叶球：凹凸的扁球，顶上浅黄绿、往下发绿；外面几片摊开的老叶（球面的一块） */
  const headGeo = (R: number, ruffle: number, top: number, side: number, outer: number, nOuter: number) => {
    const head = new THREE.SphereGeometry(R, 22, 16), p = head.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + ruffle * Math.sin(a * 7 + y * 40) * Math.sin(y * 55) + 0.03 * Math.sin(a * 3);
      p.setXYZ(i, x * k, y * k * 0.88 + R * 0.88, z * k);
    }
    head.computeVertexNormals();
    colorize(head, (_x, y) => mix(side, top, (y / (R * 1.76)) ** 1.5));
    const parts = [head];
    for (let i = 0; i < nOuter; i++) {
      const a = (i / nOuter) * Math.PI * 2 + r() * 0.5;
      const leaf = new THREE.SphereGeometry(R * 1.18, 10, 8, 0, 1.5, 0.35, 1.5);
      const lp = leaf.attributes.position;
      for (let k = 0; k < lp.count; k++) { const y = lp.getY(k); lp.setY(k, y + Math.sin(lp.getX(k) * 60) * R * ruffle * 2); }
      leaf.computeVertexNormals();
      leaf.rotateY(a).translate(0, R * 0.82, 0);
      colorize(leaf, (_x, y) => mix(0xe9efcf, outer, 0.35 + (y / (R * 1.9)) * 0.9));
      parts.push(leaf);
    }
    return merge(parts);
  };
  /** 一把葱：几根白葱白 + 绿色的管叶，根上一撮须，中间用红绳扎着 */
  const scallionGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const dx = (r() - 0.5) * 0.022, dz = (r() - 0.5) * 0.022, lean = (r() - 0.5) * 0.18;
      const white = new THREE.CylinderGeometry(0.0055, 0.0068, 0.12, 8).translate(dx, 0.06, dz);
      parts.push(colorize(white, (_x, y) => mix(0xf4f6ea, 0xdfeec2, (y - 0.02) / 0.1)));
      const green = new THREE.CylinderGeometry(0.0022, 0.0048, 0.24 + r() * 0.06, 7).translate(0, 0.12, 0).rotateZ(lean).rotateX((r() - 0.5) * 0.18).translate(dx, 0.115, dz);
      parts.push(colorize(green, (_x, y) => mix(0x9cc76a, 0x3f8a3a, (y - 0.12) / 0.2)));
      for (let k = 0; k < 3; k++) parts.push(colorize(new THREE.CylinderGeometry(0.0007, 0.0007, 0.025, 3).rotateZ((r() - 0.5) * 1.6).translate(dx + (r() - 0.5) * 0.01, -0.008, dz), () => 0xc9b28a));
    }
    parts.push(colorize(new THREE.TorusGeometry(0.016, 0.0025, 4, 14).rotateX(Math.PI / 2).translate(0, 0.085, 0), () => 0xc0392b));
    return merge(parts);
  };
  const GEO: Record<Kind, THREE.BufferGeometry> = {
    cabbage: bin.add(headGeo(0.062, 0.035, 0xe8efc0, 0x9cc46a, 0x4f8a3a, 5)),
    lettuce: bin.add(headGeo(0.07, 0.09, 0xc9e88a, 0x7fbf4a, 0x5ea83a, 7)),
    scallion: bin.add(scallionGeo()),
  };

  // ---------------- 状态 ----------------
  type Veg = { kind: Kind; mesh: THREE.Mesh; state: 'fly' | 'basket' | 'toFridge' | 'stored'; slot: number; fslot: number;
    t: number; dur: number; arc: number; from: THREE.Vector3; fromQ: THREE.Quaternion; to: () => THREE.Vector3; toQ: () => THREE.Quaternion; done: () => void };
  const vegs: Veg[] = [];
  let where: 'garden' | 'toRoom' | 'room' | 'toGarden' = 'garden', travel = 0, fridgeOpen = false, closeTimer = 0;
  const say = (msg: string | null) => emit(bus, 'cup:state', msg ? { msg } : null);
  const inBasket = () => vegs.filter((v) => v.state === 'basket' || (v.state === 'fly' && v.slot >= 0));
  const stored = () => vegs.filter((v) => v.state === 'stored' || v.state === 'toFridge').length;
  const freeSlot = () => { for (let i = 0; i < CAP; i++) if (!vegs.some((v) => v.slot === i)) return i; return -1; };
  const slotPose = (i: number, p: THREE.Vector3, q: THREE.Quaternion, kind: Kind) => {
    const [x, y, z, yaw] = BSLOT[i];
    box.updateWorldMatrix(true, false);
    p.set(x, y, z).applyMatrix4(box.matrixWorld);
    // 圆的菜基本立着放（歪多了会从筐壁里穿出去）；葱斜靠着，叶子从筐沿探出来
    q.setFromEuler(kind === 'scallion' ? new THREE.Euler(0.42, yaw, 0.12) : new THREE.Euler(0.12, yaw, 0.08)).premultiply(box.quaternion);
  };
  const fridgePose = (v: Veg, p: THREE.Vector3, q: THREE.Quaternion) => {
    const [x, y, z] = FSLOT[v.fslot], F = L.fridge;
    if (v.kind === 'scallion') { p.set(F.x + x, L.floorY + y + 0.012, F.z - 0.02); q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.2)); }
    else { p.set(F.x + x, L.floorY + y, F.z + z); q.setFromEuler(new THREE.Euler(0, v.fslot * 1.3, 0)); }
  };
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const fly = (v: Veg, to: () => THREE.Vector3, toQ: () => THREE.Quaternion, dur: number, arc: number, done: () => void) => {
    world.attach(v.mesh);
    v.from = v.mesh.position.clone(); v.fromQ = v.mesh.quaternion.clone();
    Object.assign(v, { to, toQ, dur, arc, done, t: 0 });
  };

  // 摘菜：countryside.ts 同步问「收不收」
  const offs = [
    on<{ kind: Kind; p: number[]; h: number; ok: boolean }>(bus, 'garden:pick', (ask) => {
      if (where !== 'garden') return;
      if (stored() + inBasket().length >= FSLOT.length) { say('冰箱快放不下了，先别摘了'); return; }
      const slot = freeSlot();
      if (slot < 0) { say('筐装满了 · 回屋里把菜放进冰箱'); return; }
      ask.ok = true;
      const mesh = new THREE.Mesh(GEO[ask.kind], vegMat);
      mesh.position.set(ask.p[0], ask.p[1], ask.p[2]);
      mesh.userData.keepsFridge = true; mesh.userData.keepsWindow = true;
      world.add(mesh);
      const v: Veg = { kind: ask.kind, mesh, state: 'fly', slot, fslot: -1, t: 0, dur: 0, arc: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), to: () => tmpP, toQ: () => tmpQ, done: () => {} };
      vegs.push(v);
      pick(mesh, { click: () => onVeg(v) });
      const d = mesh.position.distanceTo(box.position);
      fly(v, () => { slotPose(v.slot, tmpP, tmpQ, v.kind); return tmpP; }, () => tmpQ, 0.55 + d * 0.06, 0.5 + d * 0.12, () => { v.state = 'basket'; box.attach(v.mesh); });
      const n = inBasket().length;
      say(`摘了一${ask.kind === 'scallion' ? '把' : '棵'}${NAME[ask.kind]} · 筐里 ${n} 个${n >= CAP ? '（满了）' : ''} · 回屋时筐带进屋`);
    }),
    on(bus, 'window:focus', () => {
      // 筐还在屋里（菜没放完）：先送回园子
      if (where === 'room') { where = 'toGarden'; travel = 0; contact.visible = false; }
    }),
    on(bus, 'window:blur', () => {
      if (where === 'garden' && inBasket().length) { where = 'toRoom'; travel = 0; say(null); }
    }),
    on(bus, 'fridge:open', () => {
      fridgeOpen = true; closeTimer = 0;
      // 冰箱自己会发一条「点苹果、可乐……」的提示；筐里有菜时换成这条
      if (where === 'room' && vegs.some((v) => v.state === 'basket')) setTimeout(() => { if (fridgeOpen) say('点地上筐里的菜，一个一个放进冰箱'); }, 60);
    }),
    on(bus, 'fridge:close', () => { fridgeOpen = false; closeTimer = 0.7; }),
  ];

  // 屋里：点筐里的菜（或点筐）→ 放进冰箱
  const storeNext = (v?: Veg) => {
    if (where !== 'room') return;
    const list = vegs.filter((x) => x.state === 'basket');
    const veg = v && v.state === 'basket' ? v : list[list.length - 1];
    if (!veg) return;
    const used = new Set(vegs.map((x) => x.fslot));
    veg.fslot = FSLOT.findIndex((_, i) => !used.has(i));
    if (veg.fslot < 0) { say('冰箱放满了'); return; }
    const delay = fridgeOpen ? 0 : 0.9;
    if (!fridgeOpen) emit(bus, 'fridge:open');
    veg.state = 'toFridge'; veg.slot = -1;
    fly(veg, () => { fridgePose(veg, tmpP, tmpQ); return tmpP; }, () => tmpQ, 0.8, 0.35, () => {
      veg.state = 'stored';
      const left = vegs.filter((x) => x.state === 'basket').length;
      if (left) say(`放进冰箱了 · 筐里还有 ${left} 个，点它接着放`);
      else { say('菜都放好了 · 筐送回园子里'); setTimeout(() => say(null), 2500); where = 'toGarden'; travel = 0; contact.visible = false; }
    });
    veg.t = -delay; // 等冰箱门开了再飞
  };
  const onVeg = (v: Veg) => { if (v.state === 'basket' && where === 'room') storeNext(v); };
  pick(box, { click: () => storeNext() });

  const curve = new THREE.CatmullRomCurve3([GARDEN.clone(), ...VIA, ROOM.clone()], false, 'centripetal');
  const ease = (x: number) => x * x * (3 - 2 * x);
  return {
    frame(dt) {
      // 箩筐来回：沿着越过窗台的曲线，边走边微微晃
      if (where === 'toRoom' || where === 'toGarden') {
        travel = Math.min(1, travel + dt / 1.9);
        const k = ease(travel), u = where === 'toRoom' ? k : 1 - k;
        box.position.copy(curve.getPointAt(u));
        box.rotation.set(Math.sin(k * Math.PI) * 0.15, k * (where === 'toRoom' ? 1.2 : -1.2), Math.sin(k * Math.PI * 2) * 0.08);
        if (travel >= 1) {
          where = where === 'toRoom' ? 'room' : 'garden'; box.rotation.set(0, 0, 0);
          contact.visible = where === 'room';
          if (where === 'room') say(fridgeOpen ? '点地上筐里的菜，一个一个放进冰箱' : '筐放在冰箱旁边的地上了 · 点「冰箱」过去，再点筐里的菜放进去');
        }
      }
      // 飞的菜
      for (const v of vegs) {
        if (v.state !== 'fly' && v.state !== 'toFridge') continue;
        v.t += dt;
        if (v.t < 0) continue;
        const k = Math.min(1, v.t / v.dur), e = ease(k);
        const to = v.to(), toQ = v.toQ();
        v.mesh.position.lerpVectors(v.from, to, e); v.mesh.position.y += Math.sin(k * Math.PI) * v.arc;
        v.mesh.quaternion.slerpQuaternions(v.fromQ, toQ, e);
        if (k >= 1) { v.mesh.position.copy(to); v.mesh.quaternion.copy(toQ); const d = v.done; v.done = () => {}; d(); }
      }
      // 冰箱里的菜只在开门时画
      if (closeTimer > 0) closeTimer -= dt;
      const showStored = fridgeOpen || closeTimer > 0;
      for (const v of vegs) if (v.state === 'stored') v.mesh.visible = showStored;
    },
    stop() { offs.forEach((f) => f()); scene.remove(world); bin.dispose(); },
  };
};
