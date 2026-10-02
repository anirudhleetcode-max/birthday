// Hand-built SVG artwork shared by the chapters (all original drawings).

let uid = 0;
const nid = (p) => `${p}${++uid}`;

/** The kingdom's sun: 8 long rays, 8 flame rays, a ringed disc. */
export function sunEmblem({ className = '', glow = true, stroke = '#ffe3a3', fill = '#f4c463', inner = '#c98f2b' } = {}) {
  const g = nid('sg');
  const f = nid('sf');
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * 360) / 16;
    if (i % 2 === 0) {
      rays.push(`<path transform="rotate(${a})" d="M46 -7.5 L97 0 L46 7.5 Z"/>`);
    } else {
      rays.push(
        `<path transform="rotate(${a})" d="M46 -5 C56 -11 61 4 69 1 C75 -1 79 -3 86 0 C79 4 74 7 67 7 C58 8 55 -2 46 5 Z"/>`
      );
    }
  }
  const inner8 = [];
  for (let i = 0; i < 8; i++) {
    inner8.push(`<path transform="rotate(${i * 45 + 22.5})" d="M14 -4 L30 0 L14 4 Z"/>`);
  }
  return `
<svg class="sun-emblem ${className}" viewBox="-100 -100 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="${g}" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff6d6"/>
      <stop offset=".42" stop-color="#ffe3a3"/>
      <stop offset=".75" stop-color="${fill}"/>
      <stop offset="1" stop-color="#e0a443"/>
    </radialGradient>
    ${glow ? `<filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
  </defs>
  <g ${glow ? `filter="url(#${f})"` : ''} fill="url(#${g})" stroke="${stroke}" stroke-width=".8" stroke-linejoin="round">
    <g class="sun-rays">${rays.join('')}</g>
    <circle r="42" fill="none" stroke-width="3"/>
    <circle r="36"/>
    <circle r="31" fill="none" stroke="${inner}" stroke-width="1.4" stroke-dasharray="2 3"/>
    <g fill="${inner}" stroke="none" opacity=".75">${inner8.join('')}</g>
    <circle r="11" fill="#fff3cf" stroke="${inner}" stroke-width="1.2"/>
  </g>
</svg>`;
}

/** A paper sky-lantern. `lit` controls the glow. */
export function lanternSVG({ className = '', lit = false } = {}) {
  const body = nid('lb');
  const glow = nid('lg');
  const flame = nid('lf');
  return `
<svg class="lantern-svg ${lit ? 'is-lit' : ''} ${className}" viewBox="0 0 120 170" aria-hidden="true">
  <defs>
    <linearGradient id="${body}" x1="0" y1="1" x2="0" y2="0">
      <stop class="lb0" offset="0" stop-color="#ffd98a"/>
      <stop class="lb1" offset=".45" stop-color="#ffab4d"/>
      <stop class="lb2" offset="1" stop-color="#e2672b"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="60" cy="118" r="70" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff2c4" stop-opacity=".95"/>
      <stop offset=".5" stop-color="#ffb347" stop-opacity=".35"/>
      <stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${flame}" cx="60" cy="128" r="10" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".5" stop-color="#ffe38a"/>
      <stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle class="l-halo" cx="60" cy="88" r="80" fill="url(#${glow})"/>
  <g class="l-dark">
    <path d="M20 24 Q60 12 100 24 L91 132 Q60 140 29 132 Z" fill="#2c1840" stroke="#7a5a98" stroke-width="1.2"/>
    <path d="M40 20 L44 136 M60 17 L60 139 M80 20 L76 136" stroke="#7a5a98" stroke-opacity=".35" stroke-width="1"/>
    <g transform="translate(60 74) scale(.27)" fill="none" stroke="#9c7cc0" stroke-opacity=".55" stroke-width="3">
      ${Array.from({ length: 16 }, (_, i) => `<path transform="rotate(${i * 22.5})" d="${i % 2 ? 'M44 -5 L74 0 L44 5Z' : 'M44 -8 L92 0 L44 8Z'}"/>`).join('')}
      <circle r="38"/>
    </g>
    <ellipse cx="60" cy="22" rx="40" ry="6" fill="#3a2352" stroke="#7a5a98" stroke-width="1.2"/>
    <ellipse cx="60" cy="134" rx="31" ry="5" fill="#3a2352" stroke="#7a5a98" stroke-width="1.2"/>
  </g>
  <g class="l-body">
    <path d="M20 24 Q60 12 100 24 L91 132 Q60 140 29 132 Z" fill="url(#${body})"/>
    <path d="M40 20 L44 136 M60 17 L60 139 M80 20 L76 136" stroke="#c4561f" stroke-opacity=".25" stroke-width="1"/>
    <g transform="translate(60 74) scale(.27)" fill="#d4622a" fill-opacity=".55">
      ${Array.from({ length: 16 }, (_, i) => `<path transform="rotate(${i * 22.5})" d="${i % 2 ? 'M44 -5 L74 0 L44 5Z' : 'M44 -8 L92 0 L44 8Z'}"/>`).join('')}
      <circle r="38"/>
    </g>
    <ellipse cx="60" cy="22" rx="40" ry="6" fill="#ffcf85" stroke="#d1702e" stroke-width="1.2"/>
    <ellipse cx="60" cy="134" rx="31" ry="5" fill="#ffefbf" stroke="#d1702e" stroke-width="1.2"/>
  </g>
  <ellipse class="l-flame" cx="60" cy="126" rx="7" ry="11" fill="url(#${flame})"/>
