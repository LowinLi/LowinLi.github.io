#!/usr/bin/env node
// 用法: npm run migrate:hexo -- <hexo 仓库路径>
// 把 <hexo>/source/_posts 下的 markdown 拷到 src/content/posts，规整 front matter，
// 并把 source/images 等静态资源拷到 public/。不会删除已有文件，重名会覆盖。
import fs from 'node:fs';
import path from 'node:path';

const hexo = process.argv[2];
if (!hexo) { console.error('usage: migrate-hexo <hexo-dir>'); process.exit(1); }
const src = path.join(hexo, 'source', '_posts');
const dest = path.resolve('src/content/posts');
if (!fs.existsSync(src)) { console.error(`not found: ${src}`); process.exit(1); }
fs.mkdirSync(dest, { recursive: true });

const toList = (v) => {
  if (v == null || v === '') return null;
  const s = v.trim();
  if (s.startsWith('[')) return s;                       // 已是行内数组
  return `[${s.split(/[,，]\s*/).map((x) => JSON.stringify(x)).join(', ')}]`;
};

function fixFrontMatter(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { text: `---\ntitle: ${JSON.stringify(path.parse(file).name)}\ndate: ${fs.statSync(file).mtime.toISOString()}\n---\n\n${text}`, warn: 'no front matter' };
  const lines = m[1].split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^(tags|categories):\s*(.*)$/);
    if (kv && kv[2].trim() && !kv[2].trim().startsWith('[')) { out.push(`${kv[1]}: ${toList(kv[2])}`); continue; }
    // Hexo 的 categories 允许嵌套数组 `- [a, b]`，拍平
    if (/^\s*-\s*\[.*\]\s*$/.test(line)) {
      for (const x of line.replace(/^\s*-\s*\[|\]\s*$/g, '').split(',')) out.push(`  - ${JSON.stringify(x.trim())}`);
      continue;
    }
    out.push(line);
  }
  let fm = out.join('\n');
  if (!/^title:/m.test(fm)) fm = `title: ${JSON.stringify(path.parse(file).name)}\n${fm}`;
  if (!/^date:/m.test(fm)) fm += `\ndate: ${fs.statSync(file).mtime.toISOString()}`;
  // Hexo 的 `tags:` 后面跟空值会被 YAML 解析成 null，补成空数组
  fm = fm.replace(/^(tags|categories):\s*$(?!\n\s*-)/gm, '$1: []');
  return { text: `---\n${fm}\n---\n` + text.slice(m[0].length) };
}

let n = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(src, p);
    if (e.isDirectory()) { fs.mkdirSync(path.join(dest, rel), { recursive: true }); walk(p); continue; }
    if (/\.md$/i.test(e.name)) {
      const { text, warn } = fixFrontMatter(fs.readFileSync(p, 'utf8'), p);
      fs.writeFileSync(path.join(dest, rel), text);
      if (warn) console.warn(`[warn] ${rel}: ${warn}`);
      n++;
    } else {
      // post_asset_folder 下的图片放到 public/posts/<slug>/，保持相对链接可用
      const out = path.join('public', 'posts', rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(p, out);
    }
  }
};
walk(src);

for (const dir of ['images', 'img', 'assets']) {
  const s = path.join(hexo, 'source', dir);
  if (fs.existsSync(s)) fs.cpSync(s, path.join('public', dir), { recursive: true });
}
console.log(`migrated ${n} posts → ${path.relative(process.cwd(), dest)}`);
console.log('检查: Hexo 标签插件({% ... %})不会被渲染，用 grep -rn "{%" src/content/posts 找出来手动改。');
