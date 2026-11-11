/* «Дайте мне нормально отдохнуть» — браузерный шутер от первого лица.
   Three.js r128 (глобальный THREE), спрайты из game/assets.js. */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const isTouch = matchMedia('(pointer: coarse)').matches || /[?&]touch/.test(location.search);   // ?touch — проверить мобильное управление на компьютере
const V = (x, y, z) => new THREE.Vector3(x, y, z);

if (isTouch) document.body.classList.add('is-touch');

/* ═════════════ Рендер ═════════════ */

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.autoClear = false;

const FOG = new THREE.Color('#efd3a0');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG, 70, 720);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1500);
camera.rotation.order = 'YXZ';

const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = gunCam.aspect = w / h;
  camera.fov = w / h < 1 ? 92 : 75;
  gunCam.fov = w / h < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
  gunCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ═════════════ Текстуры ═════════════ */

function drawCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function imgCanvas(img, mirror = false) {
  return drawCanvas(img.naturalWidth, img.naturalHeight, (g, w) => {
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0);
  });
}

const glowTex = tex(drawCanvas(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,240,1)');
  r.addColorStop(.25, 'rgba(255,214,120,.9)');
  r.addColorStop(.6, 'rgba(255,130,30,.35)');
  r.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
}));

const flashTex = tex(drawCanvas(128, 128, (g, w) => {
  g.translate(w / 2, w / 2);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7);
    const r = g.createLinearGradient(0, 0, w / 2, 0);
    r.addColorStop(0, 'rgba(255,255,220,1)');
    r.addColorStop(1, 'rgba(255,150,30,0)');
    g.fillStyle = r;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(w / 2, 0); g.lineTo(0, 7); g.fill();
  }
  const c = g.createRadialGradient(0, 0, 0, 0, 0, 26);
  c.addColorStop(0, 'rgba(255,255,255,1)'); c.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = c; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
}));

// Ретро-искра в стиле классических игр 90-х (Doom, Serious Sam, 16-bit аркады):
// чёткая 4-лучевая пиксельная звезда с раскалённым белым ядром, огненными лучами и без размытия
const retroSparkTex = tex(drawCanvas(32, 32, (g) => {
  g.imageSmoothingEnabled = false;
  const cx = 15.5, cy = 15.5;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const dm = dx + dy;
      const isCross = (dx <= 1.2 && dy <= 14) || (dy <= 1.2 && dx <= 14);
      const isDiag = Math.abs(dx - dy) <= 1 && dx <= 6;
      if (dx <= 2 && dy <= 2) {
        g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1);
      } else if (dm <= 5 || (isCross && dx <= 4 && dy <= 4)) {
        g.fillStyle = '#fffa65'; g.fillRect(x, y, 1, 1);
      } else if (isCross || dm <= 8 || isDiag) {
        g.fillStyle = '#ff8800'; g.fillRect(x, y, 1, 1);
      } else if ((dx <= 2 && dy <= 15) || (dy <= 2 && dx <= 15) || dm <= 11) {
        g.fillStyle = '#d01800'; g.fillRect(x, y, 1, 1);
      }
    }
  }
}));
retroSparkTex.magFilter = THREE.NearestFilter;
retroSparkTex.minFilter = THREE.NearestFilter;
const dotTex = retroSparkTex;

// Пиксельный огненный шар взрыва в стиле классических шутеров (Doom / Duke Nukem)
const retroExplosionTex = tex(drawCanvas(64, 64, (g) => {
  g.imageSmoothingEnabled = false;
  const cx = 31.5, cy = 31.5;
  const lobes = [24, 18, 28, 20, 26, 17, 27, 21, 29, 19, 25, 18, 28, 22, 26, 19];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      const theta = ((Math.atan2(dy, dx) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const idx = Math.floor((theta / (Math.PI * 2)) * lobes.length) % lobes.length;
      const maxR = lobes[idx];
      if (d <= maxR) {
        if (d <= 7) g.fillStyle = '#ffffff';
        else if (d <= maxR * 0.44) g.fillStyle = '#ffee33';
        else if (d <= maxR * 0.76) g.fillStyle = '#ff6600';
        else g.fillStyle = '#cc1100';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}));
retroExplosionTex.magFilter = THREE.NearestFilter;
retroExplosionTex.minFilter = THREE.NearestFilter;

const cloudTex = tex(drawCanvas(256, 128, (g) => {
  for (let i = 0; i < 26; i++) {
    const x = rand(40, 216), y = rand(50, 90), r = rand(18, 42);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}));

const sandTex = tex(drawCanvas(256, 256, (g, w, h) => {
  const d = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = 220 + Math.random() * 35;
    d.data[i * 4] = n; d.data[i * 4 + 1] = n * .97; d.data[i * 4 + 2] = n * .92; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  g.globalAlpha = .08; g.strokeStyle = '#7a4c1c'; g.lineWidth = 2;
  for (let y = 0; y < h; y += 9) {          // рябь на песке
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * .05 + y) * 3);
    g.stroke();
  }
}));
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
sandTex.repeat.set(220, 220);

const ammoTex = tex(drawCanvas(128, 112, (g) => {
  g.fillStyle = '#141215'; g.fillRect(6, 30, 116, 76);
  g.strokeStyle = '#ffb83d'; g.lineWidth = 6; g.strokeRect(6, 30, 116, 76);
  for (let i = 0; i < 4; i++) {              // гильзы
    const x = 22 + i * 24;
    g.fillStyle = '#d23a22'; g.fillRect(x, 6, 16, 44);
    g.fillStyle = '#e8b04a'; g.fillRect(x, 40, 16, 12);
  }
  g.fillStyle = '#ffb83d'; g.font = 'bold 21px Arial'; g.textAlign = 'center'; g.fillText('ПАТРОНЫ', 64, 82);
}));

/* ═════════════ Звук (синтез, без файлов) ═════════════ */

const Snd = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, screams = 0, musicTimer = null, musicGain = null;
  /* звуки безголового — файлы из assets, играют через <audio> (работает и с file://).
     Исходник serious-sam-kamikaze-scream.mp3 разрезан на две части:
     крик (крутится по кругу, пока бежит) и взрыв (только при смерти). */
  const SCREAM_SRC = 'assets/kamikaze-scream-loop.wav';
  const BOOM_SRC = 'assets/kamikaze-boom.wav';
  const HONK_SRC = 'assets/voice/sound-effect-2270.mp3';   // гоготание лебедей
  const pool = [], booms = [], honks = [];
  let screamOk = true, boomOk = true, honkOk = true;
  function makeAudio(src, loop, onError) {
    const a = new Audio(src);
    a.preload = 'auto';
    a.loop = loop;
    a.addEventListener('error', onError);
    return a;
  }
  /* Громкость файлов. iPhone не даёт странице менять volume у <audio> (там всегда 1),
     поэтому на нём звук идёт через GainNode. На компьютере — как раньше, через volume
     (так работает и при открытии с диска). ?gainvol — проверить «айфонный» путь на компьютере. */
  // iPhone/iPad определяем по устройству: на новых iOS volume «запоминает» значение, но звук не меняется
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
  const VOL_OK = !IOS && (() => { try { const a = new Audio(); a.volume = .5; return a.volume === .5; } catch (e) { return true; } })()
    && !/[?&]gainvol/.test(location.search);
  function setVol(a, v) {
    v = clamp(v, 0, 1);
    a._vol = v;
    if (VOL_OK) a.volume = v;                            // на iPhone громкость <audio> не меняется — играет как есть
  }
  /* Музыка колонки на iPhone: трек декодируется и играет через Web Audio (BufferSource → Gain) —
     единственный способ, при котором громкость там надёжно управляется. Файл — лёгкая моно-копия. */
  const BG_SRC = 'assets/voice/animator-music-m.m4a';
  const bg = { buf: null, src: null, gain: null, want: false, loading: false, vol: 0 };
  function bgPlay() {
    bg.want = true;
    if (!ctx || muted || bg.src) return;
    if (!bg.buf) {
      if (bg.loading) return;
      bg.loading = true;
      fetch(BG_SRC).then((r) => r.arrayBuffer())
        .then((data) => new Promise((res, rej) => ctx.decodeAudioData(data, res, rej)))
        .then((buf) => { bg.buf = buf; if (bg.want) bgPlay(); })
        .catch(() => { bg.loading = false; bg.failed = true; });
      return;
    }
    if (!bg.gain) { bg.gain = ctx.createGain(); bg.gain.gain.value = bg.vol; bg.gain.connect(ctx.destination); }
    bg.src = ctx.createBufferSource(); bg.src.buffer = bg.buf; bg.src.loop = true;
    bg.src.connect(bg.gain); bg.src.start();
  }
  function bgStop() {
    bg.want = false;
    if (bg.src) { try { bg.src.stop(); } catch (e) {} bg.src.disconnect(); bg.src = null; }
  }
  function bgVol(v) { bg.vol = clamp(v, 0, 1); if (bg.gain) bg.gain.gain.value = bg.vol; }
  // звук идёт через Web Audio — он должен играть и при беззвучном режиме, и после сворачивания
  addEventListener('pointerdown', () => { if (ctx && ctx.state !== 'running') ctx.resume(); }, true);
  function unlock(a) {                 // iOS: первый play() должен быть по нажатию
    if (a._unlocked) return;
    a._unlocked = true; a.muted = true;
    const p = a.play();
    if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    else { a.pause(); a.muted = false; }
  }
  function unlockScreams() {
    while (pool.length < 5) pool.push(makeAudio(SCREAM_SRC, true, () => { screamOk = false; }));
    while (booms.length < 4) booms.push(makeAudio(BOOM_SRC, false, () => { boomOk = false; }));
    while (honks.length < 3) honks.push(makeAudio(HONK_SRC, false, () => { honkOk = false; }));
    pool.forEach(unlock); booms.forEach(unlock); honks.forEach(unlock);
  }
  function init() {
    unlockScreams();
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // iPhone: не глушить переключателем «без звука»
    master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function noise(dur, f0, f1, vol, type = 'lowpass', q = .7) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + .05);
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  return {
    init,
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : .5; if (muted) { this.screamStopAll(); musicPause(); } return muted; },
    isMuted: () => muted,
    screamStart(owner, v) {
      if (muted) return null;
      if (!screamOk) { this.scream(v); return null; }      // файл не загрузился — синтезированный крик
      const a = pool.find((x) => !x._owner && x._unlocked);
      if (!a) return null;                                   // одновременно кричат не больше пяти
      a._owner = owner;
      a.muted = false;
      a.currentTime = 0;
      setVol(a, v);
      const p = a.play();
      if (p && p.catch) p.catch(() => { a._owner = null; });
      a.onended = () => { a._owner = null; };
      return a;
    },
    screamVol(a, owner, v) { if (a && a._owner === owner) setVol(a, v * (voiceBusy ? .45 : 1)); },
    vol: setVol,
    bufMusic: !VOL_OK, bgPlay, bgStop, bgVol,
    bgInfo: () => ({ loaded: !!bg.buf, playing: !!bg.src, gain: bg.gain ? +bg.gain.gain.value.toFixed(3) : null, failed: !!bg.failed, ctx: ctx && ctx.state }),
    screamStop(a, owner) { if (a && a._owner === owner) { a.pause(); a._owner = null; } },
    screamStopAll() { for (const a of pool) { a.pause(); a._owner = null; } },
    shotgun() { noise(.5, 2600, 260, .9); tone('sine', 120, 38, .3, .9); },
    minigun() { noise(.08, 3200, 900, .32); tone('square', 190, 90, .04, .06); },
    boom(v = 1) { noise(1.2, 1400, 50, v); tone('sine', 80, 24, .7, v); },
    win() {
      if (!ctx || muted) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((f, i) => tone('triangle', f, f, .22, .32, i * .1));
      setTimeout(() => tone('triangle', 1046.50, 1046.50, .55, .42), 440);
    },
    musicStart() {                      // бит из колонки аниматора
      if (!ctx || muted || musicTimer) return;
      musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
      let step = 0;
      const BASS = [55, 0, 0, 55, 0, 0, 65.4, 0, 0, 0, 73.4, 0, 49, 0, 0, 0];
      musicTimer = setInterval(() => {
        const t = ctx.currentTime + .05, s = step++ % 16;
        const note = (type, f0, f1, dur, vol) => {
          const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
          o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
          g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
          o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + .02);
        };
        if (s % 4 === 0) note('sine', 140, 40, .18, 1);
        if (s % 4 === 2) { const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          b.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
          b.connect(f); f.connect(g); g.connect(musicGain); b.start(t); b.stop(t + .06); }
        if (BASS[s]) note('square', BASS[s], BASS[s] * .99, .2, .18);
        if (s === 8) note('triangle', 880, 660, .12, .12);
      }, 115);
    },
    musicVol(v) { if (musicGain) musicGain.gain.setTargetAtTime(v * .6, ctx.currentTime, .1); },
    musicStop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } if (musicGain) { musicGain.disconnect(); musicGain = null; } },
    debug: () => ({ muted, screamOk, boomOk, booms: booms.map((b) => ({ u: b._unlocked, paused: b.paused, muted: b.muted, err: b.error && b.error.code, ready: b.readyState })) }),
    kamikazeBoom(v = 1) {               // взрыв из файла; если не загрузился — синтезированный
      if (muted) return;
      if (!boomOk) { this.boom(v); return; }
      const a = booms.find((x) => x._unlocked && (x.paused || x.ended)) || booms.find((x) => x._unlocked);
      if (!a) { this.boom(v); return; }
      a.muted = false;
      a.currentTime = 0;
      setVol(a, v);
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    },
    hurt() { tone('square', 170, 60, .2, .22); },
    pickup() { tone('sine', 660, 880, .08, .22); tone('sine', 990, 1320, .1, .2, .07); },
    empty() { tone('square', 900, 760, .03, .07); },
    honkSynth(v = .5) { tone('sawtooth', 560, 430, .14, v * .3); tone('sawtooth', 540, 410, .16, v * .3, .17); },
    honk(v = .5) {                      // файл лебедя; если не загрузился — синтезированный
      if (muted) return;
      const a = honkOk && honks.find((x) => x._unlocked && (x.paused || x.ended));
      if (!a) { if (!honkOk) this.honkSynth(v); return; }   // все три уже гогочут — пропускаем
      a.muted = false; a.currentTime = 0; setVol(a, v);
      const p = a.play(); if (p && p.catch) p.catch(() => {});
    },
    pop() { noise(.25, 3000, 400, .35, 'bandpass', 2); },
    scream(v = .6) {                         // «А-а-а!» на подбеге
      if (!ctx || muted || screams > 3) return;
      screams++;
      const t = ctx.currentTime, dur = 1.3;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(560, t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
      const lg = ctx.createGain(); lg.gain.value = 26; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(v * .32, t + .08); g.gain.setValueAtTime(v * .32, t + dur - .25);
      g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      o.onended = () => { screams--; };
    },
  };
})();

/* ═════════════ Мир ═════════════ */

const ARENA = 140;

function H(x, z) {
  const m = 1 + smooth(150, 430, Math.hypot(x, z)) * 6;
  return m * (1.3 * Math.sin(x * .045 + .3) * Math.cos(z * .038)
            + .8 * Math.sin((x + z) * .07)
            + .45 * Math.cos(x * .12 - z * .09));
}

// небо
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#0f4fd6') },
      mid: { value: new THREE.Color('#4d93ee') },
      low: { value: FOG.clone() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, mid, low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(low, c, smoothstep(-0.02, 0.16, h)); gl_FragColor = vec4(c, 1.0); }',
  }),
);
scene.add(sky);

const SUN_DIR = V(-.45, .5, -.74).normalize();
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(260, 260, 1);
scene.add(sunSprite);

for (let i = 0; i < 16; i++) {
  const a = rand(0, Math.PI * 2), d = rand(520, 860);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: rand(.7, .95) }));
  s.position.set(Math.cos(a) * d, rand(170, 330), Math.sin(a) * d);
  const w = rand(180, 340); s.scale.set(w, w * .45, 1);
  scene.add(s);
}

scene.add(new THREE.HemisphereLight('#cfe6ff', '#c58a45', .8));
const sun = new THREE.DirectionalLight('#fff0d2', 1.05);
sun.position.copy(SUN_DIR).multiplyScalar(300);
scene.add(sun);

// земля
{
  const g = new THREE.PlaneGeometry(1800, 1800, 240, 240);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const lo = new THREE.Color('#c08442'), hi = new THREE.Color('#f3cb85'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = H(x, z);
    p.setY(i, y);
    const m = 1 + smooth(150, 430, Math.hypot(x, z)) * 6;
    c.copy(lo).lerp(hi, clamp((y / m + 2.6) / 5.2, 0, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: sandTex })));
}

// пирамиды и обелиски на горизонте
const pyramidMat = new THREE.MeshPhongMaterial({ color: '#e2b26c', flatShading: true, shininess: 0 });
for (const [x, z, s] of [[-210, -560, 230], [90, -650, 320], [300, -500, 170], [-520, 160, 200], [480, 330, 150]]) {
  const h = s * .64;
  const m = new THREE.Mesh(new THREE.ConeGeometry(s * .72, h, 4), pyramidMat);
  m.rotation.y = Math.PI / 4 + rand(-.2, .2);
  m.position.set(x, H(x, z) + h / 2 - 4, z);
  scene.add(m);
}
const stoneMat = new THREE.MeshPhongMaterial({ color: '#dab57c', flatShading: true, shininess: 0 });
for (let i = 0; i < 7; i++) {
  const a = rand(0, Math.PI * 2), d = rand(190, 300), x = Math.cos(a) * d, z = Math.sin(a) * d;
  const h = rand(18, 32);
  const o = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.6), stoneMat);
  o.position.set(x, H(x, z) + h / 2 - 1, z);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.85, 3.2, 4), stoneMat);
  top.position.y = h / 2 + 1.6; top.rotation.y = Math.PI / 4;
  o.add(top);
  scene.add(o);
}

