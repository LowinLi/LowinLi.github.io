import { FONT, MONO, PHOSPHOR, PHOSPHOR_DIM, SCREEN_BG, type Tape } from './types';

/** 关于我：打字机逐字输出 */
export const about: Tape = {
  id: 'about',
  label: '关于我',
  color: '#e8d5b0',
  mount({ ctx, width, height, data }) {
    const lines = [`> ${data.name}`, data.tagline, '', ...data.bio, '', ...data.links.map((l) => `· ${l.label}  ${l.url}`)];
    const total = lines.reduce((n, l) => n + l.length + 1, 0);
    let shown = 0;
    return {
      frame(dt, t) {
        shown = Math.min(total, shown + dt * 28);
        ctx.fillStyle = SCREEN_BG;
        ctx.fillRect(0, 0, width, height);
        let budget = Math.floor(shown);
        let y = 70;
        let cursor = { x: 48, y: 70 };
        lines.forEach((line, i) => {
          if (budget <= 0) return;
          const part = line.slice(0, budget);
          budget -= line.length + 1;
          ctx.font = i === 0 ? `bold 34px ${FONT}` : `${i === 1 ? 22 : 20}px ${line.startsWith('·') ? MONO : FONT}`;
          ctx.fillStyle = i === 1 ? PHOSPHOR : i === 0 ? PHOSPHOR : '#e9c99a';
          ctx.fillText(part, 48, y);
          cursor = { x: 48 + ctx.measureText(part).width + 4, y };
          y += i === 0 ? 46 : 32;
        });
        if (Math.floor(t * 2) % 2 === 0) {
          ctx.fillStyle = PHOSPHOR;
          ctx.fillRect(cursor.x, cursor.y - 20, 12, 24);
        }
        ctx.fillStyle = PHOSPHOR_DIM;
        ctx.font = `16px ${MONO}`;
        ctx.fillText('ESC 退出', width - 120, height - 28);
      },
      input(e) {
        if (e.type === 'click' || (e.type === 'key' && e.key === ' ')) shown = total;
      },
      stop() {},
    };
  },
};
