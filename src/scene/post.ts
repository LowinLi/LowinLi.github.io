import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { L, SUN_DIR } from './layout';
import { SKY } from './daytime';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';

/**
 * high 档的后期处理链：
 * 渲染 → 环境光遮蔽（物体交界处变暗）→ 景深（焦点跟着显示器）→ 泛光 → 太阳光束 + 暗角 → 色调映射
 */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  gtao.blendIntensity = 0.95;
  // 遮蔽通道用法线材质重画一遍场景：精灵、接触阴影、玻璃这类半透明的东西不该参与，先藏起来
  // 镂空贴图的叶片（userData.noAO）也跳过：法线材质不认镂空，会在叶子周围留一圈黑边
  let skip: THREE.Object3D[] | null = null;
  const collect = () => {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mat = Array.isArray(m) ? m[0] : m;
      if ((o as THREE.Sprite).isSprite || o.userData.noAO || (mat && mat.transparent && !mat.depthWrite)) list.push(o);
    });
    return list;
  };
  const renderAO = gtao.render.bind(gtao);
  // 镜头不动时遮蔽几乎不变：只每 4 帧重算一次（法线 / 深度重画整个场景 + 遮蔽 + 降噪），其余帧直接把上次的结果叠上去。
  // 深度图（景深也用它）同样沿用上一次的。镜头一动就每帧重算。
  let aoAge = 99, camStill = false;
  const g = gtao as unknown as { copyMaterial: THREE.ShaderMaterial; blendMaterial: THREE.ShaderMaterial; pdRenderTarget: THREE.WebGLRenderTarget; renderToScreen: boolean;
    _renderPass(r: THREE.WebGLRenderer, m: THREE.Material, t: THREE.WebGLRenderTarget | null): void };
  gtao.render = (...args: Parameters<typeof renderAO>) => {
    const [r, write, read] = args;
    if (camStill && ++aoAge < 4) {
      const dst = g.renderToScreen ? null : write;
      g.copyMaterial.uniforms.tDiffuse.value = read.texture; g.copyMaterial.blending = THREE.NoBlending;
      g._renderPass(r, g.copyMaterial, dst);
      g.blendMaterial.uniforms.intensity.value = gtao.blendIntensity; g.blendMaterial.uniforms.tDiffuse.value = g.pdRenderTarget.texture;
      g._renderPass(r, g.blendMaterial, dst);
      return;
    }
    aoAge = 0;
    skip ??= collect();
    const was = skip.map((o) => o.visible);
    skip.forEach((o) => { o.visible = false; });
    renderAO(...args);
    skip.forEach((o, i) => { o.visible = was[i]; });
  };
  // 遮蔽在半分辨率下算（像素少 3/4），叠回去时双线性放大：遮蔽本来就是柔和的大片暗部，看不出差别
  const aoSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w: number, h: number) => aoSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  composer.addPass(gtao);

  // 景深：复用遮蔽通道的深度图，不用再画一遍场景
  const dof = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: gtao.depthTexture },
      uNear: { value: camera.near }, uFar: { value: camera.far },
      uFocus: { value: 2.7 }, uTexel: { value: new THREE.Vector2() }, uMax: { value: 3 }, uFarBlur: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uMax, uFarBlur; uniform vec2 uTexel; varying vec2 vUv;
      float coc(vec2 uv){
        float d = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
        float far = clamp((d - uFocus * 1.3) / (uFocus * 2.4), 0., 1.);
        float near = clamp((uFocus * .72 - d) / (uFocus * .5), 0., 1.);
        return max(far * .8 * uFarBlur, near);
      }
      void main(){
        float c = coc(vUv);
        vec4 acc = texture2D(tDiffuse, vUv); float w = 1.;
        if (c > .02) {
          for (int i = 1; i <= 12; i++) {
            float a = float(i) * 2.39996, r = sqrt(float(i) / 12.) * c * uMax;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
            float k = .25 + coc(uv);       // 清晰的像素少往模糊区里渗
            acc += texture2D(tDiffuse, uv) * k; w += k;
          }
        }
        gl_FragColor = acc / w;
      }`,
  });
  // ShaderPass 会克隆 uniforms（连贴图一起），所以深度图要在构造之后再接上
  dof.uniforms.tDepth.value = gtao.depthTexture;
  composer.addPass(dof);

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.6, 2.7);
  composer.addPass(bloom);

  // 太阳光束（从太阳的屏幕位置向外做径向模糊，窗框会在光里拉出暗条）+ 暗角 + 一点暖调
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.6) }, uStrength: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        if (uStrength > .001) {
          // 每个像素的起点错开一点，避免采样步长形成一圈圈的条纹
          float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 delta = (vUv - uSun) * (.9 / 24.), uv = vUv - delta * jitter; float decay = 1.; vec3 acc = vec3(0.);
          for (int i = 0; i < 24; i++) {
            uv -= delta;
            vec3 s = texture2D(tDiffuse, uv).rgb;
            // 只让太阳周围那片天空发光束：喇叭高光、浮尘这些远离太阳的亮点不算
            float nearSun = smoothstep(.2, .03, distance(uv, uSun));
            acc += s * clamp(dot(s, vec3(.3, .6, .1)) - 1.7, 0., 2.) * decay * nearSun;
            decay *= .94;
          }
          c.rgb += acc * (uStrength / 24.);
        }
        vec2 p = vUv - .5;
        c.rgb *= 1. - dot(p, p) * .5;
        c.rgb *= vec3(1.03, 1., .965);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(rays);
  composer.addPass(new OutputPass());
  // 调试：?nopass=ao,dof,bloom,rays 关掉其中几道，查哪一道出的问题
  const nopass = new URLSearchParams(location.search).get('nopass')?.split(',') ?? [];
  if (nopass.includes('ao')) gtao.enabled = false;
  if (nopass.includes('dof')) dof.enabled = false;
  if (nopass.includes('bloom')) bloom.enabled = false;
  if (nopass.includes('rays')) rays.enabled = false;

  const sunWorld = new THREE.Vector3(), v = new THREE.Vector3(), dir = new THREE.Vector3();
  const monitorAt = new THREE.Vector3(L.monitor.x, L.monitor.cy, L.monitor.z), focusAt = monitorAt.clone();
  let farBlur = 1, lite = false;
  return {
    /** 场景里后来才加进来的东西（异步加载的模型）要重新收集一次 */
    refresh() { skip = null; },
    /** 景深的焦点：默认在显示器上；拉近看咖啡时对焦到杯子 */
    setFocus(p: THREE.Vector3 | null) { focusAt.copy(p ?? monitorAt); },
    /** 帧率不够时降级：关掉环境光遮蔽（它要把场景重画一遍）、景深和太阳光束，只留泛光、暗角和色调映射 */
    setLite(on: boolean) { gtao.enabled = !on; dof.enabled = !on; lite = on; },
    /** 走到窗前看风景时关掉远景虚化，远处的稻田和山要是清楚的 */
    setFarBlur(on: boolean) { farBlur = on ? 1 : 0; },
    setSize(w: number, h: number) {
      aoAge = 99;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      dof.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
      dof.uniforms.uMax.value = 3.2 * pr * Math.max(0.6, h / 900);
    },
    /** still：镜头这一帧没动（遮蔽可以沿用上一次的） */
    render(dt: number, still = false) {
      camStill = still;
      // 焦点落在显示器上：推近显示器时景深会自动变浅
      // 显示器跑到镜头后面（走到窗前）时，焦点放到几米外
      dof.uniforms.uFocus.value = Math.max(-v.copy(focusAt).applyMatrix4(camera.matrixWorldInverse).z, 0.25);
      if (dof.uniforms.uFocus.value <= 0.25) dof.uniforms.uFocus.value = 4;
      dof.uniforms.uFarBlur.value += (farBlur - dof.uniforms.uFarBlur.value) * Math.min(1, dt * 3);
      // 太阳在屏幕上的位置；背对太阳或太阳出画太远时关掉光束
      // 清晨的天空是实拍照片，太阳在照片里的位置（SUN_DIR）；之后用真实的太阳方向。太阳落山 / 夜里没有光束
      const sd = SKY.morning > 0.5 ? SUN_DIR : SKY.sunDir;
      sunWorld.copy(camera.position).addScaledVector(sd, 300);
      v.copy(sunWorld).project(camera);
      const facing = camera.getWorldDirection(dir).dot(sd) * (SKY.morning > 0.5 ? 1 : SKY.day * THREE.MathUtils.smoothstep(SKY.sunEl, -0.01, 0.05));
      const inView = THREE.MathUtils.smoothstep(1.6 - Math.max(Math.abs(v.x), Math.abs(v.y)), 0, 0.6);
      rays.uniforms.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      rays.uniforms.uStrength.value = facing > 0 && !lite ? 0.2 * inView : 0;
      composer.render(dt);
    },
    dispose() { composer.dispose(); },
  };
}
