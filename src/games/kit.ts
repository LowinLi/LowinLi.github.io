/** 掌机游戏共用的小工具：逻辑尺寸、存档、合成音效、画字和圆角框、结算牌、游戏接口 */
export type Key = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'home';

export const W = 640, H = 360;
export const FONT = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
export const store = {
  get(k: string) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k: string, v: number) { try { localStorage.setItem(k, String(v)); } catch { /* 隐私模式 */ } },
};

// ---------------- 音效：WebAudio 现合成的短音 ----------------
/** 主页「声音」按钮的静音开关（记在 localStorage） */
export const audioPrefs = { muted: store.get('game.muted') === 1, toggle() { this.muted = !this.muted; store.set('game.muted', this.muted ? 1 : 0); if (this.muted) music.stop(); } };
let actx: AudioContext | null = null;
export const ctxA = () => { try { actx ??= new AudioContext(); if (actx.state === 'suspended') void actx.resume(); } catch { actx = null; } return actx; };
export function beep(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06) {
  const a = actx; if (!a || audioPrefs.muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
}
export function boom() {
  const a = actx; if (!a || audioPrefs.muted) return;
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
/** 结算牌：压暗背景 + 白卡片（顶上一条彩色饰条），破纪录时右上角斜贴一条「新纪录」 */
export const panel = (g: CanvasRenderingContext2D, lines: [string, number, string?][], t: number, rec = false) => {
  g.fillStyle = 'rgba(10,14,24,.55)'; g.fillRect(0, 0, W, H);
  const h = 48 + lines.length * 36, x = W / 2 - 170, y = H / 2 - h / 2 - 8, accent = lines[1]?.[2] ?? lines[0]?.[2] ?? '#3b6fd8';
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  rr(g, x, y, 340, h, 20); g.fillStyle = '#fff'; g.fill(); g.restore();
  g.save(); rr(g, x, y, 340, h, 20); g.clip(); g.fillStyle = accent; g.fillRect(x, y, 340, 7); g.restore();
  lines.forEach(([s, size, c], i) => text(g, s, W / 2, y + 42 + i * 36, size, c ?? '#1d2433', 'center', i === 1 ? 800 : 700));
  if (rec) {
    g.save(); g.translate(x + 300, y + 16); g.rotate(0.5); const pulse = 1 + 0.06 * Math.sin(t * 8); g.scale(pulse, pulse);
    rr(g, -44, -12, 88, 24, 12); g.fillStyle = '#ff4d6a'; g.fill(); text(g, '新纪录！', 0, 1, 13, '#fff', 'center', 800); g.restore();
  }
  g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
  keyChip(g, W / 2, y + h + 26, 'A', '或点一下屏幕 · 再来一局');
  g.globalAlpha = 1;
};
/** 一个「按键」小标签 + 说明：A ⟶ 圆形键帽 */
export const keyChip = (g: CanvasRenderingContext2D, cx: number, cy: number, key: string, label: string) => {
  g.font = `600 14px ${FONT}`; const lw = g.measureText(label).width, w = 26 + 8 + lw, x0 = cx - w / 2;
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(x0 + 13, cy, 13, 0, 7); g.fill();
  text(g, key, x0 + 13, cy + 1, 14, '#1d2433', 'center', 800);
  text(g, label, x0 + 34, cy + 1, 14, '#fff', 'left', 600, 'rgba(0,0,0,.35)');
};
/** 半透明圆角的成绩小牌（左上 / 右上） */
export const hudPill = (g: CanvasRenderingContext2D, s: string, x: number, y: number, align: 'left' | 'right', fg = '#fff') => {
  g.font = `700 15px ${FONT}`; const w = g.measureText(s).width + 24, x0 = align === 'left' ? x : x - w;
  rr(g, x0, y - 14, w, 28, 14); g.fillStyle = 'rgba(12,16,28,.42)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
  text(g, s, x0 + w / 2, y + 1, 15, fg, 'center', 700);
};
/** 四周压暗一圈，画面更「聚」 */
export const vignette = (g: CanvasRenderingContext2D, k = 0.28) => {
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${k})`); g.fillStyle = v; g.fillRect(0, 0, W, H);
};

// ---------------- 粒子：打中、得分、破纪录时的小碎片和彩纸 ----------------
type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; c: string; g: number; rot: number; vr: number; sq: boolean };
export class Fx {
  parts: Part[] = [];
  shake = 0;
  burst(x: number, y: number, c: string | string[], n = 12, speed = 160, size = 4, grav = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8), col = Array.isArray(c) ? c[(Math.random() * c.length) | 0] : c;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.3, life: 0, max: 0.45 + Math.random() * 0.4, size: size * (0.6 + Math.random() * 0.8), c: col, g: grav, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, sq: false });
    }
  }
  /** 破纪录：从顶上撒一把彩纸 */
  confetti() {
    const cs = ['#ff4d6a', '#ffd23f', '#3ddc84', '#2fd5ff', '#a77bff'];
    for (let i = 0; i < 70; i++) this.parts.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 90, life: 0, max: 2.2 + Math.random(), size: 4 + Math.random() * 4, c: cs[i % cs.length], g: 40, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, sq: true });
  }
  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.parts) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    this.parts = this.parts.filter((p) => p.life < p.max);
  }
  draw(g: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      g.globalAlpha = Math.max(0, 1 - p.life / p.max); g.fillStyle = p.c;
      if (p.sq) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore(); }
      else { g.beginPath(); g.arc(p.x, p.y, p.size * (1 - p.life / p.max * 0.5), 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  /** 画之前调用：按 shake 抖一下（返回后记得 g.restore()） */
  begin(g: CanvasRenderingContext2D, t: number) { g.save(); if (this.shake > 0) g.translate(Math.sin(t * 93) * this.shake * 14, Math.cos(t * 71) * this.shake * 8); }
}

// ---------------- 音效库：比单个 beep 更像回事的几种声音 ----------------
const noiseBuf = (a: AudioContext, dur: number) => { const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
function nz(dur: number, f: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', at = 0, f2?: number) {
  const a = actx; if (!a || audioPrefs.muted) return;
  const t = a.currentTime + at, n = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  n.buffer = noiseBuf(a, dur); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  n.connect(fl).connect(g).connect(a.destination); n.start(t); n.onended = () => { n.disconnect(); fl.disconnect(); g.disconnect(); };
}
function note(f: number, dur: number, at = 0, type: OscillatorType = 'square', vol = 0.05, f2 = f) {
  const a = actx; if (!a || audioPrefs.muted) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
}
export const sfx = {
  /** 得分：叮叮两声往上 */
  coin() { note(988, 0.07, 0, 'square', 0.045); note(1319, 0.16, 0.06, 'square', 0.045); },
  /** 大分：三连音 */
  bonus() { [1047, 1319, 1568, 2093].forEach((f, i) => note(f, 0.1, i * 0.05, 'square', 0.04)); },
  /** 啵：气泡、翻牌 */
  pop() { note(520, 0.09, 0, 'sine', 0.09, 1100); nz(0.03, 3000, 1, 0.05); },
  /** 咚：撞上、落地 */
  thud() { note(140, 0.18, 0, 'sine', 0.14, 60); nz(0.08, 400, 0.8, 0.12, 'lowpass'); },
  /** 碎：砖块、地鼠 */
  smash() { nz(0.18, 1800, 0.7, 0.16, 'bandpass', 0, 600); note(330, 0.08, 0, 'square', 0.03, 180); },
  /** 呼：挥、跳、颠 */
  whoosh() { nz(0.22, 600, 1.2, 0.08, 'bandpass', 0, 2400); },
  /** 跳 */
  jump() { note(330, 0.14, 0, 'square', 0.04, 660); },
  /** 拍：球拍、挡板 */
  paddle() { note(440, 0.05, 0, 'square', 0.05); nz(0.03, 2500, 1, 0.04); },
  /** 菜单移动 / 选中 */
  tick() { note(1200, 0.025, 0, 'square', 0.025); },
  start() { [523, 659, 784].forEach((f, i) => note(f, 0.09, i * 0.06, 'square', 0.04)); },
  /** 赢了 / 破纪录 */
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, i === 5 ? 0.35 : 0.11, i * 0.09, 'square', 0.045)); note(262, 0.6, 0.45, 'triangle', 0.06); },
  /** 输了 */
  lose() { [392, 330, 262, 196].forEach((f, i) => note(f, i === 3 ? 0.4 : 0.14, i * 0.13, 'triangle', 0.07)); },
  /** 错：点错、抢跑 */
  wrong() { note(180, 0.25, 0, 'sawtooth', 0.05, 110); note(185, 0.25, 0, 'sawtooth', 0.04, 112); },
};

// ---------------- 背景音乐：两声部的小芯片曲子（旋律方波 + 低音三角波），只在玩的时候放 ----------------
type Tune = { bpm: number; mel: number[]; bass: number[] };
export const TUNES: Record<string, Tune> = {
  bright: { bpm: 132, mel: [72, 0, 76, 79, 76, 0, 74, 72, 74, 0, 76, 74, 72, 0, 67, 0, 69, 0, 72, 76, 74, 0, 72, 69, 67, 0, 69, 72, 72, 0, 0, 0], bass: [48, 0, 55, 0, 48, 0, 55, 0, 45, 0, 52, 0, 43, 0, 50, 0, 41, 0, 48, 0, 43, 0, 50, 0, 48, 0, 55, 0, 48, 0, 43, 0] },
  chill: { bpm: 96, mel: [69, 72, 76, 0, 74, 72, 69, 0, 67, 69, 72, 0, 69, 0, 0, 0, 72, 74, 76, 0, 79, 76, 74, 0, 72, 74, 69, 0, 72, 0, 0, 0], bass: [45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0, 45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0, 45, 0, 40, 0, 45, 0, 0, 0] },
  drive: { bpm: 150, mel: [76, 76, 0, 79, 0, 76, 74, 0, 72, 72, 0, 74, 0, 76, 0, 0, 79, 79, 0, 81, 0, 79, 76, 0, 74, 74, 0, 76, 0, 72, 0, 0], bass: [40, 40, 52, 40, 40, 52, 43, 43, 45, 45, 57, 45, 47, 47, 59, 47, 40, 40, 52, 40, 40, 52, 43, 43, 45, 45, 57, 45, 38, 38, 50, 38] },
  think: { bpm: 84, mel: [64, 0, 67, 0, 71, 0, 69, 0, 67, 0, 64, 0, 62, 0, 0, 0, 64, 0, 67, 0, 72, 0, 71, 0, 69, 0, 67, 0, 64, 0, 0, 0], bass: [40, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 38, 0, 0, 0, 40, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 40, 0, 0, 0] },
};
const mf = (m: number) => 440 * 2 ** ((m - 69) / 12);
let mus: { name: string; step: number; next: number; timer: number } | null = null;
export const music = {
  /** 放某首（同一首在放就不动）；null 停 */
  play(name: string | null) {
    if (!name || audioPrefs.muted) { music.stop(); return; }
    if (mus?.name === name) return;
    music.stop();
    const a = actx; if (!a) return;
    const tune = TUNES[name]; if (!tune) return;
    const st = { name, step: 0, next: a.currentTime + 0.12, timer: 0 };
    const stepDur = 60 / tune.bpm / 2;
    st.timer = window.setInterval(() => {
      const ac = actx; if (!ac) return;
      while (st.next < ac.currentTime + 0.2) {
        const i = st.step % tune.mel.length, m = tune.mel[i], b = tune.bass[i];
        const at = st.next - ac.currentTime;
        if (m) note(mf(m), stepDur * 0.9, at, 'square', 0.018);
        if (b) note(mf(b), stepDur * 0.95, at, 'triangle', 0.045);
        if (i % 4 === 0) nz(0.03, 6000, 1, 0.012, 'highpass', at); // 轻轻的踩镲
        st.step++; st.next += stepDur;
      }
    }, 40);
    mus = st;
  },
  stop() { if (mus) { clearInterval(mus.timer); mus = null; } },
};
export interface Game { update(dt: number): void; draw(g: CanvasRenderingContext2D, t: number): void; key(k: Key): void; tap(x: number, y: number): void; swipe?(dx: number, dy: number): void; /** 现在是开局说明 / 正在玩 / 结束：主机按这个开关背景音乐 */ state?(): 'ready' | 'play' | 'over'; /** 指针在屏幕上移动（按住拖动、或鼠标悬停）：挡板、篮子这类跟手的游戏用 */ point?(x: number, y: number): void }

