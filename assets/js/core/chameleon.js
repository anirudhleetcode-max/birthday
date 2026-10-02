// A tiny, ORIGINAL chameleon companion — "the little one".
//
// Not anybody's sidekick: a round tear-drop bean of a body in soft mint, a row
// of three little gold stars for a crest, freckles, a cream belly, mitten feet,
// an extra-curly tail that ends in a tiny leaf, and sleepy half-lidded eyes
// with long lashes. Personality: shy, dramatic, easily embarrassed. It blinks,
// curls its tail, does tiny hops, and changes colour with a soft gradient
// sweep from tail to nose.
//
//   const ch = createChameleon(container, { size: 110, color: '#86d3bf', onTap });
//   ch.el.style.right = '6vw'; ch.el.style.bottom = '0';     // the caller positions it
//   await ch.peek('right' | 'left' | 'bottom');  await ch.hide();
//   ch.colorTo('#f6a9c9'); ch.blush(); ch.react('surprised'|'happy'|'sleepy'|'proud'|'faint');
//   ch.recover(); ch.lookAt(x, y) /* viewport px, or null to let it wander */; ch.destroy();
//
// Self-contained (injects its own small stylesheet) so any chapter can use it.

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
let styled = false;

const CSS = `
.chm{position:absolute;width:var(--chm-w,120px);aspect-ratio:240/190;cursor:pointer;touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;visibility:hidden;z-index:5}
.chm.is-out{visibility:visible}
.chm-mover,.chm-flip{position:absolute;inset:0}
.chm svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;display:block;
  filter:drop-shadow(0 .06em .1em rgba(12,4,24,.45))}
.chm:focus{outline:none}
.chm:focus-visible{outline:none}
.chm:focus-visible .chm-flip::after{content:'';position:absolute;inset:-6% -4%;border-radius:46%;
  border:1.5px dashed rgba(255,227,163,.85)}
`;

function injectStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'chameleon-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ---------------- colour helpers ---------------- */
function hexToRgb(hex) {
  let h = String(hex || '#86d3bf').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
/** The three tones of a skin: base, shadow, belly. */
function tones(base) {
  return {
    skin: base,
    dark: mix(mix(base, '#1d2440', 0.42), base, 0.1),
    light: mix(base, '#fffbea', 0.45),
    belly: mix('#fff3dc', base, 0.16),
  };
}

/* ---------------- geometry ---------------- */
const BODY = 'M78 128 C82 98 108 70 146 68 C182 66 202 92 200 118 C198 146 172 162 138 162 C112 162 92 152 78 138 Z';
const LEG = 'M150 148 C149 159 152 167 157 170 C161 173 167 172 169 169 C171 172 176 171 177 167 C178 163 173 161 168 162 C165 159 163 154 162 148 Z';
const EYE = { x: 166, y: 101 };

function star(cx, cy, r, rot) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.46 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)} `;
  }
  return `${d}Z`;
}

/** The extra-curly tail as a filled, tapering spiral. Returns { d, tip, ang }. */
function tailGeometry(curl = 1) {
  const C = { x: 52, y: 125 };
  const root = { x: 82, y: 133 };
  const r0 = Math.hypot(root.x - C.x, root.y - C.y);
  const th0 = Math.atan2(root.y - C.y, root.x - C.x);
  const turns = 1.72 * curl;
  const N = 44;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = th0 + t * turns * Math.PI * 2;
    const r = r0 * (1 - 0.76 * Math.pow(t, 0.8));
    pts.push({ x: C.x + Math.cos(th) * r, y: C.y + Math.sin(th) * r, t });
  }
  const L = [];
  const R = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const q = pts[Math.min(N, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const tx = q.x - o.x;
    const ty = q.y - o.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const w = (16 * Math.pow(1 - p.t, 0.7) + 2.4) / 2;
    L.push(`${(p.x + nx * w).toFixed(2)} ${(p.y + ny * w).toFixed(2)}`);
    R.push(`${(p.x - nx * w).toFixed(2)} ${(p.y - ny * w).toFixed(2)}`);
  }
  const tip = pts[N];
  const pre = pts[N - 2];
  const ang = (Math.atan2(tip.y - pre.y, tip.x - pre.x) * 180) / Math.PI;
  const d = `M${L.join(' L')} L${R.reverse().join(' L')} Z`;
  return { d, tip, ang };
}

function spiralPath(r = 8.5) {
  let d = '';
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 4.2;
    const rr = 0.6 + t * r;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)} `;
  }
  return d;
}

