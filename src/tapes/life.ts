import { MONO, PHOSPHOR, PHOSPHOR_DIM, SCREEN_BG, type Tape } from './types';

/** 生命游戏：点击或拖动画细胞，空格暂停，R 重置 */
export const life: Tape = {
  id: 'life',
  label: '生命游戏',
  color: '#d9b8c4',
  mount({ ctx, width, height }) {
    const cell = 10, cols = Math.floor(width / cell), rows = Math.floor((height - 40) / cell);
    let grid = new Uint8Array(cols * rows);
    let age = new Float32Array(cols * rows);
    const seed = () => { for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.18 ? 1 : 0; };
    seed();
    let acc = 0, paused = false, gen = 0;
    const step = () => {
      const next = new Uint8Array(grid.length);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) n += grid[((y + dy + rows) % rows) * cols + ((x + dx + cols) % cols)];
        }
        const i = y * cols + x;
        next[i] = n === 3 || (n === 2 && grid[i]) ? 1 : 0;
      }
      grid = next; gen++;
    };
    const paint = (px: number, py: number) => {
      const x = Math.floor(px / cell), y = Math.floor(py / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows && Math.random() < 0.6) grid[cy * cols + cx] = 1;
      }
    };
    return {
      frame(dt) {
        acc += dt;
        if (!paused && acc > 0.09) { acc = 0; step(); }
        ctx.fillStyle = SCREEN_BG;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < grid.length; i++) {
          age[i] = grid[i] ? 1 : Math.max(0, age[i] - dt * 2.5); // 余辉
          if (age[i] > 0.02) {
            ctx.globalAlpha = age[i];
            ctx.fillStyle = grid[i] ? PHOSPHOR : PHOSPHOR_DIM;
            ctx.fillRect((i % cols) * cell + 1, Math.floor(i / cols) * cell + 1, cell - 2, cell - 2);
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = PHOSPHOR_DIM;
        ctx.font = `16px ${MONO}`;
        ctx.fillText(`GEN ${String(gen).padStart(5, '0')}   拖动绘制 · 空格${paused ? '继续' : '暂停'} · R 重置`, 16, height - 14);
      },
      input(e) {
        if (e.type === 'click' || (e.type === 'pointer' && e.down)) paint(e.x, e.y);
        if (e.type === 'key' && e.key === ' ') paused = !paused;
        if (e.type === 'key' && (e.key === 'r' || e.key === 'R')) { seed(); age = new Float32Array(grid.length); gen = 0; }
      },
      stop() {},
    };
  },
};
