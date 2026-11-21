import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 把 Quaternius 那几只低多边形的牲口「细化」（用户说「动物模型太方块了，细化一下」）——不换模型（骨骼、动作都还能用），在加载时现做：
 *
 * 1. 合并：一头的几块蒙皮网格（每种材质一块）合成一块，颜色写进顶点色（每个三角形的三个角各存一份，材质交界处的颜色不糊）。
 * 2. 细分：每个三角形切成四个，新顶点的蒙皮权重由两端混合（取最大的四个、归一）；high 档切两次，mid 档一次。
 * 3. 磨圆：Taubin 平滑（先往邻居平均拉 0.5，再往回推 0.53，两轮），方块的棱角磨圆，又不会整体缩小。
 * 4. 绵羊的毛：白色（羊毛）部分的顶点沿法线按噪声往外鼓，成一团一团的卷毛。
 * 5. 假的环境光遮蔽：越靠近蹄子、越朝下的面越暗（写进顶点色），身子有了上亮下暗。
 * 6. 光滑法线 + 着色器里一层细纹理（按绑定姿态的位置采噪声，跟着骨骼动）：猪、牛是细密的皮毛，羊毛是一卷卷的明暗。
 *
 * 材质还是「颜色 × 0.5 + 自发光 × 0.62」的 Lambert（屋外不吃室内的灯），自发光也乘顶点色和细纹理。
 */
export type BeastSkin = 'hair' | 'wool';

/** 一个顶点的蒙皮：四个骨头编号 + 权重 */
const blendSkin = (si: number[], sw: number[], a: number, b: number, outI: number[], outW: number[]) => {
  const m = new Map<number, number>();
  for (const v of [a, b]) for (let k = 0; k < 4; k++) { const w = sw[v * 4 + k] * 0.5; if (w > 0) m.set(si[v * 4 + k], (m.get(si[v * 4 + k]) ?? 0) + w); }
  const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0) || 1;
  for (let k = 0; k < 4; k++) { outI.push(top[k]?.[0] ?? 0); outW.push((top[k]?.[1] ?? 0) / sum); }
};

