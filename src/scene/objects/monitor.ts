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
  batch.build(group, bin, { cast: high, receive: high, collapse: true });

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
  // 版式照着真实的百度首页（用户给的截图，2000 像素宽）画：下面的坐标都是截图上的像素，乘 k 换算到画布
  const draw = () => {
    const k = W / 2000, X = (v: number) => v * k;
    const font = (px: number, bold = false, family = SANS) => { ctx.font = `${bold ? 'bold ' : ''}${Math.round(px * k * 10) / 10}px ${family}`; };
    const text = (t: string, x: number, y: number, color: string, px: number, bold = false, align: CanvasTextAlign = 'left') => { font(px, bold); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(t, X(x), X(y)); };
    const pill = (x: number, y: number, w: number, h: number, rad: number) => { ctx.beginPath(); ctx.roundRect(X(x), X(y), X(w), X(h), X(rad)); };
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // ---- 浏览器外框：深色的标签栏、地址栏、书签栏 ----
    ctx.fillStyle = '#1d1b30'; ctx.fillRect(0, 0, W, X(46));
    ctx.fillStyle = '#2c2a42'; ctx.fillRect(0, X(46), W, X(56));
    pill(16, 16, 172, 30, 8); ctx.fillStyle = '#2c2a42'; ctx.fill();
    ctx.fillStyle = '#2932e1'; ctx.beginPath(); ctx.arc(X(29), X(31), X(6), 0, 7); ctx.fill();
    text('百度一下，你就知道', 40, 31, '#e8e6f2', 11); text('×', 172, 31, '#b9b6cc', 13); text('+', 197, 31, '#b9b6cc', 16);
    text('←   →   ↻', 52, 63, '#c9c6da', 14);
    pill(218, 51, 1570, 25, 12.5); ctx.fillStyle = '#3b3954'; ctx.fill();
    text('www.baidu.com', 246, 64, '#e8e6f2', 11.5);
    ['常用', '工作', '文档', '博客', '笔记', '工具'].reduce((x, t) => { ctx.strokeStyle = '#b9b6cc'; ctx.lineWidth = 1; ctx.strokeRect(X(x), X(85), X(11), X(9)); text(t, x + 16, 90, '#d6d3e6', 10.5); return x + 70; }, 90);
    // ---- 顶部导航 ----
    ['新闻', 'hao123', '地图', '贴吧', '视频', '图片', '网盘', '库库AI', '文心', '百度搭子', '更多'].reduce((x, t) => { text(t, x, 137, '#222', 15.5); return x + ctx.measureText(t).width / k + 24; }, 41);
    text('设置', 1844, 139, '#222', 15.5, false, 'center');
    pill(1897, 122, 66, 34, 17); ctx.fillStyle = '#4e6ef2'; ctx.fill();
    text('登录', 1930, 139, '#fff', 15.5, false, 'center');
    // ---- 标志 ----
    const cx = 1000, cy = 282;
    font(64, true, 'Arial, sans-serif'); ctx.fillStyle = '#e10602'; ctx.textAlign = 'right'; ctx.fillText('Bai', X(cx - 36), X(cy + 8));
    ctx.fillStyle = '#2932e1';
    ctx.beginPath(); ctx.ellipse(X(cx), X(cy + 14), X(31), X(26), 0, 0, 7); ctx.fill();
    for (const [dx, dy, r, a] of [[-29, -12, 9.5, -0.4], [-11, -27, 10.5, -0.12], [11, -27, 10.5, 0.12], [29, -12, 9.5, 0.4]]) { ctx.beginPath(); ctx.ellipse(X(cx + dx), X(cy + dy), X(r * 0.78), X(r), a, 0, 7); ctx.fill(); }
    font(31, true, 'Arial, sans-serif'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('du', X(cx), X(cy + 17));
    font(52, true); ctx.fillStyle = '#e10602'; ctx.textAlign = 'left'; ctx.fillText('百度', X(cx + 40), X(cy + 10));
    // ---- 搜索框：蓝紫渐变的细边，框里右下角是麦克风、加号和「百度一下」----
    const bx = SEARCH.x * 2000, by = (SEARCH.y * H) / k, bw = (SEARCH.w + SEARCH.btn) * 2000, bh = (SEARCH.h * H) / k;
    const edge = ctx.createLinearGradient(X(bx), 0, X(bx + bw), 0);
    edge.addColorStop(0, '#4e6ef2'); edge.addColorStop(0.6, '#8a6cf5'); edge.addColorStop(1, '#e58bd8');
    pill(bx, by, bw, bh, 24); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = focused ? X(3) : X(2); ctx.strokeStyle = edge; ctx.stroke();
    if (!focused) text('点击屏幕开始搜索', bx + 20, by + 26, '#9195a3', 18);
    const iy = by + bh - 37;
    ctx.strokeStyle = '#222'; ctx.lineWidth = X(1.8); ctx.lineCap = 'round';
    pill(bx + bw - 214, iy - 11, 9, 15, 4.5); ctx.stroke();                                              // 麦克风
    ctx.beginPath(); ctx.arc(X(bx + bw - 209.5), X(iy - 1), X(8), 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(bx + bw - 209.5), X(iy + 7)); ctx.lineTo(X(bx + bw - 209.5), X(iy + 11)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(bx + bw - 169), X(iy), X(10), 0, 7); ctx.stroke();                         // 加号
    ctx.beginPath(); ctx.moveTo(X(bx + bw - 174), X(iy)); ctx.lineTo(X(bx + bw - 164), X(iy)); ctx.moveTo(X(bx + bw - 169), X(iy - 5)); ctx.lineTo(X(bx + bw - 169), X(iy + 5)); ctx.stroke();
    const btn = ctx.createLinearGradient(X(bx + bw - 137), 0, X(bx + bw - 12), 0);
    btn.addColorStop(0, '#4e6ef2'); btn.addColorStop(1, '#6f63f6');
    pill(bx + bw - 137, by + bh - 62, 125, 50, 16); ctx.fillStyle = btn; ctx.fill();
    text('百度一下', bx + bw - 74.5, by + bh - 36, '#fff', 19, false, 'center');
    // ---- 文心助手的提示条 ----
    pill(770, 505, 465, 44, 22); ctx.fillStyle = '#f5f6fa'; ctx.fill();
    ctx.strokeStyle = '#3d6bf2'; ctx.lineWidth = X(2.5); ctx.beginPath(); ctx.arc(X(792), X(527), X(8), 0, 7); ctx.stroke();
    text('文心', 805, 527, '#3d6bf2', 18, true);
    text('复杂问题就找文心助手，深入思考回答更优  ›', 851, 527, '#222', 18);
    // ---- 热搜（内容是和这间屋子有关的玩笑，不是真的热搜）----
    text('百度', 566, 635, '#222', 17, true); text('热搜', 600, 635, '#f73131', 17, true); text('›', 638, 634, '#626675', 18);
    text('↻ 换一换', 1438, 636, '#626675', 16, false, 'right');
    const hot = ['白菜什么时候种最好', '磁带怎么保存不发霉', '手冲和意式有什么区别', '虎尾兰多久浇一次水', '水稻几月收割', '拿铁拉花新手教程', '座钟多久上一次弦', '线装书怎么保存', '橘猫为什么都很胖', '论语十则'];
    const rankColor = ['#f73131', '#f73131', '#ff6600', '#faa90e'];
    hot.forEach((t, i) => {
      const col = i < 5 ? 0 : 1, x = col ? 1013 : 566, y = 691 + (i % 5) * 41.7;
      if (i === 0) { // 置顶的小箭头
        ctx.strokeStyle = '#f73131'; ctx.lineWidth = X(2); ctx.beginPath(); ctx.moveTo(X(568), X(y - 7)); ctx.lineTo(X(580), X(y - 7)); ctx.moveTo(X(574), X(y + 8)); ctx.lineTo(X(574), X(y - 3)); ctx.moveTo(X(569), X(y + 1)); ctx.lineTo(X(574), X(y - 4)); ctx.lineTo(X(579), X(y + 1)); ctx.stroke();
      } else text(String(i), x + 6, y + 1, rankColor[i] ?? '#9195a3', 18, i < 4, 'center');
      text(t, x + 31, y, '#222', 18.5);
      const tag = i === 1 ? '热' : i === 2 || i === 5 ? '新' : '';
      if (tag) { const tx = x + 31 + ctx.measureText(t).width / k + 8; pill(tx, y - 9, 18, 18, 4); ctx.fillStyle = tag === '热' ? '#ff6600' : '#f73131'; ctx.fill(); text(tag, tx + 9, y + 0.5, '#fff', 11.5, false, 'center'); }
    });
    // ---- 右下角的浮动按钮和页脚 ----
    pill(1913, 918, 50, 156, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#eceef2'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#222'; ctx.lineWidth = X(1.6);
    pill(1930, 938, 16, 20, 4); ctx.stroke(); ctx.beginPath(); ctx.arc(X(1938), X(1021), X(9), 0, 7); ctx.stroke();
    text('下载', 1938, 974, '#222', 12.5, false, 'center'); text('辅助', 1938, 1047, '#222', 12.5, false, 'center');
    text('关于百度   About Baidu   使用百度前必读   帮助中心   企业推广   ·   这是画在屏幕上的示意页面，搜索会在新标签页打开 baidu.com', 1000, 1105, '#9195a3', 13, false, 'center');
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
