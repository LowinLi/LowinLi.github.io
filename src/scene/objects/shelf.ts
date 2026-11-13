import * as THREE from 'three';
import { emit, on, type SceneObject } from '../types';
import { LAYOUT, vcrSlot } from '../layout';
import { Tween, damp } from '../tween';
import { TAPES } from '../../tapes';
import { FONT } from '../../tapes/types';

const TW = 0.4, TH = 0.062, TD = 0.22; // 平放的录像带：宽(x) × 厚(y) × 深(z)

/**
 * 桌上一摞录像带。悬停抽出一点，点击飞进录像机。
 * 监听 tape:insert {id}（也来自 HTML 按钮）、tape:ejected {id}；发出 tape:loaded {id}。
 */
export const shelf: SceneObject = ({ scene, tier, bus, pick }) => {
  const group = new THREE.Group();
  group.position.set(LAYOUT.tapes.x, 0, LAYOUT.tapes.z);
  group.rotation.y = -0.18;
  const disposables: { dispose(): void }[] = [];
  const bodyGeo = new THREE.BoxGeometry(TW, TH, TD);
  const labelGeo = new THREE.PlaneGeometry(TW * 0.86, TH * 0.72);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.45, metalness: 0.1 });
  disposables.push(bodyGeo, labelGeo, bodyMat);

  type Item = { id: string; root: THREE.Group; home: THREE.Vector3; homeQ: THREE.Quaternion; out: number; hover: boolean; busy: boolean };
  const items: Item[] = TAPES.map((t, i) => {
    // 侧标签：一张小画布
    const c = document.createElement('canvas'); c.width = 512; c.height = 72;
    const g = c.getContext('2d')!;
    g.fillStyle = t.color; g.fillRect(0, 0, 512, 72);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 54, 512, 4);
    g.fillStyle = '#2a1d12'; g.font = `bold 46px ${FONT}`; g.textBaseline = 'middle';
    g.fillText(t.label, 24, 32);
    g.font = '24px monospace'; g.fillText(`T-${String(i + 1).padStart(2, '0')}`, 420, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    disposables.push(tex, labelMat);

    const root = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = body.receiveShadow = tier === 'high';
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.z = TD / 2 + 0.001;
    root.add(body, label);
    root.position.set((i % 2) * 0.012 - 0.006, TH / 2 + i * (TH + 0.002), 0);
    root.rotation.y = (i % 3 - 1) * 0.04;
    group.add(root);
    const item: Item = { id: t.id, root, home: root.position.clone(), homeQ: root.quaternion.clone(), out: 0, hover: false, busy: false };
    pick(root, {
      hover(onn) { item.hover = onn; },
      click() { emit(bus, 'tape:insert', { id: t.id }); },
    });
    return item;
  });
  scene.add(group);

  const tweens: Tween[] = [];
  let loaded: Item | null = null;

  const flyIn = (it: Item) => {
    it.busy = true;
    const from = it.root.getWorldPosition(new THREE.Vector3());
    const fromQ = it.root.getWorldQuaternion(new THREE.Quaternion());
    scene.attach(it.root); // 脱离摞，飞到录像机
    const s = vcrSlot();
    const front = new THREE.Vector3(s.x - 0.12, s.y, s.z + 0.35);
    const inside = new THREE.Vector3(s.x - 0.12, s.y, s.z - 0.15);
    const q = new THREE.Quaternion(); // 正对录像机：标签朝外
    const mid = new THREE.Vector3().lerpVectors(from, front, 0.5).add(new THREE.Vector3(0, 0.25, 0));
    tweens.push(new Tween(0.55, (k) => {
      // 二次贝塞尔弧线
      const a = from.clone().lerp(mid, k), b = mid.clone().lerp(front, k);
      it.root.position.copy(a.lerp(b, k));
      it.root.quaternion.slerpQuaternions(fromQ, q, k);
    }, () => {
      tweens.push(new Tween(0.3, (k) => { it.root.position.lerpVectors(front, inside, k); }, () => {
        it.root.visible = false;
        emit(bus, 'tape:loaded', { id: it.id });
      }));
    }));
  };

  const flyBack = (it: Item) => {
    const s = vcrSlot();
    const inside = new THREE.Vector3(s.x - 0.12, s.y, s.z - 0.15);
    const front = new THREE.Vector3(s.x - 0.12, s.y, s.z + 0.35);
    it.root.visible = true;
    it.root.position.copy(inside);
    tweens.push(new Tween(0.25, (k) => { it.root.position.lerpVectors(inside, front, k); }, () => {
      group.attach(it.root);
      const p0 = it.root.position.clone(), q0 = it.root.quaternion.clone();
      tweens.push(new Tween(0.5, (k) => {
        it.root.position.lerpVectors(p0, it.home, k);
        it.root.position.y += Math.sin(k * Math.PI) * 0.2;
        it.root.quaternion.slerpQuaternions(q0, it.homeQ, k);
      }, () => { it.busy = false; }));
    }));
  };

  let queued: string | null = null;
  const off = [
    on<{ id: string }>(bus, 'tape:insert', ({ id }) => {
      const it = items.find((x) => x.id === id);
      if (!it || it.busy) return;
      if (loaded) { queued = id; emit(bus, 'tape:eject'); return; } // 先退出当前的
      loaded = it;
      flyIn(it);
    }),
    on<{ id: string }>(bus, 'tape:ejected', ({ id }) => {
      const it = items.find((x) => x.id === id);
      if (it) flyBack(it);
      loaded = null;
      if (queued) { const q = queued; queued = null; setTimeout(() => emit(bus, 'tape:insert', { id: q }), 450); }
    }),
  ];

  return {
    frame(dt) {
      for (let i = tweens.length - 1; i >= 0; i--) { tweens[i].update(dt); if (tweens[i].done) tweens.splice(i, 1); }
      for (const it of items) {
        if (it.busy) continue;
        it.out = damp(it.out, it.hover ? 1 : 0, 12, dt);
        it.root.position.z = it.home.z + it.out * 0.07;
      }
    },
    stop() {
      off.forEach((f) => f());
      for (const it of items) it.root.removeFromParent();
      scene.remove(group);
      disposables.forEach((d) => d.dispose());
    },
  };
};
