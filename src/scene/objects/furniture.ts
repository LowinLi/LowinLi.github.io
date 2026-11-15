import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bin, emit, type SceneObject } from '../types';
import { L } from '../layout';
import { asset, Batch, blob, canvasTex, contactMaterial, rbox, rng, speckle, usePhotoTexture, woodGrain, type V3 } from '../util';

/**
 * 拉远镜头后才看得到的家具，让房间像一间真的办公室：
 * 办公椅（像刚有人起身，斜着推开）、左墙边的边柜和上面的摆设、休闲椅、墙角的落地灯、左墙上走着真实时间的挂钟。
 * 椅子、边柜、挂钟先用代码画一个版本，对应的扫描模型加载成功后替换掉；落地灯一直是代码画的。
 */
export const furniture: SceneObject = ({ scene, camera, renderer, tier, bus }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  let batch = new Batch();
  // 程序画的版本按件分组：对应的扫描模型加载成功后，就把那一组藏起来
  const fallback = { chair: new THREE.Group(), cabinet: new THREE.Group(), clock: new THREE.Group(), rest: new THREE.Group() };
  group.add(fallback.chair, fallback.cabinet, fallback.clock, fallback.rest);
  const flush = (into: THREE.Group) => { batch.build(into, bin, { cast: high, receive: high, noCast: [contact] }); batch = new Batch(); };
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const fy = L.floorY;
  const metal = std({ color: 0x1c1d20, roughness: 0.4, metalness: 0.8 });
  const brass = std({ color: 0xd9a441, roughness: 0.25, metalness: 0.95 });
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);

  // ---- 办公椅：布面坐垫和靠背、气杆、五星脚和脚轮 ----
  const cx = 0.62, cz = 1.42, cr = -0.55;
  const fabric = std({ roughness: 1, map: bin.add(canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3d4852'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(i, 0, 1, h); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, i, w, 1); }
    speckle(g, w, h, 81, 2500, '255,255,255', 0.07);
  }, [3, 3])) });
  // 把椅子自己坐标系里的点转到房间里
  const at = (x: number, y: number, z: number): [number, number, number] => [cx + x * Math.cos(cr) + z * Math.sin(cr), fy + y, cz - x * Math.sin(cr) + z * Math.cos(cr)];
  batch.add(fabric, rbox(0.5, 0.08, 0.48, 0.03, 4), at(0, 0.47, 0), [0, cr, 0]);
  batch.add(fabric, rbox(0.46, 0.52, 0.07, 0.03, 4), at(0, 0.8, 0.25), [0.14, cr, 0]);
  batch.add(metal, rbox(0.05, 0.3, 0.02, 0.008), at(0, 0.56, 0.27), [0.14, cr, 0]);
  batch.add(metal, new THREE.CylinderGeometry(0.025, 0.03, 0.3, 16), at(0, 0.28, 0));
  batch.add(metal, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), at(0, 0.42, 0));
  for (const s of [-1, 1]) { // 扶手
    batch.add(metal, rbox(0.03, 0.2, 0.03, 0.008), at(s * 0.27, 0.56, 0.02), [0, cr, 0]);
    batch.add(metal, rbox(0.06, 0.025, 0.26, 0.01), at(s * 0.27, 0.67, 0), [0, cr, 0]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    batch.add(metal, rbox(0.3, 0.03, 0.045, 0.01), at(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15), [0, cr - a, 0]);
    batch.add(metal, new THREE.SphereGeometry(0.032, 12, 8), at(Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3));
  }
  batch.add(contact, blob(0.42, 0.42), [cx, fy + 0.016, cz]);

  flush(fallback.chair);

  // ---- 左墙边的边柜：胡桃木柜体、细钢脚、三扇门 ----
  const wx = -2.96, wz = 1.3, cw = 0.42, cl = 1.6, chh = 0.56, leg = 0.14;
  const walnut = std({ roughness: 0.45, map: bin.add(canvasTex(512, 256, (g, w, h) => woodGrain(g, 0, 0, w, h, '#7a4a2b', '30,14,6', 82, 150))) });
  usePhotoTexture(bin, walnut, 'walnut_veneer', { rotate: true, color: [0.72, 0.5, 0.36] });
  batch.add(walnut, rbox(cw, chh, cl, 0.008), [wx, fy + leg + chh / 2, wz]);
  for (const dz of [-cl / 6, cl / 6]) batch.add(metal, new THREE.BoxGeometry(0.004, chh - 0.04, 0.004), [wx + cw / 2 + 0.001, fy + leg + chh / 2, wz + dz]); // 门缝
  for (const dz of [-cl / 3, 0, cl / 3]) batch.add(brass, new THREE.SphereGeometry(0.01, 10, 8), [wx + cw / 2 + 0.008, fy + leg + chh / 2, wz + dz + 0.2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(metal, new THREE.CylinderGeometry(0.012, 0.009, leg, 10), [wx + sx * (cw / 2 - 0.04), fy + leg / 2, wz + sz * (cl / 2 - 0.06)]);
  batch.add(contact, blob(0.36, 0.95), [wx, fy + 0.016, wz]);
  const topY = fy + leg + chh;
  // 台灯：铜底座 + 亚麻灯罩
  const shade = std({ color: 0xf2e9d8, roughness: 1, side: THREE.DoubleSide, emissive: 0x6b5236, emissiveIntensity: 0.25 });
  batch.add(brass, new THREE.CylinderGeometry(0.055, 0.065, 0.02, 24), [wx, topY + 0.01, wz - 0.5]);
  batch.add(brass, new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), [wx, topY + 0.16, wz - 0.5]);
  batch.add(shade, new THREE.CylinderGeometry(0.09, 0.13, 0.16, 28, 1, true), [wx, topY + 0.34, wz - 0.5]);
  // 两个靠墙的画框：抽象的海和日出色块
  const art = (seed: number, sky: string, sea: string) => std({ roughness: 0.9, bumpScale: 0, map: bin.add(canvasTex(256, 320, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = sky; g.fillRect(28, 28, w - 56, h * 0.5);
    g.fillStyle = sea; g.fillRect(28, 28 + h * 0.5, w - 56, h * 0.5 - 56);
    g.fillStyle = '#f2b36a'; g.beginPath(); g.arc(w * (0.35 + r() * 0.3), 28 + h * 0.5, 30 + r() * 14, Math.PI, 0); g.fill();
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.2})`; g.fillRect(40 + r() * 120, 40 + h * 0.5 + r() * (h * 0.4 - 60), 30 + r() * 60, 2); }
  })) });
  const frameWood = std({ color: 0x2a211b, roughness: 0.5 });
  const frame = (dz: number, w: number, h: number, mat: THREE.Material) => {
    batch.add(frameWood, rbox(0.02, h, w, 0.004), [wx - 0.12, topY + h / 2, wz + dz], [0, 0, 0.12]);
    batch.add(mat, new THREE.PlaneGeometry(w - 0.03, h - 0.03).rotateY(Math.PI / 2), [wx - 0.109, topY + h / 2, wz + dz], [0, 0, 0.12]);
  };
  frame(0.05, 0.3, 0.38, art(83, '#e9b9a2', '#3f6f86'));
  frame(0.4, 0.22, 0.28, art(84, '#c9d3ea', '#2f5566'));
  // 一小摞书
  [[0x8f3a2c, 0.2, 0.15], [0x2f5d73, 0.19, 0.14], [0xd9b36a, 0.17, 0.12]].forEach(([c, l, w], i) =>
    batch.add(std({ color: c, roughness: 0.7 }), rbox(w, 0.028, l, 0.003), [wx + 0.04, topY + 0.014 + i * 0.029, wz + 0.62], [0, 0.1 + i * 0.25, 0]));

  flush(fallback.cabinet);

  // ---- 窗边墙角的落地灯：弧形灯杆 + 半球灯罩 ----
  const lx = -2.7, lz = -0.7;
  batch.add(metal, new THREE.CylinderGeometry(0.16, 0.17, 0.025, 28), [lx, fy + 0.0125, lz]);
  batch.add(metal, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(lx, fy + 0.02, lz), new THREE.Vector3(lx, fy + 1.4, lz), new THREE.Vector3(lx + 0.15, fy + 1.85, lz + 0.1), new THREE.Vector3(lx + 0.5, fy + 1.95, lz + 0.35),
  ]), 30, 0.012, 10));
  batch.add(std({ color: 0x1c1d20, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }), new THREE.SphereGeometry(0.14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), [lx + 0.5, fy + 1.86, lz + 0.35]);
  batch.add(contact, blob(0.24, 0.24), [lx, fy + 0.016, lz]);

  flush(fallback.rest);

  // ---- 左墙上的挂钟：走的是访客电脑上的真实时间 ----
  const kx = -3.19, ky = 1.55, kz = 2.3;
  const face = std({ roughness: 0.6, bumpScale: 0, map: bin.add(canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#f6f2e8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill();
    g.strokeStyle = '#2a2622'; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = i % 3 ? 104 : 94;
      g.lineWidth = i % 3 ? 3 : 6; g.beginPath(); g.moveTo(w / 2 + Math.sin(a) * r0, w / 2 - Math.cos(a) * r0); g.lineTo(w / 2 + Math.sin(a) * 114, w / 2 - Math.cos(a) * 114); g.stroke();
    }
  })) });
  batch.add(frameWood, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 48), [kx + 0.015, ky, kz], [0, 0, Math.PI / 2]);
  batch.add(face, new THREE.CircleGeometry(0.185, 48).rotateY(Math.PI / 2), [kx + 0.031, ky, kz]);
  flush(fallback.clock);
  // 指针：绕钟面中心转（钟面朝 +x）
  const hand = (len: number, w: number, color: number, x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(kx + x, ky, kz);
    const m = new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.003, len, w).translate(0, len / 2 - 0.02, 0)), bin.add(new THREE.MeshStandardMaterial({ color, roughness: 0.5 })));
    pivot.add(m); fallback.clock.add(pivot);
    return pivot;
  };
  const hour = hand(0.1, 0.012, 0x2a2622, 0.034), minute = hand(0.15, 0.008, 0x2a2622, 0.037), second = hand(0.16, 0.003, 0xb3261e, 0.04);

  // ---- 扫描级的真实模型（Poly Haven，CC0）：异步加载，成功后替换上面对应的程序版本 ----
  let stopped = false;
  const models: THREE.Object3D[] = [];
  const loader = new GLTFLoader();
  const useModel = (name: string, o: { pos: V3; rotY?: number; scale?: number; drop?: string[]; replaces?: THREE.Group; shadow?: [number, number]; then?: (m: THREE.Object3D) => void }) => {
    loader.loadAsync(asset(`models/${name}/${name}.gltf`)).then(async (gltf) => {
      if (stopped) return;
      const model = gltf.scene;
      for (const n of o.drop ?? []) model.getObjectByName(n)?.removeFromParent();
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
      if (o.replaces) o.replaces.visible = false;
      models.push(model);
      o.then?.(model);
      emit(bus, 'scene:changed');
    }).catch((e) => console.warn(`[scene] 模型 ${name} 加载失败，继续用程序版本`, e));
  };
  const cabScale = 0.8, cabTop = fy + 0.68 * cabScale, cabX = -3.19 + 0.27 * cabScale;
  useModel('modern_arm_chair_01', { pos: [cx, fy, cz], rotY: Math.PI + cr, replaces: fallback.chair, shadow: [0.45, 0.5] });
  // 边柜靠左墙，正面朝屋里；上面摆花瓶、两个相框和一盏台灯
  useModel('modern_wooden_cabinet', { pos: [cabX, fy, wz], rotY: Math.PI / 2, scale: cabScale, drop: ['modern_wooden_cabinet_path_l', 'modern_wooden_cabinet_path_r'], replaces: fallback.cabinet, shadow: [1.05, 0.3] });
  useModel('ceramic_vase_01', { pos: [cabX, cabTop, wz + 0.62], scale: 0.8 });
  useModel('standing_picture_frame_01', { pos: [cabX - 0.05, cabTop, wz + 0.12], rotY: -Math.PI / 2 + 0.2 });
  useModel('standing_picture_frame_02', { pos: [cabX - 0.03, cabTop, wz - 0.16], rotY: -Math.PI / 2 - 0.25 });
  useModel('desk_lamp_arm_01', { pos: [cabX, cabTop + 0.07, wz - 0.62], rotY: Math.PI / 2 + 0.5, scale: 0.8 });
  useModel('hanging_picture_frame_01', { pos: [-3.175, 1.3, wz], rotY: -Math.PI / 2, scale: 0.9 });
  // 右后方的休闲椅，斜对着书桌
  useModel('mid_century_lounge_chair', { pos: [2.45, fy, 2.7], rotY: Math.PI + 0.9, shadow: [0.55, 0.6] });
  // 挂钟：三根指针是独立的节点，接着走真实时间。模型里指针摆在 10:10:28，先记下各自的初始角度
  const hands: { node: THREE.Object3D; base: number; turns: (d: { h: number; m: number; s: number }) => number }[] = [];
  useModel('wall_clock', {
    pos: [-3.199, ky, kz], rotY: Math.PI / 2, scale: 1.25, replaces: fallback.clock,
    then(m) {
      const reg = (n: string, base: number, turns: (d: { h: number; m: number; s: number }) => number) => { const node = m.getObjectByName(n); if (node) hands.push({ node, base, turns }); };
      reg('wall_clock_hours_hand', -0.951, (d) => d.h / 12);
      reg('wall_clock_minute_hand', 1.002, (d) => d.m / 60);
      reg('wall_clock_second_hand', 2.99, (d) => d.s / 60);
    },
  });

  scene.add(group);
  return {
    frame() {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      // 钟面朝 +x：从房间里看，顺时针是绕 x 轴的负方向
      hour.rotation.x = -(h / 12) * Math.PI * 2; minute.rotation.x = -(m / 60) * Math.PI * 2; second.rotation.x = -(s / 60) * Math.PI * 2;
      // 模型的钟面朝自己的 +z：从正面看顺时针 = 绕 z 轴负方向。base 是指针在模型里的初始角度（从 12 点起顺时针）
      for (const k of hands) k.node.rotation.z = -(k.turns({ h, m, s }) * Math.PI * 2 - k.base);
    },
    stop() {
      stopped = true;
      for (const m of models) m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) t?.dispose();
        mat.dispose();
      });
      scene.remove(group); bin.dispose();
    },
  };
};
