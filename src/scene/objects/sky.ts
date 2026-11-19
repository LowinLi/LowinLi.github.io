import * as THREE from 'three';
import { Bin, emit, type SceneObject } from '../types';
import { SUN_DIR } from '../layout';
import { asset } from '../util';
import { isReal, SKY, updateSky } from '../daytime';

/**
 * 天空：一个包住场景的球，片元着色器按视线方向取色。跟着一天里的时刻变（`daytime.ts`）：
 * - 清晨：实拍的日出全景图（加载完成前用程序天空顶替），太阳卡在远山的豁口里；
 * - 白天：程序画的蓝天，太阳在真实的高度和方位上（上午在窗外右前方，下午转到屋后）；
 * - 傍晚：太阳在屋后落山，窗外这边是被晚霞照着的粉橙色天、地平线上一道暗蓝的地影；
 * - 夜里：深蓝的夜空、星星，窗外偏右挂着月亮（月相按真实日期算）。
 * 地平线以下画成田野的雾色（实际会被地面和远山挡住）。
 * 同时把天空烘成环境贴图，让室内的不锈钢、釉面映出当时的天色；天色明显变了就重烘。
 */
export const sky: SceneObject = ({ scene, renderer, bus }) => {
  const bin = new Bin();
  const mat = bin.add(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: SUN_DIR }, uSunNow: { value: SKY.sunDir }, uPhoto: { value: 0 }, tSky: { value: null }, tPano: { value: null },
      uDay: { value: 1 }, uNight: { value: 0 }, uGold: { value: 1 }, uEvening: { value: 0 }, uMorning: { value: 1 },
      uMoon: { value: SKY.moonDir }, uMoonAge: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vWorld = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      uniform float uPhoto, uDay, uNight, uGold, uEvening, uMorning, uMoonAge; uniform vec3 uSun, uSunNow, uMoon; uniform sampler2D tSky, tPano;
      float hash(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      vec3 hash3(vec3 p){ return vec3(hash(p), hash(p + 17.1), hash(p + 31.7)); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        float a = hash(vec3(i, 1.)), b = hash(vec3(i + vec2(1., 0.), 1.)), c = hash(vec3(i + vec2(0., 1.), 1.)), d = hash(vec3(i + 1., 1.));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      // 白天 / 傍晚的程序天空（太阳在 uSunNow）
      vec3 skyDay(vec3 d){
        float h = max(d.y, 0.);
        vec3 zen = vec3(.12, .29, .68), hor = vec3(.56, .69, .86);
        vec3 c = mix(hor, zen, pow(smoothstep(0., .9, h), .6));
        // 傍晚：太阳在屋后落下，窗外这边的天被晚霞染成粉橙，地平线上一道暗蓝的地影
        float eve = uEvening * uGold;
        vec3 glow = mix(vec3(1., .62, .42), vec3(.92, .55, .62), smoothstep(.02, .25, h));
        c = mix(c, glow, eve * (1. - smoothstep(.0, .55, h)) * .85);
        c = mix(c, vec3(.33, .36, .52), eve * (1. - smoothstep(.0, .06, h)) * .6);
        c = mix(c, c * vec3(.75, .62, .7), eve * smoothstep(.3, .9, h));
        float sd = max(dot(d, uSunNow), 0.);
        c += vec3(1., .85, .6) * pow(sd, 12.) * .25 + vec3(1., .9, .7) * pow(sd, 300.) * 1.5;
        float ang = acos(clamp(dot(d, uSunNow), -1., 1.));
        c += vec3(7., 6.2, 4.8) * smoothstep(.012, .008, ang);
        return c;
      }
      // 夜空：深蓝渐变、星星、月亮（月相：受光的一侧按月龄从右往左转）
      vec3 skyNight(vec3 d){
        float h = max(d.y, 0.);
        vec3 c = mix(vec3(.028, .04, .075), vec3(.006, .01, .028), smoothstep(0., .7, h));
        vec3 q = d * 260.; vec3 cell = floor(q); float r = hash(cell);
        if (r > .982) {
          vec3 o = cell + .5 + (hash3(cell) - .5) * .7;
          float k = smoothstep(.42, .0, length(q - o)) * smoothstep(.02, .2, h);
          c += vec3(.85, .9, 1.) * k * (r - .982) * 120.;
        }
        float ma = acos(clamp(dot(d, uMoon), -1., 1.)), R = .026;
        float full = .5 - .5 * cos(uMoonAge * 6.2831853);
        c += vec3(.55, .6, .75) * exp(-ma * 9.) * .1 * full;     // 月晕
        if (ma < R * 1.05) {
          vec3 rt = normalize(cross(uMoon, vec3(0., 1., 0.))), up = cross(rt, uMoon);
          vec2 p = vec2(dot(d, -rt), dot(d, up)) / R;
          float rr = dot(p, p);
          if (rr < 1.) {
            vec3 n = vec3(p, sqrt(1. - rr));
            float ph = uMoonAge * 6.2831853;
            float lit = smoothstep(-.06, .12, dot(n, vec3(sin(ph), 0., -cos(ph))));
            float maria = vnoise(p * 2.3 + 4.) * .6 + vnoise(p * 6.1) * .4;
            vec3 surf = vec3(1., .96, .86) * (1.05 - smoothstep(.45, .8, maria) * .32);
            c = mix(c, surf * (lit * 1.6 + .008), smoothstep(1., .9, rr) * (.35 + .65 * lit));
          }
        }
        return c;
      }
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
        vec3 morning = uPhoto > .001 ? mix(proc, skyPhoto(normalize(up), true), uPhoto) : proc;
        vec3 col = uMorning > .001 ? morning : vec3(0.);
        if (uMorning < .999) col = mix(skyDay(normalize(up)), col, uMorning);
        if (uNight > .001) col = mix(col, skyNight(normalize(up)), uNight);
        // 地平线以下：晨雾里的田野色（夜里跟着暗下去）
        if (d.y < 0.) col = mix(col, vec3(.36,.42,.28) * mix(1., .08, uNight), smoothstep(0., -.06, d.y) * .8);
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

  // 天色明显变了（SKY.version 变）就重烘环境贴图，最多每 0.4 秒一次
  let baked = -1, sinceBake = 0, sinceState = 1;
  const u = mat.uniforms;
  return {
    frame(dt) {
      updateSky(dt);
      // 告诉 HTML 层现在几点（拨时间面板上显示）
      sinceState += dt;
      if (sinceState > 0.5) { sinceState = 0; emit(bus, 'time:state', { h: SKY.hours, real: isReal() }); }
      // 清晨用实拍照片：太阳升高（gold 退掉）或到了下午就换成程序天空
      u.uMorning.value = SKY.morning;
      u.uDay.value = SKY.day; u.uNight.value = SKY.night; u.uGold.value = SKY.gold; u.uEvening.value = SKY.evening; u.uMoonAge.value = SKY.moonAge;
      if (loaded && fade < 1) {
        fade = Math.min(1, fade + dt / 1.2);
        u.uPhoto.value = fade;
        if (fade === 1) baked = -1;
      }
      sinceBake += dt;
      if (baked !== SKY.version && sinceBake > 0.4) { baked = SKY.version; sinceBake = 0; bake(); scene.environmentIntensity = 0.55; }
    },
    stop() { stopped = true; scene.remove(dome); scene.environment = null; env?.dispose(); bin.dispose(); },
  };
};
