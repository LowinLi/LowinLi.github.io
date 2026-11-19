import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { asset, Batch, blob, canvasTex, contactMaterial, mergeSameMaterial, speckle } from '../util';

const SERIF = '"Kaiti SC","STKaiti","KaiTi","Songti SC","Noto Serif CJK SC","SimSun",serif';

/**
 * 右后方茶几上泡茶（用户要的：「点茶水桌调换视角，对着墙这边、对着茶水桌，可以倒茶喝茶；桌上摆一个煮水壶、一个茶叶桶，
 * 可以放茶、倒开水泡茶」）。
 *
 * 茶几上：Poly Haven 的一套茶具（茶壶、两只小茶杯、托盘、糖罐，原来在 furniture.ts，挪到这里好让茶壶和杯子能动），
 * 代码做的电热水壶（不锈钢壶身、黑把手、底座、指示灯）和一只茶叶罐（绿底金边、写着「龙井」）。
 *
 * 流程（每一步底部都有提示，借用 cup:state）：
 *   点茶叶罐 → 罐盖掀开，一撮茶叶飞进茶壶 → 点水壶 → 指示灯变红，咕嘟咕嘟烧开（壶嘴冒热气）→ 再点水壶 → 提起来把开水冲进茶壶
 *   → 泡一会儿 → 点茶壶 → 往空杯子里倒茶 → 点茶杯 → 端到嘴边，再点一下喝一口，三口喝完放回去。一壶茶能倒四杯，倒完茶叶就淡了，重新放。
 * 没在茶几前时点这些东西，先走过去（tea:focus）。
 * 三档：high / mid 一样；low 档没有 3D。
 */
