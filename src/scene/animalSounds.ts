/**
 * 窗外动物的叫声（用户要的：看窗外时鸡叫、狗经过偶尔叫、猫也是）。和站里别的声音一样，全是 WebAudio 现合成的，没有音频文件。
 * 每个函数在 t0 时刻往 dest 上排一声，自己建的节点在声音结束后自动断开。
 *
 * 合成思路：声带用锯齿波（狗叫掺一点噪声），音高按时间折线变化；口腔用一两个带通滤波器当共振峰，
 * 共振峰的频率也跟着动（「喵」就是共振峰从低到高再落下来）。
 */
let noiseBuf: AudioBuffer | null = null;
const noise = (ctx: AudioContext) => {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  return s;
};
type Pts = [number, number][];
/** 参数按折线变化：pts 是 [相对时间, 值] */
const curve = (p: AudioParam, t0: number, pts: Pts) => {
  p.setValueAtTime(pts[0][1], t0 + pts[0][0]);
  for (const [t, v] of pts.slice(1)) p.linearRampToValueAtTime(v, t0 + t);
};
const bp = (ctx: AudioContext, f: number, q: number) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
const done = (nodes: AudioNode[], src: AudioScheduledSourceNode) => { src.onended = () => nodes.forEach((n) => n.disconnect()); };

/** 一个音节：锯齿波 + 可选噪声，过共振峰，按包络出声 */
function syllable(ctx: AudioContext, dest: AudioNode, t0: number, o: { f0: Pts; dur: number; formants: [number, number, number][]; fMove?: Pts; noise?: number; attack?: number; vib?: [number, number]; gain?: number; drive?: boolean }) {
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  curve(osc.frequency, t0, o.f0);
  const nodes: AudioNode[] = [osc];
  let vib: OscillatorNode | null = null;
  if (o.vib) { vib = ctx.createOscillator(); vib.frequency.value = o.vib[0]; const vg = ctx.createGain(); vg.gain.value = o.vib[1]; vib.connect(vg).connect(osc.frequency); nodes.push(vib, vg); }
  const src = ctx.createGain(); osc.connect(src); nodes.push(src);
  let nz: AudioBufferSourceNode | null = null;
  if (o.noise) { nz = noise(ctx); const ng = ctx.createGain(); ng.gain.value = o.noise; nz.connect(ng).connect(src); nodes.push(nz, ng); }
  let head: AudioNode = src;
  if (o.drive) { // 公鸡嗓子是破的：过一道软削波
    const ws = ctx.createWaveShaper(); const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 3); }
    ws.curve = c; head.connect(ws); head = ws; nodes.push(ws);
  }
  const env = ctx.createGain(); env.gain.value = 0; nodes.push(env);
  for (const [f, q, g] of o.formants) {
    const b = bp(ctx, f, q); const fg = ctx.createGain(); fg.gain.value = g;
    if (o.fMove) curve(b.frequency, t0, o.fMove.map(([t, k]) => [t, f * k]));
    head.connect(b).connect(fg).connect(env); nodes.push(b, fg);
  }
  env.connect(dest);
  const a = o.attack ?? 0.01, peak = o.gain ?? 1;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + a);
  env.gain.setValueAtTime(peak, t0 + Math.max(a, o.dur * 0.6));
  env.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
  const end = t0 + o.dur + 0.05;
  osc.start(t0); osc.stop(end); vib?.start(t0); vib?.stop(end); nz?.start(t0); nz?.stop(end);
  done(nodes, osc);
}

/** 狗叫：一到三声「汪」——音高先冲上去再往下掉，掺一点气声 */
export function bark(ctx: AudioContext, dest: AudioNode, t0: number, n = 1 + Math.floor(Math.random() * 3)) {
  const base = 300 + Math.random() * 80;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.26 + Math.random() * 0.08), d = 0.17 + Math.random() * 0.04;
    syllable(ctx, dest, t, { dur: d, f0: [[0, base * 0.8], [0.02, base * 1.55], [d * 0.7, base * 0.95], [d, base * 0.7]], formants: [[650, 3, 1.2], [1500, 4, 0.7], [2700, 5, 0.25]], fMove: [[0, 0.7], [0.03, 1], [d, 0.8]], noise: 0.35, attack: 0.012, gain: 0.9 });
  }
}

/** 猫叫：「喵——」音高先升后落，共振峰从「m」张到「ia」再收成「o」，带一点颤音 */
export function meow(ctx: AudioContext, dest: AudioNode, t0: number) {
  const d = 0.55 + Math.random() * 0.35, f = 520 + Math.random() * 120;
  syllable(ctx, dest, t0, { dur: d, f0: [[0, f * 0.85], [d * 0.25, f * 1.45], [d * 0.6, f * 1.3], [d, f * 0.9]], formants: [[900, 4, 1], [2600, 6, 0.45], [4200, 8, 0.15]], fMove: [[0, 0.6], [d * 0.3, 1.25], [d * 0.6, 1.1], [d, 0.65]], attack: 0.07, vib: [6, 12], gain: 0.7 });
}