// руины внутри арены — укрытия
const colliders = [];
const BEACH = { x: 30, z: -30, r: 16 };   // пляж отеля: все шезлонги здесь
const inBeach = (x, z, pad = 0) => Math.hypot(x - BEACH.x, z - BEACH.z) < BEACH.r + pad;
for (let i = 0; i < 18; i++) {
  const a = rand(0, Math.PI * 2), d = rand(20, 128), x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (inBeach(x, z, 3)) continue;
  const r = rand(.9, 1.5), h = Math.random() < .4 ? rand(2, 4) : rand(5.5, 10);
  const y0 = H(x, z) - .6;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r * .88, r, h, 10), stoneMat);
  col.position.set(x, y0 + h / 2, z);
  col.rotation.z = h < 4 ? rand(-.08, .08) : 0;
  scene.add(col);
  if (h > 5.5) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, .7, r * 2.4), stoneMat);
    cap.position.y = h / 2 + .35;
    col.add(cap);
  }
  colliders.push({ x, z, r, y0, h: h + .7 });
}
const rockMat = new THREE.MeshPhongMaterial({ color: '#b98a55', flatShading: true, shininess: 0 });
for (let i = 0; i < 70; i++) {
  const a = rand(0, Math.PI * 2), d = rand(8, 420), x = Math.cos(a) * d, z = Math.sin(a) * d;
  const r = rand(.3, 2.2);
  if (inBeach(x, z, 2)) continue;
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
  m.scale.set(1, rand(.45, .8), rand(.8, 1.3));
  m.rotation.set(rand(0, 3), rand(0, 3), 0);
  m.position.set(x, H(x, z), z);
  scene.add(m);
  if (r > 1.5 && d < ARENA) colliders.push({ x, z, r: r * .9, y0: H(x, z) - 1, h: r * 1.4 });
}

/* ═════════════ Частицы и эффекты ═════════════ */

const PMAX = 1800;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
let pNext = 0;
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -9999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: .42, map: dotTex, alphaTest: .18, vertexColors: true, transparent: true });
pMat.onBeforeCompile = (sh) => {   // у камеры частицы не раздуваются в огромные круги
  sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', 'gl_PointSize = clamp(gl_PointSize, 5.0, 32.0);\n#include <fog_vertex>');
};
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

const tmpC = new THREE.Color();
function emit(x, y, z, n, colors, speed = 6, up = 3, life = 1) {
  for (let k = 0; k < n; k++) {
    const i = pNext; pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = rand(0, Math.PI * 2), b = rand(-1, 1), s = speed * rand(.3, 1);
    const q = Math.sqrt(1 - b * b);
    pVel[i * 3] = Math.cos(a) * q * s; pVel[i * 3 + 1] = b * s + up * rand(.5, 1.2); pVel[i * 3 + 2] = Math.sin(a) * q * s;
    pLife[i] = life * rand(.5, 1.2);
    tmpC.set(pick(colors)).multiplyScalar(rand(.8, 1.1));
    pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    const j = i * 3;
    pVel[j + 1] -= 18 * dt;   // ретро-гравитация
    pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
    const g = H(pPos[j], pPos[j + 2]);
    if (pPos[j + 1] < g) {
      pPos[j + 1] = g;
      pVel[j] *= .65;
      pVel[j + 1] = Math.abs(pVel[j + 1]) * .38;   // отскок искр от песка
      pVel[j + 2] *= .65;
    }
    // Ретро-остывание огненных искр: желтый -> оранжевый -> темно-красный -> дым
    if (pCol[j] > 0.4) {
      pCol[j + 1] = Math.max(0, pCol[j + 1] - dt * 0.85);
      pCol[j + 2] = Math.max(0, pCol[j + 2] - dt * 1.6);
    }
    if (pLife[i] <= 0) pPos[j + 1] = -9999;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

const blasts = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: retroExplosionTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.visible = false; scene.add(s);
  blasts.push({ s, t: 0, dur: 1, size: 1 });
}
function blast(x, y, z, size = 7, dur = .45) {
  const b = blasts.find((b) => !b.s.visible) || blasts[0];
  b.s.position.set(x, y, z); b.s.visible = true; b.t = 0; b.dur = dur; b.size = size;
  b.s.material.rotation = rand(0, Math.PI * 2);
}

// Пакет ретро-искр и взрыва в стиле классических шутеров (Doom / Serious Sam)
function emitExplosion(x, y, z, isBoss = false) {
  blast(x, y, z, isBoss ? 22 : 8.5, isBoss ? .75 : .48);
  const n = isBoss ? 160 : 75;
  // 1. Быстрые радиальные пиксельные искры во все стороны
  emit(x, y, z, Math.floor(n * 0.6), ['#ffffff', '#fff952', '#ffaa00', '#ff5500', '#ff2200'], isBoss ? 20 : 14, isBoss ? 7 : 4, isBoss ? 1.4 : 0.95);
  // 2. Дуговые искры-осколки, взлетающие вверх и отскакивающие от земли
  emit(x, y, z, Math.floor(n * 0.4), ['#ffe033', '#ff7700', '#d81800', '#ff3300', '#3a2010'], isBoss ? 12 : 8, isBoss ? 14 : 9, isBoss ? 1.8 : 1.3);
}
let activeBlasts = 0;
function updateBlasts(dt) {
  activeBlasts = blasts.reduce((n, b) => n + (b.s.visible ? 1 : 0), 0);
  for (const b of blasts) {
    if (!b.s.visible) continue;
    b.t += dt;
    const k = b.t / b.dur;
    if (k >= 1) { b.s.visible = false; continue; }
    const sc = b.size * (.35 + .9 * Math.sqrt(k));
    b.s.scale.set(sc, sc, 1);
    // рядом с камерой и при куче взрывов сразу — приглушаем, чтобы не было белого экрана
    const near = clamp(b.s.position.distanceTo(camera.position) / (sc * .9), .15, 1);
    const crowd = 1 / (1 + Math.max(0, activeBlasts - 1) * .45);
    b.s.material.opacity = (1 - k * k) * .8 * near * crowd;
  }
}

const tracers = [];
for (let i = 0; i < 14; i++) {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true, fog: false }));
  l.visible = false; l.frustumCulled = false; scene.add(l);
  tracers.push({ l, t: 0 });
}
function tracer(a, b) {
  const tr = tracers.find((t) => !t.l.visible) || tracers[0];
  const p = tr.l.geometry.attributes.position;
  p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  tr.l.visible = true; tr.t = .06;
}
function updateTracers(dt) {
  for (const tr of tracers) {
    if (!tr.l.visible) continue;
    tr.t -= dt;
    tr.l.material.opacity = clamp(tr.t / .06, 0, 1);
    if (tr.t <= 0) tr.l.visible = false;
  }
}

const muzzleLight = new THREE.PointLight('#ffc46a', 0, 16, 2);
scene.add(muzzleLight);

/* ═════════════ Оружие (вид от первого лица) ═════════════ */

gunScene.add(new THREE.HemisphereLight('#ffffff', '#8a6237', .9));
const gunSun = new THREE.DirectionalLight('#fff3dc', 1.3);
gunSun.position.set(-1, 2, 1.5);
gunScene.add(gunSun);
const gunFlashLight = new THREE.PointLight('#ffb64a', 0, 3, 2);
gunFlashLight.position.set(.25, -.2, -1.1);
gunScene.add(gunFlashLight);

const M = (color, rough = .5, metal = .25) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const gm = {
  metal: M('#4a4d55'), dark: M('#2a2b30', .6, .2), steel: M('#8a8f99', .35, .5),
  wood: M('#7b4a22', .8, 0), orange: M('#ffb83d', .4, .25), green: M('#2dbd00', .5, .2),
};
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(r, len, mat, x, y, z, parent, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function addFlash(parent, x, y, z, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  s.position.set(x, y, z); s.scale.set(size, size, 1); s.visible = false;
  parent.add(s); return s;
}

/* наклейки для чемодана */
function stickerTex(draw, w = 256, h = 128) {
  const t = tex(drawCanvas(w, h, draw));
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .4, roughness: .7, metalness: 0 });
}
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); };
const stickers = {
  vacation: stickerTex((g, w, h) => {
    g.fillStyle = '#ffb83d'; roundRect(g, 6, 14, w - 12, h - 28, 26);
    g.fillStyle = '#241709'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ОТПУСК', w / 2, h / 2 + 2);
  }),
  fragile: stickerTex((g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(4, 18, w - 8, h - 36);
    g.strokeStyle = '#d23a22'; g.lineWidth = 6; g.strokeRect(10, 24, w - 20, h - 48);
    g.fillStyle = '#d23a22'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('НЕ КАНТОВАТЬ', w / 2, h / 2 + 1);
  }),
  sun: stickerTex((g, w) => {
    g.translate(w / 2, w / 2);
    g.fillStyle = '#ffcf3d';
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(-10, -44); g.lineTo(0, -62); g.lineTo(10, -44); g.fill(); }
    g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#241709'; g.beginPath(); g.arc(-14, -8, 5, 0, 7); g.arc(14, -8, 5, 0, 7); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#241709'; g.beginPath(); g.arc(0, 4, 18, .2, Math.PI - .2); g.stroke();
  }, 128, 128),
  plane: stickerTex((g, w, h) => {
    g.fillStyle = '#2d7fe0'; roundRect(g, 8, 8, w - 16, h - 16, 18);
    g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('✈ СОЧИ', w / 2, h / 2 + 2);
  }),
};
const plane = (w, h, mat, parent, x, y, z, ry = 0, rx = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); parent.add(m); return m;
};

/* Чемодан-дробовик: чемодан на колёсиках, два ствола торчат спереди */
function buildSuitcase() {
  const g = new THREE.Group();
  const shell = M('#14907f', .55, .05), rib = M('#0d6e61', .6, .05), black = M('#1b1b1e', .7, .1), paper = M('#f1e6c8', .8, 0);
  box(.36, .3, .62, shell, 0, .02, -.45, g);
  for (const y of [-.08, .02, .12]) box(.372, .022, .6, rib, 0, y, -.45, g);        // рёбра корпуса
  for (const x of [-.17, .17]) for (const y of [-.12, .16]) box(.05, .05, .05, black, x, y, -.75, g);   // уголки
  box(.045, .035, .13, black, .13, .19, -.3, g);                                     // ручка сверху
  plane(.22, .11, stickers.vacation, g, 0, .172, -.22, 0, -Math.PI / 2);
  plane(.1, .1, stickers.sun, g, .12, .172, -.6, .4, -Math.PI / 2);
  plane(.24, .12, stickers.fragile, g, -.181, .02, -.5, -Math.PI / 2);
  plane(.2, .1, stickers.plane, g, -.181, .04, -.26, -Math.PI / 2);
  for (const x of [-.055, .055]) {                     // стволы лежат сверху, как у турели
    cyl(.036, .64, gm.metal, x, .225, -.72, g);
    cyl(.04, .04, gm.steel, x, .225, -1.03, g);
    box(.03, .05, .04, black, x, .2, -.5, g);           // крепления к корпусу
    box(.03, .05, .04, black, x, .2, -.85, g);
  }
  const wheels = [];
  for (const x of [-.14, .14]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .035, 12).rotateZ(Math.PI / 2), black);
    w.position.set(x, -.15, -.7); g.add(w); wheels.push(w);
  }
  // выдвижная ручка — работает как цевьё
  const pump = new THREE.Group(); pump.position.set(0, -.08, -.14); g.add(pump);
  for (const x of [-.08, .08]) box(.018, .018, .14, gm.steel, x, 0, .0, pump);
  box(.2, .03, .03, black, 0, 0, .07, pump);
  // бирка на верёвочке
  const tag = new THREE.Group(); tag.position.set(.13, .2, -.3); g.add(tag);
  box(.004, .06, .004, black, 0, -.03, 0, tag);
  box(.07, .1, .006, paper, 0, -.1, 0, tag);
  const flash = addFlash(g, 0, .225, -1.08, .6);
  g.scale.setScalar(.5);
  g.position.set(.22, -.25, -.62);
  g.rotation.y = -.06;
  return { g, pump, pumpZ: -.14, pumpTravel: .06, wheels, tag, flash, base: g.position.clone(), muzzle: V(0, .225, -1.08) };
}

/* Фламинго-пулемёт: надувной фламинго в очках, из клюва крутятся стволы */
function buildFlamingo() {
  const g = new THREE.Group();
  const pink = M('#ff7fb0', .28, .05), white = M('#fff6f0', .4, 0), black = M('#141416', .3, .2);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10), pink);
  body.scale.set(1, .78, 1.45); body.position.set(0, -.03, -.25); g.add(body);
  // шея изгибается вправо — голова в очках и стволы видны из-за тела
  const HX = .09;
  const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(.02, .04, -.42), V(.08, .19, -.5), V(.13, .25, -.66), V(HX, .19, -.84)]), 20, .045, 8), pink);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), pink);
  head.position.set(HX, .19, -.9); g.add(head);
  for (const x of [-.034, .034]) box(.05, .032, .012, black, HX + x, .205, -.967, g);   // очки
  box(.03, .008, .01, black, HX, .21, -.97, g);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 8).rotateX(-Math.PI / 2), white);
  beak.position.set(HX, .165, -1.0); g.add(beak);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .03, 8).rotateZ(Math.PI / 2), white);
  valve.position.set(-.17, 0, -.22); g.add(valve);
  // зонтик из коктейля
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .2, 4), white);
  stick.position.set(.09, .17, -.18); stick.rotation.z = -.35; g.add(stick);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(.07, .04, 8), M('#ffcf3d', .5, 0));
  umb.position.set(.125, .27, -.18); umb.rotation.z = -.35; g.add(umb);
  // блок стволов из клюва
  const spin = new THREE.Group(); spin.position.set(HX, .165, -1.18); g.add(spin);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    cyl(.012, .34, gm.metal, Math.cos(a) * .03, Math.sin(a) * .03, 0, spin, 8);
  }
  cyl(.02, .34, gm.steel, 0, 0, 0, spin, 8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.045, .01, 6, 16), gm.orange);
  ring.position.z = -.15; spin.add(ring);
  const flash = addFlash(g, HX, .165, -1.38, .5);
  g.scale.setScalar(.62);
  g.position.set(.2, -.25, -.55);
  g.rotation.y = .06;
  return { g, spin, flash, base: g.position.clone(), muzzle: V(HX, .165, -1.38) };
}

const WEAPONS = [
  { name: 'Чемодан', ammo: 'shells', interval: .78, pellets: 10, spread: .07, dmg: 12, range: 70, kick: 1, model: buildSuitcase() },
  { name: 'Фламинго', ammo: 'bullets', interval: .072, pellets: 1, spread: .02, dmg: 13, range: 140, kick: .22, model: buildFlamingo() },
];
WEAPONS.forEach((w) => { w.model.g.visible = false; gunScene.add(w.model.g); });

/* ═════════════ Спрайты врагов и бонусов ═════════════ */

const A = window.GAME_ASSETS || {};
const pickMats = {};

/* Безголовый с бомбами — низкополигональная 3D-модель на шарнирах */
const PH = (color, shininess = 6) => new THREE.MeshPhongMaterial({ color, flatShading: true, shininess });
const RM = {
  skin: PH('#7f8c62', 10), pants: PH('#3f4535', 0), boots: PH('#2b241f', 0),
  belt: PH('#5b3b20', 4), stump: PH('#8a2c22', 20), bomb: PH('#1c1c1e', 70), fuse: PH('#c9a46a', 0),
};
const RG = {
  hip: new THREE.CylinderGeometry(.22, .24, .24, 7),
  belt: new THREE.CylinderGeometry(.25, .25, .07, 7),
  torso: new THREE.CylinderGeometry(.36, .22, .68, 7),
  pecs: new THREE.BoxGeometry(.5, .16, .12),
  stump: new THREE.CylinderGeometry(.1, .12, .08, 6),
  upperArm: new THREE.CylinderGeometry(.09, .07, .36, 6).translate(0, -.18, 0),
  foreArm: new THREE.CylinderGeometry(.075, .06, .32, 6).translate(0, -.16, 0),
  thigh: new THREE.CylinderGeometry(.115, .09, .46, 6).translate(0, -.23, 0),
  shin: new THREE.CylinderGeometry(.09, .07, .44, 6).translate(0, -.22, 0),
  boot: new THREE.BoxGeometry(.16, .11, .28).translate(0, -.05, -.05),
  bomb: new THREE.IcosahedronGeometry(.16, 1),
  fuse: new THREE.CylinderGeometry(.016, .016, .12, 5),
};
const sparkMat = new THREE.SpriteMaterial({ map: retroSparkTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

function makeRunnerMesh() {
  const g = new THREE.Group();
  const skin = RM.skin.clone();
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

  const body = joint(g, 0, .98, 0);
  mesh(RG.hip, RM.pants, body);
  mesh(RG.belt, RM.belt, body, 0, .12, 0);
  mesh(RG.torso, skin, body, 0, .48, 0).scale.z = .72;
  mesh(RG.pecs, skin, body, 0, .66, -.13);
  mesh(RG.stump, RM.stump, body, 0, .85, 0);

  const arms = [], elbows = [], sparks = [];
  for (const side of [-1, 1]) {
    const arm = joint(body, side * .37, .74, 0);
    arm.rotation.z = side * 2.67;                 // руки вверх и в стороны
    mesh(RG.upperArm, skin, arm);
    const elbow = joint(arm, 0, -.36, 0);
    elbow.rotation.z = side * .45;                // предплечья почти вертикально
    mesh(RG.foreArm, skin, elbow);
    const bomb = mesh(RG.bomb, RM.bomb, elbow, 0, -.42, 0);
    mesh(RG.fuse, RM.fuse, bomb, 0, -.19, 0);
    const spark = new THREE.Sprite(sparkMat);
    spark.position.set(0, -.27, 0); spark.scale.set(.3, .3, 1);
    bomb.add(spark);
    arms.push(arm); elbows.push(elbow); sparks.push(spark);
  }

  const legs = [], knees = [];
  for (const side of [-1, 1]) {
    const leg = joint(body, side * .13, 0, 0);
    mesh(RG.thigh, RM.pants, leg);
    const knee = joint(leg, 0, -.46, 0);
    mesh(RG.shin, RM.pants, knee);
    mesh(RG.boot, RM.boots, knee, 0, -.44, 0);
    legs.push(leg); knees.push(knee);
  }
  return { g, skin, body, arms, elbows, legs, knees, sparks };
}

/* 3D-модель из models/kamikaze.glb (Magnific → Blender), встроена в game/models.js.
   Если не загрузилась — остаётся модель из примитивов выше. */
function parseGLB(name) {          // модели встроены в game/models.js как base64
  return new Promise((res) => {
    const b64 = (window.GAME_MODELS || {})[name];
    if (!b64 || !THREE.GLTFLoader) { res(null); return; }
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', res, (err) => { console.error('Модель не загрузилась:', name, err); res(null); });
  });
}

/* Оружие из models/*.glb: ствол смотрит в −Z, длина 1, есть узлы muzzle и (у фламинго) barrels */
function weaponFromGLB(gltf, opt) {
  const g = new THREE.Group();
  const model = gltf.scene;
  model.scale.setScalar(opt.size);
  model.rotation.set(opt.rx || 0, opt.ry || 0, 0);
  g.add(model);
  model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material.metalness > .5) o.material.metalness = .5; } });
  const muzzleNode = model.getObjectByName('muzzle') || model;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  flash.scale.setScalar(opt.flash / opt.size); flash.visible = false;
  muzzleNode.add(flash);
  g.position.set(...opt.pos);
  g.rotation.y = opt.yaw || 0;
  return { g, flash, spin: model.getObjectByName('barrels') || null, base: g.position.clone(), external: true };
}
function swapWeapon(i, m) {
  const w = WEAPONS[i], vis = w.model.g.visible;
  gunScene.remove(w.model.g);
  w.model = m; m.g.visible = vis;
  gunScene.add(m.g);
}