</svg>`;
}

/** The little magic flower that grows from a drop of sunlight. */
export function flowerSVG({ className = '' } = {}) {
  const pg = nid('pg');
  const cg = nid('cg');
  const blur = nid('fb');
  const petals = (n, len, rot, cls) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 360) / n;
      const w = len * 0.34;
      return `<g transform="rotate(${a})"><path class="${cls}" d="M0 0 C${w} ${-len * 0.25} ${w * 0.9} ${-len * 0.8} 0 ${-len} C${-w * 0.9} ${-len * 0.8} ${-w} ${-len * 0.25} 0 0 Z"/></g>`;
    }).join('');
  return `
<svg class="flower-svg ${className}" viewBox="-130 -150 260 330" aria-hidden="true">
  <defs>
    <linearGradient id="${pg}" x1="0" y1="0" x2="0" y2="-1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#fff3c4"/>
      <stop offset=".55" stop-color="#f4c463"/>
      <stop offset="1" stop-color="#ffb347"/>
    </linearGradient>
    <radialGradient id="${cg}"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ffe3a3"/><stop offset="1" stop-color="#f4c463"/></radialGradient>
    <filter id="${blur}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <g class="fl-stem" fill="none" stroke="#9fc47a" stroke-width="4" stroke-linecap="round">
    <path class="stem" d="M0 175 C -6 130, 10 90, 0 18"/>
    <path class="leaf" d="M-2 120 C -40 112, -58 84, -62 70 C -40 74, -12 92, -2 120 Z" fill="#7ea862" stroke-width="2"/>
    <path class="leaf" d="M2 92 C 34 84, 50 60, 54 48 C 34 52, 10 66, 2 92 Z" fill="#8bb56c" stroke-width="2"/>
  </g>
  <g class="fl-head">
    <g class="fl-aura" filter="url(#${blur})" opacity=".85">${petals(6, 96, 0, 'pa').replace(/class="pa"/g, 'fill="#ffd27a"')}</g>
    <g class="fl-outer" fill="url(#${pg})" stroke="#e8a33d" stroke-width="1.2">${petals(6, 92, 0, 'p1')}</g>
    <g class="fl-inner" fill="url(#${pg})" stroke="#e8a33d" stroke-width="1">${petals(6, 60, 30, 'p2')}</g>
    <circle class="fl-core" r="17" fill="url(#${cg})" stroke="#e8a33d" stroke-width="1.2"/>
    <g class="fl-dots" fill="#c98f2b">${Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return `<circle cx="${(Math.cos(a) * 9).toFixed(1)}" cy="${(Math.sin(a) * 9).toFixed(1)}" r="1.8"/>`;
    }).join('')}</g>
  </g>
</svg>`;
}

/** A decorative flourish used under chapter titles. */
export function flourishSVG({ className = '' } = {}) {
  return `
<svg class="cc-orn ${className}" viewBox="0 0 320 28" fill="none" stroke="#f4c463" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">
  <path class="orn-l" d="M8 14 L118 14 C130 14 137 5 146 8 C153 10 151 19 144 18 C139 17 140 11 145 12"/>
  <path class="orn-r" d="M312 14 L202 14 C190 14 183 5 174 8 C167 10 169 19 176 18 C181 17 180 11 175 12"/>
  <path class="orn-c" d="M160 5 L165 14 L160 23 L155 14 Z" fill="#f4c463" fill-opacity=".35"/>
  <circle class="orn-d" cx="151" cy="14" r="1.6" fill="#f4c463"/><circle class="orn-d" cx="169" cy="14" r="1.6" fill="#f4c463"/>
</svg>`;
}

/** A tiny chameleon friend (colour set via CSS --skin / --belly). */
export function chameleonSVG({ className = '' } = {}) {
  return `
