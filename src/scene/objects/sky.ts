import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { SUN_DIR } from '../layout';
import { asset } from '../util';

/**
 * 天空：一个包住场景的球，片元着色器按视线方向取色。
 * 用的是实拍的日出全景图（加载完成前用程序天空顶替）；地平线以下画成田野的雾色（实际会被地面和远山挡住）。
 * 同时把天空烘成环境贴图，让室内的黄铜、釉面、唱片能映出朝霞。
 */
export const sky: SceneObject = ({ scene, renderer }) => {
  const bin = new Bin();
  const mat = bin.add(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: SUN_DIR }, uPhoto: { value: 0 }, tSky: { value: null }, tPano: { value: null } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vWorld = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      uniform float uPhoto; uniform vec3 uSun; uniform sampler2D tSky, tPano;
      // 程序天空：实拍图加载完成前的替身
      vec3 skyProc(vec3 d){
        float h = max(d.y, 0.);
        float sd = max(dot(d, uSun), 0.);
        float az = sd * sd;
        vec3 hor = mix(vec3(.72,.47,.56), vec3(1.0,.45,.17), az);
        vec3 mid = mix(vec3(.40,.54,.82), vec3(.74,.62,.68), az * .6);
        vec3 c = mix(hor, mid, smoothstep(0., .22, h));
        c = mix(c, vec3(.10,.24,.57), smoothstep(.18, .9, h));
        c += vec3(1.,.52,.22) * exp(-h * 24.) * (.10 + .45 * az);
        c += vec3(1.,.42,.12) * pow(sd, 64.) * .55 + vec3(1.,.72,.38) * pow(sd, 800.) * 1.2;
        return c;
      }
      // 实拍的日出全景（Poly Haven: Umhlanga Sunrise）。照片里太阳在地平线上方约 2.3°，整体下移这么多，让太阳正好卡在地平线上。
      // 全景低清图铺满整个天球；窗外看得到的那一块（太阳左右各约 60°）再叠一张高清裁切。
      vec3 skyPhoto(vec3 d, bool sharp){
        float az = atan(d.x, -d.z) - atan(uSun.x, -uSun.z);
        float el = asin(clamp(d.y, -1., 1.)) + .040;
        vec2 uv = vec2(fract(.6003 + az / 6.2831853), .5 - el / 3.14159265);
        vec3 c = texture2D(tPano, vec2(uv.x, 1. - uv.y)).rgb;
        if (sharp) {
          vec2 cu = (uv - vec2(.42810, .19531)) / vec2(.34448, .30762);
          float edge = smoothstep(0., .05, cu.x) * smoothstep(1., .95, cu.x) * smoothstep(0., .06, cu.y) * step(cu.y, 1.);
          if (edge > 0.) c = mix(c, texture2D(tSky, vec2(cu.x, 1. - cu.y)).rgb, edge);
        }
        c *= 1.12;
        // 照片是压过亮度的：给太阳本体补回高动态的亮度，泛光和光束才有东西可用
        float ang = acos(clamp(dot(d, uSun), -1., 1.));
        c += vec3(6., 3.4, 1.1) * smoothstep(.014, .007, ang) + vec3(1., .55, .2) * exp(-ang * 30.) * .5;
        return c;
      }
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 up = vec3(d.x, max(d.y, .0), d.z);
        vec3 proc = skyProc(normalize(up));
        vec3 sv = d - uSun;
        float disc = smoothstep(.041, .0385, length(vec2(sv.x, sv.y * 1.1)));
        proc = mix(proc, mix(vec3(5.,1.5,.3), vec3(6.,3.3,1.), smoothstep(0., .04, d.y)), disc);
        vec3 col = uPhoto > .001 ? mix(proc, skyPhoto(normalize(up), true), uPhoto) : proc;
        // 地平线以下：晨雾里的田野色
        if (d.y < 0.) col = mix(col, vec3(.36,.42,.28), smoothstep(0., -.06, d.y) * .8);
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const geo = bin.add(new THREE.SphereGeometry(900, 48, 24));
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  scene.add(dome);

  // 把天空烘成环境贴图，让室内的金属和釉面映出它
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, mat));
  let env: THREE.Texture | null = null;
  const bake = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
    pmrem.dispose();
    env?.dispose();
    env = next;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
  };
  bake();

  // 实拍天空：加载完成后淡入，并重新烘一次环境贴图
  let fade = 0, loaded = false, stopped = false;
  const loader = new THREE.TextureLoader();
  Promise.all([loader.loadAsync(asset('sky/sunrise_window.jpg')), loader.loadAsync(asset('sky/sunrise_pano.jpg'))]).then(([hi, pano]) => {
    if (stopped) { hi.dispose(); pano.dispose(); return; }
    for (const t of [hi, pano]) { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.anisotropy = 8; bin.add(t); }
    pano.wrapS = THREE.RepeatWrapping;
    mat.uniforms.tSky.value = hi; mat.uniforms.tPano.value = pano;
    loaded = true;
  }).catch((e) => console.warn('[scene] 实拍天空加载失败，继续用程序天空', e));

  return {
    frame(dt) {
      if (loaded && fade < 1) {
        fade = Math.min(1, fade + dt / 1.2);
        mat.uniforms.uPhoto.value = fade;
        if (fade === 1) bake();
      }
    },
    stop() { stopped = true; scene.remove(dome); scene.environment = null; env?.dispose(); bin.dispose(); },
  };
};
