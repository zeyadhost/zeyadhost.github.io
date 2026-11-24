import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export function serve(root, allowed = null) {
  const file = path => {
    const top = path.split('/')[1] || 'index.html';
    if (allowed && !allowed.includes(top)) return null;
    let full = normalize(join(root, decodeURIComponent(path)));
    if (!full.startsWith(root)) return null;
    try {
      if (statSync(full).isDirectory()) full = join(full, 'index.html');
      statSync(full);
      return full;
    } catch {
      return null;
    }
  };
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    const found = file(pathname);
    if (!found && pathname !== '/' && !pathname.endsWith('/') && file(`${pathname}/`)) {
      res.writeHead(301, { location: `${pathname}/` }).end();
      return;
    }
    const body = readFileSync(found || join(root, '404.html'));
    res.writeHead(found ? 200 : 404, { 'content-type': TYPES[extname(found || '.html')] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

const browsers = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

export async function launch() {
  const bin = process.env.CHROME || browsers.find(b => spawnSync('which', [b]).status === 0);
  if (!bin) throw new Error('no Chromium found: set CHROME to its path');
  const profile = mkdtempSync(join(tmpdir(), 'chrome-'));
  const chrome = spawn(bin, [
    '--headless=new', '--remote-debugging-pipe', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--font-render-hinting=none', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const [, , , input, output] = chrome.stdio;
  const pending = new Map();
  const listeners = new Set();
  let seq = 0;
  let buffer = '';
  output.on('data', chunk => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\0')) !== -1; buffer = buffer.slice(end + 1)) {
      const message = JSON.parse(buffer.slice(0, end));
      if (!message.id) {
        for (const listener of listeners) listener(message);
        continue;
      }
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
      else call.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });

  async function tab() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const on = fn => {
      const listener = m => m.sessionId === sessionId && fn(m.method, m.params);
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const call = (method, params) => send(method, params, sessionId);
    const evaluate = async (fn, ...args) => {
      const { result, exceptionDetails } = await call('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    const go = async url => {
      const loaded = new Promise(resolve => {
        const off = on(method => method === 'Page.loadEventFired' && (off(), resolve()));
      });
      await call('Page.navigate', { url });
      await loaded;
    };
    return { call, on, evaluate, go, close: () => send('Target.closeTarget', { targetId }) };
  }

  async function close() {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    await Promise.race([send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
    chrome.kill();
    await exited;
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }

  return { tab, close };
}
