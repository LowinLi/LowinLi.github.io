import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L, SUN_DIR } from '../layout';
import { asset } from '../util';

/**
 * 窗外的天空和大海：一个包住场景的球，片元着色器按视线方向计算。
 * 天空是实拍的日出全景图（加载完成前用程序天空顶替）；海面是程序生成的，有波浪、光路和碎光，
 * 反射的就是那张实拍天空。同时把天空烘成环境贴图，让室内的黄铜、釉面、唱片能映出朝霞。
 */
export const seaSky: SceneObject = ({ scene, renderer, tier }) => {
  const bin = new Bin();
  const mat = bin.add(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR },
      uSeaY: { value: L.seaY },
      uDetail: { value: tier === 'high' ? 1 : 0 },
      uPhoto: { value: 0 },
      tSky: { value: null },
      tPano: { value: null },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vWorld = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime, uSeaY, uDetail, uPhoto; uniform vec3 uSun; uniform sampler2D tSky, tPano;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return s; }

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
      // 实拍的日出全景（Poly Haven: Umhlanga Sunrise）。照片里太阳在海平线上方约 2.3°，
      // 整体下移这么多，让太阳正好卡在海平线上、只露出一半。
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
      vec3 sky(vec3 d){ return uPhoto > .001 ? mix(skyProc(d), skyPhoto(d, false), uPhoto) : skyProc(d); }

      vec2 wave(vec2 p, vec2 dir, float f, float a, float s){ return dir * (f * a * cos(dot(dir, p) * f + uTime * s)); }

      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 sunH = normalize(vec3(uSun.x, 0., uSun.z));
        vec3 haze = sky(normalize(vec3(d.x, .002, d.z)));
        vec3 col;
        if (d.y > 0.) {
          // 程序天空自带一个画出来的太阳；实拍天空里太阳就在照片上
          vec3 proc = skyProc(d);
          vec3 sv = d - uSun;
          float disc = smoothstep(.041, .0385, length(vec2(sv.x, sv.y * 1.1)));
          proc = mix(proc, mix(vec3(5.,1.5,.3), vec3(6.,3.3,1.), smoothstep(0., .04, d.y)), disc);
          col = uPhoto > .001 ? mix(proc, skyPhoto(d, true), uPhoto) : proc;
        } else {
          float t = (uSeaY - cameraPosition.y) / min(d.y, -1e-4);
          vec2 p = cameraPosition.xz + d.xz * t;
          vec2 g = wave(p, vec2(.31,.95), .16, .55, .7) + wave(p, vec2(-.5,.87), .29, .30, .9)
                 + wave(p, vec2(.8,.6), .62, .13, 1.3) + wave(p, vec2(-.2,.98), 1.3, .05, 1.9);
          vec2 q = p * 1.7 + vec2(uTime * .35, uTime * .22);
          g += (vec2(noise(q + vec2(.37, 0.)), noise(q + vec2(0., .37))) - noise(q)) * 1.3;
          // 近处的海面再叠两层更细的波纹：从高处俯看窗外时，只有大波纹会显得像一团团色块
          float nearSea = 1. / (1. + t * .04);
          vec2 q2 = p * 5.3 - vec2(uTime * .5, uTime * .3); g += (vec2(noise(q2 + vec2(.2, 0.)), noise(q2 + vec2(0., .2))) - noise(q2)) * (.5 + .9 * nearSea);
          vec2 q3 = p * 13. + vec2(uTime * .9, -uTime * .6); g += (vec2(noise(q3 + vec2(.1, 0.)), noise(q3 + vec2(0., .1))) - noise(q3)) * 1.1 * nearSea;
          g *= 1. / (1. + t * .012);
          vec3 n = normalize(vec3(-g.x, 1., -g.y));
          vec3 r = reflect(d, n); r.y = abs(r.y) + .015; r = normalize(r);
          float fr = .03 + .97 * pow(1. - max(dot(-d, n), 0.), 5.);
          vec3 deep = mix(vec3(.02,.13,.17), vec3(.008,.05,.10), smoothstep(8., 180., t));
          col = mix(deep, sky(r) * vec3(.84,.9,1.), fr * .85);
          float sp = max(dot(r, uSun), 0.);
          col += vec3(1.,.5,.16) * pow(sp, 200.) * 6.;                          // 光路
          float path = pow(max(dot(normalize(vec3(d.x, 0., d.z)), sunH), 0.), 90.);
          float glint = smoothstep(.74, .96, noise(p * 2.6 + uTime * vec2(1.1, .7)));
          col += vec3(1.,.72,.38) * glint * path * 2.2 * uDetail;               // 光路上跳动的碎光
          col = mix(col, haze, smoothstep(-.009, 0., d.y) * .55);                 // 海天交界的薄雾
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const geo = bin.add(new THREE.SphereGeometry(400, 48, 24));
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  scene.add(dome);

  // 把天空烘成环境贴图，让室内的金属和釉面映出它
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, mat));
  let env: THREE.Texture | null = null;
  const bake = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
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
    frame(dt, t) {
      mat.uniforms.uTime.value = t;
      if (loaded && fade < 1) {
        fade = Math.min(1, fade + dt / 1.2);
        mat.uniforms.uPhoto.value = fade;
        if (fade === 1) bake();
      }
    },
    stop() { stopped = true; scene.remove(dome); scene.environment = null; env?.dispose(); bin.dispose(); },
  };
};
