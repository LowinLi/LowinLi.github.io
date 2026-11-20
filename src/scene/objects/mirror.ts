import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Bin, on, type SceneObject } from '../types';
import { L } from '../layout';
import { Batch, blob, canvasTex, contactMaterial, rbox, woodGrain } from '../util';

const RX = 3.2; // 右墙的内表面（和 room.ts 一致）

/**
 * 右墙边一面落地镜：深色实木框，底下一道横枨，靠墙微微后仰。镜面是真的平面反射（three 的 Reflector）。
 *
 * 反射要把整个场景再画一遍，成本和主画面差不多，所以：
 * - 只有镜子在画面里时才画（自己做一次视锥判断，镜头不朝它就不花钱）；
 * - 倒影的分辨率是画面的一半（mid 档 0.35），不做多重采样；
 * - 隔帧更新（mid 档每 3 帧），降到最低档后每 4 帧；
 * - 在每帧开头单独画，不在主画面渲染途中插进去（会打乱 high 档后期处理的离屏缓冲）。
 * 镜头绕到右墙外面时，墙会隐藏，镜子也跟着隐藏。
 */
export const mirror: SceneObject = ({ scene, camera, renderer, tier, bus }) => {
  const bin = new Bin();
  const high = tier === 'high';
  const fy = L.floorY;
  const MW = 0.62, MH = 1.78, FW = 0.05, lean = 0.065, mz = 1.0;
  const root = new THREE.Group();
  root.position.set(RX - 0.035 - Math.sin(lean) * MH, fy, mz); // 底边离墙一点，顶边靠在墙上
  root.rotation.set(0, -Math.PI / 2, 0, 'YXZ');                 // 正面朝屋里（-x）
  root.rotation.x = -lean;                                       // 顶部往墙那边仰

  // 框：深色实木，四角做成一点点外凸的「出头」，有点明式家具的意思
  const wood = bin.add(new THREE.MeshStandardMaterial({ roughness: 0.45, map: bin.add(canvasTex(128, 512, (g, w, h) => woodGrain(g, 0, 0, w, h, '#4a2618', '14,6,3', 51, 90))) }));
  wood.bumpMap = wood.map; wood.bumpScale = 1;
  const batch = new Batch();
  const yc = MH / 2 + 0.03;
  batch.add(wood, rbox(FW, MH + 0.06, 0.035, 0.008), [-(MW / 2 + FW / 2), yc, 0]);
  batch.add(wood, rbox(FW, MH + 0.06, 0.035, 0.008), [MW / 2 + FW / 2, yc, 0]);
  batch.add(wood, rbox(MW + FW * 2 + 0.05, FW, 0.04, 0.008), [0, MH + 0.03 + FW / 2, 0]);
  batch.add(wood, rbox(MW + FW * 2, FW * 1.4, 0.04, 0.008), [0, 0.03 + FW * 0.7 - 0.01, 0]);
  batch.add(wood, new THREE.BoxGeometry(MW + FW * 2, MH + 0.06, 0.01), [0, yc, -0.022]); // 背板
  batch.build(root, bin, { cast: high, receive: high, collapse: true });

  // 镜面
  const scale = high ? 0.5 : 0.35;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const glass = new Reflector(bin.add(new THREE.PlaneGeometry(MW, MH)), {
    textureWidth: Math.max(256, Math.round(size.x * scale)),
    textureHeight: Math.max(256, Math.round(size.y * scale)),
    color: 0xc9ced2, clipBias: 0.003, multisample: 0,
  });
  glass.position.set(0, yc, 0.0185);
  root.add(glass);
  // 倒影不在主画面渲染途中画（Reflector 默认在 onBeforeRender 里画）：high 档的后期处理会把主画面画进多重采样的离屏缓冲，
  // 中途插一次别的渲染会把它打乱，整个画面变空。所以把它摘出来，在每帧开头（主画面之前）单独画，并且每 N 帧才画一次。
  const renderReflection = glass.onBeforeRender.bind(glass);
  glass.onBeforeRender = () => {};
  let every = high ? 2 : 3, tick = 0, stillSkips = 0;
  const lastCam = new Float32Array(16);
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  // 镜面边上一圈细细的银边和斜着的一道高光，看起来是玻璃不是开了个洞
  const edge = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(MW + 0.012, MH + 0.012)), bin.add(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.25, metalness: 1 })));
  edge.position.set(0, yc, 0.018);
  root.add(edge);
  const sheen = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(MW, MH)), bin.add(new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending,
    map: bin.add(canvasTex(64, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h * 0.5);
      grad.addColorStop(0, '#000'); grad.addColorStop(0.42, '#000'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(0.62, '#000'); grad.addColorStop(1, '#000');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })),
  })));
  sheen.position.set(0, yc, 0.0195);
  sheen.userData.noAO = true;
  root.add(sheen);
  scene.add(root);

  // 脚下的接触阴影（放在世界坐标里，不跟着镜子仰）
  const contact = new THREE.Mesh(bin.add(blob(0.16, 0.45)), contactMaterial(bin, high ? 0.32 : 0.5));
  contact.position.set(RX - 0.12, fy + 0.016, mz);
  scene.add(contact);

  const off = [on(bus, 'quality:nopost', () => { every = 4; })];
  return {
    frame() {
      tick++;
      const inside = camera.position.x < RX - 0.05; // 镜头绕到右墙外面时，墙会隐藏，镜子也一起藏
      root.visible = inside; contact.visible = inside;
      if (!inside || tick % every !== 0) return;
      // 只有镜子在画面里时才画倒影（用上一帧的相机，差一帧看不出来）
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      glass.updateMatrixWorld();
      if (!frustum.intersectsObject(glass)) return;
      // 镜头停着时倒影里只有钟摆、浮尘这类小动静：降到每 10 次才画一次（mid 档约 2 次/秒）
      const e = camera.matrixWorld.elements; let same = true;
      for (let i = 0; i < 16; i++) if (Math.abs(e[i] - lastCam[i]) > 1e-5) { same = false; lastCam[i] = e[i]; }
      if (same && ++stillSkips < 10) return;
      stillSkips = 0;
      renderReflection(renderer, scene, camera, glass.geometry, glass.material as THREE.Material, null as never);
    },
    stop() {
      off.forEach((f) => f());
      scene.remove(root, contact);
      glass.dispose();
      bin.dispose();
    },
  };
};
