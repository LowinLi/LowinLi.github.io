import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import { Batch, blob, contactMaterial, rbox, rng, speckle } from '../util';
import type { Book } from '../../books';

const SERIF = '"Songti SC","Noto Serif CJK SC","SimSun",serif';
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

// 每本书一张贴图，分三个区：左半是书脊，中间一条是封面布料，右边是书页的切口
const U_SPINE = 0.5, U_COVER: [number, number] = [0.55, 0.7], U_PAPER: [number, number] = [0.76, 1];

function bookTexture(book: Book, i: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d')!;
  const classic = book.kind === 'classic';
  const chars = [...book.title];
  // 封面底色铺满书脊区和封面区，再撒一层布纹颗粒
  g.fillStyle = book.color; g.fillRect(0, 0, 190, 512);
  speckle(g, 190, 512, 40 + i, 5000, '255,255,255', classic ? 0.1 : 0.05);
  speckle(g, 190, 512, 60 + i, 5000, '0,0,0', 0.1);
  // 书页切口：一页页的细线
  g.fillStyle = classic ? '#e6d6b0' : '#f3ecdc'; g.fillRect(190, 0, 66, 512);
  const r = rng(90 + i);
  for (let x = 190; x < 256; x += 1.5) { g.fillStyle = `rgba(110,90,60,${0.08 + r() * 0.22})`; g.fillRect(x, 0, 0.7, 512); }
  // 书脊
  const sw = 128;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (classic) {
    // 线装：四眼装订线 + 白色签条
    g.strokeStyle = 'rgba(240,235,220,.9)'; g.lineWidth = 2.5;
    for (const y of [36, 180, 332, 476]) { g.beginPath(); g.moveTo(0, y); g.lineTo(sw, y); g.stroke(); }
    g.beginPath(); g.moveTo(sw - 14, 0); g.lineTo(sw - 14, 512); g.stroke();
    const size = 50, hgt = chars.length * (size + 8) + 30;
    g.fillStyle = '#f0e7d0'; g.fillRect(24, 70, 66, hgt);
    g.strokeStyle = '#8a7a5a'; g.lineWidth = 2; g.strokeRect(28, 74, 58, hgt - 8);
    g.fillStyle = '#1c1a17'; g.font = `bold ${size}px ${SERIF}`;
    chars.forEach((ch, k) => g.fillText(ch, 57, 70 + 15 + size / 2 + k * (size + 8)));
  } else {
    const foil = i % 2 ? '#f1d9a0' : '#ffffff';
    g.fillStyle = foil;
    g.fillRect(0, 30, sw, 4); g.fillRect(0, 40, sw, 1.5); g.fillRect(0, 404, sw, 1.5); g.fillRect(0, 410, sw, 4);
    const size = Math.min(64, 330 / chars.length);
    g.font = `bold ${size}px ${SANS}`;
    chars.forEach((ch, k) => g.fillText(ch, sw / 2, 220 + (k - (chars.length - 1) / 2) * size * 1.06));
    // 出版社标记
    g.lineWidth = 3; g.strokeStyle = foil; g.beginPath(); g.arc(sw / 2, 458, 20, 0, 7); g.stroke();
    g.font = `bold 22px ${SERIF}`; g.fillText('晨', sw / 2, 460);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

const remap = (geo: THREE.BufferGeometry, [u0, u1]: [number, number], from = 0, count = Infinity) => {
  const uv = geo.attributes.uv;
  for (let k = from; k < Math.min(uv.count, from + count); k++) uv.setX(k, u0 + uv.getX(k) * (u1 - u0));
  return geo;
};

/** 一本书的几何体：两块封面板、书脊、书芯，合并成一个网格。书脊朝 +z，厚度沿 x。 */
function bookGeometry(w: number, h: number, d: number, classic: boolean) {
  const board = classic ? 0.0012 : 0.003, over = classic ? 0 : 0.003;
  const front = remap(new THREE.BoxGeometry(board, h, d).translate(-w / 2 + board / 2, 0, 0), U_COVER);
  const back = remap(new THREE.BoxGeometry(board, h, d).translate(w / 2 - board / 2, 0, 0), U_COVER);
  const spine = new THREE.BoxGeometry(w, h, board).translate(0, 0, d / 2 - board / 2);
  remap(spine, U_COVER);
  // BoxGeometry 的 +z 面是第 16–19 个顶点：只有这一面映射到书脊图案
  const uv = spine.attributes.uv;
  for (let k = 16; k < 20; k++) uv.setX(k, ((uv.getX(k) - U_COVER[0]) / (U_COVER[1] - U_COVER[0])) * U_SPINE);
  const pages = remap(new THREE.BoxGeometry(w - board * 2, h - over * 2, d - board - over).translate(0, 0, (over - board) / 2), U_PAPER);
  const geo = mergeGeometries([front, back, spine, pages]);
  [front, back, spine, pages].forEach((x) => x.dispose());
  return geo;
}

/**
 * 桌面左侧的一排书。悬停时抽出一点，点击发出 book:open {id}（由 Scene.astro 的阅读器显示内容）。
 * 监听 book:open / book:close 来把书抽出和放回。
 */
export const bookshelf: SceneObject = ({ scene, tier, data, bus, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  group.position.set(L.books.x0, 0, L.books.z);
  const high = tier === 'high';
  const r = rng(5);

  type Item = { id: string; root: THREE.Group; y: number; z: number; hover: boolean; open: boolean; out: number; lift: number };
  let x = 0.014;
  const items: Item[] = data.books.map((b, i) => {
    const classic = b.kind === 'classic';
    const w = classic ? 0.026 + r() * 0.008 : 0.036 + r() * 0.02;
    const h = classic ? 0.2 + r() * 0.006 : 0.215 + r() * 0.04;
    const d = classic ? 0.14 : 0.155 + r() * 0.02;
    const tex = bin.add(bookTexture(b, i));
    const mat = bin.add(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.8, roughness: classic ? 0.95 : 0.62 }));
    const mesh = new THREE.Mesh(bin.add(bookGeometry(w, h, d, classic)), mat);
    mesh.castShadow = mesh.receiveShadow = high;
    const root = new THREE.Group();
    root.add(mesh);
    const z = (r() - 0.5) * 0.008 - (d - 0.17) / 2; // 书脊基本对齐，略有参差
    root.position.set(x + w / 2, h / 2, z);
    root.rotation.y = (r() - 0.5) * 0.02;
    group.add(root);
    const item: Item = { id: b.id, root, y: h / 2, z, hover: false, open: false, out: 0, lift: 0 };
    pick(root, { hover(v) { item.hover = v; }, click() { emit(bus, 'book:open', { id: b.id }); } });
    x += w + 0.001;
    return item;
  });

  // 两端的书立（L 形钢板）和接触阴影
  const batch = new Batch();
  const steel = bin.add(new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.4, metalness: 0.8 }));
  for (const [bx, dir] of [[0.006, -1], [x + 0.008, 1]] as const) {
    batch.add(steel, rbox(0.004, 0.15, 0.11, 0.0015), [bx, 0.075, 0]);
    batch.add(steel, rbox(0.09, 0.003, 0.11, 0.001), [bx - dir * 0.043, 0.0015, 0]);
  }
  batch.add(contactMaterial(bin, high ? 0.32 : 0.55), blob(x / 2 + 0.05, 0.13), [x / 2, 0.0008, 0]);
  batch.build(group, bin, { cast: high, receive: high, collapse: true });
  scene.add(group);

  const off = [
    on<{ id: string; from?: string }>(bus, 'book:open', ({ id, from }) => items.forEach((it) => { it.open = it.id === id && from !== 'desk'; })),
    on(bus, 'book:close', () => items.forEach((it) => { it.open = false; })),
  ];
  return {
    frame(dt) {
      for (const it of items) {
        it.out = damp(it.out, it.open ? 1 : it.hover ? 0.16 : 0, 9, dt);
        it.lift = damp(it.lift, it.open ? 1 : 0, 6, dt);
        it.root.position.z = it.z + it.out * 0.24;
        it.root.position.y = it.y + it.lift * 0.07;
        it.root.rotation.x = -it.lift * 0.3;
      }
    },
    stop() { off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
