import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox, rng, speckle } from '../util';

const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/**
 * 咖啡角：桌子右端一台意式咖啡机，旁边一袋皮爷咖啡豆和几颗散落的豆子。机器下面的杯子和出咖啡按钮在 cups.ts。
 */
/** 咖啡机的几处关键位置（cups.ts 要用：接水盘上的杯位、出水嘴、按钮） */
export const MACHINE = (() => {
  const { x, z } = L.coffee, W = 0.2, H = 0.3, D = 0.24;
  return { W, H, D, trayY: 0.058, cupZ: z + D * 0.2, spoutY: H - 0.08 - 0.063, panelZ: z + D / 2, buttonX: x + 0.065, buttonY: H - 0.04 };
})();

export const coffee: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const { x: cx, z: cz } = L.coffee;
  const batch = new Batch();
  const steel = std({ color: 0xd4d6d8, roughness: 0.22, metalness: 1 });
  const dark = std({ color: 0x1a1b1d, roughness: 0.45, metalness: 0.3 });
  const W = 0.2, H = 0.3, D = 0.24;

  // ---- 咖啡机：不锈钢机身，上半截向前探出，底下是接水盘 ----
  batch.add(steel, rbox(W, 0.05, D, 0.008), [cx, 0.025, cz]);                                   // 底座
  batch.add(dark, new THREE.BoxGeometry(W - 0.02, 0.006, D * 0.5), [cx, 0.052, cz + D * 0.2]);  // 接水盘的格栅
  for (let i = 0; i < 7; i++) batch.add(steel, new THREE.BoxGeometry(W - 0.03, 0.002, 0.004), [cx, 0.056, cz + D * 0.2 - 0.05 + i * 0.016]);
  batch.add(steel, rbox(W, H - 0.05, D * 0.5, 0.008), [cx, 0.05 + (H - 0.05) / 2, cz - D * 0.25]); // 后半截立柱
  batch.add(steel, rbox(W, 0.1, D, 0.01), [cx, H - 0.05, cz]);                                     // 探出来的机头
  // 顶上的温杯板和两只倒扣的小杯子
  batch.add(dark, new THREE.BoxGeometry(W - 0.02, 0.004, D - 0.03), [cx, H + 0.002, cz]);
  const white = std({ color: 0xfaf8f3, roughness: 0.16 });
  for (const dx of [-0.045, 0.045]) batch.add(white, new THREE.CylinderGeometry(0.02, 0.028, 0.045, 16), [cx + dx, H + 0.027, cz - 0.03]);
  // 面板：压力表、两只旋钮、电源灯
  const gauge = std({ roughness: 0.4, bumpScale: 0, map: bin.add(canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill();
    g.strokeStyle = '#2a2622'; g.lineWidth = 3;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.75 + i * 0.15); g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 44, w / 2 + Math.sin(a) * 44); g.lineTo(w / 2 + Math.cos(a) * 54, w / 2 + Math.sin(a) * 54); g.stroke(); }
    g.strokeStyle = '#3f8a3a'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, w / 2, 38, Math.PI * 1.45, Math.PI * 1.85); g.stroke();
    g.strokeStyle = '#c8281e'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + 30, w / 2 - 22); g.stroke();
    g.fillStyle = '#2a2622'; g.font = `bold 13px ${SANS}`; g.textAlign = 'center'; g.fillText('bar', w / 2, w / 2 + 30);
  })) });
  const fz = cz + D / 2;
  batch.add(steel, new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24), [cx, H - 0.04, fz + 0.003], [Math.PI / 2, 0, 0]);
  batch.add(gauge, new THREE.CircleGeometry(0.026, 24), [cx, H - 0.04, fz + 0.0075]);
  batch.add(dark, new THREE.CylinderGeometry(0.014, 0.016, 0.02, 16), [cx - 0.065, H - 0.04, fz + 0.01], [Math.PI / 2, 0, 0]); // 右边是出咖啡的按钮，在 cups.ts
  batch.add(bin.add(new THREE.MeshBasicMaterial({ color: 0x8dffa0 })), new THREE.CircleGeometry(0.003, 10), [cx + 0.085, H - 0.012, fz + 0.001]);
  // 冲煮头、手柄（带黑色握把）和两个出水嘴
  // 冲煮头比机头底面低一截；留出 0.1 米左右的净高，马克杯也放得下
  const gy = H - 0.08, gz = cz + D * 0.2;
  batch.add(steel, new THREE.CylinderGeometry(0.036, 0.036, 0.02, 24), [cx, gy - 0.01, gz]);
  batch.add(steel, new THREE.CylinderGeometry(0.033, 0.03, 0.026, 24), [cx, gy - 0.033, gz]);
  batch.add(dark, new THREE.CylinderGeometry(0.009, 0.011, 0.11, 10), [cx + 0.045, gy - 0.04, gz + 0.065], [Math.PI / 2 - 0.15, 0.6, 0]);
  for (const dx of [-0.011, 0.011]) batch.add(steel, new THREE.CylinderGeometry(0.004, 0.004, 0.018, 8), [cx + dx, gy - 0.054, gz]);
  // 蒸汽棒：从机头右侧伸出来，往下弯
  batch.add(steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(cx + W / 2 - 0.02, H - 0.09, cz + 0.06), new THREE.Vector3(cx + W / 2 + 0.03, H - 0.11, cz + 0.08), new THREE.Vector3(cx + W / 2 + 0.035, H - 0.2, cz + 0.1)]), 14, 0.004, 8));
  batch.add(dark, new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), [cx + W / 2 + 0.035, H - 0.2, cz + 0.1]);
  const contact = contactMaterial(bin, high ? 0.32 : 0.55);
  batch.add(contact, blob(0.15, 0.17), [cx, 0.0007, cz]);

  // 机器下面的杯子在 cups.ts（能拿起来喝、能打新的）

  // ---- 皮爷咖啡豆：一袋立着的咖啡豆，顶上折了两折用夹条封住 ----
  const bx = cx + 0.02, bz = cz + 0.36, BW = 0.13, BH = 0.2, BD = 0.07;
  const label = (front: boolean) => canvasTex(360, 512, (g, w, h) => {
    g.fillStyle = '#3b2415'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 81, 5000, '255,220,180', 0.05);
    if (!front) return;
    g.fillStyle = '#efe4cf'; g.beginPath(); g.roundRect(34, 118, w - 68, 262, 10); g.fill();
    g.strokeStyle = '#3b2415'; g.lineWidth = 3; g.strokeRect(46, 130, w - 92, 238);
    g.fillStyle = '#3b2415'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 50px Georgia, "Times New Roman", serif'; g.fillText("Peet's", w / 2, 180);
    g.font = '24px Georgia, "Times New Roman", serif'; g.fillText('COFFEE', w / 2, 222);
    g.fillRect(100, 244, w - 200, 2);
    g.font = `bold 34px ${SANS}`; g.fillText('皮爷咖啡', w / 2, 284);
    g.font = `19px ${SANS}`; g.fillText('深度烘焙 · 咖啡豆', w / 2, 326);
    g.font = `15px ${SANS}`; g.fillText('净含量 250 克', w / 2, 352);
    g.fillStyle = '#c9a15a'; g.fillRect(0, 60, w, 6); g.fillRect(0, h - 70, w, 6);
  });
  const bagFront = std({ roughness: 0.75, map: bin.add(label(true)), bumpScale: 0 });
  const bagSide = std({ roughness: 0.75, map: bin.add(label(false)) });
  // 袋身：底部方、往上收窄成一条折边
  const bag = new THREE.BoxGeometry(BW, BH, BD, 1, 4, 1), bp = bag.attributes.position;
  for (let i = 0; i < bp.count; i++) { const t = (bp.getY(i) + BH / 2) / BH, k = 1 - Math.pow(t, 3) * 0.85; bp.setZ(i, bp.getZ(i) * k); bp.setX(i, bp.getX(i) * (1 - Math.pow(t, 3) * 0.06)); }
  bag.computeVertexNormals();
  const bagMesh = new THREE.Mesh(bin.add(bag), [bagSide, bagSide, bagSide, bagSide, bagFront, bagSide]);
  bagMesh.position.set(bx, BH / 2, bz); bagMesh.rotation.y = -0.35; bagMesh.castShadow = bagMesh.receiveShadow = high;
  group.add(bagMesh);
  const clip = new THREE.Mesh(bin.add(new THREE.BoxGeometry(BW * 0.96, 0.016, 0.014)), std({ color: 0xc9a15a, roughness: 0.4, metalness: 0.6 }));
  clip.position.set(bx, BH - 0.004, bz); clip.rotation.y = -0.35; group.add(clip);
  batch.add(contact, blob(0.1, 0.07), [bx, 0.0008, bz]);
  // 散在桌上的几颗咖啡豆
  const bean = std({ color: 0x3a2112, roughness: 0.45 });
  const r = rng(31);
  for (let i = 0; i < 9; i++) batch.add(bean, new THREE.SphereGeometry(0.0045, 7, 5), [bx - 0.1 + r() * 0.08, 0.003, bz + 0.02 + r() * 0.07], [0, r() * 3, 0], [1, 0.6, 1.5]);

  batch.build(group, bin, { cast: high, receive: high, noCast: [contact] });

  scene.add(group);
  return {
    frame() {},
    stop() { scene.remove(group); bin.dispose(); },
  };
};
