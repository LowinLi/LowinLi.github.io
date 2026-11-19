import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset, Batch, blob, canvasTex, contactMaterial, rbox, rng, speckle } from '../util';

/**
 * 右后方靠墙的冰箱（奶油色的老式双门冰箱）和它左边的脚踏垃圾桶。用户要的一套小交互：
 * - 点冰箱：两扇门打开，镜头走到冰箱跟前（fridge:open）。点门、点旁边、ESC、返回：关门回座位（fridge:close）。
 * - 冰箱里：冷冻室两根冰棍儿，冷藏室两个苹果、三罐可乐；另有牛奶、饺子、鸡蛋、菜筐里的番茄黄瓜当摆设。
 * - 点一样东西：拿到镜头跟前。再点：
 *   苹果：咬一口、再咬一口、第三口只剩苹果核；再点扔进垃圾桶。
 *   冰棍儿：先撕开包装（包装纸飞进垃圾桶），再咬三口剩一根棍儿；再点扔进垃圾桶。
 *   可乐：先拉开拉环（嗤的一声），再喝三口；喝完自己扔进垃圾桶。
 * - 拿着东西点冰箱里面（不是门）：放回原处。吃过的东西也能放回去；只剩核、剩棍儿的直接扔掉。
 * - 往垃圾桶扔东西时，桶盖弹开（脚踏板踩下去），东西落到桶底，攒着。吃掉的就没了，刷新页面才补货。
 * 提示文字借用 cup:state（HTML 层现成的那条提示）；fridge:hold {p} 让后期的景深对焦到手里的东西。
 */
type Kind = 'apple' | 'cola' | 'pop';
const F = L.fridge, T = L.trash, FY = L.floorY;
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
const HAND = '"Kaiti SC","STKaiti","KaiTi",' + SANS;

