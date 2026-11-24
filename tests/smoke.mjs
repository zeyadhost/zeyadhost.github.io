import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { launch, serve } from '../tools/chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const deployed = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8').match(/cp -r (.+) _site\//)[1].split(/\s+/);
const { work } = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));
const posts = readdirSync(join(ROOT, 'blog'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `/blog/${d.name}/`);
const paths = ['/', '/blog/', ...posts, ...work.map(p => `/p/${p.slug}/`)];
const views = [
  { name: '360', width: 360, height: 780, mobile: true },
  { name: '1280', width: 1280, height: 800, mobile: false },
];
const extraWidths = (process.env.WIDTHS || '').split(',').filter(Boolean).map(Number);
for (const width of extraWidths) views.push({ name: String(width), width, height: 800, mobile: width < 800 });

const required = [
  ['meta[name="description"]', 'content'],
  ['meta[name="theme-color"]', 'content'],
  ['link[rel="canonical"]', 'href'],
  ['meta[property="og:type"]', 'content'],
  ['meta[property="og:title"]', 'content'],
  ['meta[property="og:description"]', 'content'],
  ['meta[property="og:url"]', 'content'],
  ['meta[property="og:image"]', 'content'],
  ['meta[name="twitter:card"]', 'content'],
];
const minutesAgo = m => new Date(Date.now() - m * 60000);
const fixtures = {
  'user.getrecenttracks': { recenttracks: { track: [{ name: 'Fixture Track', artist: { '#text': 'Fixture Artist' }, url: 'https://www.last.fm/music/Fixture', date: { uts: String(Math.floor(minutesAgo(12) / 1000)) } }] } },
};
const mocked = ['ws.audioscrobbler.com'];
const redact = url => {
  const u = new URL(url);
  return mocked.includes(u.hostname) ? `${u.origin}${u.pathname}` : url;
};

const failures = [];
const external = new Set();
const fail = (where, message) => failures.push(`${where}: ${message}`);

const site = await serve(ROOT, deployed);
const browser = await launch();

async function check(view, path) {
  const where = `${path} at ${view.name}`;
  const tab = await browser.tab();
  const requests = new Map();
  const problems = [];
  tab.on((method, p) => {
    if (method === 'Runtime.exceptionThrown') problems.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`);
    if (method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(p.type)) problems.push(`console.${p.type}: ${p.args.map(a => a.value ?? a.description).join(' ')}`);
    if (method === 'Log.entryAdded' && p.entry.level === 'error') problems.push(`log: ${p.entry.text} ${redact(p.entry.url || 'about:blank')}`);
    if (method === 'Network.requestWillBeSent') {
      requests.set(p.requestId, p.request.url);
      const url = new URL(p.request.url);
      if (/^https?:$/.test(url.protocol) && url.origin !== site.url && !mocked.includes(url.hostname)) problems.push(`external request: ${p.request.url}`);
    }
    if (method === 'Network.responseReceived' && p.response.status >= 400) problems.push(`HTTP ${p.response.status}: ${redact(p.response.url)}`);
    if (method === 'Network.loadingFailed' && !p.canceled) problems.push(`failed: ${p.errorText} ${redact(requests.get(p.requestId))}`);
    if (method === 'Fetch.requestPaused') {
      const url = new URL(p.request.url);
      const body = fixtures[url.searchParams.get('method')] || {};
      tab.call('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      }).catch(error => problems.push(`fixture: ${error.message}`));
    }
  });
  await Promise.all(['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable'].map(m => tab.call(m)));
  await tab.call('Fetch.enable', { patterns: mocked.map(host => ({ urlPattern: `https://${host}/*` })) });
  await tab.call('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 2, mobile: view.mobile });
  await tab.call('Emulation.setTouchEmulationEnabled', { enabled: view.mobile, maxTouchPoints: view.mobile ? 5 : 1 });
  await tab.call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });',
  });

  await tab.go(site.url + path);
  const report = await tab.evaluate(async (required, mobile) => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise(r => setTimeout(r, 30));
    }
    await Promise.all([...document.images].map(img => img.complete || new Promise(r => (img.onload = img.onerror = r))));
    await new Promise(r => setTimeout(r, 300));
    scrollTo(0, 0);
    const out = { errors: [], links: [] };
    if (!document.title.trim()) out.errors.push('empty <title>');
    for (const [selector, attr] of required) if (!document.querySelector(selector)?.getAttribute(attr)) out.errors.push(`missing ${selector}`);
    if (document.querySelector('meta[name="twitter:card"]')?.content !== 'summary_large_image') out.errors.push('twitter:card is not summary_large_image');
    if (document.querySelectorAll('h1').length !== 1) out.errors.push(`${document.querySelectorAll('h1').length} h1 elements`);
    let level = 1;
    for (const h of document.querySelectorAll('h1, h2, h3, h4')) {
      const n = Number(h.tagName[1]);
      if (n > level + 1) out.errors.push(`heading jumps from h${level} to h${n}: ${h.textContent.trim()}`);
      level = n;
    }
    for (const img of document.images) {
      const name = img.getAttribute('src').slice(0, 80);
      if (!img.hasAttribute('alt') || !img.alt.trim()) out.errors.push(`image without alt: ${name}`);
      if (!img.getAttribute('width') || !img.getAttribute('height')) out.errors.push(`image without width or height: ${name}`);
      if (!img.naturalWidth) out.errors.push(`image did not load: ${name}`);
      else if (Math.abs((img.naturalWidth / img.naturalHeight) / (img.width / img.height) - 1) > 0.02 && getComputedStyle(img).objectFit !== 'cover') out.errors.push(`image is stretched: ${name}`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.errors.push(`page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px window`);
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 1 && !el.closest('pre, .age-tip')) {
        out.errors.push(`${el.tagName.toLowerCase()}.${el.className} sticks out to ${Math.round(r.right)}px`);
        break;
      }
    }
    if (mobile) {
      for (const el of document.querySelectorAll('a[href], [tabindex="0"]')) {
        if (el.closest('.prose p, .prose li, .prose figcaption, .note, .lede')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.height < 44 || r.width < 44)) out.errors.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${el.textContent.trim().slice(0, 40)}`);
      }
    }
    const notes = document.querySelector('.notes:not([hidden])');
    const story = document.querySelector('.intro-text p');
    if (notes && story) {
      const n = notes.getBoundingClientRect();
      const s = story.getBoundingClientRect();
      if (n.left > s.right && Math.abs(n.bottom - s.bottom) > 1) out.errors.push(`right-now line ends ${Math.round(n.bottom - s.bottom)}px from the about paragraph`);
    }
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      const data = JSON.parse(ld.textContent);
      const keys = Object.keys(data).filter(k => !k.startsWith('@')).sort().join();
      if (keys !== 'name,sameAs,url') out.errors.push(`json-ld has ${keys}, expected only name, sameAs and url`);
    } else if (location.pathname === '/') out.errors.push('home has no json-ld');
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og) {
      const local = new URL(new URL(og).pathname, location.origin).href;
      const size = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`);
        img.onerror = () => resolve('missing');
        img.src = local;
      });
      if (size !== '1200x630') out.errors.push(`og:image ${new URL(og).pathname} is ${size}`);
    }
    for (const a of document.querySelectorAll('a[href]')) out.links.push(a.href);
    out.cls = window.__cls;
    return out;
  }, required, view.mobile);

  for (const e of [...report.errors, ...problems]) fail(where, e);
  if (report.cls > 0.02) fail(where, `layout shift ${report.cls.toFixed(3)}`);
  for (const href of report.links) {
    const url = new URL(href);
    if (url.protocol === 'mailto:') continue;
    if (url.origin !== site.url) {
      external.add(url.href);
      continue;
    }
    const res = await fetch(url.href.replace(url.hash, ''), { method: 'GET', redirect: 'manual' });
    if (res.status !== 200) fail(where, `link ${url.pathname} answers ${res.status}`);
    else if (url.hash) {
      const html = await res.text();
      if (!html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) fail(where, `link ${url.pathname}${url.hash} has no target`);
    }
  }
  await tab.close();
}