export const tea: SceneObject = ({ scene, camera, tier, bus, pick, audio }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const T = L.teaTable, fy = L.floorY;
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  // 茶几桌面坐标：原点在桌面中心，跟着茶几转。米为单位
  const root = new THREE.Group();
  root.position.set(T.x, fy + T.top, T.z); root.rotation.y = T.rot;
  scene.add(root);
  // 世界坐标：茶壶、茶杯被拿起来、倒茶时挂在这里
  const world = new THREE.Group(); scene.add(world);
  root.updateMatrixWorld(true);
  const toWorld = (x: number, y: number, z: number) => root.localToWorld(new THREE.Vector3(x, y, z));

  // ---------------- 电热水壶 ----------------
  const KETTLE_HOME = new THREE.Vector3(0.2, 0.02, 0.26);
  const steel = std({ color: 0xb4b8be, roughness: 0.28, metalness: 0.95 });
  const black = std({ color: 0x1c1c1e, roughness: 0.5 });
  const kb = new Batch();
  kb.add(black, new THREE.CylinderGeometry(0.086, 0.09, 0.02, 32), [0, 0.01, 0]);
  kb.build(root, bin, { receive: high });
  const baseMesh = root.children[root.children.length - 1];
  baseMesh.position.set(KETTLE_HOME.x, 0, KETTLE_HOME.z);
  const led = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.004, 8, 6)), bin.add(new THREE.MeshBasicMaterial({ color: 0x331010 })));
  led.position.set(KETTLE_HOME.x - 0.06, 0.012, KETTLE_HOME.z - 0.06); root.add(led);
  const kettle = new THREE.Group(); kettle.position.copy(KETTLE_HOME); kettle.rotation.order = 'YXZ'; root.add(kettle);
  {
    const b = new Batch();
    const prof = [[0, 0], [0.074, 0], [0.079, 0.012], [0.078, 0.11], [0.07, 0.165], [0.06, 0.185], [0.058, 0.19]].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(steel, new THREE.LatheGeometry(prof, 32));
    b.add(black, new THREE.CylinderGeometry(0.058, 0.058, 0.012, 32), [0, 0.196, 0]);        // 壶盖
    b.add(black, new THREE.CylinderGeometry(0.012, 0.016, 0.014, 12), [0, 0.209, 0]);         // 盖钮
    b.add(black, new THREE.TorusGeometry(0.058, 0.01, 8, 20, Math.PI), [-0.07, 0.115, 0], [0, 0, Math.PI / 2]); // 把手
    b.add(black, new THREE.BoxGeometry(0.018, 0.02, 0.03), [-0.077, 0.03, 0]);
    b.add(steel, new THREE.CylinderGeometry(0.008, 0.017, 0.07, 12), [0.098, 0.158, 0], [0, 0, -0.95]); // 壶嘴
    b.build(kettle, bin, { receive: high, collapse: true });
  }
  const SPOUT = new THREE.Vector3(0.126, 0.185, 0); // 壶嘴尖，水壶自己的坐标

  // ---------------- 茶叶罐 ----------------
  const CADDY = new THREE.Vector3(-0.05, 0, 0.29);
  const caddy = new THREE.Group(); caddy.position.copy(CADDY); root.add(caddy);
  const tinTex = bin.add(canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#1f4a34'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3, 700, '255,255,255', 0.05);
    g.fillStyle = '#c9a24a'; g.fillRect(0, 10, w, 6); g.fillRect(0, h - 16, w, 6);
    for (const cx of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#b3261e'; g.beginPath(); g.arc(cx, h / 2, 44, 0, 7); g.fill();
      g.fillStyle = '#f3e3b0'; g.font = `bold 58px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('茶', cx, h / 2 + 3);
      g.fillStyle = '#e9d39a'; g.font = `30px ${SERIF}`; g.fillText('龍井', cx + (cx < w / 2 ? 100 : -100), h / 2 + 2);
    }
  }));
  const tinM = std({ map: tinTex, roughness: 0.35, metalness: 0.3 });
  const goldM = std({ color: 0xc9a24a, roughness: 0.3, metalness: 0.8 });
  const caddyBody = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 28).translate(0, 0.055, 0)), tinM);
  caddy.add(caddyBody);
  const caddyLid = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.047, 0.047, 0.022, 28).translate(0, 0.011, 0)), goldM);
  caddyLid.position.y = 0.105; caddy.add(caddyLid);
  // 接触阴影：水壶底座、茶叶罐
  const cb = new Batch();
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);
  cb.add(contact, blob(0.22, 0.22), [KETTLE_HOME.x, 0.002, KETTLE_HOME.z]);
  cb.add(contact, blob(0.13, 0.13), [CADDY.x, 0.002, CADDY.z]);
  cb.build(root, bin);

  // ---------------- 茶叶（一个实例化网格）、水流、热气 ----------------
  const LEAVES = 9;
  const leafMesh = new THREE.InstancedMesh(bin.add(new THREE.SphereGeometry(1, 6, 4).scale(0.008, 0.0025, 0.004)), std({ color: 0x5a6a2a, roughness: 0.8 }), LEAVES);
  leafMesh.visible = false; leafMesh.frustumCulled = false; world.add(leafMesh);
  const streamGeo = bin.add(new THREE.CylinderGeometry(0.0035, 0.0045, 1, 8, 1, true).translate(0, -0.5, 0));
  const waterStream = new THREE.Mesh(streamGeo, bin.add(new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, depthWrite: false })));
  const teaStream = new THREE.Mesh(streamGeo, bin.add(new THREE.MeshBasicMaterial({ color: 0xa8662a, transparent: true, opacity: 0.85, depthWrite: false })));
  for (const m of [waterStream, teaStream]) { m.visible = false; m.userData.noAO = true; world.add(m); }
  const steamTex = bin.add(canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));
  /** 一股热气：几片精灵从 src 往上飘、变大变淡。strength 0 时整股不画 */
  const makeSteam = (n: number) => {
    const sprites = Array.from({ length: n }, (_, i) => {
      const sp = new THREE.Sprite(bin.add(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })));
      sp.visible = false; world.add(sp); return { sp, ph: i / n };
    });
    return {
      src: new THREE.Vector3(), strength: 0,
      update(t: number, rise = 0.12) {
        for (const s of sprites) {
          const k = (t * 0.45 + s.ph) % 1;
          s.sp.visible = this.strength > 0.01;
          if (!s.sp.visible) continue;
          s.sp.position.set(this.src.x + Math.sin(t * 2 + s.ph * 9) * 0.01 * k, this.src.y + k * rise, this.src.z + Math.cos(t * 1.7 + s.ph * 7) * 0.01 * k);
          s.sp.scale.setScalar(0.02 + k * 0.05);
          (s.sp.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.5 * this.strength;
        }
      },
    };
  };
  const kettleSteam = makeSteam(4), cupSteam = [makeSteam(3), makeSteam(3)];

  // ---------------- 茶具（扫描模型）----------------
  // 茶壶（壶盖跟着它）、两只茶杯单独留着能动；托盘、杯托、糖罐合成一个网格
  type Cup = { node: THREE.Object3D; home: THREE.Vector3; homeQ: THREE.Quaternion; level: number; liquid: THREE.Mesh; hot: number; state: 'home' | 'held' | 'back'; sip: number };
  let teapot: THREE.Object3D | null = null, potLid: THREE.Object3D | null = null;
  const potHome = new THREE.Vector3(), potHomeQ = new THREE.Quaternion();
  const cups: Cup[] = [];
  const SCALE = 0.72;
  const POT_SPOUT = new THREE.Vector3(0, 0.115, 0.139).multiplyScalar(SCALE); // 壶嘴尖（茶壶自己的坐标 × 模型缩放），壶嘴朝 +z
  const teaM = std({ color: 0x8a4f1a, roughness: 0.12 });
  let stopped = false;
  new GLTFLoader().loadAsync(asset('models/tea_set_01/tea_set_01.gltf')).then((gltf) => {
    if (stopped) return;
    const model = gltf.scene;
    model.scale.setScalar(SCALE);
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = high; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) mat.map.anisotropy = 8; } });
    root.add(model);
    root.updateMatrixWorld(true);
    teapot = model.getObjectByName('tea_set_01_teapot_01') ?? null;
    potLid = model.getObjectByName('tea_set_01_teapot_01_lid') ?? null;
    const moving = new Set<THREE.Object3D>();
    if (teapot) {
      world.attach(teapot); teapot.rotation.order = 'YXZ'; potHome.copy(teapot.position); potHomeQ.copy(teapot.quaternion); moving.add(teapot);
      if (potLid) { teapot.attach(potLid); moving.add(potLid); }
    }
    for (const n of ['tea_set_01_cup_small_01', 'tea_set_01_cup_small_02']) {
      const node = model.getObjectByName(n);
      if (!node) continue;
      world.attach(node); moving.add(node);
      // 杯里的茶：一张圆片，按液面高低缩放（杯子是上宽下窄的），模型自己的坐标（外半径 0.054、高 0.07）
      const liquid = new THREE.Mesh(bin.add(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)), teaM);
      liquid.visible = false; node.add(liquid);
      cups.push({ node, home: node.position.clone(), homeQ: node.quaternion.clone(), level: 0, liquid, hot: 0, state: 'home', sip: 0 });
    }
    mergeSameMaterial(model, bin, (m) => moving.has(m) || [...moving].some((x) => x === m.parent));
    for (const o of [teapot, ...cups.map((c) => c.node)]) if (o) { o.userData.keepsTea = true; }
    if (teapot) pick(teapot, { click: () => onPot() });
    cups.forEach((c, i) => pick(c.node, { click: () => onCup(i) }));
    emit(bus, 'scene:changed');
  }).catch((e) => console.warn('[scene] 茶具模型加载失败', e));

  for (const o of [kettle, baseMesh, caddy]) o.userData.keepsTea = true;
  pick(kettle, { click: () => onKettle() });
  pick(baseMesh, { click: () => onKettle() });
  pick(caddy, { click: () => onCaddy() });

  // ---------------- 声音（现合成）----------------
  let ac: AudioContext | null = null;
  const sfx = (kind: 'boil' | 'pour' | 'clink' | 'sip' | 'rustle') => {
    if (!ac) return;
    const t0 = ac.currentTime + 0.01, out = ac.createGain(); out.gain.value = 0.5; out.connect(ac.destination);
    const noise = (dur: number, f: number, q: number, gain: number, type: BiquadFilterType, at = 0, ramp = false) => {
      const buf = ac!.createBuffer(1, Math.ceil(ac!.sampleRate * dur), ac!.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac!.createBufferSource(); src.buffer = buf;
      const fl = ac!.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac!.createGain();
      if (ramp) { g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(gain, t0 + at + dur * 0.85); g.gain.linearRampToValueAtTime(0, t0 + at + dur); }
      else { g.gain.setValueAtTime(gain, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); }
      src.connect(fl).connect(g).connect(out); src.start(t0 + at); src.onended = () => { src.disconnect(); fl.disconnect(); g.disconnect(); };
    };
    const tone = (f: number, dur: number, gain: number, at = 0, f2 = f) => {
      const o = ac!.createOscillator(), g = ac!.createGain(); o.frequency.setValueAtTime(f, t0 + at); o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
      g.gain.setValueAtTime(gain, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
    };
    if (kind === 'boil') { noise(BOIL, 180, 0.6, 0.35, 'lowpass', 0, true); for (let i = 0; i < 26; i++) tone(500 + Math.random() * 500, 0.05, 0.03 + (i / 26) * 0.05, 1 + (i / 26) * (BOIL - 1.3)); }
    if (kind === 'pour') { noise(1.3, 900, 0.8, 0.25, 'bandpass'); noise(1.3, 2400, 1.2, 0.08, 'bandpass', 0.05); }
    if (kind === 'clink') { tone(2100, 0.25, 0.06); tone(3150, 0.18, 0.03); }
    if (kind === 'sip') { tone(320, 0.12, 0.28, 0, 180); tone(300, 0.12, 0.22, 0.32, 170); }
    if (kind === 'rustle') for (let i = 0; i < 5; i++) noise(0.07, 3500 + i * 400, 0.8, 0.12, 'highpass', i * 0.06);
    setTimeout(() => out.disconnect(), 8000);
  };

  // ---------------- 状态 ----------------
  const BOIL = 4.5, STEEP = 3;
  let focused = false, leaves = false, potTea = 0, steep = 0; // potTea：茶壶里还能倒几杯
  let kettleState: 'cold' | 'boiling' | 'hot' | 'pour' = 'cold', kt = 0, boilAt = 0;
  let potAct: { cup: number; t: number } | null = null;
  let leafAct = -1; // 放茶叶的动画进度（-1 没在放）
  let held: Cup | null = null;
  const say = (msg: string | null) => { if (focused) emit(bus, 'cup:state', msg ? { msg } : null); };
  const hint = (): string => {
    if (held) return held.level > 0.01 ? `点一下喝一口${held.sip ? ' · 还剩' + ['', '两口', '一口'][held.sip] : ''}` : '喝完了';
    if (potTea > 0 && steep <= 0) {
      const empty = cups.some((c) => c.level < 0.01 && c.state === 'home');
      return empty ? `茶泡好了 · 点茶壶倒一杯（还能倒 ${potTea} 杯）` : '点茶杯端起来喝';
    }
    if (steep > 0) return '泡一会儿……';
    if (kettleState === 'boiling') return '水在烧，等一会儿……';
    if (!leaves) return cups.some((c) => c.level > 0.01) ? '点茶杯端起来喝 · 想再泡一壶就点茶叶罐放茶叶' : '点茶叶罐，往茶壶里放一撮茶叶';
    if (kettleState === 'hot') return '水开了 · 点水壶把开水冲进茶壶';
    return '点水壶烧水';
  };
  const refresh = () => say(hint());
  const ensureAudio = () => { try { ac ??= audio(); } catch { ac = null; } };
  const busy = () => kettleState === 'pour' || !!potAct || leafAct >= 0;

  const onCaddy = () => {
    if (!focused) { emit(bus, 'tea:focus'); return; }
    ensureAudio();
    if (busy()) return;
    if (held) putBack();
    if (leaves) { say('茶壶里已经有茶叶了'); setTimeout(refresh, 1400); return; }
    leafAct = 0; sfx('clink'); setTimeout(() => sfx('rustle'), 450);
  };
  const onKettle = () => {
    if (!focused) { emit(bus, 'tea:focus'); return; }
    ensureAudio();
    if (busy()) return;
    if (held) putBack();
    if (kettleState === 'cold') { kettleState = 'boiling'; boilAt = 0; sfx('boil'); refresh(); return; }
    if (kettleState === 'boiling') return;
    if (kettleState === 'hot') {
      if (!leaves) { say('先点茶叶罐放茶叶'); setTimeout(refresh, 1400); return; }
      if (potTea > 0) { say('茶壶里还有茶，先倒出来喝'); setTimeout(refresh, 1400); return; }
      kettleState = 'pour'; kt = 0; refresh();
    }
  };
  const onPot = () => {
    if (!focused) { emit(bus, 'tea:focus'); return; }
    ensureAudio();
    if (busy() || !teapot) return;
    if (held) putBack();
    if (potTea <= 0 || steep > 0) { refresh(); return; }
    const i = cups.findIndex((c) => c.level < 0.01 && c.state === 'home');
    if (i < 0) { say('两杯都还有茶，先喝了再倒'); setTimeout(refresh, 1400); return; }
    potAct = { cup: i, t: 0 }; say('倒茶……');
  };
  const onCup = (i: number) => {
    if (!focused) { emit(bus, 'tea:focus'); return; }
    ensureAudio();
    const c = cups[i];
    if (!c || busy()) return;
    if (held && held !== c) putBack();
    if (c.state === 'held') { if (c.level >= 0.01 && sipT < 0) sipT = 0; return; } // 端着时再点一下：喝一口
    if (c.level < 0.01) { refresh(); return; }
    held = c; c.state = 'held'; emit(bus, 'tea:hold', { p: c.node.position.toArray() }); refresh();
  };
  const putBack = () => { if (!held) return; held.state = 'back'; held = null; sipT = -1; emit(bus, 'tea:hold', null); refresh(); };
  let sipT = -1;

  const off = [
    on(bus, 'tea:focus', () => { focused = true; refresh(); }),
    on(bus, 'tea:blur', () => { if (held) putBack(); focused = false; }),
  ];

  // ---------------- 每帧 ----------------
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  const smooth = THREE.MathUtils.smootherstep, clamp = THREE.MathUtils.clamp;
  const ph = (k: number, a: number, b: number) => clamp((k - a) / (b - a), 0, 1);
  /** 茶壶口（倒开水、放茶叶的目标），世界坐标 */
  const potMouth = () => teapot ? v.copy(teapot.position).add(new THREE.Vector3(0, 0.122 * SCALE, 0)).clone() : toWorld(-0.25, 0.09, 0.044);
  const leafFrom = Array.from({ length: LEAVES }, () => new THREE.Vector3()), leafSeed = Array.from({ length: LEAVES }, (_, i) => [Math.random(), Math.random(), i]);
  const m4 = new THREE.Matrix4();

  return {
    frame(dt, t) {
      // ---- 放茶叶：罐盖掀起来，一撮茶叶一片片从罐口飞进茶壶，壶盖也掀一下 ----
      let lidUp = 0;
      if (leafAct >= 0) {
        leafAct = Math.min(1, leafAct + dt / 2.2);
        const k = leafAct;
        caddyLid.position.set(0.035 * smooth(k, 0, 0.15) * (1 - smooth(k, 0.85, 1)), 0.105 + 0.05 * smooth(k, 0, 0.15) * (1 - smooth(k, 0.85, 1)), 0);
        caddyLid.rotation.z = 0.5 * smooth(k, 0, 0.15) * (1 - smooth(k, 0.85, 1));
        lidUp = smooth(k, 0.1, 0.25) * (1 - smooth(k, 0.8, 0.95));
        const from = toWorld(CADDY.x, 0.13, CADDY.z), to = potMouth();
        leafMesh.visible = k > 0.15 && k < 0.85;
        for (let i = 0; i < LEAVES; i++) {
          const s = clamp((k - 0.18 - i * 0.04) / 0.3, 0, 1);
          leafFrom[i].lerpVectors(from, to, s);
          leafFrom[i].y += Math.sin(s * Math.PI) * 0.08 + (s >= 1 ? -1 : 0);
          leafFrom[i].x += (leafSeed[i][0] - 0.5) * 0.02 * (1 - s); leafFrom[i].z += (leafSeed[i][1] - 0.5) * 0.02 * (1 - s);
          m4.compose(leafFrom[i], q.setFromEuler(e.set(t * 6 + i, i, t * 4)), v.setScalar(s > 0 && s < 1 ? 1 : 0));
          leafMesh.setMatrixAt(i, m4);
        }
        leafMesh.instanceMatrix.needsUpdate = true;
        if (leafAct >= 1) { leafAct = -1; leaves = true; leafMesh.visible = false; refresh(); }
      }

      // ---- 水壶：烧水 → 开了（指示灯灭、冒热气）→ 冲水 ----
      let pourWater = false;
      if (kettleState === 'boiling') {
        boilAt += dt;
        (led.material as THREE.MeshBasicMaterial).color.setHex(0xff2a1a);
        kettle.position.x = KETTLE_HOME.x + (boilAt > BOIL * 0.6 ? Math.sin(t * 60) * 0.0006 : 0); // 快开的时候壶身在底座上轻轻颤
        if (boilAt >= BOIL) { kettleState = 'hot'; kettle.position.x = KETTLE_HOME.x; refresh(); }
      } else (led.material as THREE.MeshBasicMaterial).color.setHex(0x331010);
      kettleSteam.strength = THREE.MathUtils.damp(kettleSteam.strength, kettleState === 'boiling' ? ph(boilAt, BOIL * 0.5, BOIL) : kettleState === 'hot' ? 0.8 : 0, 3, dt);
      if (kettleState === 'pour') {
        kt = Math.min(1, kt + dt / 3.2);
        // 0–0.3 提起来挪到茶壶旁边，0.3–0.42 倾倒，0.42–0.78 水流，0.78–0.9 扶正，0.9–1 放回底座
        const go = smooth(kt, 0, 0.3) * (1 - smooth(kt, 0.88, 1)), tilt = smooth(kt, 0.3, 0.42) * (1 - smooth(kt, 0.78, 0.9));
        const mouth = root.worldToLocal(potMouth());
        const dir = new THREE.Vector3(mouth.x - KETTLE_HOME.x, 0, mouth.z - KETTLE_HOME.z).normalize();
        const yaw = Math.atan2(-dir.z, dir.x);
        kettle.rotation.set(0, yaw * go, -1.0 * tilt);
        // 让壶嘴尖停在茶壶口正上方 7 厘米
        kettle.updateMatrix();
        const tip = SPOUT.clone().applyEuler(kettle.rotation);
        const target = mouth.clone().add(new THREE.Vector3(0, 0.07, 0)).sub(tip);
        kettle.position.lerpVectors(KETTLE_HOME, target, go);
        kettle.position.y += Math.sin(go * Math.PI) * 0.04;
        lidUp = Math.max(lidUp, smooth(kt, 0.2, 0.32) * (1 - smooth(kt, 0.8, 0.92)));
        pourWater = kt > 0.44 && kt < 0.78;
        if (kt > 0.44 && kt - dt / 3.2 <= 0.44) sfx('pour');
        if (kt >= 1) { kettleState = 'cold'; kettle.position.copy(KETTLE_HOME); kettle.rotation.set(0, 0, 0); potTea = 4; steep = STEEP; refresh(); }
      }
      if (pourWater) {
        kettle.updateMatrixWorld();
        const tipW = kettle.localToWorld(SPOUT.clone()), mouth = potMouth();
        waterStream.position.copy(tipW); waterStream.scale.set(1, Math.max(0.01, tipW.y - mouth.y), 1); waterStream.visible = true;
      } else waterStream.visible = false;
      kettleSteam.src.copy(kettle.localToWorld(SPOUT.clone()));
      kettleSteam.update(t);
      if (steep > 0) { steep -= dt; if (steep <= 0) refresh(); }

      // ---- 茶壶：提起来、转过去对着杯子、倾倒，茶水流进杯里，液面升起来 ----
      if (teapot && potLid) {
        potLid.position.y = THREE.MathUtils.damp(potLid.position.y, (potLid.userData.y0 ??= potLid.position.y) + lidUp * 0.06, 10, dt);
      }
      let pourTea = false;
      if (teapot) {
        if (potAct) {
          potAct.t = Math.min(1, potAct.t + dt / 2.6);
          const k = potAct.t, c = cups[potAct.cup];
          const go = smooth(k, 0, 0.28) * (1 - smooth(k, 0.86, 1)), tilt = smooth(k, 0.28, 0.4) * (1 - smooth(k, 0.75, 0.86));
          const cupTop = c.node.position.clone().add(new THREE.Vector3(0, 0.07 * SCALE, 0));
          const dir = new THREE.Vector3(cupTop.x - potHome.x, 0, cupTop.z - potHome.z).normalize();
          const yaw0 = new THREE.Euler().setFromQuaternion(potHomeQ, 'YXZ').y, yaw = Math.atan2(dir.x, dir.z);
          let dy = yaw - yaw0; dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
          e.set(0.85 * tilt, yaw0 + dy * go, 0, 'YXZ');
          q.setFromEuler(e);
          teapot.quaternion.copy(q);
          const tip = POT_SPOUT.clone().applyQuaternion(q);
          const target = cupTop.clone().add(new THREE.Vector3(0, 0.06, 0)).sub(tip);
          teapot.position.lerpVectors(potHome, target, go);
          teapot.position.y += Math.sin(go * Math.PI) * 0.03;
          pourTea = k > 0.42 && k < 0.75;
          if (pourTea) c.level = Math.min(1, ph(k, 0.42, 0.75));
          if (k > 0.42 && k - dt / 2.6 <= 0.42) sfx('pour');
          if (k >= 1) { c.level = 1; c.hot = 1; potTea--; if (potTea <= 0) leaves = false; teapot.position.copy(potHome); teapot.quaternion.copy(potHomeQ); potAct = null; refresh(); }
          if (pourTea) {
            teapot.updateMatrixWorld();
            const tipW = teapot.localToWorld(new THREE.Vector3(0, 0.115, 0.139));
            const surf = c.node.position.y + (0.012 + c.level * 0.045) * SCALE;
            teaStream.position.copy(tipW); teaStream.scale.set(1, Math.max(0.01, tipW.y - surf), 1);
          }
        }
      }
      teaStream.visible = pourTea;

      // ---- 茶杯：液面、端起来喝 ----
      camera.updateMatrixWorld();
      cups.forEach((c, i) => {
        c.liquid.visible = c.level > 0.01;
        if (c.liquid.visible) {
          const h = 0.012 + c.level * 0.045, rr = 0.034 + (h / 0.06) * 0.016;
          c.liquid.position.y = h; c.liquid.scale.setScalar(rr);
        }
        c.hot = Math.max(0, c.hot - dt / 90); // 一分半以后不冒热气了
        if (c.state === 'held') {
          // 端到镜头前偏下，杯口朝镜头倾；喝的时候往嘴边凑、再倾一点
          const sipK = sipT >= 0 ? Math.sin(sipT * Math.PI) : 0;
          const far = Math.max(1, 0.75 / camera.aspect);
          want.set(0, -0.045 + sipK * 0.025, -0.38 * far + sipK * 0.12).applyMatrix4(camera.matrixWorld);
          wantQ.copy(camera.quaternion).multiply(q.setFromEuler(e.set(0.35 + sipK * 0.6, Math.PI, 0, 'YXZ')));
        } else { want.copy(c.home); wantQ.copy(c.homeQ); }
        const f = 1 - Math.exp(-(c.state === 'held' ? 8 : 6) * dt);
        c.node.position.lerp(want, f); c.node.quaternion.slerp(wantQ, f);
        if (c.state === 'back' && c.node.position.distanceTo(c.home) < 0.002) c.state = 'home';
        const st = cupSteam[i];
        if (st) { st.strength = THREE.MathUtils.damp(st.strength, c.level > 0.01 && c.state !== 'held' ? c.hot : 0, 3, dt); st.src.copy(c.node.position).add(v.set(0, 0.06 * SCALE, 0)); st.update(t + i * 1.7, 0.08); }
      });
      if (held && sipT >= 0) {
        const before = sipT;
        sipT = Math.min(1, sipT + dt / 1.2);
        if (before < 0.5 && sipT >= 0.5) { held.sip++; held.level = Math.max(0, 1 - held.sip / 3); sfx('sip'); refresh(); }
        if (sipT >= 1) {
          sipT = -1;
          if (held.level < 0.01) { held.sip = 0; const c = held; putBack(); c.level = 0; setTimeout(refresh, 300); }
        }
      }
    },
    stop() {
      stopped = true; off.forEach((f) => f());
      scene.remove(root, world); bin.dispose();
    },
  };
};
