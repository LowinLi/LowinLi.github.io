import * as THREE from 'three';
import type { Bin } from './types';
import { canvasTex } from './util';

/**
 * 给 Quaternius 的低面数猫狗加细节：
 * - 毛发：着色器里按「绑定姿态」下的顶点位置画花纹，所以花纹贴在身上、跟着骨骼动。
 *   顺着身体方向的细毛深浅 + 猫背上的虎斑条纹 / 狗背上的深色毛 + 肚子浅一些。
 * - 五官：眼睛（虹膜、瞳孔、高光，会眨眼）、鼻子、嘴、猫的胡须，挂在头骨上，跟着头动。
 *
 * 脸上各点的位置是在 Blender 里用射线在静止姿态下打到模型表面取的（模型原始坐标，glTF 轴向：x 朝前、y 朝上、z 是左右）。
 * 换模型就要重新取。
 */
type V = [number, number, number];
interface Spot { p: V; n: V }
export interface FaceSpec {
  eyeL: Spot; eyeR: Spot; nose: Spot; mouth: Spot; cheekL: Spot; cheekR: Spot;
  eyeR0: number; iris: string; slit: boolean; nose3: number; noseSize: V; whiskers: boolean;
}
export const FACES: Record<'cat' | 'dog', FaceSpec> = {
  cat: {
    eyeL: { p: [2.7651, 2.9268, -0.3338], n: [0.5541, 0.209, -0.8057] }, eyeR: { p: [2.7651, 2.9268, 0.3338], n: [0.5541, 0.209, 0.8057] },
    nose: { p: [3.2333, 2.625, 0], n: [0.9769, -0.2137, 0] }, mouth: { p: [3.1718, 2.4596, 0], n: [0.9402, -0.3027, 0] },
    cheekL: { p: [3.0778, 2.55, -0.2464], n: [0.4553, 0.2912, -0.8414] }, cheekR: { p: [3.0778, 2.55, 0.2464], n: [0.4553, 0.2912, 0.8414] },
    eyeR0: 0.105, iris: '#b8c23a', slit: true, nose3: 0xd9707a, noseSize: [0.07, 0.05, 0.035], whiskers: true,
  },
  dog: {
    // 狗的模型左右不太对称，眼睛的朝向按左右对称重新给
    eyeL: { p: [2.9248, 4.0007, -0.6438], n: [0.62, 0.22, -0.75] }, eyeR: { p: [2.9131, 3.999, 0.0145], n: [0.62, 0.22, 0.75] },
    nose: { p: [3.6662, 3.8066, -0.3094], n: [0.92, 0.3, 0] }, mouth: { p: [3.6145, 3.5514, -0.3094], n: [0.9772, -0.2122, 0] },
    cheekL: { p: [3.3655, 3.7, -0.6388], n: [0.09, 0.09, -0.99] }, cheekR: { p: [3.3466, 3.7, -0.0285], n: [0.09, 0.09, 0.99] },
    eyeR0: 0.085, iris: '#5a3618', slit: false, nose3: 0x161412, noseSize: [0.13, 0.09, 0.1], whiskers: false,
  },
};

