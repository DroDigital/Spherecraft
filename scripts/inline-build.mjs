// Inlines the built JS and CSS into a single self-contained HTML file (dist-single/index.html).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => {
  const css = readFileSync(join(dist, href), 'utf8');
  return `<style>${css}</style>`;
});

const out = join('dist-single', 'index.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KiB)`);
