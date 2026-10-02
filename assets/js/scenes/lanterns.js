// Chapter Five — The Night of Lanterns.
// A still lake under a huge midnight sky, a kingdom on its island, a little boat.
// One lantern rises… then another… then hundreds… then thousands. Some carry her
// photographs (tap one to bring it close); a golden ribbon slowly links lanterns and
// memories into a network; tap the sky to send your own. One small pink lantern is
// hiding somewhere. Its last lantern hands its light to the letter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLanternField, createPhotoLantern, createRibbon3D } from '../core/lanternfield.js';

const FALLBACK = {
  kicker: 'Chapter Five',
  title: 'The Night of Lanterns',
  tapHint: 'Tap the sky to send up a lantern of your own',
  photoHint: 'Some of these lanterns are carrying memories. Tap one.',
  secret: 'This one is just for you.',
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const sineInOut = (k) => -(Math.cos(Math.PI * k) - 1) / 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ shaders */
const DITHER = /* glsl */ `
  float dither(vec2 c) { return (fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; }
`;

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  uniform float uGlow;
  uniform float uWarm;
  varying vec3 vDir;
  ${DITHER}
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zenith = vec3(0.018, 0.026, 0.092);   // midnight blue
    vec3 mid = vec3(0.042, 0.04, 0.14);        // indigo
    vec3 low = vec3(0.11, 0.06, 0.19);         // violet, near the horizon
    vec3 hor = vec3(0.19, 0.095, 0.2);
    vec3 col = mix(hor, low, smoothstep(-0.01, 0.05, h));
    col = mix(col, mid, smoothstep(0.03, 0.26, h));
    col = mix(col, zenith, smoothstep(0.2, 0.85, h));
    // the warm light-dome over the kingdom, growing as the town lights its lanterns
    float az = atan(d.x, -d.z);
    col += vec3(0.38, 0.16, 0.06) * exp(-az * az * 6.0) * exp(-max(h, 0.0) * 8.5) * uGlow;
    // thousands of lanterns warm the whole lower sky
    col += vec3(0.075, 0.032, 0.012) * uWarm * (1.0 - smoothstep(0.0, 0.6, h));
    gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
  }
`;

const starVert = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vA;
  varying vec3 vTint;
  void main() {
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.2) + aSeed * 40.0);
    vec3 dir = normalize(position);
    vA = tw * smoothstep(0.015, 0.18, dir.y) * (0.45 + 0.55 * aSeed);
    vTint = aTint;
    gl_PointSize = (0.9 + aSeed * aSeed * 2.4) * uPixelRatio;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const starFrag = /* glsl */ `
  varying float vA;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(vTint * a, a);
  }
`;

const WATER_BASE = /* glsl */ `
  uniform vec3 uCam;
  uniform float uWarm;
  vec3 waterBase(vec3 w) {
    vec3 v = normalize(uCam - w);
    float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
    vec3 col = mix(vec3(0.01, 0.011, 0.036), vec3(0.15, 0.08, 0.2), fres);
    return col + vec3(0.1, 0.045, 0.018) * uWarm * fres;
  }
`;
const waterVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const waterFrag = /* glsl */ `
  ${WATER_BASE}
  uniform float uTime;
  uniform float uGlow;
  varying vec3 vWorld;
  ${DITHER}
  void main() {
    float dist = length(uCam - vWorld);
    float near = 1.0 - smoothstep(60.0, 900.0, dist);
    float r1 = sin(vWorld.x * 0.045 + uTime * 0.55) * sin(vWorld.z * 0.07 - uTime * 0.42);
    float r2 = sin(vWorld.x * 0.13 - uTime * 0.85 + vWorld.z * 0.05) * 0.4;
    float rip = (r1 + r2) * near;
    vec3 col = waterBase(vWorld) * (1.0 + rip * 0.07);
    // the kingdom's light laid across the water
    float lane = exp(-pow(vWorld.x / (55.0 + max(-vWorld.z, 0.0) * 0.1), 2.0)) * smoothstep(-60.0, -1000.0, vWorld.z) * (1.0 - smoothstep(-1110.0, -1180.0, vWorld.z));
    col += vec3(0.42, 0.19, 0.08) * lane * (0.5 + 0.5 * (r1 + r2 * 2.0)) * 0.3 * uGlow;
    // slow silver sheen lines on the still surface
    float sheen = pow(max(0.0, sin(vWorld.z * 0.33 + rip * 2.0 + uTime * 0.25)), 28.0) * (1.0 - smoothstep(40.0, 420.0, dist));
    col += vec3(0.5, 0.42, 0.6) * sheen * 0.035;
    gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
  }
`;

// a silhouette seen upside-down in the lake, rippling and dissolving into the water
const reflectVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float depth = max(-w.y, 0.0);
    w.x += sin(w.y * 0.3 + uTime * 1.1) * min(depth * 0.02, 1.6);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const reflectFrag = /* glsl */ `
  ${WATER_BASE}
  uniform vec3 uInk;
  uniform float uFade;
  varying vec3 vWorld;
  void main() {
    // the water colour where the view ray actually meets the lake
    float hit = uCam.y / max(uCam.y - vWorld.y, 1e-3);
    vec3 base = waterBase(uCam + (vWorld - uCam) * hit);
    float k = smoothstep(0.0, uFade, max(-vWorld.y, 0.0));
    gl_FragColor = vec4(mix(mix(uInk, base, 0.3), base, k), 1.0);
  }
`;

const windowVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uViewScale;
  uniform float uMirror;
  uniform float uSize;
  uniform float uLit;
  varying float vA;
  varying float vSeed;
  void main() {
    vec3 p = position;
    float a = (0.72 + 0.28 * sin(uTime * (0.25 + aSeed * 0.8) + aSeed * 50.0)) * smoothstep(aSeed * 0.6, aSeed * 0.6 + 0.4, uLit);
    if (uMirror > 0.5) { p.y = -p.y; p.x += sin(p.y * 0.3 + uTime * 1.1) * 0.9; a *= 0.5; }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uSize * uViewScale / -mv.z, 1.3, 9.0) * (uMirror > 0.5 ? 2.2 : 1.0);
    vA = a;
    vSeed = aSeed;
    gl_Position = projectionMatrix * mv;
  }
`;
const windowFrag = /* glsl */ `
  uniform float uMirror;
  uniform float uTime;
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    if (uMirror > 0.5) q *= vec2(3.0, 0.9);
    float d = dot(q, q);
    float a = exp(-d * 14.0) * vA;
    if (uMirror > 0.5) a *= 0.6 + 0.4 * sin(gl_PointCoord.y * 18.0 - uTime * 2.0 + vSeed * 20.0);
    vec3 col = mix(vec3(1.0, 0.58, 0.24), vec3(1.0, 0.86, 0.56), exp(-d * 40.0));
    gl_FragColor = vec4(col * a, a);
  }
`;

