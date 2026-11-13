import type * as THREE from 'three';
import type { Tier } from './tier';

/** 每个可交互物件一个文件，统一实现这个接口。见 CLAUDE.md「组件接口」。 */
export interface MountContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  tier: Exclude<Tier, 'low'>; // low 档不会初始化 WebGL
  width: number;
  height: number;
  audio: AudioContext | null; // 用户首次交互后才创建，之前为 null
}

export type SceneInput =
  | { type: 'pointer'; x: number; y: number } // 归一化到 [-1, 1]
  | { type: 'scroll'; progress: number } // 0..1
  | { type: 'resize'; width: number; height: number };

export interface Mounted {
  frame(dt: number, elapsed: number): void;
  input?(e: SceneInput): void;
  stop(): void; // 必须释放 geometry/material/texture 并移出 scene
}

export type SceneObject = (ctx: MountContext) => Mounted;
