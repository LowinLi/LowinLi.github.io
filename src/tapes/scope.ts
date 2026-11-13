import { MONO, PHOSPHOR, PHOSPHOR_DIM, SCREEN_BG, type Tape } from './types';

/** 示波器：指针位置控制李萨如图形的频率比；按住时发声 */
export const scope: Tape = {
  id: 'scope',
  label: '示波器',
  color: '#c9c3e6',
  mount({ ctx, width, height, audio }) {
    let a = 3, b = 2, ta = 3, tb = 2, phase = 0;
    let osc: [OscillatorNode, OscillatorNode, GainNode] | null = null;
    const startTone = () => {
      const ac = audio();
      if (!ac || osc) return;
      const g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination);
      const o1 = ac.createOscillator(), o2 = ac.createOscillator();
      o1.type = o2.type = 'sine';
      const merger = ac.createChannelMerger(2);
      o1.connect(merger, 0, 0); o2.connect(merger, 0, 1); merger.connect(g);
      o1.start(); o2.start();
      g.gain.setTargetAtTime(0.06, ac.currentTime, 0.05);
      osc = [o1, o2, g];
    };
    const stopTone = () => {
      if (!osc) return;
      const [o1, o2, g] = osc; osc = null;
      const ac = g.context;
      g.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      setTimeout(() => { o1.stop(); o2.stop(); g.disconnect(); }, 300);
    };
    return {
      frame(dt) {
        a += (ta - a) * Math.min(1, dt * 3);
        b += (tb - b) * Math.min(1, dt * 3);
        phase += dt * 0.6;
        if (osc) { osc[0].frequency.value = 110 * a; osc[1].frequency.value = 110 * b; }
        // 半透明覆盖做出余辉拖尾
        ctx.fillStyle = 'rgba(13,7,3,0.25)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = PHOSPHOR_DIM; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
        for (let x = 0; x <= width; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 0; y <= height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = PHOSPHOR; ctx.lineWidth = 2.5; ctx.shadowColor = PHOSPHOR; ctx.shadowBlur = 12;
        ctx.beginPath();
        const cx = width / 2, cy = height / 2 - 10, r = Math.min(width, height) * 0.38;
        for (let i = 0; i <= 600; i++) {
          const s = (i / 600) * Math.PI * 2;
          const x = cx + Math.sin(a * s + phase) * r, y = cy + Math.sin(b * s) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = SCREEN_BG; ctx.fillRect(0, height - 36, width, 36);
        ctx.fillStyle = PHOSPHOR_DIM; ctx.font = `16px ${MONO}`;
        ctx.fillText(`X ${a.toFixed(2)}  Y ${b.toFixed(2)}   移动改变频率 · 按住发声`, 16, height - 14);
      },
      input(e) {
        if (e.type === 'pointer') {
          ta = 1 + Math.round((e.x / width) * 6 * 2) / 2;
          tb = 1 + Math.round((e.y / height) * 5 * 2) / 2;
          if (e.down) startTone(); else stopTone();
        }
      },
      stop() { stopTone(); },
    };
  },
};