export const fridge: SceneObject = ({ scene, camera, tier, bus, pick, audio }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  const group = new THREE.Group();          // 世界坐标：拿在手里、飞向垃圾桶的东西挂在这里
  const box = new THREE.Group();            // 冰箱本体，原点在底面中心，正面朝 +z
  box.position.set(F.x, FY, F.z);
  group.add(box);
  // 冰箱里面的东西（内胆、隔板、摆设）单独一组：关着门时整组不画
  const inside = new THREE.Group(); box.add(inside);
  const { w: W, d: D, h: H } = F, SH = 0.032; // 外壳厚度
  const cream = std({ color: 0xeee6d2, roughness: 0.32, metalness: 0.05 });
  const liner = std({ color: 0xf4f6f6, roughness: 0.5, emissive: 0xe8f2ff, emissiveIntensity: 0 });
  const chrome = std({ color: 0xe4e6e8, roughness: 0.15, metalness: 1 });
  const dark = std({ color: 0x2a2b2d, roughness: 0.7 });
  const glass = bin.add(new THREE.MeshStandardMaterial({ color: 0xdff3f0, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = box, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(bin.add(geo), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = false; m.receiveShadow = high; parent.add(m); return m;
  };
  // 不会动的部件：按父节点和材质合并成少数几个网格（冰箱零件多，一个个画 draw call 会翻倍）
  const statics = new Map<THREE.Object3D, Batch>();
  const S = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = box, rx = 0, ry = 0, rz = 0) => {
    let b = statics.get(parent); if (!b) statics.set(parent, (b = new Batch()));
    b.add(mat, geo, [x, y, z], [rx, ry, rz]);
  };

  // ---- 外壳：两侧、顶、底、背板 + 冷冻室和冷藏室之间的隔板；里面一层白色内胆（开门时微微发亮，像开了灯）----
  const FRIDGE_Y0 = 0.1, DIV_Y = 0.93, FREEZE_Y1 = H - SH;
  for (const sx of [-1, 1]) S(rbox(SH, H, D, 0.012), cream, sx * (W / 2 - SH / 2), H / 2, 0);
  S(rbox(W, SH, D, 0.012), cream, 0, H - SH / 2, 0);
  S(new THREE.BoxGeometry(W - 2 * SH, FRIDGE_Y0, D), cream, 0, FRIDGE_Y0 / 2, 0);
  S(new THREE.BoxGeometry(W - 2 * SH, H, SH), cream, 0, H / 2, -D / 2 + SH / 2);
  S(new THREE.BoxGeometry(W - 2 * SH, 0.045, D - SH), cream, 0, DIV_Y + 0.0225, SH / 2);
  S(new THREE.BoxGeometry(W - 0.1, 0.06, 0.004), dark, 0, 0.045, D / 2 + 0.002); // 底下的散热格栅
  const IW = W - 2 * SH - 0.004, ID = D - SH - 0.004;
  // 内胆：每个隔间五个面
  for (const [y0, y1] of [[FRIDGE_Y0, DIV_Y], [DIV_Y + 0.045, FREEZE_Y1]]) {
    const hh = y1 - y0, cy = (y0 + y1) / 2;
    S(new THREE.PlaneGeometry(IW, hh), liner, 0, cy, -D / 2 + SH + 0.002, inside);
    S(new THREE.PlaneGeometry(ID, hh), liner, -IW / 2, cy, SH / 2, inside, 0, Math.PI / 2);
    S(new THREE.PlaneGeometry(ID, hh), liner, IW / 2, cy, SH / 2, inside, 0, -Math.PI / 2);
    S(new THREE.PlaneGeometry(IW, ID), liner, 0, y0 + 0.002, SH / 2, inside, -Math.PI / 2);
    S(new THREE.PlaneGeometry(IW, ID), liner, 0, y1 - 0.002, SH / 2, inside, Math.PI / 2);
  }
  // 两层玻璃隔板（带白色前沿）
  const SHELF = [0.355, 0.615];
  for (const y of SHELF) {
    S(new THREE.BoxGeometry(IW, 0.006, ID - 0.03), glass, 0, y, SH / 2 - 0.01, inside);
    S(new THREE.BoxGeometry(IW, 0.014, 0.012), std({ color: 0xfafafa, roughness: 0.4 }), 0, y, D / 2 - 0.03, inside);
  }
  // 菜筐：半透明的抽屉，左前角三个番茄；其余地方空着，留给从园子里摘回来的菜（objects/basket.ts 往这里放）
  S(rbox(IW - 0.02, 0.2, ID - 0.06, 0.01), glass, 0, 0.215, SH / 2 - 0.02, inside);
  const tomatoM = std({ color: 0xd23a22, roughness: 0.25 });
  for (const [x, z] of [[-0.2, 0.12], [-0.13, 0.17], [-0.21, 0.04]]) S(new THREE.SphereGeometry(0.032, 14, 10).scale(1, 0.85, 1), tomatoM, x, 0.145, z, inside);
  // 上层：一盒牛奶
  const milkTex = bin.add(canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2d6fb8'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(w / 2, h * 0.55, w * 0.7, 18, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#2d6fb8'; g.font = `bold 34px ${SANS}`; g.textAlign = 'center'; g.fillText('鲜牛奶', w / 2, h * 0.42);
    g.fillStyle = '#fff'; g.font = `18px ${SANS}`; g.fillText('950ml', w / 2, h * 0.86);
  }));
  S(new THREE.BoxGeometry(0.07, 0.19, 0.07), std({ map: milkTex, roughness: 0.6 }), 0.17, SHELF[1] + 0.098, -0.12, inside);
  S(new THREE.ConeGeometry(0.05, 0.04, 4).rotateY(Math.PI / 4), std({ color: 0xf6f6f2, roughness: 0.6 }), 0.17, SHELF[1] + 0.21, -0.12, inside);
  // 冷冻室：一袋速冻饺子、一格冰块
  const dumpTex = bin.add(canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#c9302a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5, 600, '255,255,255', 0.15);
    g.fillStyle = '#ffe9b0'; g.font = `bold 50px ${SANS}`; g.textAlign = 'center'; g.fillText('水饺', w / 2, 70);
    g.font = `22px ${SANS}`; g.fillText('猪肉白菜馅 · 500g', w / 2, 112);
  }));
  S(rbox(0.16, 0.05, 0.12, 0.02), std({ map: dumpTex, roughness: 0.4 }), 0.13, DIV_Y + 0.07, -0.08, inside, 0, -0.2);
  S(rbox(0.11, 0.025, 0.07, 0.006), std({ color: 0xbfe6f2, roughness: 0.15, transparent: true, opacity: 0.8 }), -0.15, DIV_Y + 0.058, -0.12, inside);

  // ---- 两扇门：合页在右边（+x），往外、往右打开 ----
  const gasket = std({ color: 0xbfbcb4, roughness: 0.8 });
  const noteTex = bin.add(canvasTex(200, 200, (g, w, h) => {
    g.fillStyle = '#fbe58a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9, 500, '120,90,0', 0.08);
    g.fillStyle = '#2b2b46'; g.font = `30px ${HAND}`; g.textAlign = 'left';
    ['冰棍儿在上层', '可乐、苹果', '在下面 :)'].forEach((s, i) => g.fillText(s, 16, 52 + i * 46));
  }));
  type Door = { pivot: THREE.Group; inner: THREE.Group; open: number; lag: number };
  const magnetM = std({ color: 0xd8342a, roughness: 0.3 });
  const makeDoor = (y0: number, y1: number, lag: number, rack: boolean, note: boolean): Door => {
    const pivot = new THREE.Group(); pivot.position.set(W / 2, 0, D / 2); box.add(pivot);
    // 门内侧（密封条、内胆、蛋架）：关着门时被门板挡住，整组不画
    const inner = new THREE.Group(); pivot.add(inner);
    const h = y1 - y0, cy = (y0 + y1) / 2;
    S(rbox(W, h, 0.05, 0.016), cream, -W / 2, cy, 0.025, pivot);
    S(new THREE.BoxGeometry(W - 0.04, h - 0.04, 0.012), gasket, -W / 2, cy, -0.004, inner);
    S(new THREE.BoxGeometry(W - 0.09, h - 0.09, 0.006), liner, -W / 2, cy, -0.012, inner);
    // 把手：门左边一根竖着的镀铬杆
    const hl = Math.min(0.28, h * 0.6), hy = note ? y0 + 0.12 + hl / 2 : y0 + h * 0.55;
    S(new THREE.CapsuleGeometry(0.009, hl, 4, 10), chrome, -W + 0.04, hy, 0.075, pivot);
    for (const s of [-1, 1]) S(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8).rotateX(Math.PI / 2), chrome, -W + 0.04, hy + s * hl / 2, 0.06, pivot);
    if (note) {
      S(new THREE.PlaneGeometry(0.1, 0.1), std({ map: noteTex, roughness: 0.9 }), -W / 2 + 0.06, y1 - 0.12, 0.0512, pivot, 0, 0, 0.06);
      S(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16).rotateX(Math.PI / 2), magnetM, -W / 2 + 0.06, y1 - 0.075, 0.055, pivot);
      S(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 16).rotateX(Math.PI / 2), magnetM, -W / 2 - 0.13, y1 - 0.2, 0.054, pivot);
    }
    if (rack) {
      // 门内侧的蛋架：一条横栏，上面六个鸡蛋
      const railY = y1 - 0.18;
      S(new THREE.BoxGeometry(W - 0.12, 0.05, 0.006), std({ color: 0xfafafa, roughness: 0.4, transparent: true, opacity: 0.7 }), -W / 2, railY, -0.07, inner);
      S(new THREE.BoxGeometry(W - 0.12, 0.006, 0.06), liner, -W / 2, railY - 0.025, -0.045, inner);
      const egg = std({ color: 0xf0d7b5, roughness: 0.6 });
      for (let i = 0; i < 6; i++) S(new THREE.SphereGeometry(0.018, 12, 10).scale(1, 1.3, 1), egg, -W + 0.1 + i * 0.07, railY - 0.002, -0.045, inner);
    }
    return { pivot, inner, open: 0, lag };
  };
  const doors = [makeDoor(0.085, DIV_Y + 0.02, 0, true, false), makeDoor(DIV_Y + 0.03, H - 0.005, 0.12, false, true)];
  // 冷藏室门上用磁铁吸着一张粉红色的老式火车票：2014 年正月十七，坐绿皮车离开黑土地（旧博客《月下绿皮》）。点它翻开书桌上的《行路》
  const ticketTex = bin.add(canvasTex(480, 240, (g, w, h) => {
    g.fillStyle = '#f3c9c4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,90,90,.18)'; g.lineWidth = 1;
    for (let x = -h; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }   // 防伪底纹
    speckle(g, w, h, 17, 900, '140,60,60', 0.06);
    g.fillStyle = '#c0392b'; g.font = 'bold 22px "Courier New", monospace'; g.textAlign = 'left'; g.fillText('A 020170', 20, 34);
    g.fillStyle = '#2b2522'; g.font = `24px ${SANS}`; g.textAlign = 'right'; g.fillText('检票：月台', w - 20, 34);
    g.textAlign = 'center'; g.font = `bold 42px ${SANS}`; g.fillText('黑土地站', 108, 98); g.fillText('远方站', w - 100, 98);
    g.font = `22px ${SANS}`; g.fillText('绿 皮', w / 2, 80);
    g.strokeStyle = '#2b2522'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 - 38, 94); g.lineTo(w / 2 + 38, 94); g.lineTo(w / 2 + 28, 88); g.stroke();
    g.font = `24px ${SANS}`; g.textAlign = 'left';
    g.fillText('2014年02月17日 正月十七开', 20, 148); g.textAlign = 'right'; g.fillText('06车017号', w - 20, 148);
    g.textAlign = 'left'; g.fillText('¥ 一年乡愁元', 20, 186); g.textAlign = 'right'; g.fillText('硬座', w - 20, 186);
    g.fillStyle = '#7a4a44'; g.font = `18px ${SANS}`; g.textAlign = 'center'; g.fillText('限乘当日当次车 · 月下绿皮', w / 2, 222);
  }));
  const ticket = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(0.12, 0.06)), std({ map: ticketTex, roughness: 0.85 }));
  ticket.position.set(-W / 2 - 0.02, DIV_Y - 0.17, 0.0514); ticket.rotation.z = -0.07;
  ticket.userData.keepsFridge = true;
  doors[0].pivot.add(ticket);
  S(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16).rotateX(Math.PI / 2), magnetM, -W / 2 - 0.02 - 0.045, DIV_Y - 0.17 + 0.022, 0.055, doors[0].pivot);
  pick(ticket, { click: () => emit(bus, 'book:open', { id: 'vol-road' }) });
  S(blob(W * 0.7, D * 0.65), contactMaterial(bin, high ? 0.35 : 0.6), 0, 0.012, 0);
  box.userData.keepsFridge = true; box.name = 'fridge';

  // ---- 垃圾桶：不锈钢脚踏桶，桶盖朝后掀开 ----
  const can = new THREE.Group(); can.position.set(T.x, FY, T.z); group.add(can);
  const steel = std({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.9 });
  S(new THREE.CylinderGeometry(T.r, T.r * 0.9, T.h, 32, 1, true), steel, 0, T.h / 2, 0, can);
  S(new THREE.CylinderGeometry(T.r - 0.004, T.r * 0.9 - 0.004, T.h, 24, 1, true), std({ color: 0x2b2c2f, roughness: 0.9, side: THREE.BackSide }), 0, T.h / 2, 0, can);
  S(new THREE.CircleGeometry(T.r * 0.9, 24).rotateX(-Math.PI / 2), dark, 0, 0.012, 0, can);
  S(new THREE.TorusGeometry(T.r * 0.9, 0.006, 6, 32).rotateX(Math.PI / 2), dark, 0, 0.008, 0, can);
  const lid = new THREE.Group(); lid.position.set(0, T.h, -T.r); can.add(lid);
  S(new THREE.CylinderGeometry(T.r + 0.004, T.r + 0.006, 0.02, 32), steel, 0, 0.01, T.r, lid);
  S(new THREE.SphereGeometry(T.r + 0.004, 32, 8, 0, Math.PI * 2, 0, 0.35).scale(1, 0.6, 1).translate(0, -(T.r + 0.004) * 0.6 * Math.cos(0.35) + 0.02, 0), steel, 0, 0, T.r, lid);
  const pedal = add(rbox(0.07, 0.012, 0.05, 0.004), dark, 0, 0.02, T.r + 0.02, can);
  S(blob(T.r * 1.3, T.r * 1.3), contactMaterial(bin, high ? 0.35 : 0.6), 0, 0.012, 0, can);
  can.userData.keepsFridge = true;
  // 只让大块的外壳、门板和垃圾桶投影；把手、磁贴、鸡蛋这些小东西投影看不出来，在阴影通道里却各占一次 draw call
  for (const [parent, b] of statics) for (const m of b.build(parent, bin, { receive: high, collapse: true, keep: [cream, steel] })) m.castShadow = high && (m.material === cream || m.material === steel);
  let lidOpen = 0, lidHold = 0;
  pick(can, { click() { lidHold = 1.2; sfx('clank'); } });

  // ---- 声音：全是 WebAudio 现合成的短噪声 ----
  let ac: AudioContext | null = null;
  const sfx = (kind: 'crunch' | 'tear' | 'fizz' | 'gulp' | 'clank' | 'door') => {
    try { ac ??= audio(); } catch { return; }
    const a = ac, t0 = a.currentTime;
    const noise = (dur: number, f: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0) => {
      const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = a.createBufferSource(); s.buffer = buf;
      const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = a.createGain(); g.gain.value = gain;
      s.connect(fl).connect(g).connect(a.destination); s.start(t0 + at);
    };
    const tone = (f: number, dur: number, gain: number, at = 0, f2 = f) => {
      const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(f, t0 + at); o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
      g.gain.setValueAtTime(gain, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    };
    if (kind === 'crunch') for (let i = 0; i < 4; i++) noise(0.05, 1800 + i * 600, 1.5, 0.5, 'bandpass', i * 0.04);
    if (kind === 'tear') for (let i = 0; i < 6; i++) noise(0.06, 3000 + i * 300, 0.8, 0.25, 'highpass', i * 0.035);
    if (kind === 'fizz') { noise(0.08, 2500, 0.7, 0.6, 'highpass'); noise(0.9, 5000, 0.5, 0.18, 'highpass', 0.05); }
    if (kind === 'gulp') { tone(320, 0.12, 0.3, 0, 180); tone(300, 0.12, 0.25, 0.35, 170); }
    if (kind === 'clank') { tone(880, 0.25, 0.12, 0, 820); tone(1320, 0.18, 0.06); noise(0.04, 4000, 1, 0.3); }
    if (kind === 'door') noise(0.15, 300, 0.7, 0.4, 'lowpass');
  };

  // ---------------- 冰箱里的东西 ----------------
  type Fly = { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; spin: THREE.Vector3; done?: () => void };
  const flies: Fly[] = [];
  const tossed: THREE.Object3D[] = []; // 扔进桶里的包装纸
  let binCount = 0;
  /** 扔进垃圾桶：沿抛物线飞到桶口上方，再落到桶底；飞的时候打转。桶盖提前掀开 */
  const toss = (obj: THREE.Object3D, done?: () => void) => {
    group.attach(obj);
    const r = rng(binCount * 7 + 3);
    const to = new THREE.Vector3(T.x + (r() - 0.5) * 0.08, FY + 0.03 + Math.min(0.22, binCount * 0.022), T.z + (r() - 0.5) * 0.08);
    binCount++;
    if (!(obj as THREE.Group).userData.fridgeItem) tossed.push(obj);
    lidHold = Math.max(lidHold, 1.6);
    flies.push({ obj, from: obj.position.clone(), to, t: 0, dur: 1.0, spin: new THREE.Vector3(r() * 8 - 4, r() * 6, r() * 8 - 4), done });
  };

  interface Item {
    kind: Kind; root: THREE.Group; body: THREE.Group;
    slot: THREE.Vector3; slotQ: THREE.Quaternion;
    state: 'fridge' | 'held' | 'back' | 'fly' | 'bin';
    step: number; opened: boolean; action: null | 'bite' | 'tear' | 'open' | 'sip'; t: number; spin: number;
    onStep?: (n: number) => void; onOpen?: () => void; anim?: (k: number, a: string | null) => void;
    useModel?: (m: THREE.Object3D) => void; usePop?: (whole: THREE.Mesh, bitten: THREE.Mesh, cut: { value: number }) => void;
  }
  const items: Item[] = [];
  const makeItem = (kind: Kind, local: [number, number, number], rot: [number, number, number], build: (body: THREE.Group, it: Item) => void) => {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const slot = box.localToWorld(new THREE.Vector3(...local)), slotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    root.position.copy(slot); root.quaternion.copy(slotQ);
    const it: Item = { kind, root, body, slot, slotQ, state: 'fridge', step: 0, opened: kind === 'apple', action: null, t: 0, spin: 0 };
    build(body, it);
    // 吃的东西都很小，不投影（省掉阴影通道里的 draw call）
    root.userData.keepsFridge = true; root.userData.fridgeItem = kind; root.userData.itemId = `${kind}${items.filter((i) => i.kind === kind).length}`;
    group.add(root);
    pick(root, { click: () => onItem(it) });
    items.push(it);
    return it;
  };

  // 苹果：顶点色画的果皮（红里透黄、带细条纹），每咬一口在朝着你的那一面挖一个带牙印的坑，露出果肉；第三口只剩果核
  const APPLE_R = 0.036;
  const makeApple = (seed: number) => (body: THREE.Group, it: Item) => {
    const geo = bin.add(new THREE.SphereGeometry(1, 36, 28));
    const p = geo.attributes.position, base = Float32Array.from(p.array as Float32Array);
    const r = rng(seed), ph = r() * 6;
    const skin: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const a = Math.atan2(z, x);
      // 上下两头凹进去一个窝，肩部略宽
      const dimple = 1 - 0.32 * Math.exp(-(((1 - Math.abs(y)) / 0.12) ** 2));
      const sh = (1 + 0.08 * y) * (1 + 0.025 * Math.sin(a * 5 + ph));
      base[i * 3] = x * sh; base[i * 3 + 1] = y * 0.9 * dimple; base[i * 3 + 2] = z * sh;
      const streak = 0.5 + 0.5 * Math.sin(a * 23 + Math.sin(y * 4) * 2 + ph);
      const c = new THREE.Color(0xb3121c).lerp(new THREE.Color(0xe7b440), Math.max(0, -y * 0.45 + 0.1 + streak * 0.18) * (0.6 + r() * 0.2));
      skin.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(skin.slice(), 3));
    const flesh = new THREE.Color(0xf4e7b8);
    const mesh = new THREE.Mesh(geo, std({ vertexColors: true, roughness: 0.38 }));
    mesh.scale.setScalar(APPLE_R); body.add(mesh);
    const stem = add(new THREE.CylinderGeometry(0.0016, 0.0022, 0.018, 6), std({ color: 0x5a3a1c, roughness: 0.8 }), 0.001, APPLE_R * 0.86, 0, body, 0, 0, 0.2);
    const leaf = add(new THREE.SphereGeometry(1, 8, 4).scale(0.011, 0.0015, 0.005), std({ color: 0x4d8a2a, roughness: 0.5 }), 0.008, APPLE_R * 0.92, 0.002, body, 0, 0.6, 0.3);
    const seeds = new THREE.Group(); seeds.visible = false; body.add(seeds);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(1, 8, 6).scale(0.0035, 0.006, 0.002), std({ color: 0x3a2412, roughness: 0.4 }), s * 0.006, 0.002, APPLE_R * 0.24, seeds);
    const bites: THREE.Vector3[] = [];
    let core = false;
    const shape = () => {
      const col = geo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        let bitten = false;
        for (const b of bites) {
          // 牙印：咬痕的边是一圈小扇贝
          const v = new THREE.Vector3(x, y, z), d = v.distanceTo(b);
          const ang = Math.atan2(y - b.y, (x - b.x) + (z - b.z));
          const R = 0.62 + 0.05 * Math.sin(ang * 9);
          if (d < R) { const push = (R - d) * 0.75; const n = b.clone().normalize(); x -= n.x * push; y -= n.y * push * 0.6; z -= n.z * push; bitten = true; }
        }
        if (core && Math.abs(y) < 0.66) {
          // 果核：中段削到只剩细细一根，上下两头保留一点果皮
          const k = Math.abs(y) / 0.66, cr = 0.2 + 0.55 * k ** 4, rr = Math.hypot(x, z);
          if (rr > cr) { x *= cr / rr; z *= cr / rr; } bitten = true;
        }
        p.setXYZ(i, x, y, z);
        if (bitten) col.setXYZ(i, flesh.r, flesh.g, flesh.b); else col.setXYZ(i, skin[i * 3], skin[i * 3 + 1], skin[i * 3 + 2]);
      }
      p.needsUpdate = true; col.needsUpdate = true; geo.computeVertexNormals();
    };
    shape();
    it.onStep = (n) => {
      if (n < 3) { const a = -it.spin; bites.push(new THREE.Vector3(Math.sin(a), 0.1 * (n - 1), Math.cos(a)).multiplyScalar(1.02)); }
      else { core = true; seeds.visible = true; }
      shape();
      void stem; void leaf;
    };
  };
  for (const [i, x] of [-0.1, 0.06].entries()) makeItem('apple', [x, SHELF[1] + APPLE_R * 0.86, 0.06 - i * 0.05], [0, i * 2, 0.08], makeApple(11 + i * 5));

  // 可乐：红色易拉罐。罐身一张贴图，罐顶罐底是铝；拉环先翘起来再按回去，露出开口
  const colaTex = bin.add(canvasTex(512, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#b3121a'); grd.addColorStop(0.5, '#e02a24'); grd.addColorStop(1, '#a80f17');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 97) % w, (i * 53) % h, 2 + (i % 4) * 2, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = `900 92px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const x of [w * 0.25, w * 0.75]) { g.fillText('可乐', x, h * 0.44); g.font = `bold 30px ${SANS}`; g.fillText('冰 镇 · COLA', x, h * 0.74); g.font = `900 92px ${SANS}`; }
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  }));
  const alu = std({ color: 0xd4d6d9, roughness: 0.25, metalness: 1 });
  const CAN_R = 0.033, CAN_H = 0.115;
  const bubGeo = bin.add(new THREE.SphereGeometry(0.0018, 6, 4));
  const makeCola = (body: THREE.Group, it: Item) => {
    const lathe = (pts: number[][]) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32);
    const drawn = [ // 代码画的罐子：模型到之前（或加载失败时）用
      add(new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H - 0.02, 32, 1, true, -Math.PI / 2), std({ map: colaTex, roughness: 0.25, metalness: 0.5 }), 0, CAN_H / 2, 0, body),
      add(lathe([[0, 0.004], [0.022, 0.0], [0.03, 0.004], [CAN_R, 0.01]]), alu, 0, 0, 0, body),
    ];
    drawn.push(add(lathe([[CAN_R, CAN_H - 0.01], [0.027, CAN_H - 0.001], [0.0275, CAN_H + 0.001], [0.0255, CAN_H + 0.001], [0.025, CAN_H - 0.003], [0, CAN_H - 0.003]]), alu, 0, 0, 0, body));
    const hole = add(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), std({ color: 0x0d0a08, roughness: 0.9 }), 0, CAN_H - 0.0025, 0.012, body);
    hole.scale.set(0.0001, 1, 0.0001);
    const tabPivot = new THREE.Group(); tabPivot.position.set(0, CAN_H - 0.002, 0.002); body.add(tabPivot);
    add(rbox(0.014, 0.0015, 0.026, 0.0007, 1), alu, 0, 0.0008, -0.006, tabPivot);
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 10), alu, 0, 0.0008, 0, tabPivot);
    const fizz = new THREE.Group(); body.add(fizz);
    const bubM = bin.add(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    const bubs = new THREE.InstancedMesh(bubGeo, bubM, 8); bubs.visible = false; fizz.add(bubs);
    const bm = new THREE.Matrix4();
    let model = false;
    it.useModel = (m) => {
      // 模型自带一个平躺的拉环；代码的拉环平时藏着，拉开时才出来翘起（像模型上那个被掰起来了）。开口抬到模型的罐盖上面
      for (const d of drawn) d.visible = false;
      body.add(m); model = true; tabPivot.visible = it.opened; hole.position.y = 0.1139;
    };
    it.onOpen = () => { tabPivot.visible = true; };
    it.anim = (k, a) => {
      void model;
      // 拉环：先翘到 75°，再按回到 15°；开口跟着出现；冒一串小气泡
      if (a === 'open') {
        const up = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5 * 0.8;
        tabPivot.rotation.x = -up * 1.3;
        const s = Math.min(1, k * 2.2); hole.scale.set(0.007 * s, 1, 0.0045 * s);
        bubM.opacity = Math.sin(k * Math.PI) * 0.8; bubs.visible = true;
        for (let i = 0; i < 8; i++) { bm.makeScale(1 + (i % 3) * 0.4, 1 + (i % 3) * 0.4, 1 + (i % 3) * 0.4).setPosition(Math.sin(i * 2.3 + k * 9) * 0.006, CAN_H + k * (0.01 + i * 0.006), 0.012 + Math.cos(i) * 0.003); bubs.setMatrixAt(i, bm); }
        bubs.instanceMatrix.needsUpdate = true;
      } else if (it.opened) { tabPivot.rotation.x = -0.25; hole.scale.set(0.007, 1, 0.0045); bubs.visible = false; }
    };
  };
  for (const [i, x] of [-0.15, -0.06, 0.03].entries()) makeItem('cola', [x, SHELF[0] + 0.004, 0.08 - (i % 2) * 0.05], [0, -0.4 + i * 0.5, 0], makeCola);

  // 冰棍儿：包装纸（上下两截，撕开时上截飞走、下截从棍儿上褪下来）+ 奶黄色的冰棍 + 木棍。咬一口少一截，顶上是牙印
  const wrapTex = (top: boolean) => bin.add(canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f7f9fb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f77c8'; for (let y = 0; y < h; y += 28) g.fillRect(0, y, w, 6);
    g.fillStyle = '#e03a30'; g.fillRect(0, top ? h - 70 : 0, w, 70);
    g.fillStyle = '#fff'; g.font = `bold 40px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (top) g.fillText('脆皮', w / 2, h - 36); else g.fillText('雪糕', w / 2, 36);
    g.fillStyle = '#2f77c8'; g.font = `24px ${SANS}`; g.fillText(top ? '❄ 巧克力' : '❄ 香草奶油', w / 2, top ? 60 : 150);
  }));
  const wrapTop = wrapTex(true), wrapBot = wrapTex(false);
  const POP_W = 0.042, POP_H = 0.07, POP_D = 0.018, STICK = 0.045; // 和模型（icebar.glb）的尺寸一致
  const popShape = (lv: number) => {
    // 剩 lv 截（3 是整根）：底边平，顶上 3 是圆角；吃过的顶上是两三个半圆的牙印
    const h = POP_H * lv / 3, s = new THREE.Shape(), x0 = -POP_W / 2, x1 = POP_W / 2, rr = 0.01;
    s.moveTo(x0 + 0.004, 0); s.lineTo(x1 - 0.004, 0); s.quadraticCurveTo(x1, 0, x1, 0.004);
    if (lv === 3) {
      s.lineTo(x1, h - rr); s.quadraticCurveTo(x1, h, x1 - rr, h); s.lineTo(x0 + rr, h); s.quadraticCurveTo(x0, h, x0, h - rr);
    } else {
      s.lineTo(x1, h - 0.004);
      const n = 3, seg = POP_W / n;
      for (let i = 0; i < n; i++) { const xa = x1 - i * seg, xb = xa - seg; s.quadraticCurveTo((xa + xb) / 2, h - seg * (0.55 + (i % 2) * 0.25), xb, h - 0.002 * (i % 2)); }
    }
    s.lineTo(x0, 0.004); s.quadraticCurveTo(x0, 0, x0 + 0.004, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: POP_D - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 6 });
    return bin.add(g.translate(0, 0, -(POP_D - 0.006) / 2));
  };
  const popGeos = [0, 1, 2, 3].map((lv) => (lv ? popShape(lv) : null));
  const BARE_LO = -0.039, BARE_HI = 0.046, BARE_W = 0.0095;
  const bareGeo = bin.add(new THREE.CapsuleGeometry(BARE_W / 2, BARE_HI - BARE_LO - BARE_W, 4, 10).scale(1, 1, 0.24).translate(0, (BARE_HI + BARE_LO) / 2, 0));
  const bareMat = std({ roughness: 0.75, map: bin.add(canvasTex(32, 256, (g, w, h) => {
    g.fillStyle = '#dcc394'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,110,60,.35)'; g.lineWidth = 1;
    for (let x = 3; x < w; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 1, h); g.stroke(); } // 木纹
    // 贴图上半是棍子的上半截（原来插在雪糕里）：沾着化掉的巧克力，越往下越淡，边缘不齐
    const grd = g.createLinearGradient(0, 0, 0, h * 0.5); grd.addColorStop(0, 'rgba(70,38,20,.8)'); grd.addColorStop(0.55, 'rgba(90,50,25,.3)'); grd.addColorStop(1, 'rgba(110,70,35,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h * 0.5);
    const q = rng(91); g.fillStyle = 'rgba(70,38,20,.45)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(q() * w, h * (0.3 + q() * 0.2), 2 + q() * 4, 4 + q() * 10, 0, 0, 7); g.fill(); }
  })) });
  const makePop = (body: THREE.Group, it: Item) => {
    const stick = add(new THREE.BoxGeometry(0.009, STICK + 0.03, 0.0022), std({ color: 0xd9bf8a, roughness: 0.8 }), 0, -STICK / 2 + 0.015, 0, body);
    const ice = new THREE.Mesh(popGeos[3]!, std({ color: 0x3b2216, roughness: 0.35 })); ice.position.y = 0.0; body.add(ice); // 代码画的版本：模型到之前用
    const frost = std({ roughness: 0.6, map: wrapTop, side: THREE.DoubleSide }), frost2 = std({ roughness: 0.6, map: wrapBot, side: THREE.DoubleSide });
    // 包装：两截各是一个扁盒子，两头压出锯齿边
    // 两截在 cut 处接上，合起来从棍子下半截一直包到冰棍顶上再多出一点
    const yTop = POP_H + 0.018, yBot = -STICK * 0.55, cut = POP_H * 0.5;
    const top = add(rbox(POP_W + 0.012, yTop - cut, POP_D + 0.01, 0.005), frost, 0, (yTop + cut) / 2, 0, body);
    const bot = add(rbox(POP_W + 0.012, cut - yBot, POP_D + 0.01, 0.005), frost2, 0, (cut + yBot) / 2, 0, body);
    let bars: { whole: THREE.Mesh; bitten: THREE.Mesh; cut: { value: number } } | null = null;
    const showLevel = (lv: number) => {
      if (!bars) { ice.visible = lv > 0; if (lv > 0) ice.geometry = popGeos[lv]!; return; }
      // 3：整根；2：模型里那根被咬过一口的；1：整根从下往上只留三分之一（切口是一排牙印，切开的地方露出里面的奶油）；0：只剩棍儿
      bars.whole.visible = lv === 3 || lv === 1; bars.bitten.visible = lv === 2; bare.visible = lv === 0;
      bars.cut.value = lv === 1 ? 0.026 : 1;
    };
    // 吃光后剩的整根棍儿：模型里的棍子只建了露在外面的一小截，插在雪糕里的那段没有，切光了只剩个短头（用户说「把棍也吃了」）。
    // 所以最后一档换成一根完整的：两头圆、扁的，上半截沾着巧克力，伸到原来雪糕的三分之二高
    const bare = add(bareGeo.clone(), bareMat, 0, 0, 0, body); bare.visible = false;
    it.onStep = (n) => showLevel(3 - n);
    it.usePop = (whole, bitten, cut) => {
      stick.visible = false; ice.visible = false;
      body.add(whole, bitten); bars = { whole, bitten, cut }; showLevel(3 - it.step);
    };
    it.onOpen = () => {
      // 撕开：上截往上一扯、甩向垃圾桶；下截顺着棍儿褪下来，过一会儿也扔进去
      sfx('tear');
      toss(top);
      setTimeout(() => { bot.position.y -= 0.03; toss(bot); }, 350);
    };
  };
  // 冰棍平躺在冷冻室底板上
  for (const [i, x] of [-0.13, -0.01].entries()) makeItem('pop', [x, DIV_Y + 0.045 + 0.016, 0.08 + i * 0.03], [-Math.PI / 2, 0, 0.3 - i * 0.5], makePop);

  // ---- 换成模型：可乐罐和巧克力脆皮雪糕（Sketchfab，CC-BY，见 CREDITS.md；tools/prep_fridge_models.py 摆正、缩放过）----
  // 异步加载，到之前是上面代码画的版本
  let stopped = false;
  const loader = new GLTFLoader();
  loader.loadAsync(asset('models/fridge/cola.glb')).then((gltf) => {
    let src: THREE.Mesh | undefined; gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
    if (!src || stopped) return;
    const mat = src.material as THREE.MeshStandardMaterial; bin.add(src.geometry); bin.add(mat);
    for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap'] as const) if (mat[k]) bin.add(mat[k]!);
    mat.envMapIntensity = 0.9; credit.cola = '模型 Blender3D · CC BY';
    for (const it of items) if (it.kind === 'cola') {
      const m = new THREE.Mesh(src.geometry, mat); m.rotation.y = 2.51; // 让「Coke」那一面朝前（拿起来时朝着镜头）
      it.useModel?.(m);
    }
  }).catch(() => {});
  loader.loadAsync(asset('models/fridge/icebar.glb')).then((gltf) => {
    const get = (n: string) => gltf.scene.getObjectByName(n) as THREE.Mesh | undefined;
    const a = get('whole'), b = get('bitten');
    if (!a || !b || stopped) return;
    credit.pop = '模型 ArbitraryCanary · CC BY';
    const base = a.material as THREE.MeshStandardMaterial; bin.add(a.geometry); bin.add(b.geometry); bin.add(base);
    for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap'] as const) if (base[k]) bin.add(base[k]!);
    for (const it of items) if (it.kind === 'pop') {
      // 每根冰棍一份材质（切口高度各不相同）：高于切口的片元丢掉，背面（从切口看进去的内壁）画成奶油色，像实心的
      const cut = { value: 1 };
      const mat = bin.add(base.clone()); mat.side = THREE.DoubleSide;
      mat.color.setScalar(2.1); mat.roughness = 0.45; mat.envMapIntensity = 1.4; // 原贴图很暗，冰箱跟前几乎是黑的；调亮一点、带点光泽
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uCut = cut;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;\nuniform float uCut;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            // 切口是一排半圆的牙印（只在吃到一半时有；整根时 uCut=1，吃完时贴着巧克力下沿一刀平切）
            float bite = uCut > 0.01 && uCut < 0.5 ? 0.006 * abs(sin(vLp.x * 110.0)) - 0.003 : 0.0;
            if (vLp.y > uCut + bite) discard;`)
          .replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.93, 0.86, 0.72);')
          // 内壁的法线朝里，吃不到光：自己发一点光，读起来像切开的实心奶油
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (!gl_FrontFacing) totalEmissiveRadiance += vec3(0.42, 0.38, 0.3);');
      };
      mat.customProgramCacheKey = () => 'icebar-cut';
      const whole = new THREE.Mesh(a.geometry, mat), bitten = new THREE.Mesh(b.geometry, mat);
      it.usePop?.(whole, bitten, cut);
    }
  }).catch(() => {});

  // ---------------- 交互 ----------------
  let isOpen = false, held: Item | null = null;
  const say = (msg: string | null) => emit(bus, 'cup:state', msg ? { msg } : null);
  const left = ['', '还剩两口', '还剩一口', ''];
  // 两个模型是 CC-BY：拿在手里时提示末尾带上署名（网站上没有别的地方放）
  const credit: Partial<Record<Kind, string>> = {};
  const hint = (it: Item): string => {
    const c = credit[it.kind];
    return c ? `${hint0(it)} · ${c}` : hint0(it);
  };
  const hint0 = (it: Item): string => {
    if (it.kind === 'apple') return it.step < 3 ? `点一下咬一口${it.step ? ' · ' + left[it.step] : ''}` : '只剩苹果核了 · 点一下扔进垃圾桶';
    if (it.kind === 'pop') return !it.opened ? '点一下撕开包装' : it.step < 3 ? `点一下咬一口${it.step ? ' · ' + left[it.step] : ''}` : '只剩一根棍儿了 · 点一下扔进垃圾桶';
    return !it.opened ? '点一下拉开拉环' : it.step < 3 ? `点一下喝一口${it.step ? ' · ' + left[it.step] : ''}` : '喝完了，扔进垃圾桶';
  };
  const idleHint = () => items.some((i) => i.state === 'fridge') ? '点苹果、可乐或冰棍儿拿出来 · 点冰箱门关上' : '冰箱空了 · 点冰箱门关上';
  const done = (it: Item) => it.step >= 3;
  const focusP = new THREE.Vector3(F.x, FY + 0.7, F.z + D / 2);
  const putBack = (it: Item) => {
    if (held === it) held = null;
    if (done(it)) { throwAway(it); return; }
    it.state = 'back'; it.action = null;
  };
  const throwAway = (it: Item) => {
    if (held === it) held = null;
    it.state = 'fly'; it.action = null;
    sfx('clank');
    toss(it.root, () => { it.state = 'bin'; it.root.traverse((o) => { o.userData.binned = true; }); });
  };
  const hold = (it: Item) => {
    if (held && held !== it) putBack(held);
    held = it; it.state = 'held';
    emit(bus, 'fridge:hold', { p: it.root.position.toArray() });
    say(hint(it));
  };
  const onItem = (it: Item) => {
    if (it.state === 'fly' || it.state === 'bin') return;
    if (!isOpen) { emit(bus, 'fridge:open'); return; }
    if (it.state === 'fridge' || it.state === 'back') { hold(it); return; }
    if (it.state !== 'held' || it.action) return;
    ac ??= audio();
    if (done(it)) { throwAway(it); say(idleHint()); emit(bus, 'fridge:hold', null); return; }
    if (!it.opened) { it.action = it.kind === 'pop' ? 'tear' : 'open'; it.t = 0; if (it.kind === 'cola') sfx('fizz'); it.onOpen?.(); it.opened = true; say(hint(it)); return; }
    it.action = it.kind === 'cola' ? 'sip' : 'bite'; it.t = 0;
  };
  const openFridge = () => { if (isOpen) return; isOpen = true; sfx('door'); say(idleHint()); };
  const closeFridge = () => {
    if (!isOpen) return;
    isOpen = false;
    if (held) putBack(held);
    for (const it of items) if (it.state === 'held') putBack(it);
    say(null);
  };
  pick(box, {
    click(hit) {
      if (!isOpen) { emit(bus, 'fridge:open'); return; }
      // 开着门：点门关上；点冰箱里面，把手里的东西放回去
      let o: THREE.Object3D | null = hit.object, onDoor = false;
      while (o && o !== box) { if (doors.some((d) => d.pivot === o)) onDoor = true; o = o.parent; }
      if (onDoor || !held) { emit(bus, 'fridge:close'); return; }
      putBack(held); emit(bus, 'fridge:hold', null); say(idleHint());
    },
  });
  const off = [
    on(bus, 'fridge:open', openFridge),
    on(bus, 'fridge:close', closeFridge),
  ];
  scene.add(group);

  // 拿在镜头跟前的姿态：相机前方偏下 0.3 米；item 的 +z 朝着镜头。吃的时候往镜头凑、往上抬
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  const holdPose = (it: Item, k: number) => {
    const far = Math.max(1, 0.75 / camera.aspect);
    const cfg = { apple: [-0.06, 0.28, 0.25, 0], cola: [-0.075, 0.3, 0.15, 1.0], pop: [-0.06, 0.28, 0.1, 0.3] }[it.kind];
    want.set(0, cfg[0] + k * 0.03, -cfg[1] * far + k * 0.1).applyMatrix4(camera.matrixWorld);
    // 可乐喝的时候罐口朝你倾过来；其余的微微前倾
    wantQ.copy(camera.quaternion).multiply(tmpQ.setFromEuler(tmpE.set(cfg[2] + k * cfg[3], it.spin, 0, 'YXZ')));
  };

  return {
    frame(dt, t) {
      camera.updateMatrixWorld();
      // 门：开的时候冷藏门先开、冷冻门稍晚；关的时候反过来
      for (const d of doors) {
        const target = isOpen ? 1 : 0;
        d.open = damp(d.open, target, 5.5 - d.lag * 10, dt);
        d.pivot.rotation.y = d.open * 1.95;
      }
      liner.emissiveIntensity = doors[0].open * 0.35;
      // 关着门看不见里面：内胆、摆设和还在冰箱里的东西都不画；桶里的东西只在桶盖掀开时画
      const peek = doors[0].open > 0.02 || doors[1].open > 0.02;
      inside.visible = peek; for (const d of doors) d.inner.visible = peek;
      for (const it of items) it.root.visible = it.state === 'bin' ? lidOpen > 0.05 : it.state === 'fridge' ? peek : true;
      for (const w of tossed) w.visible = lidOpen > 0.05 || flies.some((f) => f.obj === w);
      // 垃圾桶盖：有东西要扔进来时掀开，脚踏板踩下去
      lidHold = Math.max(0, lidHold - dt);
      lidOpen = damp(lidOpen, lidHold > 0 ? 1 : 0, 9, dt);
      lid.rotation.x = -lidOpen * 1.25; pedal.position.y = 0.02 - lidOpen * 0.012;
      // 飞向垃圾桶的东西
      for (let i = flies.length - 1; i >= 0; i--) {
        const f = flies[i];
        f.t = Math.min(1, f.t + dt / f.dur);
        const e = f.t;
        f.obj.position.lerpVectors(f.from, f.to, e);
        f.obj.position.y += Math.sin(e * Math.PI) * 0.45 + (1 - e) * 0;
        f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; f.obj.rotation.z += f.spin.z * dt;
        if (e > 0.85) lidHold = Math.max(lidHold, 0.5);
        if (f.t >= 1) { flies.splice(i, 1); f.done?.(); }
      }
      for (const it of items) {
        if (it.state === 'fly' || it.state === 'bin') { it.root.userData.state = it.state; it.root.userData.action = null; continue; }
        let k = 0;
        if (it.action) {
          const dur = it.action === 'sip' ? 1.3 : it.action === 'open' ? 0.9 : it.action === 'tear' ? 0.8 : 1.0;
          const before = it.t;
          it.t = Math.min(1, it.t + dt / dur);
          if ((it.action === 'bite' || it.action === 'sip') && before < 0.5 && it.t >= 0.5) {
            it.step++;
            sfx(it.action === 'sip' ? 'gulp' : 'crunch');
            it.onStep?.(it.step);
            say(hint(it));
          }
          if (it.action === 'bite' || it.action === 'sip') k = Math.sin(it.t * Math.PI);
          else k = Math.sin(it.t * Math.PI) * 0.35;
          it.anim?.(it.t, it.action);
          if (it.t >= 1) {
            const a = it.action; it.action = null; it.anim?.(1, null);
            if (a === 'bite') it.spin += 2.2; // 转一下，下一口咬在新的地方
            if (a === 'tear' || a === 'open') say(hint(it));
            // 可乐喝完自己扔掉
            if (it.kind === 'cola' && done(it)) { throwAway(it); setTimeout(() => { say(isOpen ? idleHint() : null); }, 1200); emit(bus, 'fridge:hold', null); }
          }
        }
        if (it.state === 'held') holdPose(it, k); else { want.copy(it.slot); wantQ.copy(it.slotQ); }
        const f = 1 - Math.exp(-(it.state === 'held' ? 8 : 6) * dt);
        it.root.position.lerp(want, f);
        it.root.quaternion.slerp(wantQ, f);
        if (it.state === 'back' && it.root.position.distanceTo(it.slot) < 0.002) it.state = 'fridge';
        it.root.userData.state = it.state; it.root.userData.step = it.step; it.root.userData.opened = it.opened; it.root.userData.action = it.action;
      }
      void t; void focusP;
    },
    stop() { stopped = true; off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