/** 母鸡：几声短促的「咯咯」，有时最后拖一声高的「咯——哒」 */
export function cluck(ctx: AudioContext, dest: AudioNode, t0: number) {
  const n = 2 + Math.floor(Math.random() * 4), f = 380 + Math.random() * 90;
  let t = t0;
  for (let i = 0; i < n; i++) {
    syllable(ctx, dest, t, { dur: 0.07, f0: [[0, f * 1.2], [0.07, f * 0.8]], formants: [[1100, 3, 1], [2400, 5, 0.4]], attack: 0.006, gain: 0.8 });
    t += 0.13 + Math.random() * 0.09;
  }
  if (Math.random() < 0.4) syllable(ctx, dest, t + 0.05, { dur: 0.32, f0: [[0, f * 1.6], [0.08, f * 2.3], [0.32, f * 1.7]], formants: [[1300, 3, 1], [2800, 5, 0.5]], attack: 0.02, vib: [9, 20], gain: 0.8 });
}

/** 公鸡打鸣：「喔—喔—喔——」五个音节，最后一声拖长往下滑；嗓子是破的（削波），离得远（整体压低、闷一点） */
export function crow(ctx: AudioContext, dest: AudioNode, t0: number) {
  const f = 560 + Math.random() * 60;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(dest);
  const parts: [number, number, number, number][] = [ // 起始时间、时长、起音高倍数、终音高倍数
    [0, 0.13, 1.0, 1.1], [0.17, 0.1, 1.1, 1.15], [0.32, 0.2, 1.15, 1.3], [0.58, 0.13, 1.25, 1.3], [0.78, 0.85, 1.35, 0.95],
  ];
  for (const [s, d, a, b] of parts) {
    syllable(ctx, lp, t0 + s, { dur: d, f0: [[0, f * a], [d * 0.3, f * (a + b) / 2 * 1.04], [d, f * b]], formants: [[1200, 2, 1], [2500, 3, 0.6]], attack: 0.025, vib: [7, 14], drive: true, gain: 0.45 });
  }
  setTimeout(() => lp.disconnect(), (t0 - ctx.currentTime + 2) * 1000);
}

/** 牛叫：「哞——」低沉的长音，音高先起来一点再慢慢往下沉，嘴从闭着的「m」张成「oo」（共振峰低、窄） */
export function moo(ctx: AudioContext, dest: AudioNode, t0: number) {
  const d = 1.1 + Math.random() * 0.5, f = 105 + Math.random() * 25;
  syllable(ctx, dest, t0, { dur: d, f0: [[0, f * 0.9], [0.25, f * 1.35], [d * 0.6, f * 1.25], [d, f * 0.85]], formants: [[320, 4, 1.3], [720, 6, 0.7], [2400, 8, 0.12]], fMove: [[0, 0.7], [0.3, 1.1], [d, 0.85]], noise: 0.08, attack: 0.12, vib: [4.5, 3], gain: 1.1 });
}

/** 羊叫：「咩——」中高音、一抖一抖的（颤音又快又深），共振峰是「e」 */
export function baa(ctx: AudioContext, dest: AudioNode, t0: number) {
  const d = 0.7 + Math.random() * 0.3, f = 330 + Math.random() * 90;
  syllable(ctx, dest, t0, { dur: d, f0: [[0, f * 0.9], [0.08, f * 1.08], [d * 0.7, f * 1.02], [d, f * 0.86]], formants: [[620, 4, 1], [1850, 6, 0.55], [2700, 8, 0.2]], fMove: [[0, 0.75], [0.1, 1], [d, 0.95]], noise: 0.12, attack: 0.04, vib: [8.5, f * 0.09], gain: 0.85 });
}

/** 猪：两三声短促的「哼哼」——低音、鼻音重（噪声多、共振峰低），每声往下掉 */
export function oink(ctx: AudioContext, dest: AudioNode, t0: number, n = 2 + Math.floor(Math.random() * 2)) {
  const f = 150 + Math.random() * 50;
  let t = t0;
  for (let i = 0; i < n; i++) {
    const d = 0.13 + Math.random() * 0.06;
    syllable(ctx, dest, t, { dur: d, f0: [[0, f * 1.25], [d, f * 0.8]], formants: [[420, 3, 1.2], [1100, 4, 0.6], [2500, 6, 0.15]], noise: 0.55, attack: 0.008, gain: 1.0, drive: true });
    t += d + 0.06 + Math.random() * 0.08;
  }
}

/** 猪被抓时的尖叫：高、破、往上挑再落下来，连着两声 */
export function squeal(ctx: AudioContext, dest: AudioNode, t0: number) {
  for (let i = 0; i < 2; i++) {
    const d = 0.45 + Math.random() * 0.15, f = 900 + Math.random() * 200, t = t0 + i * 0.55;
    syllable(ctx, dest, t, { dur: d, f0: [[0, f * 0.8], [0.08, f * 1.3], [d, f * 0.95]], formants: [[1400, 3, 1], [3000, 5, 0.5]], noise: 0.25, attack: 0.02, vib: [12, 30], drive: true, gain: 0.6 });
  }
}
