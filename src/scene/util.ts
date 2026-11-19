import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Bin } from './types';

export type V3 = [number, number, number];

/** 带倒角的盒子 */
export const rbox = (w: number, h: number, d: number, r = 0.004, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

/** 可复现的随机数，保证每次加载画面一致 */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** 把几何体摆到位。旋转顺序 YXZ：先绕 x 倾斜，再绕 y 转向 */
export function place<T extends THREE.BufferGeometry>(geo: T, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 | number = 1): T {
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.setScalar(scale); else _s.set(...scale);
  geo.applyMatrix4(_m.compose(_p.set(...pos), _q, _s));
  return geo;
}

/** 静态部件先攒起来，最后按材质合并成一个网格，省 draw call */
export class Batch {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(private attrs = ['position', 'normal', 'uv']) {}
  add(mat: THREE.Material, geo: THREE.BufferGeometry, pos?: V3, rot?: V3, scale?: V3 | number) {
    let g = geo;
    if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (this.attrs.includes('color') && !g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const name of Object.keys(g.attributes)) if (!this.attrs.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    place(g, pos, rot, scale);
    const list = this.map.get(mat) ?? [];
    list.push(g);
    this.map.set(mat, list);
    return this;
  }
  /**
   * collapse：没有贴图、不透明、不发光的 MeshStandardMaterial，按「粗糙度（取到 0.1）× 金属度（取到 0.25）× 正反面 × 投不投影」
   * 归成一组，颜色写进顶点色，整组一个材质、一次 draw call（用户要求「优化渲染开销」：书桌上二十几种纯色材质原来各占一次）。
   * keep 里的材质不归并（后面还要按材质找网格、或者运行时会改它的颜色）。运行时要改颜色、亮度的材质不能进 collapse 的 Batch。
   */
  build(parent: THREE.Object3D, bin: Bin, o: { cast?: boolean; receive?: boolean; noCast?: THREE.Material[]; collapse?: boolean; keep?: THREE.Material[] } = {}) {
    const out: THREE.Mesh[] = [];
    if (o.collapse) {
      const groups = new Map<string, { mat: THREE.MeshStandardMaterial; list: THREE.BufferGeometry[]; cast: boolean }>();
      for (const [mat, list] of [...this.map]) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.type !== 'MeshStandardMaterial' || o.keep?.includes(mat) || m.map || m.normalMap || m.bumpMap || m.roughnessMap || m.metalnessMap || m.alphaMap || m.emissiveMap
          || m.transparent || m.opacity < 1 || m.emissive.getHex() !== 0 || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
        const cast = !!o.cast && !o.noCast?.includes(mat);
        const r = Math.round(m.roughness * 10) / 10, mt = Math.round(m.metalness * 4) / 4;
        const key = `${r}|${mt}|${m.side}|${cast}|${m.flatShading}`;
        let g = groups.get(key);
        if (!g) {
          g = { mat: bin.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mt, side: m.side, flatShading: m.flatShading, envMapIntensity: m.envMapIntensity })), list: [], cast };
          groups.set(key, g);
        }
        for (const geo of list) {
          const n = geo.getAttribute('position').count, c = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
          const a = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const k = c && m.vertexColors ? [c.getX(i), c.getY(i), c.getZ(i)] : [1, 1, 1];
            a[i * 3] = m.color.r * k[0]; a[i * 3 + 1] = m.color.g * k[1]; a[i * 3 + 2] = m.color.b * k[2];
          }
          geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
          g.list.push(geo);
        }
        this.map.delete(mat);
      }
      for (const g of groups.values()) {
        const mesh = new THREE.Mesh(bin.add(mergeGeometries(g.list)), g.mat);
        g.list.forEach((x) => x.dispose());
        mesh.castShadow = g.cast; mesh.receiveShadow = !!o.receive;
        parent.add(mesh); out.push(mesh);
      }
      // 剩下没归并的几何体如果有的有颜色属性、有的没有，mergeGeometries 会失败：统一去掉（原来的材质不用顶点色）
      for (const [mat, list] of this.map) if (!(mat as THREE.MeshStandardMaterial).vertexColors && !this.attrs.includes('color')) list.forEach((x) => { x.deleteAttribute('color'); });
    }
    for (const [mat, list] of this.map) {
      const mesh = new THREE.Mesh(bin.add(mergeGeometries(list)), mat);
      list.forEach((g) => g.dispose());
      mesh.castShadow = !!o.cast && !o.noCast?.includes(mat);
      mesh.receiveShadow = !!o.receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

/**
 * 把 root 下面用同一个材质、互不单独动的网格合成一个（在 root 的局部坐标里）。扫描模型里一个材质拆成很多块的（茶具十件），
 * 和一堆共用材质的接触阴影都能这样省 draw call。skip 返回 true 的网格不动（会单独动的、要按名字找的）。
 */
export function mergeSameMaterial(root: THREE.Object3D, bin: Bin, skip: (m: THREE.Mesh) => boolean = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || !m.visible || skip(m)) return;
    const list = groups.get(m.material) ?? []; list.push(m); groups.set(m.material, list);
  });
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const names = Object.keys(list[0].geometry.attributes).sort().join();
    const same = list.filter((m) => Object.keys(m.geometry.attributes).sort().join() === names);
    if (same.length < 2) continue;
    const geos = same.map((m) => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); g.morphAttributes = {}; return g; });
    const merged = mergeGeometries(geos); geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(bin.add(merged), mat);
    mesh.castShadow = same.some((m) => m.castShadow); mesh.receiveShadow = same.some((m) => m.receiveShadow);
    mesh.userData = { ...same[0].userData };
    for (const m of same) { m.removeFromParent(); m.geometry.dispose(); }
    root.add(mesh);
  }
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** 细碎的颗粒，给纯色表面加一点质感 */
export function speckle(g: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, rgb = '0,0,0', alpha = 0.05) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) { g.fillStyle = `rgba(${rgb},${r() * alpha})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

/** 木纹：底色 + 深浅色带 + 顺着 x 方向的波浪细线 */
export function woodGrain(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, base: string, dark: string, seed: number, lines = 160) {
  const r = rng(seed);
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.fillStyle = base; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${dark},${0.03 + r() * 0.07})`; g.fillRect(x0, y0 + r() * h, w, 6 + r() * h * 0.12); }
  for (let i = 0; i < lines; i++) {
    const y = y0 + r() * h, amp = 1 + r() * 4, f = 0.004 + r() * 0.012, ph = r() * 6;
    g.strokeStyle = `rgba(${dark},${0.05 + r() * 0.18})`; g.lineWidth = 0.5 + r() * 1.5;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) { const yy = y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.3 + ph * 2) * amp * 0.3; x ? g.lineTo(x0 + x, yy) : g.moveTo(x0 + x, yy); }
    g.stroke();
  }
  g.restore();
}

