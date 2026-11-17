/**
 * 窗外写实化用的两样东西：
 *
 * 1. outdoorMaterial：屋外用的无光照材质（和原来的顶点色材质一样不吃室内灯光），可以带照片贴图；
 *    远近的「泛白」改在着色器里按世界坐标算，所以贴图的东西也能有空气透视。
 *
 * 2. Impostors：公告板。Poly Haven 的扫描树、灌木、草丛先在 Blender 里渲成带透明底的照片
 *    （tools/render_impostors.py，光照用和屋里一样的日出天空），这里每种照片一个 InstancedMesh，
 *    每个实例是一张竖着、始终转向镜头的四边形（只绕竖轴转）。一棵几百万面的树变成两个三角形。
 *    实例矩阵里只放位置和缩放：x 方向缩放为负就是左右镜像，多一点变化。
 */
import * as THREE from 'three';
import { Bin } from './types';
import { asset } from './util';

export const HAZE = new THREE.Color(0.78, 0.8, 0.8);
/** 和 countryside.ts 里 hazeAt 一样：30 米以内不泛白，越远越白，最多 75% */
const HAZE_GLSL = 'clamp((-wpos.z - 30.0) / 420.0, 0.0, 0.75)';

/** 屋外的无光照材质：贴图 × 顶点色（明暗、色调），再按距离混一点雾色。sat < 1 降低饱和度（代码画的东西颜色太艳，和照片放一起像卡通） */
export function outdoorMaterial(bin: Bin, o: THREE.MeshBasicMaterialParameters & { billboard?: boolean; haze?: boolean; sat?: number; atlas?: boolean } = {}) {
  const { billboard, haze = true, sat = 1, atlas = false, ...params } = o;
  const m = bin.add(new THREE.MeshBasicMaterial(params));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = { value: HAZE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vHz;${atlas ? '\nattribute vec4 aRect;' : ''}`)
      .replace('#include <uv_vertex>', atlas ? '#include <uv_vertex>\nvMapUv = mix(aRect.xy, aRect.zw, uv); // 图集里这一张照片的范围' : '#include <uv_vertex>')
      .replace('#include <project_vertex>', billboard ? `
        // 公告板：以实例原点为中心，只绕竖轴转向镜头。实例矩阵里只有位置和缩放（x 可以是负的，表示镜像）
        vec4 org = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 toCam = cameraPosition - org.xyz; toCam.y = 0.0;
        vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 wpos = org.xyz + rgt * transformed.x * instanceMatrix[0][0] + vec3(0.0, transformed.y * instanceMatrix[1][1], 0.0);
        vec4 mvPosition = viewMatrix * vec4(wpos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vHz = ${HAZE_GLSL};` : `
        #include <project_vertex>
        vec4 wpos4 = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpos4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vec3 wpos = wpos4.xyz;
        vHz = ${HAZE_GLSL};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHz;\nuniform vec3 uHaze;')
      .replace('#include <opaque_fragment>', `${sat !== 1 ? `outgoingLight = mix(vec3(dot(outgoingLight, vec3(0.299, 0.587, 0.114))), outgoingLight, ${sat.toFixed(3)});` : ''}
${haze ? 'outgoingLight = mix(outgoingLight, uHaze, vHz);' : ''}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `outdoor-${billboard ? 1 : 0}-${haze ? 1 : 0}-${sat}-${atlas ? 1 : 0}`;
  return m;
}

/** 照片贴图：平铺、sRGB、各向异性 */
export function photo(bin: Bin, file: string, onLoad?: (t: THREE.Texture) => void) {
  const t = bin.add(new THREE.TextureLoader().load(asset(file), onLoad));
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/**
 * 按世界坐标给几何体算 uv（像三向投影，每个顶点按自己的法线选平面）：朝上的面用 xz，朝前后的用 xy，朝左右的用 zy。
 * 墙、屋顶、田垄这些尺寸各不相同的盒子，贴图的颗粒大小就都一样了。scale 是一张贴图对应多少米。
 */
export function worldUV(geo: THREE.BufferGeometry, scale: number) {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) / scale, y = p.getY(i) / scale, z = p.getZ(i) / scale;
    if (ay >= ax && ay >= az) uv.set([x, z], i * 2); else if (az >= ax) uv.set([x, y], i * 2); else uv.set([z, y], i * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

type Meta = Record<string, { w: number; h: number; uv: [number, number, number, number] }>;
interface Item { name: string; x: number; y: number; z: number; h: number; flip: boolean; tint: number; squeeze: number }

/**
 * 一批公告板：先 add 记下来，load 之后才真正建网格（照片是异步加载的）。
 * 所有照片拼在一张图集里（tools/pack_impostors.py），每个实例带一个 aRect 属性指明用图集里的哪一块：全部只占一次 draw call。
 */
export class Impostors {
  private items: Item[] = [];
  constructor(private bin: Bin) {}
  /** name 是图集里的名字（比如 island_tree_02_0）；h 是要的高度（米）；tint 是整体亮度，squeeze 横向压扁 */
  add(name: string, x: number, y: number, z: number, h: number, o: { flip?: boolean; tint?: number; squeeze?: number } = {}) {
    this.items.push({ name, x, y, z, h, flip: !!o.flip, tint: o.tint ?? 1, squeeze: o.squeeze ?? 1 });
  }
  /** 加载图集并建好网格，返回实例数；失败就 reject，调用方保留代码画的版本 */
  async load(parent: THREE.Object3D, high: boolean) {
    const [meta, tex] = await Promise.all([
      fetch(asset('impostors/impostors.json')).then((r) => r.json() as Promise<Meta>),
      new THREE.TextureLoader().loadAsync(asset('impostors/impostors.webp')),
    ]);
    this.bin.add(tex); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const list = this.items.filter((it) => meta[it.name]);
    // 照片底边比地面低一点点（渲图时四周留了 2% 的边）
    const quad = this.bin.add(new THREE.PlaneGeometry(1, 1).translate(0, 0.48, 0));
    const rect = new Float32Array(list.length * 4);
    const mat = outdoorMaterial(this.bin, { map: tex, alphaTest: 0.42, billboard: true, atlas: true, side: THREE.DoubleSide });
    mat.alphaToCoverage = high; // high 档的后期是多重采样的：叶子边缘能柔一点
    const mesh = new THREE.InstancedMesh(quad, mat, list.length);
    const mx = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((it, i) => {
      const m = meta[it.name];
      const sx = it.h * (m.w / m.h) * it.squeeze * (it.flip ? -1 : 1);
      mx.makeScale(sx, it.h, 1).setPosition(it.x, it.y, it.z);
      mesh.setMatrixAt(i, mx);
      mesh.setColorAt(i, c.setScalar(it.tint));
      rect.set(m.uv, i * 4);
    });
    quad.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
    mesh.frustumCulled = false; // 实例散在一大片地上，用默认的包围球会被误剔
    mesh.userData.noAO = true;  // 遮蔽通道的法线材质不认镂空，也不会转向镜头
    parent.add(mesh);
    return list.length;
  }
}