function svgMarkup(id, c) {
  const g = (n) => `${n}-${id}`;
  const stops = (name, col) => `
      <linearGradient id="${g(name)}" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="206" y2="0">
        <stop offset="0" stop-color="${col}"/><stop offset="0" stop-color="${col}"/>
        <stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}"/>
      </linearGradient>`;
  const tail = tailGeometry(1);
  return `
<svg viewBox="0 0 240 190" xmlns="${NS}" aria-hidden="true" focusable="false">
  <defs>
    ${stops('skin', c.skin)}${stops('dark', c.dark)}${stops('belly', c.belly)}${stops('light', c.light)}
    <clipPath id="${g('bodyclip')}"><path d="${BODY}"/></clipPath>
    <clipPath id="${g('eyeclip')}"><circle cx="0" cy="0" r="10.6"/></clipPath>
    <radialGradient id="${g('hi')}" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" fx=".5" fy=".5">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g('shade')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".5" stop-color="#14122a" stop-opacity="0"/><stop offset="1" stop-color="#14122a" stop-opacity=".26"/>
    </linearGradient>
    <linearGradient id="${g('gold')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c8"/><stop offset=".55" stop-color="#f4c463"/><stop offset="1" stop-color="#d79a3c"/>
    </linearGradient>
    <linearGradient id="${g('leaf')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6fae6a"/><stop offset="1" stop-color="#b8e39a"/>
    </linearGradient>
  </defs>
  <g class="chm-all">
    <g class="chm-tail">
      <path class="chm-tail-shape" d="${tail.d}" fill="url(#${g('skin')})" stroke="url(#${g('dark')})" stroke-width="1.6" stroke-linejoin="round"/>
      <g class="chm-leaf" transform="translate(${tail.tip.x.toFixed(2)} ${tail.tip.y.toFixed(2)}) rotate(${(tail.ang + 35).toFixed(1)})">
        <path d="M0 0 C4 -8 13 -9.5 19 -1.5 C13 5.5 4 5 0 0 Z" fill="url(#${g('leaf')})" stroke="#4f8a52" stroke-width=".9"/>
        <path d="M1.5 -.2 Q9 -2 17 -1.6" stroke="#4f8a52" stroke-width=".7" fill="none"/>
      </g>
    </g>
    <g class="chm-legs" fill="url(#${g('dark')})">
      <path d="${LEG}" transform="translate(-54 -3)"/>
      <path d="${LEG}"/>
    </g>
    <g class="chm-body">
      <path class="chm-skin" d="${BODY}" fill="url(#${g('skin')})"/>
      <g clip-path="url(#${g('bodyclip')})">
        <ellipse cx="146" cy="176" rx="74" ry="34" fill="url(#${g('belly')})"/>
        <path d="M86 150 C110 160 150 164 186 146" fill="none" stroke="url(#${g('dark')})" stroke-opacity=".28" stroke-width="1.4"/>
        <ellipse cx="134" cy="88" rx="44" ry="17" transform="rotate(-14 134 88)" fill="url(#${g('hi')})"/>
        <rect x="70" y="60" width="140" height="110" fill="url(#${g('shade')})"/>
        <g class="chm-freckles" fill="url(#${g('light')})" opacity=".85">
          <circle cx="108" cy="104" r="3.2"/><circle cx="122" cy="95" r="2.4"/><circle cx="97" cy="117" r="2.3"/>
          <circle cx="131" cy="110" r="1.8"/><circle cx="114" cy="122" r="1.5"/>
        </g>
      </g>
      <path d="M147 71 C137 92 139 122 151 147" fill="none" stroke="url(#${g('dark')})" stroke-opacity=".22" stroke-width="1.6" stroke-linecap="round"/>
      <path d="${BODY}" fill="none" stroke="url(#${g('dark')})" stroke-width="2"/>
      <g class="chm-crest" fill="url(#${g('gold')})" stroke="#c98f2b" stroke-width=".9" stroke-linejoin="round">
        <path class="chm-star s1" d="${star(101, 81, 5.6, -40)}"/>
        <path class="chm-star s2" d="${star(121, 69, 7.6, -22)}"/>
        <path class="chm-star s3" d="${star(146, 62, 10.2, -6)}"/>
      </g>
      <ellipse class="chm-cheek" cx="187" cy="123" rx="9.5" ry="5.4" fill="#ff8fb8" opacity=".2"/>
      <g class="chm-cheek-freckles" fill="url(#${g('dark')})" opacity=".55">
        <circle cx="190" cy="112" r="1.1"/><circle cx="194.5" cy="115.5" r="1.1"/><circle cx="188" cy="116.5" r="1"/>
      </g>
      <path class="chm-mouth" d="M168 131 Q184 141 198 128" fill="none" stroke="url(#${g('dark')})" stroke-width="2.1" stroke-linecap="round"/>
      <path class="chm-mouth-o" d="M186 135 m-3.2 0 a3.2 3.6 0 1 0 6.4 0 a3.2 3.6 0 1 0 -6.4 0" fill="#5a2a3e" opacity="0"/>
      <g class="chm-eye" transform="translate(${EYE.x} ${EYE.y})">
        <circle r="17" fill="url(#${g('skin')})" stroke="url(#${g('dark')})" stroke-width="2"/>
        <path d="M-12 7 A14 14 0 0 1 -9 -9" fill="none" stroke="url(#${g('dark')})" stroke-opacity=".45" stroke-width="1.2"/>
        <path d="M-15.5 1 A15.5 15.5 0 0 1 -13 -8" fill="none" stroke="url(#${g('dark')})" stroke-opacity=".3" stroke-width="1"/>
        <g class="chm-open">
          <circle r="10.6" fill="#fffaf0"/>
          <g class="chm-pupil"><circle r="6" fill="#26162e"/><circle cx="2.2" cy="-2.4" r="1.9" fill="#fff"/><circle cx="-2" cy="2" r=".9" fill="#fff" opacity=".8"/></g>
          <g clip-path="url(#${g('eyeclip')})">
            <g class="chm-lid">
              <path d="M-14 -30 H14 V0 Q0 4.5 -14 0 Z" fill="url(#${g('skin')})"/>
              <path d="M-12 0.4 Q0 4.6 12 0.4" fill="none" stroke="url(#${g('dark')})" stroke-width="1.8" stroke-linecap="round"/>
            </g>
          </g>
          <g class="chm-lashes" fill="none" stroke="#26162e" stroke-width="1.35" stroke-linecap="round">
            <path d="M5 2.6 Q9.5 5.5 13.5 4.2"/><path d="M8 1.6 Q13 2 16.5 -1.4"/><path d="M10.5 0.2 Q14.5 -2.6 16 -6.6"/>
          </g>
        </g>
        <path class="chm-happy" d="M-8 3 Q0 -7.5 8 3" fill="none" stroke="#26162e" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
        <path class="chm-dizzy" d="${spiralPath()}" fill="none" stroke="#26162e" stroke-width="1.6" stroke-linecap="round" opacity="0"/>
      </g>
    </g>
    <g class="chm-marks" fill="none" stroke-linecap="round"></g>
  </g>
</svg>`;
}

