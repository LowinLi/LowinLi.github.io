import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bin, emit, type SceneObject } from '../types';
import { L } from '../layout';
import { asset, Batch, blob, canvasTex, contactMaterial, speckle, type V3 } from '../util';

const SERIF = '"Kaiti SC","STKaiti","KaiTi","Songti SC","Noto Serif CJK SC","SimSun",serif';

/**
 * 中式书房里的家具（都是 Poly Haven 的扫描模型，CC0，异步加载）：
 * 书桌前的圈椅、左墙边的条案和上面的瓷瓶、右后方的茶几、两只凳子和一套茶具、
 * 窗边的落地座钟（时针分针走访客电脑上的真实时间，钟摆左右摆动），以及左墙上的一幅水墨山水横幅。
 */
export const furniture: SceneObject = ({ scene, camera, renderer, tier, bus }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const fy = L.floorY;
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);
  const batch = new Batch();

  // ---- 左墙上的水墨山水横幅（代码画的）----
  const painting = bin.add(new THREE.MeshStandardMaterial({ roughness: 0.9, map: bin.add(canvasTex(1024, 420, (g, w, h) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, w, h);                         // 绫边
    g.fillStyle = '#efe6d0'; g.fillRect(40, 30, w - 80, h - 60);             // 画心
    speckle(g, w, h, 91, 2500, '120,90,40', 0.06);
    // 三层远近不同的山：越远越淡
    const ridge = (base: number, amp: number, seed: number, alpha: number) => {
      g.beginPath(); g.moveTo(40, h - 30);
      for (let x = 40; x <= w - 40; x += 6) {
        const y = base - amp * (0.55 + 0.45 * Math.sin(x * 0.006 + seed)) * (0.55 + 0.45 * Math.sin(x * 0.019 + seed * 2.1)) - 10 * Math.sin(x * 0.07 + seed * 4);
        g.lineTo(x, y);
      }
      g.lineTo(w - 40, h - 30); g.closePath();
      const grad = g.createLinearGradient(0, base - amp, 0, h - 30);
      grad.addColorStop(0, `rgba(30,34,38,${alpha})`); grad.addColorStop(1, 'rgba(30,34,38,0)');
      g.fillStyle = grad; g.fill();
    };
    ridge(250, 150, 0.8, 0.28); ridge(290, 130, 3.3, 0.5); ridge(340, 110, 5.6, 0.82);
    // 一叶小舟和几笔水纹
    g.strokeStyle = 'rgba(30,34,38,.7)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(610, 352); g.quadraticCurveTo(640, 364, 672, 352); g.stroke();
    g.beginPath(); g.moveTo(642, 352); g.lineTo(642, 326); g.stroke();
    g.strokeStyle = 'rgba(30,34,38,.25)'; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const x = 120 + i * 95, y = 362 + (i % 3) * 7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 46, y); g.stroke(); }
    // 题款和印章
    g.fillStyle = '#1b1814'; g.font = `26px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...'山居晨读'].forEach((ch, i) => g.fillText(ch, w - 90, 80 + i * 32));
    g.fillStyle = '#b3261e'; g.fillRect(w - 104, 216, 28, 28);
  })) }));
  const pz = 1.3, py = 1.32;
  batch.add(painting, new THREE.PlaneGeometry(1.5, 0.615).rotateY(Math.PI / 2), [-3.19, py, pz]);
  const darkWood = bin.add(new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.5 }));
  for (const dz of [-0.76, 0.76]) batch.add(darkWood, new THREE.CylinderGeometry(0.014, 0.014, 0.66, 10), [-3.18, py, pz + dz]);

  // ---- 座钟的钟摆 ----
  // 这只钟的模型箱门是实木的，钟摆藏在里面看不见。所以在箱门上加一扇带铜边的玻璃小窗：
  // 深色的箱内背板 + 黄铜摆杆和摆锤（绕上端左右摆）+ 一圈铜边 + 一层玻璃的反光。
  const clockX = -2.15, clockZ = L.wallZ + 0.32;
  const brass = bin.add(new THREE.MeshStandardMaterial({ color: 0xdba63f, roughness: 0.25, metalness: 1 }));
  const clockWindow = new THREE.Group();
  clockWindow.position.set(clockX, fy, clockZ);
  const WY0 = 0.62, WY1 = 1.38, WW = 0.2, WZ = 0.2; // 小窗在钟身上的位置（钟自己的坐标）
  const inside = new THREE.Mesh(bin.add(new THREE.BoxGeometry(WW, WY1 - WY0, 0.012)), bin.add(new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.9 })));
  inside.position.set(0, (WY0 + WY1) / 2, WZ);
  clockWindow.add(inside);
  const frameGeo = [
    new THREE.BoxGeometry(WW + 0.03, 0.015, 0.04).translate(0, WY1, WZ + 0.02), new THREE.BoxGeometry(WW + 0.03, 0.015, 0.04).translate(0, WY0, WZ + 0.02),
    new THREE.BoxGeometry(0.015, WY1 - WY0, 0.04).translate(-WW / 2, (WY0 + WY1) / 2, WZ + 0.02), new THREE.BoxGeometry(0.015, WY1 - WY0, 0.04).translate(WW / 2, (WY0 + WY1) / 2, WZ + 0.02),
  ];
  for (const g of frameGeo) { const m = new THREE.Mesh(bin.add(g), brass); m.castShadow = high; clockWindow.add(m); }
  const pendulum = new THREE.Group();
  pendulum.position.set(0, WY1 - 0.03, WZ + 0.02);
  pendulum.add(
    new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 8).translate(0, -0.3, 0)), brass),
    new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.058, 0.058, 0.014, 28).rotateX(Math.PI / 2).translate(0, -0.6, 0)), brass),
  );
  clockWindow.add(pendulum);
  const glassPane = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(WW, WY1 - WY0)), bin.add(new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.07, depthWrite: false })));
  glassPane.position.set(0, (WY0 + WY1) / 2, WZ + 0.04);
  clockWindow.add(glassPane);
  clockWindow.visible = false; // 钟的模型到了再显示
  group.add(clockWindow);
  batch.build(group, bin, { receive: high });

  // ---- 扫描模型 ----
  let stopped = false;
  const models: THREE.Object3D[] = [];
  const loader = new GLTFLoader();
  const useModel = (name: string, o: { pos: V3; rotY?: number; scale?: number; shadow?: [number, number]; then?: (m: THREE.Object3D) => void }) => {
    loader.loadAsync(asset(`models/${name}/${name}.gltf`)).then(async (gltf) => {
      if (stopped) return;
      const model = gltf.scene;
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mesh.castShadow = mesh.receiveShadow = high;
        if (mat.map) mat.map.anisotropy = 8;
        if (mat.transparent || mat.alphaTest > 0) { mesh.userData.noAO = true; mesh.castShadow = false; }
      });
      model.position.set(...o.pos);
      model.rotation.y = o.rotY ?? 0;
      model.scale.setScalar(o.scale ?? 1);
      // 先在后台把着色器编译好再放进场景，免得模型第一次进画面时卡一下
      await renderer.compileAsync(model, camera, scene).catch(() => {});
      if (stopped) return;
      group.add(model);
      if (o.shadow) {
        const sh = new THREE.Mesh(bin.add(blob(o.shadow[0], o.shadow[1])), contact);
        sh.position.set(o.pos[0], fy + 0.017, o.pos[2]); sh.rotation.y = o.rotY ?? 0;
        group.add(sh);
      }
      models.push(model);
      o.then?.(model);
      emit(bus, 'scene:changed');
    }).catch((e) => console.warn(`[scene] 模型 ${name} 加载失败`, e));
  };

  // 书桌前的圈椅：斜着推开，像刚有人起身
  useModel('chinese_armchair', { pos: [0.62, fy, 1.42], rotY: Math.PI - 0.55, scale: 0.72, shadow: [0.42, 0.42] });
  // 左墙边的条案，上面一大一小两只瓷瓶
  const tableX = -3.19 + 0.2, tableTop = fy + 0.66;
  useModel('chinese_console_table', { pos: [tableX, fy, pz], rotY: Math.PI / 2, shadow: [0.95, 0.24] });
  useModel('antique_ceramic_vase_01', { pos: [tableX, tableTop, pz - 0.5] });
  useModel('ceramic_vase_01', { pos: [tableX, tableTop, pz + 0.55], scale: 0.7 });
  // 右后方的茶角：茶几、两只凳子、一套茶具
  const teaX = 2.3, teaZ = 2.7;
  useModel('chinese_tea_table', { pos: [teaX, fy, teaZ], rotY: 0.3, shadow: [0.5, 0.5] });
  useModel('tea_set_01', { pos: [teaX, fy + 0.5, teaZ], rotY: 0.3, scale: 0.72 });
  useModel('chinese_stool', { pos: [teaX - 0.85, fy, teaZ - 0.2], rotY: 0.4, shadow: [0.3, 0.3] });
  useModel('chinese_stool', { pos: [teaX + 0.2, fy, teaZ + 0.85], rotY: -0.5, shadow: [0.3, 0.3] });
  // 窗边的落地座钟：时针和分针是独立的节点，走真实时间。模型里指针摆在 10:37，先记下各自的初始角度（从 12 点起顺时针）
  const hands: { node: THREE.Object3D; base: number; turns: (h: number, m: number) => number }[] = [];
  useModel('vintage_grandfather_clock_01', {
    pos: [clockX, fy, clockZ], shadow: [0.36, 0.3],
    then(m) {
      const reg = (n: string, base: number, turns: (h: number, mm: number) => number) => { const node = m.getObjectByName(n); if (node) hands.push({ node, base, turns }); };
      reg('vintage_grandfather_clock_01_HourHand', -0.862, (h) => h / 12);
      reg('vintage_grandfather_clock_01_MinuteHand', -2.4, (_h, mm) => mm / 60);
      clockWindow.visible = true;
      // 表盘前的玻璃在模型里很暗，调透一些，指针才看得清
      m.traverse((o) => { const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mat?.transparent) { mat.opacity = 0.12; mat.depthWrite = false; } });
    },
  });

  scene.add(group);
  return {
    frame(_dt, t) {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, mm = d.getMinutes() + s / 60, h = (d.getHours() % 12) + mm / 60;
      // 钟面朝 +z：从正面看顺时针 = 绕 z 轴负方向
      for (const k of hands) k.node.rotation.z = -(k.turns(h, mm) * Math.PI * 2 - k.base);
      // 两秒一个来回
      pendulum.rotation.z = Math.sin(t * Math.PI) * 0.085;
    },
    stop() {
      stopped = true;
      for (const m of models) m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        for (const tx of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) tx?.dispose();
        mat.dispose();
      });
      scene.remove(group); bin.dispose();
    },
  };
};
