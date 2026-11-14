import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L, SUN_DIR } from '../layout';

/**
 * 窗外的天空和大海：一个包住场景的球，片元着色器按视线方向计算
 * 日出天空、两层云、远处的岬角和灯塔，以及有波浪、反光和碎光的海面。
 * 同时把这片天空烘成环境贴图，让室内的黄铜、釉面、唱片能映出朝霞。
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
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vWorld = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime, uSeaY, uDetail; uniform vec3 uSun;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return s; }

      vec3 sky(vec3 d){
        float h = max(d.y, 0.);
        float sd = max(dot(d, uSun), 0.);
        float az = sd * sd;
        vec3 hor = mix(vec3(.72,.47,.56), vec3(1.0,.45,.17), az);              // 背光处偏粉，朝阳处偏橙
        vec3 mid = mix(vec3(.40,.54,.82), vec3(.74,.62,.68), az * .6);
        vec3 zen = vec3(.10,.24,.57);
        vec3 c = mix(hor, mid, smoothstep(0., .22, h));
        c = mix(c, zen, smoothstep(.18, .9, h));
        c += vec3(1.,.52,.22) * exp(-h * 24.) * (.10 + .45 * az);              // 贴着海平线的一条亮带
        c += vec3(1.,.42,.12) * pow(sd, 64.) * .55 + vec3(1.,.72,.38) * pow(sd, 800.) * 1.2;
        return c;
      }

      // 两层云：高处被染色的卷云；低处一排积云，底部被朝阳照亮
      vec4 clouds(vec3 d){
        if (d.y < .004) return vec4(0.);
        float sd = max(dot(normalize(vec3(d.x, 0., d.z)), normalize(vec3(uSun.x, 0., uSun.z))), 0.);
        vec2 uv = d.xz / (d.y + .1);
        float n1 = fbm(uv * vec2(.35, 1.4) + vec2(uTime * .003, 0.));
        float a1 = smoothstep(.5, .8, n1) * smoothstep(.1, .3, d.y) * (1. - smoothstep(.55, .95, d.y)) * .6;
        vec3 c1 = mix(vec3(.80,.63,.72), vec3(1.,.80,.58), sd * sd);
        if (uDetail < .5) return vec4(c1, a1);
        vec2 q = vec2(atan(d.x, -d.z) * 3.6, d.y * 15.) + vec2(uTime * .002, 0.);
        float n2 = fbm(q);
        float a2 = smoothstep(.47, .68, n2) * smoothstep(.018, .055, d.y) * (1. - smoothstep(.1, .2, d.y)) * .92;
        float under = clamp((n2 - fbm(q + vec2(0., -.22))) * 3. + .5, 0., 1.);
        vec3 c2 = mix(vec3(.36,.33,.47), vec3(1.,.56,.28), under * (.3 + .7 * pow(sd, 1.5)));
        return vec4((c1 * a1 + c2 * a2) / max(a1 + a2, 1e-3), max(a1, a2));
      }

      vec2 wave(vec2 p, vec2 dir, float f, float a, float s){ return dir * (f * a * cos(dot(dir, p) * f + uTime * s)); }

      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 sunH = normalize(vec3(uSun.x, 0., uSun.z));
        vec3 haze = sky(normalize(vec3(d.x, .002, d.z)));
        vec3 col;
        if (d.y > 0.) {
          col = sky(d);
          // 太阳：贴近海平线处更红，略微压扁
          vec3 sv = d - uSun;
          float disc = smoothstep(.041, .0385, length(vec2(sv.x, sv.y * 1.1)));
          col = mix(col, mix(vec3(5.,1.5,.3), vec3(6.,3.3,1.), smoothstep(0., .04, d.y)), disc);
          vec4 cl = clouds(d);
          col = mix(col, cl.rgb, cl.a * (1. - disc * .7));
          // 右侧远处的岬角和灯塔
          float az = atan(d.x, -d.z);
          float land = smoothstep(.17, .3, az) * (.006 + .02 * noise(vec2(az * 9., 3.)) + .006 * noise(vec2(az * 45., 7.)));
          if (d.y < land) col = mix(vec3(.17,.17,.27), haze, .42);
          float lx = abs(az - .262);
          if (lx < .0022 && d.y < .043) col = mix(mod(d.y, .014) < .006 ? vec3(.75,.25,.2) : vec3(.92,.88,.82), haze, .3);
          if (lx < .0034 && d.y > .043 && d.y < .048) col = vec3(.12,.12,.16);
          float beam = .35 + .65 * pow(max(sin(uTime * 1.1), 0.), 10.);
          col += vec3(1.,.9,.6) * exp(-length(vec2(az - .262, d.y - .0455)) * 520.) * 2.5 * beam;
        } else {
          float t = (uSeaY - cameraPosition.y) / min(d.y, -1e-4);
          vec2 p = cameraPosition.xz + d.xz * t;
          vec2 g = wave(p, vec2(.31,.95), .16, .55, .7) + wave(p, vec2(-.5,.87), .29, .30, .9)
                 + wave(p, vec2(.8,.6), .62, .13, 1.3) + wave(p, vec2(-.2,.98), 1.3, .05, 1.9);
          vec2 q = p * 1.7 + vec2(uTime * .35, uTime * .22);
          g += (vec2(noise(q + vec2(.37, 0.)), noise(q + vec2(0., .37))) - noise(q)) * 1.3;
          if (uDetail > .5) { vec2 q2 = p * 5.3 - vec2(uTime * .5, uTime * .3); g += (vec2(noise(q2 + vec2(.2, 0.)), noise(q2 + vec2(0., .2))) - noise(q2)) * .9; }
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
          col = mix(col, haze, smoothstep(-.02, 0., d.y) * .7);                 // 海天交界的薄雾
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

  // 把天空烘成环境贴图
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = bin.add(pmrem.fromScene(envScene, 0, 0.1, 1000).texture);
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  return {
    frame(_dt, t) { mat.uniforms.uTime.value = t; },
    stop() { scene.remove(dome); scene.environment = null; bin.dispose(); },
  };
};
