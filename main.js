const BIRTH = { year: 2013, month: 0, day: 10 };
const PLACES = 18;

const birthday = year => new Date(year, BIRTH.month, BIRTH.day).getTime();

function age() {
  const nowMs = performance.timeOrigin + performance.now();
  let year = new Date(nowMs).getFullYear();
  if (nowMs < birthday(year)) year--;

  const start = BigInt(birthday(year)) * 1000n;
  const end = BigInt(birthday(year + 1)) * 1000n;
  const now = BigInt(Math.floor(nowMs * 1000));
  const fraction = ((now - start) * 10n ** BigInt(PLACES)) / (end - start);

  return { years: year - BIRTH.year, fraction: fraction.toString().padStart(PLACES, '0') };
}

for (const counter of document.querySelectorAll('.age')) {
  const since = Number(counter.dataset.since || 0);
  const years = () => Math.abs(age().years - since);
  const tip = counter.querySelector('.age-tip');
  counter.querySelector('.age-n').textContent = years();

  let frame = 0;
  const tick = () => {
    tip.textContent = `${years()}.${age().fraction}`;
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    if (!frame) tick();
  };
  const stop = () => {
    if (counter.matches(':hover, :focus-visible, .open')) return;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const close = () => {
    counter.classList.remove('open');
    requestAnimationFrame(stop);
  };

  counter.addEventListener('pointerenter', start);
  counter.addEventListener('focus', start);
  counter.addEventListener('pointerleave', () => requestAnimationFrame(stop));
  counter.addEventListener('blur', close);
  counter.addEventListener('click', () => {
    counter.classList.toggle('open');
    counter.classList.contains('open') ? start() : requestAnimationFrame(stop);
  });
  document.addEventListener('click', e => {
    if (!counter.contains(e.target) && counter.classList.contains('open')) close();
  });
}

const shortcuts = {
  g: () => window.open('https://github.com/zeyadhost', '_blank', 'noopener'),
  e: () => (location.href = 'mailto:zeyadhost@duck.com'),
};

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  shortcuts[e.key.toLowerCase()]?.();
});

const LASTFM_USER = 'qrexxed';
const LASTFM_KEY = 'b1bc20c465971c89487dbfd4f4ce7a5e';
const GITHUB_USER = 'zeyadhost';
const notes = document.querySelector('.notes');

function ago(ms) {
  const seconds = Math.max(0, (Date.now() - ms) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  const days = Math.round(seconds / 86400);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

const lastfm = (method, extra = '') =>
  getJSON(`https://ws.audioscrobbler.com/2.0/?method=${method}&user=${LASTFM_USER}&api_key=${LASTFM_KEY}&format=json&limit=1${extra}`);

function egyptTime() {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', hourCycle: 'h23' }).format(now));
  const part = hour < 6 ? 'probably asleep' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return { value: `${time} in egypt`, note: part };
}

async function loadFacts() {
  const [recent, top, events, feed] = await Promise.allSettled([
    lastfm('user.getrecenttracks'),
    lastfm('user.gettopartists', '&period=7day'),
    getJSON(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=10`),
    fetch('feed.xml').then(r => r.text()),
  ]);
  const facts = [];

  const track = recent.value?.recenttracks?.track?.[0];
  if (track) {
    const playing = track['@attr']?.nowplaying === 'true';
    facts.push({
      key: playing ? 'listening' : 'last played',
      value: `${track.name} by ${track.artist?.['#text'] ?? ''}`,
      href: track.url,
      note: playing || !track.date ? '' : ago(track.date.uts * 1000),
    });
  }

  const artist = top.value?.topartists?.artist?.[0];
  if (artist) {
    facts.push({ key: 'on repeat', value: artist.name, href: artist.url, note: `${artist.playcount} plays this week` });
  }

  const pushes = Array.isArray(events.value)
    ? events.value.filter(e => e.type === 'PushEvent' && e.repo.name !== `${GITHUB_USER}/${GITHUB_USER}`)
    : [];
  const push = pushes.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (push) {
    facts.push({
      key: 'last push',
      value: push.repo.name.replace(`${GITHUB_USER}/`, ''),
      href: `https://github.com/${push.repo.name}`,
      note: ago(Date.parse(push.created_at)),
    });
  }

  facts.push({ key: 'local time', ...egyptTime(), clock: true });

  const rss = feed.value && new DOMParser().parseFromString(feed.value, 'text/xml');
  const post = rss?.querySelector('item');
  if (post) {
    const site = rss.querySelector('channel > link').textContent;
    const link = post.querySelector('link').textContent;
    facts.push({
      key: 'latest post',
      value: post.querySelector('title').textContent,
      href: link.startsWith(site) ? link.slice(site.length) : link,
      note: ago(Date.parse(post.querySelector('pubDate').textContent)),
    });
  }

  return facts;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c !== '' && c != null));
  return node;
}

function renderNotes(facts) {
  notes.replaceChildren(
    ...facts.map(f =>
      el(
        'p',
        {},
        el('span', { className: 'k' }, f.key),
        f.href ? el('a', { href: f.href }, f.value) : f.value,
        f.note ? el('span', { className: 'dim' }, ` ${f.note}`) : '',
      ),
    ),
  );
  notes.hidden = !facts.length;
}

let facts = [];

async function refreshNotes() {
  if (!notes || document.hidden) return;
  facts = await loadFacts();
  renderNotes(facts);
}

refreshNotes();
setInterval(refreshNotes, 60_000);
document.addEventListener('visibilitychange', refreshNotes);

setInterval(() => {
  const clock = facts.find(f => f.clock);
  const now = egyptTime();
  if (clock && clock.value !== now.value) {
    Object.assign(clock, now);
    renderNotes(facts);
  }
}, 15_000);
