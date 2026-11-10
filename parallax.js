/* Параллакс первого экрана
   — десктоп: слои следуют за курсором
   — телефон: гироскоп (если доступен) или медленный «дрейф»
   Двигаются только арт-слои (.layer), надписи и интерфейс стоят на месте */
(() => {
  const root = document.documentElement;
  const hero = document.getElementById('hero');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* старт интро-анимации, когда загрузился фон (или через 2.5 с) */
  const start = () => root.classList.remove('is-loading');
  const bg = hero.querySelector('.bg img');
  if (bg.complete) start();
  else { bg.addEventListener('load', start, { once: true }); bg.addEventListener('error', start, { once: true }); }
  setTimeout(start, 2500);

  if (reduce.matches) return;

  const clamp = (v, a = -1, b = 1) => Math.min(b, Math.max(a, v));
  let tx = 0, ty = 0;      // цель
  let cx = 0, cy = 0;      // текущее (сглаженное)
  let source = 'auto';     // auto | mouse | gyro
  let visible = true;
  let raf = 0;

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    source = 'mouse';
    tx = clamp((e.clientX / innerWidth) * 2 - 1);
    ty = clamp((e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  document.addEventListener('mouseleave', () => { tx = 0; ty = 0; });

  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || source === 'mouse') return;
    source = 'gyro';
    tx = clamp(e.gamma / 25);
    ty = clamp((e.beta - 45) / 25);
  }, { passive: true });

  /* iOS просит разрешение на гироскоп — спрашиваем по первому тапу */
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    addEventListener('touchend', () => {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }, { once: true });
  }

  const tick = (t) => {
    raf = 0;
    if (source === 'auto') {
      tx = Math.sin(t / 2600) * 0.45;
      ty = Math.cos(t / 3400) * 0.3;
    }
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;

    hero.style.setProperty('--mx', cx.toFixed(4));
    hero.style.setProperty('--my', cy.toFixed(4));

    if (visible) raf = requestAnimationFrame(tick);
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(tick);
  }).observe(hero);

  raf = requestAnimationFrame(tick);
})();

/* ── Курсор-блик ─────────────────────────────────────────── */
(() => {
  const flare = document.getElementById('flare');
  const hero = document.getElementById('hero');
  if (!flare || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let x = 0, y = 0, queued = false;
  const draw = () => {
    queued = false;
    flare.style.translate = `${x}px ${y}px`;   // translate идёт до scale, так увеличение не сдвигает блик
  };
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    x = e.clientX - r.left; y = e.clientY - r.top;
    flare.classList.add('is-follow');
    flare.classList.remove('is-away');
    flare.classList.toggle('is-hot', !!e.target.closest('a, button'));
    if (!queued) { queued = true; requestAnimationFrame(draw); }
  }, { passive: true });
  hero.addEventListener('pointerleave', () => flare.classList.add('is-away'));
})();

/* ── Входящие сообщения (меню в стиле старого шутера) ───── */
(() => {
  const mailModal = document.getElementById('mailModal');
  if (!mailModal) return;
  const badgePulse = document.querySelector('.hud__badge-pulse');
  const items = [...mailModal.querySelectorAll('.mail-menu__item')];
  const cards = [...mailModal.querySelectorAll('.mail-card')];
  let active = 0;
  let lastFocus = null;

  /* звуки меню: один AudioContext на всю страницу */
  let ctx = null;
  function beep(f1, f2, dur, vol, type = 'square') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx || new AC();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur * .6);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + .02);
    } catch (_) {}
  }
  const chime = () => beep(587.33, 880, .38, .2, 'sine');
  const tick  = () => beep(1400, 1100, .05, .05);

  function select(i, sound = true) {
    i = (i + items.length) % items.length;
    if (i === active && cards[i] && !cards[i].hidden) return;
    active = i;
    items.forEach((el, k) => {
      el.classList.toggle('is-active', k === i);
      el.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    cards.forEach((el, k) => {
      el.hidden = k !== i;
      el.classList.toggle('is-active', k === i);
    });
    if (sound) tick();
  }

  function openMail(i = 0) {
    lastFocus = document.activeElement;
    select(i, false);
    mailModal.classList.add('is-open');
    mailModal.setAttribute('aria-hidden', 'false');
    if (badgePulse) badgePulse.style.display = 'none';
    chime();
    items[active].focus({ preventScroll: true });
  }

  function closeMail() {
    mailModal.classList.remove('is-open');
    mailModal.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  items.forEach((el, k) => {
    el.addEventListener('click', () => select(k));
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') select(k); });
  });

  const btnMail = document.getElementById('btnMail');
  const btnRules = document.getElementById('btnRules');   // «Правила» сразу открывают письмо с планом игры
  if (btnMail) btnMail.addEventListener('click', () => openMail(0));
  if (btnRules) btnRules.addEventListener('click', () => openMail(1));
  document.getElementById('mailClose').addEventListener('click', closeMail);
  document.getElementById('mailBackdrop').addEventListener('click', closeMail);

  document.addEventListener('keydown', (e) => {
    if (!mailModal.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closeMail(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(active + (e.key === 'ArrowDown' ? 1 : -1));
      items[active].focus({ preventScroll: true });
    }
  });
})();