let KAMI = null;
const KAMI_HEIGHT = 2.0;        // рост в позе покоя, м
const KAMI_CLIP_SPEED = 5.68;   // с какой скоростью бежит клип при росте 1,7 м (замерено в Blender)
function loadKamikaze() {
  return new Promise((res) => {
    const b64 = (window.GAME_MODELS || {}).kamikaze;
    if (!b64 || !THREE.GLTFLoader || !THREE.SkeletonUtils) { res(null); return; }
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', (gltf) => {
      const root = gltf.scene;
      // рост берём по геометрии сетки: узел сетки масштабирован на 0,01, но скиннинг этот масштаб игнорирует
      const box = new THREE.Box3();
      root.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
      const h = box.max.y - box.min.y;
      res({ scene: root, clip: gltf.animations[0], scale: KAMI_HEIGHT / h, minY: box.min.y, srcH: h });
    }, (err) => { console.error('Модель безголового не загрузилась', err); res(null); });
  });
}
function makeKamikaze() {
  const g = new THREE.Group();
  const inner = THREE.SkeletonUtils.clone(KAMI.scene);
  inner.scale.setScalar(KAMI.scale);
  inner.position.y = -KAMI.minY * KAMI.scale;
  inner.rotation.y = Math.PI;               // модель смотрит в +Z, а «вперёд» в игре — это −Z
  g.add(inner);
  const mats = [];
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();        // своя копия — чтобы вспыхивал только этот
    mats.push(o.material);
    o.frustumCulled = false;
  });
  const mixer = new THREE.AnimationMixer(inner);
  const action = mixer.clipAction(KAMI.clip);
  action.play();
  action.time = rand(0, KAMI.clip.duration);
  const hands = ['LeftHand', 'RightHand'].map((n) => inner.getObjectByName(n)).filter(Boolean);
  const sparks = hands.map(() => { const s = new THREE.Sprite(sparkMat); s.scale.set(.3, .3, 1); scene.add(s); return s; });
  return { g, mats, mixer, action, hands, sparks, external: true };
}
/* Финальный босс — Начальник: модель models/boss.glb (своя модель → скелет и движения Magnific → Blender).
   Анимации «run» (тяжёлый бег на месте) и «attack» (удар двумя руками сверху). */
let BOSS = null;
const BOSS_HEIGHT = 5.4;          // рост в игре, м
const BOSS_FACE = Math.PI / 2;     // куда смотрит лицо модели: угол от +Z к +X (у этой — вдоль +X)
const BOSS_STEPS = .85;           // шагов-циклов в секунду (два шага на цикл)
async function loadBoss() {
  const gltf = await parseGLB('boss');
  if (!gltf || !THREE.SkeletonUtils) return null;
  const box = new THREE.Box3();
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
  const h = box.max.y - box.min.y;
  return { scene: gltf.scene, scale: BOSS_HEIGHT / h, minY: box.min.y };
}
function makeBoss() {
  const g = new THREE.Group();
  const inner = THREE.SkeletonUtils.clone(BOSS.scene);
  inner.scale.setScalar(BOSS.scale);
  inner.position.y = -BOSS.minY * BOSS.scale;
  inner.rotation.y = Math.PI - BOSS_FACE;   // лицом к −Z игры (сама модель смотрит вдоль +X)
  g.add(inner);
  const mats = [];
  inner.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); o.frustumCulled = false; } });
  /* Движения Meshy на этой фигуре (огромный торс, короткие ноги) складывали её пополам,
     поэтому шаг и удар собираем сами из позы покоя: каждой кости — поворот вокруг осей модели. */
  g.updateMatrixWorld(true);
  const qInner = inner.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bone = (name) => {
    const b = inner.getObjectByName(name);
    if (!b) return null;
    const q = qInner.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())).invert();   // модель → кость
    // плюс вокруг оси side — наклон вперёд, сгиб колена назад
    const side = new THREE.Vector3(-Math.cos(BOSS_FACE), 0, Math.sin(BOSS_FACE)), fwd = new THREE.Vector3(Math.sin(BOSS_FACE), 0, Math.cos(BOSS_FACE));
    return { b, rest: b.quaternion.clone(), x: side.applyQuaternion(q), y: new THREE.Vector3(0, 1, 0).applyQuaternion(q), z: fwd.applyQuaternion(q) };
  };
  const names = ['Hips', 'Spine', 'Spine02', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
  const bones = {};
  for (const n of names) bones[n] = bone(n);
  return { g, inner, mats, bones, baseY: inner.position.y, phase: 0, external: true, sparks: [] };
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function poseBone(k, ax, ay = 0, az = 0) {        // поворот кости от позы покоя вокруг осей модели (X — вбок, Y — вверх, Z — вперёд)
  if (!k) return;
  k.b.quaternion.copy(k.rest);
  if (ax) k.b.quaternion.multiply(_qa.setFromAxisAngle(k.x, ax));
  if (ay) k.b.quaternion.multiply(_qb.setFromAxisAngle(k.y, ay));
  if (az) k.b.quaternion.multiply(_qa.setFromAxisAngle(k.z, az));
}
const ease = (t) => t * t * (3 - 2 * t);
function animateBoss(e, dt, moving) {
  const m = e.rig, B = m.bones;
  if (moving) m.phase += dt * Math.PI * 2 * BOSS_STEPS;      // тяжёлый шаг
  const p = m.phase, s = Math.sin(p), c = Math.cos(p);
  const w = moving ? 1 : .25;                                   // стоит — почти не качается
  // атака: 0..1 — замах вверх, удар вниз, возврат
  let armUp = 0, lean = 0;
  if (e.swing > 0) {
    const t = 1 - e.swing / e.swingDur;
    // торс модели сильно привязан к плечам — руки высоко не поднимаем, удар делаем корпусом:
    // откинулся назад → рухнул вперёд всем телом, руки — небольшим взмахом
    if (t < .5) { const k = ease(t / .5); armUp = -.55 * k; lean = -.22 * k; }
    else if (t < .62) { const k = ease((t - .5) / .12); armUp = -.55 + .75 * k; lean = -.22 + .62 * k; }
    else { const k = ease((t - .62) / .38); armUp = .2 * (1 - k); lean = .4 * (1 - k); }
  }
  const atk = e.swing > 0 ? 1 : 0;
  poseBone(B.LeftUpLeg, -s * .42 * w);
  poseBone(B.RightUpLeg, s * .42 * w);
  poseBone(B.LeftLeg, (.12 + Math.max(0, Math.sin(p - 1.3)) * .75) * w);
  poseBone(B.RightLeg, (.12 + Math.max(0, -Math.sin(p - 1.3)) * .75) * w);
  poseBone(B.LeftArm, atk ? armUp : s * .38 * w, 0, atk ? 0 : -.05);
  poseBone(B.RightArm, atk ? armUp : -s * .38 * w, 0, atk ? 0 : .05);
  poseBone(B.LeftForeArm, atk ? -.25 : -.35 - Math.max(0, s) * .3 * w);
  poseBone(B.RightForeArm, atk ? -.25 : -.35 - Math.max(0, -s) * .3 * w);
  poseBone(B.Spine, (.1 + lean) * (atk || moving ? 1 : .6), s * .1 * w);
  poseBone(B.Spine02, lean * .6, s * .06 * w);
  poseBone(B.Head, -lean * .5 - .05, -s * .08 * w);
  poseBone(B.Hips, 0, -s * .06 * w, c * .05 * w);
  m.inner.position.y = m.baseY + Math.abs(c) * .22 * w - (atk ? Math.max(0, lean) * .25 : 0);
  // шаг касается земли — дрожь (сильнее, если рядом)
  const step = Math.sign(s);
  if (moving && step !== m.lastStep) {
    m.lastStep = step;
    const d = Math.hypot(player.pos.x - e.x, player.pos.z - e.z);
    if (d < 28) shake = Math.max(shake, .25 * (1 - d / 28));
  }
}
function removeEnemyObj(e) {
  scene.remove(e.obj);
  if (e.rig && e.rig.external) for (const s of e.rig.sparks) scene.remove(s);
}

const handPos = new THREE.Vector3();
function animateRunner(e, dt) {
  if (e.rig.external) {
    const m = e.rig, k = e.obj.scale.x;
    m.action.timeScale = e.speed / (KAMI_CLIP_SPEED * (KAMI_HEIGHT / KAMI.srcH) * k);
    m.mixer.update(dt);
    m.hands.forEach((hand, i) => {
      hand.getWorldPosition(handPos);
      m.sparks[i].position.set(handPos.x, handPos.y + .34 * k, handPos.z);
      const s = rand(.22, .46) * k; m.sparks[i].scale.set(s, s, 1);
      m.sparks[i].material.rotation = rand(0, Math.PI * 2);
    });
    return;
  }
  const m = e.rig, p = (e.run += dt * e.speed * 1.25);
  const s = Math.sin(p), c = Math.cos(p);
  m.legs[0].rotation.x = s * .85;  m.legs[1].rotation.x = -s * .85;
  m.knees[0].rotation.x = -(.15 + Math.max(0, -Math.sin(p + .7)) * 1.3);
  m.knees[1].rotation.x = -(.15 + Math.max(0, Math.sin(p + .7)) * 1.3);
  m.arms[0].rotation.x = s * .3;   m.arms[1].rotation.x = -s * .3;
  m.elbows[0].rotation.z = -.45 + c * .12; m.elbows[1].rotation.z = .45 - c * .12;
  m.body.position.y = .98 + Math.abs(c) * .09;
  m.body.rotation.x = -.2;
  m.body.rotation.z = s * .05;
  for (const sp of m.sparks) {
    const k = rand(.22, .46);
    sp.scale.set(k, k, 1);
    if (sp.material) sp.material.rotation = rand(0, Math.PI * 2);
  }
}

const swanMat = {
  white: new THREE.MeshLambertMaterial({ color: '#f4f2ec' }),
  tire: new THREE.MeshLambertMaterial({ color: '#1d1d20' }),
  beak: new THREE.MeshLambertMaterial({ color: '#e5521f' }),
  eye: new THREE.MeshBasicMaterial({ color: '#111' }),
  gold: new THREE.MeshLambertMaterial({ color: '#ffcf3d', emissive: '#4a3000' }),
};
const SG = {
  tire: new THREE.TorusGeometry(.62, .23, 10, 22).rotateX(Math.PI / 2),
  body: new THREE.SphereGeometry(.55, 14, 10),
  wing: new THREE.SphereGeometry(.5, 10, 8),
  tail: new THREE.ConeGeometry(.22, .6, 8),
  neck: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, .72, -.38), V(0, 1.15, -.64), V(0, 1.55, -.45), V(0, 1.8, -.56)]), 18, .085, 8),
  head: new THREE.SphereGeometry(.15, 12, 10),
  beak: new THREE.ConeGeometry(.055, .24, 8).rotateX(-Math.PI / 2),
  eye: new THREE.SphereGeometry(.03, 6, 6),
  crown: new THREE.CylinderGeometry(.14, .12, .1, 10, 1, true),
  spike: new THREE.ConeGeometry(.035, .1, 5),
};

function makeSwanMesh(boss) {
  const g = new THREE.Group();
  const white = swanMat.white.clone();
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
  };
  add(SG.tire, swanMat.tire, 0, .23, 0);
  add(SG.body, white, 0, .62, 0, 1, .62, 1.3);
  add(SG.wing, white, -.47, .82, .12, .16, .44, .74).rotation.z = .5;
  add(SG.wing, white, .47, .82, .12, .16, .44, .74).rotation.z = -.5;
  add(SG.tail, white, 0, .88, .72).rotation.x = .95;
  add(SG.neck, white, 0, 0, 0);
  add(SG.head, white, 0, 1.82, -.62);
  add(SG.beak, swanMat.beak, 0, 1.78, -.82);
  add(SG.eye, swanMat.eye, -.095, 1.87, -.7);
  add(SG.eye, swanMat.eye, .095, 1.87, -.7);
  if (boss) {
    add(SG.crown, swanMat.gold, 0, 2.0, -.6);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      add(SG.spike, swanMat.gold, Math.cos(a) * .13, 2.09, -.6 + Math.sin(a) * .13);
    }
  }
  return { g, white };
}

/* ═════════════ Состояние игры ═════════════ */

const EYE = 1.7;
const player = { pos: V(0, 0, 0), vel: V(0, 0, 0), yaw: 0, pitch: 0, hp: 100, onGround: true };
const ammo = { shells: 50, bullets: 300 };
const AMMO_MAX = { shells: 99, bullets: 600 };
let cur = 0, score = 0, kills = 0, wave = 0, time = 0;
let state = 'loading';                     // loading | menu | playing | paused | over
let waveState = 'idle', waveT = 0, spawnT = 0, spawnQueue = [];
let shake = 0, hurtA = 0, fireCd = 0, spin = 0, kick = 0, switchT = 0, pumpT = 0;
let swayX = 0, swayY = 0, bobT = 0, firing = false, jumpReq = false;
let autoFire = false, lookDragAt = -99, moveYawOff = 0;   // автоприцел на телефоне
const enemies = [], pickups = [];
let tripLeft = [], tripGot = 0;

/* Вещи для сборов в отпуск: выпадают из врагов, при подборе герой говорит реплику.
   Озвучка: положите файл assets/voice/<file>.mp3 — подхватится сам; без файла будет только субтитр. */
const TRIP_ITEMS = [
  { file: 'visa',       icon: '🛂', name: 'Виза',       line: 'Виза есть — можно и ехать' },
  { file: 'passport',   icon: '📕', name: 'Паспорт',    line: 'Паспорт проверил — он на месте' },
  { file: 'pills',      icon: '💊', name: 'Таблетки',   line: 'Таблетки от поноса есть' },
  { file: 'keys',       icon: '🔑', name: 'Ключи',      line: 'Квартиру проверил — двери закрыты' },
  { file: 'iron',       icon: '♨️', name: 'Утюг',       line: 'Утюг выключил. Точно выключил' },
  { file: 'gas',        icon: '🔥', name: 'Газ',        line: 'Газ перекрыл. Проверил два раза' },
  { file: 'charger',    icon: '🔋', name: 'Зарядка',    line: 'Зарядку от телефона взял' },
  { file: 'adapter',    icon: '🔌', name: 'Переходник', line: 'Переходник для розетки взял' },
  { file: 'tickets',    icon: '🎫', name: 'Билеты',     line: 'Билеты распечатал. На всякий случай дважды' },
  { file: 'insurance',  icon: '📄', name: 'Страховка',  line: 'Страховка есть — теперь можно и рисковать' },
  { file: 'cash',       icon: '💵', name: 'Наличка',    line: 'Наличка на первое время есть' },
  { file: 'sunscreen',  icon: '🧴', name: 'Крем',       line: 'Крем от загара есть — не сгорю' },
  { file: 'sunglasses', icon: '🕶️', name: 'Очки',       line: 'Очки взял. Солнце, держись' },
  { file: 'swimsuit',   icon: '🩲', name: 'Плавки',     line: 'Плавки на месте. Без них никуда' },
  { file: 'flipflops',  icon: '🩴', name: 'Шлёпанцы',   line: 'Шлёпанцы взял. Оба' },
  { file: 'cat',        icon: '🐈', name: 'Кот',        line: 'Кота пристроил к соседям' },
  { file: 'plant',      icon: '🪴', name: 'Цветы',      line: 'Цветы полил. На две недели вперёд' },
  { file: 'form',       icon: '📝', name: 'Заявление',  line: 'Заявление на отпуск подписано' },
];
const TRIP_DONE = { file: 'all-packed', line: 'Всё собрал. Отпуск, я иду!', prio: 3 };
TRIP_ITEMS.forEach((t) => { t.prio = 3; });

const WAVE_TITLES = [
  'Справка о справке',
  'Лебеди требуют прописку',
  'Очередь в МФЦ',
  'ЖЭК наносит ответный удар',
  'Начальник на связи',
  'Обед до 14:00',
  'Опять не та печать',
  'Собрание ТСЖ',
  'Плановое отключение воды',
  'Последняя инстанция',
];

/* ═════════════ Ввод ═════════════ */

const keys = {};
const touchMove = { x: 0, y: 0, len: 0 };
let locked = false;

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state === 'paused' && e.code === 'KeyP') { resume(); return; }
  if (state !== 'playing') return;
  if (e.code === 'Digit1') selectWeapon(0);
  if (e.code === 'Digit2') selectWeapon(1);
  if (e.code === 'KeyQ') selectWeapon(1 - cur);
  if (e.code === 'KeyM') Snd.toggle();
  if (e.code === 'KeyP') pause();
  if (e.code === 'Space') { jumpReq = true; e.preventDefault(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let autoPause = true;   // отключается только в режиме ?debug
addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; if (state === 'playing' && autoPause) pause(); });

