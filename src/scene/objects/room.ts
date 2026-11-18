import * as THREE from 'three';
import { Bin, emit, HIT_LAYER, on, type SceneObject } from '../types';
import { L, SUN_LIGHT_DIR } from '../layout';
import { asset, Batch, canvasTex, rbox, rng, speckle, usePhotoTexture, woodGrain } from '../util';

const SERIF = '"Kaiti SC","STKaiti","KaiTi","Songti SC","Noto Serif CJK SC","SimSun",serif';

/** 房间：带大窗的墙、中式木格窗和竹帘、方砖地面、墙上倒贴的「福」字，以及晨光。 */
export const room: SceneObject = ({ scene, camera, tier, bus, pick }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  const batch = new Batch();
  // 有贴图的材质默认把同一张图当凹凸图，让木纹、布纹、叶脉有起伏
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const { win, wallZ, floorY } = L;

  // ---- 墙 ----
  const wall = std({ roughness: 0.95, map: bin.add(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ddd6ca'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3, 2600, '90,70,50', 0.05); speckle(g, w, h, 4, 1800, '255,255,255', 0.08);
  }, [3, 3])) });
  const top = 2.9, th = 0.2, zc = wallZ - th / 2, H = top - floorY, yc = (top + floorY) / 2;
  // 房间内宽 6.4 m（x ±3.2），进深约 5.8 m（z 从窗墙到 4.6）
  const RX = 3.2, RZ = 4.6, sideW = RX + th - win.x1;
  batch.add(wall, new THREE.BoxGeometry(sideW, H, th), [win.x0 - sideW / 2, yc, zc]);
  batch.add(wall, new THREE.BoxGeometry(sideW, H, th), [win.x1 + sideW / 2, yc, zc]);
  batch.add(wall, new THREE.BoxGeometry(win.x1 - win.x0, win.y0 - floorY, th), [0, (win.y0 + floorY) / 2, zc]);
  batch.add(wall, new THREE.BoxGeometry(win.x1 - win.x0, top - win.y1, th), [0, (top + win.y1) / 2, zc]);
  // 两面侧墙单独成网格：镜头绕到墙外时把那面墙藏起来，房间就成了能看进去的剖面
  const sideLen = RZ - (wallZ - th);
  const sideWalls = [-1, 1].map((s) => {
    const mesh = new THREE.Mesh(bin.add(new THREE.BoxGeometry(th, H, sideLen)), wall);
    mesh.position.set(s * (RX + th / 2), yc, (RZ + wallZ - th) / 2);
    mesh.receiveShadow = mesh.castShadow = high;
    group.add(mesh);
    return { mesh, s };
  });
  const trim = std({ color: 0xf6f3ec, roughness: 0.5 });
  batch.add(trim, rbox(6.4, 0.1, 0.018, 0.004), [0, floorY + 0.05, wallZ + 0.009]); // 踢脚线

  // ---- 中式木格窗：深色实木窗框，三扇；上面一条横披是回纹格子，下面每扇套一圈细棂，中间留空好看风景 ----
  const winWood = std({ roughness: 0.5, map: bin.add(canvasTex(256, 256, (g, w, h) => woodGrain(g, 0, 0, w, h, '#4a2618', '14,6,3', 21, 120))) });
  const ww = win.x1 - win.x0, wh = win.y1 - win.y0, wy = (win.y0 + win.y1) / 2, fz = wallZ - 0.11, fw = 0.06;
  // 窗棂用普通盒子：圆角盒子一根就是几百个三角形，七十多根加起来四万多
  const bar = (w: number, h: number, x: number, y: number, d = 0.035, z = fz) => batch.add(winWood, new THREE.BoxGeometry(w, h, d), [x, y, z]);
  bar(ww, fw, 0, win.y1 - fw / 2, 0.08); bar(ww, fw, 0, win.y0 + fw / 2, 0.08);
  for (const x of [win.x0 + fw / 2, win.x1 - fw / 2]) bar(fw, wh, x, wy, 0.08);
  for (const x of [-ww / 6, ww / 6]) bar(0.065, wh - fw, x, wy, 0.07);
  const transomH = 0.36, ty0 = win.y1 - fw - transomH; // 横披的下沿
  bar(ww, 0.045, 0, ty0, 0.06);
  for (let p = 0; p < 3; p++) {
    const x0 = win.x0 + fw + p * (ww / 3) + (p === 0 ? 0 : -fw / 2 + 0.0325), x1 = win.x0 + (p + 1) * (ww / 3) - (p === 2 ? fw : 0.0325);
    const pw = x1 - x0, cx = (x0 + x1) / 2, t = 0.018;
    // 横披里的格子：竖棂 + 中间一圈回纹
    const n = 6;
    for (let i = 1; i < n; i++) bar(t, transomH, x0 + (pw * i) / n, ty0 + transomH / 2 + 0.01, 0.025);
    bar(pw, t, cx, ty0 + transomH * 0.5 + 0.01, 0.025);
    for (const [bw, bh] of [[pw * 0.5, transomH * 0.56]]) {
      bar(bw, t, cx, ty0 + 0.01 + (transomH + bh) / 2, 0.03); bar(bw, t, cx, ty0 + 0.01 + (transomH - bh) / 2, 0.03);
      bar(t, bh, cx - bw / 2, ty0 + transomH / 2 + 0.01, 0.03); bar(t, bh, cx + bw / 2, ty0 + transomH / 2 + 0.01, 0.03);
    }
    // 下面的窗扇：四边各退进来一道细棂，四角用短棂连到窗框上
    const by0 = win.y0 + fw, by1 = ty0 - 0.0225, inset = 0.09, bh = by1 - by0;
    bar(pw - inset * 2, t, cx, by0 + inset, 0.025); bar(pw - inset * 2, t, cx, by1 - inset, 0.025);
    bar(t, bh - inset * 2, x0 + inset, (by0 + by1) / 2, 0.025); bar(t, bh - inset * 2, x1 - inset, (by0 + by1) / 2, 0.025);
    for (const yy of [by0 + inset + 0.14, by1 - inset - 0.14]) { bar(inset, t, x0 + inset / 2, yy, 0.025); bar(inset, t, x1 - inset / 2, yy, 0.025); }
    for (const xx of [x0 + inset + 0.14, x1 - inset - 0.14]) { bar(t, inset, xx, by0 + inset / 2, 0.025); bar(t, inset, xx, by1 - inset / 2, 0.025); }
  }
  batch.add(winWood, rbox(ww + 0.16, 0.04, 0.3, 0.012), [0, win.y0 - 0.02, wallZ - 0.02]); // 窗台
  // 卷在窗子上方的竹帘
  const blind = std({ roughness: 0.7, map: bin.add(canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#c9ad72'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? 'rgba(90,60,20,.28)' : 'rgba(255,240,200,.18)'; g.fillRect(0, y, w, 1.5); }
    for (const x of [40, 128, 216]) { g.fillStyle = 'rgba(120,40,30,.8)'; g.fillRect(x, 0, 3, h); } // 编绳
  })) });
  batch.add(blind, new THREE.CylinderGeometry(0.05, 0.05, ww + 0.1, 16).rotateZ(Math.PI / 2), [0, win.y1 + 0.03, wallZ + 0.05]);
  batch.add(blind, new THREE.PlaneGeometry(ww + 0.06, 0.2), [0, win.y1 - 0.06, wallZ + 0.012]);
  for (const x of [-ww / 2 + 0.2, ww / 2 - 0.2]) batch.add(winWood, new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), [x, win.y1 + 0.12, wallZ + 0.03]);

  // ---- 地面：灰色方砖（青砖地），不铺地毯 ----
  const floorTex = bin.add(canvasTex(512, 512, (g, w, h) => {
    const r = rng(8), n = 3, t = w / n;
    g.fillStyle = '#5c5f60'; g.fillRect(0, 0, w, h); // 砖缝
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 128 + Math.floor(r() * 26); g.fillStyle = `rgb(${v},${v + 3},${v + 5})`; g.fillRect(i * t + 3, j * t + 3, t - 6, t - 6); }
    speckle(g, w, h, 9, 6000, '40,45,50', 0.2); speckle(g, w, h, 10, 3000, '230,235,235', 0.15);
  }, [4.5, 4]));
  const floorMat = std({ map: floorTex, roughness: 0.6 });
  usePhotoTexture(bin, floorMat, 'large_grey_tiles', { repeat: [6.5, 5.7], color: [1.12, 1.14, 1.16] });
  batch.add(floorMat, new THREE.BoxGeometry((RX + th) * 2, 0.25, sideLen), [0, floorY - 0.125, (RZ + wallZ - th) / 2]);

  // ---- 墙上的「福」字 ----
  // 倒贴的「福」字（福「到」了）：一张斜着贴成菱形的大红纸，金边，黑字
  const scrollMat = std({ roughness: 0.85, bumpScale: 0, map: bin.add(canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c8201a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 6, 4000, '255,200,120', 0.08); speckle(g, w, h, 7, 3000, '90,0,0', 0.12);
    g.strokeStyle = '#e9c46a'; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44);
    g.lineWidth = 3; g.strokeRect(40, 40, w - 80, h - 80);
    // 纸是转了 45° 贴的，所以字在画布上先转 135°，贴上墙后正好是整个倒过来
    g.translate(w / 2, h / 2); g.rotate(-Math.PI * 0.75);
    g.fillStyle = '#17120e'; g.font = `bold 300px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('福', 0, 12);
  })) });
  const sx = 1.9, sy = 1.08;
  batch.add(scrollMat, new THREE.PlaneGeometry(0.5, 0.5), [sx, sy, wallZ + 0.012], [0, 0, Math.PI / 4]);

  const built = batch.build(group, bin, { cast: high, receive: high, noCast: [floorMat, scrollMat, trim, blind] });
  const meshOf = (m: THREE.Material) => built.find((x) => x.material === m)!;

  // ---- 烘焙光照：墙和地板的光影是用 Blender 离线算好的（tools/bake_lighting.py）----
  // 贴图里有天光从窗户进来的衰减、阳光在地板上的光斑、墙角的暗部和家具的柔和投影。
  // 贴上之后这些面改用不受实时灯光影响的材质，否则会和实时的太阳重复计算。
  // uv 是按世界坐标的平面投影，必须和烘焙脚本里的一致。
  const LX0 = -(RX + th), LX1 = RX + th, LZ0 = wallZ - th, LZ1 = RZ;
  const LM_INTENSITY = Math.PI * 3 * 2.0; // π × 脚本里的 RANGE × 整体曝光
  const baked: { mesh: THREE.Mesh; src: THREE.MeshStandardMaterial; basic: THREE.MeshBasicMaterial }[] = [];
  let stopped = false;
  // paint：墙面烘焙后改成干净的乳胶漆白墙（不再叠灰泥照片：照片的颗粒乘上光照贴图会显脏），并用偏冷的底色抵消地板反弹上来的暖色
  const bake = (mesh: THREE.Mesh, name: string, uv: (x: number, y: number, z: number) => [number, number], paint?: THREE.Color) => {
    new THREE.TextureLoader().loadAsync(asset(`light/${name}.jpg`)).then((tex) => {
      if (stopped) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.channel = 1; bin.add(tex);
      const pos = mesh.geometry.attributes.position, uv1 = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) uv1.set(uv(pos.getX(i) + mesh.position.x, pos.getY(i) + mesh.position.y, pos.getZ(i) + mesh.position.z), i * 2);
      mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      const src = mesh.material as THREE.MeshStandardMaterial;
      const basic = bin.add(new THREE.MeshBasicMaterial({ map: paint ? null : src.map, color: paint ?? src.color.clone(), lightMap: tex, lightMapIntensity: LM_INTENSITY }));
      mesh.material = basic; mesh.receiveShadow = false;
      if (!paint) baked.push({ mesh, src, basic });
    }).catch((e) => console.warn(`[scene] 光照贴图 ${name} 加载失败，继续用实时光照`, e));
  };
  // 采样位置夹在室内：墙体厚度里的那部分贴图是被室外天光照亮的，不夹住的话墙角会渗出一条亮边
  const cx = (x: number) => THREE.MathUtils.clamp(x, -RX + 0.12, RX - 0.12), cz = (z: number) => Math.max(z, wallZ + 0.14);
  const floorUV = (x: number, _y: number, z: number): [number, number] => [(cx(x) - LX0) / (LX1 - LX0), (cz(z) - LZ0) / (LZ1 - LZ0)];
  const sideUV = (_x: number, y: number, z: number): [number, number] => [(cz(z) - LZ0) / (LZ1 - LZ0), (y - floorY) / H];
  bake(meshOf(floorMat), 'floor', floorUV);
  const paint = new THREE.Color(0.72, 0.8, 0.9);
  bake(meshOf(wall), 'wall_back', (x, y) => [(cx(x) - LX0) / (LX1 - LX0), (y - floorY) / H], paint);
  bake(sideWalls[0].mesh, 'wall_left', sideUV, paint);
  bake(sideWalls[1].mesh, 'wall_right', sideUV, paint);

  // ---- 窗玻璃：一层很淡的薄膜，带一点没擦干净的水痕 ----
  // 用不受光照的材质：带高光的玻璃会把室内补光灯映成一个亮点，再被光束拉成一道线
  const glass = bin.add(new THREE.MeshBasicMaterial({
    color: 0xfff4e6, transparent: true, opacity: 0.09, depthWrite: false,
    alphaMap: bin.add(canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#555'; g.fillRect(0, 0, w, h);
      const r = rng(23);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h, len = 30 + r() * 120;
        const grad = g.createLinearGradient(x, y, x + len * 0.2, y + len);
        grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, `rgba(255,255,255,${0.1 + r() * 0.25})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = grad; g.lineWidth = 2 + r() * 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.2, y + len); g.stroke();
      }
      speckle(g, w, h, 24, 400, '255,255,255', 0.5);
    })),
  }));
  const pane = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(ww - fw * 2, wh - fw * 2)), glass);
  pane.position.set(0, wy, fz);
  group.add(pane);

  // ---- 整扇窗是一个看不见的点击区：点一下走到窗前看海，再点一下回来 ----
  // 它在所有桌面物件的后面，所以点显示器、书、录音机时不会误触
  const viewArea = new THREE.Mesh(pane.geometry, bin.add(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
  viewArea.position.set(0, wy, fz - 0.03); viewArea.layers.set(HIT_LAYER);
  group.add(viewArea);
  let atWindow = false;
  const off = [on(bus, 'window:focus', () => { atWindow = true; }), on(bus, 'window:blur', () => { atWindow = false; })];
  pick(viewArea, { click() { emit(bus, atWindow ? 'window:blur' : 'window:focus'); } });

  // ---- 光：朝阳从窗外斜照进来，冷色天光补暗部，身后一点暖色补光 ----
  // high 档：平行光 + 覆盖整个房间的阴影贴图，墙会把不该晒到的家具挡在阴影里。
  // mid 档没有阴影贴图：改用一束只罩住书桌的远距离聚光，免得房间另一头的家具也被「晒」到。
  let sun: THREE.DirectionalLight | THREE.SpotLight;
  if (high) {
    const d = new THREE.DirectionalLight(0xffbe82, 3.6);
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    const c = d.shadow.camera; c.left = -4; c.right = 4; c.top = 4.2; c.bottom = -3.2; c.near = 2; c.far = 30;
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.015; d.shadow.radius = 4;
    sun = d;
  } else {
    sun = new THREE.SpotLight(0xffbe82, 3.6, 0, 0.115, 0.6, 0);
  }
  sun.position.copy(SUN_LIGHT_DIR).multiplyScalar(14);
  sun.target.position.set(0, 0, 0.1);
  const hemi = new THREE.HemisphereLight(0xdcdff2, 0x7a6048, 0.55);
  const fill = new THREE.PointLight(0xffe2c4, 1.0, 8, 1.2);
  fill.position.set(0.4, 1.5, 2.6);
  // 阳光打在桌面上再弹起来的暖光，照亮书脊、屏幕下方这些背光面
  const bounce = new THREE.PointLight(0xffc48c, 0.8, 2.4, 1.4);
  bounce.position.set(0, 0.4, 0.3);
  group.add(sun, sun.target, hemi, fill, bounce);

  // ---- 天花板（深色木梁）和朝镜头那面墙 ----
  // 镜头可以在屋里拉远、换广角往下看（用户要的「能拉远一点，但限制在房屋内」），屋子得是封闭的，
  // 不然广角会从墙顶上看到天和树、从敞开的一面看到菜园的地面边缘。镜子也直接照到这面墙。
  // 一个网格（顶点色），不投影也不接收实时阴影：不挡窗户进来的阳光，烘焙的墙和地板也不受影响。
  const shell = new Batch(['position', 'normal', 'uv', 'color']);
  const shellMat = bin.add(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a241c }));
  const tint = (geo: THREE.BufferGeometry, hex: number, jitter = 0) => {
    const c = new THREE.Color(hex), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
    const k = 1 + (Math.random() - 0.5) * jitter;
    for (let i = 0; i < n; i++) { a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    return geo;
  };
  const ceilZ0 = wallZ - th, ceilD = RZ - ceilZ0;
  shell.add(shellMat, tint(new THREE.PlaneGeometry(RX * 2, ceilD).rotateX(Math.PI / 2), 0xe2dbcf), [0, top, ceilZ0 + ceilD / 2]);
  // 横梁：顺着 x 方向跨过整间屋，下面两根顺着 z 的檩条压在上面
  for (let z = ceilZ0 + 0.55; z < RZ - 0.3; z += 1.05)
    shell.add(shellMat, tint(new THREE.BoxGeometry(RX * 2, 0.17, 0.15), 0x3b2a1e, 0.18), [0, top - 0.085, z]);
  for (const x of [-1.6, 1.6])
    shell.add(shellMat, tint(new THREE.BoxGeometry(0.13, 0.1, ceilD), 0x4a3526, 0.1), [x, top - 0.22, ceilZ0 + ceilD / 2]);
  // 前墙（朝窗户）+ 踢脚线
  shell.add(shellMat, tint(new THREE.PlaneGeometry(RX * 2, H).rotateY(Math.PI), 0xd8d1c4), [0, yc, RZ]);
  shell.add(shellMat, tint(new THREE.PlaneGeometry(RX * 2, 0.1).rotateY(Math.PI), 0xf3efe6), [0, floorY + 0.05, RZ - 0.009]);
  shell.build(group, bin, { cast: false, receive: false });

  scene.add(group);
  return {
    frame() {
      for (const w of sideWalls) w.mesh.visible = camera.position.x * w.s < RX - 0.05;
      // 实拍贴图可能比光照贴图晚到：把颜色贴图同步到烘焙材质上
      for (const b of baked) if (b.basic.map !== b.src.map) { b.basic.map = b.src.map; b.basic.color.copy(b.src.color); b.basic.needsUpdate = true; }
    },
    stop() { stopped = true; off.forEach((f) => f()); scene.remove(group); bin.dispose(); },
  };
};
