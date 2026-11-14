import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { SEARCH } from '../search';

const W = 1024, H = 592;
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/**
 * 显示器：屏幕上画的是百度首页的样子。点击屏幕 → 镜头推近，Scene.astro 把真正的输入框叠到搜索框上，
 * 提交后在新标签页打开真正的百度搜索。
 * 监听 monitor:focus / monitor:blur；聚焦时每帧发出 monitor:rect {x,y,w,h}（屏幕在画布上的像素矩形）。
 */
export const monitor: SceneObject = ({ scene, camera, renderer, tier, bus, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const m = L.monitor;
  const high = tier === 'high';
  const dark = bin.add(new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.4, metalness: 0.5 }));
  const alu = bin.add(new THREE.MeshStandardMaterial({ color: 0xbfc3c9, roughness: 0.3, metalness: 0.8 }));
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(bin.add(geo), mat);
    mesh.position.set(x, y, z); mesh.castShadow = high; mesh.receiveShadow = high;
    group.add(mesh); return mesh;
  };
  part(new THREE.BoxGeometry(m.w + 0.016, m.h + 0.016, 0.018), dark, m.x, m.cy, m.z - 0.011);
  part(new THREE.BoxGeometry(0.05, m.cy, 0.012), alu, m.x, m.cy / 2, m.z - 0.04);
  part(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 32), alu, m.x, 0.004, m.z - 0.03);

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const screenMat = bin.add(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const screen = part(new THREE.PlaneGeometry(m.w, m.h), screenMat, m.x, m.cy, m.z);
  screen.castShadow = false;

  let focused = false;
  const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const draw = () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#222'; ctx.font = `15px ${SANS}`;
    ['新闻', 'hao123', '地图', '贴吧', '视频', '图片', '网盘', '文库'].reduce((x, s) => { ctx.fillText(s, x, 30); return x + ctx.measureText(s).width + 26; }, 28);
    rr(W - 92, 16, 64, 28, 6); ctx.fillStyle = '#4e6ef2'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('登录', W - 60, 31);
    // 标志
    const cy = 176;
    ctx.font = `bold 62px Arial, sans-serif`; ctx.fillStyle = '#e10602'; ctx.textAlign = 'right'; ctx.fillText('Bai', 470, cy);
    ctx.fillStyle = '#2932e1';
    ctx.beginPath(); ctx.ellipse(512, cy + 8, 34, 28, 0, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy, r] of [[-30, -22, 9], [-11, -34, 10], [11, -34, 10], [30, -22, 9]]) { ctx.beginPath(); ctx.ellipse(512 + dx, cy + dy, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `bold 30px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('du', 512, cy + 10);
    ctx.fillStyle = '#e10602'; ctx.font = `bold 54px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('百度', 556, cy);
    // 搜索框和按钮
    const bx = SEARCH.x * W, by = SEARCH.y * H, bw = SEARCH.w * W, bh = SEARCH.h * H, btn = SEARCH.btn * W;
    rr(bx, by, bw + btn, bh, 12); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = focused ? '#4e6ef2' : '#c4c7ce'; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(bx + bw, by, btn, bh, [0, 12, 12, 0]); ctx.fillStyle = '#4e6ef2'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `20px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('百度一下', bx + bw + btn / 2, by + bh / 2 + 1);
    if (!focused) { ctx.fillStyle = '#9195a3'; ctx.font = `18px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('点击屏幕开始搜索', bx + 20, by + bh / 2 + 1); }
    ctx.fillStyle = '#9195a3'; ctx.font = `13px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText('这是画在屏幕上的示意页面 · 搜索会在新标签页打开 baidu.com', W / 2, H - 26);
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
