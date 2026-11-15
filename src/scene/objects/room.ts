import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L, SUN_LIGHT_DIR } from '../layout';
import { Batch, canvasTex, rbox, rng, speckle, woodGrain } from '../util';

const SERIF = '"Kaiti SC","STKaiti","KaiTi","Songti SC","Noto Serif CJK SC","SimSun",serif';

/** 房间：带大窗的墙、窗框窗台、纱帘、木地板、地毯、墙上的挂轴，以及晨光。 */
export const room: SceneObject = ({ scene, tier }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const batch = new Batch();
  // 有贴图的材质默认把同一张图当凹凸图，让木纹、布纹、叶脉有起伏
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const { win, wallZ, floorY } = L;

  // ---- 墙 ----
  const wall = std({ roughness: 0.95, map: bin.add(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ddd6ca'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3, 2600, '90,70,50', 0.05); speckle(g, w, h, 4, 1800, '255,255,255', 0.08);
  }, [3, 3])) });
  const top = 2.9, th = 0.2, zc = wallZ - th / 2, H = top - floorY, yc = (top + floorY) / 2;
  batch.add(wall, new THREE.BoxGeometry(4, H, th), [win.x0 - 2, yc, zc]);
  batch.add(wall, new THREE.BoxGeometry(4, H, th), [win.x1 + 2, yc, zc]);
  batch.add(wall, new THREE.BoxGeometry(win.x1 - win.x0, win.y0 - floorY, th), [0, (win.y0 + floorY) / 2, zc]);
  batch.add(wall, new THREE.BoxGeometry(win.x1 - win.x0, top - win.y1, th), [0, (top + win.y1) / 2, zc]);
  batch.add(wall, new THREE.BoxGeometry(th, H, 7), [-3.3, yc, 2.2]);
  batch.add(wall, new THREE.BoxGeometry(th, H, 7), [3.3, yc, 2.2]);
  const trim = std({ color: 0xf6f3ec, roughness: 0.5 });
  batch.add(trim, rbox(6.4, 0.1, 0.018, 0.004), [0, floorY + 0.05, wallZ + 0.009]); // 踢脚线

  // ---- 窗框（深色铝合金，三扇）、把手、木窗台 ----
  const alu = std({ color: 0x26282c, roughness: 0.4, metalness: 0.75 });
  const ww = win.x1 - win.x0, wh = win.y1 - win.y0, wy = (win.y0 + win.y1) / 2, fz = wallZ - 0.11, fw = 0.05;
  batch.add(alu, rbox(ww, fw, 0.07, 0.006), [0, win.y1 - fw / 2, fz]);
  batch.add(alu, rbox(ww, fw, 0.07, 0.006), [0, win.y0 + fw / 2, fz]);
  for (const x of [win.x0 + fw / 2, win.x1 - fw / 2]) batch.add(alu, rbox(fw, wh, 0.07, 0.006), [x, wy, fz]);
  for (const x of [-ww / 6, ww / 6]) {
    batch.add(alu, rbox(0.06, wh - fw, 0.06, 0.006), [x, wy, fz]);
    // 每扇窗内侧再套一圈细窗扇
    for (const dx of [-0.04, 0.04]) batch.add(alu, rbox(0.014, wh - fw * 2, 0.03, 0.003), [x + dx, wy, fz + 0.02]);
  }
  batch.add(alu, rbox(0.016, 0.11, 0.022, 0.004), [ww / 6 - 0.045, wy - 0.25, fz + 0.045]);
  batch.add(alu, rbox(0.018, 0.02, 0.07, 0.004), [ww / 6 - 0.045, wy - 0.2, fz + 0.075]);
  const sillWood = std({ roughness: 0.5, map: bin.add(canvasTex(512, 64, (g, w, h) => woodGrain(g, 0, 0, w, h, '#b88a5e', '70,40,18', 21, 60))) });
  batch.add(sillWood, rbox(ww + 0.16, 0.035, 0.3, 0.012), [0, win.y0 - 0.0175, wallZ - 0.02]);

  // ---- 地板和地毯 ----
  const floorTex = bin.add(canvasTex(1024, 1024, (g, w, h) => {
    const r = rng(8), rows = 8, rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 260 + r() * 300, tone = Math.floor(r() * 26);
        woodGrain(g, x, i * rh, len, rh, `rgb(${178 - tone},${140 - tone},${104 - tone})`, '80,48,22', Math.floor(r() * 1e6), 34);
        g.fillStyle = 'rgba(40,24,10,.55)'; g.fillRect(x + len - 1.5, i * rh, 2.5, rh);
        x += len;
      }
      g.fillStyle = 'rgba(40,24,10,.5)'; g.fillRect(0, i * rh, w, 2);
    }
  }, [5, 4]));
  const floorMat = std({ map: floorTex, roughness: 0.42 });
  batch.add(floorMat, new THREE.BoxGeometry(14, 0.1, 9), [0, floorY - 0.05, 1.5]);
  const rugMat = std({ roughness: 1, map: bin.add(canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? 'rgba(120,105,85,.10)' : 'rgba(255,255,255,.12)'; g.fillRect(0, y, w, 2); }
    g.strokeStyle = '#5f7f8c'; g.lineWidth = 10; g.strokeRect(34, 34, w - 68, h - 68);
    g.strokeStyle = '#b8695a'; g.lineWidth = 3; g.strokeRect(54, 54, w - 108, h - 108);
    speckle(g, w, h, 5, 5000, '60,50,40', 0.08);
  })) });
  batch.add(rugMat, rbox(3.3, 0.014, 2.3, 0.006), [0, floorY + 0.007, 0.95]);

  // ---- 窗帘杆和墙上的挂轴 ----
  const rodMat = std({ color: 0x1b1b1d, roughness: 0.35, metalness: 0.8 });
  batch.add(rodMat, new THREE.CylinderGeometry(0.012, 0.012, 3.7, 12), [0, 2.06, wallZ + 0.08], [0, 0, Math.PI / 2]);
  for (const x of [-1.87, 1.87]) batch.add(rodMat, new THREE.SphereGeometry(0.026, 16, 12), [x, 2.06, wallZ + 0.08]);
  const scrollMat = std({ roughness: 0.9, map: bin.add(canvasTex(256, 768, (g, w, h) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, w, h);                       // 绫边
    speckle(g, w, h, 6, 3000, '255,240,200', 0.12);
    g.fillStyle = '#f1e7cf'; g.fillRect(26, 70, w - 52, h - 150);          // 画心
    speckle(g, w, h, 7, 1500, '120,90,40', 0.06);
    g.fillStyle = '#1b1814'; g.font = `bold 118px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...'宁静致远'].forEach((ch, i) => g.fillText(ch, w / 2, 150 + i * 134));
    g.fillStyle = '#b3261e'; g.fillRect(40, h - 150, 40, 40);              // 印章
    g.fillStyle = '#f1e7cf'; g.font = `bold 15px ${SERIF}`; g.fillText('晨', 51, h - 139); g.fillText('读', 70, h - 121);
  })) });
  const sx = 1.84, sy = 1.02;
  batch.add(scrollMat, new THREE.PlaneGeometry(0.32, 0.96), [sx, sy, wallZ + 0.012]);
  const darkWood = std({ color: 0x3a2416, roughness: 0.5 });
  for (const y of [sy + 0.49, sy - 0.49]) batch.add(darkWood, new THREE.CylinderGeometry(0.013, 0.013, 0.38, 12), [sx, y, wallZ + 0.02], [0, 0, Math.PI / 2]);
  batch.add(rodMat, new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), [sx, sy + 0.6, wallZ + 0.012]);

  batch.build(group, bin, { cast: high, receive: high, noCast: [floorMat, rugMat, scrollMat, trim] });

  // ---- 纱帘：被朝阳照透，随微风轻轻摆动 ----
  const linen = bin.add(new THREE.MeshStandardMaterial({
    color: 0xf7f2e8, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    emissive: 0x8a6a4c, emissiveIntensity: 0.4,
    map: bin.add(canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 3) { g.fillStyle = 'rgba(150,130,110,.14)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
    }, [6, 30])),
  }));
  const cw = 0.4, ch = 2.06 - floorY - 0.03;
  const curtains = [-1, 1].map((side) => {
    const geo = bin.add(new THREE.PlaneGeometry(cw, ch, 26, 10));
    const mesh = new THREE.Mesh(geo, linen);
    mesh.position.set(side * (win.x1 + 0.16), 2.06 - ch / 2, wallZ + 0.08);
    mesh.castShadow = high;
    group.add(mesh);
    return { geo, base: Float32Array.from(geo.attributes.position.array as Float32Array), side };
  });

  // ---- 窗玻璃：一层很淡的薄膜，带一点没擦干净的水痕 ----
  // 用不受光照的材质：带高光的玻璃会把室内补光灯映成一个亮点，再被光束拉成一道线
  const glass = bin.add(new THREE.MeshBasicMaterial({
    color: 0xfff4e6, transparent: true, opacity: 0.09, depthWrite: false,
    alphaMap: bin.add(canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#555'; g.fillRect(0, 0, w, h);
      const r = rng(23);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h, len = 30 + r() * 120;
        const grad = g.createLinearGradient(x, y, x + len * 0.2, y + len);
        grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, `rgba(255,255,255,${0.1 + r() * 0.25})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = grad; g.lineWidth = 2 + r() * 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.2, y + len); g.stroke();
      }
      speckle(g, w, h, 24, 400, '255,255,255', 0.5);
    })),
  }));
  const pane = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(ww - fw * 2, wh - fw * 2)), glass);
  pane.position.set(0, wy, fz);
  group.add(pane);

  // ---- 光：朝阳从窗外斜照进来，冷色天光补暗部，身后一点暖色补光 ----
  const sun = new THREE.DirectionalLight(0xffbe82, 3.6);
  sun.position.copy(SUN_LIGHT_DIR).multiplyScalar(14);
  sun.target.position.set(0, 0, 0);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -2.4; c.right = 2.4; c.top = 2.3; c.bottom = -1.6; c.near = 4; c.far = 24;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.012; sun.shadow.radius = 3;
  }
  const hemi = new THREE.HemisphereLight(0xc9d8ff, 0x7a6048, 0.5);
  const fill = new THREE.PointLight(0xffe2c4, 1.0, 8, 1.2);
  fill.position.set(0.4, 1.5, 2.6);
  // 阳光打在桌面上再弹起来的暖光，照亮书脊、屏幕下方这些背光面
  const bounce = new THREE.PointLight(0xffc48c, 0.8, 2.4, 1.4);
  bounce.position.set(0, 0.4, 0.3);
  group.add(sun, sun.target, hemi, fill, bounce);

  scene.add(group);
  return {
    frame(_dt, t) {
      for (const c of curtains) {
        const p = c.geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = c.base[i * 3], y = c.base[i * 3 + 1];
          const hang = 0.5 - y / ch; // 0 在帘杆处，1 在下摆
          p.setZ(i, Math.sin(x * 48) * 0.022 + Math.sin(t * 0.8 + y * 2.2 + x * 4 + c.side) * 0.02 * hang);
          p.setX(i, x * (1 - 0.05 * hang) + Math.sin(t * 0.6 + y * 1.7) * 0.008 * hang);
        }
        p.needsUpdate = true;
        c.geo.computeVertexNormals();
      }
    },
    stop() { scene.remove(group); bin.dispose(); },
  };
};
