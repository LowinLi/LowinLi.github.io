import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { playTrack } from '../music';
import { Batch, blob, canvasTex, contactMaterial, rbox, speckle, woodGrain } from '../util';

const SERIF = '"Songti SC","Noto Serif CJK SC","SimSun",serif';

/** 喇叭口：旋转成型，沿圆周加上花瓣状的凹槽，口沿外翻 */
function hornGeo(len: number, r0: number, r1: number, petals: number) {
  const segT = 30, segA = 80, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segT; i++) {
    const t = i / segT;
    const base = r0 + (r1 - r0) * Math.pow(t, 2.3) + Math.pow(Math.max(t - 0.9, 0) / 0.1, 2) * 0.014;
    for (let j = 0; j <= segA; j++) {
      const a = (j / segA) * Math.PI * 2;
      const rad = base * (1 + 0.075 * Math.pow(t, 1.4) * Math.cos(petals * a));
      pos.push(Math.cos(a) * rad, t * len, Math.sin(a) * rad);
      uv.push(j / segA, t);
    }
  }
  for (let i = 0; i < segT; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + 1, c = a + segA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 唱片贴图：一圈圈的音槽、两道反光、带曲名的标签 */
function discTexture(title: string, note: string, color: string) {
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, w, w);
    for (let r = 96; r < 250; r += 1.6) {
      g.strokeStyle = `rgba(255,255,255,${0.03 + (Math.sin(r * 0.9) * 0.5 + 0.5) * 0.07})`; g.lineWidth = 0.8;
      g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke();
    }
    for (const r of [128, 172, 214]) { g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); } // 曲目间隔
    if (g.createConicGradient) {
      const cg = g.createConicGradient(0.6, c, c);
      for (const [s, a] of [[0, 0], [0.06, 0.2], [0.12, 0], [0.5, 0], [0.56, 0.2], [0.62, 0], [1, 0]]) cg.addColorStop(s, `rgba(255,240,220,${a})`);
      g.fillStyle = cg; g.beginPath(); g.arc(c, c, 250, 0, 7); g.arc(c, c, 96, 0, 7, true); g.fill();
    }
    g.fillStyle = color; g.beginPath(); g.arc(c, c, 92, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 84, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 40px ${SERIF}`; g.fillText(title, c, c - 36);
    g.font = `15px ${SERIF}`; g.fillText(note, c, c + 34); g.fillText('33⅓ RPM', c, c + 56);
    g.fillStyle = '#0c0c0e'; g.beginPath(); g.arc(c, c, 9, 0, 7); g.fill();
  });
}

/**
 * 留声机和几张唱片。点一张唱片 → 它飞到转盘上开始转，唱臂搭上去，喇叭里飘出音符，音乐开始。
 * 再点这张唱片或留声机 → 停止。
 * 监听 disc:play {id} / disc:stop；发出 music:state {id, title} 或 null。
 */
export const gramophone: SceneObject = ({ scene, tier, data, bus, pick, audio }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  // 有贴图的材质默认把同一张图当凹凸图，让木纹、布纹、叶脉有起伏
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const g = L.gramophone;
  const body = new THREE.Group();
  body.position.set(g.x, 0, g.z);
  group.add(body);

  const walnut = std({ roughness: 0.38, map: bin.add(canvasTex(512, 256, (c, w, h) => woodGrain(c, 0, 0, w, h, '#6a3c22', '25,10,4', 41, 150))) });
  const darkWood = std({ color: 0x3a2012, roughness: 0.4 });
  const brass = std({ color: 0xdba63f, roughness: 0.2, metalness: 1, side: THREE.DoubleSide });
  const felt = std({ color: 0x5a1f1c, roughness: 1 });
  const batch = new Batch();

  // 木箱：底座、箱体、上沿、四只铜脚、正面铭牌
  batch.add(darkWood, rbox(0.39, 0.022, 0.39, 0.006), [0, 0.019, 0]);
  batch.add(walnut, rbox(0.35, 0.1, 0.35, 0.006), [0, 0.078, 0]);
  batch.add(darkWood, rbox(0.375, 0.014, 0.375, 0.005), [0, 0.133, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(brass, new THREE.SphereGeometry(0.014, 12, 8), [sx * 0.165, 0.008, sz * 0.165], [0, 0, 0], [1, 0.6, 1]);
  batch.add(brass, rbox(0.09, 0.03, 0.003, 0.002), [0, 0.08, 0.176]);
  for (const sx of [-1, 1]) batch.add(brass, new THREE.SphereGeometry(0.0025, 8, 6), [sx * 0.038, 0.08, 0.178]);
  // 转盘：铜边 + 绒面 + 主轴
  const pc: [number, number] = [-0.02, 0.02], py = 0.14;
  batch.add(brass, new THREE.CylinderGeometry(0.128, 0.128, 0.012, 56), [pc[0], py + 0.006, pc[1]]);
  batch.add(felt, new THREE.CylinderGeometry(0.122, 0.122, 0.002, 56), [pc[0], py + 0.013, pc[1]]);
  batch.add(brass, new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 12), [pc[0], py + 0.024, pc[1]]);
  // 喇叭的弯管和托架
  const throat = new THREE.Vector3(0.02, 0.42, -0.06);
  const neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.135, 0.14, -0.135), new THREE.Vector3(0.135, 0.27, -0.14), new THREE.Vector3(0.1, 0.36, -0.115), throat,
  ]);
  batch.add(brass, new THREE.TubeGeometry(neck, 28, 0.015, 14));
  batch.add(brass, new THREE.CylinderGeometry(0.024, 0.028, 0.02, 20), [0.135, 0.15, -0.135]);
  batch.add(brass, new THREE.TorusGeometry(0.017, 0.004, 8, 20), [0.135, 0.24, -0.139], [Math.PI / 2, 0, 0]);
  // 摇柄
  batch.add(brass, new THREE.CylinderGeometry(0.006, 0.006, 0.06, 10), [0.2, 0.075, 0.04], [0, 0, Math.PI / 2]);
  batch.add(brass, new THREE.CylinderGeometry(0.005, 0.005, 0.07, 10), [0.228, 0.045, 0.04]);
  batch.add(darkWood, new THREE.CylinderGeometry(0.011, 0.009, 0.04, 14), [0.25, 0.012, 0.04], [0, 0, Math.PI / 2]);
  batch.add(brass, new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), [0.176, 0.075, 0.04], [0, 0, Math.PI / 2]);
  batch.build(body, bin, { cast: high, receive: high });

  // 喇叭口（单独一个网格，播放时轻微脉动）
  const horn = new THREE.Mesh(bin.add(hornGeo(0.33, 0.015, 0.2, 10)), brass);
  horn.castShadow = high;
  horn.position.copy(throat);
  horn.rotation.set(0.98, 0, 0.5); // 朝前上方、略偏左
  body.add(horn);

  // 唱臂：绕立柱转动，播放时搭到唱片上
  const arm = new THREE.Group();
  arm.position.set(0.135, py, -0.135 + 0.0);
  const armBatch = new Batch();
  armBatch.add(brass, new THREE.CylinderGeometry(0.009, 0.011, 0.04, 14), [0.0, 0.02, 0.0]);
  armBatch.add(brass, new THREE.CylinderGeometry(0.0045, 0.0035, 0.16, 10), [0, 0.036, 0.062], [Math.PI / 2 + 0.1, 0, 0]);
  armBatch.add(brass, new THREE.CylinderGeometry(0.011, 0.011, 0.02, 14), [0, 0.046, -0.026], [Math.PI / 2, 0, 0]);
  armBatch.add(brass, new THREE.CylinderGeometry(0.02, 0.02, 0.01, 24), [0, 0.03, 0.148], [0, 0, Math.PI / 2]);
  armBatch.add(std({ color: 0x1a1a1c, roughness: 0.5 }), new THREE.ConeGeometry(0.002, 0.018, 6), [0, 0.012, 0.15], [Math.PI, 0, 0]);
  armBatch.build(arm, bin, { cast: high });
  body.add(arm);
  const ARM_REST = 0.12, ARM_PLAY = -0.69;
  arm.rotation.y = ARM_REST;

  // 唱片和纸套
  const discGeo = bin.add(new THREE.CylinderGeometry(0.105, 0.105, 0.003, 64));
  const platter = new THREE.Vector3(g.x + pc[0], py + 0.016, g.z + pc[1]);
  type Disc = { id: string; title: string; root: THREE.Group; home: THREE.Vector3; homeRy: number; hover: boolean };
  let current: Disc | null = null;
  const discs: Disc[] = data.tracks.map((t, i) => {
    const mat = std({ map: bin.add(discTexture(t.title, t.note, t.color)), roughness: 0.3, metalness: 0.25 });
    const d = new THREE.Mesh(discGeo, mat);
    d.castShadow = high;
    const root = new THREE.Group();
    root.add(d);
    const home = new THREE.Vector3(L.discs.x + i * 0.125, 0.0075 + i * 0.0035, L.discs.z + (i % 2) * 0.05);
    root.position.copy(home);
    group.add(root);
    const disc: Disc = { id: t.id, title: t.title, root, home, homeRy: 0.4 + i * 0.9, hover: false };
    pick(root, { hover(v) { disc.hover = v; }, click() { emit(bus, current === disc ? 'disc:stop' : 'disc:play', { id: t.id }); } });
    return disc;
  });
  const props = new Batch();
  const kraft = std({ roughness: 0.95, map: bin.add(canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#c9a877'; c.fillRect(0, 0, w, h); speckle(c, w, h, 51, 4000, '90,60,20', 0.14);
    c.fillStyle = '#1b1b1d'; c.beginPath(); c.arc(w / 2, h / 2, 46, 0, 7); c.fill();
    c.strokeStyle = 'rgba(70,45,15,.6)'; c.lineWidth = 2; c.strokeRect(14, 14, w - 28, h - 28);
  })) });
  props.add(kraft, rbox(0.225, 0.0025, 0.225, 0.001), [L.discs.x + 0.02, 0.0013, L.discs.z + 0.01], [0, 0.18, 0]);
  props.add(kraft, rbox(0.225, 0.0025, 0.225, 0.001), [L.discs.x + 0.2, 0.0039, L.discs.z + 0.035], [0, -0.3, 0]);
  const contact = contactMaterial(bin, high ? 0.32 : 0.55);
  props.add(contact, blob(0.27, 0.27), [g.x, 0.0007, g.z]);
  props.add(contact, blob(0.26, 0.17), [L.discs.x + 0.12, 0.0006, L.discs.z + 0.02]);
  props.build(group, bin, { cast: high, receive: high, noCast: [contact] });
  pick(body, { click() { if (current) emit(bus, 'disc:stop'); } });

  // 喇叭口飘出的音符
  const noteTex = bin.add(canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.font = '52px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', 32, 34); }));
  const notes = Array.from({ length: high ? 6 : 3 }, (_, i) => {
    const mat = bin.add(new THREE.SpriteMaterial({ map: noteTex, color: 0x6a3a1c, transparent: true, opacity: 0, depthWrite: false }));
    const s = new THREE.Sprite(mat); s.scale.setScalar(0.07); group.add(s);
    return { s, mat, life: i / 6, seed: i * 2.1 };
  });
  const mouth = new THREE.Vector3(g.x - 0.1, 0.62, g.z + 0.14);

  scene.add(group);

  let stopMusic: (() => void) | null = null;
  let spinning = false;
  const halt = () => { stopMusic?.(); stopMusic = null; spinning = false; };
  const off = [
    on<{ id: string }>(bus, 'disc:play', ({ id }) => {
      const d = discs.find((x) => x.id === id); if (!d || d === current) return;
      halt();
      current = d;
      audio(); // 在点击手势里先把 AudioContext 建好
    }),
    on(bus, 'disc:stop', () => { if (!current) return; halt(); current = null; emit(bus, 'music:state', null); }),
  ];

  const target = new THREE.Vector3();
  return {
    frame(dt, t) {
      for (const d of discs) {
        const playing = d === current;
        target.copy(playing ? platter : d.home);
        if (!playing && d.hover) target.y += 0.02;
        const far = Math.hypot(d.root.position.x - target.x, d.root.position.z - target.z);
        target.y += Math.min(0.24, far * 0.9); // 离得远时抬高，飞出一条弧线
        d.root.position.set(damp(d.root.position.x, target.x, 5, dt), damp(d.root.position.y, target.y, 7, dt), damp(d.root.position.z, target.z, 5, dt));
        if (playing && !spinning && far < 0.01) {
          spinning = true;
          stopMusic = playTrack(audio(), d.id);
          emit(bus, 'music:state', { id: d.id, title: d.title });
        }
        if (playing && spinning) d.root.rotation.y -= dt * 3.5; // 33 转
        else d.root.rotation.y = damp(d.root.rotation.y % (Math.PI * 2), d.homeRy, 4, dt);
      }
      arm.rotation.y = damp(arm.rotation.y, spinning ? ARM_PLAY + Math.sin(t * 3.5) * 0.004 : ARM_REST, 3, dt);
      horn.scale.setScalar(spinning ? 1 + Math.sin(t * 9) * 0.01 : 1);
      for (const n of notes) {
        n.life += dt * 0.28;
        if (n.life > 1) { n.life = 0; n.seed += 1.3; }
        const k = n.life;
        n.s.position.set(mouth.x + Math.sin(n.seed + k * 5) * 0.06 - k * 0.12, mouth.y + k * 0.42, mouth.z + Math.cos(n.seed * 2) * 0.05);
        n.mat.opacity = spinning ? Math.sin(k * Math.PI) * 0.9 : damp(n.mat.opacity, 0, 6, dt);
        n.mat.rotation = Math.sin(n.seed + k * 4) * 0.4;
      }
    },
    stop() { halt(); off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
