import * as THREE from 'three';
import { Bin, type SceneObject } from '../types';
import { L } from '../layout';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { emit } from '../types';
import { asset, Batch, blob, canvasTex, contactMaterial, leafGeo, potGeo, rbox, rng, speckle, type V3 } from '../util';

/**
 * 盆栽：桌上一盆橡皮树、一盆石莲花，地上一盆虎尾兰（带木质花架）。
 * 点击会晃，悬停会轻轻动一下；平时有一点微风。每盆的叶子分成几组，各自用阻尼弹簧摆动，所以晃起来有先有后。
 */
export const plants: SceneObject = ({ scene, tier, pick, bus }) => {
  const bin = new Bin();
  const group = new THREE.Group();
  const high = tier === 'high';
  // 有贴图的材质默认把同一张图当凹凸图，让木纹、布纹、叶脉有起伏
  const std = (o: THREE.MeshStandardMaterialParameters) => bin.add(new THREE.MeshStandardMaterial(o.map && o.bumpScale !== 0 ? { bumpMap: o.map, bumpScale: 1, ...o } : o));
  const soil = std({ roughness: 1, map: bin.add(canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#2b2018'; g.fillRect(0, 0, w, h); speckle(g, w, h, 71, 500, '150,120,90', 0.5); })) });
  const contact = contactMaterial(bin, high ? 0.32 : 0.55);

  type Part = { obj: THREE.Group; k: number; gain: number; ax: number; az: number; vx: number; vz: number };
  type Plant = { parts: Part[]; seed: number };
  const list: Plant[] = [];

  /** 建一盆：返回静态部件的 Batch、放叶子的顶部节点，以及「加一组会摆动的叶子」的函数 */
  const make = (pos: V3, topY: number, stiff: number, groups: number) => {
    const root = new THREE.Group(); root.position.set(...pos);
    group.add(root);
    const statics = new Batch();
    const plant: Plant = { parts: [], seed: pos[0] * 7 };
    const leaves: Batch[] = [];
    for (let i = 0; i < groups; i++) {
      const obj = new THREE.Group(); obj.position.y = topY; root.add(obj);
      plant.parts.push({ obj, k: stiff * (0.8 + i * 0.25), gain: 1 + i * 0.35, ax: 0, az: 0, vx: 0, vz: 0 });
      leaves.push(new Batch(['position', 'normal', 'uv', 'color']));
    }
    const kick = (power: number) => {
      const a = Math.random() * Math.PI * 2;
      for (const p of plant.parts) { p.vx += Math.cos(a) * power * p.gain; p.vz += Math.sin(a) * power * p.gain; }
    };
    pick(root, { click() { kick(6); }, hover(on) { if (on) kick(1.4); } });
    list.push(plant);
    const finish = () => {
      statics.build(root, bin, { cast: high, receive: high, noCast: [contact], collapse: true });
      leaves.forEach((b, i) => b.build(plant.parts[i].obj, bin, { cast: high, receive: high }));
    };
    return { statics, leaves, finish, root, plant };
  };

  // 桌上的两盆在加载完成后换成扫描级的真实模型（Poly Haven，CC0）；加载失败就保留上面现画的版本
  let stopped = false;
  const models: THREE.Object3D[] = [];
  const useModel = (target: { root: THREE.Group; plant: Plant }, name: string, o: { scale: number; sway: string; drop?: string[]; stiff: number; shadowR: number }) => {
    new GLTFLoader().loadAsync(asset(`models/${name}/${name}.gltf`)).then((gltf) => {
      const model = gltf.scene;
      if (stopped) return;
      for (const n of o.drop ?? []) model.getObjectByName(n)?.removeFromParent();
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = high;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.anisotropy = 8;
        if (mat.alphaTest > 0) mesh.userData.noAO = true; // 镂空叶片不参与环境光遮蔽
      });
      model.scale.setScalar(o.scale);
      const sway = model.getObjectByName(o.sway);
      // 保留点击 / 悬停的拾取节点，只把里面现画的东西换掉
      target.root.clear();
      target.root.add(model);
      const shadow = new THREE.Mesh(bin.add(blob(o.shadowR, o.shadowR)), contact);
      shadow.position.y = 0.0009;
      target.root.add(shadow);
      if (sway) {
        // 叶子绕自己的根部摆：包一层以根部为原点的节点
        const pivot = new THREE.Group();
        const box = new THREE.Box3().setFromObject(sway);
        pivot.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
        sway.parent!.add(pivot);
        pivot.attach(sway);
        target.plant.parts = [{ obj: pivot, k: o.stiff, gain: 1, ax: 0, az: 0, vx: 0, vz: 0 }];
      } else target.plant.parts = [];
      models.push(model);
      emit(bus, 'scene:changed');
    }).catch((e) => console.warn(`[scene] 模型 ${name} 加载失败，继续用程序版本`, e));
  };

  // ---- 1. 桌面左前：橡皮树。白瓷盆 + 托盘，深绿油亮的大叶子沿茎互生 ----
  {
    const p = make([-1.03, 0, 0.33], 0.105, 50, 3);
    const glaze = std({ color: 0xf4f1ea, roughness: 0.18 });
    p.statics.add(glaze, potGeo(0.07, 0.052, 0.11), [0, 0.006, 0]);
    p.statics.add(glaze, new THREE.CylinderGeometry(0.068, 0.06, 0.008, 36), [0, 0.004, 0]);
    p.statics.add(soil, new THREE.CircleGeometry(0.064, 28).rotateX(-Math.PI / 2), [0, 0.104, 0]);
    p.statics.add(contact, blob(0.11, 0.11), [0, 0.0009, 0]);
    const leafTex = bin.add(canvasTex(128, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, '#1f5a35'); grad.addColorStop(1, '#2f7d48');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(190,225,170,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke(); // 中脉
      g.strokeStyle = 'rgba(170,215,160,.28)'; g.lineWidth = 1.2;
      for (let y = h - 10; y > 20; y -= 15) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * 30, y - 16, w / 2 + s * 62, y - 34); g.stroke(); }
    }));
    const leafMat = std({ map: leafTex, roughness: 0.3, side: THREE.DoubleSide });
    const stemMat = std({ color: 0x4a3a26, roughness: 0.8 });
    const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.01, 0), new THREE.Vector3(0.006, 0.08, 0.004), new THREE.Vector3(-0.004, 0.17, -0.004), new THREE.Vector3(0.004, 0.25, 0)]);
    p.leaves[0].add(stemMat, new THREE.TubeGeometry(stem, 12, 0.005, 8));
    const r = rng(3);
    for (let i = 0; i < 11; i++) {
      const t = 0.12 + (i / 10) * 0.86, at = stem.getPoint(t), len = 0.17 - t * 0.06 + r() * 0.02;
      const geo = leafGeo({ len, width: len * 0.4, bend: 0.75, fold: 0.16, segs: 10 });
      p.leaves[i % 3].add(leafMat, geo, [at.x, at.y, at.z], [1.25 - t * 0.85 + (r() - 0.5) * 0.2, i * 2.4, 0]);
    }
    p.finish();
    useModel(p, 'potted_plant_02', { scale: 0.4, sway: 'potted_plant_02_leaves', stiff: 45, shadowR: 0.13 });
  }

  // ---- 2. 显示器右边：石莲花。陶盆 + 托盘，肥厚的叶片一圈圈排成莲座，叶尖带粉 ----
  {
    const p = make([0.39, 0, -0.32], 0.058, 120, 1);
    const terracotta = std({ roughness: 0.85, map: bin.add(canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#c56f49'; g.fillRect(0, 0, w, h); speckle(g, w, h, 72, 600, '80,30,10', 0.2); })) });
    p.statics.add(terracotta, potGeo(0.05, 0.036, 0.062, 0.006, 0.005), [0, 0.006, 0]);
    p.statics.add(terracotta, new THREE.CylinderGeometry(0.052, 0.046, 0.007, 32), [0, 0.0035, 0]);
    p.statics.add(soil, new THREE.CircleGeometry(0.045, 24).rotateX(-Math.PI / 2), [0, 0.056, 0]);
    p.statics.add(contact, blob(0.08, 0.08), [0, 0.0009, 0]);
    const fat = std({ vertexColors: true, roughness: 0.6 });
    const base = new THREE.Color(0x8fb8a2), tipC = new THREE.Color(0xd98c8c), c = new THREE.Color();
    const fatLeaf = () => {
      const geo = new THREE.SphereGeometry(1, 10, 8);
      geo.scale(0.4, 1, 0.15).translate(0, 1, 0);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / 2;
        pos.setX(i, pos.getX(i) * (1 - 0.8 * Math.pow(t, 2.6)));       // 收成尖
        pos.setZ(i, pos.getZ(i) + t * t * 0.3);                         // 向内勺起
        c.copy(base).lerp(tipC, Math.pow(t, 5)).toArray(col, i * 3);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    };
    const rings = [[10, 1.3, 0.02], [9, 1.0, 0.0185], [7, 0.68, 0.016], [5, 0.36, 0.0125], [3, 0.12, 0.009]] as const;
    rings.forEach(([n, tilt, size], ri) => {
      for (let i = 0; i < n; i++) p.leaves[0].add(fat, fatLeaf(), [0, 0.002 + ri * 0.003, 0], [tilt, (i / n) * Math.PI * 2 + ri * 0.45, 0], size);
    });
    p.finish();
    useModel(p, 'potted_plant_04', { scale: 0.62, sway: 'potted_plant_04_plant', drop: ['potted_plant_04_ground'], stiff: 110, shadowR: 0.085 });
  }

  // ---- 3. 地上：虎尾兰。哑光陶盆架在三脚木花架上，剑形叶片有横向斑纹和黄边 ----
  {
    const fy = L.floorY, standH = 0.16, potH = 0.3;
    const p = make([2.72, fy, -0.62], standH + potH - 0.01, 34, 3); // 原来在 1.72，那里放了冰箱
    const pot = std({ roughness: 0.75, map: bin.add(canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9e4da'; g.fillRect(0, 0, w, h); speckle(g, w, h, 73, 900, '80,70,60', 0.25); })) });
    const wood = std({ color: 0x9a6a3e, roughness: 0.5 });
    p.statics.add(pot, potGeo(0.19, 0.15, potH, 0.012, 0.012), [0, standH, 0]);
    p.statics.add(soil, new THREE.CircleGeometry(0.176, 32).rotateX(-Math.PI / 2), [0, standH + potH - 0.012, 0]);
    p.statics.add(wood, new THREE.TorusGeometry(0.165, 0.011, 10, 40), [0, standH + 0.02, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      p.statics.add(wood, rbox(0.024, standH + 0.06, 0.024, 0.006), [Math.cos(a) * 0.18, (standH + 0.06) / 2, Math.sin(a) * 0.18], [Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12]);
    }
    p.statics.add(contact, blob(0.3, 0.3), [0, 0.016, 0]);
    const bladeTex = bin.add(canvasTex(64, 512, (g, w, h) => {
      g.fillStyle = '#2d6a43'; g.fillRect(0, 0, w, h);
      const r = rng(9);
      for (let y = 0; y < h; y += 5 + r() * 9) { g.fillStyle = `rgba(${r() < 0.5 ? '18,60,36' : '120,170,120'},${0.25 + r() * 0.35})`; g.fillRect(0, y + Math.sin(y) * 2, w, 2 + r() * 5); } // 横斑
      g.fillStyle = '#c9c46a'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);                                                                                              // 黄边
    }));
    const blade = std({ map: bladeTex, roughness: 0.5, side: THREE.DoubleSide });
    const sword = (t: number) => (0.5 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.55))) * (1 - Math.pow(t, 5));
    const r = rng(4);
    for (let i = 0; i < 13; i++) {
      const len = 0.5 + r() * 0.42, rad = 0.02 + r() * 0.07, a = i * 2.4;
      const geo = leafGeo({ len, width: 0.036 + r() * 0.014, bend: 0.1 + r() * 0.18, fold: 0.3, twist: (r() - 0.5) * 1.2, segs: 14, shape: sword });
      p.leaves[i % 3].add(blade, geo, [Math.sin(a) * rad, 0, Math.cos(a) * rad], [0.05 + r() * 0.22, a, 0]);
    }
    p.finish();
  }

  scene.add(group);
  return {
    frame(dt, t) {
      for (const plant of list) {
        plant.parts.forEach((p, i) => {
          p.vx += (-p.k * p.ax - 2.6 * p.vx) * dt; p.vz += (-p.k * p.az - 2.6 * p.vz) * dt;
          p.ax += p.vx * dt; p.az += p.vz * dt;
          const breeze = 0.006 * (1 + i * 0.5);
          p.obj.rotation.z = p.ax * 0.2 + Math.sin(t * 0.9 + plant.seed + i) * breeze;
          p.obj.rotation.x = p.az * 0.2 + Math.cos(t * 0.7 + plant.seed + i * 2) * breeze;
        });
      }
    },
    stop() {
      stopped = true;
      for (const m of models) m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) t?.dispose();
        mat.dispose();
      });
      scene.remove(group); bin.dispose();
    },
  };
};
