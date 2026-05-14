#!/usr/bin/env node
// Generate sitemap.xml from the built VitePress docs.
//
// Runs AFTER `vitepress build docs` in vercel.json's buildCommand, so it
// reflects exactly what's deployed rather than the docs/ source (the source
// has stray .md files that aren't in the build, and docs/plans/ is gitignored
// so it never builds on Vercel at all).
//
// URL mapping mirrors vercel.json's routes:
//   dist-docs/index.html              -> /docs/
//   dist-docs/<dir>/index.html        -> /docs/<dir>/
//   dist-docs/<path>.html             -> /docs/<path>
// plus the app root itself (/).
//
// Excludes 404.html and anything under plans/ (internal planning docs —
// gitignored source, absent from real deploys; excluded so the local
// snapshot matches Vercel output).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DOCS = path.join(ROOT, 'dist-docs');
const OUT = path.join(ROOT, 'sitemap.xml');
const ORIGIN = 'https://app.getbased.health';

if (!fs.existsSync(DIST_DOCS)) {
  console.error('[gen-sitemap] dist-docs/ not found — run `npm run docs:build` first.');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.html') ? [full] : [];
  });
}

function toUrlPath(rel) {
  const noExt = rel.slice(0, -'.html'.length);
  if (noExt === 'index') return 'docs/';
  if (noExt.endsWith('/index')) return `docs/${noExt.slice(0, -'/index'.length)}/`;
  return `docs/${noExt}`;
}

const docPaths = walk(DIST_DOCS)
  .map((f) => path.relative(DIST_DOCS, f).split(path.sep).join('/'))
  .filter((rel) => rel !== '404.html' && !rel.startsWith('plans/'))
  .map(toUrlPath)
  .sort();

const urls = ['', ...docPaths].map((p) => `${ORIGIN}/${p}`);
const lastmod = new Date().toISOString().slice(0, 10);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(OUT, xml);
console.log(`[gen-sitemap] Wrote ${urls.length} URLs → ${OUT}`);
