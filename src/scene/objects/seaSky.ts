import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L, SUN_DIR } from '../layout';

/** 窗外的天空和大海：一个包住场景的球，片元着色器按视线方向算日出天空、云和有波浪反光的海面。 */
export const seaSky: SceneObject = ({ scene, tier }) => {
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
        vec3 hor = mix(vec3(.78,.50,.56), vec3(1.0,.48,.20), pow(sd, 2.));   // 地平线：背光处偏粉，朝阳处偏橙
        vec3 mid = vec3(.46,.58,.82), zen = vec3(.13,.27,.60);
        vec3 c = mix(hor, mid, smoothstep(0., .25, h));
        c = mix(c, zen, smoothstep(.2, .95, h));
        c = mix(c, vec3(1.0,.42,.14), pow(sd, 6.) * .6 * (1. - smoothstep(0., .45, h)));
        c += vec3(1.0,.45,.12) * pow(sd, 60.) * .55 + vec3(1.0,.7,.35) * pow(sd, 700.) * 1.2;
        if (uDetail > .5 && d.y > .0) {                                        // 几缕被朝阳染色的薄云
          vec2 uv = d.xz / (d.y + .12);
          float n = fbm(uv * vec2(.5, 1.6) + vec2(uTime * .004, 0.));
          float streak = smoothstep(.52, .78, n) * smoothstep(.015, .16, h) * (1. - smoothstep(.45, .9, h));
          vec3 cc = mix(vec3(.78,.60,.68), vec3(1.0,.78,.55), pow(sd, 2.5));
          c = mix(c, cc, streak * .75);
        }
        return c;
      }
      float sunDisc(vec3 d){ return smoothstep(.99915, .99935, dot(d, uSun)); }

      // 一组方向正弦波的斜率和
      vec2 wave(vec2 p, vec2 dir, float f, float a, float s){ return dir * (f * a * cos(dot(dir, p) * f + uTime * s)); }

      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 col;
        if (d.y > 0.) {
          col = sky(d) + sunDisc(d) * vec3(4.2, 2.1, .55);
        } else {
          float t = (uSeaY - cameraPosition.y) / min(d.y, -1e-4);
          vec2 p = cameraPosition.xz + d.xz * t;
          vec2 g = wave(p, vec2(.31,.95), .16, .55, .7) + wave(p, vec2(-.5,.87), .29, .30, .9)
                 + wave(p, vec2(.8,.6), .62, .13, 1.3) + wave(p, vec2(-.2,.98), 1.3, .05, 1.9);
          vec2 q = p * 1.7 + vec2(uTime * .35, uTime * .22);                   // 细碎的波纹
          g += (vec2(noise(q + vec2(.37, 0.)), noise(q + vec2(0., .37))) - noise(q)) * (uDetail > .5 ? 1.6 : .8);
          g *= 1. / (1. + t * .012);
          vec3 n = normalize(vec3(-g.x, 1., -g.y));
          vec3 r = reflect(d, n); r.y = abs(r.y) + .015; r = normalize(r);
          float fr = .03 + .97 * pow(1. - max(dot(-d, n), 0.), 5.);
          col = mix(vec3(.01,.07,.12), sky(r) * vec3(.82,.9,1.), fr * .82);
          col += vec3(1.0,.5,.16) * pow(max(dot(r, uSun), 0.), 220.) * 6.;    // 海面上的光路
          vec3 hz = sky(normalize(vec3(d.x, .001, d.z)));
          col = mix(col, hz, smoothstep(-.02, 0., d.y) * .7);                // 海天交界的薄雾
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const geo = bin.add(new THREE.SphereGeometry(90, 32, 16));
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  scene.add(dome);
  return {
    frame(_dt, t) { mat.uniforms.uTime.value = t; },
    stop() { scene.remove(dome); bin.dispose(); },
  };
};