/** 物件脚下的一团软阴影（接触阴影），让东西「坐」在桌面上 */
export function contactMaterial(bin: Bin, opacity: number) {
  const tex = bin.add(canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.55, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }));
  return bin.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, color: 0x1a120c }));
}
export const blob = (rx: number, rz: number) => new THREE.PlaneGeometry(rx * 2, rz * 2).rotateX(-Math.PI / 2);

/**
 * 叶片：从原点沿 +y 伸出，叶面朝 +z，向 +z 方向弯垂。
 * shape(t) 给出 t∈[0,1] 处的半宽比例；fold 是沿中脉的 V 形折角；twist 是沿长度的扭转。
 */
export function leafGeo(o: { len: number; width: number; bend?: number; fold?: number; twist?: number; segs?: number; cols?: number; shape?: (t: number) => number }) {
  const segs = o.segs ?? 10, cols = o.cols ?? 4, bend = o.bend ?? 0.5, fold = o.fold ?? 0.2, twist = o.twist ?? 0;
  const shape = o.shape ?? ((t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.75));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = bend * t, w = o.width * Math.max(shape(t), 0.02);
    const cy = (bend ? Math.sin(a) / bend : t) * o.len, cz = (bend ? (1 - Math.cos(a)) / bend : 0) * o.len;
    for (let j = 0; j <= cols; j++) {
      const s = (j / cols) * 2 - 1, tw = twist * t;
      const lx0 = s * w, lz0 = Math.abs(s) * w * fold;
      const lx = lx0 * Math.cos(tw) - lz0 * Math.sin(tw), lz = lx0 * Math.sin(tw) + lz0 * Math.cos(tw);
      pos.push(lx, cy - lz * Math.sin(a), cz + lz * Math.cos(a));
      uv.push(j / cols, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 花盆：旋转成型，带盆沿和壁厚 */
export function potGeo(rTop: number, rBottom: number, h: number, lip = 0.008, wall = 0.006) {
  const pts = [
    new THREE.Vector2(0, 0), new THREE.Vector2(rBottom, 0), new THREE.Vector2(rBottom + 0.002, 0.004),
    new THREE.Vector2(rTop, h - lip * 2), new THREE.Vector2(rTop + lip * 0.6, h - lip * 1.6), new THREE.Vector2(rTop + lip * 0.6, h),
    new THREE.Vector2(rTop - wall, h), new THREE.Vector2(rTop - wall - 0.002, h - lip * 2.5),
  ];
  return new THREE.LatheGeometry(pts, 40);
}

/** public/assets 下素材的地址（兼容 GitHub Pages 的子路径部署） */
export const asset = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/assets/${path}`;

/**
 * 把材质上现画的贴图换成实拍的 PBR 贴图（Poly Haven，CC0）。异步加载，加载完成前保持原样；加载失败就继续用现画的。
 * rotate: 贴图旋转 90°（木纹方向）；color 可以大于 1，用来把偏灰的照片提亮或染色。
 */
export function usePhotoTexture(bin: Bin, mat: THREE.MeshStandardMaterial, name: string, o: { repeat?: [number, number]; rotate?: boolean; color?: [number, number, number]; normalScale?: number } = {}) {
  const loader = new THREE.TextureLoader();
  const setup = (t: THREE.Texture, srgb: boolean) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...(o.repeat ?? [1, 1]));
    if (o.rotate) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
    t.anisotropy = 8;
    return bin.add(t);
  };
  Promise.all([loader.loadAsync(asset(`tex/${name}_diff.jpg`)), loader.loadAsync(asset(`tex/${name}_nor.jpg`))]).then(([diff, nor]) => {
    mat.map = setup(diff, true);
    mat.normalMap = setup(nor, false);
    mat.normalScale.setScalar(o.normalScale ?? 1);
    mat.bumpMap = null;
    if (o.color) mat.color.setRGB(...o.color);
    mat.needsUpdate = true;
  }).catch((e) => console.warn(`[scene] 贴图 ${name} 加载失败，继续用程序贴图`, e));
}
