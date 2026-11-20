/** 掌机游戏共用的小工具：逻辑尺寸、存档、合成音效、画字和圆角框、结算牌、游戏接口 */
export type Key = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'home';

export const W = 640, H = 360;
export const FONT = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
export const store = {
  get(k: string) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k: string, v: number) { try { localStorage.setItem(k, String(v)); } catch { /* 隐私模式 */ } },
};

// ---------------- 音效：WebAudio 现合成的短音 ----------------
let actx: AudioContext | null = null;
export const ctxA = () => { try { actx ??= new AudioContext(); if (actx.state === 'suspended') void actx.resume(); } catch { actx = null; } return actx; };
export function beep(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06) {
  const a = actx; if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
}
export function boom() {
  const a = actx; if (!a) return;
  const n = a.createBufferSource(), b = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = a.createGain(); g.gain.value = 0.25;
  n.buffer = b; n.connect(f).connect(g).connect(a.destination); n.start(); n.onended = () => { n.disconnect(); f.disconnect(); g.disconnect(); };
}

// ---------------- 小工具 ----------------
export const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};
export const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', weight = 600, outline?: string) => {
  g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  if (outline) { g.lineJoin = 'round'; g.lineWidth = size * 0.28; g.strokeStyle = outline; g.strokeText(s, x, y); }
  g.fillStyle = color; g.fillText(s, x, y);
};
/** 半透明的结算牌 */
export const panel = (g: CanvasRenderingContext2D, lines: [string, number, string?][], t: number) => {
  g.fillStyle = 'rgba(10,14,24,.55)'; g.fillRect(0, 0, W, H);
  const h = 40 + lines.length * 34;
  rr(g, W / 2 - 170, H / 2 - h / 2, 340, h, 18); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
  lines.forEach(([s, size, c], i) => text(g, s, W / 2, H / 2 - h / 2 + 38 + i * 34, size, c ?? '#1d2433'));
  g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
  text(g, '按 A 或点一下屏幕 再来一局', W / 2, H / 2 + h / 2 + 22, 15, '#fff', 'center', 500);
  g.globalAlpha = 1;
};

export interface Game { update(dt: number): void; draw(g: CanvasRenderingContext2D, t: number): void; key(k: Key): void; tap(x: number, y: number): void; swipe?(dx: number, dy: number): void; /** 指针在屏幕上移动（按住拖动、或鼠标悬停）：挡板、篮子这类跟手的游戏用 */ point?(x: number, y: number): void }

