#!/usr/bin/env node
// 视觉闭环：在 390 / 768 / 1440 三个宽度 × 三个降级档位截图。
// 用法: npm run shots -- [url=http://localhost:4321/] [outDir=shots]
// 先 `npm run build && npm run preview` 或 `npm run dev`。
import fs from 'node:fs';
import { createRequire } from 'node:module';

// 优先用项目里的 playwright，没有就用全局安装的（require 会走 NODE_PATH）
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const base = process.argv[2] ?? 'http://localhost:4321/';
const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });

const widths = [390, 768, 1440];
const tiers = ['high', 'mid', 'low'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
for (const w of widths) {
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const url = new URL(base); url.searchParams.set('tier', tier);
    await page.goto(url.href, { waitUntil: 'networkidle' });
    if (tier !== 'low') await page.waitForSelector('.scene[data-ready="true"]', { timeout: 10000 }).catch(() => errors.push('scene not ready in 10s'));
    await page.waitForTimeout(500);
    const file = `${out}/${w}-${tier}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const info = await page.evaluate(() => {
      const s = window.__scene;
      return {
        tier: document.querySelector('.scene')?.dataset.tier,
        drawCalls: s?.info?.render?.calls ?? null,
        hScroll: document.documentElement.scrollWidth > innerWidth,
      };
    });
    report.push({ file, ...info, errors });
    await page.close();
  }
}
await browser.close();
console.table(report.map(({ errors, ...r }) => ({ ...r, errors: errors.length })));
for (const r of report) for (const e of r.errors) console.error(`${r.file}: ${e}`);
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
if (report.some((r) => r.errors.length || r.hScroll)) process.exitCode = 1;
