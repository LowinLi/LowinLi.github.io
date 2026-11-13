import { defineConfig } from 'astro/config';

// 纯静态输出，部署到 Cloudflare Pages，输出目录 dist
export default defineConfig({
  site: 'https://example.com', // TODO: 换成正式域名
  output: 'static',
  build: { format: 'directory' },
});
