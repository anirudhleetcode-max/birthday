// The birthday chapter's WebGL world (besides the shared lantern field):
//   · a sky dome that is pure black at first and becomes a deep, warm night,
//   · tinted twinkling stars,
//   · the 7,305 days — one point of light for every day she has lived (plus her
//     240 months and 20 years), first laid along the timeline, then lifted into
//     the sky where they become far-away lanterns,
//   · star sprites (her photographs become stars; the "20" becomes a constellation).
// Every shader here works in display space (like CSS), as the lantern engine does.
import * as THREE from 'three';
import { clamp, gauss, rnd } from './util.js';

const DITHER = /* glsl */ `
  float dither(vec2 c) { return (fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; }
`;

/* ------------------------------------------------------------------ sky */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform float uWarm;
  uniform float uGold;
  varying vec3 vDir;
  ${DITHER}
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zenith = vec3(0.014, 0.02, 0.07);    // midnight
    vec3 mid = vec3(0.036, 0.032, 0.115);      // indigo
    vec3 low = vec3(0.105, 0.06, 0.16);        // violet
    vec3 hor = vec3(0.2, 0.105, 0.15);         // rose dusk at the horizon
    vec3 col = mix(hor, low, smoothstep(-0.03, 0.09, h));
    col = mix(col, mid, smoothstep(0.07, 0.34, h));
    col = mix(col, zenith, smoothstep(0.3, 0.92, h));
    // below the horizon: a soft sea of haze, lit from beneath by the lanterns
    vec3 under = mix(vec3(0.06, 0.035, 0.085), vec3(0.2, 0.105, 0.065), uWarm);
    col = mix(under, col, smoothstep(-0.14, 0.0, h));
    // thousands of lanterns warm the lower sky; at the very end the whole sky turns faintly golden
    col += vec3(0.3, 0.15, 0.05) * uWarm * exp(-max(h + 0.03, 0.0) * 5.5);
    col += vec3(0.065, 0.032, 0.012) * uWarm * (1.0 - smoothstep(0.0, 0.75, h));
    col += vec3(0.05, 0.03, 0.012) * uGold * (1.0 - smoothstep(-0.2, 1.0, h));
    gl_FragColor = vec4(col * uReveal + dither(gl_FragCoord.xy), 1.0);
  }
`;

export function createSky(scene, U) {
  const geo = new THREE.SphereGeometry(4000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { uReveal: U.uReveal, uWarm: U.uWarm, uGold: U.uGold },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); } };
}

/* ------------------------------------------------------------------ stars */
const STAR_VERT = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uPx;
  uniform float uReveal;
  varying float vA;
  varying vec3 vTint;
  void main() {
    float tw = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed * 2.0) + aSeed * 40.0);
    vec3 dir = normalize(position);
    vA = tw * smoothstep(-0.02, 0.2, dir.y) * (0.4 + 0.6 * aSeed) * uReveal;
    vTint = aTint;
    gl_PointSize = (0.9 + aSeed * aSeed * 2.3) * uPx;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(vTint * a, a);
  }
`;

export function createStarfield(scene, U, count) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  const tints = [[1, 0.95, 0.88], [0.84, 0.88, 1], [1, 0.86, 0.72], [1, 1, 1], [0.95, 0.86, 1]];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(1 - Math.random() * 1.1);
    pos[i * 3] = Math.sin(v) * Math.cos(u) * 3600;
    pos[i * 3 + 1] = Math.cos(v) * 3600;
    pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 3600;
    seed[i] = Math.random();
    tint.set(tints[(Math.random() * tints.length) | 0], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    uniforms: { uTime: U.uTime, uPx: U.uPx, uReveal: U.uStars },
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -15;
  pts.frustumCulled = false;
  scene.add(pts);
  return { dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); } };
}

