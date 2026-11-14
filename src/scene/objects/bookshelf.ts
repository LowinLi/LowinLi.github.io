import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { L } from '../layout';
import { damp } from '../tween';
import type { Book } from '../../books';

const SERIF = '"Songti SC","Noto Serif CJK SC","SimSun",serif';
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

/** 书脊贴图：技术书是色块 + 竖排书名；古籍是靛蓝封皮、白色签条和装订线 */
function spineTexture(book: Book) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 512;
  const g = c.getContext('2d')!;
  const chars = [...book.title];
  g.fillStyle = book.color; g.fillRect(0, 0, 96, 512);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (book.kind === 'classic') {
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    for (const y of [40, 150, 256, 362, 472]) { g.beginPath(); g.moveTo(0, y); g.lineTo(96, y); g.stroke(); }
    const size = 44, hgt = chars.length * (size + 6) + 28;
    g.fillStyle = '#efe6d0'; g.fillRect(20, 62, 56, hgt);
    g.strokeStyle = '#8a7a5a'; g.lineWidth = 1.5; g.strokeRect(23, 65, 50, hgt - 6);
    g.fillStyle = '#1c1a17'; g.font = `bold ${size}px ${SERIF}`;
    chars.forEach((ch, i) => g.fillText(ch, 48, 62 + 14 + size / 2 + i * (size + 6)));
  } else {
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 26, 96, 5); g.fillRect(0, 478, 96, 5);
    const size = Math.min(52, 400 / chars.length);
    g.fillStyle = '#fff'; g.font = `bold ${size}px ${SANS}`;
    chars.forEach((ch, i) => g.fillText(ch, 48, 256 + (i - (chars.length - 1) / 2) * size * 1.08));
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
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
  const paper = bin.add(new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 }));
  const steel = bin.add(new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.4, metalness: 0.7 }));
  const depth = 0.17;

  type Item = { id: string; root: THREE.Group; y: number; hover: boolean; open: boolean; out: number; lift: number };
  let x = 0.012;
  const items: Item[] = data.books.map((b, i) => {
    const classic = b.kind === 'classic';
    const w = classic ? 0.03 + (i % 2) * 0.006 : 0.042 + ((i * 7) % 4) * 0.006;
    const h = classic ? 0.2 : 0.225 + ((i * 5) % 3) * 0.014;
    const cover = bin.add(new THREE.MeshStandardMaterial({ color: b.color, roughness: classic ? 0.9 : 0.55 }));
    const spine = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(spineTexture(b)), roughness: classic ? 0.9 : 0.55 }));
    // BoxGeometry 面顺序：+x -x +y -y +z -z。书脊朝 +z（朝向相机），上下和背面是纸
    const mesh = new THREE.Mesh(bin.add(new THREE.BoxGeometry(w, h, depth)), [cover, cover, paper, paper, spine, paper]);
    mesh.castShadow = mesh.receiveShadow = high;
    const root = new THREE.Group();
    root.add(mesh);
    root.position.set(x + w / 2, h / 2, 0);
    group.add(root);
    const item: Item = { id: b.id, root, y: h / 2, hover: false, open: false, out: 0, lift: 0 };
    pick(root, { hover(v) { item.hover = v; }, click() { emit(bus, 'book:open', { id: b.id }); } });
    x += w + 0.0015;
    return item;
  });
  // 两端的书立
  for (const bx of [0, x + 0.012]) {
    const end = new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.008, 0.16, 0.12)), steel);
    end.position.set(bx, 0.08, 0); end.castShadow = high; group.add(end);
  }
  scene.add(group);

  const off = [
    on<{ id: string }>(bus, 'book:open', ({ id }) => items.forEach((it) => { it.open = it.id === id; })),
    on(bus, 'book:close', () => items.forEach((it) => { it.open = false; })),
  ];
  return {
    frame(dt) {
      for (const it of items) {
        it.out = damp(it.out, it.open ? 1 : it.hover ? 0.16 : 0, 9, dt);
        it.lift = damp(it.lift, it.open ? 1 : 0, 6, dt);
        it.root.position.z = it.out * 0.24;
        it.root.position.y = it.y + it.lift * 0.07;
        it.root.rotation.x = -it.lift * 0.3;
      }
    },
    stop() { off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