// soft banks of mist drifting over the water (and one high veil of haze)
const mistVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const mistFrag = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec3 uCool;
  uniform vec3 uWarmCol;
  uniform float uWarm;
  uniform float uOpacity;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uRepeat;
  uniform float uBand;
  uniform vec3 uCamPos;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vec2 uv = vec2(vUv.x * uRepeat, vUv.y);
    float n1 = texture2D(uNoise, uv * vec2(1.0, 0.7) + vec2(uTime * uSpeed + uSeed, uSeed * 0.37)).r;
    float n2 = texture2D(uNoise, uv * vec2(2.3, 1.3) + vec2(-uTime * uSpeed * 1.6 + uSeed * 3.1, uTime * 0.003)).r;
    float n = n1 * 0.62 + n2 * 0.38;
    float v = vUv.y;
    float shape = uBand > 0.5
      ? smoothstep(0.0, 0.45, v) * (1.0 - smoothstep(0.55, 1.0, v))
      : smoothstep(0.0, 0.06, v) * (1.0 - smoothstep(0.18, 1.0, v));
    shape *= smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
    float a = smoothstep(0.32, 0.9, n * (0.55 + 0.6 * shape)) * shape;
    float dist = length(uCamPos - vWorld);
    a *= smoothstep(28.0, 110.0, dist) * uOpacity;
    vec3 col = mix(uCool, uWarmCol, uWarm);
    gl_FragColor = vec4(col * a, a);
  }
