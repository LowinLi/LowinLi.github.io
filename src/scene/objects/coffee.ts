import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox, rng, speckle } from '../util';

const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/**
 * 咖啡角：桌子右端一台意式咖啡机，出水口下面是一杯刚打出来、带拉花的拿铁（冒着热气），旁边一袋皮爷咖啡豆和几颗散落的豆子。
 */
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
  for (const dx of [-0.065, 0.065]) batch.add(dark, new THREE.CylinderGeometry(0.014, 0.016, 0.02, 16), [cx + dx, H - 0.04, fz + 0.01], [Math.PI / 2, 0, 0]);
  batch.add(bin.add(new THREE.MeshBasicMaterial({ color: 0x8dffa0 })), new THREE.CircleGeometry(0.003, 10), [cx + 0.085, H - 0.012, fz + 0.001]);
  // 冲煮头、手柄（带黑色握把）和两个出水嘴
  const gy = H - 0.1, gz = cz + D * 0.2;
  batch.add(steel, new THREE.CylinderGeometry(0.036, 0.036, 0.02, 24), [cx, gy - 0.01, gz]);
  batch.add(steel, new THREE.CylinderGeometry(0.033, 0.03, 0.026, 24), [cx, gy - 0.033, gz]);
  batch.add(dark, new THREE.CylinderGeometry(0.009, 0.011, 0.11, 10), [cx + 0.045, gy - 0.04, gz + 0.065], [Math.PI / 2 - 0.15, 0.6, 0]);
  for (const dx of [-0.011, 0.011]) batch.add(steel, new THREE.CylinderGeometry(0.004, 0.004, 0.018, 8), [cx + dx, gy - 0.054, gz]);
  // 蒸汽棒：从机头右侧伸出来，往下弯
  batch.add(steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(cx + W / 2 - 0.02, H - 0.09, cz + 0.06), new THREE.Vector3(cx + W / 2 + 0.03, H - 0.11, cz + 0.08), new THREE.Vector3(cx + W / 2 + 0.035, H - 0.2, cz + 0.1)]), 14, 0.004, 8));
  batch.add(dark, new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), [cx + W / 2 + 0.035, H - 0.2, cz + 0.1]);
  const contact = contactMaterial(bin, high ? 0.32 : 0.55);
  batch.add(contact, blob(0.15, 0.17), [cx, 0.0007, cz]);

  // ---- 拿铁：白瓷杯和碟子，放在接水盘上、出水嘴正下方；杯面是奶泡拉出的叶子 ----
  const ly = 0.058, lz = gz;
  batch.add(white, new THREE.LatheGeometry([[0, 0], [0.036, 0], [0.05, 0.004], [0.052, 0.008], [0.03, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)), 32), [cx, ly, lz]); // 碟子
  batch.add(white, new THREE.LatheGeometry([[0, 0], [0.022, 0], [0.027, 0.006], [0.04, 0.05], [0.041, 0.056], [0.0385, 0.056], [0.036, 0.05], [0.024, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y)), 36), [cx, ly + 0.008, lz]);
  batch.add(white, new THREE.TorusGeometry(0.016, 0.0045, 8, 16, Math.PI), [cx + 0.04, ly + 0.04, lz], [0, 0, -Math.PI / 2]);
  const art = std({ roughness: 0.35, bumpScale: 0, map: bin.add(canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const crema = g.createRadialGradient(c, c, 10, c, c, c);
    crema.addColorStop(0, '#b9773f'); crema.addColorStop(0.75, '#a4622f'); crema.addColorStop(1, '#7a4420');
    g.fillStyle = crema; g.fillRect(0, 0, w, w);
    speckle(g, w, w, 71, 500, '70,35,10', 0.25);
    // 拉花：一层层往上叠的奶泡叶片，中间一道茎，顶上一颗心
    g.strokeStyle = '#fbf3e4'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = 196 - i * 23, half = 62 - i * 5;
      g.lineWidth = 11 - i * 0.8;
      g.beginPath(); g.moveTo(c - half, y - 16); g.quadraticCurveTo(c, y + 22, c + half, y - 16); g.stroke();
    }
    g.fillStyle = '#fbf3e4';
    g.beginPath(); g.moveTo(c, 78); g.bezierCurveTo(c - 34, 52, c - 20, 26, c, 44); g.bezierCurveTo(c + 20, 26, c + 34, 52, c, 78); g.fill();
    g.strokeStyle = '#a4622f'; g.lineWidth = 3; g.beginPath(); g.moveTo(c, 214); g.lineTo(c, 60); g.stroke();
  })) });
  batch.add(art, new THREE.CircleGeometry(0.0375, 32).rotateX(-Math.PI / 2), [cx, ly + 0.008 + 0.053, lz], [0, 0.4, 0]);

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

  // 拿铁的热气
  const steamTex = bin.add(canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }));
  const steam = Array.from({ length: high ? 4 : 2 }, (_, i) => {
    const mat = bin.add(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false, color: 0xfff3e2 }));
    const s = new THREE.Sprite(mat); group.add(s);
    return { s, mat, life: i / 4, seed: i * 1.9 };
  });

  scene.add(group);
  return {
    frame(dt, t) {
      for (const p of steam) {
        p.life = (p.life + dt * 0.25) % 1;
        const k = p.life;
        p.s.position.set(cx + Math.sin(p.seed + k * 4 + t * 0.3) * 0.01 * (1 + k * 2), ly + 0.07 + k * 0.07, lz + 0.015 + k * 0.03);
        p.s.scale.set(0.025 + k * 0.035, 0.035 + k * 0.045, 1);
        p.mat.opacity = Math.sin(k * Math.PI) * 0.22;
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
