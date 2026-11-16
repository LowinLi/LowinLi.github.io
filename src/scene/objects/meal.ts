import * as THREE from 'three';
import { Bin, emit, on, type SceneObject } from '../types';
import { blob, canvasTex, contactMaterial, rng, speckle } from '../util';

/**
 * 一碗米饭（青花碗，碗沿上搁着一双筷子）和一盘西红柿炒鸡蛋。用户要的一套小交互，和咖啡杯同一个路数：
 * - 点一下：端到镜头跟前（镜头不动），碗口朝你倾，看得见里面。
 * - 端着再点：凑到嘴边吃一口。米饭少一层、缺一块；炒蛋少三分之一（蛋块、番茄块、葱花按组消失），汤汁往下落。
 * - 三口吃光：自动放回桌上，然后连碗带盘一起没了（「吃光了就没有了」）。刷新页面才会重新端上来。
 * - 点旁边 / ESC / 返回：放回桌上。
 * 和咖啡杯共用 cup:focus / cup:blur / cup:state 这组事件（HTML 层、景深、「点旁边退回」都现成），focus 里带 by 区分是谁端起来的。
 */
const BITES = 3;
const DIM: [string, number, number, number][] = [
  // id, 桌上的位置 x, z, 朝向
  ['rice', -0.25, 0.14, 0.4],
  ['dish', -0.41, 0.045, 0],
];

/** 旋转成型的器皿内壁：给一个高度，返回那里的内径 */
const innerR = (prof: [number, number][], h: number) => {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (h <= y1) return r0 + (r1 - r0) * ((h - y0) / Math.max(1e-6, y1 - y0));
  }
  return prof[prof.length - 1][0];
};

