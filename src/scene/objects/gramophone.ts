import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { playTrack } from '../music';

/**
 * 留声机和几张唱片。点一张唱片 → 它飞到转盘上开始转，喇叭里飘出音符，音乐开始。
 * 再点这张唱片或留声机 → 停止。
 * 监听 disc:play {id} / disc:stop；发出 music:state {id, title} 或 null。
 */
export const gramophone: SceneObject = ({ scene, tier, data, bus, pick, audio }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const g = L.gramophone;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(bin.add(geo), mat);
    mesh.castShadow = mesh.receiveShadow = high;
    parent.add(mesh); return mesh;
  };
  const wood = bin.add(new THREE.MeshStandardMaterial({ color: 0x5b3420, roughness: 0.45 }));
  const brass = bin.add(new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.22, metalness: 0.95, side: THREE.DoubleSide }));
  const felt = bin.add(new THREE.MeshStandardMaterial({ color: 0x23201f, roughness: 0.9 }));

  const body = new THREE.Group();
  body.position.set(g.x, 0, g.z);
  group.add(body);
  add(new THREE.BoxGeometry(0.34, 0.12, 0.34), wood, body).position.y = 0.06;
  add(new THREE.BoxGeometry(0.36, 0.012, 0.36), wood, body).position.y = 0.126;
  const platterY = 0.14;
  add(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 40), felt, body).position.set(-0.02, platterY - 0.004, 0.02);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 12), brass, body).position.set(-0.02, platterY + 0.008, 0.02);
  // 喇叭：一段弯管 + 旋转成型的喇叭口
  const neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.13, 0.13, -0.13), new THREE.Vector3(0.13, 0.26, -0.14),
    new THREE.Vector3(0.09, 0.34, -0.1), new THREE.Vector3(0.03, 0.39, -0.03),
  ]);
  add(new THREE.TubeGeometry(neck, 20, 0.014, 10), brass, body);
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; profile.push(new THREE.Vector2(0.014 + 0.2 * Math.pow(t, 2.4), t * 0.3)); }
  const horn = add(new THREE.LatheGeometry(profile, 36), brass, body);
  horn.position.set(0.03, 0.39, -0.03);
  horn.rotation.set(0.95, 0, 0.55); // 喇叭口朝前上方、略偏左
  // 唱臂
  const arm = add(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 8), brass, body);
  arm.rotation.z = Math.PI / 2; arm.rotation.y = -0.5; arm.position.set(0.06, platterY + 0.03, -0.06);
  // 摇柄
  const crank = add(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8), brass, body);
  crank.rotation.z = Math.PI / 2; crank.position.set(0.21, 0.07, 0.05);

  // 唱片
  const vinyl = bin.add(new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.28, metalness: 0.3 }));
  const discGeo = bin.add(new THREE.CylinderGeometry(0.105, 0.105, 0.004, 48));
  const labelGeo = bin.add(new THREE.CylinderGeometry(0.04, 0.04, 0.0046, 32));
  const ringGeo = bin.add(new THREE.RingGeometry(0.05, 0.1, 48, 1));
  const ringMat = bin.add(new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.5 }));
  const platter = new THREE.Vector3(g.x - 0.02, platterY + 0.006, g.z + 0.02);
  type Disc = { id: string; title: string; root: THREE.Group; home: THREE.Vector3; homeRy: number; hover: boolean };
  const discs: Disc[] = data.tracks.map((t, i) => {
    const root = new THREE.Group();
    const d = new THREE.Mesh(discGeo, vinyl); d.castShadow = high;
    const label = new THREE.Mesh(labelGeo, bin.add(new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 })));
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0024;
    const dot = new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.02, 0.0048, 0.006)), bin.add(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })));
    dot.position.set(0.02, 0, 0); // 标签上的白条，转起来才看得出在转
    root.add(d, label, ring, dot);
    const home = new THREE.Vector3(L.discs.x + i * 0.13, 0.003 + i * 0.0045, L.discs.z + (i % 2) * 0.05);
    root.position.copy(home);
    group.add(root);
    const disc: Disc = { id: t.id, title: t.title, root, home, homeRy: i * 0.7, hover: false };
    pick(root, { hover(v) { disc.hover = v; }, click() { emit(bus, current === disc ? 'disc:stop' : 'disc:play', { id: t.id }); } });
    return disc;
  });
  pick(body, { click() { if (current) emit(bus, 'disc:stop'); } });

  // 喇叭口飘出的音符
  const noteCanvas = document.createElement('canvas'); noteCanvas.width = noteCanvas.height = 64;
  const nc = noteCanvas.getContext('2d')!;
  nc.fillStyle = '#fff'; nc.font = '52px serif'; nc.textAlign = 'center'; nc.textBaseline = 'middle'; nc.fillText('♪', 32, 34);
  const noteTex = bin.add(new THREE.CanvasTexture(noteCanvas));
  const notes = Array.from({ length: tier === 'high' ? 6 : 3 }, (_, i) => {
    const mat = bin.add(new THREE.SpriteMaterial({ map: noteTex, color: 0x6a3a1c, transparent: true, opacity: 0, depthWrite: false }));
    const s = new THREE.Sprite(mat); s.scale.setScalar(0.075); group.add(s);
    return { s, mat, life: i / 6, seed: Math.random() * 6 };
  });
  const mouth = new THREE.Vector3(g.x - 0.08, 0.6, g.z + 0.12);

  scene.add(group);

  let current: Disc | null = null;
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
        // 离目标远的时候抬高，飞出一条弧线
        const far = Math.hypot(d.root.position.x - target.x, d.root.position.z - target.z);
        target.y += Math.min(0.22, far * 0.9);
        d.root.position.set(damp(d.root.position.x, target.x, 5, dt), damp(d.root.position.y, target.y, 7, dt), damp(d.root.position.z, target.z, 5, dt));
        if (playing && !spinning && far < 0.01) {
          spinning = true;
          stopMusic = playTrack(audio(), d.id);
          emit(bus, 'music:state', { id: d.id, title: d.title });
        }
        if (playing && spinning) d.root.rotation.y -= dt * 3.5; // 33 转
        else d.root.rotation.y = damp(d.root.rotation.y % (Math.PI * 2), d.homeRy, 4, dt);
      }
      const pulse = spinning ? 1 + Math.sin(t * 9) * 0.012 : 1;
      horn.scale.setScalar(pulse);
      for (const n of notes) {
        n.life += dt * 0.28;
        if (n.life > 1) { n.life = 0; n.seed = Math.random() * 6; }
        const k = n.life;
        n.s.position.set(mouth.x + Math.sin(n.seed + k * 5) * 0.06 - k * 0.12, mouth.y + k * 0.42, mouth.z + Math.cos(n.seed * 2) * 0.05);
        n.mat.opacity = spinning ? Math.sin(k * Math.PI) * 0.9 : damp(n.mat.opacity, 0, 6, dt);
        n.mat.rotation = Math.sin(n.seed + k * 4) * 0.4;
      }
    },
    stop() { halt(); off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
