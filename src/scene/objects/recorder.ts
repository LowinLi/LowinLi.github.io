import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { playTrack } from '../music';
import { Batch, blob, canvasTex, contactMaterial, rbox, speckle } from '../util';

const SERIF = '"Songti SC","Noto Serif CJK SC","SimSun",serif';
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/** 磁带正面的贴图：标签纸（曲名）、中间的小窗和两个带轴孔、底部的梯形缺口 */
function tapeTexture(title: string, note: string, color: string) {
  return canvasTex(512, 328, (g, w, h) => {
    g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 61, 1500, '255,255,255', 0.05);
    g.fillStyle = '#f1ead8'; g.beginPath(); g.roundRect(30, 26, w - 60, 196, 10); g.fill();          // 标签纸
    g.fillStyle = color; g.fillRect(30, 26, w - 60, 46);
    g.fillStyle = '#fff'; g.font = `bold 30px ${SERIF}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(title, 46, 50);
    g.font = `18px ${SANS}`; g.textAlign = 'right'; g.fillText('A 面 · C-60', w - 46, 51);
    g.strokeStyle = 'rgba(60,50,40,.35)'; g.lineWidth = 1.5;
    for (const y of [92, 112]) { g.beginPath(); g.moveTo(46, y); g.lineTo(w - 46, y); g.stroke(); }
    g.fillStyle = '#3a3026'; g.font = `17px ${SANS}`; g.textAlign = 'left'; g.fillText(note, 48, 82);
    g.fillStyle = '#17181a'; g.beginPath(); g.roundRect(120, 124, w - 240, 84, 12); g.fill();          // 小窗
    for (const x of [w / 2 - 66, w / 2 + 66]) { g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(x, 166, 30, 0, 7); g.fill(); }
    g.fillStyle = '#4a3a2c'; g.fillRect(w / 2 - 34, 140, 68, 52);                                      // 窗里看得到的一卷带子
    g.fillStyle = '#1c1d20'; g.beginPath(); g.moveTo(96, h); g.lineTo(126, 250); g.lineTo(w - 126, 250); g.lineTo(w - 96, h); g.closePath(); g.fill();
    for (const x of [150, 210, w - 210, w - 150]) { g.fillStyle = '#0a0a0b'; g.beginPath(); g.arc(x, 290, 9, 0, 7); g.fill(); }
    for (const [x, y] of [[18, 16], [w - 18, 16], [18, h - 16], [w - 18, h - 16]]) { g.fillStyle = '#8a8c90'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  });
}

/**
 * 老式卡带录音机和三盘磁带。点一盘磁带 → 它立起来飞进卡带仓，两个带轴开始转，放音键按下去，喇叭里飘出音符，音乐开始。
 * 再点这盘磁带或录音机 → 停止，磁带回到桌上。
 * 监听 disc:play {id} / disc:stop（事件名沿用留声机时代的，HTML 层不用改）；发出 music:state {id, title} 或 null。
 */
export const recorder: SceneObject = ({ scene, tier, data, bus, pick, audio }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const g = L.recorder, W = 0.4, H = 0.2, D = 0.1, y0 = 0.008;
  const body = new THREE.Group();
  body.position.set(g.x, 0, g.z);
  group.add(body);
  const batch = new Batch();

  const shell = std({ color: 0xb4b7bb, roughness: 0.38, metalness: 0.7 });
  const black = std({ color: 0x17181a, roughness: 0.55 });
  const chrome = std({ color: 0xe2e4e6, roughness: 0.18, metalness: 1 });
  // 机身：银色外壳 + 黑色前面板 + 四只脚
  batch.add(shell, rbox(W, H, D, 0.012), [0, y0 + H / 2, 0]);
  batch.add(black, rbox(W - 0.016, H - 0.05, 0.004, 0.004), [0, y0 + H / 2 - 0.017, D / 2 + 0.001]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(black, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 10), [sx * (W / 2 - 0.03), 0.004, sz * (D / 2 - 0.02)]);
  // 喇叭：网罩（一圈圈小孔）+ 镀铬的边
  const sx0 = -W * 0.22, sy = y0 + H / 2 - 0.017, R = 0.068;
  const grille = std({ roughness: 0.6, metalness: 0.4, map: bin.add(canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#5a5d62'; c.fillRect(0, 0, w, w);
    for (let y = 6; y < w; y += 9) for (let x = (y / 9) % 2 ? 6 : 10.5; x < w; x += 9) { c.fillStyle = '#050506'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); }
  })) });
  batch.add(grille, new THREE.CircleGeometry(R, 40), [sx0, sy, D / 2 + 0.0035]);
  batch.add(chrome, new THREE.TorusGeometry(R, 0.004, 8, 40), [sx0, sy, D / 2 + 0.004]);
  // 顶上的调频刻度条和品牌字
  const dial = std({ roughness: 0.4, bumpScale: 0, map: bin.add(canvasTex(512, 64, (c, w, h) => {
    c.fillStyle = '#e9e4d6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#26221c'; c.font = `bold 15px ${SANS}`; c.textBaseline = 'middle';
    c.fillText('FM', 10, 18); c.fillText('AM', 10, 46);
    for (let i = 0; i <= 40; i++) { const x = 50 + i * 10.4; c.fillRect(x, i % 5 ? 26 : 22, 1.5, i % 5 ? 12 : 20); }
    c.font = `12px ${SANS}`; c.textAlign = 'center';
    [88, 92, 96, 100, 104, 108].forEach((v, i) => c.fillText(String(v), 50 + i * 83, 12));
    [53, 70, 90, 120, 140, 160].forEach((v, i) => c.fillText(String(v), 50 + i * 83, 54));
    c.fillStyle = '#c8281e'; c.fillRect(300, 4, 2.5, h - 8); // 指针
  })) });
  batch.add(dial, new THREE.PlaneGeometry(W - 0.07, 0.026), [0, y0 + H - 0.02, D / 2 + 0.0012]);
  const badge = std({ roughness: 0.3, metalness: 0.8, bumpScale: 0, map: bin.add(canvasTex(256, 48, (c, w, h) => {
    c.fillStyle = '#c9ccd0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1c1f'; c.font = `bold 26px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('晨光 · 收录机', w / 2, h / 2 + 1);
  })) });
  batch.add(badge, new THREE.PlaneGeometry(0.1, 0.019), [W * 0.22, y0 + 0.026, D / 2 + 0.0036]);
  // 卡带仓：一个凹进去的黑框，磁带立在里面
  const doorX = W * 0.22, doorY = y0 + H / 2 - 0.002, TW = 0.104, TH = 0.066;
  batch.add(std({ color: 0x0b0b0c, roughness: 0.8 }), new THREE.PlaneGeometry(TW + 0.014, TH + 0.014), [doorX, doorY, D / 2 + 0.0034]);
  for (const [w2, h2, dx, dy] of [[TW + 0.026, 0.006, 0, TH / 2 + 0.01], [TW + 0.026, 0.006, 0, -TH / 2 - 0.01], [0.006, TH + 0.026, TW / 2 + 0.01, 0], [0.006, TH + 0.026, -TW / 2 - 0.01, 0]]) batch.add(chrome, new THREE.BoxGeometry(w2, h2, 0.012), [doorX + dx, doorY + dy, D / 2 + 0.007]);
  // 两只旋钮（音量、调台）
  for (const [dx, dy] of [[-0.01, 0.066], [0.03, 0.066]]) batch.add(chrome, new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), [doorX + dx + 0.105, y0 + H - 0.02, D / 2 + 0.006 - dy * 0], [Math.PI / 2, 0, 0]);
  // 提手和天线
  const handle = new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2 + 0.03, y0 + H - 0.01, -0.02), new THREE.Vector3(-W / 2 + 0.03, y0 + H + 0.05, -0.03), new THREE.Vector3(W / 2 - 0.03, y0 + H + 0.05, -0.03), new THREE.Vector3(W / 2 - 0.03, y0 + H - 0.01, -0.02)], false, 'catmullrom', 0.05);
  batch.add(black, new THREE.TubeGeometry(handle, 24, 0.007, 8));
  batch.add(chrome, new THREE.CylinderGeometry(0.0025, 0.004, 0.34, 6), [-W / 2 + 0.06 + 0.1, y0 + H + 0.13, -D / 2 + 0.012], [0, 0, -0.62]);
  batch.add(chrome, new THREE.SphereGeometry(0.005, 8, 6), [-W / 2 + 0.06 + 0.2, y0 + H + 0.268, -D / 2 + 0.012]);
  batch.add(contactMaterial(bin, high ? 0.32 : 0.55), blob(0.26, 0.11), [0, 0.0007, 0.01]);
  batch.build(body, bin, { cast: high, receive: high });

  // 顶上一排琴键式的按键：录音（红）、放音、快退、快进、停止、暂停。放音键在播放时按下去
  const keyGeo = bin.add(rbox(0.03, 0.012, 0.03, 0.003, 1));
  const keys = [0xb3261e, 0xd8dadd, 0xd8dadd, 0xd8dadd, 0xd8dadd, 0x2a2b2e].map((c, i) => {
    const m = new THREE.Mesh(keyGeo, std({ color: c, roughness: 0.4, metalness: c === 0xd8dadd ? 0.6 : 0 }));
    m.position.set(doorX - 0.085 + i * 0.034, y0 + H + 0.004, D / 2 - 0.022); m.castShadow = high;
    body.add(m);
    return m;
  });
  const playKey = keys[1], keyY = playKey.position.y;
  // 卡带仓前面的一层玻璃
  const glass = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(TW + 0.014, TH + 0.014)), bin.add(new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.1, depthWrite: false })));
  glass.position.set(doorX, doorY, D / 2 + 0.0125);
  body.add(glass);

  // ---- 磁带 ----
  const shellMat = std({ color: 0x232427, roughness: 0.5 });
  const tapeBox = bin.add(new THREE.BoxGeometry(TW - 0.004, TH - 0.002, 0.009));
  const face = bin.add(new THREE.PlaneGeometry(TW - 0.004, TH - 0.002));
  const hub = bin.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 6).rotateX(Math.PI / 2));
  const hubMat = std({ color: 0xf2f2f0, roughness: 0.5 });
  const slot = new THREE.Vector3(g.x + doorX, doorY, g.z + D / 2 + 0.0085);
  const upright = new THREE.Quaternion();
  type Tape = { id: string; title: string; root: THREE.Group; hubs: THREE.Mesh[]; home: THREE.Vector3; homeQ: THREE.Quaternion; hover: boolean };
  let current: Tape | null = null;
  const tapes: Tape[] = data.tracks.map((t, i) => {
    const root = new THREE.Group();
    const box = new THREE.Mesh(tapeBox, shellMat); box.castShadow = high;
    const label = new THREE.Mesh(face, std({ map: bin.add(tapeTexture(t.title, t.note, t.color)), roughness: 0.6, bumpScale: 0 }));
    label.position.z = 0.0047;
    const hubs = [-1, 1].map((s) => { const m = new THREE.Mesh(hub, hubMat); m.position.set(s * 0.0132, 0.0003, 0.0052); return m; });
    root.add(box, label, ...hubs);
    // 平放在桌上，正面朝上，各自歪一点
    const home = new THREE.Vector3(L.tapes.x + i * 0.125, 0.0052 + (i === 1 ? 0.0002 : 0), L.tapes.z + (i % 2) * 0.045);
    const homeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, [0.25, -0.35, 0.5][i % 3], 0, 'YXZ'));
    root.position.copy(home); root.quaternion.copy(homeQ);
    group.add(root);
    const tape: Tape = { id: t.id, title: t.title, root, hubs, home, homeQ, hover: false };
    pick(root, { hover(v) { tape.hover = v; }, click() { emit(bus, current === tape ? 'disc:stop' : 'disc:play', { id: t.id }); } });
    return tape;
  });
  const props = new Batch();
  props.add(contactMaterial(bin, high ? 0.3 : 0.5), blob(0.24, 0.1), [L.tapes.x + 0.125, 0.0006, L.tapes.z + 0.02]);
  props.build(group, bin, {});
  pick(body, { click() { if (current) emit(bus, 'disc:stop'); } });

  // 喇叭里飘出的音符
  const noteTex = bin.add(canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.font = '52px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', 32, 34); }));
  const notes = Array.from({ length: high ? 5 : 3 }, (_, i) => {
    const mat = bin.add(new THREE.SpriteMaterial({ map: noteTex, color: 0x6a3a1c, transparent: true, opacity: 0, depthWrite: false }));
    const s = new THREE.Sprite(mat); s.scale.setScalar(0.06); group.add(s);
    return { s, mat, life: i / 5, seed: i * 2.1 };
  });
  const mouth = new THREE.Vector3(g.x + sx0, sy + 0.04, g.z + D / 2 + 0.05);

  scene.add(group);

  let stopMusic: (() => void) | null = null;
  let spinning = false;
  const halt = () => { stopMusic?.(); stopMusic = null; spinning = false; };
  const off = [
    on<{ id: string }>(bus, 'disc:play', ({ id }) => {
      const d = tapes.find((x) => x.id === id); if (!d || d === current) return;
      halt();
      current = d;
      audio(); // 在点击手势里先把 AudioContext 建好
    }),
    on(bus, 'disc:stop', () => { if (!current) return; halt(); current = null; emit(bus, 'music:state', null); }),
  ];

  const target = new THREE.Vector3();
  return {
    frame(dt, t) {
      for (const d of tapes) {
        const playing = d === current;
        target.copy(playing ? slot : d.home);
        if (!playing && d.hover) target.y += 0.02;
        // 进仓时只看横向还差多远：先飞到仓门正前方（留 5 厘米），对正了再推进去
        const far = playing ? Math.abs(d.root.position.x - target.x) + Math.abs(d.root.position.y - target.y) * 0.5 : Math.hypot(d.root.position.x - target.x, d.root.position.z - target.z);
        if (playing && far > 0.015) target.z += 0.05;
        target.y += Math.min(0.2, (playing ? Math.abs(d.root.position.x - target.x) : far) * 0.9); // 离得远时抬高，飞出一条弧线
        d.root.position.set(damp(d.root.position.x, target.x, 5, dt), damp(d.root.position.y, target.y, 7, dt), damp(d.root.position.z, target.z, 6, dt));
        d.root.quaternion.slerp(playing ? upright : d.homeQ, 1 - Math.exp(-7 * dt));
        if (playing && !spinning && d.root.position.distanceTo(slot) < 0.006) {
          spinning = true;
          stopMusic = playTrack(audio(), d.id);
          emit(bus, 'music:state', { id: d.id, title: d.title });
        }
        if (playing && spinning) for (const hb of d.hubs) hb.rotation.z -= dt * 2.4;
      }
      playKey.position.y = damp(playKey.position.y, keyY - (spinning ? 0.007 : 0), 14, dt);
      for (const n of notes) {
        n.life += dt * 0.3;
        if (n.life > 1) { n.life = 0; n.seed += 1.3; }
        const k = n.life;
        n.s.position.set(mouth.x + Math.sin(n.seed + k * 5) * 0.05 - k * 0.06, mouth.y + k * 0.36, mouth.z + k * 0.08);
        n.mat.opacity = spinning ? Math.sin(k * Math.PI) * 0.9 : damp(n.mat.opacity, 0, 6, dt);
        n.mat.rotation = Math.sin(n.seed + k * 4) * 0.4;
      }
    },
    stop() { halt(); off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