addEventListener('mousemove', (e) => {
  if (state !== 'playing' || isTouch) return;
  if (!locked && !lockFailed) return;
  const s = .0022;
  look(e.movementX * s, e.movementY * s);
});
$('btnPause').addEventListener('click', () => pause());
addEventListener('mousedown', (e) => {
  if (state !== 'playing' || isTouch || e.button !== 0) return;
  if (e.target.closest && e.target.closest('.pause-btn')) return;
  if (!locked && !lockFailed) { lock(); return; }
  firing = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
addEventListener('wheel', (e) => { if (state === 'playing') selectWeapon(e.deltaY > 0 ? 1 : 0); }, { passive: true });
addEventListener('contextmenu', (e) => { if (state === 'playing') e.preventDefault(); });

function look(dx, dy) {
  player.yaw -= dx;
  player.pitch = clamp(player.pitch - dy, -1.45, 1.45);
  swayX = clamp(swayX - dx * 1.6, -.06, .06);
  swayY = clamp(swayY + dy * 1.6, -.05, .05);
}

let lockFailed = false;
function lock() {
  if (isTouch || !canvas.requestPointerLock) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { lockFailed = true; });
  } catch (err) { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) lockFailed = false;
  if (!locked && state === 'playing' && autoPause) pause();
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && autoPause) pause(); });

// тач
if (isTouch) {
  const layer = $('touch'), stickEl = $('stick'), knob = $('knob');
  const stick = { id: null, x: 0, y: 0 }, lookP = { id: null, x: 0, y: 0 };
  layer.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || e.target.closest('.tbtn')) return;
    if (e.clientX < innerWidth * .45 && stick.id === null) {
      stick.id = e.pointerId; stick.x = e.clientX; stick.y = e.clientY;
      stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
      stickEl.classList.add('is-on');
      try { layer.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (lookP.id === null) {
      lookP.id = e.pointerId; lookP.x = e.clientX; lookP.y = e.clientY;
      try { layer.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      let dx = (e.clientX - stick.x) / 48, dy = (e.clientY - stick.y) / 48;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      touchMove.x = dx; touchMove.y = -dy; touchMove.len = Math.min(l, 1);
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    } else if (e.pointerId === lookP.id) {
      look((e.clientX - lookP.x) * .0055, (e.clientY - lookP.y) * .0055);
      lookP.x = e.clientX; lookP.y = e.clientY;
      lookDragAt = time;
    }
  });
  const end = (e) => {
    if (e.pointerId === stick.id) {
      stick.id = null; touchMove.x = touchMove.y = touchMove.len = 0;
      knob.style.transform = ''; stickEl.classList.remove('is-on');
      stickEl.style.left = stickEl.style.top = '';      // обратно в угол, как подсказка
    }
    if (e.pointerId === lookP.id) lookP.id = null;
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.add('is-down'); on(); });
    const up = () => { el.classList.remove('is-down'); if (off) off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  };
  hold($('tFire'), () => { firing = true; }, () => { firing = false; });
  hold($('tJump'), () => { jumpReq = true; });
  hold($('tSwap'), () => selectWeapon(1 - cur));
  hold($('tPause'), () => pause());
}

/* ═════════════ HUD ═════════════ */

const hud = { trip: $('trip'), wave: $('wave'), left: $('left'), score: $('score'), hp: $('hp'), ammo: $('ammo'), wname: $('wname') };
function setText(el, v) { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } }
function bump(el) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
const crosshair = $('crosshair');
let chT = 0;
function hitMark(kill) {
  crosshair.classList.add(kill ? 'is-kill' : 'is-hit');
  chT = kill ? .22 : .09;
}
const speech = $('speech');
let speechT = 0;
const voice = new Audio();
voice.preload = 'auto';
const speechImg = speech.querySelector('img');
const speechWho = speech.querySelector('b');
const speechText = speech.querySelector('p');
/* Озвучка: реплики идут по очереди и не обрывают друг друга.
   Файлы — assets/voice-game/<file>.mp3 (готовит tools/prepare_voice.py из assets/voice).
   Важность: 3 — сборы, 2 — ответы героя, 1 — крики зазывал. Неважное при занятой очереди выкидывается. */
const VOICE_DIR = 'assets/voice-game/';
const voiceOk = {};                       // file → true (есть) | false (нет файла)
function probeVoice(file) {               // заранее узнаём, есть ли файл, чтобы пустышка не занимала очередь
  if (!file || file in voiceOk) return;
  voiceOk[file] = null;
  const a = new Audio(); a.preload = 'metadata';
  a.addEventListener('loadedmetadata', () => { voiceOk[file] = true; }, { once: true });
  a.addEventListener('error', () => { voiceOk[file] = false; }, { once: true });
  a.src = VOICE_DIR + file + '.mp3';
}
/* Режиссёр реплик: говорит всегда кто-то один.
   — Очередь «сцен»: сцена = одна реплика или диалог (продавец → ответ героя), диалог не разрывается.
   — Между репликами одного диалога пауза .45 с, между разными сценами — 1 с (другой говорящий — 1.3 с).
   — Выкрики зазывал (bark) звучат, только если эфир свободен; иначе просто пропускаются, а не копятся.
   — Важность: 3 — сборы, 2 — герой, 1 — реакции NPC. Устаревшие реакции не догоняем. */
const SPEAKER = { hero: 'Вы', corn: 'Продавец кукурузы', photo: 'Фотограф', flyer: 'Промоутер', anim: 'Аниматор' };
const speechQ = [];
let speechCur = null, speechScene = null, voiceBusy = false, voiceTimer = 0, pumpWait = false;
let speechFree = -99;                    // когда эфир освободился (time)
let lastWho = null;
const STALE = { 1: 5, 2: 8 };            // через сколько секунд реплику уже поздно говорить
function sceneOf(lines) {
  lines = lines.filter(Boolean);
  if (!lines.length) return null;
  return { lines, prio: Math.max(...lines.map((l) => l.prio || (l.who === 'npc' ? 1 : 2))), at: time };
}
function sameLine(a, b) { return a && b && a.line === b.line; }
function queued(item) {
  return sameLine(speechCur, item) || speechQ.some((sc) => sc.lines.some((l) => sameLine(l, item))) ||
    (speechScene && speechScene.lines.some((l) => sameLine(l, item)));
}
function enqueue(sc) {
  if (!sc || sc.lines.some(queued)) return false;
  speechQ.push(sc);
  speechQ.sort((a, b) => b.prio - a.prio || a.at - b.at);   // важное вперёд, внутри важности — по порядку
  while (speechQ.length > 3) speechQ.pop();
  if (!speechCur && !speechScene && !pumpWait) pump();   // во время паузы между сценами ждём таймер
  return speechQ.includes(sc) || speechScene === sc;
}
function sayScene(lines, onDone) {        // сцена с отметкой «договорили» — для сценария босса
  const sc = sceneOf(lines);
  if (!sc) return false;
  sc.prio = 3; sc.onDone = onDone;         // важная: не устаревает и не вылетает из очереди
  return enqueue(sc);
}
function say(item) { enqueue(sceneOf([item])); }
function sayDialog(...lines) { enqueue(sceneOf(lines)); }
function bark(item) {                    // выкрик «в воздух»: только в тишине
  if (!item || speechCur || speechScene || pumpWait || speechQ.length || time - speechFree < 2) return false;
  say(item); return true;
}
function pump() {                        // следующая сцена из очереди
  clearTimeout(voiceTimer); pumpWait = false;
  if (state !== 'playing') return;
  while (speechQ.length) {
    const sc = speechQ.shift();
    if (sc.prio < 3 && time - sc.at > (STALE[sc.prio] || 8)) continue;
    speechScene = sc; sc.i = 0;
    playLine(sc.lines[0]);
    return;
  }
}
function speakerOf(item) {
  if (item.by) return item.by;
  if (!item.who || item.who === 'hero') return SPEAKER.hero;   // у предметов сборов who не задан — это герой
  const k = Object.keys(SPEAKER).find((key) => item.file && item.file.includes(key));
  return SPEAKER[k] || 'Отдыхающий';
}
function playLine(item) {
  speechCur = item;
  speechImg.src = item.face || (item.who === 'npc' ? 'assets/hustler-face.png' : 'assets/hero-face.png');
  speech.classList.toggle('is-npc', item.who === 'npc' || item.who === 'boss');
  speechWho.textContent = speakerOf(item);
  speechText.textContent = `«${item.line}»`;
  speech.classList.remove('is-open'); void speech.offsetWidth;   // новая реплика — пузырь заново «выезжает»
  speech.classList.add('is-open');
  clearTimeout(voiceTimer);
  const finish = () => {
    if (speechCur !== item) return;
    clearTimeout(voiceTimer);
    voiceBusy = false; speechCur = null; lastWho = speakerOf(item);
    const sc = speechScene;
    if (sc && ++sc.i < sc.lines.length) {             // диалог продолжается
      speechT = 99;
      voiceTimer = setTimeout(() => { if (state === 'playing' && speechScene === sc) playLine(sc.lines[sc.i]); }, 450);
      return;
    }
    speechScene = null; speechFree = time;
    if (sc && sc.onDone) sc.onDone();
    speechT = .6;                                       // субтитр ещё чуть-чуть
    const nxt = speechQ[0];
    const gap = nxt && speakerOf(nxt.lines[0]) !== lastWho ? 1300 : 1000;
    pumpWait = true;
    voiceTimer = setTimeout(pump, gap);
  };
  if (!item.file || voiceOk[item.file] === false) {    // нет озвучки — только субтитр
    voiceBusy = false; speechT = 99;
    voiceTimer = setTimeout(finish, 1200 + item.line.length * 45);
    return;
  }
  voiceBusy = true; speechT = 99;
  voice.onended = finish;
  voice.onerror = () => { voiceOk[item.file] = false; voiceBusy = false; voiceTimer = setTimeout(finish, 1800); };
  voice.src = VOICE_DIR + item.file + '.mp3';
  voice.volume = 1;
  const p = voice.play();
  if (p && p.catch) p.catch(() => { voiceBusy = false; voiceTimer = setTimeout(finish, 2000); });
  voiceTimer = setTimeout(finish, 9000);              // на всякий случай: реплика не дольше 9 секунд
}
function stopSpeech() {
  speechQ.length = 0; clearTimeout(voiceTimer);
  voice.pause(); voiceBusy = false; speechCur = null; speechScene = null; pumpWait = false;
  speech.classList.remove('is-open'); speechT = 0;
}
const banner = $('banner');
let bannerT = 0;
function showBanner(title, sub, dur = 2.6) {
  banner.querySelector('b').textContent = title;
  banner.querySelector('span').textContent = sub || '';
  banner.classList.add('is-open');
  bannerT = dur;
}
function updateHud(dt) {
  const W = WEAPONS[cur];
  setText(hud.wave, wave);
  setText(hud.trip, `${tripGot}/${TRIP_ITEMS.length}`);
  setText(hud.left, spawnQueue.length + enemies.length);
  setText(hud.score, score);
  setText(hud.hp, Math.max(0, Math.ceil(player.hp)));
  setText(hud.ammo, ammo[W.ammo]);
  setText(hud.wname, W.name);
  hud.hp.classList.toggle('is-low', player.hp <= 30);
  hud.ammo.classList.toggle('is-low', ammo[W.ammo] <= (cur ? 30 : 5));
  if (chT > 0) { chT -= dt; if (chT <= 0) crosshair.classList.remove('is-hit', 'is-kill'); }
  crosshair.classList.toggle('is-wide', cur === 0);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('is-open'); }
  if (speechT > 0 && state === 'playing') { speechT -= dt; if (speechT <= 0) speech.classList.remove('is-open'); }
  hurtA = Math.max(0, hurtA - dt * 1.6);
  $('hurt').style.opacity = hurtA.toFixed(3);
}

/* ═════════════ Экраны ═════════════ */

const screens = { menu: $('menu'), pause: $('pause'), over: $('over'), win: $('win') };
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('is-open', k === name);
  document.body.classList.toggle('is-playing', state === 'playing');
}
const SCREEN_OF = { playing: null, paused: 'pause' };   // какое окно показать в каждом состоянии
function setState(s) { state = s; showScreen(s in SCREEN_OF ? SCREEN_OF[s] : s); }

function unlockVoice() {           // iOS: элемент озвучки нужно «разбудить» по нажатию
  if (voice._unlocked) return;
  voice._unlocked = true;
  voice.muted = true; voice.src = 'assets/kamikaze-boom.wav';   // любой короткий файл
  const p = voice.play();
  const done = () => { voice.muted = false; if (voice.src.endsWith('kamikaze-boom.wav')) voice.pause(); };   // не глушим уже начавшуюся реплику
  if (p && p.then) p.then(done).catch(done); else done();
}
function startGame() {
  Snd.init();
  unlockVoice(); unlockMusic();
  resetGame();
  startBeach();
  setState('playing');
  lock();
  startWave(1);
}
function pause() {
  if (state !== 'playing') return;
  firing = false;
  Snd.screamStopAll(); musicPause(); stopSpeech();
  setState('paused');
  if (document.pointerLockElement) document.exitPointerLock();
}
function resume() {
  Snd.init();
  setState('playing');
  if (npcs.some((n) => n.kind === 'animator')) musicPlay();
  lock();
}
function gameOver() {
  setState('over');
  firing = false;
  Snd.screamStopAll(); clearBeach();
  if (document.pointerLockElement) document.exitPointerLock();
  $('overText').textContent = `Вы продержались ${wave} ${plural(wave, 'волну', 'волны', 'волн')}, уложили ${kills} ${plural(kills, 'проблему', 'проблемы', 'проблем')} и набрали ${score} очков. Отпуск почти был ваш.`;
}
function winGame() {
  setState('win');
  firing = false;
  Snd.screamStopAll(); clearBeach(); stopSpeech();
  if (document.pointerLockElement) document.exitPointerLock();

  let discountPercent = 10;
  let promoCode = 'LEBED-START-10';
  let tierName = 'Базовая скидка';

  if (score >= 6000) {
    discountPercent = 20;
    promoCode = 'LEBED-VIP-20';
    tierName = 'Максимальная VIP-скидка';
  } else if (score >= 3000) {
    discountPercent = 15;
    promoCode = 'LEBED-SUPER-15';
    tierName = 'Повышенная скидка';
  }

  $('winText').innerHTML = `Вы выдержали все 5 волн, уничтожили ${kills} ${plural(kills, 'проблему', 'проблемы', 'проблем')} и насобирали <b>${score} монет</b>! За такую добычу вам начислена <b>скидка ${discountPercent}%</b> на настоящий отпуск!`;

  const promoTitle = document.querySelector('.win-promo__title');
  if (promoTitle) promoTitle.textContent = `${tierName}: Скидка ${discountPercent}% на отели и перелёты`;

  const promoDesc = document.querySelector('.win-promo__desc');
  if (promoDesc) promoDesc.textContent = `За собранные ${score} монет вам начислена скидка ${discountPercent}%. Оставьте email, и мы отправим персональный промокод:`;

  setupWinPromo(promoCode, discountPercent);
}

function setupWinPromo(promoCode = 'LEBED-START-10', discountPercent = 10) {
  const form = $('winForm');
  const input = $('emailInput');
  const errEl = $('emailError');
  const successEl = $('winSuccess');
  const sentLabel = $('sentEmailLabel');
  const codeVal = $('promoCodeVal');
  const btnCopy = $('btnCopyCode');

  if (codeVal) codeVal.textContent = promoCode;

  try {
    const savedEmail = localStorage.getItem('aviasales_promo_email');
    if (savedEmail && input) input.value = savedEmail;
  } catch (_) {}

  if (input) {
    input.classList.remove('is-invalid');
    input.onkeydown = (e) => e.stopPropagation();
  }
  if (errEl) errEl.textContent = '';

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const email = input ? input.value.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!email || !emailRegex.test(email)) {
        if (input) { input.classList.add('is-invalid'); input.focus(); }
        if (errEl) errEl.textContent = 'Укажите корректный email (например, name@mail.ru)';
        return;
      }
      if (input) input.classList.remove('is-invalid');
      if (errEl) errEl.textContent = '';

      try {
        localStorage.setItem('aviasales_promo_email', email);
      } catch (_) {}

      if (sentLabel) sentLabel.textContent = email;
      form.style.display = 'none';
      if (successEl) successEl.classList.remove('is-hidden');
      Snd.pickup();
    };
  }

  if (btnCopy) {
    btnCopy.onclick = () => {
      const copyText = (codeVal && codeVal.textContent) || promoCode;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(onCopied).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        const ta = document.createElement('textarea');
        ta.value = copyText;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
        onCopied();
      }
      function onCopied() {
        btnCopy.textContent = 'Скопировано! ✓';
        btnCopy.classList.add('is-copied');
        setTimeout(() => {
          btnCopy.textContent = 'Скопировать';
          btnCopy.classList.remove('is-copied');
        }, 2500);
      }
    };
  }
}

function resetPromoForm() {
  const form = $('winForm');
  const input = $('emailInput');
  const errEl = $('emailError');
  const successEl = $('winSuccess');
  if (form) form.style.display = '';
  if (input) input.classList.remove('is-invalid');
  if (errEl) errEl.textContent = '';
  if (successEl) successEl.classList.add('is-hidden');
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}
$('btnStart').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resume);
$('btnRestart').addEventListener('click', startGame);
$('btnWinRestart').addEventListener('click', startGame);

function resetGame() {
  for (const e of enemies) { e.dead = true; removeEnemyObj(e); }
  for (const p of pickups) scene.remove(p.s);
  Snd.screamStopAll();
  enemies.length = pickups.length = 0;
  spawnQueue = [];
  player.pos.set(0, H(0, 0), 0); player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0; player.hp = 100;
  ammo.shells = 50; ammo.bullets = 300;
  score = kills = wave = 0; time = 0;
  cornHeroAt = speechFree = foodSaid = duckHold = -99;   // таймеры реплик считаются от time — сбрасываем вместе с ним
  tripLeft = TRIP_ITEMS.slice(); tripGot = 0;
  stopSpeech();
  resetPromoForm();
  hurtA = shake = 0;
  clearBeach();
  selectWeapon(0, true);
}

/* ═════════════ Волны ═════════════ */

