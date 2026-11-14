import { defineConfig } from 'astro/config';

// 纯静态输出，部署到 GitHub Pages（.github/workflows/deploy.yml），输出目录 dist
// SITE / BASE 由部署 workflow 注入：
//   <user>.github.io 仓库 → base '/'；其它仓库 → base '/<repo>/'
export default defineConfig({
  site: process.env.SITE ?? 'http://localhost:4321',
  base: process.env.BASE ?? '/',
  output: 'static',
  build: { format: 'directory' },
});
