/**
 * 收音机：一路合成的沙沙声（WebAudio）+ 一个 <audio> 放真实电台的直播流。
 * 调到离某个台 ±0.1 MHz 以内是清楚的；再远一点电台声变小、沙沙声变大；离开 0.3 MHz 就只剩沙沙声。
 * 电台声不走 WebAudio（中央台的流不允许跨域，接进 WebAudio 会没声音），音量直接调 <audio>.volume；
 * iOS 上 volume 是只读的，那里只能做到「对准了有声、没对准静音」。
 */
import { STATIONS, type Station } from '../stations';

export type RadioStatus = 'static' | 'loading' | 'playing' | 'nosignal';
export interface RadioState { mhz: number; station: Station | null; status: RadioStatus }

const CLEAR = 0.1, EDGE = 0.3;

function staticBuffer(ac: AudioContext) {
  const n = ac.sampleRate * 3, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.6;
    if (Math.random() < 0.0006) for (let k = 0; k < 40 && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * (1 - k / 40); // 偶尔噼啪一下
  }
  return buf;
}

export function nearest(mhz: number) {
  let best: Station | null = null, dist = Infinity;
  for (const s of STATIONS) { const d = Math.abs(s.mhz - mhz); if (d < dist) { dist = d; best = s; } }
  return { station: best, dist };
}

export function createRadio(ac: AudioContext, onState: (s: RadioState) => void) {
  // 沙沙声：白噪声 → 带通 → 音量，随失谐程度变化
  const src = ac.createBufferSource(); src.buffer = staticBuffer(ac); src.loop = true;
  const band = ac.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 0.5;
  const hiss = ac.createGain(); hiss.gain.value = 0;
  src.connect(band).connect(hiss).connect(ac.destination);
  src.start();

  const el = new Audio();
  el.preload = 'none';
  (el as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
  let hls: { destroy(): void } | null = null;
  let tuned: Station | null = null, tryIdx = 0, mhz = 100.6, status: RadioStatus = 'static', dead = false;
  let leaveTimer = 0, slowTimer = 0;

  const emitState = () => onState({ mhz, station: tuned && nearest(mhz).dist < EDGE ? tuned : null, status });
  const setStatus = (s: RadioStatus) => { if (s !== status) { status = s; emitState(); } };

  const unload = () => {
    hls?.destroy(); hls = null;
    el.pause(); el.removeAttribute('src'); el.load();
  };

  const loadSrc = async (st: Station) => {
    unload();
    const url = st.src[tryIdx];
    if (!url) { setStatus('nosignal'); mix(); return; }
    setStatus('loading'); mix();
    clearTimeout(slowTimer);
    slowTimer = window.setTimeout(() => { if (tuned === st && status === 'loading' && st.src[tryIdx] === url && st.src[tryIdx + 1]) next(st); }, 8000);
    const isHls = url.endsWith('.m3u8');
    if (!isHls || el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = url;
    } else {
      const { default: Hls } = await import('hls.js/light');
      if (dead || tuned !== st) return;
      if (!Hls.isSupported()) { next(st); return; }
      const h = new Hls({ lowLatencyMode: false, liveSyncDurationCount: 4, maxBufferLength: 20 });
      h.on(Hls.Events.ERROR, (_e: unknown, data: { fatal: boolean }) => { if (data.fatal && tuned === st) next(st); });
      h.loadSource(url); h.attachMedia(el);
      hls = h;
    }
    el.play().catch(() => { /* 出错由 error 事件 / hls.js 处理 */ });
  };
  const next = (st: Station) => { if (tuned !== st) return; tryIdx++; void loadSrc(st); };

  // 只有第一次出声前算「正在连接」；之后网络卡一下的缓冲不来回切状态，免得面板和音量闪
  el.addEventListener('playing', () => { clearTimeout(slowTimer); if (tuned) setStatus('playing'); mix(); });
  el.addEventListener('error', () => { if (tuned && el.getAttribute('src')) next(tuned); });

  /** 按失谐程度混合沙沙声和电台声 */
  const mix = () => {
    const { dist } = nearest(mhz);
    const k = tuned && status === 'playing' ? Math.min(1, Math.max(0, (EDGE - dist) / (EDGE - CLEAR))) : 0;
    try { el.volume = k * 0.9; } catch { /* iOS */ }
    el.muted = k < 0.05;
    const h = status === 'loading' && dist < CLEAR ? 0.05 : 0.11 * (1 - k) + 0.012;
    hiss.gain.setTargetAtTime(dead ? 0 : h, ac.currentTime, 0.05);
  };

  const tune = (f: number) => {
    mhz = Math.round(f * 10) / 10;
    const { station, dist } = nearest(mhz);
    if (station && dist < EDGE) {
      clearTimeout(leaveTimer);
      if (station !== tuned) { tuned = station; tryIdx = 0; void loadSrc(station); }
    } else if (tuned) {
      // 离开一会儿再断流，来回拧旋钮时不必每次都重新连
      clearTimeout(leaveTimer);
      const was = tuned;
      leaveTimer = window.setTimeout(() => { if (tuned === was && nearest(mhz).dist >= EDGE) { tuned = null; unload(); setStatus('static'); } }, 1500);
    }
    if (!(station && dist < EDGE) && status !== 'static' && !tuned) setStatus('static');
    mix(); emitState();
  };

  return {
    tune,
    get mhz() { return mhz; },
    stop() {
      dead = true; clearTimeout(leaveTimer); clearTimeout(slowTimer);
      hiss.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      setTimeout(() => { try { src.stop(); } catch { /* 已停 */ } src.disconnect(); hiss.disconnect(); }, 200);
      unload();
    },
  };
}
