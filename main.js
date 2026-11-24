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