`;

/* ------------------------------------------------------------------ helpers */
function radialTexture(inner = 'rgba(255,230,180,1)', mid = 'rgba(255,170,80,.35)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, mid);
  gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tileable value-noise fbm (for the mist). */
function noiseTexture(w = 256, h = 128) {
  const data = new Uint8Array(w * h * 4);
  const octs = [[6, 3, 0.5], [12, 6, 0.26], [24, 12, 0.15], [48, 24, 0.09]];
  const grids = octs.map(([gx, gy]) => Float32Array.from({ length: gx * gy }, () => Math.random()));
  const fade = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      octs.forEach(([gx, gy, amp], o) => {
        const fx = (x / w) * gx;
        const fy = (y / h) * gy;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fade(fx - x0);
        const ty = fade(fy - y0);
        const g = grids[o];
        const at = (i, j) => g[((j % gy) + gy) % gy * gx + (((i % gx) + gx) % gx)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp;
      });
      const k = (y * w + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(clamp(v, 0, 1) * 255);
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, w, h);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The kingdom on its island: one merged silhouette + windows on the real façades. */
function buildKingdom() {
  const parts = [];
  const wins = [];
  const put = (geo, x, y, z, ry = 0) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    parts.push(geo);
  };
  const addWindow = (x, y, z) => wins.push(x, y, z);
  put(new THREE.CylinderGeometry(178, 268, 24, 48, 1), 0, 0, 0); // island, top at y=12
  put(new THREE.CylinderGeometry(116, 178, 42, 40, 1), 0, 33, 0); // the hill, top at y=54
  // the town: two rings of houses climbing the hill, facing the lake
  const rings = [[160, 12, 22, 1.25], [118, 54, 17, 1.05]];
  for (const [r, base, count, spread] of rings) {
    for (let i = 0; i < count; i++) {
      const th = (i / (count - 1) - 0.5) * Math.PI * spread;
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r * 0.62;
      const w = 12 + ((i * 7) % 4) * 4;
      const hgt = 14 + ((i * 5) % 5) * 5;
      const sink = (i % 3) * 3;
      put(new THREE.BoxGeometry(w, hgt, 12), x, base + hgt / 2 - sink, z, -th * 0.6);
      put(new THREE.ConeGeometry(w * 0.78, hgt * 0.55, 4), x, base + hgt - sink + hgt * 0.27, z, Math.PI / 4 - th * 0.6);
      if (i % 4 !== 3) {
        const n = 1 + (i % 2);
        for (let k = 0; k < n; k++) addWindow(x + (k - (n - 1) / 2) * w * 0.4, base + hgt * (0.35 + 0.25 * ((i + k) % 2)) - sink, z + 6.3);
      }
    }
  }
  // the castle (an original arrangement of keeps, towers and spires)
  put(new THREE.BoxGeometry(86, 112, 60), 0, 54 + 56, -14);
  put(new THREE.BoxGeometry(150, 34, 18), 0, 54 + 17, 22); // the curtain wall
  for (let k = -7; k <= 7; k++) put(new THREE.BoxGeometry(5, 5, 18), k * 10, 54 + 36.5, 22); // crenellations
  const towers = [[-52, 156, 14, 0], [50, 142, 13, 4], [-24, 196, 11, -20], [22, 178, 12, -22], [0, 236, 9.5, -30], [-78, 112, 10, 18], [78, 118, 10, 18]];
  for (const [x, hh, r, dz] of towers) {
    put(new THREE.CylinderGeometry(r, r * 1.08, hh, 14), x, 54 + hh / 2, dz);
    put(new THREE.ConeGeometry(r * 1.5, hh * 0.34, 14), x, 54 + hh + hh * 0.17, dz);
    put(new THREE.CylinderGeometry(0.6, 0.6, 14, 4), x, 54 + hh + hh * 0.34 + 6, dz);
    const n = 2 + Math.round(hh / 70);
    for (let k = 0; k < n; k++) addWindow(x + ((k % 2) - 0.5) * r * 0.5, 54 + hh * (0.45 + k * (0.45 / n)), dz + r + 0.3);
  }
  for (let k = 0; k < 14; k++) addWindow(-34 + (k % 7) * 11.3, 54 + 48 + Math.floor(k / 7) * 26, 16.4);
  const geo = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  const seeds = Float32Array.from({ length: wins.length / 3 }, () => Math.random());
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wins, 3));
  wgeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return { geo, wgeo };
}

/** Far ridges at the horizon (low behind the castle so its silhouette stays clean). */
function ridgeGeometry(z, width, base, amp, seed) {
  const shape = new THREE.Shape();
  const n = 90;
  shape.moveTo(-width / 2, -8);
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (i / n) * width;
    const c = 0.3 + 0.7 * sstep(140, 720, Math.abs(x));
    const hh = base + amp * c * (0.55 + 0.25 * Math.sin(x * 0.0021 + seed) + 0.14 * Math.sin(x * 0.0063 + seed * 2.3) + 0.06 * Math.sin(x * 0.019 + seed * 5.1));
    shape.lineTo(x, hh);
  }
  shape.lineTo(width / 2, -8);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.translate(0, 0, z);
  return g;
}

function boatGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-6, 1.2);
  shape.quadraticCurveTo(-4.8, -0.9, 0, -1.1);
  shape.quadraticCurveTo(4.8, -0.9, 6.4, 1.6);
  shape.lineTo(5.6, 1.2);
  shape.quadraticCurveTo(0, 0.6, -5.4, 1.0);
  shape.lineTo(-6, 1.2);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
  hull.translate(0, 0, -1.1);
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6);
  pole.rotateZ(-0.3);
  pole.translate(5.6, 2.6, 0);
  const poleFlat = pole.toNonIndexed();
  const geo = mergeGeometries([hull, poleFlat], false);
  hull.dispose();
  pole.dispose();
  poleFlat.dispose();
  return geo;
}

const KZ = -1120; // the kingdom's island (world z) and scale
const KS = 0.86;

/* ------------------------------------------------------------------ the chapter */
function createChapter(ctx, el) {
  const { gsap, ui, audio, fx, device } = ctx;
  const T = { ...FALLBACK, ...(ctx.text.lanterns || {}) };
  const lines = (Array.isArray(T.lines) ? T.lines : []).filter(Boolean);
  const reduced = !!device.reducedMotion;
  const tier = device.tier || 'high';
  const low = tier === 'low';
  const photos = (ctx.photos('lanterns') || []).filter((p) => p && p.url);
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const tweens = [];
  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };

  el.innerHTML = `
    <canvas class="gl" aria-hidden="true"></canvas>
    <div class="ln-focus" aria-hidden="true"></div>
    <figure class="ln-caption" aria-live="polite"><figcaption><span class="ln-cap-text"></span><span class="ln-cap-rule" aria-hidden="true"></span><span class="ln-cap-date"></span></figcaption></figure>
    <div class="ln-veil" aria-hidden="true"></div>`;
  const canvas = el.querySelector('canvas');
  const veil = el.querySelector('.ln-veil');
  const focusEl = el.querySelector('.ln-focus');
  const capEl = el.querySelector('.ln-caption');
  const capText = el.querySelector('.ln-cap-text');
  const capDate = el.querySelector('.ln-cap-date');
  const subsEl = document.getElementById('subtitles');

  /* ---------------- renderer, camera ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, low ? 1 : device.mobile ? 1.6 : 1.75);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04020a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1636, 700, 3400);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 6000);
  let tanV = 0.6;
  let tanW = 0.3;
  const fit = () => {
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? (w / h < 0.55 ? 64 : 58) : 48;
    camera.updateProjectionMatrix();
    tanV = Math.tan((camera.fov * DEG) / 2);
    tanW = tanV * camera.aspect;
  };
  fit();
  on(window, 'resize', fit);

  // forward and gently upward over ~70 s; reduced motion → one still, composed frame
  const CAM = { p0: V(0, 4.2, 72), p1: V(0, 30, -30), l0: V(0, 62, -900), l1: V(0, 345, -760) };
  const CAM_DUR = 72;
  const camK = (st) => (reduced ? 0.14 : sineInOut(clamp(st / CAM_DUR, 0, 1)));
  const camAt = (st, pos, look) => {
    const k = camK(st);
    pos.lerpVectors(CAM.p0, CAM.p1, k);
    if (look) look.lerpVectors(CAM.l0, CAM.l1, k);
    return pos;
  };
  const look = V();
  const placeCamera = (st, rt) => {
    camAt(st, camera.position, look);
    if (!reduced) {
      camera.position.x += Math.sin(rt * 0.13) * 0.6;
      camera.position.y += Math.sin(rt * 0.21) * 0.22;
      look.x += Math.sin(rt * 0.07) * 6;
    }
    camera.lookAt(look);
    camera.updateMatrixWorld();
  };
  placeCamera(0, 0);

  /* ---------------- world ---------------- */
  const U = {
    uTime: { value: 0 },
    uGlow: { value: 0.3 },
    uWarm: { value: 0 },
    uCam: { value: V() },
    uPixelRatio: { value: pr },
    uViewScale: { value: 600 },
  };
  const size2 = new THREE.Vector2();
  const syncView = (r, s, cam) => {
    r.getDrawingBufferSize(size2);
    U.uViewScale.value = size2.y * 0.5 * cam.projectionMatrix.elements[5];
  };

  // sky dome (drawn at the far plane)
  const skyGeo = keep(new THREE.SphereGeometry(3000, 48, 24));
  const skyMat = keep(new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, uniforms: { uGlow: U.uGlow, uWarm: U.uWarm } }));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -20;
  sky.frustumCulled = false;
  scene.add(sky);

  // stars
  const starCount = low ? 700 : device.mobile ? 1300 : 2200;
  const sp = new Float32Array(starCount * 3);
  const ss = new Float32Array(starCount);
  const st = new Float32Array(starCount * 3);
  const tints = [[1, 0.96, 0.9], [0.84, 0.88, 1], [1, 0.88, 0.74], [1, 1, 1]];
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(1 - Math.random() * 0.97);
    sp[i * 3] = Math.sin(v) * Math.cos(u) * 2800;
    sp[i * 3 + 1] = Math.cos(v) * 2800;
    sp[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 2800;
    ss[i] = Math.random();
    st.set(tints[(Math.random() * tints.length) | 0], i * 3);
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(st, 3));
  const starMat = keep(new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, uniforms: { uTime: U.uTime, uPixelRatio: U.uPixelRatio } }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -15;
  stars.frustumCulled = false;
  scene.add(stars);

  // the lake (doesn't write depth, so reflections can be drawn "under" it)
  const waterGeo = keep(new THREE.PlaneGeometry(9000, 9000, 1, 1));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = keep(new THREE.ShaderMaterial({ vertexShader: waterVert, fragmentShader: waterFrag, depthWrite: false, uniforms: { uCam: U.uCam, uTime: U.uTime, uGlow: U.uGlow, uWarm: U.uWarm } }));
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.renderOrder = -10;
  scene.add(water);

  const reflectMat = (ink, fade) => keep(new THREE.ShaderMaterial({
    vertexShader: reflectVert, fragmentShader: reflectFrag, side: THREE.DoubleSide,
    uniforms: { uCam: U.uCam, uWarm: U.uWarm, uTime: U.uTime, uInk: { value: new THREE.Vector3(...ink) }, uFade: { value: fade } },
  }));

  // the kingdom
  const { geo: kGeo, wgeo } = buildKingdom();
  keep(kGeo, wgeo);
  const inkMat = keep(new THREE.MeshBasicMaterial({ color: 0x0b0616 }));
  const kingdom = new THREE.Mesh(kGeo, inkMat);
  kingdom.position.set(0, 0, KZ);
  kingdom.scale.setScalar(KS);
  scene.add(kingdom);
  const kMirror = new THREE.Mesh(kGeo, reflectMat([0.012, 0.008, 0.03], 190));
  kMirror.position.copy(kingdom.position);
  kMirror.scale.set(KS, -KS, KS);
  kMirror.renderOrder = -5;
  scene.add(kMirror);
  const winU = { uTime: U.uTime, uViewScale: U.uViewScale, uSize: { value: 2.6 }, uLit: { value: 0.55 } };
  const winMat = keep(new THREE.ShaderMaterial({ vertexShader: windowVert, fragmentShader: windowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, uniforms: { ...winU, uMirror: { value: 0 } } }));
  const winMirMat = keep(new THREE.ShaderMaterial({ vertexShader: windowVert, fragmentShader: windowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, uniforms: { ...winU, uMirror: { value: 1 } } }));
  const windows = new THREE.Points(wgeo, winMat);
  const winMirror = new THREE.Points(wgeo, winMirMat);
  windows.onBeforeRender = syncView;
  winMirror.onBeforeRender = syncView;
  windows.position.copy(kingdom.position);
  winMirror.position.copy(kingdom.position);
  windows.scale.setScalar(KS);
  winMirror.scale.setScalar(KS);
  winMirror.renderOrder = 1;
  scene.add(windows, winMirror);

  // the warm dome of light above the town
  const glowTex = keep(radialTexture('rgba(255,200,130,.9)', 'rgba(255,150,70,.25)'));
  const kGlowMat = keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3, toneMapped: false, fog: false }));
  const kGlow = new THREE.Sprite(kGlowMat);
  kGlow.scale.set(1150, 520, 1);
  kGlow.position.set(0, 100, KZ - 80);
  scene.add(kGlow);

  // far ridges
  const ridgeMat = keep(new THREE.MeshBasicMaterial({ color: 0x0d0a22 }));
  const ridgeMat2 = keep(new THREE.MeshBasicMaterial({ color: 0x0f0c26 }));
  const r1 = new THREE.Mesh(keep(ridgeGeometry(-1500, 6000, 18, 110, 1.3)), ridgeMat);
  const r2 = new THREE.Mesh(keep(ridgeGeometry(-2300, 8000, 30, 210, 4.1)), ridgeMat2);
  scene.add(r1, r2);

  // the little boat, its lamp, and its reflection
  const boatGeo = keep(boatGeometry());
  const boatMat = keep(new THREE.MeshBasicMaterial({ color: 0x06030b, fog: false }));
  const boat = new THREE.Mesh(boatGeo, boatMat);
  boat.position.set(-8, 0.15, 16);
  boat.rotation.y = 0.35;
  scene.add(boat);
  const boatMirror = new THREE.Mesh(boatGeo, reflectMat([0.006, 0.004, 0.014], 3.5));
  boatMirror.scale.y = -1;
  boatMirror.renderOrder = -5;
  scene.add(boatMirror);
  const lampMat = keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, toneMapped: false, fog: false }));
  const lamp = new THREE.Sprite(lampMat);
  lamp.scale.set(2.6, 2.6, 1);
  lamp.position.set(6.1, 4.0, 0);
  boat.add(lamp);
  const lampWorld = (out = V()) => { boat.updateMatrixWorld(); return lamp.getWorldPosition(out); };

  // mist banks over the water + one high veil of haze
  const noise = keep(noiseTexture(low ? 128 : 256, low ? 64 : 128));
  const mistDefs = low
    ? [[-260, 2600, 34, 0.32, 0], [-760, 3600, 90, 0.26, 0]]
    : [[-150, 2200, 22, 0.3, 0], [-330, 2800, 40, 0.3, 0], [-620, 3400, 70, 0.26, 0], [-900, 3800, 110, 0.22, 0], [-820, 3600, 520, 0.1, 1]];
  const mists = mistDefs.map(([z, w, hgt, op, band], k) => {
    const g = keep(new THREE.PlaneGeometry(w, hgt));
    const m = keep(new THREE.ShaderMaterial({
      vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false, premultipliedAlpha: true,
      uniforms: {
        uNoise: { value: noise }, uTime: U.uTime, uWarm: U.uWarm, uCamPos: U.uCam,
        uCool: { value: new THREE.Vector3(0.3, 0.25, 0.42) }, uWarmCol: { value: new THREE.Vector3(0.52, 0.32, 0.3) },
        uOpacity: { value: op }, uSpeed: { value: 0.004 + k * 0.0015 }, uSeed: { value: Math.random() * 10 },
        uRepeat: { value: w / 900 }, uBand: { value: band },
      },
    }));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, band ? 130 + hgt / 2 : hgt / 2 - 2, z);
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  });

  /* ---------------- the lanterns ---------------- */
  const CAP = { high: 1800, mid: 900, low: 450 }[tier] || 900;
  const SPARE = 90; // your own lanterns, the pink one, the last one
  const field = createLanternField({
    scene, camera, renderer, device, max: CAP + SPARE,
    water: { y: 0, strength: 0.55 }, haze: { near: 160, far: 2100, color: '#e98448' }, wind: [0.42, -0.22],
  });
  const B = CAP - 20;
  const aMax = () => Math.atan(tanW) * 1.12;
  const cp = V();
  const cl = V();
  /** A point `d` ahead of the camera (as it will be at time `birth`), `a` radians right, at height `y` or elevation `e`. */
  const place = (birth, { d, a = 0, e = 0, y = null }) => {
    camAt(birth, cp, cl);
    const fx = cl.x - cp.x;
    const fz = cl.z - cp.z;
    const L = Math.hypot(fx, fz) || 1;
    const ux = fx / L;
    const uz = fz / L;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = ux * ca - uz * sa;
    const dz = uz * ca + ux * sa;
    const yy = y != null ? y : cp.y + Math.tan(e) * d;
    return { x: cp.x + dx * d, y: Math.max(0.25, yy), z: cp.z + dz * d };
  };
  const az = (f = 1) => (Math.random() * 2 - 1) * aMax() * f;
  const fromWater = (dMin, dMax, f = 1) => (k, birth) => {
    const d = rnd(dMin, dMax);
    return { ...place(birth, { d, a: az(f), y: rnd(0.25, 1.6) }), speed: rnd(1.3, 2.4) * (1 + d / 1100), scale: rnd(1.9, 2.6) * (d > 900 ? 1.15 : 1) };
  };
  const fromTown = () => ({ x: rnd(-140, 140), y: rnd(32, 130), z: KZ + rnd(-40, 70), speed: rnd(1.9, 3.4), scale: rnd(2.4, 3.1), warmth: rnd(-0.2, 1) });
  const fromSky = (dMin, dMax, eMax, bias = 1.5) => (k, birth) => {
    const d = rnd(dMin, dMax);
    const e = eMax * Math.pow(Math.random(), bias);
    return { ...place(birth, { d, a: az(1.06), e }), speed: rnd(1.6, 3.1) * (1 + d / 900), scale: rnd(2.0, 2.9) * (d > 900 ? 1.18 : 1), brightness: rnd(0.7, 1.05) };
  };
  const fromNear = (k, birth) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    return { ...place(birth, { d: rnd(16, 44), a: side * rnd(0.3, 1.05) * aMax(), y: rnd(0.25, 1.2) }), speed: rnd(0.7, 1.2), scale: rnd(1.6, 2.1), brightness: rnd(1.05, 1.25) };
  };

  const keepSet = new Set();
  function scheduleSky() {
    // 1 · a single lantern, lit from the boat's lamp
    keepSet.add(field.release(lampWorld(), { delay: 1.6, speed: 0.95, scale: 1.65, brightness: 1.2, warmth: 0.1, keep: true }));
    // 2, 3 · another follows… then another
    keepSet.add(field.release(place(field.time + 6, { d: 95, a: aMax() * 0.42, y: 0.4 }), { delay: 6, speed: 1.35, scale: 2.2, brightness: 1.2, keep: true }));
    keepSet.add(field.release(place(field.time + 9.2, { d: 175, a: -aMax() * 0.5, y: 0.4 }), { delay: 9.2, speed: 1.55, scale: 2.3, brightness: 1.15, keep: true }));
    // a few
    field.wave({ count: 6, start: 11.5, spread: 5, from: fromWater(110, 420, 0.75), brightness: [1, 1.15] });
    // dozens — the town lets theirs go
    const doz = Math.max(24, Math.round(B * 0.035));
    field.wave({ count: Math.round(doz * 0.55), start: 15, spread: 8, from: fromTown });
    field.wave({ count: doz - Math.round(doz * 0.55), start: 16, spread: 7, from: fromWater(140, 700) });
    // hundreds
    const hund = Math.round(B * 0.2);
    field.wave({ count: Math.round(hund * 0.55), start: 20.5, spread: 12, curve: 0.6, from: fromWater(60, 1500) });
    field.wave({ count: Math.round(hund * 0.2), start: 20.5, spread: 12, curve: 0.6, from: fromTown });
    field.wave({ count: Math.round(hund * 0.25), start: 22, spread: 11, curve: 0.6, from: fromSky(300, 1600, 0.22) });
    // thousands
    const thou = Math.round(B * 0.5);
    field.wave({ count: Math.round(thou * 0.6), start: 29, spread: 19, curve: 0.7, from: fromSky(200, 1800, 1.0, 1.2) });
    field.wave({ count: Math.round(thou * 0.3), start: 29, spread: 19, curve: 0.8, from: fromWater(60, 1700) });
    field.wave({ count: Math.round(thou * 0.1), start: 29, spread: 15, from: fromTown });
    // close ones drifting past the camera, all the way through
    field.wave({ count: Math.round(B * 0.035), start: 23, spread: 75, from: fromNear });
    // and the sky keeps breathing
    const tr = Math.round(B * 0.09);
    field.wave({ count: Math.round(tr * 0.5), start: 48, spread: 80, from: fromWater(60, 1400) });
    field.wave({ count: tr - Math.round(tr * 0.5), start: 48, spread: 80, from: fromSky(250, 1700, 1.05, 1.1) });
  }

  /* ---------------- photo lanterns ---------------- */
  const PL_MAX = low ? 2 : 3;
  const PL_SIZE = low ? 4.0 : 4.4;
  const motion = reduced ? 0.3 : 1;
  const plState = photos.map((photo, k) => ({ photo, k, pl: null, state: 'idle', age: 0, start: V(), seed: Math.random() * 10, fade: 0, out: 0 }));
  let plCursor = 0;
  let nextPhotoAt = Infinity;
  const tmp = V();
  const tmp2 = V();
  const fwd = V();
  const camUp = V();

  const plSkyPos = (s, out) => {
    const a = s.age;
    out.copy(s.start);
    out.y += 1.45 * (a - 2.4 * (1 - Math.exp(-a / 2.4)));
    out.x += Math.sin(a * 0.23 + s.seed) * 1.6 * motion + 0.18 * a;
    out.z += -0.85 * a + (Math.cos(a * 0.19 + s.seed) - Math.cos(s.seed)) * 1.0 * motion;
    return out;
  };
  const activePhotos = () => plState.filter((s) => s.state !== 'idle').length;
  function spawnPhoto(stNow) {
    if (!plState.length || activePhotos() >= PL_MAX) return false;
    for (let n = 0; n < plState.length; n++) {
      const s = plState[plCursor % plState.length];
      plCursor++;
      if (s.state !== 'idle' || s.broken) continue;
      // enter low in the frame (left / right alternately) and rise through the midground
      const side = plCursor % 2 ? 1 : -1;
      const d = rnd(44, 50);
      ray.set(side * rnd(0.3, 0.5) * (camera.aspect < 1 ? 1 : 0.7), rnd(-0.5, -0.36), 0.5).unproject(camera).sub(camera.position).normalize();
      s.start.copy(camera.position).addScaledVector(ray, d / Math.max(0.3, ray.dot(fwd.set(0, 0, -1).applyQuaternion(camera.quaternion))));
      s.start.y = Math.max(0.8, s.start.y);
      s.age = 0;
      s.out = 0;
      s.state = 'sky';
      if (!s.pl) {
        s.pl = createPhotoLantern(s.photo, { size: PL_SIZE, device });
        scene.add(s.pl);
      }
      s.pl.setOpacity(0);
      return true;
    }
    return false;
  }
  function retirePhoto(s) {
    s.state = 'idle';
    if (s.pl) { s.pl.dispose(); s.pl = null; }
  }

  // focus: the tapped memory glides close, clears and brightens, its caption appears
  let focus = null;
  const IN = reduced ? 0.9 : 1.7;
  const OUT = reduced ? 0.9 : 2.3;
  const HOLD = 7;
  const focusTarget = (s, out) => {
    const { outerW, outerH } = s.pl.size;
    const portrait = camera.aspect < 1;
    const dW = outerW / (2 * tanW * (portrait ? 0.74 : 0.4));
    const dH = outerH / (2 * tanV * (portrait ? 0.44 : 0.56));
    const D = Math.max(dW, dH);
    camera.getWorldDirection(fwd);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    return out.copy(camera.position).addScaledVector(fwd, D).addScaledVector(camUp, tanV * D * 0.1);
  };
  function openFocus(s) {
    focus = { s, k: 0, phase: 'in', t: 0 };
    s.state = 'focus';
    s.pl.hiRes();
    audio.sfx('chime');
    audio.duck(0.72, IN + HOLD);
    tweens.push(gsap.to(subsEl, { opacity: 0.1, duration: 0.6 }));
    signals.photo && signals.photo();
    // a thread tied to this memory lets go rather than being dragged along
    ribbons.forEach((r) => { if (r.state !== 'fade' && r.chain.some((a) => a.s === s)) { r.state = 'fade'; r.ft = 0; } });
  }
  function closeFocus() {
    if (!focus || focus.phase === 'out') return;
    focus.phase = 'out';
    focus.t = 0;
    hideCaption();
    audio.sfx('whoosh');
    tweens.push(gsap.to(subsEl, { opacity: 1, duration: 1.2, delay: 0.6 }));
  }
  function showCaption(s) {
    const cap = ctx.fill(s.photo.caption || '');
    const date = ctx.fill(s.photo.date || '');
    if (!cap && !date) return;
    capText.textContent = cap;
    capText.hidden = !cap;
    capDate.textContent = date;
    capDate.hidden = !date;
    el.querySelector('.ln-cap-rule').hidden = !(cap && date);
    // just below the photograph (or above it if there's no room)
    const H = el.clientHeight || window.innerHeight;
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const half = s.pl.size.outerH / 2;
    const bottom = tmp.copy(s.pl.position).addScaledVector(camUp, -half - PL_SIZE * 0.16).project(camera);
    const top = tmp2.copy(s.pl.position).addScaledVector(camUp, half).project(camera);
    const yb = (1 - bottom.y) * 0.5 * H;
    const yt = (1 - top.y) * 0.5 * H;
    capEl.classList.add('on');
    const hgt = capEl.offsetHeight || 80;
    const y = yb + 14 + hgt < H * 0.9 ? yb + 14 : Math.max(H * 0.06, yt - 14 - hgt);
    capEl.style.top = `${Math.round(y)}px`;
    tweens.push(gsap.fromTo(capEl, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'power3.out' }));
    const words = capText.textContent.split(/\s+/).length;
    focus && (focus.hold = Math.max(HOLD, 3.5 + words * 0.32));
  }
  function hideCaption() {
    tweens.push(gsap.to(capEl, { opacity: 0, duration: 0.6, onComplete: () => capEl.classList.remove('on') }));
  }

  function updatePhotos(dt, stNow, rt) {
    if (stNow >= nextPhotoAt) {
      spawnPhoto(stNow);
      nextPhotoAt = stNow + clamp(48 / Math.max(1, plState.length), 5, 8) + rnd(-0.6, 0.6);
    }
    for (const s of plState) {
      if (s.state === 'idle' || !s.pl) continue;
      const pl = s.pl;
      if (pl.failed) { retirePhoto(s); s.broken = true; continue; }
      if ((s.state === 'sky' || s.state === 'leaving') && !pl.isReady() && s.age === 0) continue;
      if (s.state === 'sky' || s.state === 'leaving') {
        s.age += dt;
        plSkyPos(s, pl.position);
        const ndc = tmp.copy(pl.position).project(camera);
        const dist = pl.position.distanceTo(camera.position);
        if (s.state === 'sky' && (ndc.y > 1.05 || dist < 11 || s.age > 70 || ndc.z > 1)) s.state = 'leaving';
        if (s.state === 'leaving') {
          s.out += dt / 1.4;
          if (s.out >= 1) { retirePhoto(s); continue; }
        }
        pl.setOpacity(Math.min(1, s.age / 2.6) * (1 - s.out));
        pl.setClarity(0);
      }
      pl.update(rt, camera);
    }
    if (focus) {
      const f = focus;
      const s = f.s;
      f.t += dt;
      if (f.phase === 'in') {
        f.k = Math.min(1, f.t / IN);
        if (f.k >= 1) { f.phase = 'hold'; f.t = 0; f.hold = HOLD; showCaption(s); }
      } else if (f.phase === 'hold') {
        if (f.t > (f.hold || HOLD)) closeFocus();
      } else if (f.phase === 'out') {
        f.k = 1 - Math.min(1, f.t / OUT);
      }
      const e = easeInOut(f.k);
      if (s.pl) {
        plSkyPos(s, tmp);
        focusTarget(s, tmp2);
        s.pl.position.lerpVectors(tmp, tmp2, e);
        s.pl.setClarity(e);
        s.pl.setOpacity(1);
      }
      field.setIntensity(1 - 0.28 * e);
      focusEl.style.opacity = String(e * 0.9);
      if (f.phase === 'out' && f.k <= 0) {
        s.state = 'sky';
        focus = null;
        field.setIntensity(1);
        focusEl.style.opacity = '0';
      }
    }
  }

  /* ---------------- the golden ribbon: a slowly growing network of memories ---------------- */
  const RB_MAX = low ? 2 : tier === 'mid' ? 4 : 5;
  const ribbons = [];
  let nextRibbonAt = Infinity;
  let ribbonCount = 0;
  const lastAnchor = { i: -1, birth: 0 };
  const anchorPos = (a, out) => {
    if (a.type === 'l') {
      if (field.birthOf(a.i) !== a.birth) return null;
      const p = field.positionOf(a.i, out);
      if (!p) return null;
      p.y -= 0.2 * a.scale;
      return p;
    }
    const s = a.s;
    if (!s.pl || s.state === 'idle') return null;
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    return out.copy(s.pl.position).addScaledVector(camUp, -(s.pl.size.outerH / 2 + PL_SIZE * 0.12));
  };
  function makeRibbon() {
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || window.innerHeight;
    const m = Math.min(W, H);
    let pts = field.visible({ near: 45, far: 520, margin: 0.85 }).map((i) => {
      const s = field.screenOf(i, {});
      return { i, x: s.x, y: s.y, d: s.dist };
    }).filter((p) => p.y > H * 0.1 && p.y < H * 0.78 && !keepSet.has(p.i));
    // one depth band per ribbon, so the silk runs across the sky rather than lunging at the camera
    const band = [rnd(60, 110), 0];
    band[1] = band[0] * rnd(2.2, 3);
    if (pts.filter((p) => p.d > band[0] && p.d < band[1]).length >= 8) pts = pts.filter((p) => p.d > band[0] && p.d < band[1]);
    if (pts.length < 6) return;
    const used = new Set();
    let cur = null;
    if (lastAnchor.i >= 0 && field.birthOf(lastAnchor.i) === lastAnchor.birth && Math.random() < 0.65) {
      const s = field.screenOf(lastAnchor.i, {});
      if (s && s.visible && s.y < H * 0.82) cur = { i: lastAnchor.i, x: s.x, y: s.y, d: s.dist };
    }
    if (!cur) {
      const side = ribbonCount % 2 ? 1 : 0;
      const pool = pts.filter((p) => (side ? p.x > W * 0.6 : p.x < W * 0.4));
      cur = (pool.length ? pool : pts)[(Math.random() * (pool.length || pts.length)) | 0];
    }
    used.add(cur.i);
    const chain = [{ type: 'l', i: cur.i }];
    let hx = cur.x < W / 2 ? 1 : -1;
    let hy = rnd(-0.45, 0.25);
    const hl = Math.hypot(hx, hy);
    hx /= hl; hy /= hl;
    const n = 4 + ((Math.random() * 3) | 0);
    let photoUsed = false;
    for (let k = 1; k < n; k++) {
      // a memory joins the thread when one is close by
      if (!photoUsed && k >= 2) {
        const sp = plState.find((s) => s.state === 'sky' && s.pl && s.pl.getOpacity() > 0.6 && (() => {
          const q = tmp.copy(s.pl.position).project(camera);
          const x = (q.x + 1) * 0.5 * W;
          const y = (1 - q.y) * 0.5 * H;
          return Math.hypot(x - cur.x, y - cur.y) < m * 0.45 && q.y < 0.7 && q.y > -0.7;
        })());
        if (sp) {
          photoUsed = true;
          chain.push({ type: 'p', s: sp });
          const q = tmp.copy(sp.pl.position).project(camera);
          cur = { i: -1, x: (q.x + 1) * 0.5 * W, y: (1 - q.y) * 0.5 * H };
          continue;
        }
      }
      const opts = pts.filter((p) => {
        if (used.has(p.i)) return false;
        const dx = p.x - cur.x;
        const dy = p.y - cur.y;
        const d = Math.hypot(dx, dy);
        if (d < m * 0.14 || d > m * 0.36) return false;
        return (dx * hx + dy * hy) / d > 0.74; // gentle turns only: a sweep, never a knot
      }).sort((a, b) => Math.abs(Math.hypot(a.x - cur.x, a.y - cur.y) - m * 0.22) - Math.abs(Math.hypot(b.x - cur.x, b.y - cur.y) - m * 0.22));
      if (!opts.length) break;
      const nx = opts[(Math.random() * Math.min(4, opts.length)) | 0];
      used.add(nx.i);
      chain.push({ type: 'l', i: nx.i });
      const dx = nx.x - cur.x;
      const dy = nx.y - cur.y;
      const d = Math.hypot(dx, dy);
      hx = hx * 0.7 + (dx / d) * 0.3;
      hy = hy * 0.7 + (dy / d) * 0.3;
      const l2 = Math.hypot(hx, hy);
      hx /= l2; hy /= l2;
      cur = nx;
    }
    if (chain.length < 3) return;
    chain.forEach((a) => {
      if (a.type === 'l') {
        a.birth = field.birthOf(a.i);
        a.scale = 2;
      }
    });
    const lastL = [...chain].reverse().find((a) => a.type === 'l');
    if (lastL) { lastAnchor.i = lastL.i; lastAnchor.birth = lastL.birth; }
    const points = chain.map((a) => anchorPos(a, V()));
    if (points.some((p) => !p)) return;
    // a ribbon of light, not a wire: about the same soft width on screen wherever it runs
    const avg = points.reduce((acc, p) => acc + p.distanceTo(camera.position), 0) / points.length;
    const r3 = createRibbon3D({ points, color: '#ffd98a', width: clamp(avg * 0.012, 0.7, 6), strands: 3, device, minPixels: 2.4, opacity: 0.9 });
    scene.add(r3);
    const live = ribbons.filter((r) => r.state !== 'fade');
    if (live.length >= RB_MAX) { live[0].state = 'fade'; live[0].ft = 0; }
    ribbons.push({ r3, chain, born: skyT, draw: (reduced ? 2.4 : 3.4) + chain.length * 0.75, state: 'draw', ft: 0, alpha: 0.9, check: 0 });
    if (ribbonCount === 0) audio.sfx('shimmer');
    ribbonCount++;
  }
  const rp = [];
  function updateRibbons(dt, rt) {
    if (skyT >= nextRibbonAt) {
      makeRibbon();
      nextRibbonAt = skyT + rnd(6.5, 8.5);
    }
    for (let k = ribbons.length - 1; k >= 0; k--) {
      const r = ribbons[k];
      let ok = true;
      r.chain.forEach((a, j) => {
        rp[j] = rp[j] || V();
        if (!anchorPos(a, rp[j])) ok = false;
      });
      if (ok) r.r3.setPoints(rp.slice(0, r.chain.length));
      else if (r.state !== 'fade') { r.state = 'fade'; r.ft = 0; }
      if (r.state === 'draw') {
        const p = (skyT - r.born) / r.draw;
        r.r3.setProgress(reduced ? Math.min(1, p * 4) : easeInOut(Math.min(1, p)));
        if (p >= 1) r.state = 'hold';
      } else if (r.state === 'hold') {
        // drifted out of view with its lanterns? let it go
        r.check += dt;
        if (r.check > 1) {
          r.check = 0;
          const any = r.chain.some((a) => a.type === 'l' && field.isAlive(a.i) && (() => { const s = field.screenOf(a.i, {}); return s && s.visible; })());
          if (!any) { r.state = 'fade'; r.ft = 0; }
        }
      }
      if (r.state === 'fade') {
        r.ft += dt;
        r.r3.setOpacity(r.alpha * (1 - r.ft / 3));
        if (r.ft >= 3) { r.r3.dispose(); ribbons.splice(k, 1); continue; }
      }
      r.r3.update(rt);
    }
  }

  /* ---------------- the pink lantern ---------------- */
  const pink = { idx: -1, found: false, check: 0, placed: 0 };
  function placePink(stNow) {
    if (pink.idx >= 0) field.extinguish(pink.idx);
    const side = Math.random() < 0.5 ? -1 : 1;
    const p = place(stNow, { d: rnd(58, 74), a: side * rnd(0.35, 0.72) * Math.atan(tanW), e: rnd(0.0, 0.1) });
    pink.idx = field.release(p, { speed: 0.42, scale: 1.45, hue: 'rose', brightness: 1.25, warmth: 0, keep: true });
    pink.placed = stNow;
  }
  function updatePink(dt, stNow) {
    if (pink.idx < 0 || pink.found) return;
    pink.check += dt;
    if (pink.check < 1) return;
    pink.check = 0;
    const s = field.screenOf(pink.idx, {});
    const H = el.clientHeight || window.innerHeight;
    if ((!s || !s.visible || s.y < H * 0.08 || s.dist < 14) && stNow - pink.placed > 6) placePink(stNow);
  }
  function findPink(s) {
    pink.found = true;
    const isNew = ctx.eggs.found('pink-lantern', ctx.fill(T.secret));
    fx.sparkle(s.x, s.y, 26, { spread: 60, pink: true });
    if (isNew) audio.sfx('magic');
    field.rebase(pink.idx, 2.6);
    field.pin(pink.idx, false);
  }

  /* ---------------- your own lanterns ---------------- */
  const signals = {};
  let interactive = false;
  let lastRelease = 0;
  let released = 0;
  const ray = V();
  function releaseAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ray.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const p = camera.position.clone().addScaledVector(ray, rnd(34, 46));
    p.y = Math.max(0.6, p.y - 2.5);
    field.release(p, { speed: rnd(1.6, 2.0), scale: rnd(2.0, 2.3), brightness: 1.2, warmth: rnd(-0.3, 0.5) });
    fx.sparkle(x, y, 10, { spread: 30 });
    if (released++ % 2 === 0) audio.sfx('lanternRise');
    signals.sky && signals.sky();
  }
  function hitPhoto(x, y) {
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || window.innerHeight;
    let best = null;
    let bd = Infinity;
    for (const s of plState) {
      if (s.state !== 'sky' || !s.pl || s.pl.getOpacity() < 0.3) continue;
      const dist = s.pl.position.distanceTo(camera.position);
      const q = tmp.copy(s.pl.position).project(camera);
      if (q.z > 1) continue;
      const px = (q.x + 1) * 0.5 * W;
      const py = (1 - q.y) * 0.5 * H;
      const rad = (s.pl.size.radius * camera.projectionMatrix.elements[5] * H * 0.5) / dist;
      if (Math.hypot(px - x, py - y) < rad * 0.9 + 16 && dist < bd) { best = s; bd = dist; }
    }
    return best;
  }
  on(canvas, 'pointerdown', (e) => {
    if (!interactive) return;
    const x = e.clientX;
    const y = e.clientY;
    if (focus) { closeFocus(); return; }
    if (pink.idx >= 0 && !pink.found) {
      const s = field.screenOf(pink.idx, {});
      if (s && s.visible && Math.hypot(s.x - x, s.y - y) < Math.max(30, s.r * 2.6)) { findPink(s); return; }
    }
    const s = hitPhoto(x, y);
    if (s) { openFocus(s); return; }
    const now = performance.now();
    if (now - lastRelease < 160) return;
    lastRelease = now;
    releaseAt(x, y);
  });

  /* ---------------- the loop ---------------- */
  let skyT = 0;
  let rt = 0;
  let T0 = Infinity;
  let raf = 0;
  let running = true;
  let last = performance.now();
  const waiters = [];
  const untilSky = (t) => new Promise((res, rej) => {
    if (skyT >= t) return res();
    const w = { t, res };
    waiters.push(w);
    ctx.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')), { once: true });
  });
  const cues = [];
  const cue = (t, fn) => cues.push({ t, fn });
  const lampPos = V();

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    rt += dt;
    skyT += dt;
    placeCamera(skyT, rt);
    U.uTime.value = rt;
    U.uCam.value.copy(camera.position);
    const s = skyT - T0;
    U.uGlow.value = 0.3 + 0.7 * sstep(13, 42, s);
    U.uWarm.value = sstep(20, 52, s);
    winU.uLit.value = 0.55 + 0.45 * sstep(10, 30, s);
    kGlowMat.opacity = 0.18 + 0.4 * U.uGlow.value;
    boat.position.y = 0.15 + Math.sin(rt * 0.9) * 0.06 * motion;
    boat.rotation.z = Math.sin(rt * 0.7) * 0.02 * motion;
    boatMirror.position.set(boat.position.x, -boat.position.y, boat.position.z);
    boatMirror.rotation.set(0, boat.rotation.y, -boat.rotation.z);
    lampMat.opacity = 0.75 + 0.12 * Math.sin(rt * 7.3) + 0.06 * Math.sin(rt * 13.1);
    field.update(skyT, dt);
    for (let k = cues.length - 1; k >= 0; k--) if (skyT >= cues[k].t) { const c = cues.splice(k, 1)[0]; c.fn(); }
    for (let k = waiters.length - 1; k >= 0; k--) if (skyT >= waiters[k].t) waiters.splice(k, 1)[0].res();
    updatePhotos(dt, skyT, rt);
    updateRibbons(dt, rt);
    updatePink(dt, skyT);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  lampWorld(lampPos);

  /* ---------------- the story ---------------- */
  async function play() {
    ctx.letterbox(true);
    fx.dust({ density: 0.1, alpha: 0.8 });
    audio.setMood('hush');
    tweens.push(gsap.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: 4, ease: 'power2.inOut' }));
    // (TEMP debug: ?lnt=<seconds> skips the title card and jumps the sky clock)
    const dbg = Number(new URLSearchParams(location.search).get('lnt')) || 0;
    if (!dbg) await ui.chapterCard(T.kicker, T.title);
    T0 = skyT;
    scheduleSky();
    if (dbg) { skyT = T0 + dbg; window.__ln = { field, camera, get skyT() { return skyT; }, set skyT(v) { skyT = v; }, plState, ribbons, pink, openFocus, focus: () => focus }; }
    nextPhotoAt = T0 + 20;
    nextRibbonAt = T0 + (reduced ? 36 : 33);
    cue(T0 + 9, () => audio.setMood('wonder'));
    cue(T0 + 28.5, () => { audio.setMood('soar'); audio.sfx('swell'); });
    cue(T0 + 31, () => placePink(skyT));
    cue(T0 + 4, () => { interactive = true; });

    // narration lands on the beats: one lantern · a hundred · thousands · you
    const BEATS = [1.5, 21, 30, 40];
    const at = (k, L) => (L <= 4 ? BEATS[Math.round((k * 3) / Math.max(1, L - 1))] : 1.5 + (k * 38.5) / (L - 1));
    for (let k = 0; k < lines.length; k++) {
      await untilSky(T0 + at(k, lines.length));
      const big = lines.length > 1 && k === lines.length - 1;
      await ui.narrate([lines[k]], big ? { position: 'bottom', style: 'big', hold: 3.6 } : { position: 'bottom' });
    }

    // invitations to play
    if (plState.length) {
      const visible = () => plState.some((s) => s.state === 'sky' && s.pl && s.pl.getOpacity() > 0.8);
      for (let n = 0; n < 40 && !visible(); n++) await ctx.wait(0.25);
      if (!focus) {
        const hint = ui.hint(T.photoHint);
        await Promise.race([new Promise((r) => (signals.photo = r)), ctx.wait(8)]);
        hint.remove();
        while (focus) await ctx.wait(0.3);
        await ctx.wait(0.8);
      }
    }
    const tapHint = ui.hint(T.tapHint);
    await Promise.race([new Promise((r) => (signals.sky = r)), ctx.wait(8)]);
    tapHint.remove();

    await untilSky(T0 + 58);
    while (focus) await ctx.wait(0.3);
    if (T.after) await ui.narrate([T.after], { position: 'bottom', hold: 3.8 });
    await ctx.wait(1.2);

    // the last lantern, low in the frame: its light becomes the letter's candle
    ray.set(-0.24, -0.4, 0.5).unproject(camera).sub(camera.position).normalize();
    const candle = field.release(camera.position.clone().addScaledVector(ray, 22), { speed: 0.5, scale: 1.9, brightness: 1.3, warmth: 0.25, keep: true });
    await ctx.wait(1.4);
    await ui.waitContinue('Continue');
    closeFocus();
    let s = field.screenOf(candle, {});
    const H = el.clientHeight || window.innerHeight;
    const W = el.clientWidth || window.innerWidth;
    if (!s || !s.visible) {
      const near = field.visible({ near: 8, far: 160, margin: 0.9 }).map((i) => field.screenOf(i, {})).filter((q) => q && q.y < H * 0.9);
      s = near.sort((a, b) => b.y - a.y)[0] || { x: W / 2, y: H * 0.78 };
    }
    ctx.next({ kind: 'ember', x: Math.round(s.x), y: Math.round(s.y), color: '#ffb347' });
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    listeners.length = 0;
    tweens.forEach((tw) => tw && tw.kill && tw.kill());
    gsap.killTweensOf([veil, capEl, focusEl]);
    gsap.killTweensOf(subsEl, 'opacity');
    gsap.set(subsEl, { clearProps: 'opacity' });
    waiters.length = 0;
    cues.length = 0;
    plState.forEach((s) => { if (s.pl) s.pl.dispose(); s.pl = null; });
    ribbons.forEach((r) => r.r3.dispose());
    ribbons.length = 0;
    field.dispose();
    mists.length = 0;
    scene.clear();
    disposables.forEach((d) => d && d.dispose && d.dispose());
    disposables.length = 0;
    renderer.dispose();
    renderer.forceContextLoss();
    if (window.__ln) delete window.__ln;
  }

  return { play, dispose };
}

export default {
  id: 'lanterns',
  title: 'The Night of Lanterns',
  async enter(ctx, el) {
    const ch = createChapter(ctx, el);
    this._ch = ch;
    await ch.play();
  },
  async exit() {
    const ch = this._ch;
    this._ch = null;
    if (ch) ch.dispose();
  },
};