/**
 * Create the little one inside `container`.
 * @param {HTMLElement} container
 * @param {{size?:number|string, color?:string, onTap?:Function, label?:string, reducedMotion?:boolean, interactive?:boolean, className?:string}} opts
 */
export function createChameleon(container, opts = {}) {
  injectStyle();
  const gsap = window.gsap;
  const id = `chm${++uid}`;
  const reduced = opts.reducedMotion ?? (document.documentElement.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const base = opts.color || '#86d3bf';
  let col = tones(base);
  let baseColor = base;

  const el = document.createElement('div');
  el.className = `chm ${opts.className || ''}`.trim();
  el.style.setProperty('--chm-w', typeof opts.size === 'number' ? `${opts.size}px` : (opts.size || '120px'));
  if (opts.interactive !== false) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', opts.label || 'A tiny, shy chameleon');
  } else {
    el.setAttribute('aria-hidden', 'true');
    el.style.pointerEvents = 'none';
  }
  el.innerHTML = `<div class="chm-mover"><div class="chm-flip">${svgMarkup(id, col)}</div></div>`;
  container.appendChild(el);

  const q = (s) => el.querySelector(s);
  const mover = q('.chm-mover');
  const flip = q('.chm-flip');
  const all = q('.chm-all');
  const body = q('.chm-body');
  const tailShape = q('.chm-tail-shape');
  const tailG = q('.chm-tail');
  const leaf = q('.chm-leaf');
  const lid = q('.chm-lid');
  const lashes = q('.chm-lashes');
  const pupil = q('.chm-pupil');
  const openEye = q('.chm-open');
  const happy = q('.chm-happy');
  const dizzy = q('.chm-dizzy');
  const cheek = q('.chm-cheek');
  const mouth = q('.chm-mouth');
  const mouthO = q('.chm-mouth-o');
  const stars = [...el.querySelectorAll('.chm-star')];
  const marks = q('.chm-marks');
  const grads = ['skin', 'dark', 'belly', 'light'].map((n) => [...el.querySelectorAll(`#${n}-${id} stop`)]);

  gsap.set(all, { svgOrigin: '130 168' }); // between the feet
  gsap.set(body, { svgOrigin: '138 162' });
  gsap.set(tailG, { svgOrigin: '82 133' });
  gsap.set(stars, { transformOrigin: '50% 80%' });

  const state = {
    lid: -1.5, // sleepy half-lid (−11 wide open … +11 closed)
    blink: 0, // 0..1 extra closing for blinks
    curl: 1,
    px: 0, py: 0, ps: 1, // pupil offset & size
    spin: 0, // dizzy spiral
    look: null,
    side: 'bottom',
    facing: 1, // 1 → faces right, −1 → faces left
    out: false,
    fainted: false,
    busy: false,
    dead: false,
  };
  const timers = new Set();
  const tweens = new Set();
  const keep = (tw) => { tweens.add(tw); return tw; };
  const later = (s, fn) => {
    const d = gsap.delayedCall(s, () => { timers.delete(d); if (!state.dead) fn(); });
    timers.add(d);
    return d;
  };
  const wait = (s) => new Promise((r) => later(s, r));

  /* ---------- render helpers ---------- */
  function renderLid() {
    const y = state.lid + (11 - state.lid) * state.blink;
    lid.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
    lashes.setAttribute('transform', `translate(0 ${(y + 0.2).toFixed(2)})`);
  }
  function renderPupil() {
    pupil.setAttribute('transform', `translate(${state.px.toFixed(2)} ${state.py.toFixed(2)}) scale(${state.ps.toFixed(3)})`);
  }
  function renderSpin() {
    dizzy.setAttribute('transform', `rotate(${state.spin.toFixed(1)})`);
  }
  function renderTail() {
    const t = tailGeometry(state.curl);
    tailShape.setAttribute('d', t.d);
    leaf.setAttribute('transform', `translate(${t.tip.x.toFixed(2)} ${t.tip.y.toFixed(2)}) rotate(${(t.ang + 35).toFixed(1)})`);
  }
  renderLid();
  renderPupil();

  /* ---------- colour: a soft gradient sweep from tail to nose ---------- */
  const sweep = { s: 1.2, from: col, to: col };
  function paintSweep() {
    const W = 0.22;
    const a = Math.max(0, Math.min(1, sweep.s - W));
    const b = Math.max(0, Math.min(1, sweep.s));
    const keys = ['skin', 'dark', 'belly', 'light'];
    grads.forEach((st, k) => {
      if (st.length < 4) return;
      const key = keys[k];
      st[0].setAttribute('stop-color', sweep.to[key]);
      st[1].setAttribute('offset', a.toFixed(4));
      st[1].setAttribute('stop-color', sweep.to[key]);
      st[2].setAttribute('offset', b.toFixed(4));
      st[2].setAttribute('stop-color', sweep.from[key]);
      st[3].setAttribute('stop-color', sweep.from[key]);
    });
  }
  let sweepTween = null;
  function colorTo(hex, { duration = 1.3, remember = true } = {}) {
    if (state.dead) return Promise.resolve();
    const target = tones(hex);
    if (remember) baseColor = hex;
    sweepTween && sweepTween.kill();
    // whatever is on screen right now becomes the "from" colour
    sweep.from = col;
    sweep.to = target;
    col = target;
    sweep.s = 0;
    paintSweep();
    return new Promise((res) => {
      sweepTween = keep(gsap.to(sweep, {
        s: 1.22, duration: reduced ? Math.min(0.6, duration) : duration, ease: 'sine.inOut',
        onUpdate: paintSweep,
        onComplete: () => { sweep.from = target; paintSweep(); res(); },
      }));
    });
  }

  /* ---------- idle life ---------- */
  function blink(double = false) {
    if (state.dead || state.fainted) return;
    const tl = gsap.timeline({ onUpdate: renderLid });
    tl.to(state, { blink: 1, duration: 0.09, ease: 'power2.in' })
      .to(state, { blink: 0, duration: 0.16, ease: 'power2.out' });
    if (double) tl.to(state, { blink: 1, duration: 0.08, ease: 'power2.in', delay: 0.08 }).to(state, { blink: 0, duration: 0.16 });
    keep(tl);
  }
  function scheduleBlink() {
    later(2.2 + Math.random() * 3.6, () => {
      for (const t of tweens) if (t && t.progress && t.progress() === 1 && !(t.repeat && t.repeat() < 0)) tweens.delete(t);
      if (!state.busy) blink(Math.random() < 0.22);
      scheduleBlink();
    });
  }
  function scheduleWander() {
    later(2.4 + Math.random() * 3.2, () => {
      if (!state.look && !state.busy && !state.fainted) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 3.8;
        keep(gsap.to(state, { px: Math.cos(a) * r, py: Math.sin(a) * r * 0.8, duration: 0.35, ease: 'power2.out', onUpdate: renderPupil }));
      }
      scheduleWander();
    });
  }
  scheduleBlink();
  scheduleWander();
  const breathe = keep(gsap.to(body, { scaleY: 1.022, scaleX: 0.992, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  const tailLife = reduced ? null : keep(gsap.to(state, { curl: 1.08, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: renderTail }));
  const tailSway = reduced ? null : keep(gsap.to(tailG, { rotation: -4, duration: 3.1, ease: 'sine.inOut', yoyo: true, repeat: -1 }));

  /* ---------- little marks (surprise lines, hearts, z's) ---------- */
  function mark(kind, i = 0) {
    const g = document.createElementNS(NS, 'g');
    let tween;
    if (kind === 'line') {
      const a = (-70 + i * 32) * (Math.PI / 180);
      const x = 172 + Math.cos(a) * 30;
      const y = 74 + Math.sin(a) * 30;
      g.innerHTML = `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a) * 9).toFixed(1)} ${(Math.sin(a) * 9).toFixed(1)}" stroke="#fff4e0" stroke-width="2.6"/>`;
      marks.appendChild(g);
      tween = gsap.fromTo(g, { opacity: 0, scale: 0.4, svgOrigin: '172 74' }, { opacity: 1, scale: 1.15, duration: 0.18, yoyo: true, repeat: 1, repeatDelay: 0.25, ease: 'power2.out', onComplete: () => g.remove() });
    } else if (kind === 'heart') {
      const x = 170 + i * 14;
      g.innerHTML = `<path transform="translate(${x} 70) scale(.42)" d="M0 10 C-12 2 -16 -4 -16 -9 C-16 -15 -11 -18 -7 -18 C-3 -18 -1 -16 0 -13 C1 -16 3 -18 7 -18 C11 -18 16 -15 16 -9 C16 -4 12 2 0 10 Z" fill="#ff8fb8" stroke="none"/>`;
      marks.appendChild(g);
      tween = gsap.fromTo(g, { opacity: 0, y: 6 }, { opacity: 1, y: -22 - i * 6, duration: 1.2, ease: 'power1.out', delay: i * 0.14, onComplete: () => gsap.to(g, { opacity: 0, duration: 0.4, onComplete: () => g.remove() }) });
    } else if (kind === 'z') {
      const s = 0.8 + i * 0.25;
      g.innerHTML = `<path transform="translate(${180 + i * 9} ${66 - i * 10}) scale(${s})" d="M-4 -4 H4 L-4 4 H4" stroke="#fff4e0" stroke-width="1.8" stroke-linejoin="round"/>`;
      marks.appendChild(g);
      tween = gsap.fromTo(g, { opacity: 0, y: 4 }, { opacity: 0.9, y: -14, duration: 1.1, delay: i * 0.45, ease: 'sine.out', onComplete: () => gsap.to(g, { opacity: 0, duration: 0.4, onComplete: () => g.remove() }) });
    } else if (kind === 'sweat') {
      g.innerHTML = '<path transform="translate(150 76)" d="M0 -6 C3 -1 4 2 4 3.5 A4 4 0 0 1 -4 3.5 C-4 2 -3 -1 0 -6 Z" fill="#cfeaff" stroke="#8fb8d8" stroke-width=".8"/>';
      marks.appendChild(g);
      tween = gsap.fromTo(g, { opacity: 0, y: -4 }, { opacity: 1, y: 8, duration: 0.9, ease: 'power1.in', onComplete: () => gsap.to(g, { opacity: 0, duration: 0.3, onComplete: () => g.remove() }) });
    }
    tween && keep(tween);
  }

  /* ---------- eye states ---------- */
  function eyeMode(mode) {
    gsap.to(openEye, { opacity: mode === 'open' ? 1 : 0, duration: 0.12 });
    gsap.to(happy, { opacity: mode === 'happy' ? 1 : 0, duration: 0.12 });
    gsap.to(dizzy, { opacity: mode === 'dizzy' ? 1 : 0, duration: 0.12 });
  }
  function lidTo(v, d = 0.3) {
    return keep(gsap.to(state, { lid: v, duration: d, ease: 'power2.out', onUpdate: renderLid }));
  }
  function hop(h = 16, n = 1) {
    if (reduced) return keep(gsap.fromTo(all, { scaleY: 1 }, { scaleY: 1.04, duration: 0.15, yoyo: true, repeat: 1 }));
    const tl = gsap.timeline();
    for (let i = 0; i < n; i++) {
      tl.to(all, { scaleY: 0.86, scaleX: 1.08, duration: 0.09, ease: 'power2.in' })
        .to(all, { y: -h, scaleY: 1.1, scaleX: 0.94, duration: 0.2, ease: 'power2.out' })
        .to(all, { y: 0, scaleY: 1, scaleX: 1, duration: 0.2, ease: 'power2.in' })
        .to(all, { scaleY: 0.92, scaleX: 1.05, duration: 0.07, ease: 'power1.out' })
        .to(all, { scaleY: 1, scaleX: 1, duration: 0.14, ease: 'power1.out' });
    }
    return keep(tl);
  }

  /* ---------- public API ---------- */
  const OFF = { right: { xPercent: 125, yPercent: 0 }, left: { xPercent: -125, yPercent: 0 }, bottom: { xPercent: 0, yPercent: 108 }, top: { xPercent: 0, yPercent: -108 } };
  gsap.set(mover, OFF.bottom);

  function face(dir) {
    state.facing = dir;
    gsap.set(flip, { scaleX: dir });
  }

  async function peek(side = 'bottom', { duration = 1.1 } = {}) {
    if (state.dead) return;
    state.side = OFF[side] ? side : 'bottom';
    if (state.side === 'right') face(-1);
    else if (state.side === 'left') face(1);
    el.classList.add('is-out');
    state.out = true;
    gsap.killTweensOf(mover);
    gsap.set(mover, OFF[state.side]);
    const tl = gsap.timeline();
    if (reduced) tl.to(mover, { xPercent: 0, yPercent: 0, duration: 0.6, ease: 'power2.out' });
    else {
      // creeps in, pauses (shy), then the last little bit
      const half = { xPercent: OFF[state.side].xPercent * 0.42, yPercent: OFF[state.side].yPercent * 0.42 };
      tl.to(mover, { ...half, duration: duration * 0.55, ease: 'power2.out' })
        .to(mover, { xPercent: 0, yPercent: 0, duration: duration * 0.45, ease: 'back.out(1.6)' }, `+=${0.35}`);
    }
    keep(tl);
    await tl.then();
    if (state.dead) return;
    blink();
  }

  async function hide({ duration = 0.6 } = {}) {
    if (state.dead || !state.out) return;
    gsap.killTweensOf(mover);
    const tl = gsap.timeline();
    if (!reduced) tl.to(all, { y: -6, duration: 0.12, ease: 'power2.out' }).to(all, { y: 0, duration: 0.1 });
    tl.to(mover, { ...OFF[state.side], duration, ease: 'power3.in' });
    keep(tl);
    await tl.then();
    if (state.dead) return;
    state.out = false;
    el.classList.remove('is-out');
  }

  async function blush(on = true, { hold = 1.6 } = {}) {
    if (state.dead) return;
    if (!on) { keep(gsap.to(cheek, { opacity: 0.2, duration: 1 })); return; }
    state.busy = true;
    keep(gsap.to(cheek, { opacity: 0.95, duration: 0.45, ease: 'power2.out' }));
    eyeMode('happy');
    if (!reduced) keep(gsap.to(all, { scaleX: 0.95, scaleY: 1.03, rotation: state.facing * 3, duration: 0.3, ease: 'power2.out' }));
    for (let i = 0; i < 3; i++) mark('heart', i);
    await wait(hold);
    eyeMode('open');
    keep(gsap.to(all, { scaleX: 1, scaleY: 1, rotation: 0, duration: 0.5, ease: 'power2.out' }));
    keep(gsap.to(cheek, { opacity: 0.55, duration: 1.4 }));
    blink();
    state.busy = false;
  }

  async function react(kind = 'happy') {
    if (state.dead) return;
    if (kind === 'recover') return recover();
    if (state.fainted && kind !== 'faint') await recover();
    state.busy = true;
    if (kind === 'surprised') {
      eyeMode('open');
      lidTo(-11, 0.08);
      keep(gsap.to(state, { ps: 0.7, duration: 0.1, onUpdate: renderPupil }));
      keep(gsap.to(mouthO, { opacity: 1, duration: 0.1 }));
      keep(gsap.to(mouth, { opacity: 0, duration: 0.1 }));
      keep(gsap.fromTo(stars, { scale: 1 }, { scale: 1.3, duration: 0.14, yoyo: true, repeat: 1, stagger: 0.04 }));
      for (let i = 0; i < 4; i++) mark('line', i);
      hop(22, 1);
      await wait(1.1);
      keep(gsap.to(state, { ps: 1, duration: 0.3, onUpdate: renderPupil }));
      keep(gsap.to(mouthO, { opacity: 0, duration: 0.2 }));
      keep(gsap.to(mouth, { opacity: 1, duration: 0.2 }));
      lidTo(-1.5, 0.6);
    } else if (kind === 'happy') {
      eyeMode('happy');
      hop(14, 2);
      if (!reduced) keep(gsap.fromTo(state, { curl: 1 }, { curl: 1.18, duration: 0.25, yoyo: true, repeat: 3, onUpdate: renderTail }));
      await wait(1.3);
      eyeMode('open');
      blink();
    } else if (kind === 'sleepy') {
      lidTo(6.5, 0.9);
      if (!reduced) keep(gsap.to(all, { rotation: state.facing * -4, duration: 1.1, yoyo: true, repeat: 1, ease: 'sine.inOut' }));
      for (let i = 0; i < 3; i++) mark('z', i);
      await wait(2.4);
      lidTo(-1.5, 0.5);
    } else if (kind === 'proud') {
      lidTo(1.5, 0.3);
      keep(gsap.to(all, { scale: 1.07, rotation: -6, duration: 0.45, ease: 'back.out(2)' }));
      keep(gsap.fromTo(stars, { scale: 1 }, { scale: 1.22, duration: 0.22, yoyo: true, repeat: 1, stagger: 0.08, ease: 'power2.out' }));
      await wait(1.5);
      keep(gsap.to(all, { scale: 1, rotation: 0, duration: 0.5, ease: 'power2.out' }));
      lidTo(-1.5, 0.5);
    } else if (kind === 'faint') {
      if (state.fainted) { state.busy = false; return; }
      state.fainted = true;
      // the drama: a wobble, a gasp, eyes spiral, colour drains, and over it goes
      lidTo(-11, 0.08);
      keep(gsap.to(mouthO, { opacity: 1, duration: 0.1 }));
      keep(gsap.to(mouth, { opacity: 0, duration: 0.1 }));
      mark('sweat');
      if (!reduced) await keep(gsap.to(all, { rotation: 6, duration: 0.09, yoyo: true, repeat: 5, ease: 'sine.inOut' })).then();
      if (state.dead) return;
      eyeMode('dizzy');
      keep(gsap.fromTo(state, { spin: 0 }, { spin: 360, duration: 1.4, repeat: -1, ease: 'none', onUpdate: renderSpin }));
      colorTo(mix(baseColor, '#eef4f0', 0.62), { duration: 0.9, remember: false });
      gsap.set(all, { y: 0, scale: 1, scaleX: 1, scaleY: 1 });
      gsap.set(all, { svgOrigin: '134 112' });
      const tl = gsap.timeline();
      if (reduced) tl.to(all, { rotation: -16, duration: 0.5 });
      else {
        // leans back… holds the pose (it's dramatic)… and goes over onto its back, feet up
        tl.to(all, { rotation: -16, duration: 0.45, ease: 'power1.inOut' })
          .to(all, { rotation: -22, duration: 0.5, ease: 'sine.inOut' })
          .to(all, { rotation: -180, y: 8, duration: 0.5, ease: 'power3.in' })
          .to(all, { y: -2, rotation: -172, duration: 0.14, ease: 'power2.out' })
          .to(all, { y: 8, rotation: -180, duration: 0.3, ease: 'bounce.out' });
      }
      keep(tl);
      await tl.then();
    }
    state.busy = false;
  }

  async function recover() {
    if (state.dead || !state.fainted) return;
    state.fainted = false;
    state.busy = true;
    tweens.forEach((t) => { if (t && t.vars && t.vars.onUpdate === renderSpin) t.kill(); });
    state.spin = 0;
    renderSpin();
    const tl = gsap.timeline();
    tl.to(all, { rotation: 0, y: 0, duration: reduced ? 0.4 : 0.55, ease: 'back.out(2.2)' })
      .add(() => gsap.set(all, { svgOrigin: '130 168' }));
    if (!reduced) tl.to(all, { rotation: 5, duration: 0.08, yoyo: true, repeat: 3 });
    keep(tl);
    colorTo(baseColor, { duration: 0.9 });
    eyeMode('open');
    keep(gsap.to(mouthO, { opacity: 0, duration: 0.2 }));
    keep(gsap.to(mouth, { opacity: 1, duration: 0.2 }));
    lidTo(-1.5, 0.4);
    await tl.then();
    blink(true);
    state.busy = false;
  }

  function lookAt(x, y) {
    if (state.dead) return;
    if (x == null) { state.look = null; return; }
    state.look = { x, y };
    const r = q('.chm-eye').getBoundingClientRect();
    if (!r.width) return;
    let dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    dx *= state.facing;
    const len = Math.hypot(dx, dy) || 1;
    const m = Math.min(4.2, len / 30);
    keep(gsap.to(state, { px: (dx / len) * m, py: (dy / len) * m * 0.85, duration: 0.3, ease: 'power2.out', onUpdate: renderPupil }));
  }

  /* ---------- tap: a small embarrassed reaction ---------- */
  let lastTap = 0;
  function tapped(e) {
    if (e) { e.stopPropagation(); }
    const now = performance.now();
    if (now - lastTap < 700) return;
    lastTap = now;
    if (state.fainted) recover();
    else if (!state.busy) {
      const roll = Math.random();
      if (roll < 0.45) react('surprised').then(() => blush(true, { hold: 1 }));
      else if (roll < 0.8) blush(true, { hold: 1.4 });
      else react('happy');
    }
    if (typeof opts.onTap === 'function') {
      try { opts.onTap(api); } catch (err) { console.warn('[chameleon] onTap', err); }
    }
  }
  const stop = (e) => e.stopPropagation();
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); tapped(); }
  };
  if (opts.interactive !== false) {
    el.addEventListener('pointerdown', stop);
    el.addEventListener('click', tapped);
    el.addEventListener('keydown', onKey);
  }

  function destroy() {
    if (state.dead) return;
    state.dead = true;
    timers.forEach((t) => t.kill());
    timers.clear();
    tweens.forEach((t) => t && t.kill && t.kill());
    tweens.clear();
    breathe.kill();
    tailLife && tailLife.kill();
    tailSway && tailSway.kill();
    sweepTween && sweepTween.kill();
    gsap.killTweensOf([el, mover, flip, all, body, tailG, pupil, cheek, mouth, mouthO, openEye, happy, dizzy, state, sweep, ...stars, ...marks.children]);
    el.removeEventListener('pointerdown', stop);
    el.removeEventListener('click', tapped);
    el.removeEventListener('keydown', onKey);
    el.remove();
  }

  const api = {
    el,
    peek,
    hide,
    colorTo,
    blush,
    react,
    recover,
    lookAt,
    blink,
    face: (dir) => face(dir === 'left' || dir === -1 ? -1 : 1),
    get fainted() { return state.fainted; },
    get visible() { return state.out; },
    get color() { return baseColor; },
    destroy,
  };
  return api;
}
