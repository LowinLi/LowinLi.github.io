import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { L, SUN_DIR } from './layout';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';

/**
 * high 档的后期处理链：
 * 渲染 → 环境光遮蔽（物体交界处变暗）→ 景深（焦点跟着显示器）→ 泛光 → 太阳光束 + 暗角 → 色调映射
 */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.95;
  // 遮蔽通道用法线材质重画一遍场景：精灵、接触阴影、玻璃这类半透明的东西不该参与，先藏起来
  let skip: THREE.Object3D[] | null = null;
  const collect = () => {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mat = Array.isArray(m) ? m[0] : m;
      if ((o as THREE.Sprite).isSprite || (mat && mat.transparent && !mat.depthWrite)) list.push(o);
    });
    return list;
  };
  const renderAO = gtao.render.bind(gtao);
  gtao.render = (...args: Parameters<typeof renderAO>) => {
    skip ??= collect();
    const was = skip.map((o) => o.visible);
    skip.forEach((o) => { o.visible = false; });
    renderAO(...args);
    skip.forEach((o, i) => { o.visible = was[i]; });
  };
  composer.addPass(gtao);

  // 景深：复用遮蔽通道的深度图，不用再画一遍场景
  const dof = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: gtao.depthTexture },
      uNear: { value: camera.near }, uFar: { value: camera.far },
      uFocus: { value: 2.7 }, uTexel: { value: new THREE.Vector2() }, uMax: { value: 3 },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uMax; uniform vec2 uTexel; varying vec2 vUv;
      float coc(vec2 uv){
        float d = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
        float far = clamp((d - uFocus * 1.3) / (uFocus * 2.4), 0., 1.);
        float near = clamp((uFocus * .72 - d) / (uFocus * .5), 0., 1.);
        return max(far * .8, near);
      }
      void main(){
        float c = coc(vUv);
        vec4 acc = texture2D(tDiffuse, vUv); float w = 1.;
        if (c > .02) {
          for (int i = 1; i <= 18; i++) {
            float a = float(i) * 2.39996, r = sqrt(float(i) / 18.) * c * uMax;
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
          vec2 delta = (vUv - uSun) * (.9 / 40.), uv = vUv - delta * jitter; float decay = 1.; vec3 acc = vec3(0.);
          for (int i = 0; i < 40; i++) {
            uv -= delta;
            vec3 s = texture2D(tDiffuse, uv).rgb;
            // 只让太阳周围那片天空发光束：喇叭高光、浮尘这些远离太阳的亮点不算
            float nearSun = smoothstep(.34, .04, distance(uv, uSun));
            acc += s * clamp(dot(s, vec3(.3, .6, .1)) - 1.7, 0., 2.) * decay * nearSun;
            decay *= .965;
          }
          c.rgb += acc * (uStrength / 40.);
        }
        vec2 p = vUv - .5;
        c.rgb *= 1. - dot(p, p) * .5;
        c.rgb *= vec3(1.03, 1., .965);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(rays);
  composer.addPass(new OutputPass());

  const sunWorld = new THREE.Vector3(), v = new THREE.Vector3(), dir = new THREE.Vector3();
  const focusAt = new THREE.Vector3(L.monitor.x, L.monitor.cy, L.monitor.z);
  return {
    setSize(w: number, h: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      dof.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
      dof.uniforms.uMax.value = 3.2 * pr * Math.max(0.6, h / 900);
    },
    render(dt: number) {
      // 焦点落在显示器上：推近显示器时景深会自动变浅
      dof.uniforms.uFocus.value = -v.copy(focusAt).applyMatrix4(camera.matrixWorldInverse).z;
      // 太阳在屏幕上的位置；背对太阳或太阳出画太远时关掉光束
      sunWorld.copy(camera.position).addScaledVector(SUN_DIR, 300);
      v.copy(sunWorld).project(camera);
      const facing = camera.getWorldDirection(dir).dot(SUN_DIR);
      const inView = THREE.MathUtils.smoothstep(1.6 - Math.max(Math.abs(v.x), Math.abs(v.y)), 0, 0.6);
      rays.uniforms.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      rays.uniforms.uStrength.value = facing > 0 ? 0.3 * inView : 0;
      composer.render(dt);
    },
    dispose() { composer.dispose(); },
  };
}
