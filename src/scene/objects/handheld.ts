import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, rbox } from '../util';

/**
 * 书架上的掌机（用户要的）：支着背后的支架，立在那排技术书的顶上，屏幕朝着镜头，屏幕上是游戏主页。
 * 点它：从书顶上拿起来，送到镜头跟前（屏幕正对你），到位后发 handheld:open {rect}；
 * HTML 层的大掌机从 3D 屏幕在画面上的位置放大到屏幕中间（和黄历同一个路数），游戏在 HTML 的 canvas 里玩（src/games/handheld.ts）。
 * 关的时候 HTML 缩回到这个位置，发 handheld:closed，3D 的掌机再放回书顶上。
 *
 * 尺寸照真机：主机 17.3×10.2×1.4 cm，左右手柄各 3.6 cm 宽（左蓝右红），屏幕 13.7×7.7 cm。
 * 静态零件按材质合并成几个网格；屏幕单独一个网格，贴图是游戏主页画一帧（游戏模块按需加载，到之前是黑屏 + 一点反光）。
 */
const BW = 0.173, BH = 0.102, BD = 0.0139, JW = 0.0359, JD = 0.0125;

export const handheld: SceneObject = ({ scene, camera, tier, bus, pick }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o));
  const root = new THREE.Group();     // 世界坐标里的位置和朝向
  const dev = new THREE.Group();      // 掌机本体：原点在底边中点，正面朝 +z
  root.add(dev);

  // 除了正面的黑玻璃和屏幕，所有零件（包括正面的黑玻璃）共用一个按顶点色上色的材质：整台掌机只占两个 draw call（high 档默认视角已经贴着上限）
  const body = std({ vertexColors: true, roughness: 0.45, metalness: 0.03 });
  const SHELL = 0x2a2b2e, BLUE = 0x14b6e0, RED = 0xff4a55, BTN = 0x1c1d20, GREY = 0x55585e;
  const tint = (geo: THREE.BufferGeometry, hex: number) => {
    const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    return g;
  };
  const b = new Batch(['position', 'normal', 'uv', 'color']);
  type V3 = [number, number, number];
  const P = (hex: number, geo: THREE.BufferGeometry, pos: V3, rot?: V3) => b.add(body, tint(geo, hex), pos, rot);

  // 主机：圆角盒子 + 正面整块黑玻璃
  P(SHELL, rbox(BW, BH, BD, 0.004), [0, BH / 2, 0]);
  P(0x050506, rbox(BW - 0.004, BH - 0.004, 0.001, 0.0004), [0, BH / 2, BD / 2]); // 正面的黑玻璃
  // 顶上的散热口、音量键、电源键
  for (let i = 0; i < 9; i++) P(BTN, new THREE.BoxGeometry(0.004, 0.0012, 0.006), [0.03 + i * 0.006, BH + 0.0002, 0]);
  P(GREY, rbox(0.012, 0.002, 0.005, 0.0008), [-0.055, BH + 0.0006, 0]);
  P(GREY, rbox(0.007, 0.002, 0.005, 0.0008), [-0.072, BH + 0.0006, 0]);

  // 手柄：外侧两个角是大圆角，贴着主机的一侧是小圆角——挤出一个这样的轮廓
  const joyGeo = (side: -1 | 1) => {
    const s = new THREE.Shape(), w = JW, h = BH, R = 0.017, r = 0.002;
    // 以手柄自己的中心为原点；side = -1 是左手柄（外侧在 -x）
    const xo = side * w / 2, xi = -side * w / 2;
    const ro = (x: number) => x; void ro;
    s.moveTo(xi, -h / 2 + r);
    s.lineTo(xi, h / 2 - r); s.quadraticCurveTo(xi, h / 2, xi + side * r, h / 2);
    s.lineTo(xo - side * R, h / 2); s.quadraticCurveTo(xo, h / 2, xo, h / 2 - R);
    s.lineTo(xo, -h / 2 + R); s.quadraticCurveTo(xo, -h / 2, xo - side * R, -h / 2);
    s.lineTo(xi + side * r, -h / 2); s.quadraticCurveTo(xi, -h / 2, xi, -h / 2 + r);
    const g = new THREE.ExtrudeGeometry(s, { depth: JD - 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 8 });
    if (side === 1) g.scale(1, 1, 1); // 两侧的轮廓已经按 side 镜像好
    return g.translate(0, 0, -(JD - 0.003) / 2);
  };
  const JX = BW / 2 + JW / 2 + 0.0004;
  P(BLUE, joyGeo(-1), [-JX, BH / 2, 0]);
  P(RED, joyGeo(1), [JX, BH / 2, 0]);
  const F = JD / 2 + 0.0015; // 手柄正面
  const stick = (x: number, y: number) => {
    P(BTN, new THREE.CylinderGeometry(0.0085, 0.0095, 0.0025, 20).rotateX(Math.PI / 2), [x, y, F + 0.001]);
    P(GREY, new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 20).rotateX(Math.PI / 2), [x, y, F + 0.004]);
    P(BTN, new THREE.SphereGeometry(0.0082, 16, 6, 0, Math.PI * 2, 0, 0.7).rotateX(Math.PI / 2).scale(1, 1, 0.45), [x, y, F + 0.0035]);
  };
  const four = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) P(BTN, new THREE.CylinderGeometry(0.0033, 0.0033, 0.0022, 14).rotateX(Math.PI / 2), [x + dx * 0.0085, y + dy * 0.0085, F + 0.0009]);
  };
  stick(-JX + 0.001, BH * 0.72); four(-JX + 0.001, BH * 0.35);
  stick(JX - 0.001, BH * 0.35); four(JX - 0.001, BH * 0.72);
  P(BTN, new THREE.BoxGeometry(0.006, 0.0016, 0.0016), [-JX + 0.009, BH * 0.9, F + 0.0006]);           // −
  P(BTN, new THREE.BoxGeometry(0.006, 0.0016, 0.0016), [JX - 0.009, BH * 0.9, F + 0.0006]);            // ＋
  P(BTN, new THREE.BoxGeometry(0.0016, 0.006, 0.0016), [JX - 0.009, BH * 0.9, F + 0.0006]);
  P(BTN, rbox(0.0055, 0.0055, 0.0016, 0.0008), [-JX + 0.007, BH * 0.14, F + 0.0005]);                 // 截图键
  P(GREY, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0018, 16).rotateX(Math.PI / 2), [JX - 0.007, BH * 0.14, F + 0.0007]); // HOME
  // 肩键
  P(BTN, rbox(0.022, 0.003, 0.008, 0.0012), [-JX + 0.004, BH + 0.0012, 0]);
  P(BTN, rbox(0.022, 0.003, 0.008, 0.0012), [JX - 0.004, BH + 0.0012, 0]);
  // 背后的支架（翻开撑着）
  // 支架板的铰链在背面上方，往后翻开 0.55 弧度：板中心 = 铰链 + 绕 x 转过的 (0, -0.025, -0.001)
  P(SHELL, rbox(0.06, 0.05, 0.0018, 0.0008), [0.03, BH * 0.62 - 0.0208, -BD / 2 - 0.0139], [0.55, 0, 0]);
  b.build(dev, bin, { cast: high, receive: high });

  // 屏幕：主页画一帧
  const scr = document.createElement('canvas'); scr.width = 640; scr.height = 360;
  const sg = scr.getContext('2d')!; sg.fillStyle = '#08090b'; sg.fillRect(0, 0, 640, 360);
  const scrTex = bin.add(new THREE.CanvasTexture(scr)); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 4;
  const screen = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(0.137, 0.077)), bin.add(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scrTex, emissiveIntensity: high ? 0.75 : 0.95, roughness: 0.12 })));
  screen.position.set(0, BH / 2, BD / 2 + 0.0008);
  dev.add(screen);
  // 东西小，环境光遮蔽看不出差别：不进遮蔽通道，省两个 draw call（high 档默认视角贴着上限）
  root.traverse((o) => { o.userData.noAO = true; });
  let homeT = 0;
  const paintHome = () => import('../../games/handheld').then(({ drawHome }) => {
    sg.save(); drawHome(sg, 0, homeT); sg.restore(); scrTex.needsUpdate = true;
  }).catch(() => {});
  setTimeout(paintHome, 4000); // 首屏之后再去取游戏模块，画一帧主页

  // 摆在书顶上：那排技术书最高约 0.255 米；支着支架往后仰，转一点朝向镜头
  const SHELF_POS = new THREE.Vector3(L.books.x0 + 0.14, 0.256, L.books.z + 0.01);
  const SHELF_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.27, 0, 'YXZ'));
  root.position.copy(SHELF_POS); root.quaternion.copy(SHELF_Q);
  scene.add(root);

  // ---- 拿起来、放回去 ----
  type State = 'shelf' | 'lift' | 'held' | 'back';
  let state: State = 'shelf', k = 0;
  const from = new THREE.Vector3(), fromQ = new THREE.Quaternion(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  /** 拿在手里的位置：镜头正前方，屏幕正对镜头；竖屏时离远一点，整台机器都在画面里 */
  const holdPose = (p: THREE.Vector3, q: THREE.Quaternion) => {
    const far = Math.max(1, 0.62 / camera.aspect);
    p.set(0, -BH / 2, -0.3 * far).applyMatrix4(camera.matrixWorld);
    q.copy(camera.quaternion);
  };
  const screenRect = () => {
    screen.updateWorldMatrix(true, false);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector3(x * 0.0685, y * 0.0385, 0).applyMatrix4(screen.matrixWorld).project(camera));
    const W = innerWidth, H = innerHeight;
    const xs = pts.map((p) => (p.x + 1) / 2 * W), ys = pts.map((p) => (1 - p.y) / 2 * H);
    return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  const pickUp = () => {
    if (state !== 'shelf') return;
    state = 'lift'; k = 0; from.copy(root.position); fromQ.copy(root.quaternion);
  };
  pick(root, { click: pickUp });

  const off = [
    on(bus, 'handheld:pick', pickUp),
    on(bus, 'handheld:shown', () => { if (state === 'held') root.visible = false; }),
    on(bus, 'handheld:closed', () => {
      if (state !== 'held') return;
      root.visible = true; state = 'back'; k = 0; from.copy(root.position); fromQ.copy(root.quaternion);
      paintHome();
    }),
  ];
  const ease = (x: number) => x * x * (3 - 2 * x);
  return {
    frame(dt, t) {
      homeT = t;
      if (state === 'shelf') return;
      if (state === 'held') { holdPose(root.position, root.quaternion); return; }
      k = Math.min(1, k + dt / (state === 'lift' ? 0.6 : 0.55));
      const e = ease(k);
      if (state === 'lift') { holdPose(want, wantQ); } else { want.copy(SHELF_POS); wantQ.copy(SHELF_Q); }
      root.position.lerpVectors(from, want, e);
      root.position.y += Math.sin(e * Math.PI) * 0.06; // 拿起、放下时走一道弧
      root.quaternion.slerpQuaternions(fromQ, wantQ, e);
      if (k >= 1) {
        if (state === 'lift') { state = 'held'; emit(bus, 'handheld:open', { rect: screenRect() }); }
        else { state = 'shelf'; root.position.copy(SHELF_POS); root.quaternion.copy(SHELF_Q); }
      }
    },
    stop() { off.forEach((f) => f()); scene.remove(root); bin.dispose(); },
  };
};
