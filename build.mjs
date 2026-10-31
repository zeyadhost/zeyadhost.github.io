import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3002').replace(/\/$/, '');
const SITE_NAME = 'zeyad';
const AUTHOR = 'Zeyad Bekhet';
const HOME_COUNT = 3;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slugify = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function markdown(src, root) {
  const url = u => {
    if (/^\s*(javascript|data|vbscript):/i.test(u)) return '#';
    return /^(https?:|mailto:|#|\/)/i.test(u) ? u : root + u;
  };

  const inline = text => {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${url(src)}" alt="${alt}" loading="lazy" />`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${url(href)}">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  };

  const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  const out = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let list = null;

  const flush = () => {
    if (para.length) {
      const text = para.join(' ');
      const figure = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (figure) {
        const caption = figure[1] ? `<figcaption>${esc(figure[1])}</figcaption>` : '';
        out.push(`<figure>${inline(text)}${caption}</figure>`);
      } else {
        out.push(`<p>${inline(text)}</p>`);
      }
    }
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    para = [];
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;

    if (/^```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    } else if ((m = line.match(/^(#{1,3})\s+(.*)/))) {
      flush();
      const level = Math.max(2, m[1].length);
      const html = inline(m[2]);
      out.push(`<h${level} id="${slugify(html)}">${html}</h${level}>`);
    } else if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush();
      const head = cells(line);
      i++;
      const rows = [];
      while (i + 1 < lines.length && /^\|.*\|\s*$/.test(lines[i + 1])) rows.push(cells(lines[++i]));
      const thead = `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push('<hr />');
    } else if ((m = line.match(/^>\s?(.*)/))) {
      flush();
      out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`);
    } else if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (para.length || (list && list.tag !== tag)) flush();
      (list ??= { tag, items: [] }).items.push(m[2]);
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }

  flush();
  return out.join('\n');
}

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const posts = readdirSync(join(ROOT, 'posts'))
  .filter(f => f.endsWith('.md'))
  .map(file => {
    const { meta, body } = frontMatter(readFileSync(join(ROOT, 'posts', file), 'utf8'));
    const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    const date = meta.date || file.slice(0, 10);
    if (!meta.title) throw new Error(`${file}: missing "title:" in its header`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${file}: date should look like 2026-10-19`);
    const words = body.split(/\s+/).filter(Boolean).length;
    return { file, slug, date, title: meta.title, description: meta.description || '', body, minutes: Math.max(1, Math.round(words / 200)) };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

const head = ({ title, description, root, path, type = 'website' }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE_URL}/${path}" />
    <link rel="canonical" href="${SITE_URL}/${path}" />
    <link rel="icon" href="data:," />
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="${root}feed.xml" />
    <link rel="preload" href="${root}fonts/dejavu-sans-mono.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="${root}style.css" />
    <link rel="stylesheet" href="${root}icons.css" />
  </head>`;

const page = (opts, body) => `${head(opts)}
  <body>
    <main class="writing">
      <a class="brand" href="${opts.root}">zeyad</a>
${body}
    </main>
  </body>
</html>
`;

function postPage(post, i) {
  const root = '../../';
  const newer = posts[i - 1];
  const older = posts[i + 1];
  return page(
    { title: `${post.title} - ${SITE_NAME}`, description: post.description, root, path: `blog/${post.slug}/`, type: 'article' },
    `      <p class="crumbs"><a href="${root}">home</a> / <a href="${root}blog/">writing</a></p>
      <article>
        <h1 class="post-title">${esc(post.title)}</h1>
        <p class="post-meta"><time datetime="${post.date}">${post.date}</time> - ${post.minutes} min read</p>
        <div class="prose">
${markdown(post.body, root)}
        </div>
      </article>
      <nav class="post-nav" aria-label="More posts">
        <span>${older ? `older - <a href="../${older.slug}/">${esc(older.title)}</a>` : ''}</span>
        <span>${newer ? `newer - <a href="../${newer.slug}/">${esc(newer.title)}</a>` : ''}</span>
      </nav>`,
  );
}

function indexPage() {
  const root = '../';
  const years = [...new Set(posts.map(p => p.date.slice(0, 4)))];
  const lists = years
    .map(year => {
      const items = posts
        .filter(p => p.date.startsWith(year))
        .map(p => {
          const description = p.description ? `<br /><span class="dim">${esc(p.description)}</span>` : '';
          return `        <li>${p.date.slice(5)} - <a href="${p.slug}/">${esc(p.title)}</a>${description}</li>`;
        })
        .join('\n');
      return `      <h2>${year}</h2>
      <ul class="post-list">
${items}
      </ul>`;
    })
    .join('\n');
  return page(
    { title: `writing - ${SITE_NAME}`, description: `Notes and build logs by ${AUTHOR}.`, root, path: 'blog/' },
    `      <p class="crumbs"><a href="${root}">home</a> / writing</p>
      <h1 class="post-title">writing</h1>
      <p class="post-meta">notes and build logs - <a href="${root}feed.xml">rss</a></p>
${lists || '      <p>nothing yet.</p>'}`,
  );
}

const rfc822 = date => new Date(`${date}T12:00:00Z`).toUTCString();

const feed = () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${SITE_URL}/</link>
    <description>Notes and build logs by ${AUTHOR}.</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${posts
  .map(
    p => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}/</link>
      <guid>${SITE_URL}/blog/${p.slug}/</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${esc(p.description)}</description>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>
`;

function updateHome() {
  const file = join(ROOT, 'index.html');
  const html = readFileSync(file, 'utf8');
  const open = '<section id="writing">';
  const start = html.indexOf(open);
  const end = html.indexOf('</section>', start);
  if (start === -1 || end === -1) throw new Error(`index.html needs a ${open} for the WRITING list`);

  const items = posts
    .slice(0, HOME_COUNT)
    .map(p => `          <li>${p.date} - <a href="blog/${p.slug}/">${esc(p.title)}</a></li>`)
    .join('\n');
  const section = `${open}
        <h2>Writing</h2>
        <ul>
${items || '          <li>nothing yet</li>'}
        </ul>
        <p><a href="blog/">all posts</a> - <a href="feed.xml">rss</a></p>
      `;
  writeFileSync(file, html.slice(0, start) + section + html.slice(end));
}

const ICON_DIR = join(ROOT, 'media', 'icons');
const CHIP_DIR = join(ICON_DIR, 'chips');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ICON_TYPES = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
const MIME = { svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', webp: 'image/webp', jpg: 'image/jpeg' };

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(v => v !== undefined);
const get = (url, ms = 8000) => fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
const dataUri = (body, ext) => `data:${MIME[ext]};base64,${Buffer.from(body).toString('base64')}`;

async function findIcon(host) {
  const candidates = [];
  try {
    const res = await get(`https://${host}/`);
    const html = await res.text();
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
      const rel = attr(tag, 'rel') || '';
      const href = attr(tag, 'href');
      if (!href || !/(^|\s)icon(\s|$)/i.test(rel)) continue;
      const svg = /svg/i.test(attr(tag, 'type') || '') || /\.svg(\?|$)/i.test(href);
      const size = Math.max(16, ...(attr(tag, 'sizes') || '').split(/\s+/).map(s => parseInt(s, 10) || 0));
      candidates.push({ url: new URL(href.replace(/&amp;/g, '&'), res.url).href, score: svg ? 1e4 : size });
    }
  } catch {}

  candidates.sort((a, b) => b.score - a.score);
  candidates.push({ url: `https://${host}/favicon.ico` }, { url: `https://www.google.com/s2/favicons?domain=${host}&sz=64` });

  for (const { url } of candidates) {
    try {
      const res = await get(url);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = ICON_TYPES[type] || (/\.ico(\?|$)/i.test(url) && type === 'application/octet-stream' ? 'ico' : null);
      const body = Buffer.from(await res.arrayBuffer());
      if (res.ok && ext && body.length > 60) return { body, ext, url };
    } catch {}
  }
  return null;
}

const GLOBE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><ellipse cx="8" cy="8" rx="2.6" ry="6.2"/><path d="M2 8h12M3.2 4.6h9.6M3.2 11.4h9.6"/></svg>';
const ENVELOPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="#222" stroke-width="1.4"/><path d="M2.5 4.8 8 9l5.5-4.2" fill="none" stroke="#222" stroke-width="1.4" stroke-linejoin="round"/></svg>';

const chip = icon => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 16 16">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f6f6"/><stop offset="1" stop-color="#cbcbcb"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
    <clipPath id="round"><rect width="16" height="16" rx="4"/></clipPath>
  </defs>
  <g clip-path="url(#round)">
    <rect width="16" height="16" fill="url(#tile)"/>
    <rect width="16" height="8" fill="url(#gloss)"/>
    <rect y="15" width="16" height="1" fill="#000" opacity=".12"/>
  </g>
  <image x="3" y="3" width="10" height="10" preserveAspectRatio="xMidYMid meet" href="${icon}" xlink:href="${icon}"/>
  <rect x=".25" y=".25" width="15.5" height="15.5" rx="3.75" fill="none" stroke="#000" stroke-opacity=".38" stroke-width=".5"/>
</svg>
`;

async function buildIcons(pages) {
  mkdirSync(ICON_DIR, { recursive: true });
  const own = new URL(SITE_URL).host;
  const linked = pages.flatMap(html => [...html.matchAll(/href="https:\/\/([^/"?#]+)/g)].map(m => m[1].toLowerCase()));
  const hosts = [...new Set(linked)].filter(h => h !== own).sort();
  const cached = readdirSync(ICON_DIR);
  const icons = [];

  for (const host of hosts) {
    let file = cached.find(f => f.slice(0, f.lastIndexOf('.')) === host);
    if (!file) {
      const icon = await findIcon(host);
      if (!icon) {
        console.warn(`  no favicon found for ${host}, using the globe (checked again next build)`);
        icons.push({ host, file: null });
        continue;
      }
      file = `${host}.${icon.ext}`;
      writeFileSync(join(ICON_DIR, file), icon.body);
      console.log(`  favicon ${host} <- ${icon.url}`);
    }
    icons.push({ host, file });
  }

  rmSync(CHIP_DIR, { recursive: true, force: true });
  mkdirSync(CHIP_DIR, { recursive: true });
  writeFileSync(join(CHIP_DIR, '_globe.svg'), chip(dataUri(GLOBE, 'svg')));
  writeFileSync(join(CHIP_DIR, '_mail.svg'), chip(dataUri(ENVELOPE, 'svg')));
  for (const { host, file } of icons.filter(i => i.file)) {
    writeFileSync(join(CHIP_DIR, `${host}.svg`), chip(dataUri(readFileSync(join(ICON_DIR, file)), file.split('.').pop())));
  }

  const selector = host => `a[href^="https://${host}/"], a[href="https://${host}"]`;
  const all = [...icons.map(i => selector(i.host)), 'a[href^="mailto:"]'];
  const css = `:is(${all.join(',\n    ')})::before {
  content: "";
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 0.55ch;
  vertical-align: middle;
  border-radius: 4px;
  background: var(--chip) center / 100% 100% no-repeat;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
}

${icons.map(i => `${selector(i.host)} {\n  --chip: url("media/icons/chips/${i.file ? i.host : '_globe'}.svg");\n}`).join('\n\n')}

a[href^="mailto:"] {
  --chip: url("media/icons/chips/_mail.svg");
}
`;
  writeFileSync(join(ROOT, 'icons.css'), css);
  return icons.filter(i => i.file).length;
}

rmSync(join(ROOT, 'blog'), { recursive: true, force: true });
const pages = [];

posts.forEach((post, i) => {
  const dir = join(ROOT, 'blog', post.slug);
  mkdirSync(dir, { recursive: true });
  const html = postPage(post, i);
  writeFileSync(join(dir, 'index.html'), html);
  pages.push(html);
});

mkdirSync(join(ROOT, 'blog'), { recursive: true });
pages.push(indexPage());
writeFileSync(join(ROOT, 'blog', 'index.html'), pages.at(-1));
writeFileSync(join(ROOT, 'feed.xml'), feed());
updateHome();
pages.push(readFileSync(join(ROOT, 'index.html'), 'utf8'));

const iconCount = await buildIcons(pages);
console.log(`built ${posts.length} post${posts.length === 1 ? '' : 's'}: ${posts.map(p => p.slug).join(', ')}; ${iconCount} favicons`);