function startWave(n) {
  wave = n;
  const runners = 4 + n * 2, swans = n >= 2 ? n - 1 : 0;
  const q = [];
  for (let i = 0; i < runners; i++) q.push('runner');
  for (let i = 0; i < swans; i++) q.push('swan');
  for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
  if (n % 5 === 0) q.push('boss');
  spawnQueue = q;
  waveState = 'fight';
  spawnT = 1.4;
  showBanner(`Волна ${n}`, WAVE_TITLES[(n - 1) % WAVE_TITLES.length]);
}

function updateWaves(dt) {
  if (waveState === 'fight') {
    spawnT -= dt;
    if (spawnT <= 0 && spawnQueue.length && enemies.length < 22) {
      const type = spawnQueue.shift();
      const spot = spawnPoint();
      spawnEnemy(type, spot.x, spot.z);
      // безголовые приходят пачками
      let extra = 0;
      while (type === 'runner' && extra < 2 && spawnQueue[0] === 'runner' && Math.random() < .6) {
        spawnQueue.shift(); extra++;
        spawnEnemy('runner', spot.x + rand(-5, 5), spot.z + rand(-5, 5));
      }
      spawnT = Math.max(.6, 1.7 - wave * .06) * rand(.7, 1.4);
    }
    if (!spawnQueue.length && !enemies.length) {
      if (wave >= 5) {
        waveState = 'won';
        waveT = 5;                       // успеть дослушать последние слова начальника
        player.hp = 100;
        showBanner('ИГРА ПРОЙДЕНА!', 'Все 5 уровней позади. Отпуск ваш!', 3.2);
        Snd.win();
        return;
      }
      waveState = 'rest'; waveT = 4.2;
      player.hp = Math.min(100, player.hp + 40);
      showBanner('Волна пройдена', '+40 к здоровью. Проблемы отложены до завтра', 2.6);
    }
  } else if (waveState === 'won') {
    waveT -= dt;
    if (waveT <= 0) winGame();
  } else if (waveState === 'rest') {
    waveT -= dt;
    if (waveT <= 0) startWave(wave + 1);
  }
}

function spawnPoint() {
  for (let tries = 0; tries < 12; tries++) {
    const a = rand(0, Math.PI * 2), d = rand(60, 100);
    let x = player.pos.x + Math.cos(a) * d, z = player.pos.z + Math.sin(a) * d;
    const r = Math.hypot(x, z);
    if (r > ARENA - 4) { x *= (ARENA - 4) / r; z *= (ARENA - 4) / r; }
    if (Math.hypot(x - player.pos.x, z - player.pos.z) > 40) return { x, z };
  }
  return { x: -player.pos.x * .9, z: -player.pos.z * .9 + 60 };
}

/* ═════════════ Враги ═════════════ */

function spawnEnemy(type, x, z) {
  let e;
  if (type === 'runner') {
    const rig = KAMI ? makeKamikaze() : makeRunnerMesh();
    rig.g.scale.setScalar(rand(.98, 1.1));
    e = { obj: rig.g, rig, mats: rig.mats || [rig.skin], hp: 28 + wave * 2.5, speed: Math.min(6.2 + wave * .3, 10) * rand(.88, 1.12), r: .6, screamed: false, run: rand(0, 6), score: 100 };
  } else if (type === 'boss' && BOSS) {
    const rig = makeBoss();
    e = { obj: rig.g, rig, mats: rig.mats, boss: true, chief: true, sc: 1, hp: 900 + wave * 60, speed: 4.6, r: 1.3,
      attackCd: 1.5, swing: 0, swingDur: 1.35, step: 0, stepBusy: false, stepT: .8, stepAt: 0, shieldMsgAt: -99, score: 3000 };
    showBanner('Начальник отдела', 'Звонит прямо в отпуск. Не бери трубку!', 3);
  } else {
    const boss = type === 'boss';
    const m = makeSwanMesh(boss);
    const sc = boss ? 3.2 : rand(1.25, 1.45);
    m.g.scale.setScalar(sc);
    e = { obj: m.g, white: m.white, boss, sc, hp: boss ? 700 + wave * 50 : 65 + wave * 5, speed: boss ? 3.4 : rand(3.8, 4.8), r: .8 * sc, biteCd: .5, hopT: rand(0, 6), honkT: rand(1, 4), score: boss ? 3000 : 250 };
    if (boss) { showBanner('Главный лебедь района', 'Требует предъявить паспорт и СНИЛС', 2.8); Snd.honk(1); }
  }
  e.type = type; e.x = x; e.z = z; e.y = H(x, z); e.seed = rand(0, 100); e.flash = 0; e.kx = 0; e.kz = 0;
  e.maxHp = e.hp;
  e.obj.position.set(x, e.y, z);
  scene.add(e.obj);
  enemies.push(e);
}

function updateEnemies(dt) {
  const px = player.pos.x, pz = player.pos.z;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || .001;
    let ux = dx / d, uz = dz / d, hop = 0;

    if (e.type === 'runner') {
      const zig = d > 9 ? Math.sin(time * 2.4 + e.seed) * .45 : 0;
      const c = Math.cos(zig), s = Math.sin(zig);
      const vx = ux * c - uz * s, vz = ux * s + uz * c;
      e.x += vx * e.speed * dt; e.z += vz * e.speed * dt;
      e.obj.rotation.y = Math.atan2(-vx, -vz);
      animateRunner(e, dt);
      if (!e.screamed && d < 30) { e.screamed = true; e.audio = Snd.screamStart(e, clamp(1.15 - d / 30, .3, 1)); }
      if (e.audio) Snd.screamVol(e.audio, e, clamp(1.15 - d / 30, .3, 1));
      if (d < 1.55) { killEnemy(e, false); continue; }
    } else if (e.chief) {
      updateChief(e, dt, d, ux, uz);
    } else {
      e.hopT += dt * (e.boss ? 3.2 : 5.5);
      const ph = Math.abs(Math.sin(e.hopT));
      hop = ph * (e.boss ? 1.1 : .55);
      const reach = e.r + .9;
      if (d > reach) {
        const sp = e.speed * (.35 + ph * .9);
        e.x += ux * sp * dt; e.z += uz * sp * dt;
      }
      e.obj.rotation.y = Math.atan2(-dx, -dz);
      e.obj.rotation.z = Math.sin(e.hopT) * .08;
      e.honkT -= dt;
      if (e.honkT <= 0) { e.honkT = rand(2.5, 6); if (d < 45) Snd.honk(clamp(1 - d / 45, .15, 1)); }
      if (d < reach + .3) {
        e.biteCd -= dt;
        if (e.biteCd <= 0) { e.biteCd = e.boss ? 1.1 : .85; hurtPlayer(e.boss ? 16 : 6); Snd.honk(.8); }
      }
      if (e.flash > 0) e.white.emissive.setScalar(e.flash * 5); else e.white.emissive.setScalar(0);
    }

    // отброс от попаданий
    e.x += e.kx * dt; e.z += e.kz * dt;
    e.kx *= Math.pow(.02, dt); e.kz *= Math.pow(.02, dt);

    // не налезать друг на друга и на колонны
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const o = enemies[j], ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = (e.r + o.r) * .85;
      if (od > 0 && od < min) { const k = (min - od) * .5 / od; e.x += ox * k; e.z += oz * k; }
    }
    pushOut(e, e.r);

    const r = Math.hypot(e.x, e.z);
    if (r > ARENA + 30) { e.x *= (ARENA + 30) / r; e.z *= (ARENA + 30) / r; }

    if (e.flash > 0) {
      e.flash -= dt;
      if (e.type === 'runner' || e.chief) for (const m of e.mats) m.emissive.setScalar(e.flash > 0 ? e.flash * (e.chief ? 3 : 6) : 0);
    }
    e.y = H(e.x, e.z);
    e.obj.position.set(e.x, e.y + hop, e.z);
  }
}

function updateChief(e, dt, d, ux, uz) {
  const reach = 6.5;                          // бьёт издалека ударной волной — так он виден в кадре целиком
  e.obj.rotation.y = Math.atan2(-ux, -uz);
  if (e.pose != null) { e.swing = e.swingDur * (1 - e.pose); animateBoss(e, 0, false); return; }   // отладка: замереть в фазе удара
  e.attackCd -= dt;
  let moving = false;
  if (e.swing > 0) {                          // удар двумя руками сверху; урон — в момент удара о землю
    e.swing -= dt;
    if (!e.hitDone && e.swing <= e.swingDur * .42) {
      e.hitDone = true;
      shake = Math.max(shake, .6);
      Snd.boom(.5);
      const fx = -Math.sin(e.obj.rotation.y), fz = -Math.cos(e.obj.rotation.y);
      for (let k = 1; k <= 3; k++) emit(e.x + fx * 2.2 * k, e.y + .2, e.z + fz * 2.2 * k, 30, ['#d8c39a', '#b89a66', '#8a7450'], 7, 3, .9);   // волна пыли к игроку
      const dp = Math.hypot(player.pos.x - e.x, player.pos.z - e.z);
      if (dp < reach + 1.5) { hurtPlayer(18); if (time - (e.hitSaidAt || -99) > 15 && bark(pick(BOSS_HITS))) e.hitSaidAt = time; }   // изредка и только в тишине
    }
  } else if (d > reach) {
    moving = true;
    e.x += ux * e.speed * dt; e.z += uz * e.speed * dt;
  } else if (e.attackCd <= 0) {
    e.attackCd = 2.4; e.hitDone = false;
    e.swing = e.swingDur = 1.35;
  }
  animateBoss(e, dt, moving);
  bossScript(e, dt);
}
/* Сценарий Начальника: все реплики по порядку, каждая один раз.
   Пока он не договорил, убить его нельзя — здоровье не падает ниже «порога» текущего шага.
   Если игрок уже упёрся в порог, следующая реплика идёт сразу, без паузы. */
function bossFloor(e) { return e.maxHp * (BOSS_SCRIPT.length - e.step) / (BOSS_SCRIPT.length + 1); }
function bossScript(e, dt) {
  if (e.step >= BOSS_SCRIPT.length) return;
  if (e.stepBusy) {
    if (time - e.stepAt > 20) { e.stepBusy = false; e.step++; e.stepT = 1; }   // страховка: реплика потерялась
    return;
  }
  if (e.hp <= bossFloor(e) + 1) e.stepT = Math.min(e.stepT, .4);
  e.stepT -= dt;
  if (e.stepT > 0) return;
  const lines = BOSS_SCRIPT[e.step];
  const ok = sayScene(lines, () => { if (e.stepBusy) { e.stepBusy = false; e.step++; e.stepT = 2.5; } });
  if (ok) { e.stepBusy = true; e.stepAt = time; } else { e.step++; e.stepT = 1; }
}

function pushOut(o, r) {
  for (const c of colliders) {
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
    if (d < min && d > 0) { o.x = c.x + dx / d * min; o.z = c.z + dz / d * min; }
  }
}

function hitSpheres(e) {
  if (e.type === 'runner') {
    const p = e.obj.position, k = e.obj.scale.x;
    return [[p.x, p.y + 1.4 * k, p.z, .5 * k], [p.x, p.y + .7 * k, p.z, .4 * k], [p.x, p.y + 2.15 * k, p.z, .45 * k]];
  }
  if (e.chief) {
    const p = e.obj.position, H0 = BOSS_HEIGHT;
    return [[p.x, p.y + .28 * H0, p.z, .2 * H0], [p.x, p.y + .55 * H0, p.z, .24 * H0], [p.x, p.y + .8 * H0, p.z, .2 * H0]];
  }
  const s = e.sc, fx = -Math.sin(e.obj.rotation.y), fz = -Math.cos(e.obj.rotation.y), p = e.obj.position;
  return [[p.x, p.y + .6 * s, p.z, .78 * s], [p.x + fx * .55 * s, p.y + 1.7 * s, p.z + fz * .55 * s, .38 * s], [p.x + fx * .45 * s, p.y + 1.2 * s, p.z + fz * .45 * s, .3 * s]];
}

function damageEnemy(e, dmg, dir) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = .08;
  if (e.chief) {
    const floor = bossFloor(e);
    if (floor > 0 && e.hp <= floor) {
      e.hp = floor; e.flash = .03;            // бронирован, пока не договорит
      if (time - e.shieldMsgAt > 12) { e.shieldMsgAt = time; showBanner('Начальник ещё не договорил', 'Дослушай — потом добивай', 1.6); }
    }
  }
  const push = e.type === 'runner' ? 7 : (e.boss ? .4 : 2.2);
  if (dir) { e.kx += dir.x * push * (dmg / 12); e.kz += dir.z * push * (dmg / 12); }
  if (e.hp <= 0) killEnemy(e, true);
}

function killEnemy(e, byPlayer) {
  if (e.dead) return;
  e.dead = true;
  if (e.audio) Snd.screamStop(e.audio, e);
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  removeEnemyObj(e);
  const x = e.x, y = e.y, z = e.z;

  if (e.type === 'runner') {
    emitExplosion(x, y + 1.2, z, false);
    const dp = Math.hypot(player.pos.x - x, player.pos.z - z);
    Snd.kamikazeBoom(clamp(1.1 - dp / 60, .25, 1));
    shake = Math.max(shake, clamp(1 - dp / 25, 0, 1) * .6);
    if (dp < 5) hurtPlayer(byPlayer ? 16 * (1 - dp / 5) + 2 : 15);
    // взрыв задевает соседей — цепная реакция
    for (const o of enemies.slice()) {
      const od = Math.hypot(o.x - x, o.z - z);
      if (od < 5.5) setTimeout(() => damageEnemy(o, 75 * (1 - od / 5.5) + 15, { x: (o.x - x) / (od || 1), z: (o.z - z) / (od || 1) }), 70 + od * 25);
    }
  } else if (e.chief) {
    emit(x, y + 2.5, z, 220, ['#6b4a6e', '#8c6a8f', '#3b2a3d', '#f4e6b8'], 14, 5, 1.4);   // клочья и бумажки
    emit(x, y + 3, z, 120, ['#ffffff', '#f2efe6'], 10, 2, 2.2);
    emitExplosion(x, y + 3, z, true); Snd.boom(1); shake = .9;
    showBanner('Начальник повержен', 'Телефон в авиарежим. Отпуск спасён', 3);
    sayDialog(LINES.bossDead, LINES.heroBoss2);
  } else {
    const n = e.boss ? 180 : 55;
    emit(x, y + 1 * e.sc, z, n, ['#ffffff', '#f1eee6', '#dcd7cc'], e.boss ? 14 : 8, 4, 1.3);
    emit(x, y + .3 * e.sc, z, n / 2, ['#1d1d20', '#2b2b30'], e.boss ? 12 : 7, 5, 1);
    Snd.pop();
    if (e.boss) { emitExplosion(x, y + 3, z, true); Snd.boom(1); shake = .8; showBanner('Главный лебедь повержен', 'Район свободен. До следующего собрания', 2.6); }
  }

  if (byPlayer) {
    score += e.score; kills++;
    hitMark(true);
    bump(hud.score);
    // бонусы
    const coins = e.boss ? 12 : (Math.random() < .55 ? 1 : 0);
    for (let k = 0; k < coins; k++) dropPickup('coin', x + rand(-1.5, 1.5) * (e.boss ? 3 : 1), z + rand(-1.5, 1.5) * (e.boss ? 3 : 1));
    if (Math.random() < (player.hp < 60 ? .3 : .15) || e.boss) dropPickup('heart', x + rand(-1, 1), z + rand(-1, 1));
    if (Math.random() < .35 || e.boss) dropPickup('ammo', x + rand(-1, 1), z + rand(-1, 1));
    const tripChance = e.boss ? 1 : e.type === 'swan' ? .5 : .3;
    if (tripLeft.length && Math.random() < tripChance && !pickups.some((p) => p.kind === 'trip' && p.life > 20)) {
      const item = tripLeft.splice((Math.random() * tripLeft.length) | 0, 1)[0];
      dropPickup('trip', x + rand(-.8, .8), z + rand(-.8, .8), item);
    }
  }
}

/* ═════════════ Бонусы ═════════════ */

// еда «всё включено»: лечит +30, иногда герой комментирует
const FOOD = [
  { id: 'burger', emoji: '🍔', line: { who: 'hero', file: 'hero-burger', line: 'Бургер со шведского стола — это святое' } },
  { id: 'pizza',  emoji: '🍕', line: { who: 'hero', file: 'hero-pizza',  line: 'Пицца на пляже. Вот это я понимаю отдых' } },
  { id: 'beer',   emoji: '🍺', line: { who: 'hero', file: 'hero-beer',   line: 'Пиво тёплое, зато бесплатное' } },
];
let foodSaid = -99;
const emojiCanvas = (e) => drawCanvas(160, 160, (g) => {
  g.font = '130px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 80, 88);
});