function refineGeometry(src: THREE.BufferGeometry, levels: number, up: THREE.Vector3, skin: BeastSkin) {
  // ---- 焊接：按位置合并成「唯一顶点」，三角形记顶点号，颜色按角存 ----
  const sp = src.getAttribute('position'), sc = src.getAttribute('color'), ssi = src.getAttribute('skinIndex'), ssw = src.getAttribute('skinWeight');
  const P: number[] = [], SI: number[] = [], SW: number[] = [], T: number[] = [], C: number[] = [];
  const ids = new Map<string, number>();
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let id = ids.get(key);
    if (id === undefined) { id = P.length / 3; ids.set(key, id); P.push(x, y, z); for (let k = 0; k < 4; k++) { SI.push(ssi.getComponent(i, k)); SW.push(ssw.getComponent(i, k)); } }
    T.push(id); C.push(sc.getX(i), sc.getY(i), sc.getZ(i));
  }
  // ---- 细分：一个三角形切四个 ----
  let tris = T, cols = C;
  for (let l = 0; l < levels; l++) {
    const edge = new Map<number, number>(), nT: number[] = [], nC: number[] = [];
    const mid = (a: number, b: number) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a; let m = edge.get(key);
      if (m === undefined) { m = P.length / 3; edge.set(key, m); P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2); blendSkin(SI, SW, a, b, SI, SW); }
      return m;
    };
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      const ca0 = cols.slice(t * 3, t * 3 + 3), cb0 = cols.slice(t * 3 + 3, t * 3 + 6), cc0 = cols.slice(t * 3 + 6, t * 3 + 9);
      const avg = (x: number[], y: number[]) => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2];
      const cab = avg(ca0, cb0), cbc = avg(cb0, cc0), cca = avg(cc0, ca0);
      nT.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      nC.push(...ca0, ...cab, ...cca, ...cab, ...cb0, ...cbc, ...cca, ...cbc, ...cc0, ...cab, ...cbc, ...cca);
    }
    tris = nT; cols = nC;
  }
  const n = P.length / 3;
  // ---- 邻居表，Taubin 平滑 ----
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const a = tris[t + k], b = tris[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  const smooth = (f: number) => {
    const Q = P.slice();
    for (let i = 0; i < n; i++) {
      if (!nb[i].size) continue;
      let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
      const s = 1 / nb[i].size; Q[i * 3] = P[i * 3] + f * (x * s - P[i * 3]); Q[i * 3 + 1] = P[i * 3 + 1] + f * (y * s - P[i * 3 + 1]); Q[i * 3 + 2] = P[i * 3 + 2] + f * (z * s - P[i * 3 + 2]);
    }
    for (let i = 0; i < P.length; i++) P[i] = Q[i];
  };
  for (let it = 0; it < 2; it++) { smooth(0.5); smooth(-0.53); }
  // ---- 顶点法线（面积加权）----
  const normals = () => {
    const N = new Float32Array(n * 3), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
      e1.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]); e2.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
      fn.crossVectors(e1, e2);
      for (const v of [a, b, c]) { N[v * 3] += fn.x; N[v * 3 + 1] += fn.y; N[v * 3 + 2] += fn.z; }
    }
    for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    return N;
  };
  let N = normals();
  // 高度范围（沿「上」方向）：做假遮蔽、噪声的尺度
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const h = P[i * 3] * up.x + P[i * 3 + 1] * up.y + P[i * 3 + 2] * up.z; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const H = Math.max(1e-6, hi - lo);
  // ---- 羊毛：浅色的顶点沿法线往外鼓一团团 ----
  if (skin === 'wool') {
    const light = new Float32Array(n), cnt = new Float32Array(n);
    for (let t = 0; t < tris.length; t++) { const v = tris[t], c = cols.slice(t * 3, t * 3 + 3); light[v] += c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; cnt[v]++; }
    for (let i = 0; i < n; i++) {
      if (light[i] / Math.max(1, cnt[i]) < 0.45) continue;
      const x = P[i * 3] / H * 9, y = P[i * 3 + 1] / H * 9, z = P[i * 3 + 2] / H * 9;
      const bump = 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(y * 2.3)) * Math.sin(y * 1.9 + Math.sin(z * 2.1)) * Math.sin(z * 2.2 + Math.sin(x * 1.6));
      const d = H * 0.035 * (0.35 + bump);
      P[i * 3] += N[i * 3] * d; P[i * 3 + 1] += N[i * 3 + 1] * d; P[i * 3 + 2] += N[i * 3 + 2] * d;
    }
    N = normals();
  }
  // ---- 输出：非索引，每个角自己的颜色（乘上假遮蔽），光滑法线 ----
  const m = tris.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), si = new Uint16Array(m * 4), sw = new Float32Array(m * 4);
  for (let t = 0; t < m; t++) {
    const v = tris[t];
    pos.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], t * 3); nor.set([N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], t * 3);
    const h = ((P[v * 3] * up.x + P[v * 3 + 1] * up.y + P[v * 3 + 2] * up.z) - lo) / H;
    const down = N[v * 3] * up.x + N[v * 3 + 1] * up.y + N[v * 3 + 2] * up.z;
    const ao = (0.6 + 0.4 * THREE.MathUtils.smoothstep(h, 0.02, 0.5)) * (0.8 + 0.2 * (down * 0.5 + 0.5)) * (1.02 + 0.06 * THREE.MathUtils.smoothstep(h, 0.6, 1));
    col.set([cols[t * 3] * ao, cols[t * 3 + 1] * ao, cols[t * 3 + 2] * ao], t * 3);
    for (let k = 0; k < 4; k++) { si[t * 4 + k] = SI[v * 4 + k]; sw[t * 4 + k] = SW[v * 4 + k]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return { geometry: g, height: H };
}

