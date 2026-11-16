/** 磁带的音乐：全部用 WebAudio 实时合成。playTrack 返回停止函数。 */
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function impulse(ac: AudioContext, seconds: number) {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  return buf;
}
function noiseBuffer(ac: AudioContext) {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = last * 8; }
  return buf;
}

export function playTrack(ac: AudioContext, id: string): () => void {
  const master = ac.createGain();
  master.gain.value = 0;
  master.gain.setTargetAtTime(0.6, ac.currentTime, 0.5);
  master.connect(ac.destination);
  const out = ac.createGain();
  const conv = ac.createConvolver(); conv.buffer = impulse(ac, 3);
  const wet = ac.createGain(); wet.gain.value = 0.4;
  out.connect(master); out.connect(conv); conv.connect(wet); wet.connect(master);
  const loops: AudioScheduledSourceNode[] = [];

  /** 一个带包络的振荡器音符 */
  const tone = (type: OscillatorType, f: number, t: number, peak: number, attack: number, decay: number, dest: AudioNode = out, detune = 0) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + attack + decay + 0.05);
    return o;
  };
  const piano = (t: number, m: number, v: number) => { tone('triangle', mtof(m), t, v, 0.006, 2.2); tone('sine', mtof(m) * 2, t, v * 0.22, 0.004, 1.1); };

  // 磁带的底噪
  const hiss = ac.createBufferSource(); hiss.buffer = noiseBuffer(ac); hiss.loop = true;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const hg = ac.createGain(); hg.gain.value = 0.012;
  hiss.connect(hp).connect(hg).connect(master); hiss.start(); loops.push(hiss);

  let seq: (t: number, step: number) => number;
  if (id === 'tide') {
    const chords = [[38, 57, 60, 64, 65], [34, 53, 57, 62, 65], [41, 48, 57, 60, 64], [36, 55, 59, 64, 67]];
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750; lp.connect(out);
    const sea = ac.createBufferSource(); sea.buffer = noiseBuffer(ac); sea.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
    const sg = ac.createGain(); sg.gain.value = 0.02;
    sea.connect(bp).connect(sg).connect(out); sea.start(); loops.push(sea);
    seq = (t, step) => {
      for (const m of chords[step % 4]) for (const d of [-8, 7]) tone('sawtooth', mtof(m), t, 0.035, 3, 6.5, lp, d);
      sg.gain.setTargetAtTime(0.11, t, 1.6); sg.gain.setTargetAtTime(0.02, t + 4, 1.8); // 一次涨落
      for (let i = 0; i < 3; i++) tone('sine', mtof(pick([74, 77, 79, 81, 84])), t + 1 + Math.random() * 6, 0.05, 0.01, 3.5);
      return 8;
    };
  } else if (id === 'guqin') {
    const scale = [50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74]; // D 宫五声
    let idx = 5;
    seq = (t) => {
      idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, -1, 1, 1, 2, 0])));
      const f = mtof(scale[idx]);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.7);
      lp.connect(out);
      const o = tone('sawtooth', f, t, 0.2, 0.004, 3.2, lp);
      if (Math.random() < 0.4) { o.frequency.setValueAtTime(f * 0.955, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.14); } // 滑音
      tone('sine', f * 2, t, 0.03, 0.004, 1.6);
      if (Math.random() < 0.22) tone('triangle', mtof(38), t, 0.16, 0.01, 4);
      return pick([0.55, 0.8, 0.8, 1.1, 1.1, 1.7]);
    };
  } else {
    const chords = [
      { bass: 36, n: [60, 64, 67, 71, 74] }, { bass: 33, n: [57, 60, 64, 67, 72] },
      { bass: 41, n: [60, 65, 69, 72, 76] }, { bass: 43, n: [59, 62, 67, 71, 74] },
    ];
    const order = [0, 1, 2, 3, 4, 3, 2, 1];
    const eighth = 60 / 74 / 2;
    seq = (t, step) => {
      const ch = chords[Math.floor(step / 8) % 4], i = step % 8;
      if (i === 0) tone('sine', mtof(ch.bass), t, 0.22, 0.02, 3.4);
      piano(t, ch.n[order[i]], i % 4 === 0 ? 0.17 : 0.11 + Math.random() * 0.03);
      if (i === 6 && Math.random() < 0.6) piano(t, pick(ch.n) + 12, 0.1);
      return eighth;
    };
  }

  let next = ac.currentTime + 0.15, step = 0;
  const tick = () => { while (next < ac.currentTime + 0.5) next += seq(next, step++); };
  tick();
  const iv = setInterval(tick, 120);
  return () => {
    clearInterval(iv);
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.12);
    setTimeout(() => { loops.forEach((s) => { try { s.stop(); } catch { /* 已停 */ } }); master.disconnect(); }, 1200);
  };
}