const tripMats = {};
function tripMat(item) {           // бирка: иконка + название
  if (!tripMats[item.file]) {
    const c = drawCanvas(256, 160, (g, w, h) => {
      g.fillStyle = '#f6efdc'; roundRect(g, 6, 10, w - 12, h - 20, 22);
      g.strokeStyle = '#ffb83d'; g.lineWidth = 8; g.beginPath(); g.roundRect ? g.roundRect(10, 14, w - 20, h - 28, 18) : g.rect(10, 14, w - 20, h - 28); g.stroke();
      g.fillStyle = '#241709'; g.beginPath(); g.arc(30, h / 2, 9, 0, Math.PI * 2); g.fill();   // дырочка бирки
      g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(item.icon, w / 2 + 10, 62);
      g.fillStyle = '#241709'; g.font = 'bold 30px Arial';
      g.fillText(item.name.toUpperCase(), w / 2 + 10, 124);
    });
    tripMats[item.file] = new THREE.SpriteMaterial({ map: tex(c), alphaTest: .3 });
  }
  return tripMats[item.file];
}
function dropPickup(kind, x, z, item) {
  // вместо сердечек — еда: бургер, пицца или пиво (лечат одинаково)
  if (kind === 'heart') item = item || pick(FOOD);
  const mat = kind === 'trip' ? tripMat(item) : kind === 'heart' && item ? pickMats.food[FOOD.indexOf(item)] : pickMats[kind];
  const s = new THREE.Sprite(mat);
  s.center.set(.5, 0);
  const size = kind === 'ammo' ? 1.2 : kind === 'trip' ? 1.5 : .95;
  s.scale.set(size, kind === 'ammo' ? size * .875 : kind === 'trip' ? size * .625 : size, 1);
  scene.add(s);
  pickups.push({ kind, s, x, z, t: rand(0, 3), life: kind === 'trip' ? 40 : 25, size, item });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz);
    const canTake = !(p.kind === 'heart' && player.hp >= 100);     // еду при полном здоровье не берём
    // магнит: на телефоне тянет издалека и быстрее бега — автоприцел крутит камеру, точно подойти трудно
    const pull = isTouch ? (p.kind === 'trip' ? 11 : 7) : 3.2;
    if (canTake && d < pull && d > .01) { const sp = Math.min(isTouch ? 22 : 14, d / dt); p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; }
    else if (!canTake && d < 1.8 && d > .01) { p.x -= dx / d * (1.8 - d); p.z -= dz / d * (1.8 - d); }   // не лезет в камеру
    p.s.position.set(p.x, H(p.x, p.z) + .45 + Math.sin(p.t * 3) * .15, p.z);
    if (p.kind === 'coin') p.s.scale.x = p.size * Math.max(.12, Math.abs(Math.cos(p.t * 3.5)));
    p.s.material.opacity = 1;
    p.s.visible = p.life > 4 || Math.sin(p.life * 18) > 0;
    const take = canTake && d < 1.3;
    if (take) {
      if (p.kind === 'coin') { score += 50; bump(hud.score); }
      if (p.kind === 'heart') {
        player.hp = Math.min(100, player.hp + 30); bump(hud.hp);
        if (p.item && time - foodSaid > 14 && Math.random() < .4) { foodSaid = time; say(p.item.line); }
      }
      if (p.kind === 'trip') {
        tripGot++; score += 150; bump(hud.trip); bump(hud.score);
        say(p.item);
        if (tripGot === TRIP_ITEMS.length) {
          setTimeout(() => {
            if (state !== 'playing') return;
            say(TRIP_DONE);
            showBanner('Чемодан собран!', '+1000 очков и полное здоровье', 3);
            score += 1000; player.hp = 100;
          }, 2600);
        }
      }
      if (p.kind === 'ammo') {
        ammo.shells = Math.min(AMMO_MAX.shells, ammo.shells + 10);
        ammo.bullets = Math.min(AMMO_MAX.bullets, ammo.bullets + 80);
        bump(hud.ammo);
      }
      Snd.pickup();
    }
    if (!take && p.life <= 0 && p.kind === 'trip') tripLeft.push(p.item);   // не успел — выпадет снова
    if (take || p.life <= 0) { scene.remove(p.s); pickups.splice(i, 1); }
  }
}

/* ═════════════ Курортные приколы ═════════════ */

// реплики: line — субтитр, file — assets/voice/<file>.mp3 (нет файла — только субтитр), who — чьё лицо в реплике
const L = (who, file, line) => ({ who, file, line });
const B = (file, line) => ({ who: 'boss', by: 'Начальник', face: 'assets/boss-face.png', file, line, prio: 2 });
const LINES = {
  cornCall:  L('npc',  'npc-corn-call',   'Кукуруза! Пахлава! Чурчхела!'),
  cornCall2: L('npc',  'npc-corn-call-2', 'Горячая кукуруза! Холодное пиво!'),
  cornCall3: L('npc',  'npc-corn-call-3', 'Брат, кукурузу бери! Для тебя скидка!'),
  cornCall4: L('npc',  null,              'Опять ты? Кукуруза, свежая!'),   // своей озвучки нет — только субтитр
  cornSold:  L('npc',  'npc-corn-sold',   'Кукуруза — триста! Сдачи нет!'),
  cornHero:  L('hero', 'hero-corn',       'Кукуруза за триста? Я же не просил!'),
  cornHero2: L('hero', 'hero-corn-2',     'У меня своя кукуруза есть!'),
  cornFlee:  L('npc',  'npc-corn-flee',   'Ай, жадный турист!'),
  photoCall: L('npc',  'npc-photo-call',  'Фото с обезьянкой! Улыбаемся!'),
  photoPay:  L('npc',  'npc-photo-pay',   'С вас пятьсот. Обезьянка тоже работает'),
  photoFlee: L('npc',  'npc-photo-flee',  'Без фото не уходи, дорогой!'),
  monkeyOff: L('hero', 'hero-monkey',     'Кыш! Кыш отсюда!'),
  flyerCall: L('npc',  'npc-flyer-call',  'Пирамида в аренду! Почти даром!'),
  flyerFlee: L('npc',  null,              'Возьми листовку, просто возьми!'),
  adsHero:   L('hero', 'hero-ads',        'Спам даже в отпуске'),
  animCall:  L('npc',  'npc-anim-call',   'Все на аква-аэробику! Раз-два!'),
  animHero:  L('hero', 'hero-anim',       'Я в отпуске! Я не хочу танцевать!'),
  animSad:   L('npc',  'npc-anim-sad',    'Ну и ладно. Пойду в соседний отель'),
  towel:     L('hero', 'hero-towel',      'Занято с шести утра. Классика'),
  paid:      L('hero', 'hero-paid',       'Полторы тысячи за шезлонг?! Я лучше на полотенце'),
  // финальный босс — Начальник
  bossSpawn: B('boss-spawn',  'О, ты в отпуске? Отлично, значит, есть время!'),
  heroBoss1: L('hero', 'hero-boss-1',     'Меня нет! Я в отпуске!'),
  bossCall1: B('boss-call-1', 'Есть минутка? Буквально пять минут!'),
  bossCall2: B('boss-call-2', 'Глянь почту, там срочное'),
  bossCall3: B('boss-call-3', 'Маленькая правочка. Ты же всё равно на пляже'),
  bossCall4: B('boss-call-4', 'Ноутбук с собой взял? Вот и славно'),
  bossCall5: B('boss-call-5', 'Созвон в девять. По нашему времени'),
  bossCall6: B('boss-call-6', 'Отчёт нужен к утру. К вчерашнему'),
  bossCall7: B('boss-call-7', 'Я твой отпуск подписывал? Не помню'),
  bossCall8: B('boss-call-8', 'Клиент хочет, как было в первой версии'),
  bossHit1:  B('boss-hit-1',  'Это тебе за дедлайн!'),
  bossHit2:  B('boss-hit-2',  'Минус премия!'),
  bossHurt1: B('boss-hurt-1', 'Ладно, ладно! Только отчёт пришли!'),
  bossHurt2: B('boss-hurt-2', 'Я это в KPI запишу!'),
  bossDead:  B('boss-dead',   'Хорошо… Отдыхай… В понедельник поговорим'),
  heroBoss2: L('hero', 'hero-boss-2',     'Алло? Пропадаю! Связь плохая!'),
};
const BOSS_CALLS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => LINES['bossCall' + i]);
const BOSS_HITS = [LINES.bossHit1, LINES.bossHit2];
const BOSS_SCRIPT = [            // порядок реплик Начальника; последний шаг — и его можно добить
  [LINES.bossSpawn, LINES.heroBoss1],
  [LINES.bossCall1], [LINES.bossCall2], [LINES.bossCall3], [LINES.bossCall4],
  [LINES.bossHurt1],
  [LINES.bossCall5], [LINES.bossCall6], [LINES.bossCall7], [LINES.bossCall8],
  [LINES.bossHurt2],
];

// ── шезлонги: занятые полотенцами (стены) и платные (тикают монеты) ──
const beachMat = {
  plastic: new THREE.MeshLambertMaterial({ color: '#f4f1ea' }),
  pole: new THREE.MeshLambertMaterial({ color: '#c9c4b8' }),
  umbrella: new THREE.MeshLambertMaterial({ map: tex(drawCanvas(256, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#2d9cdb'; g.fillRect(i * w / 8, 0, w / 8, h); }
  })), side: THREE.DoubleSide }),
  towels: ['#e84a5f', '#2ec4b6', '#ffb83d', '#6c5ce7', '#ff7fb0'].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })),
  sign: new THREE.MeshLambertMaterial({ map: tex(drawCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#241709'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffb83d'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffb83d'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('1500 ₽/час', w / 2, h / 2 - 14);
    g.fillStyle = '#fff'; g.font = '24px Arial'; g.fillText('ШЕЗЛОНГ', w / 2, h / 2 + 30);
  })) }),
};
const sunbeds = [];
function buildSunbed(x, z, paid) {
  const g = new THREE.Group();
  const y = H(x, z);
  g.position.set(x, y, z);
  g.rotation.y = rand(-.06, .06);          // ровными рядами
  const add = (geo, mat, px, py, pz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.BoxGeometry(.7, .08, 1.3), beachMat.plastic, 0, .38, .25);                 // лежак
  add(new THREE.BoxGeometry(.7, .08, .75), beachMat.plastic, 0, .62, -.62, -.75);          // спинка
  for (const lx of [-.3, .3]) for (const lz of [-.3, .8]) add(new THREE.BoxGeometry(.06, .38, .06), beachMat.plastic, lx, .19, lz);
  add(new THREE.CylinderGeometry(.03, .03, 2.4, 6), beachMat.pole, .7, 1.2, -.2);           // зонтик
  add(new THREE.ConeGeometry(1.3, .45, 8, 1, true), beachMat.umbrella, .7, 2.3, -.2);
  if (!paid) {                                                                                 // полотенце «занято»
    add(new THREE.PlaneGeometry(.66, 1.25), pick(beachMat.towels), 0, .43, .25, -Math.PI / 2);
    add(new THREE.PlaneGeometry(.66, .7), pick(beachMat.towels), 0, .67, -.6, -.75 - Math.PI / 2);
  } else {
    add(new THREE.CylinderGeometry(.025, .025, 1.3, 5), beachMat.pole, -.6, .65, .9);
    const sign = add(new THREE.PlaneGeometry(.7, .35), beachMat.sign, -.6, 1.35, .9);
    sign.rotation.y = Math.PI;
  }
  scene.add(g);
  if (!paid) colliders.push({ x, z, r: 1.25, y0: y - .5, h: 2.6 });
  sunbeds.push({ x, z, paid, said: -99 });
}
{
  // 3 ряда по 5: передний ряд (ближе к центру арены) — платный, остальные заняты полотенцами
  const COLS = 5, ROWS = 3, DX = 3.3, DZ = 4.6;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = BEACH.x + (col - (COLS - 1) / 2) * DX;
      const z = BEACH.z + (row - (ROWS - 1) / 2) * DZ;
      buildSunbed(x, z, row === ROWS - 1);
    }
  }
  // вывеска пляжа
  const sx = BEACH.x, sz = BEACH.z + DZ * 1.5 + 3.2, sy = H(sx, sz);
  const signMat = new THREE.MeshLambertMaterial({ map: tex(drawCanvas(512, 160, (g, w, h) => {
    g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5e3a18'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff3d6'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ПЛЯЖ ОТЕЛЯ', w / 2, 52);
    g.fillStyle = '#ffb83d'; g.font = 'bold 40px Arial'; g.fillText('«ВСЁ ВКЛЮЧЕНО»*', w / 2, 108);
    g.fillStyle = '#fff3d6'; g.font = '18px Arial'; g.fillText('*шезлонги не включены', w / 2, 142);
  })), side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), signMat);
  board.position.set(sx, sy + 2.1, sz);
  scene.add(board);
  for (const px of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 2.6, 6), beachMat.pole);
    post.position.set(sx + px, sy + 1.3, sz); scene.add(post);
  }
}

// ── курортный зазывала: одна модель, разный реквизит ──
let HUST = null;
const HUST_HEIGHT = 1.8;
const HUST_CLIP_SPEED = 1.09;     // скорость походки в клипе при росте 1 м (замер в Blender, см. prepare_character.py)
async function loadHustler() {
  const gltf = await parseGLB('hustler');
  if (!gltf || !THREE.SkeletonUtils) return null;
  const box = new THREE.Box3();
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
  const h = box.max.y - box.min.y;
  return { scene: gltf.scene, clip: gltf.animations[0], scale: HUST_HEIGHT / h, minY: box.min.y, srcH: h };
}
// аниматор отеля — своя модель с танцами (dance1, dance2) из models/animator.glb
let DANCER = null;
const DANCER_HEIGHT = 1.85;
async function loadDancer() {
  const gltf = await parseGLB('animator');
  if (!gltf || !THREE.SkeletonUtils || !gltf.animations.length) return null;
  const box = new THREE.Box3();
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
  const h = box.max.y - box.min.y;
  const dances = gltf.animations.filter((a) => /^dance/.test(a.name));
  return { scene: gltf.scene, clips: dances.length ? dances : gltf.animations, scale: DANCER_HEIGHT / h, minY: box.min.y };
}
function makeDancer() {
  const g = new THREE.Group();
  const inner = THREE.SkeletonUtils.clone(DANCER.scene);
  inner.scale.setScalar(DANCER.scale);
  inner.position.y = -DANCER.minY * DANCER.scale;
  inner.rotation.y = Math.PI;
  g.add(inner);
  inner.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const mixer = new THREE.AnimationMixer(inner);
  const dances = DANCER.clips.map((c) => mixer.clipAction(c));
  dances[0].play();
  return { g, mixer, action: dances[0], dances, dance: 0, danceT: 0, hand: null, shoulder: null, dancer: true };
}
function makeGroundSpeaker() {      // большая колонка на песке рядом с аниматором
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(.7, 1.15, .55), PM('#17171a'), 0, .575, 0);
  for (const [y, r] of [[.82, .2], [.36, .26]]) {
    add(new THREE.CylinderGeometry(r, r, .03, 18).rotateX(Math.PI / 2), PM('#3a3a40'), 0, y, -.285);
    add(new THREE.CylinderGeometry(r * .35, r * .35, .04, 12).rotateX(Math.PI / 2), PM('#2dbd00'), 0, y, -.3);
  }
  add(new THREE.BoxGeometry(.66, .05, .05), PM('#ffb83d'), 0, 1.12, -.28);
  return g;
}

function makeHustler() {
  const g = new THREE.Group();
  const inner = THREE.SkeletonUtils.clone(HUST.scene);
  inner.scale.setScalar(HUST.scale);
  inner.position.y = -HUST.minY * HUST.scale;
  inner.rotation.y = Math.PI;
  g.add(inner);
  inner.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const mixer = new THREE.AnimationMixer(inner);
  const action = mixer.clipAction(HUST.clip); action.play();
  return { g, mixer, action, hand: inner.getObjectByName('RightHand'), shoulder: inner.getObjectByName('LeftShoulder') || inner.getObjectByName('LeftArm') };
}

const PM = (c) => new THREE.MeshLambertMaterial({ color: c });
function makeProp(kind) {
  const hand = new THREE.Group(), shoulder = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  if (kind === 'vendor') {                         // корзина с кукурузой
    add(hand, new THREE.CylinderGeometry(.24, .18, .16, 10), PM('#a8743a'), 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const cob = add(hand, new THREE.CylinderGeometry(.035, .03, .22, 6), PM('#ffd447'), Math.cos(i) * .12, .12, Math.sin(i) * .12);
      cob.rotation.z = Math.PI / 2 - .3; cob.rotation.y = i;
    }
  } else if (kind === 'photo') {                   // фотоаппарат + обезьянка на плече
    add(hand, new THREE.BoxGeometry(.16, .1, .08), PM('#1d1d20'), 0, 0, 0);
    add(hand, new THREE.CylinderGeometry(.035, .035, .08, 10).rotateX(Math.PI / 2), PM('#333'), 0, 0, -.07);
    const fur = PM('#6b4423'), face = PM('#e8c39e');
    add(shoulder, new THREE.SphereGeometry(.11, 8, 6), fur, 0, .08, 0);
    add(shoulder, new THREE.SphereGeometry(.08, 8, 6), fur, 0, .24, -.03);
    add(shoulder, new THREE.SphereGeometry(.05, 8, 6), face, 0, .23, -.09);
    const tail = add(shoulder, new THREE.TorusGeometry(.1, .015, 5, 12, Math.PI * 1.3), fur, 0, .05, .1);
    tail.rotation.y = Math.PI / 2;
  } else if (kind === 'flyer') {                   // пачка листовок
    add(hand, new THREE.BoxGeometry(.22, .05, .3), PM('#ffffff'), 0, 0, 0);
    add(hand, new THREE.BoxGeometry(.22, .006, .3), PM('#ff3d6e'), 0, .03, 0);
  } else if (kind === 'animator') {                // колонка
    const box = add(hand, new THREE.BoxGeometry(.32, .46, .26), PM('#17171a'), 0, .1, 0);
    for (const y of [.22, -.02]) add(box, new THREE.CylinderGeometry(.09, .09, .02, 14).rotateX(Math.PI / 2), PM('#3a3a40'), 0, y - .1, -.135);
    add(box, new THREE.BoxGeometry(.3, .03, .03), PM('#2dbd00'), 0, .25, -.13);
  }
  scene.add(hand, shoulder);
  return { hand, shoulder };
}

// Зазывалы. Постоянные: продавец кукурузы (всё время подбегает) и аниматор (стоит у пляжа с колонкой).
// Гости по очереди: фотограф с обезьянкой и раздатчик листовок.
const npcs = [];
const visitor = { timer: 14, next: 'photo' };
const ANIM_SPOT = { x: BEACH.x - 12, z: BEACH.z + 9 };
const NPC_CFG = {
  vendor:   { speed: 4.8, stop: 1.7, flee: LINES.cornFlee },
  photo:    { speed: 5.4, stop: 1.6, call: LINES.photoCall, flee: LINES.photoFlee, behind: true },
  flyer:    { speed: 4.6, stop: 2.2, call: LINES.flyerCall, flee: LINES.flyerFlee },
  animator: { speed: 0,   stop: 0 },
};
const CORN_CALLS = [LINES.cornCall, LINES.cornCall2, LINES.cornCall3, LINES.cornCall4];

