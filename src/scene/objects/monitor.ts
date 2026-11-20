import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox } from '../util';

const W = 2304, H = 1332; // 屏幕 16:9.25；用户嫌过屏幕上的字「太模糊」，从 1536 提到 2304
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/**
 * 显示器：屏幕上是浏览器里打开着的博客文章列表（用户要的「只放我自己的博客文章列表和展开博客」）。
 * 点击屏幕 → 镜头推近，Scene.astro 在屏幕的位置叠一个真正的 iframe（本站的 /posts/ 页），能点进文章、滚动阅读。
 * 平时 3D 屏幕上是画出来的同一页（版式照着 /posts/ 页：米色底、Home / 文章、大标题、日期 + 标题一行一篇），推近时和 iframe 对得上。
 * 监听 monitor:focus / monitor:blur；聚焦时每帧发出 monitor:rect {x,y,w,h}（屏幕在画布上的像素矩形）。
 */
export const monitor: SceneObject = ({ scene, camera, renderer, tier, bus, pick, data }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const m = L.monitor;
  const high = tier === 'high';
  const batch = new Batch();
  const dark = bin.add(new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.35, metalness: 0.6 }));
  const alu = bin.add(new THREE.MeshStandardMaterial({ color: 0xc4c8cd, roughness: 0.28, metalness: 0.9 }));
  // 机身：超窄边框的面板 + 背后鼓起的机壳
  batch.add(dark, rbox(m.w + 0.012, m.h + 0.012, 0.01, 0.004), [m.x, m.cy, m.z - 0.0056]);
  batch.add(alu, rbox(m.w * 0.72, m.h * 0.7, 0.03, 0.012), [m.x, m.cy, m.z - 0.024]);
  // 支架：铰链 + 略微后仰的立柱 + 圆角底座
  batch.add(alu, new THREE.CylinderGeometry(0.014, 0.014, 0.09, 20), [m.x, m.cy - 0.03, m.z - 0.045], [0, 0, Math.PI / 2]);
  batch.add(alu, rbox(0.075, m.cy - 0.02, 0.011, 0.005), [m.x, (m.cy - 0.02) / 2, m.z - 0.062], [-0.06, 0, 0]);
  batch.add(alu, rbox(0.24, 0.008, 0.17, 0.004), [m.x, 0.004, m.z - 0.04]);
  // 摄像头和电源灯
  batch.add(bin.add(new THREE.MeshBasicMaterial({ color: 0x2a2f3a })), new THREE.CircleGeometry(0.0016, 12), [m.x, m.cy + m.h / 2 + 0.003, m.z + 0.0002]);
  batch.add(bin.add(new THREE.MeshBasicMaterial({ color: 0x9fe6a8 })), new THREE.CircleGeometry(0.0012, 10), [m.x + m.w / 2 - 0.012, m.cy - m.h / 2 - 0.003, m.z + 0.0002]);
  batch.add(contactMaterial(bin, high ? 0.3 : 0.5), blob(0.16, 0.12), [m.x, 0.0006, m.z - 0.04]);
  batch.build(group, bin, { cast: high, receive: high, collapse: true });

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // high 档最后统一做色调映射，会把屏幕压灰；提前调亮，映射后白底才接近纯白、文字对比才够
  const screenMat = bin.add(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color().setScalar(high ? 1.5 : 1) }));
  const screen = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(m.w, m.h)), screenMat);
  screen.position.set(m.x, m.cy, m.z);
  screen.userData.keepsMonitor = true; // 聚焦显示器时，点屏幕本身不算「点旁边」
  group.add(screen);
  // 屏幕玻璃上一道斜的反光
  const glare = new THREE.Mesh(screen.geometry, bin.add(new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending,
    map: bin.add(canvasTex(128, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h * 0.8);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.32, '#fff'); grad.addColorStop(0.34, '#000'); grad.addColorStop(1, '#000');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })),
  })));
  glare.position.set(m.x, m.cy, m.z + 0.0004);
  group.add(glare);

  let focused = false;
  const rr = (x: number, y: number, w: number, h: number, r: number | number[]) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  // 版式照着本站的 /posts/ 页（Base.astro 的样式）：下面的坐标按 1000 宽的「网页像素」算，乘 k 换算到画布
  const posts = data.posts.slice(0, 40);
  const draw = () => {
    const k = W / 1000, X = (v: number) => v * k;
    const font = (px: number, bold = false) => { ctx.font = `${bold ? '600 ' : ''}${Math.round(px * k * 10) / 10}px ${SANS}`; };
    const text = (t: string, x: number, y: number, color: string, px: number, bold = false, align: CanvasTextAlign = 'left') => { font(px, bold); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(t, X(x), X(y)); };
    const pill = (x: number, y: number, w: number, h: number, rad: number) => { ctx.beginPath(); ctx.roundRect(X(x), X(y), X(w), X(h), X(rad)); };
    const fit = (t: string, px: number, maxW: number) => { font(px); if (ctx.measureText(t).width <= X(maxW)) return t; let s2 = t; while (s2.length > 1 && ctx.measureText(s2 + '…').width > X(maxW)) s2 = s2.slice(0, -1); return s2 + '…'; };
    ctx.textBaseline = 'middle';
    // ---- 浏览器外框：浅色标签栏 + 地址栏 ----
    ctx.fillStyle = '#dedad2'; ctx.fillRect(0, 0, W, X(22));
    pill(8, 5, 150, 19, 5); ctx.fillStyle = '#f7f5f0'; ctx.fill();
    ctx.fillStyle = '#c2410c'; ctx.beginPath(); ctx.arc(X(18), X(14.5), X(3.2), 0, 7); ctx.fill();
    text('文章 · Lowin Li', 26, 14.5, '#3a362f', 7); text('×', 150, 14.5, '#8a847a', 7.5, false, 'center');
    ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, X(22), W, X(20));
    text('←   →   ↻', 10, 32, '#6b665e', 8);
    pill(62, 25, 880, 14, 7); ctx.fillStyle = '#ebe7df'; ctx.fill();
    text('lowinli.github.io/posts/', 72, 32.3, '#3a362f', 7.2);
    ctx.fillStyle = '#d6d1c6'; ctx.fillRect(0, X(42), W, X(0.6));
    // ---- 页面：米色底，正文一栏居中（720 网页像素宽 → 这里按屏幕比例放宽一点）----
    const top = 42.6, pageH = H / k - top;
    ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, X(top), W, X(pageH));
    // 字比真网页大一号：坐在桌前远远看，屏幕只有一巴掌大
    const L0 = 120, R0 = 880;
    text('Home', L0, top + 28, '#1d1b18', 14, true); text('文章', R0, top + 28, '#c2410c', 14, false, 'right');
    text('文章', L0, top + 76, '#1d1b18', 32, true);
    let y = top + 122;
    for (const p of posts) {
      if (y > top + pageH - 12) break;
      text(p.date, L0, y, '#6b665e', 14);
      text(fit(p.title, 14.5, R0 - L0 - 112), L0 + 106, y, '#c2410c', 14.5);
      ctx.fillStyle = '#e2ddd3'; ctx.fillRect(X(L0), X(y + 16), X(R0 - L0), Math.max(1, X(0.6)));
      y += 33;
    }
    // 右边一条细滚动条，看得出页面还能往下翻
    pill(992, top + 6, 3.5, 70, 1.75); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    if (!focused) { pill(340, top + pageH - 44, 320, 32, 16); ctx.fillStyle = 'rgba(29,27,24,0.78)'; ctx.fill(); text('点屏幕，坐下来看文章', 500, top + pageH - 28, '#f7f5f0', 15, false, 'center'); }
    tex.needsUpdate = true;
  };
  draw();

  pick(screen, { click() { if (!focused) emit(bus, 'monitor:focus'); } });
  const off = [
    on(bus, 'monitor:focus', () => { focused = true; draw(); }),
    on(bus, 'quality:nopost', () => { screenMat.color.setScalar(1); }), // 后期处理关掉后不再需要提前调亮
    on(bus, 'monitor:blur', () => { if (!focused) return; focused = false; draw(); emit(bus, 'monitor:rect', null); }),
  ];
  scene.add(group);

  const a = new THREE.Vector3(), b = new THREE.Vector3();
  return {
    frame() {
      if (!focused) return;
      const el = renderer.domElement;
      a.set(-m.w / 2, m.h / 2, 0).applyMatrix4(screen.matrixWorld).project(camera);
      b.set(m.w / 2, -m.h / 2, 0).applyMatrix4(screen.matrixWorld).project(camera);
      const x0 = (a.x + 1) / 2 * el.clientWidth, y0 = (1 - a.y) / 2 * el.clientHeight;
      const x1 = (b.x + 1) / 2 * el.clientWidth, y1 = (1 - b.y) / 2 * el.clientHeight;
      emit(bus, 'monitor:rect', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    },
    stop() { off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
