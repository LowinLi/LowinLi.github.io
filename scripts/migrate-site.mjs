#!/usr/bin/env node
// 把旧博客 lowin.li（Hexo + Matery 主题）上已经发布的文章搬过来：抓网页 → 取正文 → 转回 Markdown。
// 用法：node scripts/migrate-site.mjs [https://lowin.li]
//
// 为什么不从 Hexo 源码搬：源码仓库（LowinLi/myblog）停在 2022 年 4 月，之后的文章不在里面；网页上 30 篇都在。
// - 文章写到 src/content/posts/<年>/<月>/<日>/<slug>.md：站内地址是 /posts/<年>/<月>/<日>/<slug>/，
//   旧地址 /<年>/<月>/<日>/<slug>/ 由 astro.config 的 redirects 跳过来（链接、收录都不会断）。
// - 公式：旧站用 MathJax 在浏览器里渲染，正文里是原样的 $…$；转换前先换成占位符，免得 turndown 把 \ _ * 转义掉。
//   新站在构建时用 KaTeX 渲染（remark-math + rehype-katex），文章页不放脚本。
// - 代码块：Prism 高亮过的 <pre><code class="language-x">，取纯文本 + 语言。
// - 图片：lowin.li 自己的图片下载到 public/posts-media/<slug>/，链接改成站内的；外站图片保留原链接。
// - 书架分卷：SHELF 里按 slug 指定每篇放进哪一卷（books.ts 按 shelf 分组）。
// 抓网页用 curl（云端环境的出网代理对 curl 生效；Node 自带的 fetch 不走代理）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const ORIGIN = (process.argv[2] ?? 'https://lowin.li').replace(/\/$/, '');
const OUT = path.resolve('src/content/posts');
const MEDIA = path.resolve('public/posts-media');

/** 每篇放进书桌上的哪一卷 */
const SHELF = {
  llm: ['vibecoding-shi-dai-cheng-xu-yuan-hui-xiao-shi-ma-cong-quan-zi-dong-dao-ban-zi-dong-de-leng-si-kao', 'iquest-coder-v1-diao-yan', 'chatgpt-chu-quan-de-mi-jue', 'ren-gong-fan-kui-de-qiang-hua-xue-xi', 'azureopenaivsopenai', 'pan-dian-kai-yuan-copilot', 'shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng', 'transformers-cang-ku-zuo-yu-yan-sheng-cheng-de-jie-ma-fang-fa-jie-shao'],
  infer: ['8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing', 'stable-diffusion', 'shi-yong-fastgpt-ti-su-huggingface-de-gpt-wen-ben-sheng-cheng-mo-xing', 'tf-torch-xing-neng-dui-bi', 'gou-jian-tong-guo-dui-lie-yong-gpu-pao-mo-xing-de-fu-wu'],
  tf: ['transformers-xu', 'transformers-yi-datacollator', 'bigbird-chang-wen-ben-yu-xun-lian-mo-xing-jie-shao', 'xun-lian-yi-ge-sentencetransformer-mo-xing', 'data-measurements-tool-jie-shao', 'shui-shuo-torchtext-bu-neng-zuo-duo-biao-qian-ren-wu', 'fen-xiang-cml-gong-ju-zai-github-shang-de-yi-ge-yuan-chuang-li-zi', 'yi-ge-zhong-wen-zhai-yao-sheng-cheng-kai-yuan-xiang-mu'],
  eng: ['docker-fu-wu-jing-xiang-shou-shen', 'docker-fu-wu-qia-zhu-chu-li-guo-cheng', 'python-fu-wu-jing-xiang-bian-yi-so', 'devpi', 'elasticsearch-shu-ju-ku-de-xiang-liang-cun-chu', 'li-yu-ming-zhu-ce-jiao-cheng'],
  road: ['tu-bu-zhang-sheng-hu', 'yue-xia-lu-pi', 'zhuan-zai-ren-gong-zhi-neng-neng-fou-shi-xian'],
};
const shelfOf = (slug) => Object.keys(SHELF).find((k) => SHELF[k].includes(slug));

const get = (url, binary = false) => execFileSync('curl', ['-sSL', '--retry', '3', '--retry-delay', '5', '-m', '90', '-A', 'Mozilla/5.0', url], { maxBuffer: 64 << 20, encoding: binary ? 'buffer' : 'utf8' });
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
const yaml = (s) => JSON.stringify(s);

