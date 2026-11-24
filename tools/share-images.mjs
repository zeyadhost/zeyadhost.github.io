import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, serve } from './chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media', 'share');
const { work } = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const style = `
@font-face { font-family: Mansalva; src: url(/fonts/mansalva.woff2) format("woff2"); }
@font-face { font-family: Mono; src: url(/fonts/dejavu-sans-mono.woff2) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #000; color: #f2f2f2; font-family: Mono, monospace; }
main { position: relative; display: grid; grid-template-columns: 1fr 520px; gap: 56px; align-items: center; height: 100%; padding: 0 64px; }
.brand { position: absolute; top: 44px; left: 64px; font: 64px/1 Mansalva; }
.url { position: absolute; bottom: 44px; left: 64px; font-size: 22px; color: #8c8c8c; }
h1 { font-size: 56px; font-weight: 400; line-height: 1.15; text-decoration: underline 2px; text-underline-offset: 0.16em; }
.tag { margin-top: 22px; font-size: 28px; line-height: 1.4; color: #cfcfcf; }
.meta { margin-top: 18px; font-size: 22px; color: #8c8c8c; }
.shot { aspect-ratio: 16 / 10; overflow: hidden; border: 2px solid #333; background: #0d0d0d; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.spec { display: grid; align-content: center; gap: 14px; padding: 0 36px; font-size: 24px; }
.spec span { display: inline-block; width: 8ch; color: #8c8c8c; }
.home { grid-template-columns: 1fr 532px; }
.name { font: 210px/0.9 Mansalva; }
.hello { margin-top: 34px; font-size: 30px; line-height: 1.4; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
`;

const card = (body, cls = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body><main class="${cls}">${body}</main></body></html>`;
const shot = src => `<div class="shot"><img src="/${src}" alt=""></div>`;
const url = path => `<p class="url">zeyad.is-a.dev/${path}</p>`;

const cards = {
  home: card(
    `<div><p class="name">zeyad</p><p class="hello">i build emulators and browser tools, and i design circuit boards.</p></div>
    <div class="grid">${work.filter(p => p.thumb).slice(0, 4).map(p => shot(p.thumb.src)).join('')}</div>${url('')}`,
    'home',
  ),
};

for (const p of work) {
  const right = p.thumb ? shot(p.thumb.src) : `<div class="shot spec">${p.spec.map(([k, v]) => `<p><span>${esc(k)}</span>${esc(v)}</p>`).join('')}</div>`;
  cards[p.slug] = card(`<p class="brand">zeyad</p><div><h1>${esc(p.name)}</h1><p class="tag">${esc(p.tagline.toLowerCase())}</p><p class="meta">${esc(p.status)}</p></div>${right}${url(`p/${p.slug}/`)}`);
}

for (const file of readdirSync(join(ROOT, 'posts')).filter(f => f.endsWith('.md'))) {
  const text = readFileSync(join(ROOT, 'posts', file), 'utf8');
  const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  const title = text.match(/^title:\s*(.+)$/m)[1];
  const date = text.match(/^date:\s*(.+)$/m)?.[1] || file.slice(0, 10);
  const image = text.match(/!\[[^\]]*\]\(([^)\s]+)\)/)?.[1];
  cards[slug] = card(`<p class="brand">zeyad</p><div><p class="meta">writing - ${esc(date)}</p><h1 style="margin-top: 18px">${esc(title)}</h1></div>${image ? shot(image) : ''}${url(`blog/${slug}/`)}`);
}

const site = await serve(ROOT);
const browser = await launch();
try {
  const tab = await browser.tab();
  await tab.call('Page.enable');
  await tab.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await tab.go(`${site.url}/robots.txt`);
  const { frameTree } = await tab.call('Page.getFrameTree');
  mkdirSync(OUT, { recursive: true });
  for (const [name, html] of Object.entries(cards)) {
    await tab.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await tab.evaluate(() => document.fonts.ready.then(() => Promise.all([...document.images].map(img => img.decode()))));
    const { data } = await tab.call('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
    const jpg = Buffer.from(data, 'base64');
    writeFileSync(join(OUT, `${name}.jpg`), jpg);
    console.log(`media/share/${name}.jpg ${Math.round(jpg.length / 1024)} KB`);
  }
} finally {
  await browser.close();
  site.close();
}