/** 牲口的材质：Lambert（颜色 × 0.5 + 自发光 × 0.62，自发光也乘顶点色）+ 一层按绑定姿态位置采的细纹理 */
function beastMaterial(skin: BeastSkin, scale: number) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(0.5, 0.5, 0.5), emissive: new THREE.Color(0.62, 0.62, 0.62) });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBeastScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBeastScale;\nvarying vec3 vBindPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = position * uBeastScale;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBindPos;
float bh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bvn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh3(i), bh3(i + vec3(1, 0, 0)), f.x), mix(bh3(i + vec3(0, 1, 0)), bh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh3(i + vec3(0, 0, 1)), bh3(i + vec3(1, 0, 1)), f.x), mix(bh3(i + vec3(0, 1, 1)), bh3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float beastDetail(vec3 p, vec3 c) {
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
${skin === 'wool'
    ? `  if (lum > 0.4) { float w = bvn(p * 34.0); return 0.78 + 0.28 * smoothstep(0.2, 0.8, w) + 0.06 * bvn(p * 90.0); } // 一卷卷的羊毛：卷缝暗、卷顶亮
  return 0.94 + 0.08 * bvn(p * 70.0);`
    : '  return 0.92 + 0.07 * bvn(p * vec3(30.0, 110.0, 30.0)) + 0.05 * bvn(p * 160.0); // 细密的皮毛 / 皮肤纹理'}
}`)
      .replace('vec3 totalEmissiveRadiance = emissive;', 'float bK = beastDetail(vBindPos, vColor.rgb);\nvec3 totalEmissiveRadiance = emissive * vColor.rgb * bK;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= bK;')
      // 自发光为主的材质几乎不显体积：再按（观察空间的）法线补一盏从上前方来的「主光」和一圈轮廓亮边，身子才圆起来
      .replace('#include <opaque_fragment>', `{
  vec3 bn = normalize(normal);
  float key = max(dot(bn, normalize(vec3(0.35, 0.85, 0.4))), 0.0);
  float rim = pow(1.0 - max(dot(bn, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  outgoingLight *= 0.62 + 0.55 * key + 0.18 * rim;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `beast-${skin}`;
  return mat;
}

/**
 * 一头牲口：合并几块蒙皮网格、细分磨圆、换材质。levels：细分几次（high 2、mid 1）。
 * 只认同一套骨头、同一个绑定矩阵的网格；不满足就原样不动。
 */
export function refineBeast(model: THREE.Object3D, skin: BeastSkin, levels: number) {
  const meshes: THREE.SkinnedMesh[] = [];
  model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  if (!meshes.length) return;
  // SkeletonUtils.clone 给每块网格各克隆了一个 Skeleton，骨头是同一套：按骨头比
  const sameBones = (m: THREE.SkinnedMesh) => m.skeleton.bones.length === meshes[0].skeleton.bones.length && m.skeleton.bones.every((b, i) => b === meshes[0].skeleton.bones[i]);
  if (meshes.some((m) => !sameBones(m) || Array.isArray(m.material) || !m.bindMatrix.equals(meshes[0].bindMatrix))) return;
  const geos = meshes.map((m) => {
    let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    // prepare 给的材质：颜色 × 0.5、自发光 × 0.62，自发光 / 0.62 就是重新上的颜色
    const mat = m.material as THREE.MeshLambertMaterial, col = mat.emissive.clone().multiplyScalar(1 / 0.62), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    return g;
  });
  const merged = mergeGeometries(geos); geos.forEach((g) => g.dispose());
  if (!merged) return;
  // 「上」在几何体自己的坐标里是哪个方向：绑定矩阵把几何体放进 glTF 的世界（y 朝上），反过来算
  const first = meshes[0], up = new THREE.Vector3(0, 1, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(first.bindMatrix).invert()).normalize();
  const { geometry, height } = refineGeometry(merged, levels, up, skin); merged.dispose();
  const one = new THREE.SkinnedMesh(geometry, beastMaterial(skin, 1 / height));
  one.position.copy(first.position); one.quaternion.copy(first.quaternion); one.scale.copy(first.scale);
  one.frustumCulled = false; one.userData.noAO = true;
  first.parent!.add(one); one.bind(first.skeleton, first.bindMatrix);
  for (const m of meshes) { m.parent!.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
}
