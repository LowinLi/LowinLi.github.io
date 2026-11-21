import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { refineBeast } from './beastMesh';
import { emit, HIT_LAYER, type MountContext } from './types';
import { L } from './layout';
import { asset } from './util';

/**
 * 猪圈、羊圈、牛棚里的牲口（用户要的「圈里养着猪、羊、牛，点他们他们可以抬头冲着我叫一下，双击可以抓他们做猪肉羊肉牛肉」）。
 * 圈本身是 countryside.ts 画的（L.pens），这里只管牲口；由 animals.ts 调用，借它的叫声通道（窗前原音量、屋里两成、按左右做声像）。
 *
 * - 模型：Quaternius「Farm Animals」（CC0）的猪、羊（FBX 用 three 的 FBXLoader 读进来再导成 glb）和牛（和水牛同一个 cow.glb，改成黄牛色）。
 *   每圈两头，克隆骨骼（SkeletonUtils.clone），各自重新上色：一白一黑两头猪、两只深浅不同的绵羊、两头深浅不同的黄牛。
 * - 平时：放 Idle 动作（低头吃草、甩头），隔几秒原地转个身，或者在自己那一小块里慢慢挪几步（牛放 WalkSlow，猪羊身子一颠一颠）。
 * - 单击：转过身朝着窗口，抬头（Neck、Head 两根骨头在动画之后再往上掰），叫一声（哼哼 / 咩 / 哞）。
 * - 双击（两下间隔 0.45 秒以内）：抓走——叫一声（猪是尖叫）、一路打着转缩小飞进窗口，灶台上多一份肉（pantry:add {item: pork | mutton | beef}）。
 *   每头只能抓一次，刷新页面才回来。不在窗前时点它先走到窗前。
 */
type Kind = 'pig' | 'sheep' | 'cow';
export type Voice = 'oink' | 'squeal' | 'baa' | 'moo';
interface Spec { file: string; height: number; item: string; meat: string; noun: string; say: string; voice: Voice; caught: Voice; colors: Record<string, number>[]; hit: [number, number, number]; homes: [number, number, number][]; roam: number; walk?: string }
const SPEC: Record<Kind, Spec> = {
  // homes：[相对圈中心的 x, z, 朝向]；两头各占一块，互相不挤
  pig: { file: 'pig', height: 0.52, item: 'pork', meat: '猪肉', noun: '一头猪', say: '哼哼～', voice: 'oink', caught: 'squeal', colors: [{ 'Material.003': 0xeab7a6 }, { 'Material.003': 0x2c2829 }],
    hit: [0.32, 0.32, 0.6], homes: [[-0.18, 0.5, 0.25], [0.22, -0.45, 2.95]], roam: 0.3 },
  sheep: { file: 'sheep', height: 0.78, item: 'mutton', meat: '羊肉', noun: '一只羊', say: '咩～', voice: 'baa', caught: 'baa', colors: [{ White: 0xf1ebdf, Black: 0x2a2624 }, { White: 0xe2d6c2, Black: 0x47392f }],
    hit: [0.32, 0.42, 0.6], homes: [[0.2, 0.5, -0.2], [-0.22, -0.45, 3.05]], roam: 0.3 },
  cow: { file: 'cow', height: 1.22, item: 'beef', meat: '牛肉', noun: '一头牛', say: '哞～', voice: 'moo', caught: 'moo', colors: [{ White: 0xb57c44, Black: 0x5e3c22, Pink: 0xd8aa98 }, { White: 0x8c5c34, Black: 0x45291a, Pink: 0xc69686 }],
    hit: [0.45, 0.65, 1.05], homes: [[-0.62, 0.15, 0.15], [0.42, -0.25, -0.2]], roam: 0.12, walk: 'walkslow' },
};
const PEN: Record<Kind, keyof typeof L.pens> = { pig: 'pig', sheep: 'sheep', cow: 'cow' };