/* ------------------------------------------------------------------ the days */
const DAYS_VERT = /* glsl */ `
  attribute vec3 aQ;       // where it goes in the sky
  attribute vec4 aA;       // kind (0 day · 1 month · 2 year), u along the timeline, seed, special
  attribute vec4 aB;       // lift delay, travel time, rise speed, lantern size
  uniform float uTime;
  uniform vec3 uAppear;    // when the years / months / days start to appear
  uniform vec3 uSweep;     // how long each takes to sweep across
  uniform float uLift;     // when the days leave the line (1e9: not yet)
  uniform float uLine;     // brightness of the line itself
  uniform float uFade;
  uniform float uPx;
  uniform float uViewScale;
  uniform float uMotion;
  uniform vec2 uHaze;
  uniform vec4 uIgn;       // two ignition spots on the line: (u, time, u, time)
  uniform vec2 uIgn2;
  varying vec3 vCol;
  varying float vA;
  float ease5(float k) { return k * k * k * (k * (k * 6.0 - 15.0) + 10.0); }
  float ign(float u, float pu, float pt) {
    float s = uTime - pt;
    return s > 0.0 ? exp(-pow((u - pu) / 0.035, 2.0)) * exp(-s * 0.9) * smoothstep(0.0, 0.25, s) : 0.0;
  }
  void main() {
    float kind = aA.x;
    float u = aA.y;
    float seed = aA.z;
    float tc = kind > 1.5 ? uAppear.x : (kind > 0.5 ? uAppear.y : uAppear.z);
    float sw = kind > 1.5 ? uSweep.x : (kind > 0.5 ? uSweep.y : uSweep.z);
    float ta = tc + sw * u + (kind < 0.5 ? seed * 0.45 : 0.0);
    float since = uTime - ta;
    float app = smoothstep(0.0, kind > 1.5 ? 0.3 : 0.7, since);
    float flare = since > 0.0 ? exp(-since * (kind > 1.5 ? 1.5 : 2.4)) : 0.0;

    float la = uTime - uLift - aB.x;
    float a2 = max(la, 0.0);
    float lk = clamp(a2 / aB.y, 0.0, 1.0);
    float e = ease5(lk);
    vec3 p = mix(position, aQ, e);
    p.y += aB.z * (a2 - 3.0 * (1.0 - exp(-a2 / 3.0)));
    p.y += sin(lk * 3.14159) * (2.0 + 6.0 * seed) * uMotion;
    p.x += (sin(a2 * 0.29 + seed * 40.0) - sin(seed * 40.0)) * 1.4 * uMotion * e;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(-mv.z, 0.1);
    float ls = smoothstep(0.0, 0.45, lk);
    // on the line: a fine thread of light (pixel sizes) · in the sky: a far lantern (perspective)
    float pre = kind > 1.5 ? 5.2 + flare * 8.0 : (kind > 0.5 ? 2.5 + flare * 3.0 : 1.4 + aA.w * 1.3);
    float post = clamp(aB.w * uViewScale / depth, 1.3 * uPx, 9.0 * uPx);
    float ig = ign(u, uIgn.x, uIgn.y) + ign(u, uIgn.z, uIgn.w) + ign(u, uIgn2.x, uIgn2.y);
    gl_PointSize = mix(pre * uPx * (1.0 + ig * 1.2), post, ls);

    float tw = 0.7 + 0.3 * sin(uTime * (1.1 + seed * 2.3) + seed * 60.0);
    float aPre = (kind > 1.5 ? 0.95 : (kind > 0.5 ? 0.55 : 0.2 + aA.w * 0.45)) * app * tw * uLine;
    aPre += flare * (kind > 0.5 ? 0.5 : 0.3) * app + ig * 0.9 * app;
    float haze = smoothstep(uHaze.x, uHaze.y, depth);
    float flick = 0.86 + 0.14 * sin(uTime * 2.1 + seed * 30.0) * sin(uTime * 0.7 + seed * 11.0);
    float aPost = (0.55 + 0.45 * aA.w) * flick * (1.0 - haze * 0.65) * app;
    vA = mix(aPre, aPost, ls) * uFade;
    vec3 cPre = kind > 1.5 ? vec3(1.0, 0.94, 0.8) : (kind > 0.5 ? vec3(1.0, 0.86, 0.6) : vec3(1.0, 0.78, 0.45));
    vec3 cPost = mix(vec3(1.0, 0.6, 0.27), vec3(1.0, 0.74, 0.42), seed);
    vCol = mix(cPre, cPost, ls);
    gl_Position = projectionMatrix * mv;
  }
`;
const DAYS_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    float a = (exp(-d * 4.5) * 0.45 + exp(-d * 20.0) * 0.7) * vA;
    vec3 col = mix(vCol, vec3(1.0, 0.97, 0.9), exp(-d * 28.0) * 0.8);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * One point of light for every day (and month, and year). layout() lays them on
 * the timeline (a function screen → world), lift() sends them into the sky.
 */
