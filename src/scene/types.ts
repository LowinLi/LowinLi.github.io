import type * as THREE from 'three';
import type { Tier } from './tier';
import type { Book } from '../books';
import type { Track } from '../tracks';

export interface SiteData {
  name: string;
  tagline: string;
  bio: string[];
  posts: { title: string; url: string; date: string }[];
  postsIndex: string;
  links: { label: string; url: string }[];
  books: Book[];
  tracks: Track[];
}

export interface PickHandlers {
  click?(hit: THREE.Intersection): void;
  move?(hit: THREE.Intersection): void;
  hover?(on: boolean): void;
}

/** 每个可交互物件一个文件，统一实现这个接口。见 CLAUDE.md「组件接口」。 */
export interface MountContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  tier: Exclude<Tier, 'low'>; // low 档不会初始化 WebGL
  width: number;
  height: number;
  /** 只能在用户手势（点击）的回调里调用，首次调用时创建 AudioContext */
  audio: () => AudioContext;
  data: SiteData;
  /** 物件之间只通过 bus 通信，不互相 import。事件名见 CLAUDE.md。 */
  bus: EventTarget;
  /** 注册可点击 / 可悬停的网格，runtime 统一做射线检测 */
  pick(obj: THREE.Object3D, handlers: PickHandlers): void;
}

export type SceneInput =
  | { type: 'pointer'; x: number; y: number } // 归一化到 [-1, 1]
  | { type: 'drag'; dx: number; dy: number } // 按住拖动，相对画布宽 / 高的比例
  | { type: 'zoom'; k: number } // 缩放倍数：1 是默认距离，小于 1 拉近，大于 1 拉远
  | { type: 'resize'; width: number; height: number };

export interface Mounted {
  frame(dt: number, elapsed: number): void;
  input?(e: SceneInput): void;
  stop(): void; // 必须释放 geometry/material/texture 并移出 scene
}

export type SceneObject = (ctx: MountContext) => Mounted;

export const emit = (bus: EventTarget, type: string, detail?: unknown) =>
  bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = <T = unknown>(bus: EventTarget, type: string, fn: (d: T) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<T>).detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
};

/** 物件内部的资源回收小工具 */
export class Bin {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T { this.items.push(x); return x; }
  dispose() { this.items.forEach((x) => x.dispose()); this.items = []; }
}