<svg class="chameleon ${className}" viewBox="0 0 220 150" aria-hidden="true">
  <g class="ch-tail" fill="none" stroke="var(--skin)" stroke-width="13" stroke-linecap="round">
    <path d="M70 98 C40 104 18 88 22 66 C26 46 54 44 58 62 C61 76 44 80 40 70"/>
  </g>
  <g class="ch-legs" fill="var(--skin-d)">
    <path d="M82 112 C78 124 72 130 66 132 C72 136 82 134 88 124 Z"/>
    <path d="M132 114 C134 126 140 132 148 134 C142 138 132 136 126 126 Z"/>
  </g>
  <path class="ch-body" fill="var(--skin)" d="M64 96 C64 70 92 56 122 58 C146 60 160 66 172 76 C186 88 186 108 168 116 C150 124 112 124 92 120 C74 116 64 110 64 96 Z"/>
  <path class="ch-belly" fill="var(--belly)" opacity=".85" d="M80 110 C100 120 140 122 166 112 C160 120 140 124 112 123 C96 122 84 118 80 110 Z"/>
  <path class="ch-crest" fill="var(--skin-d)" d="M92 62 l6 -7 l5 6 l6 -8 l5 7 l6 -8 l5 7 l6 -7 l5 7 l6 -6 l4 7 Z" opacity=".9"/>
  <g class="ch-spots" fill="var(--skin-d)" opacity=".5">
    <circle cx="104" cy="84" r="5"/><circle cx="124" cy="92" r="4"/><circle cx="142" cy="82" r="3.5"/><circle cx="96" cy="102" r="3"/>
  </g>
  <path class="ch-head" fill="var(--skin)" d="M158 70 C172 56 196 58 206 76 C214 90 206 108 186 110 C172 111 160 102 156 92 Z"/>
  <circle class="ch-blush" cx="196" cy="98" r="7" fill="#ff8fb8" opacity="0"/>
  <path class="ch-smile" d="M190 103 C196 106 202 104 206 99" fill="none" stroke="var(--skin-d)" stroke-width="2.4" stroke-linecap="round"/>
  <g class="ch-eye">
    <circle cx="178" cy="78" r="15" fill="var(--skin)" stroke="var(--skin-d)" stroke-width="2.5"/>
    <circle cx="178" cy="78" r="10" fill="none" stroke="var(--skin-d)" stroke-width="1.5" opacity=".6"/>
    <circle class="ch-pupil" cx="181" cy="79" r="5.2" fill="#1b1022"/>
    <circle cx="183" cy="76.5" r="1.7" fill="#fff"/>
  </g>
</svg>`;
}

/** Bunting of kingdom flags strung on a curved line. */
export function buntingSVG({ count = 9, width = 1000, sag = 60, className = '', flip = false } = {}) {
  const flags = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = t * width;
    const y = 10 + Math.sin(t * Math.PI) * sag;
    const colors = ['#6b3fa0', '#f4c463', '#8a5cc7', '#f2a7c3'];
    const c = colors[i % colors.length];
    const sun = c === '#f4c463' ? '#6b3fa0' : '#f4c463';
    flags.push(`
      <g class="flag" style="--d:${(i % 5) * 0.37}s" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <g class="flag-in">
          <path d="M-26 0 L26 0 L26 46 L0 62 L-26 46 Z" fill="${c}"/>
          <path d="M-26 0 L26 0 L26 6 L-26 6 Z" fill="#000" opacity=".18"/>
          <g transform="translate(0 26) scale(.15)" fill="${sun}">
            ${Array.from({ length: 12 }, (_, k) => `<path transform="rotate(${k * 30})" d="M40 -9 L86 0 L40 9 Z"/>`).join('')}
            <circle r="34"/>
          </g>
        </g>
      </g>`);
  }
  const d = `M0 ${flip ? 10 : 10} Q ${width / 2} ${10 + sag * 2} ${width} 10`;
  return `
<svg class="bunting ${className}" viewBox="0 -4 ${width} ${sag + 90}" preserveAspectRatio="none" aria-hidden="true">
  <path d="${d}" fill="none" stroke="#e7d3a6" stroke-width="2" opacity=".75"/>
  ${flags.join('')}
</svg>`;
}

/** Tall tower silhouette on a rock, with one lit window. */
export function towerSVG({ className = '' } = {}) {
  return `
<svg class="tower-svg ${className}" viewBox="0 0 200 420" aria-hidden="true">
  <path d="M0 420 C20 360 50 352 60 340 L140 340 C152 352 182 362 200 420 Z" fill="#140a22"/>
  <path d="M70 344 L74 150 L126 150 L130 344 Z" fill="#1b0e2c"/>
  <path d="M58 156 L142 156 L148 140 L52 140 Z" fill="#1d1030"/>
  <path d="M50 140 L100 40 L150 140 Z" fill="#241238"/>
  <path d="M100 40 L100 22" stroke="#241238" stroke-width="3"/>
  <path d="M100 22 L118 28 L100 34 Z" fill="#6b3fa0"/>
  <path class="tw-win" d="M88 170 Q100 154 112 170 L112 196 L88 196 Z" fill="#ffcf7a"/>
  <path d="M74 220 C60 250 84 280 72 320" stroke="#2e5a3a" stroke-width="5" fill="none" opacity=".6"/>
  <path d="M126 230 C140 260 118 290 130 330" stroke="#2e5a3a" stroke-width="4" fill="none" opacity=".5"/>
</svg>`;
}

/** Utility: create an element from an HTML string. */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/** Escape owner-provided text before putting it into markup. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