// музыка аниматора — ваш трек, громкость по расстоянию
const music = new Audio('assets/voice/animator-music.m4a');
music.loop = true; music.preload = 'auto'; music.volume = 0;
const MUSIC_MAX = .9, MUSIC_MIN = .05;      // громкость вплотную к колонке и минимум на краю карты
const MUSIC_REF = 4, MUSIC_ROLLOFF = .6;    // до 4 м громкость полная, дальше падает обратно расстоянию
const MUSIC_DUCK = .4;                      // во сколько раз тише под реплики
let musicDist = 0, musicDuck = 1, duckHold = -99;
let musicOn = false, musicVol = 0;   // musicVol — текущая громкость колонки (саму её ставит Snd.vol)
function musicPlay() { if (Snd.isMuted()) return; if (Snd.bufMusic) Snd.bgPlay(); else { const p = music.play(); if (p && p.catch) p.catch(() => {}); } musicOn = true; }
function setMusicVol(v) { if (Snd.bufMusic) Snd.bgVol(v); else Snd.vol(music, v); }
function musicPause() { if (Snd.bufMusic) Snd.bgStop(); music.pause(); musicOn = false; }
function unlockMusic() {
  if (music._unlocked || Snd.bufMusic) return;         // на iPhone музыка идёт не через <audio>
  music._unlocked = true; music.muted = true;
  Snd.vol(music, 0);
  const p = music.play();
  const done = () => { music.muted = false; if (!musicOn) music.pause(); };   // игра уже включила музыку — не глушим
  if (p && p.then) p.then(done).catch(done); else done();
}

function spawnNpc(kind, x, z) {
  const useDancer = kind === 'animator' && DANCER;
  const rig = useDancer ? makeDancer() : makeHustler(), cfg = NPC_CFG[kind];
  if (x === undefined) {
    const a = cfg.behind ? player.yaw - Math.PI / 2 + rand(-.5, .5) : rand(0, Math.PI * 2);   // фотограф — сзади
    const d = rand(30, 40);
    x = player.pos.x + Math.cos(a) * d; z = player.pos.z - Math.sin(a) * d;
    const r = Math.hypot(x, z); if (r > ARENA) { x *= ARENA / r; z *= ARENA / r; }
  }
  const prop = useDancer ? { hand: makeGroundSpeaker(), shoulder: new THREE.Group() } : makeProp(kind);
  if (useDancer) {
    const sx = x + 1.6, sz = z + .6;
    prop.hand.position.set(sx, H(sx, sz), sz);
    prop.hand.rotation.y = Math.atan2(-(player.pos.x - sx), -(player.pos.z - sz));
    scene.add(prop.hand);
  }
  const n = { kind, cfg, rig, prop, groundSpeaker: !!useDancer, x, z, yaw: 0, state: kind === 'animator' ? 'dance' : 'come',
              t: 0, wait: 0, called: false, speaker: kind === 'animator', saidAt: -99, heroAt: -99 };
  n.rig.g.position.set(x, H(x, z), z);
  scene.add(n.rig.g);
  npcs.push(n);
  return n;
}
function removeNpc(n) {
  scene.remove(n.rig.g, n.prop.hand, n.prop.shoulder);
  const i = npcs.indexOf(n); if (i >= 0) npcs.splice(i, 1);
  if (n.kind === 'photo' || n.kind === 'flyer') visitor.timer = rand(14, 22);
}
function startBeach() {             // на старте игры: аниматор на своём месте и продавец неподалёку
  if (!HUST) return;
  spawnNpc('animator', ANIM_SPOT.x, ANIM_SPOT.z);
  const v = spawnNpc('vendor');
  v.state = 'wait'; v.wait = 5;
}
function npcBark(n, line, cooldown = 6) {   // выкрик зазывалы: только если никто не говорит
  if (time - n.saidAt < cooldown) return false;
  if (!bark(line)) return false;
  n.saidAt = time; return true;
}
function npcFlee(n, line) {
  if (n.state === 'flee') return;
  n.state = 'flee';
  if (line) say(line);
}
function npcShot(n) {
  if (n.kind === 'animator') {
    if (!n.speaker) return;
    n.speaker = false; n.wait = 15;          // колонка молчит 15 секунд, потом снова
    const p = n.prop.hand.position;
    emit(p.x, p.y, p.z, 30, ['#17171a', '#3a3a40', '#2dbd00'], 6, 3, .8);
    n.prop.hand.visible = false;
    Snd.pop(); say(LINES.animSad);
    return;
  }
  if (n.kind === 'vendor') {
    if (n.state !== 'flee') { n.state = 'flee'; n.fleeTo = rand(28, 36); say(LINES.cornFlee); }
    return;
  }
  if (n.state !== 'flee' && n.state !== 'photo') npcFlee(n, n.cfg.flee);
}
function npcHitSpheres(n) {
  const p = n.rig.g.position;
  const out = [[p.x, p.y + 1.0, p.z, .45], [p.x, p.y + 1.55, p.z, .32]];
  if (n.groundSpeaker && n.prop.hand.visible) { const q = n.prop.hand.position; out.push([q.x, q.y + .6, q.z, .55]); }
  return out;
}
function takeCoins(amount) {
  const loss = Math.min(score, amount);
  score -= loss;
  if (loss) moneyFloat(`−${loss}`);
  bump(hud.score);
  return loss;
}

const npcHand = new THREE.Vector3();
let invertControls = false, camRoll = 0, cornHeroAt = -99;
function updateBeach(dt) {
  // платные шезлонги и полотенца
  let inPaid = false;
  for (const b of sunbeds) {
    const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
    if (b.paid && d < 3.2) inPaid = true;
    if (d < 3.6 && time - b.said > 25) { b.said = time; say(b.paid ? LINES.paid : LINES.towel); }
  }
  if (inPaid) { beachDrain += dt * 30; if (beachDrain >= 10) { takeCoins(Math.floor(beachDrain)); beachDrain = 0; } }

  // гости: фотограф и листовки по очереди
  if (HUST && waveState === 'fight' && !npcs.some((n) => n.kind === 'photo' || n.kind === 'flyer')) {
    visitor.timer -= dt;
    if (visitor.timer <= 0) { spawnNpc(visitor.next); visitor.next = visitor.next === 'photo' ? 'flyer' : 'photo'; }
  }

  invertControls = false;
  let roll = 0;
  for (const n of npcs.slice()) {
    n.t += dt;
    const dx = player.pos.x - n.x, dz = player.pos.z - n.z, d = Math.hypot(dx, dz) || .01;
    const toward = Math.atan2(-dx, -dz);
    let speed = 0;
    const walk = (dir, sp) => { speed = sp; n.x += dx / d * sp * dt * dir; n.z += dz / d * sp * dt * dir; };

    if (n.kind === 'vendor') {
      // продавец кукурузы: подбежал → впарил → отошёл → постоял → снова бежит
      if (n.state === 'wait') {
        n.yaw = toward;
        n.wait -= dt;
        if (n.wait <= 0) { n.state = 'come'; npcBark(n, pick(CORN_CALLS), 4); }
      } else if (n.state === 'come') {
        n.yaw = toward;
        if (d > n.cfg.stop) walk(1, n.cfg.speed);
        else {
          const reply = time - cornHeroAt > 30 ? pick([LINES.cornHero, LINES.cornHero2]) : null;   // герой огрызается не на каждую продажу
          if (reply) cornHeroAt = time;
          sayDialog(LINES.cornSold, reply); takeCoins(300);               // продал → ответ героя, одним диалогом
          n.state = 'back'; n.fleeTo = rand(13, 19);
        }
      } else {                               // 'back' — отходит после продажи, 'flee' — убегает от выстрела
        n.yaw = Math.atan2(dx, dz);
        if (d < n.fleeTo) walk(-1, n.cfg.speed * (n.state === 'flee' ? 1.4 : .9));
        else { n.wait = n.state === 'flee' ? rand(6, 9) : rand(4, 7); n.state = 'wait'; }
      }
    } else if (n.kind === 'animator') {
      // аниматор всегда у пляжа: танцует лицом к игроку
      n.yaw = n.groundSpeaker ? toward : toward + Math.sin(n.t * 6) * .4;
      if (!n.speaker) {
        n.wait -= dt;
        if (n.wait <= 0) { n.speaker = true; n.prop.hand.visible = true; if (d < 20) npcBark(n, LINES.animCall, 0); }
      }
      if (n.speaker && d < 16) npcBark(n, LINES.animCall, 30);
      if (n.speaker && d < 11) {          // рядом с колонкой экран слегка качает в ритм (управление больше не путаем)
        roll = Math.sin(time * 4.2) * .035 * clamp(1.4 - d / 11, 0, 1);
        if (time - n.heroAt > 25 && time - n.saidAt > 1.5) { n.heroAt = time; say(LINES.animHero); }
      }
      /* Громкость колонки — как в играх, из двух независимых плавных множителей:
         1) расстояние: обратная зависимость (вдвое дальше — заметно тише), без ступенек и без «нуля»;
         2) приглушение под реплики (ducking): быстро вниз, медленно обратно и с удержанием между репликами,
            чтобы музыка не «качалась» на каждой фразе диалога. */
      const far = Math.max(0, d - MUSIC_REF);
      const distVol = n.speaker ? Math.max(MUSIC_MIN, MUSIC_MAX * MUSIC_REF / (MUSIC_REF + MUSIC_ROLLOFF * far)) : 0;
      musicDist += (distVol - musicDist) * (1 - Math.exp(-dt / .4));          // сглаживание ~0,4 с
      if (speechCur || speechScene || speechQ.length) duckHold = time;
      const duckTo = time - duckHold < .9 ? MUSIC_DUCK : 1;                    // держим 0,9 с после последней реплики
      musicDuck += (duckTo - musicDuck) * (1 - Math.exp(-dt / (duckTo < musicDuck ? .15 : 1.1)));
      const base = Math.min(musicDist, MUSIC_MIN);                             // минимум под реплики не приглушаем — вдали музыка не пропадает
      musicVol = base + (musicDist - base) * musicDuck;
      setMusicVol(musicVol);
      if ((Snd.bufMusic || music.paused) && state === 'playing' && !Snd.isMuted()) musicPlay();
    } else {
      // гости: фотограф и листовки
      if (n.state === 'come') {
        if (!n.called && d < 30) { n.called = true; say(n.cfg.call); }   // встаёт в очередь, никого не перебивает
        if (d > n.cfg.stop) walk(1, n.cfg.speed); else arriveNpc(n);
        n.yaw = toward;
      } else if (n.state === 'photo') {
        n.yaw = toward;
        if (monkeyT <= 0) {
          if (!n.monkeyShaken) { takeCoins(500); say(LINES.photoPay); }
          n.state = 'flee';
        }
      } else if (n.state === 'flee') {
        walk(-1, n.cfg.speed * 1.35);
        n.yaw = Math.atan2(dx, dz);
        if (d > 42) { removeNpc(n); continue; }
      }
    }

    if (n.kind !== 'animator') pushOut(n, .5);
    const y = H(n.x, n.z);
    n.rig.g.position.set(n.x, y, n.z);
    n.rig.g.rotation.y = n.yaw;
    if (n.rig.dancer) {
      // два танца по очереди, плавная смена каждые 8 секунд; без музыки — вяло переминается
      const r = n.rig;
      r.danceT += dt;
      if (r.dances.length > 1 && r.danceT > 8) {
        r.danceT = 0;
        const next = r.dances[(r.dance + 1) % r.dances.length];
        next.reset().play(); r.action.crossFadeTo(next, .6, false);
        r.dance = (r.dance + 1) % r.dances.length; r.action = next;
      }
      r.action.timeScale = n.speaker ? 1 : .25;
    } else {
      n.rig.action.timeScale = n.kind === 'animator' ? (n.speaker ? 1.8 : .4) : speed > 0 ? Math.min(2.6, speed / (HUST_CLIP_SPEED * HUST_HEIGHT)) : .35;
    }
    n.rig.mixer.update(dt);
    const follow = (bone, grp, up) => {            // реквизит следует за руками
      if (!bone) { grp.position.set(n.x, y + 1.1, n.z); return; }
      bone.getWorldPosition(npcHand);
      grp.position.set(npcHand.x, npcHand.y + up, npcHand.z);
      grp.rotation.y = n.yaw;
    };
    if (!n.groundSpeaker) {
      follow(n.rig.hand, n.prop.hand, n.kind === 'animator' ? .05 : .02);
      follow(n.rig.shoulder, n.prop.shoulder, .05);
    }
  }
  camRoll += (roll - camRoll) * Math.min(1, dt * 6);

  if (monkeyT > 0) { monkeyT -= dt; if (monkeyT <= 0) monkeyOff(); }
}
let beachDrain = 0;

function arriveNpc(n) {
  if (n.kind === 'photo') {
    n.state = 'photo';
    n.prop.shoulder.visible = false;     // обезьянка прыгнула на игрока
    monkeyOn();
  } else if (n.kind === 'flyer') {
    showAds(3);
    npcFlee(n);
  }
}

// ── обезьянка на экране ──
const monkeyEl = $('monkey');
let monkeyT = 0, monkeyJumps = 0;
function monkeyOn() { monkeyT = 5; monkeyJumps = 0; monkeyEl.classList.add('is-on'); Snd.honkSynth(.2); }
function monkeyOff(shaken) {
  monkeyT = 0; monkeyEl.classList.remove('is-on');
  if (shaken) {
    say(LINES.monkeyOff);
    const ph = npcs.find((n) => n.kind === 'photo'); if (ph) ph.monkeyShaken = true;
  }
}
function monkeyJump() {            // прыжками можно стряхнуть обезьянку
  if (monkeyT <= 0) return;
  monkeyJumps++;
  monkeyEl.classList.remove('is-shake'); void monkeyEl.offsetWidth; monkeyEl.classList.add('is-shake');
  if (monkeyJumps >= 3) monkeyOff(true);
}

// ── рекламные листовки поверх экрана ──
const ADS = [
  ['ПИРАМИДА В АРЕНДУ', 'всего 1 ₽ в сутки*', '*плюс 99 999 ₽ залог'],
  ['ВЫ ВЫИГРАЛИ!', 'бесплатный завтрак', 'при покупке таймшера'],
  ['ТАЙМШЕР НАВСЕГДА', 'подпишите тут, тут и тут', 'отказ не принимается'],
  ['ЭКСКУРСИЯ К СФИНКСУ', 'без очереди!', 'очередь за билетами — отдельно'],
  ['ВЕРБЛЮД ДЁШЕВО', 'покатаем, сфотаем', 'обратно — за отдельную плату'],
  ['ПАПИРУС РУЧНОЙ РАБОТЫ', 'настоящий, египетский', 'сделано в Китае'],
];
const adsEl = $('ads');
function showAds(n) {
  const pool = ADS.slice().sort(() => Math.random() - .5);
  for (let i = 0; i < n; i++) {
    const [t, sub, small] = pool[i];
    const ad = document.createElement('div');
    ad.className = 'ad';
    ad.style.left = rand(8, 58) + '%';
    ad.style.top = rand(12, 52) + '%';
    ad.style.transform = `rotate(${rand(-8, 8)}deg)`;
    ad.innerHTML = `<button type="button" aria-label="Закрыть">×</button><b>${t}</b><span>${sub}</span><small>${small}</small>`;
    ad.querySelector('button').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeAd(ad); });
    adsEl.appendChild(ad);
  }
}
function closeAd(ad) {
  ad = ad || adsEl.lastElementChild;
  if (!ad) return;
  ad.remove();
  Snd.pop();
  if (!adsEl.children.length) say(LINES.adsHero);
}
function clearBeach() {
  for (const n of npcs.slice()) removeNpc(n);
  musicPause(); musicVol = musicDist = 0; musicDuck = 1; duckHold = -99; setMusicVol(0);
  visitor.timer = 14; visitor.next = 'photo';
  adsEl.innerHTML = '';
  monkeyT = 0; monkeyEl.classList.remove('is-on');
  invertControls = false; camRoll = 0; beachDrain = 0;
  for (const b of sunbeds) b.said = -99;
}

const moneyEl = $('money');
function moneyFloat(text) {
  const el = document.createElement('div');
  el.className = 'money'; el.textContent = text;
  moneyEl.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ═════════════ Игрок ═════════════ */

function hurtPlayer(dmg) {
  if (state !== 'playing') return;
  player.hp -= dmg;
  hurtA = Math.min(1, hurtA + dmg / 25);
  shake = Math.max(shake, .25);
  Snd.hurt();
  bump(hud.hp);
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

const fwd = V(0, 0, 0), right = V(0, 0, 0), wish = V(0, 0, 0);
function updatePlayer(dt) {
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touchMove.y;
  if (invertControls) f = -f;                          // аниматор: вперёд-назад перепутались
  let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMove.x;
  if (!touchMove.len) moveYawOff = 0;                  // стик отпущен — «вперёд» снова туда, куда смотрим
  const my = player.yaw + moveYawOff;                  // пока стик зажат, автоприцел не меняет направление бега
  fwd.set(-Math.sin(my), 0, -Math.cos(my));
  right.set(Math.cos(my), 0, -Math.sin(my));
  wish.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
  if (wish.lengthSq() > 1) wish.normalize();
  const sprint = keys.ShiftLeft || keys.ShiftRight || touchMove.len > .95;
  const speed = sprint ? 15 : 10;
  const acc = player.onGround ? 12 : 3;
  player.vel.x += (wish.x * speed - player.vel.x) * Math.min(1, acc * dt);
  player.vel.z += (wish.z * speed - player.vel.z) * Math.min(1, acc * dt);
  if (jumpReq && player.onGround) { player.vel.y = 9.5; player.onGround = false; monkeyJump(); }
  jumpReq = false;
  player.vel.y -= 28 * dt;
  player.pos.addScaledVector(player.vel, dt);

  const o = { x: player.pos.x, z: player.pos.z };
  pushOut(o, .55);
  const r = Math.hypot(o.x, o.z);
  if (r > ARENA) { o.x *= ARENA / r; o.z *= ARENA / r; }
  player.pos.x = o.x; player.pos.z = o.z;

  const g = H(player.pos.x, player.pos.z);
  if (player.pos.y <= g) { player.pos.y = g; player.vel.y = 0; player.onGround = true; }
  else if (player.pos.y - g > .15) player.onGround = false;

  const moving = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround) bobT += dt * moving * .9;
}

/* ═════════════ Стрельба ═════════════ */

const ray = { o: V(0, 0, 0), d: V(0, 0, 0) };
const tmp = V(0, 0, 0), muzzleWorld = V(0, 0, 0);

function hitscan(o, d, range) {
  let best = range, enemy = null;
  for (const e of enemies) {
    for (const [cx, cy, cz, r] of hitSpheres(e)) {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; enemy = e; }
    }
  }
  let npcHit = null;
  for (const nn of npcs) {
    for (const [cx, cy, cz, r] of npcHitSpheres(nn)) {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; enemy = null; npcHit = nn; }
    }
  }
  let solid = false;
  for (const c of colliders) {                       // колонны
    const ox = o.x - c.x, oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0 || a < 1e-6) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t <= 0 || t >= best) continue;
    const y = o.y + d.y * t;
    if (y < c.y0 || y > c.y0 + c.h) continue;
    best = t; enemy = null; npcHit = null; solid = true;
  }
  for (let t = .5; t < best; t += .7) {             // песок
    if (o.y + d.y * t < H(o.x + d.x * t, o.z + d.z * t)) { best = t; enemy = null; npcHit = null; solid = true; break; }
  }
  return { t: best, enemy, solid, npc: npcHit };
}