try {
  for (const view of views) for (const path of paths) await check(view, path);
  const missing = await fetch(`${site.url}/no-such-page/`);
  if (missing.status !== 404 || !(await missing.text()).includes('This page does')) fail('/no-such-page/', 'does not answer with the 404 page');
  for (const file of ['robots.txt', 'sitemap.xml', 'feed.xml']) {
    const res = await fetch(`${site.url}/${file}`);
    if (res.status !== 200) fail(file, `answers ${res.status}`);
  }
  const sitemap = await (await fetch(`${site.url}/sitemap.xml`)).text();
  for (const path of paths) if (!sitemap.includes(`<loc>https://zeyad.is-a.dev${path}</loc>`)) fail('sitemap.xml', `missing ${path}`);
  const home = await (await fetch(`${site.url}/`)).text();
  const first = [home, ...[...home.matchAll(/<(?:link rel="stylesheet"|link rel="preload"|script)[^>]*(?:href|src)="([^"]+)"/g)].map(m => readFileSync(join(ROOT, m[1])))];
  const kb = first.reduce((sum, body) => sum + gzipSync(body).length, 0) / 1024;
  console.log(`first load before images: ${kb.toFixed(1)} KB gzipped`);
  if (kb > 100) fail('/', `first load is ${kb.toFixed(1)} KB gzipped`);
} finally {
  await browser.close();
  site.close();
}

console.log(`checked ${paths.length} pages at ${views.map(v => v.name).join(', ')} px`);
console.log(`external links, check by hand once:\n  ${[...external].sort().join('\n  ')}`);
if (failures.length) {
  console.log(`\n${failures.length} problems:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('ok');
