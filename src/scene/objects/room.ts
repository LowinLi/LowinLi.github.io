import * as THREE from 'three';
import type { SceneObject } from '../types';

/** 房间：墙、地面、书桌、台灯、杯子、窗外程序化夜景（视差） */
export const room: SceneObject = ({ scene, camera, tier }) => {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const mat = (color: number, rough = 0.8, metal = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    disposables.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = tier === 'high';
    group.add(mesh);
    return mesh;
  };

  // 墙和地面
  const wallMat = mat(0x2a211c, 0.95);
  box(8, 4, 0.1, wallMat, 0, 1, -1.35);
  box(0.1, 4, 4, wallMat, -2.6, 1, 0.6);
  box(8, 0.1, 5, mat(0x17110d, 0.9), 0, -0.8, 0.6);

  // 书桌
  const wood = mat(0x5a3a24, 0.6);
  box(3.4, 0.06, 1.7, wood, 0, -0.03, -0.15);
  for (const [x, z] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.6], [1.6, 0.6]]) box(0.06, 0.75, 0.06, wood, x, -0.43, z);

  // 窗户：一个 shader 平面画夜景，前面是窗框
  const winW = 1.7, winH = 1.0, winX = 0.75, winY = 0.98, winZ = -1.29;
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector2() }, uAspect: { value: winW / winH }, uDetail: { value: tier === 'high' ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv; uniform float uTime; uniform vec2 uCam; uniform float uAspect; uniform float uDetail;
      float h1(float x){ return fract(sin(x*127.1)*43758.5453); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      // 一层楼群：返回 (是否楼体, 窗灯亮度)
      vec2 layer(vec2 uv, float seed, float base, float amp, float bw){
        float x = uv.x / bw; float id = floor(x + seed*13.);
        float hgt = base + amp * h1(id + seed);
        if (uv.y > hgt) return vec2(0.);
        vec2 cell = vec2(fract(x)*4., uv.y / (bw*0.22));
        vec2 cid = vec2(id*4. + floor(cell.x), floor(cell.y));
        float win = step(0.25, fract(cell.x)) * step(fract(cell.x), 0.75) * step(0.3, fract(cell.y)) * step(fract(cell.y), 0.75);
        float on = step(0.62, h2(cid + seed));
        on *= 0.75 + 0.25 * sin(uTime * (0.3 + h2(cid)*0.8) + h2(cid)*30.); // 慢慢闪
        return vec2(1., win * on);
      }
      void main(){
        vec2 uv = vUv; uv.x *= uAspect;
        vec3 sky = mix(vec3(0.05,0.06,0.13), vec3(0.20,0.12,0.18), pow(1.-uv.y, 2.));
        // 星星
        vec2 sp = floor(uv*90.);
        float star = step(0.992, h2(sp)) * (0.5 + 0.5*sin(uTime*2. + h2(sp)*40.)) * smoothstep(0.35, 0.8, uv.y);
        sky += star * 0.8;
        // 月亮
        vec2 mpos = vec2(uAspect*0.78, 0.78) - uCam*0.02;
        float md = length(uv - mpos);
        sky += vec3(1.,0.93,0.8) * (smoothstep(0.075, 0.07, md) + 0.25*exp(-md*9.));
        vec3 col = sky;
        // 三层楼群，越近的层视差越大
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float depth = 0.15 + fi*0.35;
          vec2 luv = uv + vec2(uCam.x * depth * 0.25 + uTime*0.0, uCam.y * depth * 0.1);
          vec2 b = layer(luv, fi + 1., 0.18 + 0.12*(2.-fi), 0.30 - fi*0.06, 0.16 + fi*0.06);
          vec3 bcol = mix(vec3(0.09,0.08,0.14), vec3(0.03,0.025,0.04), fi/2.);
          vec3 lit = mix(vec3(1.,0.72,0.35), vec3(0.75,0.85,1.), h1(fi*7.)) * (0.5 + 0.4*fi);
          if (uDetail < 0.5 && i == 0) b.y = 0.;
          col = mix(col, bcol + lit * b.y, b.x);
        }
        // 底部一点街道雾光
        col += vec3(0.25,0.12,0.06) * exp(-uv.y*10.) * 0.6;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  disposables.push(skyMat);
  const skyGeo = new THREE.PlaneGeometry(winW, winH);
  disposables.push(skyGeo);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(winX, winY, winZ);
  group.add(sky);
  const frameMat = mat(0xd8cfc0, 0.7);
  const t = 0.05;
  box(winW + t * 2, t, 0.08, frameMat, winX, winY + winH / 2 + t / 2, winZ + 0.02);
  box(winW + t * 2, t * 1.4, 0.16, frameMat, winX, winY - winH / 2 - t * 0.7, winZ + 0.06);
  box(t, winH, 0.08, frameMat, winX - winW / 2 - t / 2, winY, winZ + 0.02);
  box(t, winH, 0.08, frameMat, winX + winW / 2 + t / 2, winY, winZ + 0.02);
  box(0.03, winH, 0.05, frameMat, winX, winY, winZ + 0.02);
  box(winW, 0.03, 0.05, frameMat, winX, winY + 0.1, winZ + 0.02);

  // 月光
  const moon = new THREE.DirectionalLight(0x8fa6ff, 0.35);
  moon.position.set(1.5, 2.5, -2);
  group.add(moon);
  const ambient = new THREE.HemisphereLight(0x2e2a36, 0x120c08, 0.55);
  group.add(ambient);

  // 台灯
  const lampX = -1.15, lampZ = -0.35;
  const metal = mat(0x2e2b28, 0.4, 0.6);
  const baseGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.03, 24);
  const armGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8);
  const shadeGeo = new THREE.ConeGeometry(0.14, 0.16, 24, 1, true);
  disposables.push(baseGeo, armGeo, shadeGeo);
  const lamp = new THREE.Group();
  const base = new THREE.Mesh(baseGeo, metal); base.position.y = 0.015;
  const arm = new THREE.Mesh(armGeo, metal); arm.position.set(0.05, 0.28, 0); arm.rotation.z = -0.18;
  const shade = new THREE.Mesh(shadeGeo, mat(0x8a2f1c, 0.5)); shade.position.set(0.15, 0.55, 0.02); shade.rotation.z = 0.7;
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  lamp.add(base, arm, shade);
  lamp.position.set(lampX, 0, lampZ);
  lamp.rotation.y = -0.5;
  group.add(lamp);
  const bulb = new THREE.PointLight(0xffb070, tier === 'high' ? 3.2 : 2.6, 4, 1.6);
  bulb.position.set(lampX + 0.18, 0.45, lampZ + 0.12);
  if (tier === 'high') {
    bulb.castShadow = true;
    bulb.shadow.mapSize.set(1024, 1024);
    bulb.shadow.bias = -0.002;
  }
  group.add(bulb);

  // 杯子
  const mugGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.11, 20);
  disposables.push(mugGeo);
  const mug = new THREE.Mesh(mugGeo, mat(0xe9e2d4, 0.4));
  mug.position.set(-0.85, 0.055, 0.35);
  mug.castShadow = tier === 'high';
  group.add(mug);
  // 笔记本
  box(0.32, 0.025, 0.42, mat(0x2f4a5a, 0.8), 1.05, 0.0125, 0.25).rotation.y = 0.25;

  scene.add(group);
  scene.background = new THREE.Color(0x0c0907);
  scene.fog = new THREE.Fog(0x0c0907, 4, 9);

  return {
    frame(_dt, t) {
      skyMat.uniforms.uTime.value = t;
      skyMat.uniforms.uCam.value.set(camera.position.x, camera.position.y - 1);
      bulb.intensity = (tier === 'high' ? 3.2 : 2.6) * (0.985 + Math.sin(t * 17) * 0.008 + Math.sin(t * 3.1) * 0.007);
    },
    stop() {
      scene.remove(group);
      disposables.forEach((d) => d.dispose());
      scene.fog = null;
    },
  };
};
