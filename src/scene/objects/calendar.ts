import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { damp } from '../tween';
import { Batch, blob, canvasTex, contactMaterial, rbox, speckle } from '../util';
import { addDays, basicInfo, dayKey, drawPage, fullInfo, loadLunar, PAGE_H, PAGE_W, PAPER, type DayInfo } from '../../almanac';

const CAL_X = -1.02;
const SERIF = '"Songti SC","Noto Serif CJK SC","SimSun",serif';

/**
 * 桌上的老黄历：红漆木座 + 一本撕页日历，永远翻在今天那一页。
 * 本子的厚度跟着今年还剩多少天变；最上面一页上沿微微翘起。
 * 进来时如果距离上次来过了几天（或者第一次来），会把这几天的页一张张撕掉，最后露出今天；过了零点也会自己撕一页。
 * 点它发 calendar:open，HTML 层放大显示这一页（可以前后翻看别的日子）。
 */
export const calendar: SceneObject = ({ scene, camera, renderer, tier, bus, pick }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  const group = new THREE.Group();
  // 书桌左后角、书排的左边：不挡书脊，也不挡显示器
  group.name = 'calendar';
  group.position.set(CAL_X, 0, -0.27);
  group.rotation.y = 0.33;
  const batch = new Batch();

  const PW = 0.11, PH = PW * PAGE_H / PAGE_W, BIND = 0.012, padH = PH + BIND;
  const BW = 0.132, BH = padH + 0.05, TILT = 0.2;
  // 木座：底座 + 斜靠的背板
  const lacquer = std({ color: 0x6e1a12, roughness: 0.35 });
  batch.add(lacquer, rbox(0.16, 0.016, 0.085, 0.004), [0, 0.008, -0.01]);
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.016, 0.012);
  tilt.rotation.x = -TILT;
  group.add(tilt);
  const boardFace = std({ roughness: 0.4, map: bin.add(canvasTex(264, 456, (g, w, h) => {
    g.fillStyle = '#7a1d14'; g.fillRect(0, 0, w, h); speckle(g, w, h, 41, 1500, '0,0,0', 0.12);
    g.strokeStyle = '#d6aa55'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#e2b866'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 40px ${SERIF}`; g.fillText('吉祥如意', w / 2, 52);
    g.font = `bold 20px ${SERIF}`; g.fillText(`${new Date().getFullYear()} · 撕页黄历`, w / 2, 88);
  })) });
  const tb = new Batch();
  tb.add(lacquer, rbox(BW, BH, 0.008, 0.003), [0, BH / 2, -0.004]);
  tb.add(boardFace, new THREE.PlaneGeometry(BW - 0.004, BH - 0.004), [0, BH / 2, 0.0002]);
  // 背后的撑脚
  batch.add(lacquer, new THREE.BoxGeometry(0.03, 0.15, 0.006), [0, 0.075, -0.07], [0.42, 0, 0]);

  // 本子：剩下的页数决定厚度
  const today = new Date();
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const left = Math.max(1, Math.round((+yearEnd - +new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5) + 1);
  const T = 0.004 + 0.02 * left / 365;
  const stripes = (vertical: boolean) => std({ roughness: 0.95, map: bin.add(canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#efe7d6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 64; i += 2) { g.fillStyle = `rgba(110,95,70,${0.08 + (i % 6 === 0 ? 0.08 : 0)})`; vertical ? g.fillRect(i, 0, 1, h) : g.fillRect(0, i, w, 1); }
  })) });
  const side = stripes(true), top = stripes(false), back = std({ color: 0xd9cfbd, roughness: 1 });
  const padY = BH - 0.05 - padH / 2 + padH / 2; // 本子顶在背板头部下面
  const pad = new THREE.Mesh(bin.add(new THREE.BoxGeometry(PW, padH, T)), [side, side, top, top, back, back]);
  pad.position.set(0, padY - padH / 2 + 0.004, T / 2 + 0.001);
  pad.castShadow = high;
  tilt.add(pad);
  const padTop = pad.position.y + padH / 2, front = T + 0.001;
  // 顶上的布脊和一溜撕剩下的纸茬
  const cloth = std({ color: 0x1d5a34, roughness: 0.8 });
  tb.add(cloth, new THREE.BoxGeometry(PW + 0.003, BIND + 0.002, T + 0.003), [0, padTop - BIND / 2, T / 2 + 0.001]);
  const stubs = bin.add(new THREE.MeshStandardMaterial({ roughness: 0.95, transparent: true, alphaTest: 0.5, map: bin.add(canvasTex(256, 16, (g, w, h) => {
    g.fillStyle = PAPER; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, 4 + Math.abs(Math.sin(x * 0.37) * 5 + Math.sin(x * 1.3) * 3));
    g.closePath(); g.fill();
  })) }));
  tb.add(stubs, new THREE.PlaneGeometry(PW - 0.002, 0.006), [0, padTop - BIND - 0.0025, front + 0.0004]);
  tb.build(tilt, bin, { cast: high, receive: high });
  batch.add(contactMaterial(bin, high ? 0.32 : 0.55), blob(0.2, 0.13), [0, 0.0007, -0.01]);
  batch.build(group, bin, { cast: high, receive: high });

  // 最上面一页：上沿往外翘一点
  const pageGeo = bin.add(new THREE.PlaneGeometry(PW, PH, 1, 16));
  const pos = pageGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = (pos.getY(i) + PH / 2) / PH; // 0 下沿 → 1 上沿
    const k = Math.max(0, (v - 0.72) / 0.28);
    pos.setZ(i, k * k * 0.006);
  }
  pageGeo.translate(0, -PH / 2, 0); // 原点放在上沿，撕页时绕上沿转
  pageGeo.computeVertexNormals();
  const pageAt = new THREE.Vector3(0, padTop - BIND, front + 0.0002);
  const makeTex = () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 840;
    const t = bin.add(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  const paint = (t: THREE.CanvasTexture, info: DayInfo) => { const c = t.image as HTMLCanvasElement; drawPage(c.getContext('2d')!, c.width, c.height, info); t.needsUpdate = true; };
  const pageTex = makeTex();
  const page = new THREE.Mesh(pageGeo, std({ map: pageTex, roughness: 0.92, side: THREE.DoubleSide }));
  page.position.copy(pageAt);
  page.receiveShadow = high;
  tilt.add(page);
  // 点开大图时，桌上这一页「被拿走」，露出下面明天那一页；大图缩回来再盖上
  const underTex = makeTex();
  const under = new THREE.Mesh(pageGeo, std({ map: underTex, roughness: 0.92 }));
  under.position.copy(pageAt); under.position.z -= 0.0002; under.visible = false;
  tilt.add(under);

  let lib: Parameters<typeof fullInfo>[0] | null = null;
  const info = (d: Date) => (lib ? fullInfo(lib, d) : basicInfo(d));
  let shown = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  paint(pageTex, info(shown));

  // 撕页：一张旧页绕上沿往上翻、往旁边飞走、渐隐。hold 时先盖在今天这页上不动（刚进来、等画面稳定）
  type Fly = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; tex: THREE.CanvasTexture; day: Date; t: number; dir: number; hold: boolean };
  let fly: Fly | null = null;
  const queue: Date[] = [];
  const startFly = (day: Date, hold = false) => {
    const tex = makeTex(); paint(tex, info(day));
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(pageGeo, mat);
    mesh.position.copy(pageAt); mesh.position.z += 0.0004;
    tilt.add(mesh);
    fly = { mesh, mat, tex, day, t: 0, dir: Math.random() < 0.5 ? -1 : 1, hold };
  };
  const endFly = () => {
    if (!fly) return;
    tilt.remove(fly.mesh); fly.mat.dispose(); fly.tex.dispose();
    fly = null;
  };
  // 从上次来过的那天撕到今天（最多撕 6 页）；第一次来就撕昨天那一页
  let last: Date | null = null;
  try { const v = localStorage.getItem('calendar:last'); if (v) { const [y, m, d] = v.split('-').map(Number); last = new Date(y, m - 1, d); } } catch { /* 无痕模式 */ }
  const from = last && last < shown ? last : last ? shown : addDays(shown, -1);
  const behind = Math.round((+shown - +from) / 864e5);
  for (let i = Math.max(0, behind - 6); i < behind; i++) queue.push(addDays(from, i));
  try { localStorage.setItem('calendar:last', dayKey(shown)); } catch { /* 无痕模式 */ }
  if (queue.length) startFly(queue.shift()!, true);
  let delay = 3; // 等画面稳定、农历算出来再撕

  const off = [
    on(bus, 'calendar:shown', () => { paint(underTex, info(addDays(shown, 1))); under.visible = true; page.visible = false; }),
    on(bus, 'calendar:closed', () => { page.visible = true; under.visible = false; }),
  ];
  loadLunar().then((L) => {
    lib = L;
    paint(pageTex, info(shown));
    if (fly) paint(fly.tex, info(fly.day));
  }).catch((e) => console.warn('[calendar] 农历库加载失败，只显示公历', e));

  let hover = false, lift = 0, check = 5;
  pick(group, {
    hover(v) { hover = v; },
    // 带上这一页此刻在屏幕上的矩形：HTML 层的大图从这里展开，关的时候缩回这里
    click() { emit(bus, 'calendar:open', { date: dayKey(shown), rect: pageRect() }); },
  });
  const corner = new THREE.Vector3();
  const pageRect = () => {
    const c = renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    page.updateWorldMatrix(true, false);
    for (const [x, y] of [[-PW / 2, 0], [PW / 2, 0], [-PW / 2, -PH], [PW / 2, -PH]]) {
      corner.set(x, y, 0); page.localToWorld(corner).project(camera);
      const sx = c.left + (corner.x + 1) / 2 * c.width, sy = c.top + (1 - corner.y) / 2 * c.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  };
  scene.add(group);

  return {
    frame(dt) {
      // 过了零点：再撕一页
      check -= dt;
      if (check <= 0) {
        check = 5;
        const now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (+d !== +shown) {
          queue.push(shown); shown = d; paint(pageTex, info(shown));
          try { localStorage.setItem('calendar:last', dayKey(shown)); } catch { /* 无痕模式 */ }
        }
      }
      if (fly?.hold) { delay -= dt; if (delay <= 0 && (lib || delay < -6)) fly.hold = false; }
      if (!fly && queue.length) startFly(queue.shift()!);
      if (fly && !fly.hold) {
        fly.t += dt / (queue.length ? 0.55 : 0.9);
        const k = Math.min(1, fly.t), e = k * k * (3 - 2 * k);
        fly.mesh.rotation.set(-e * 2.6, fly.dir * e * 0.6, fly.dir * e * 0.5);
        fly.mesh.position.set(pageAt.x + fly.dir * e * 0.25, pageAt.y + Math.sin(e * Math.PI) * 0.06 + e * 0.05, pageAt.z + 0.0004 + e * 0.12);
        fly.mat.opacity = 1 - Math.max(0, (k - 0.6) / 0.4);
        if (k >= 1) endFly();
      }
      lift = damp(lift, hover ? 1 : 0, 10, dt);
      tilt.rotation.x = -TILT + lift * 0.06;
    },
    stop() { off.forEach((f) => f()); endFly(); scene.remove(group); bin.dispose(); },
  };
};