interface Beast {
  kind: Kind; spec: Spec; root: THREE.Group; model: THREE.Object3D | null; head: THREE.Object3D | null; neck: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null; walk: THREE.AnimationAction | null;
  home: THREE.Vector3; heading: number; want: number; target: THREE.Vector3 | null; timer: number;
  call: number; callSaid: boolean; lastClick: number; caught: boolean; flyT: number; from: THREE.Vector3; ph: number;
}

export interface LivestockCtx {
  group: THREE.Group; loader: GLTFLoader; camera: THREE.Camera; bus: MountContext['bus']; pick: MountContext['pick'];
  /** animals.ts 的 prepare：换成屋外用的材质、重新上色、按高度缩放 */
  prepare: (model: THREE.Object3D, recolor: Record<string, number>, height: number, precise?: boolean) => THREE.Object3D;
  /** 加载好的模型放进这里（animals.ts 据此给它们补一天里的色调、stop 时释放） */
  loaded: THREE.Object3D[];
  stopped: () => boolean;
  /** 细分几次：high 2、mid 1 */
  levels: number;
  atWindow: () => boolean;
  /** 在世界坐标 p 处叫一声 */
  voice: (kind: Voice, p: THREE.Vector3, loud: number) => void;
}

export function createLivestock(c: LivestockCtx) {
  const beasts: Beast[] = [];
  const hitGeo = new THREE.SphereGeometry(1, 10, 8), hitMat = new THREE.MeshBasicMaterial();
  const tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), dq = new THREE.Quaternion(), ax = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
  let tipShown = false, ambient = 6 + Math.random() * 8;
  const say = (msg: string, ms = 2600) => { emit(c.bus, 'cup:state', { msg }); setTimeout(() => emit(c.bus, 'cup:state', null), ms); };

  (Object.keys(SPEC) as Kind[]).forEach((kind) => {
    const s = SPEC[kind], pen = L.pens[PEN[kind]];
    const list = s.homes.map(([hx, hz, hd]) => {
      const root = new THREE.Group();
      const home = new THREE.Vector3(pen.x + hx, L.groundY, pen.z + hz);
      root.position.copy(home); root.rotation.y = hd; c.group.add(root);
      const b: Beast = { kind, spec: s, root, model: null, head: null, neck: null, mixer: null, walk: null, home, heading: hd, want: hd, target: null, timer: 2 + Math.random() * 5,
        call: -1, callSaid: false, lastClick: 0, caught: false, flyT: -1, from: new THREE.Vector3(), ph: Math.random() * 6 };
      // 点击区：一个看不见的椭球（HIT_LAYER，不画），带 keepsWindow：在窗前点它不会回座位
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.scale.set(...s.hit); hit.position.y = s.height * 0.55; hit.layers.set(HIT_LAYER); hit.userData.keepsWindow = true;
      root.add(hit);
      c.pick(hit, { click: () => onClick(b) });
      beasts.push(b);
      return b;
    });
    c.loader.loadAsync(asset(`models/animals/${s.file}.glb`)).then((gltf) => {
      if (c.stopped()) return;
      const idleClip = gltf.animations.find((a) => a.name.toLowerCase().includes('idle'));
      const walkClip = s.walk ? gltf.animations.find((a) => a.name.toLowerCase().replace(/.*\|/, '') === s.walk) : undefined;
      list.forEach((b, i) => {
        const model = c.prepare(cloneSkinned(gltf.scene), s.colors[i % s.colors.length], s.height, true);
        // 模型的头朝哪边不一定：量一下 Head 骨头在身子中心的哪个方向，转到朝 +z；脚踩地
        b.root.add(model); b.root.updateMatrixWorld(true);
        const head = model.getObjectByName('Head') ?? null, box = new THREE.Box3().setFromObject(model, true);
        if (head) {
          const hp = b.root.worldToLocal(head.getWorldPosition(new THREE.Vector3())), cen = b.root.worldToLocal(box.getCenter(new THREE.Vector3()));
          model.rotation.y = -Math.atan2(hp.x - cen.x, hp.z - cen.z);
        }
        b.root.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(model, true); const cen2 = b.root.worldToLocal(box2.getCenter(new THREE.Vector3()));
        model.position.set(-cen2.x, -b.root.worldToLocal(box2.min.clone()).y, -cen2.z); // 身子正中对准 root，脚踩在地上
        refineBeast(model, kind === 'sheep' ? 'wool' : 'hair', c.levels); // 合并、细分磨圆、羊毛、细纹理（用户嫌「太方块」）
        b.model = model; b.head = head; b.neck = model.getObjectByName('Neck') ?? null;
        b.mixer = new THREE.AnimationMixer(model);
        if (idleClip) { const a = b.mixer.clipAction(idleClip); a.play(); a.time = Math.random() * idleClip.duration; a.timeScale = 0.8 + Math.random() * 0.3; }
        if (walkClip) { b.walk = b.mixer.clipAction(walkClip); b.walk.play(); b.walk.setEffectiveWeight(0); }
        c.loaded.push(model);
      });
    }).catch((e) => console.warn(`[scene] 牲口模型 ${s.file} 加载失败`, e));
  });

  function onClick(b: Beast) {
    if (b.caught || b.flyT >= 0) return;
    if (!c.atWindow()) { emit(c.bus, 'window:focus'); return; }
    const now = performance.now();
    if (now - b.lastClick < 450) { // 双击：抓走
      b.lastClick = 0; b.call = -1; b.flyT = 0; b.from.copy(b.root.position);
      c.voice(b.spec.caught, b.root.getWorldPosition(tmp), 1.8);
      say(`抓到${b.spec.noun}！`, 1500);
      return;
    }
    b.lastClick = now;
    if (b.call < 0) { b.call = 0; b.callSaid = false; }
    if (!tipShown) { tipShown = true; say(`${b.spec.say} · 双击可以抓回去做${b.spec.meat}`, 3200); }
  }

  /** 绕世界坐标里的一根轴把骨头再掰一点（在动画之后做，不影响动画本身） */
  const bend = (bone: THREE.Object3D, axis: THREE.Vector3, ang: number) => {
    if (!bone.parent || Math.abs(ang) < 1e-4) return;
    bone.getWorldQuaternion(tq); bone.parent.getWorldQuaternion(pq);
    dq.setFromAxisAngle(axis, ang);
    bone.quaternion.copy(pq.invert().multiply(dq.multiply(tq)));
    bone.updateMatrixWorld(true);
  };
  const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  return {
    frame(dt: number, t: number) {
      const camP = c.camera.position;
      // 蒙皮网格关了视锥剔除（包围盒不跟骨骼动），自己按一个包住整头牲口的球判断：不在画面里就不画（转到灶台、冰箱时省十几次 draw call）
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(c.camera.projectionMatrix, c.camera.matrixWorldInverse));
      for (const b of beasts) if (b.model) b.model.visible = b.flyT >= 0 || frustum.intersectsSphere(sph.set(b.root.position, b.spec.height * 1.3));
      // 圈里时不时自己叫一声（轻一点）：猪哼哼、羊咩、牛哞
      ambient -= dt;
      if (ambient <= 0) { ambient = 9 + Math.random() * 16; const free = beasts.filter((b) => !b.caught && b.flyT < 0 && b.model); const b = free[Math.floor(Math.random() * free.length)]; if (b) c.voice(b.spec.voice, b.root.getWorldPosition(tmp), 0.55); }
      for (const b of beasts) {
        if (b.caught) continue;
        // ---- 被抓：一路打转、越来越小，飞到窗口就进屋了 ----
        if (b.flyT >= 0) {
          b.flyT = Math.min(1, b.flyT + dt / 1.6);
          const k = b.flyT, to = tmp.set(0.3, 0.2, L.wallZ - 0.35);
          b.root.position.lerpVectors(b.from, to, k); b.root.position.y += Math.sin(k * Math.PI) * 1.6;
          b.root.rotation.y += dt * 8; b.root.scale.setScalar(1 - 0.8 * k * k);
          b.mixer?.update(dt * 2);
          if (b.flyT >= 1) {
            b.flyT = -1; b.caught = true; b.root.visible = false;
            emit(c.bus, 'pantry:add', { item: b.spec.item });
            const left = beasts.filter((x) => x.kind === b.kind && !x.caught).length;
            say(`抓回来了 · 灶台上多了一份${b.spec.meat}（底部「做饭」）${left ? '' : ` · 圈里空了`}`, 3200);
          }
          continue;
        }
        // ---- 叫：先转过身对着窗口，抬头，叫一声；两秒多以后放下头接着吃 ----
        let lift = 0;
        if (b.call >= 0) {
          b.call += dt;
          b.want = Math.atan2(camP.x - b.root.position.x, camP.z - b.root.position.z);
          lift = Math.min(1, b.call / 0.35) * Math.min(1, Math.max(0, (2.6 - b.call) / 0.5));
          if (!b.callSaid && b.call > 0.4) { b.callSaid = true; c.voice(b.spec.voice, b.root.getWorldPosition(tmp).setY(L.groundY + b.spec.height), 1.3); }
          if (b.call > 2.6) b.call = -1;
          b.target = null;
        } else {
          // ---- 平时：隔几秒原地转个身，或者在自己那一小块里挪几步 ----
          b.timer -= dt;
          if (b.timer <= 0) {
            b.timer = 4 + Math.random() * 7;
            // 圈比牲口的身长窄：只顺着圈的进深转身、挪步（横过来会从墙里穿出去）
            if (Math.random() < 0.5) b.want = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8;
            else b.target = b.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 2 * b.spec.roam));
          }
        }
        let moving = 0;
        if (b.target) {
          const dx = b.target.x - b.root.position.x, dz = b.target.z - b.root.position.z, d = Math.hypot(dx, dz);
          if (d < 0.03) b.target = null;
          else {
            b.want = Math.atan2(dx, dz);
            if (Math.abs(angDiff(b.want, b.heading)) < 0.5) { const sp = Math.min(d, (b.kind === 'cow' ? 0.22 : 0.16) * dt); b.root.position.x += dx / d * sp; b.root.position.z += dz / d * sp; moving = 1; }
          }
        }
        b.heading += angDiff(b.want, b.heading) * Math.min(1, dt * (b.call >= 0 ? 3.5 : 1.4));
        b.root.rotation.y = b.heading;
        // 猪、羊没有走路的动作：走的时候身子一颠一颠；牛放 WalkSlow
        if (b.model) {
          b.ph += dt * 9 * moving;
          b.model.position.y += ((moving ? Math.abs(Math.sin(b.ph)) * 0.018 : 0) - (b.model.userData.bob ?? 0));
          b.model.userData.bob = moving ? Math.abs(Math.sin(b.ph)) * 0.018 : 0;
        }
        if (b.walk) b.walk.setEffectiveWeight(THREE.MathUtils.damp(b.walk.getEffectiveWeight(), moving, 4, dt));
        b.mixer?.update(dt);
        // 抬头：动画算完以后，脖子和头绕身子的横轴往上掰（转过来对着窗口时，「往上」就是朝着屋里的人）
        if (lift > 0 && b.head) {
          ax.set(Math.cos(b.heading), 0, -Math.sin(b.heading));
          if (b.neck) bend(b.neck, ax, -0.35 * lift);
          bend(b.head, ax, -0.5 * lift);
        }
      }
    },
    stop() {
      for (const b of beasts) { b.mixer?.stopAllAction(); c.group.remove(b.root); }
      hitGeo.dispose(); hitMat.dispose();
    },
  };
}