/** 毛发着色器：改 Lambert 的颜色和自发光（屋外的动物主要靠自发光着色） */
export function addFur(mat: THREE.MeshLambertMaterial, o: { kind: 'cat' | 'dog'; axes: { L: string; U: string; W: string }; foot: number; head: number; main: boolean }) {
  const { L, U, W } = o.axes;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFoot = { value: o.foot }; sh.uniforms.uHead = { value: o.head };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFurPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFurPos; uniform float uFoot, uHead;
float fh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float furFactor(){
  vec3 p = vFurPos; float l = p.${L}, u = p.${U}, w = p.${W};
  float h = clamp((u - uFoot) / (uHead - uFoot), 0., 1.2);
  // 顺着身体方向的细毛：沿身长方向拉长的噪声，两层
  float strand = fn(vec3(l * 2.2, u * 13., w * 13.)) * .65 + fn(vec3(l * 4.5, u * 29., w * 29.)) * .35;
  float f = .84 + .32 * strand;
  ${o.main ? (o.kind === 'cat'
    ? `// 虎斑：沿身长一道道深色条纹，只在背和体侧；条纹边缘被噪声扰乱
  float wob = fn(vec3(l * 1.3, u * 2.2, w * 2.2)) * 2.4;
  float band = smoothstep(.2, .75, sin(l * 9.5 + wob + abs(w) * 1.6));
  f *= mix(1., .58, band * smoothstep(.42, .7, h));
  f *= mix(1., .82, smoothstep(.72, .95, h));                 // 背脊再深一点`
    : `// 黄狗：背上一片深色的鞍毛，肚子和腿浅一些
  float saddle = smoothstep(.6, .82, h + (fn(vec3(l * 1.6, u * 1.6, w * 1.6)) - .5) * .18);
  f *= mix(1., .7, saddle);
  f *= mix(1.14, 1., smoothstep(.25, .5, h));`) : ''}
  return f;
}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat furF = furFactor();')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= furF;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= furF;');
  };
  mat.customProgramCacheKey = () => `fur-${o.kind}-${o.main}-${L}${U}${W}`;
  mat.needsUpdate = true;
}

/** 眼睛的贴图：深色眼眶、虹膜（放射状纹理）、瞳孔（猫是竖缝）、两点高光 */
function eyeTexture(bin: Bin, iris: string, slit: boolean) {
  return bin.add(canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#120d0a'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    const grad = g.createRadialGradient(c, c, 6, c, c, c * 0.84);
    grad.addColorStop(0, iris); grad.addColorStop(0.75, iris); grad.addColorStop(1, '#2a1a0c');
    g.fillStyle = grad; g.beginPath(); g.arc(c, c, c * 0.84, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 14, c + Math.sin(a) * 14); g.lineTo(c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8); g.stroke(); }
    g.fillStyle = '#050403'; g.beginPath();
    if (slit) g.ellipse(c, c, 7, c * 0.62, 0, 0, 7); else g.arc(c, c, c * 0.4, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(c - 16, c - 18, 11, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(c + 14, c + 16, 5, 0, 7); g.fill();
  }));
}

/**
 * 把五官挂到头骨上。model 已经缩放好、还没放进场景、处于静止姿态时调用。
 * 返回一个每帧调用的函数（眨眼）。
 */
