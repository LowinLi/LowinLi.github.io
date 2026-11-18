import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// 纯静态输出，部署到 GitHub Pages（.github/workflows/deploy.yml），输出目录 dist
// SITE / BASE 由部署 workflow 注入：
//   <user>.github.io 仓库 → base '/'；其它仓库 → base '/<repo>/'
const base = process.env.BASE ?? '/';

// 旧博客（lowin.li，Hexo）的文章地址是 /年/月/日/slug/，新站在 /posts/年/月/日/slug/。
// 每篇文章 front matter 里记着 oldUrl，这里生成跳转页：外面的旧链接、搜索引擎收录都不会断
const redirects = {};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk('src/content/posts').filter((f) => f.endsWith('.md'))) {
  const old = fs.readFileSync(f, 'utf8').match(/^oldUrl:\s*"?([^"\n]+)"?/m)?.[1];
  const id = path.relative('src/content/posts', f).replace(/\\/g, '/').replace(/\.md$/, '');
  if (old) redirects[old] = `${base.replace(/\/$/, '')}/posts/${id}/`;
}

/** 文章里的图片是 /posts-media/…（迁移脚本写的），按 base 补上前缀 */
const rehypeBase = () => (tree) => {
  const visit = (n) => {
    if (n.type === 'element' && n.tagName === 'img' && typeof n.properties?.src === 'string' && n.properties.src.startsWith('/posts-media/')) {
      n.properties.src = base.replace(/\/$/, '') + n.properties.src;
      n.properties.loading = 'lazy';
    }
    n.children?.forEach(visit);
  };
  visit(tree);
};

export default defineConfig({
  site: process.env.SITE ?? 'http://localhost:4321',
  base,
  output: 'static',
  build: { format: 'directory' },
  redirects,
  // 公式在构建时用 KaTeX 渲染成 HTML（文章页不放脚本）
  markdown: { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex, rehypeBase] },
});
