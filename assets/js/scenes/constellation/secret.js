// The secret: far behind the photographs, among the background stars, a tiny
// constellation shaped like the first letter of her name. Its lines are almost
// invisible; every few seconds they breathe a little brighter for the curious.
// Tapping it (or focusing it and pressing Enter) draws it in gold.
import * as THREE from 'three';
import { glyphFor } from './glyphs.js';

const STAR_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPr;
  uniform float uBright;
  uniform float uFlare;
  uniform float uSize;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.82 + 0.18 * sin(uTime * (0.9 + aSeed) + aSeed * 30.0);
    vA = uBright * tw;
    gl_PointSize = uSize * uPr * (1.0 + uFlare);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform float uFlare;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float core = exp(-d * d * 30.0);
    float halo = exp(-d * d * 6.0) * (0.25 + 0.4 * uFlare);
    float rays = (exp(-abs(q.x) * 150.0) * exp(-abs(q.y) * 8.0) + exp(-abs(q.y) * 150.0) * exp(-abs(q.x) * 8.0)) * 0.3 * (0.3 + uFlare);
    float a = (core + halo + rays) * vA * (1.0 - smoothstep(0.85, 1.0, d));
    vec3 col = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.98, 0.92), core);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * createSecret({ name, device, host, onFound }) → { group, layout(view), update(time, camera), reveal(), hide(d), dispose() }
 * `host` is the scene element (the invisible hit button lives there).
 */
export function createSecret({ name, device = {}, host, onFound } = {}) {
  const gsap = window.gsap;
  const glyph = glyphFor(name);
  const ASPECT = 0.7;
  const group = new THREE.Group();
  group.name = 'constellation-secret';
  group.renderOrder = 1;

  const pts = glyph.stars.map(([x, y]) => new THREE.Vector3(x * ASPECT, y, 0));
  const lineGeo = new THREE.BufferGeometry();
  const lp = [];
  glyph.segments.forEach(([a, b]) => lp.push(pts[a].x, pts[a].y, 0, pts[b].x, pts[b].y, 0));
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffe3a3', transparent: true, opacity: 0.06, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, 0]), 3));
  starGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(pts.map(() => Math.random()), 1));
  const U = { uTime: { value: 0 }, uPr: { value: 1 }, uBright: { value: 0.7 }, uFlare: { value: 0 }, uSize: { value: 7 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(lines, stars);

  // an invisible, focusable hit area over the letter
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cn-secret-hit';
  btn.setAttribute('aria-label', 'A tiny constellation');
  host.appendChild(btn);

  const Z = -52;
  const D0 = 10;
  let found = false;
  let shown = 0;
  let visible = true;
  const st = { fade: 0 };
  const tweens = [];
  const keep = (t) => { tweens.push(t); return t; };

  /** view: { W, H, portrait, tanH, aspect, pr } */
  function layout(view) {
    const { W, H, portrait, tanH, aspect, pr } = view;
    U.uPr.value = pr;
    const hpx = Math.max(40, Math.min(76, Math.min(W, H) * (portrait ? 0.11 : 0.085)));
    U.uSize.value = hpx > 60 ? 8 : 7;
    const dist = D0 - Z;
    const hw = hpx / H * 2 * dist * tanH;
    // upper left, below the chapter dots, inside the vignette
    const left = W * (portrait ? 0.11 : 0.12);
    const top = portrait ? Math.max(84, H * 0.115) : Math.max(76, H * 0.14);
    const X = (left / W * 2 - 1) * dist * tanH * aspect;
    const Y = (1 - top / H * 2) * dist * tanH;
    group.position.set(X, Y - hw, Z);
    group.scale.setScalar(hw);
  }

  const v = new THREE.Vector3();
  let last = '';
  function placeButton(camera) {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    group.updateMatrixWorld();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of [[0, 0], [ASPECT, 1]]) {
      v.set(px, py, 0).applyMatrix4(group.matrixWorld).project(camera);
      const sx = (v.x * 0.5 + 0.5) * W;
      const sy = (0.5 - v.y * 0.5) * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const pad = 16;
    const key = `${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)}`;
    if (key === last) return;
    last = key;
    Object.assign(btn.style, { left: `${Math.round(x0 - pad)}px`, top: `${Math.round(y0 - pad)}px`, width: `${Math.round(x1 - x0 + pad * 2)}px`, height: `${Math.round(y1 - y0 + pad * 2)}px` });
  }

  function update(time, camera) {
    U.uTime.value = time;
    // every ~9 s the letter breathes a little brighter (a hint for the curious)
    const ph = (time % 9) / 9;
    const breathe = Math.exp(-Math.pow((ph - 0.5) / 0.11, 2));
    const f = st.fade;
    if (!found) {
      lineMat.opacity = (0.016 + 0.05 * breathe) * f;
      U.uBright.value = (0.42 + 0.22 * breathe) * f;
    } else {
      lineMat.opacity = st.line * f;
      U.uBright.value = (0.95 + 0.2 * U.uFlare.value) * f;
    }
    group.visible = f > 0.002;
    if (visible) placeButton(camera);
  }

  st.line = 0;
  function reveal() {
    if (found || !visible) return;
    found = true;
    btn.disabled = true;
    keep(gsap.fromTo(st, { line: 0.05 }, { line: 0.55, duration: 0.9, ease: 'power2.out' }));
    keep(gsap.fromTo(U.uFlare, { value: 1.6 }, { value: 0.35, duration: 2.4, ease: 'expo.out' }));
    onFound && onFound();
  }
  btn.addEventListener('click', reveal);

  return {
    group,
    layout,
    update,
    reveal,
    get found() { return found; },
    show(d = 2.5) { shown = 1; keep(gsap.to(st, { fade: 1, duration: d, ease: 'sine.inOut' })); },
    hide(d = 1.6) {
      visible = false;
      btn.disabled = true;
      btn.style.display = 'none';
      keep(gsap.to(st, { fade: 0, duration: d, ease: 'sine.inOut' }));
    },
    get shown() { return shown; },
    dispose() {
      tweens.forEach((t) => t && t.kill());
      btn.removeEventListener('click', reveal);
      btn.remove();
      group.parent && group.parent.remove(group);
      lineGeo.dispose();
      lineMat.dispose();
      starGeo.dispose();
      starMat.dispose();
    },
  };
}
