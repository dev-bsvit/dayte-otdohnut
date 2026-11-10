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