export const meal: SceneObject = ({ scene, camera, tier, bus, pick }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const group = new THREE.Group();
  const V2 = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const porcelain = bin.add(new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.12 }));
  const blue = bin.add(new THREE.MeshStandardMaterial({ color: 0x24479a, roughness: 0.15 }));
  const contact = contactMaterial(bin, high ? 0.3 : 0.5);
  const steamTex = bin.add(canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }));
  const hitMat = bin.add(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));

  interface Dish {
    id: string; root: THREE.Group; body: THREE.Group; home: THREE.Vector3; homeQ: THREE.Quaternion;
    level: number; bite: number; gone: number; tilt: number; topY: number;
    onLevel: (lv: number) => void; extra?: (k: number) => void;
    steam: { s: THREE.Sprite; m: THREE.SpriteMaterial; life: number; seed: number }[];
  }
  const dishes: Dish[] = [];
  const make = (id: string, tilt: number, topY: number, hitR: number, hitH: number, build: (body: THREE.Group) => Pick<Dish, 'onLevel' | 'extra'>) => {
    const [, x, z, ry] = DIM.find((d) => d[0] === id)!;
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const fn = build(body);
    const sh = new THREE.Mesh(bin.add(blob(hitR * 1.2, hitR * 1.2)), contact); sh.position.y = 0.0006; root.add(sh);
    body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = high; m.receiveShadow = high; } });
    const hit = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(hitR, hitR, hitH, 12)), hitMat); hit.position.y = hitH / 2; root.add(hit);
    root.position.set(x, 0, z); root.rotation.y = ry;
    root.userData.keepsCup = true; root.userData.mealId = id;
    group.add(root);
    const d: Dish = { id, root, body, home: root.position.clone(), homeQ: root.quaternion.clone(), level: BITES, bite: 0, gone: 0, tilt, topY, steam: [], ...fn };
    for (let i = 0; i < (high ? 4 : 2); i++) {
      const m = bin.add(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false, color: 0xfff6ea }));
      const s = new THREE.Sprite(m); group.add(s); d.steam.push({ s, m, life: i / 4, seed: i * 2.3 + id.length });
    }
    pick(root, { click: () => onClick(d) });
    dishes.push(d);
    return d;
  };

  // ---------------- 米饭 ----------------
  // 青花小碗：圈足 + 弧形碗身，内壁从碗底 (0.026, 0.012) 到碗沿 (0.0575, 0.063)
  const riceProf: [number, number][] = [[0.0, 0.011], [0.026, 0.012], [0.043, 0.024], [0.054, 0.047], [0.0575, 0.063]];
  const riceTex = bin.add(canvasTex(256, 256, (g, w, h) => {
    // 一粒粒椭圆的米，粒与粒之间的缝是暗的，所以近看能分出米粒
    g.fillStyle = '#bdb4a0'; g.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 1500; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI;
      const gr = g.createLinearGradient(x - 3, y - 3, x + 3, y + 3);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, `rgb(${226 - r() * 16},${222 - r() * 16},${208 - r() * 16})`);
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y, 4.6, 2.1, a, 0, 7); g.fill();
      g.strokeStyle = 'rgba(120,110,90,.35)'; g.lineWidth = 0.7; g.stroke();
    }
  }, [3, 3]));
  const grainsTex = bin.add(canvasTex(128, 128, (g, w) => {
    const r = rng(32), c = w / 2;
    for (let i = 0; i < 26; i++) {
      const a = r() * 7, d = Math.sqrt(r()) * c * 0.85;
      g.fillStyle = '#f7f4ec'; g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 3.2, 1.5, r() * 3, 0, 7); g.fill();
    }
  }));
  make('rice', 0.75, 0.063, 0.068, 0.09, (body) => {
    body.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(V2([[0, 0.004], [0.022, 0.004], [0.023, 0], [0.028, 0], [0.029, 0.007], [0.046, 0.022], [0.057, 0.046], [0.0605, 0.062], [0.0592, 0.0635], ...riceProf.slice().reverse().map(([r, y]) => [r, y])]), 48)), porcelain));
    // 青花：碗沿下一道粗线一道细线，圈足上一道
    for (const [y0, y1, r0, r1] of [[0.052, 0.056, 0.0585, 0.0595], [0.047, 0.0484, 0.0572, 0.0576], [0.003, 0.006, 0.0283, 0.0288]]) {
      body.add(new THREE.Mesh(bin.add(new THREE.CylinderGeometry(r1 + 0.0004, r0 + 0.0004, y1 - y0, 48, 1, true).translate(0, (y0 + y1) / 2, 0)), blue));
    }
    // 碗底几粒剩饭（吃光了才露出来）
    const crumbs = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.03, 24).rotateX(-Math.PI / 2)), bin.add(new THREE.MeshStandardMaterial({ map: grainsTex, transparent: true, roughness: 0.6 })));
    crumbs.position.y = 0.0122; crumbs.visible = false; body.add(crumbs);
    // 米饭：一个半球，按「剩几口」降低、压扁；每吃一口在不同方向咬掉一块
    const domeGeo = bin.add(new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const base = Float32Array.from(domeGeo.attributes.position.array as Float32Array);
    const dome = new THREE.Mesh(domeGeo, bin.add(new THREE.MeshStandardMaterial({ map: riceTex, bumpMap: riceTex, bumpScale: 3, roughness: 0.6 })));
    body.add(dome);
    const bites: [number, number][] = [];
    const shape = () => {
      const p = domeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        let k = 1;
        for (const [bx, bz] of bites) { const d = Math.hypot(x - bx, z - bz); if (d < 0.75) k = Math.min(k, 0.15 + 0.85 * (d / 0.75) ** 2); }
        // 表面一点起伏，像盛出来的饭，不是光滑的球
        const n = 1 + 0.06 * Math.sin(x * 9 + z * 7) * Math.cos(z * 11 - x * 3);
        p.setXYZ(i, x, y * k * n, z);
      }
      p.needsUpdate = true; domeGeo.computeVertexNormals();
    };
    shape();
    // 筷子：一双红木筷子斜搁在碗沿上
    const wood = bin.add(new THREE.MeshStandardMaterial({ color: 0x5a1e14, roughness: 0.35 }));
    const tipM = bin.add(new THREE.MeshStandardMaterial({ color: 0xd9b26a, roughness: 0.4, metalness: 0.5 }));
    const sticks = new THREE.Group();
    for (const dz of [-0.007, 0.007]) {
      const s = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0017, 0.0028, 0.22, 8).rotateZ(Math.PI / 2)), wood);
      s.position.set(0.035, 0, dz); sticks.add(s);
      const band = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.0029, 0.0029, 0.012, 8).rotateZ(Math.PI / 2)), tipM);
      band.position.set(0.14, 0, dz); sticks.add(band);
    }
    sticks.position.set(-0.02, 0.066, 0); sticks.rotation.set(0, 0.35, -0.04);
    body.add(sticks);
    const levels = [ // 每一档：饭面底部的高度、隆起的高度
      [0.012, 0], [0.028, 0.008], [0.042, 0.016], [0.054, 0.034],
    ];
    let shown = BITES;
    const place = (lv: number) => {
      const i = Math.floor(lv), f = lv - i, a = levels[i], b = levels[Math.min(BITES, i + 1)];
      const y = a[0] + (b[0] - a[0]) * f, hgt = a[1] + (b[1] - a[1]) * f, r = innerR(riceProf, y) - 0.0006;
      dome.position.y = y; dome.scale.set(r, Math.max(0.0005, hgt), r);
      dome.visible = lv > 0.03; crumbs.visible = lv < 0.5;
    };
    place(BITES);
    return {
      onLevel(lv) {
        if (lv < BITES && lv > 0) { const a = lv * 2.1 + 0.6; bites.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55]); shape(); }
        shown = lv;
      },
      extra(k) {
        // 吃的时候筷子抬起来，像夹了一口；饭面平滑地落到新的高度
        sticks.position.y = 0.066 + k * 0.03; sticks.rotation.z = -0.04 - k * 0.35;
        const cur = dome.userData.lv ?? BITES;
        const next = cur + (shown - cur) * 0.12;
        dome.userData.lv = Math.abs(next - shown) < 0.002 ? shown : next;
        place(dome.userData.lv);
      },
    };
  });

  // ---------------- 西红柿炒鸡蛋 ----------------
  // 深一点的白瓷盘，盘沿一圈青花细线；内壁从盘底 (0.04, 0.008) 到盘沿 (0.075, 0.031)
  const dishProf: [number, number][] = [[0, 0.007], [0.04, 0.008], [0.063, 0.02], [0.075, 0.031]];
  const sauceTex = bin.add(canvasTex(256, 256, (g, w) => {
    const c = w / 2, r = g.createRadialGradient(c, c, 4, c, c, c);
    r.addColorStop(0, '#d8471f'); r.addColorStop(0.7, '#c43a18'); r.addColorStop(0.92, '#b8501f'); r.addColorStop(1, 'rgba(190,80,30,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    // 浮着的油花
    const q = rng(41);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,200,120,${0.15 + q() * 0.25})`; g.beginPath(); g.arc(q() * w, q() * w, 1 + q() * 4, 0, 7); g.fill(); }
    speckle(g, w, w, 42, 400, '90,20,5', 0.3);
  }));
  const smearTex = bin.add(canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const q = rng(43);
    for (let i = 0; i < 9; i++) {
      const a = q() * 7, d = q() * c * 0.6;
      const r = g.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, c + Math.cos(a) * d, c + Math.sin(a) * d, 22 + q() * 30);
      r.addColorStop(0, 'rgba(200,70,30,.55)'); r.addColorStop(1, 'rgba(200,70,30,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    }
  }));
  make('dish', 0.85, 0.031, 0.082, 0.06, (body) => {
    body.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(V2([[0, 0.003], [0.035, 0.003], [0.036, 0], [0.041, 0], [0.042, 0.004], [0.066, 0.018], [0.078, 0.03], [0.0772, 0.0318], ...dishProf.slice().reverse()]), 56)), porcelain));
    const rimLine = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.0755, 0.0009, 6, 56).rotateX(Math.PI / 2)), blue); rimLine.position.y = 0.0312; body.add(rimLine);
    const sauceMat = bin.add(new THREE.MeshStandardMaterial({ map: sauceTex, transparent: true, roughness: 0.25 }));
    const sauce = new THREE.Mesh(bin.add(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)), sauceMat);
    body.add(sauce);
    // 蛋块：揉皱的扁块，金黄、边上带一点焦色（顶点色）；番茄块：去了籽的瓣，亮；葱花：小绿段
    const lumpy = (seed: number, detail: number) => {
      const geo = new THREE.IcosahedronGeometry(1, detail);
      const p = geo.attributes.position, r = rng(seed);
      const ph = [r() * 6, r() * 6, r() * 6];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.28 * Math.sin(x * 3 + ph[0]) * Math.sin(y * 4 + ph[1]) + 0.18 * Math.sin(z * 5 + ph[2]);
        p.setXYZ(i, x * n, y * n * 0.45, z * n);
      }
      geo.computeVertexNormals();
      return bin.add(geo);
    };
    const eggGeo = lumpy(51, 2);
    const cols: number[] = [];
    { const p = eggGeo.attributes.position; for (let i = 0; i < p.count; i++) { const brown = Math.max(0, -p.getY(i) * 1.6 - 0.1) + (Math.sin(i * 1.7) > 0.8 ? 0.25 : 0); const c = new THREE.Color(0xf4c84a).lerp(new THREE.Color(0xc98a2c), Math.min(1, brown)); cols.push(c.r, c.g, c.b); } }
    eggGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const tomGeo = bin.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 0.85, 0, Math.PI * 0.6).scale(1, 0.55, 1));
    const scalGeo = bin.add(new THREE.CylinderGeometry(1, 1, 1, 6));
    const kinds = [
      { geo: eggGeo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }), n: 14, size: [0.011, 0.017] },
      { geo: tomGeo, mat: new THREE.MeshStandardMaterial({ color: 0xd4321b, roughness: 0.22, side: THREE.DoubleSide }), n: 10, size: [0.012, 0.016] },
      { geo: scalGeo, mat: new THREE.MeshStandardMaterial({ color: 0x4f9b2f, roughness: 0.5 }), n: 12, size: [0.0016, 0.0016] },
    ];
    const r = rng(61), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    type Piece = { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4; group: number };
    const pieces: Piece[] = [];
    for (const k of kinds) {
      bin.add(k.mat);
      const mesh = new THREE.InstancedMesh(k.geo, k.mat, k.n);
      mesh.castShadow = high;
      for (let i = 0; i < k.n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.05, size = k.size[0] + r() * (k.size[1] - k.size[0]);
        const mound = 0.016 * (1 - d / 0.055); // 堆在中间，四周低
        p.set(Math.cos(a) * d, 0.017 + mound + (k.geo === scalGeo ? 0.006 : 0), Math.sin(a) * d);
        if (k.geo === scalGeo) { s.set(size, 0.004, size); e.set(r() * 3, r() * 3, r() * 3); }
        else { s.setScalar(size); e.set((r() - 0.5) * 0.8, r() * 6, (r() - 0.5) * 0.8); }
        m4.compose(p, q.setFromEuler(e), s);
        mesh.setMatrixAt(i, m4);
        // 每块分到三组里的一组：吃一口少一组。葱花撒在最上面，最先被夹走
        pieces.push({ mesh, i, m: m4.clone(), group: (i + (k.geo === scalGeo ? 2 : 0)) % 3 });
      }
      body.add(mesh);
    }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let sauceLv = BITES, target = BITES;
    const placeSauce = (lv: number) => {
      const y = 0.0085 + 0.009 * (lv / BITES), rr = innerR(dishProf, y) - 0.0008;
      sauce.position.y = y; sauce.scale.set(rr, 1, rr);
      if (lv < 0.05 && sauceMat.map !== smearTex) { sauceMat.map = smearTex; sauceMat.needsUpdate = true; }
    };
    placeSauce(BITES);
    return {
      onLevel(lv) {
        target = lv;
        for (const pc of pieces) pc.mesh.setMatrixAt(pc.i, pc.group < lv ? pc.m : zero);
        for (const k of new Set(pieces.map((x) => x.mesh))) k.instanceMatrix.needsUpdate = true;
      },
      extra() { sauceLv += (target - sauceLv) * 0.1; placeSauce(sauceLv); },
    };
  });
  scene.add(group);

  // ---------------- 端起来、吃、放下 ----------------
  let held: Dish | null = null;
  const say = (msg: string | null) => emit(bus, 'cup:state', msg ? { msg } : null);
  const NAME: Record<string, string> = { rice: '米饭', dish: '西红柿炒鸡蛋' };
  const hint = (d: Dish) => d.level > 0 ? `点一下吃一口${NAME[d.id]} · 还剩 ${['', '一口', '两口', '三口'][d.level]}` : `${NAME[d.id]}吃光了`;
  const HOLD = new THREE.Vector3(0.0, -0.07, -0.42); // 比咖啡杯远一点：碗盘比杯子大，近了会出画
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  const holdPose = (d: Dish, k: number) => {
    const far = Math.max(1, 0.75 / camera.aspect);
    want.set(HOLD.x, HOLD.y + k * 0.03, (HOLD.z - (d.id === 'dish' ? 0.06 : 0)) * far + k * 0.12).applyMatrix4(camera.matrixWorld);
    wantQ.copy(camera.quaternion).multiply(tmpQ.setFromEuler(tmpE.set(d.tilt + k * 0.3, 0.3, 0, 'YXZ')));
  };
  const hold = (d: Dish) => {
    held = d; camera.updateMatrixWorld(); holdPose(d, 0);
    emit(bus, 'cup:focus', { p: want.toArray(), by: 'meal' });
    say(hint(d));
  };
  const putDown = () => { if (held) { held = null; emit(bus, 'cup:blur'); } };
  const onClick = (d: Dish) => {
    if (d.level === 0 || d.bite > 0) return;
    if (held !== d) { if (held) putDown(); hold(d); return; }
    d.bite = 0.0001;
  };
  const off = [
    on(bus, 'cup:blur', () => { if (held) { held = null; say(null); } }),
    // 端起了咖啡杯：手里的碗先放下（不发 blur，杯子那边已经接管了焦点）
    on<{ by?: string }>(bus, 'cup:focus', ({ by } = {}) => { if (by !== 'meal') held = null; }),
    on(bus, 'monitor:focus', () => { if (held) putDown(); }),
    on(bus, 'window:focus', () => { if (held) putDown(); }),
  ];

  return {
    frame(dt, t) {
      camera.updateMatrixWorld();
      for (const d of dishes) {
        if (d.gone >= 1) continue;
        let k = 0;
        if (d.bite > 0) {
          const before = d.bite;
          d.bite += dt / 1.2;
          if (before < 0.5 && d.bite >= 0.5) { d.level--; d.onLevel(d.level); say(hint(d)); }
          if (d.bite >= 1) {
            d.bite = 0;
            if (d.level === 0 && held === d) { putDown(); say(hint(d)); setTimeout(() => held || say(null), 2500); }
          }
          k = Math.sin(Math.min(1, d.bite) * Math.PI);
        }
        d.extra?.(k);
        if (held === d) holdPose(d, k); else { want.copy(d.home); wantQ.copy(d.homeQ); }
        const f = 1 - Math.exp(-(held === d ? 9 : 7) * dt);
        const away = d.root.position.distanceTo(want);
        const lift = held !== d ? Math.min(0.1, away * 0.4) : 0;
        d.root.position.lerp(want.setY(want.y + lift), f);
        d.root.quaternion.slerp(wantQ, f);
        // 吃光、放回桌上之后：轻轻缩小消失，连点击区一起藏掉
        if (d.level === 0 && held !== d && (d.gone > 0 || away < 0.02)) {
          d.gone = Math.min(1, d.gone + dt / 0.7);
          const e = 1 - (1 - d.gone) ** 2;
          d.root.scale.setScalar(Math.max(0.001, 1 - e));
          d.root.position.y = d.home.y + e * 0.03;
          if (d.gone >= 1) d.root.traverse((o) => { o.visible = false; });
        }
        d.root.userData.level = d.level; d.root.userData.gone = d.gone >= 1;
        // 热气：还有饭菜、没在吃的时候
        const hot = d.level > 0 && d.bite === 0;
        for (const p of d.steam) {
          p.life = (p.life + dt * 0.22) % 1;
          const kk = p.life;
          d.root.localToWorld(p.s.position.set(0, d.topY + 0.01, 0));
          p.s.position.x += Math.sin(p.seed + kk * 4 + t * 0.3) * 0.012 * (1 + kk * 2); p.s.position.y += kk * 0.09; p.s.position.z += Math.cos(p.seed * 2 + kk * 3) * 0.01;
          p.s.scale.set(0.03 + kk * 0.04, 0.04 + kk * 0.05, 1);
          p.m.opacity = hot && d.gone === 0 ? Math.sin(kk * Math.PI) * 0.2 : Math.max(0, p.m.opacity - dt * 2);
        }
      }
    },
    stop() { off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