/* Автоприцел для телефона. Прицел сам доводится на ближайшего врага в секторе обзора,
   а когда враг на мушке и достаточно близко — оружие стреляет само. Пальцем прицел можно увести:
   пока идёт свайп, доводка втрое слабее. Чем ближе враг, тем шире сектор захвата:
   дальше 35 м — только рядом с прицелом, до 35 м — вся передняя полусфера, до 18 м — со всех сторон
   (на телефоне быстро развернуться пальцем нельзя, а безголовые набегают и сзади). */
const AUTO_RANGE = [18, 60];          // с какого расстояния стрелять самому: чемодан, фламинго
const aimFwd = V(0, 0, 0);
function aimAssist(dt) {
  autoFire = false;
  const ex = player.pos.x, ey = player.pos.y + EYE, ez = player.pos.z;
  const setFwd = () => { const cp = Math.cos(player.pitch); aimFwd.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp); };
  setFwd();
  let best = null, bestScore = 1e9, bx = 0, by = 0, bz = 0;
  for (const e of enemies) {
    const c = hitSpheres(e)[e.chief ? 1 : 0];
    const dx = c[0] - ex, dy = c[1] - ey, dz = c[2] - ez, d = Math.hypot(dx, dy, dz);
    if (d > 70 || d < .5) continue;
    const ang = Math.acos(clamp((dx * aimFwd.x + dy * aimFwd.y + dz * aimFwd.z) / d, -1, 1));
    if (d >= 18 && ang > (d < 35 ? 1.1 : .5)) continue;
    const score = d < 18 ? d * .02 : 1 + ang + d * .012;   // сначала ближайшая угроза, потом — кто ближе к прицелу
    if (score < bestScore) { bestScore = score; best = e; bx = dx; by = dy; bz = dz; }
  }
  crosshair.classList.toggle('is-lock', !!best);
  if (!best) return;
  let dyaw = Math.atan2(-bx, -bz) - player.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const dpitch = Math.atan2(by, Math.hypot(bx, bz)) - player.pitch;
  const off = Math.hypot(dyaw, dpitch);
  if (off > 1e-4) {
    const near = Math.hypot(bx, bz) < 18;                // к близкой угрозе разворачивается быстрее
    const rate = clamp(off * 8, .8, near ? 7 : 4) * (time - lookDragAt < .25 ? .35 : 1) * dt;
    const f = Math.min(1, rate / off);
    player.yaw += dyaw * f; player.pitch = clamp(player.pitch + dpitch * f, -1.45, 1.45);
    if (touchMove.len) moveYawOff -= dyaw * f;         // герой бежит, куда бежал (например, к выпавшей вещи)
    setFwd();
  }
  ray.o.set(ex, ey, ez);
  autoFire = !!hitscan(ray.o, aimFwd, AUTO_RANGE[cur]).enemy;
}

function fire() {
  const W = WEAPONS[cur];
  if (ammo[W.ammo] <= 0) {
    Snd.empty(); fireCd = .25;
    const other = WEAPONS[1 - cur];
    if (ammo[other.ammo] > 0) selectWeapon(1 - cur);
    return;
  }
  ammo[W.ammo]--;
  fireCd = W.interval;
  kick = Math.min(1.4, kick + W.kick);
  if (cur === 0) { pumpT = .62; Snd.shotgun(); shake = Math.max(shake, .12); } else Snd.minigun();

  if (adsEl.children.length) closeAd();             // выстрел «закрывает» листовку
  let npcShotDone = false;
  ray.o.copy(camera.position);
  muzzleWorld.set(.28, -.25, -.9).applyQuaternion(camera.quaternion).add(camera.position);
  let anyHit = false;
  for (let p = 0; p < W.pellets; p++) {
    ray.d.set((Math.random() - .5) * 2 * W.spread, (Math.random() - .5) * 2 * W.spread, -1).normalize().applyQuaternion(camera.quaternion);
    const h = hitscan(ray.o, ray.d, W.range);
    tmp.copy(ray.o).addScaledVector(ray.d, h.t);
    if (h.enemy) {
      let dmg = W.dmg;
      if (cur === 0) dmg *= clamp(1.5 - h.t / 26, .35, 1.5);     // в упор больнее
      const sw = h.enemy.type !== 'runner';
      emit(tmp.x, tmp.y, tmp.z, sw ? 5 : 4, sw ? ['#ffffff', '#e8e4da'] : ['#4e5a3a', '#7a2f24', '#2c2c2c'], 4, 2, .5);
      damageEnemy(h.enemy, dmg, ray.d);
      anyHit = true;
    } else if (h.npc) {
      emit(tmp.x, tmp.y, tmp.z, 3, ['#ff9f1c', '#2ec4b6', '#ffffff'], 3, 2, .5);
      if (!npcShotDone) { npcShotDone = true; npcShot(h.npc); }
    } else if (h.solid) {
      emit(tmp.x, tmp.y, tmp.z, 3, ['#e7bf7c', '#c99456', '#f4d9a6'], 3, 3, .55);
    }
    if (cur === 1 && Math.random() < .5) tracer(muzzleWorld, tmp);
  }
  if (anyHit && chT <= .09) hitMark(false);

  const fl = W.model.flash;
  fl.visible = true; fl.material.rotation = rand(0, Math.PI * 2);
  fl.userData.t = cur === 0 ? .06 : .035;
  gunFlashLight.intensity = 4;
  muzzleLight.position.copy(muzzleWorld);
  muzzleLight.intensity = cur === 0 ? 5 : 2.5;
}

function selectWeapon(i, instant) {
  if (i === cur && !instant) return;
  WEAPONS[cur].model.g.visible = false;
  cur = i;
  WEAPONS[cur].model.g.visible = true;
  switchT = instant ? 0 : .35;
  fireCd = Math.max(fireCd, instant ? 0 : .3);
}

function updateWeapon(dt) {
  const W = WEAPONS[cur], m = W.model;
  fireCd -= dt;
  const trigger = firing || autoFire;
  if (cur === 1) spin = trigger ? Math.min(1, spin + dt * 4) : Math.max(0, spin - dt * 1.5);
  if (trigger && fireCd <= 0 && switchT <= 0 && (cur === 0 || spin > .55)) fire();

  kick = Math.max(0, kick - dt * (cur === 0 ? 4.5 : 9));
  switchT = Math.max(0, switchT - dt);
  swayX *= Math.pow(.004, dt); swayY *= Math.pow(.004, dt);

  const moving = clamp(Math.hypot(player.vel.x, player.vel.z) / 10, 0, 1.4) * (player.onGround ? 1 : .3);
  const bx = Math.sin(bobT * 1.1) * .018 * moving, by = -Math.abs(Math.cos(bobT * 1.1)) * .016 * moving;
  const lower = Math.sin(clamp(switchT / .35, 0, 1) * Math.PI) * .35;
  const narrow = gunCam.aspect < 1 ? -.09 : 0;   // на вертикальном экране ружьё ближе к центру
  m.g.position.set(m.base.x + narrow + bx + swayX, m.base.y + by - swayY - lower, m.base.z + kick * (cur === 0 ? .08 : .02));
  m.g.rotation.x = kick * (cur === 0 ? .18 : .03);

  if (m.spin) m.spin.rotation.z += dt * spin * 32;
  if (m.pump) {
    pumpT = Math.max(0, pumpT - dt);
    const k = pumpT > 0 && pumpT < .4 ? Math.sin((1 - pumpT / .4) * Math.PI) : 0;
    m.pump.position.z = m.pumpZ + k * m.pumpTravel;
  }
  if (m.wheels) for (const w of m.wheels) w.rotation.x -= dt * Math.hypot(player.vel.x, player.vel.z) * 3;
  if (m.tag) m.tag.rotation.z = Math.sin(bobT * 1.1) * .35 * moving + kick * .6;
  for (const w of WEAPONS) {
    const fl = w.model.flash;
    if (fl.visible) { fl.userData.t -= dt; if (fl.userData.t <= 0) fl.visible = false; }
  }
  gunFlashLight.intensity = Math.max(0, gunFlashLight.intensity - dt * 60);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 70);
}

/* ═════════════ Цикл ═════════════ */

let last = performance.now(), menuYaw = 0;

function tick(dt) {
  if (state === 'playing') {
    time += dt;
    updatePlayer(dt);
    if (isTouch) aimAssist(dt);
    updateWeapon(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateBeach(dt);
    updateWaves(dt);
  }
  if (state !== 'paused') {
    updateParticles(dt);
    updateBlasts(dt);
    updateTracers(dt);
  }
  updateHud(dt);

  if (state === 'playing' || state === 'paused' || state === 'over' || state === 'win') {
    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, camRoll);
  } else {
    menuYaw += dt * .05;
    camera.position.set(Math.sin(menuYaw) * 12, H(0, 0) + 4, Math.cos(menuYaw) * 12);
    camera.rotation.set(-.03, menuYaw, 0);
  }
  if (shake > 0) {
    camera.position.x += rand(-1, 1) * shake * .25;
    camera.position.y += rand(-1, 1) * shake * .25;
    shake = Math.max(0, shake - dt * 2.2);
  }
  camera.updateMatrixWorld();
}

function render() {
  sky.position.copy(camera.position);
  sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 900);
  renderer.clear();
  renderer.render(scene, camera);
  if (state === 'playing' || state === 'paused') {
    renderer.clearDepth();
    renderer.render(gunScene, gunCam);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  tick(dt);
  render();
}

// отладка: game.html?debug — ручная прокрутка симуляции из консоли
if (/[?&]debug/.test(location.search)) {
  const dbgLine = (key) => { const all = [...TRIP_ITEMS, ...Object.values(LINES), ...FOOD.map((f) => f.line)]; return LINES[key] || all.find((l) => l.file === key); };
  window.__dbg = {
    step(sec = 1, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) tick(dt); render(); return this.info(); },
    info: () => ({ state, wave, hp: Math.round(player.hp), score, kills, enemies: enemies.length, queue: spawnQueue.length, ammo: { ...ammo }, cur }),
    aimAt(i = 0) {
      const e = enemies[i]; if (!e) return null;
      const dx = e.x - player.pos.x, dz = e.z - player.pos.z, dy = (e.y + 1.2) - (player.pos.y + EYE);
      player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return Math.round(Math.hypot(dx, dz));
    },
    fire(on = true) { firing = on; },
    weapon: (i) => selectWeapon(i),
    god() { player.hp = 1e9; },
    stick(x, y) { touchMove.x = x; touchMove.y = y; touchMove.len = Math.min(1, Math.hypot(x, y)); },
    pos: () => ({ x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1), yaw: +player.yaw.toFixed(2) }),
    ammo() { ammo.shells = 999; ammo.flamingo = 9999; for (const k in ammo) ammo[k] = 9999; },
    snd: () => Snd.debug(),
    voice: () => ({ cur: speechCur && speechCur.line, who: speechCur && speakerOf(speechCur), busy: voiceBusy, scene: speechScene && speechScene.lines.map((l) => l.line), queue: speechQ.map((q) => q.lines.map((l) => l.line).join(' → ')), missing: Object.keys(voiceOk).filter((k) => voiceOk[k] === false) }),
    say: (file) => say(dbgLine(file)),
    dialog: (...files) => sayDialog(...files.map(dbgLine)),
    bark: (file) => bark(dbgLine(file)),
    silent() { voice.muted = true; music.muted = true; },
    npc(kind) { let n = npcs.find((m) => m.kind === kind); if (!n) n = spawnNpc(kind); if (kind !== 'animator') { n.x = player.pos.x - Math.sin(player.yaw) * 8; n.z = player.pos.z - Math.cos(player.yaw) * 8; n.state = 'come'; } return n.kind; },
    npcInfo: () => npcs.map((n) => ({ kind: n.kind, state: n.state, d: Math.round(Math.hypot(player.pos.x - n.x, player.pos.z - n.z)) })),
    music: () => ({ on: musicOn, vol: +musicVol.toFixed(2), bg: Snd.bgInfo(), paused: music.paused, t: +music.currentTime.toFixed(1) }),
    drops: () => pickups.map((p) => p.kind + (p.kind === 'heart' ? ':' + (p.item ? p.item.id : 'HEART') : '')),
    food() { FOOD.forEach((f, i) => dropPickup('heart', player.pos.x - 1.6 + i * 1.6, player.pos.z - 5, f)); return !!pickMats.food; },
    tp(x, z, yaw = 0, pitch = -.1) { player.pos.set(x, H(x, z), z); player.yaw = yaw; player.pitch = pitch; },
    toBed(paid = true) { const b = sunbeds.find((x) => x.paid === paid); player.pos.set(b.x + 2.2, H(b.x + 2.2, b.z), b.z); player.yaw = Math.PI / 2; player.pitch = -.25; return paid; },
    beach: () => ({ ads: adsEl.children.length, monkey: monkeyT > 0, invert: invertControls, sunbeds: sunbeds.length, paid: sunbeds.filter((b) => b.paid).length }),
    dropTrip() { const it = tripLeft.shift(); if (it) dropPickup('trip', player.pos.x - Math.sin(player.yaw) * 2.5, player.pos.z - Math.cos(player.yaw) * 2.5, it); return it && it.name; },
    trip: () => ({ got: tripGot, left: tripLeft.length, speech: speech.querySelector('p').textContent, voice: voice.src.split('/').pop() }),
    kami() {
      if (!KAMI) return null;
      const r = THREE.SkeletonUtils.clone(KAMI.scene); r.updateMatrixWorld(true);
      const v = new THREE.Vector3(), out = { srcH: KAMI.srcH, scale: KAMI.scale, minY: KAMI.minY, bones: {} };
      for (const n of ['Hips', 'neck', 'LeftHand', 'LeftToeBase', 'LeftFoot']) { const b = r.getObjectByName(n); if (b) { b.getWorldPosition(v); out.bones[n] = v.toArray().map((x) => +x.toFixed(3)); } }
      r.traverse((o) => { if (o.isSkinnedMesh) { out.meshScale = o.getWorldScale(v).toArray().map((x) => +x.toFixed(4)); o.geometry.computeBoundingBox(); out.geoBox = [o.geometry.boundingBox.min.toArray(), o.geometry.boundingBox.max.toArray()].map((a) => a.map((x) => +x.toFixed(3))); } });
      return out;
    },
    play() { autoPause = false; setState('playing'); },
    win: () => winGame(),
    boss(dist = 25) {   // поставить Начальника перед игроком
      spawnEnemy('boss', player.pos.x - Math.sin(player.yaw) * dist, player.pos.z - Math.cos(player.yaw) * dist);
      const e = enemies[enemies.length - 1];
      return { chief: !!e.chief, hp: e.hp };
    },
    bossPose(t) { const e = enemies.find((o) => o.chief); if (e) e.pose = t; },
    bossInfo: () => { const e = enemies.find((o) => o.boss); return e && { d: +Math.hypot(e.x - player.pos.x, e.z - player.pos.z).toFixed(1), hp: Math.round(e.hp), swing: +(e.swing || 0).toFixed(2), step: e.step, floor: Math.round(bossFloor(e)) }; },
    wave(n) { for (const e of enemies) { e.dead = true; removeEnemyObj(e); } enemies.length = 0; startWave(n); },
    types: () => enemies.map((e) => e.type),
    screams: () => enemies.filter((e) => e.audio && e.audio._owner === e).map((e) => ({ paused: e.audio.paused, vol: +(e.audio._vol || 0).toFixed(2), ready: e.audio.readyState, t: +e.audio.currentTime.toFixed(2) })),
    near(type) {   // подтянуть ближайшего врага типа type на 14 м перед игроком
      const e = enemies.find((o) => o.type === type); if (!e) return null;
      e.x = player.pos.x - Math.sin(player.yaw) * 14; e.z = player.pos.z - Math.cos(player.yaw) * 14;
      return enemies.indexOf(e);
    },
  };
}

/* ═════════════ Загрузка ═════════════ */

(async () => {
  try {
    [...TRIP_ITEMS, TRIP_DONE, ...Object.values(LINES), ...FOOD.map((f) => f.line)].forEach((l) => probeVoice(l.file));
    KAMI = await loadKamikaze();
    HUST = await loadHustler();
    BOSS = await loadBoss();
    DANCER = await loadDancer();
    const [suit, flam] = await Promise.all([parseGLB('suitcase'), parseGLB('flamingo')]);
    if (suit) swapWeapon(0, weaponFromGLB(suit, { size: .6, pos: [.34, -.3, -.78], yaw: .32, flash: .3 }));
    if (flam) swapWeapon(1, weaponFromGLB(flam, { size: .66, pos: [.34, -.29, -.78], yaw: .3, flash: .26 }));
    const [heart, coin] = await Promise.all([loadImage(A.heart), loadImage(A.coin)]);
    const foodImgs = await Promise.all(FOOD.map((f) => (A[f.id] ? loadImage(A[f.id]).catch(() => null) : null)));
    pickMats.food = foodImgs.map((im, i) => new THREE.SpriteMaterial({ map: tex(im ? imgCanvas(im) : emojiCanvas(FOOD[i].emoji)), alphaTest: .3 }));
    const spriteMat = (t) => new THREE.SpriteMaterial({ map: t, alphaTest: .3 });
    pickMats.coin = spriteMat(tex(imgCanvas(coin)));
    pickMats.ammo = spriteMat(ammoTex);
  } catch (err) {
    console.error('Не удалось загрузить спрайты', err);
  }
  selectWeapon(0, true);
  setState('menu');
  const b = $('btnStart');
  b.disabled = false; b.textContent = 'Начать';
  requestAnimationFrame(frame);
})();

})();
