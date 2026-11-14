import { FONT, MONO, PHOSPHOR, PHOSPHOR_DIM, SCREEN_BG, type Tape } from './types';

/** 文章：可用指针或方向键选择，点击 / 回车跳转 */
export const posts: Tape = {
  id: 'posts',
  label: '文章',
  color: '#b9d4c8',
  mount({ ctx, width, height, data, navigate }) {
    const items = [...data.posts.slice(0, 7), { title: '全部文章 →', url: data.postsIndex, date: '' }];
    const top = 110, row = 42;
    let sel = 0;
    const hitRow = (y: number) => {
      const i = Math.floor((y - top + row * 0.7) / row);
      return i >= 0 && i < items.length ? i : -1;
    };
    return {
      frame(_dt, t) {
        ctx.fillStyle = SCREEN_BG;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = PHOSPHOR;
        ctx.font = `bold 28px ${FONT}`;
        ctx.fillText('文章索引', 48, 64);
        ctx.fillStyle = PHOSPHOR_DIM;
        ctx.fillRect(48, 78, width - 96, 2);
        items.forEach((p, i) => {
          const y = top + i * row;
          const active = i === sel;
          if (active) {
            ctx.fillStyle = PHOSPHOR;
            ctx.globalAlpha = 0.85 + Math.sin(t * 6) * 0.1;
            ctx.fillRect(40, y - 28, width - 80, row - 6);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = active ? SCREEN_BG : '#e9c99a';
          ctx.font = `20px ${FONT}`;
          let title = p.title;
          while (ctx.measureText(title).width > width - 230 && title.length > 4) title = title.slice(0, -2) + '…';
          ctx.fillText(title, 56, y);
          if (p.date) {
            ctx.font = `16px ${MONO}`;
            ctx.fillStyle = active ? SCREEN_BG : PHOSPHOR_DIM;
            ctx.fillText(p.date, width - 160, y);
          }
        });
        ctx.fillStyle = PHOSPHOR_DIM;
        ctx.font = `16px ${MONO}`;
        ctx.fillText('↑↓ 选择  ⏎ 打开  ESC 退出', 48, height - 28);
      },
      input(e) {
        if (e.type === 'pointer') { const i = hitRow(e.y); if (i >= 0) sel = i; }
        if (e.type === 'click') { const i = hitRow(e.y); if (i >= 0) navigate(items[i].url); }
        if (e.type === 'key') {
          if (e.key === 'ArrowDown') sel = (sel + 1) % items.length;
          if (e.key === 'ArrowUp') sel = (sel - 1 + items.length) % items.length;
          if (e.key === 'Enter') navigate(items[sel].url);
        }
      },
      stop() {},
    };
  },
};