export function createDays(scene, U, { days = 7305, months = 240, years = 20, device = {} } = {}) {
  const N = days + months + years;
  const pos = new Float32Array(N * 3);
  const q = new Float32Array(N * 3);
  const A = new Float32Array(N * 4);
  const B = new Float32Array(N * 4);
  const scatter = new Float32Array(N);
  let k = 0;
  const put = (kind, u, special) => {
    A[k * 4] = kind;
    A[k * 4 + 1] = u;
    A[k * 4 + 2] = Math.random();
    A[k * 4 + 3] = special;
    scatter[k] = kind === 0 ? clamp(gauss(), -2.6, 2.6) : 0;
    B[k * 4 + 1] = 1e3;
    k++;
  };
  for (let i = 0; i < years; i++) put(2, (i + 1) / years, 1);
  for (let i = 0; i < months; i++) put(1, (i + 1) / months, 0.6);
  for (let i = 0; i < days; i++) put(0, (i + 0.5) / days, Math.random() < 0.025 ? 1 : Math.random() * 0.35);

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const qAttr = new THREE.BufferAttribute(q, 3).setUsage(THREE.DynamicDrawUsage);
  const bAttr = new THREE.BufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aQ', qAttr);
  geo.setAttribute('aA', new THREE.BufferAttribute(A, 4));
  geo.setAttribute('aB', bAttr);
  const DU = {
    uAppear: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
    uSweep: { value: new THREE.Vector3(2, 2.2, 2.6) },
    uLift: { value: 1e9 },
    uLine: { value: 1 },
    uFade: { value: 1 },
    uMotion: { value: device.reducedMotion ? 0.35 : 1 },
    uHaze: { value: new THREE.Vector2(300, 2200) },
    uIgn: { value: new THREE.Vector4(-1, 1e9, -1, 1e9) },
    uIgn2: { value: new THREE.Vector2(-1, 1e9) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: DAYS_VERT, fragmentShader: DAYS_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    uniforms: { ...DU, uTime: U.uTime, uPx: U.uPx, uViewScale: U.uViewScale },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.onBeforeRender = U.syncView;
  scene.add(pts);

  /**
   * Lay the points on the timeline. `at(u, offPx)` → THREE.Vector3 world position of
   * the timeline at u (0..1), offset across the line by offPx screen pixels.
   */
  function layout(at, bandPx = 4.5) {
    for (let i = 0; i < N; i++) {
      const kind = A[i * 4];
      const p = at(A[i * 4 + 1], kind === 0 ? scatter[i] * bandPx : 0);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    posAttr.needsUpdate = true;
  }

  /**
   * Send them up. `target(i, kind, u)` → world position in the sky (or null to
   * keep a point on the line). Points leave left to right over `sweep` seconds.
   */
  function lift(t0, target, { sweep = 5.5, travel = [12, 20], rise = [0.3, 1.2] } = {}) {
    for (let i = 0; i < N; i++) {
      const kind = A[i * 4];
      const u = A[i * 4 + 1];
      const t = target(i, kind, u);
      if (!t) continue;
      q[i * 3] = t.x; q[i * 3 + 1] = t.y; q[i * 3 + 2] = t.z;
      const far = Math.max(0, -t.z);
      B[i * 4] = u * sweep + rnd(0, 0.9) + (kind === 2 ? 0.3 : 0);
      B[i * 4 + 1] = rnd(travel[0], travel[1]);
      B[i * 4 + 2] = rnd(rise[0], rise[1]) * (1 + far / 700);
      B[i * 4 + 3] = (kind === 2 ? 3.4 : kind === 1 ? 2.6 : 1.7 + A[i * 4 + 3] * 1.2) * rnd(0.85, 1.15);
    }
    qAttr.needsUpdate = true;
    bAttr.needsUpdate = true;
    DU.uLift.value = t0;
  }

  return {
    count: N,
    uniforms: DU,
    layout,
    lift,
    get lifted() { return DU.uLift.value < 1e8; },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}

/* ------------------------------------------------------------------ star sprites */
function starTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const h = S / 2;
  const glow = g.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.08, 'rgba(255,255,255,.85)');
  glow.addColorStop(0.22, 'rgba(255,255,255,.22)');
  glow.addColorStop(0.5, 'rgba(255,255,255,.05)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // four long, fine rays and four short ones
  g.globalCompositeOperation = 'lighter';
  const ray = (ang, len, wid, a) => {
    g.save();
    g.translate(h, h);
    g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -wid);
    g.lineTo(len, 0);
    g.lineTo(0, wid);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, h * 0.98, 2.2, 0.9);
  for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2 + Math.PI / 4, h * 0.42, 1.6, 0.45);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const SPR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHue;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  varying float vHue;
  varying float vRot;
  void main() {
    float tw = 0.82 + 0.18 * sin(uTime * (1.3 + aSeed * 1.7) + aSeed * 50.0);
    vA = aAlpha * tw;
    vHue = aHue;
    vRot = aSeed * 0.6 + sin(uTime * 0.2 + aSeed * 9.0) * 0.12;
    gl_PointSize = aSize * uPx * (0.9 + 0.2 * tw);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SPR_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying float vA;
  varying float vHue;
  varying float vRot;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    q = mat2(c, s, -s, c) * q;
    float t = texture2D(uTex, q + 0.5).r;
    vec3 gold = vec3(1.0, 0.86, 0.6);
    vec3 rose = vec3(1.0, 0.8, 0.86);
    vec3 col = mix(mix(gold, rose, vHue), vec3(1.0, 0.98, 0.94), smoothstep(0.55, 1.0, t));
    float a = t * vA;
    gl_FragColor = vec4(col * a, a);
  }
`;

/** A small pool of twinkling star sprites. add() → star { p: Vector3, size (css px), a, hue }. */
export function createStarSprites(scene, U, max = 64) {
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const hue = new Float32Array(max);
  const seed = Float32Array.from({ length: max }, () => Math.random());
  const geo = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    aSize: new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage),
    aAlpha: new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage),
    aHue: new THREE.BufferAttribute(hue, 1).setUsage(THREE.DynamicDrawUsage),
  };
  for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, a);
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setDrawRange(0, 0);
  const tex = starTexture();
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPR_VERT, fragmentShader: SPR_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    uniforms: { uTime: U.uTime, uPx: U.uPx, uTex: { value: tex } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  scene.add(pts);
  const list = [];
  return {
    add(o = {}) {
      if (list.length >= max) return null;
      const s = { p: o.p ? o.p.clone() : new THREE.Vector3(), size: o.size ?? 22, a: o.a ?? 0, hue: o.hue ?? 0 };
      list.push(s);
      return s;
    },
    remove(s) { const i = list.indexOf(s); if (i >= 0) list.splice(i, 1); },
    clear() { list.length = 0; },
    get list() { return list; },
    update() {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        pos[i * 3] = s.p.x; pos[i * 3 + 1] = s.p.y; pos[i * 3 + 2] = s.p.z;
        size[i] = s.size;
        alpha[i] = clamp(s.a, 0, 1.5);
        hue[i] = s.hue;
      }
      geo.setDrawRange(0, list.length);
      for (const a of Object.values(attrs)) a.needsUpdate = true;
    },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