// ---- 文章列表：首页、分页、归档里所有 /年/月/日/slug/ 链接 ----
const links = new Set();
for (const p of ['/', '/page/2/', '/page/3/', '/page/4/', '/archives/']) {
  let html = ''; try { html = get(ORIGIN + p); } catch { continue; }
  for (const m of html.matchAll(/href="(\/\d{4}\/\d{2}\/\d{2}\/[^"#?]+?\/)"/g)) links.add(m[1]);
}
console.log(`找到 ${links.size} 篇`);

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.use(gfm);
td.addRule('prism', {
  filter: (n) => n.nodeName === 'PRE' && n.querySelector('code'),
  replacement: (_c, n) => {
    const code = n.querySelector('code');
    const lang = (code.getAttribute('class') ?? '').match(/language-([\w+-]+)/)?.[1] ?? '';
    const text = code.textContent.replace(/\n$/, '');
    const fence = text.includes('```') ? '````' : '```';
    return `\n\n${fence}${lang === 'none' ? '' : lang}\n${text}\n${fence}\n\n`;
  },
});

let n = 0;
for (const link of [...links].sort()) {
  const [, y, mo, d, slug] = link.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/$/);
  const html = get(ORIGIN + link);
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]).replace(/\s*\|\s*Lowin Li\s*$/, '').trim();
  const date = html.match(/发布日期:[\s\S]{0,120}?(\d{4}-\d{2}-\d{2})/)?.[1] ?? `${y}-${mo}-${d}`;
  const updated = html.match(/更新日期:[\s\S]{0,120}?(\d{4}-\d{2}-\d{2})/)?.[1];
  const tagBlock = html.match(/class="article-tag">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const tags = [...tagBlock.matchAll(/class="chip[^"]*">([^<]+)</g)].map((m) => decode(m[1]).trim());
  const cateBlock = html.match(/class="post-cate">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const categories = [...cateBlock.matchAll(/class="post-category">\s*([^<]+?)\s*</g)].map((m) => decode(m[1]).trim());
  const start = html.indexOf('<div id="articleContent">');
  const end = html.indexOf('<div class="reprint"', start);
  let body = html.slice(start + '<div id="articleContent">'.length, end).replace(/<\/div>\s*<hr\/>\s*$/, '');
  body = body.replace(/<a [^>]*class="headerlink"[^>]*><\/a>/g, '').replace(/<span id="more"><\/span>/g, '');
  // 图片：本站的下载下来
  const dir = path.join(MEDIA, slug);
  body = body.replace(/<img([^>]*?)src="([^"]+)"/g, (all, pre, src) => {
    const abs = src.startsWith('http') ? src : ORIGIN + (src.startsWith('/') ? '' : '/') + src;
    if (!abs.startsWith(ORIGIN)) return all;
    const name = decodeURIComponent(abs.split('/').pop().split('?')[0]).replace(/[^\w.-]+/g, '_');
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(path.join(dir, name))) fs.writeFileSync(path.join(dir, name), get(abs, true));
      return `<img${pre}src="/posts-media/${slug}/${name}"`;
    } catch { console.warn('  图片下载失败', abs); return all; }
  });
  // 公式先换成占位符（只认正文文本里的 $…$ / $$…$$，代码块里的 $ 不动）
  const math = [];
  body = body.replace(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)|(\$\$[\s\S]+?\$\$|\$[^$\n<]+?\$)/g, (all, code, m) => {
    if (code) return code;
    math.push(decode(m.replace(/<br\s*\/?>/g, '\n')));
    return `MATHPLACEHOLDER${math.length - 1}X`;
  });
  let md = td.turndown(body).replace(/MATHPLACEHOLDER(\d+)X/g, (_, i) => math[+i]).replace(/\n{3,}/g, '\n\n').trim();
  // 摘要：第一段正文的前 70 个字
  const firstPara = md.split('\n\n').map((p) => p.replace(/[#>*`\[\]()!_-]|https?:\S+/g, '').trim()).find((p) => p.length > 12) ?? '';
  const description = firstPara.replace(/\s+/g, ' ').slice(0, 70);
  const shelf = shelfOf(slug);
  if (!shelf) console.warn('  没分卷：', slug);
  const fm = ['---', `title: ${yaml(title)}`, `date: ${date}`, updated ? `updated: ${updated}` : null, `tags: [${tags.map(yaml).join(', ')}]`, `categories: [${categories.map(yaml).join(', ')}]`, `description: ${yaml(description)}`, `shelf: ${shelf ?? 'misc'}`, `oldUrl: ${yaml(link)}`, '---', ''].filter((x) => x !== null).join('\n');
  const file = path.join(OUT, y, mo, d, `${slug}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${fm}\n${md}\n`);
  n++; console.log(`  ${date} ${title}  (${md.length} 字符, ${math.length} 个公式)`);
}
console.log(`写了 ${n} 篇`);
