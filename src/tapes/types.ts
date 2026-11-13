import type { SiteData } from '../scene/types';

/** 磁带 = 一个在 CRT 屏幕上运行的独立小程序。一盘一个文件。 */
export interface TapeContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  audio: () => AudioContext | null;
  data: SiteData;
  navigate(url: string): void;
}

export type TapeInput =
  | { type: 'pointer'; x: number; y: number; down: boolean } // 画布像素坐标
  | { type: 'click'; x: number; y: number }
  | { type: 'key'; key: string };

export interface TapeInstance {
  frame(dt: number, t: number): void;
  input?(e: TapeInput): void;
  stop(): void;
}

export interface Tape {
  id: string;
  label: string;
  color: string; // 磁带标签底色
  mount(c: TapeContext): TapeInstance;
}

export const PHOSPHOR = '#ffb347';
export const PHOSPHOR_DIM = '#a8691f';
export const SCREEN_BG = '#0d0703';
export const FONT = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
export const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
