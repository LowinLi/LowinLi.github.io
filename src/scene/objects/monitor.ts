import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { SEARCH } from '../search';
import { Batch, blob, canvasTex, contactMaterial, rbox } from '../util';

const W = 1536, H = 888;
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/**
 * 显示器：屏幕上画的是浏览器里的百度首页。点击屏幕 → 镜头推近，Scene.astro 把真正的输入框叠到搜索框上，
 * 提交后在新标签页打开真正的百度搜索。
 * 监听 monitor:focus / monitor:blur；聚焦时每帧发出 monitor:rect {x,y,w,h}（屏幕在画布上的像素矩形）。
 */
export const monitor: SceneObject = ({ scene, camera, renderer, tier, bus, pick }) => {
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
  batch.build(group, bin, { cast: high, receive: high });

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
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
  const draw = () => {
    ctx.textBaseline = 'middle';
    // 浏览器外框：标签栏 + 地址栏
    ctx.fillStyle = '#dee1e6'; ctx.fillRect(0, 0, W, 44);
    for (const [i, c] of ['#ff5f57', '#febc2e', '#28c840'].entries()) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(26 + i * 24, 22, 7.5, 0, 7); ctx.fill(); }
    rr(104, 8, 250, 36, [10, 10, 0, 0]); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#2932e1'; ctx.beginPath(); ctx.arc(126, 26, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#3c4043'; ctx.font = `15px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('百度一下，你就知道', 144, 27);
    ctx.fillStyle = '#80868b'; ctx.fillText('×', 330, 26); ctx.font = `22px ${SANS}`; ctx.fillText('+', 368, 26);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 44, W, 46);
    ctx.fillStyle = '#5f6368'; ctx.font = `20px ${SANS}`; ctx.fillText('←   →   ↻', 22, 67);
    rr(150, 52, W - 250, 30, 15); ctx.fillStyle = '#f1f3f4'; ctx.fill();
    ctx.fillStyle = '#202124'; ctx.font = `15px ${SANS}`; ctx.fillText('🔒  https://www.baidu.com', 168, 68);
    ctx.fillStyle = '#e8eaed'; ctx.fillRect(0, 89, W, 1);
    // 页面
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 90, W, H - 90);
    ctx.fillStyle = '#222'; ctx.font = `19px ${SANS}`;
    ['新闻', 'hao123', '地图', '贴吧', '视频', '图片', '网盘', '文库', '更多'].reduce((x, s) => { ctx.fillText(s, x, 128); return x + ctx.measureText(s).width + 34; }, 36);
    ctx.textAlign = 'right'; ctx.fillText('设置', W - 150, 128);
    rr(W - 122, 110, 86, 36, 8); ctx.fillStyle = '#4e6ef2'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('登录', W - 79, 129);
    // 标志
    const cx = W / 2, cy = 300;
    ctx.font = `bold 92px Arial, sans-serif`; ctx.fillStyle = '#e10602'; ctx.textAlign = 'right'; ctx.fillText('Bai', cx - 62, cy);
    ctx.fillStyle = '#2932e1';
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 50, 42, 0, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy, r, a] of [[-46, -30, 14, -0.4], [-17, -50, 15, -0.12], [17, -50, 15, 0.12], [46, -30, 14, 0.4]]) { ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, r * 0.78, r, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `bold 46px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('du', cx, cy + 16);
    ctx.fillStyle = '#e10602'; ctx.font = `bold 80px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('百度', cx + 66, cy + 2);
    // 搜索框和按钮
    const bx = SEARCH.x * W, by = SEARCH.y * H, bw = SEARCH.w * W, bh = SEARCH.h * H, btn = SEARCH.btn * W;
    rr(bx, by, bw + btn, bh, 16); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = focused ? '#4e6ef2' : '#c4c7ce'; ctx.stroke();
    rr(bx + bw, by, btn, bh, [0, 16, 16, 0]); ctx.fillStyle = '#4e6ef2'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `28px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('百度一下', bx + bw + btn / 2, by + bh / 2 + 1);
    if (!focused) { ctx.fillStyle = '#9195a3'; ctx.font = `25px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('点击屏幕开始搜索', bx + 30, by + bh / 2 + 1); }
    // 热搜（内容是和这间屋子有关的玩笑，不是真的热搜）
    const hot = ['白菜什么时候种最好', '座钟多久上一次弦', '虎尾兰多久浇一次水', '论语十则', '线装书怎么保存', '水稻几月收割'];
    const hx = bx, hy = by + bh + 70;
    ctx.fillStyle = '#222'; ctx.font = `bold 24px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('百度热搜 ›', hx, hy);
    ctx.fillStyle = '#626675'; ctx.font = `20px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText('↻ 换一换', bx + bw + btn, hy);
    hot.forEach((s, i) => {
      const x = hx + (i % 2) * (bw + btn) / 2, y = hy + 52 + Math.floor(i / 2) * 46;
      ctx.textAlign = 'left'; ctx.font = `bold 22px Arial`; ctx.fillStyle = ['#fe2d46', '#ff6600', '#faa90e', '#9195a3', '#9195a3', '#9195a3'][i]; ctx.fillText(String(i + 1), x, y);
      ctx.font = `22px ${SANS}`; ctx.fillStyle = '#222'; ctx.fillText(s, x + 30, y);
    });
    ctx.fillStyle = '#9195a3'; ctx.font = `18px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText('这是画在屏幕上的示意页面 · 搜索会在新标签页打开 baidu.com', W / 2, H - 30);
    tex.needsUpdate = true;
  };
  draw();

  pick(screen, { click() { if (!focused) emit(bus, 'monitor:focus'); } });
  const off = [
    on(bus, 'monitor:focus', () => { focused = true; draw(); }),
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