export function addFace(bin: Bin, model: THREE.Object3D, kind: 'cat' | 'dog') {
  const f = FACES[kind];
  const head = model.getObjectByName('Bone003');
  if (!head) return () => {};
  model.updateMatrixWorld(true);
  const toBone = (spot: Spot) => {
    const wp = new THREE.Vector3(...spot.p).applyMatrix4(model.matrixWorld);
    const wn = new THREE.Vector3(...spot.p).add(new THREE.Vector3(...spot.n).normalize()).applyMatrix4(model.matrixWorld);
    const lp = head.worldToLocal(wp.clone()), ln = head.worldToLocal(wn.clone()).sub(lp).normalize();
    return { lp, ln };
  };
  // 几何体按模型原始单位做，挂到骨头下面时要换算到骨头的缩放
  const unit = model.scale.x / head.getWorldScale(new THREE.Vector3()).x;
  const basic = (c: number | string) => bin.add(new THREE.MeshBasicMaterial({ color: c }));
  const place = (obj: THREE.Object3D, spot: Spot, lift: number) => {
    const { lp, ln } = toBone(spot);
    obj.position.copy(lp).addScaledVector(ln, lift * unit);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ln);
    obj.scale.multiplyScalar(unit);
    obj.traverse((o) => { o.userData.noAO = true; (o as THREE.Mesh).frustumCulled = false; });
    head.add(obj);
    return obj;
  };
  // 眼睛：眼眶（略大的深色扁球）+ 眼球贴图
  const eyeTex = eyeTexture(bin, f.iris, f.slit), r = f.eyeR0;
  const rimGeo = bin.add(new THREE.SphereGeometry(r * 1.15, 16, 10)), eyeGeo = bin.add(new THREE.CircleGeometry(r, 24));
  const rimMat = basic(0x1a120c), eyeMat = bin.add(new THREE.MeshBasicMaterial({ map: eyeTex }));
  const eyes = [f.eyeL, f.eyeR].map((spot) => {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.scale.set(1, 0.95, 0.35);
    const ball = new THREE.Mesh(eyeGeo, eyeMat); ball.position.z = r * 0.36;
    g.add(rim, ball);
    return place(g, spot, -r * 0.1);
  });
  // 鼻子
  const nose = new THREE.Mesh(bin.add(new THREE.SphereGeometry(1, 14, 10)), bin.add(new THREE.MeshLambertMaterial({ color: new THREE.Color(f.nose3).multiplyScalar(0.6), emissive: new THREE.Color(f.nose3).multiplyScalar(0.7) })));
  nose.scale.set(...f.noseSize);
  const noseG = new THREE.Group(); noseG.add(nose);
  if (kind === 'dog') { const hl = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.022, 8, 6)), basic(0x9a9a9a)); hl.position.set(-0.03, 0.04, 0.075); noseG.add(hl); }
  place(noseG, f.nose, 0.0);
  // 嘴：猫是「ω」形的两小段弧，狗是一道向两边下垂的线
  const mouthMat = basic(kind === 'cat' ? 0x5a3424 : 0x1c1410);
  const arc = (x0: number, x1: number, sag: number) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, 0, 0), new THREE.Vector3((x0 + x1) / 2, -sag, 0), new THREE.Vector3(x1, 0, 0)), 8, 0.011, 4);
  const mouthG = new THREE.Group();
  if (kind === 'cat') { mouthG.add(new THREE.Mesh(bin.add(arc(-0.11, 0, 0.05)), mouthMat), new THREE.Mesh(bin.add(arc(0, 0.11, 0.05)), mouthMat)); }
  else { mouthG.add(new THREE.Mesh(bin.add(arc(-0.2, 0.2, 0.05)), mouthMat)); } // 中间低、两头翘：微微笑
  // 嘴的弧线要横着（左右方向）：先把组摆到嘴的位置，再让它的 x 轴对上头的左右方向
  const m = place(mouthG, f.mouth, 0.01);
  const side = toBone(f.cheekL).lp.clone().sub(toBone(f.cheekR).lp).normalize();
  const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
  const x = side.clone().sub(nrm.clone().multiplyScalar(side.dot(nrm))).normalize(), y = nrm.clone().cross(x);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, nrm));
  // 猫的胡须：两边各三根，从脸颊往外、往前散开
  if (f.whiskers) {
    const pts: number[] = [];
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.22;
      pts.push(0, 0, 0, 0.62 * Math.cos(a), 0.62 * Math.sin(a) - 0.05, 0.18);
    }
    const geo = bin.add(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.slice(0, 18), 3));
    const lm = bin.add(new THREE.LineBasicMaterial({ color: 0xf5f0e6, transparent: true, opacity: 0.85 }));
    for (const [spot, s] of [[f.cheekL, 1], [f.cheekR, -1]] as const) {
      const w = new THREE.LineSegments(geo, lm);
      const g = place(new THREE.Group().add(w), spot, 0.01);
      // 胡须沿脸颊往外：让它的 x 轴朝向头的外侧
      const out = side.clone().multiplyScalar(s), n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
      const xx = out.sub(n.clone().multiplyScalar(out.dot(n))).normalize(), yy = n.clone().cross(xx);
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, n));
    }
  }
  // 眨眼：每隔几秒眼睛压扁一下
  let next = 2 + Math.random() * 3, t = 0;
  const open = eyes.map((e) => e.scale.y);
  return (dt: number) => {
    t += dt;
    const k = t > next ? Math.min(1, (t - next) / 0.16) : 0;
    const shut = k > 0 ? Math.sin(k * Math.PI) : 0;
    eyes.forEach((e, i) => { e.scale.y = open[i] * (1 - 0.9 * shut); });
    if (k >= 1) { t = 0; next = 2.5 + Math.random() * 4; }
  };
}
