// The lantern engine — thousands of GPU-animated sky lanterns, photo-lanterns
// (a real photograph inside a softly glowing paper-and-glass frame) and a 3D
// golden ribbon of light. Shared by `lanterns`, `constellation` and `birthday`.
// Contract: docs/ARCHITECTURE.md §3.
//
//   const field = createLanternField({ scene, camera, renderer, device, max, water, haze, wind });
//   field.wave({ count, from, start, spread, speed, scale, warmth, brightness })   → slot indices
//   field.release(pos, { speed, scale })                                            → slot index
//   field.formShape(points3D, { duration })                                         → Promise<indices> (+ .indices)
//   field.update(time, dt); field.dispose();
//   const pl = createPhotoLantern(photo, { size, device });  // THREE.Group: setOpacity, setClarity, update(time, camera), dispose
//   const r3 = createRibbon3D({ points, color, width });     // THREE.Group: setPoints, setProgress, setOpacity, update(time), dispose
//
// Every lantern's motion is a pure function of time evaluated on the GPU; the
// same maths runs on the CPU (positionOf) for picking, ribbons and hand-offs.
import * as THREE from 'three';

const NEVER = 1e9;
const RISE_TAU = 2.4; // seconds for a freshly released lantern to reach its rising speed
const LIT_AGE = 1.8; // seconds for its flame to catch
const TIER_MAX = { high: 1800, mid: 900, low: 450 };

const rnd = (a, b) => a + Math.random() * (b - a);
const val = (v, def) => {
  const r = v == null ? def : v;
  return Array.isArray(r) ? rnd(r[0], r[1]) : r;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth5 = (k) => k * k * k * (k * (k * 6 - 15) + 10);

/** '#ffd98a' → display-space RGB (our shaders work in display space, like CSS). */
function rgb(hex) {
  if (Array.isArray(hex)) return new THREE.Vector3(hex[0], hex[1], hex[2]);
  if (hex && hex.isVector3) return hex.clone();
  const n = parseInt(String(hex || '#ffd98a').replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function v3(p) {
  if (!p) return new THREE.Vector3();
  if (p.isVector3) return p.clone();
  if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
  return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

/* =================================================================== GLSL */

const MOTION = /* glsl */ `
  attribute vec4 aStart;   // x, y, z, life
  attribute vec4 aParams;  // rise speed, seed, birth time, scale
  attribute vec4 aExtra;   // warmth (-1 pale gold … +1 deep amber), brightness, hue (0 amber, 1 rose), form duration
  attribute vec4 aForm;    // shape target xyz, form start time (>= 1e8: free)
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uMotion;
  vec3 lfSway(float a, float seed, float s) {
    return vec3((sin(a * 0.31 + seed * 6.2832) * 0.85 + sin(a * 0.11 + seed * 3.1) * 1.6) * s, 0.0, cos(a * 0.27 + seed * 4.7) * 0.75 * s);
  }
  float lfEase(float k) { return k * k * k * (k * (k * 6.0 - 15.0) + 10.0); }
  vec3 lfCenter(out float age) {
    age = uTime - aParams.z;
    float a = max(age, 0.0);
    float s = aParams.w * uMotion;
    vec3 p = aStart.xyz;
    p.y += aParams.x * (a - ${RISE_TAU.toFixed(3)} * (1.0 - exp(-a / ${RISE_TAU.toFixed(3)})));
    p += lfSway(a, aParams.y, s) - lfSway(0.0, aParams.y, s);
    p.xz += uWind * a;
    if (aForm.w < 1.0e8) {
      float k = lfEase(clamp((uTime - aForm.w) / max(aExtra.w, 0.001), 0.0, 1.0));
      vec3 hover = vec3(sin(uTime * 0.53 + aParams.y * 20.0), sin(uTime * 0.71 + aParams.y * 13.0) * 1.3, cos(uTime * 0.37 + aParams.y * 9.0)) * 0.22 * s;
      p = mix(p, aForm.xyz + hover, k);
    }
    return p;
  }
  float lfFlicker(float t, float seed) {
    return 0.9 + 0.05 * sin(t * 1.7 + seed * 40.0) + 0.035 * sin(t * 9.3 + seed * 61.0) + 0.02 * sin(t * 23.0 + seed * 17.0);
  }
  float lfLight(float age, float life) {
    return smoothstep(0.0, ${LIT_AGE.toFixed(2)}, age) * (1.0 - smoothstep(life - 4.0, life, age));
  }
  // the flame catches first (a spark), then the paper fills with warm light
  float lfSpark(float age, float life) {
    return smoothstep(0.0, 0.6, age) * (1.0 - smoothstep(life - 4.0, life, age));
  }
  float lfHaze(vec2 range, float depth, float seed) {
    // depth haze, plus a few lanterns sitting behind a drift of mist
    float extra = step(0.72, fract(seed * 7.31)) * 0.32 * smoothstep(40.0, 220.0, depth);
    return clamp(smoothstep(range.x, range.y, depth) + extra, 0.0, 1.0);
  }
`;

const BODY_VERT = /* glsl */ `
  ${MOTION}
  uniform vec2 uHaze;
  varying vec2 vUv;
  varying float vFacing;
  varying float vHaze;
  varying float vI;
  varying vec2 vTone;
  void main() {
    float age;
    vec3 c = lfCenter(age);
    if (age < 0.0 || age > aStart.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float s = aParams.w;
    // a gentle two-axis pendulum; livelier just after launch
    float wob = uMotion * (1.0 + 1.6 * exp(-age * 0.7));
    float tz = sin(uTime * 0.61 + aParams.y * 20.0) * 0.075 * wob;
    float tx = sin(uTime * 0.47 + aParams.y * 31.0) * 0.06 * wob;
    mat2 rz = mat2(cos(tz), sin(tz), -sin(tz), cos(tz));
    mat2 rx = mat2(cos(tx), sin(tx), -sin(tx), cos(tx));
    float lit = smoothstep(0.0, ${LIT_AGE.toFixed(2)}, age);
    vec3 p = position * s * vec3(mix(0.7, 1.0, lit), mix(0.55, 1.0, lit), mix(0.7, 1.0, lit)); // inflating with hot air
    vec3 n = normal;
    p.xy = rz * p.xy; n.xy = rz * n.xy;
    p.yz = rx * p.yz; n.yz = rx * n.yz;
    vec4 mv = modelViewMatrix * vec4(c + p, 1.0);
    vFacing = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz)));
    vUv = uv;
    vHaze = lfHaze(uHaze, -mv.z, aParams.y);
    vI = lit * lit * (1.0 - smoothstep(aStart.w - 4.0, aStart.w, age)) * lfFlicker(uTime, aParams.y) * aExtra.y;
    vTone = vec2(aExtra.x, aExtra.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const BODY_FRAG = /* glsl */ `
  uniform vec3 uHazeColor;
  uniform float uExposure;
  varying vec2 vUv;
  varying float vFacing;
  varying float vHaze;
  varying float vI;
  varying vec2 vTone;
  void main() {
    float h = vUv.y;
    float w = vTone.x * 0.5 + 0.5;
    vec3 hot = mix(vec3(1.0, 0.9, 0.64), vec3(1.0, 0.82, 0.5), w);
    vec3 mid = mix(vec3(1.0, 0.7, 0.34), vec3(1.0, 0.55, 0.2), w);
    vec3 top = mix(vec3(0.92, 0.45, 0.17), vec3(0.78, 0.24, 0.08), w);
    if (vTone.y > 0.5) { hot = vec3(1.0, 0.9, 0.93); mid = vec3(1.0, 0.62, 0.76); top = vec3(0.86, 0.36, 0.56); }
    vec3 col = mix(hot, mid, smoothstep(0.0, 0.45, h));
    col = mix(col, top, smoothstep(0.42, 1.0, h));
    // light from the flame at the open bottom: brightest low and face-on
    float glow = (1.75 - h * 1.05) * (0.58 + 0.6 * vFacing);
    if (!gl_FrontFacing) glow *= 1.12;
    // paper seams (fade out when the lantern is only a few pixels tall)
    float u = fract(vUv.x * 4.0);
    float fw = fwidth(vUv.x * 4.0);
    float seam = 1.0 - 0.26 * (1.0 - smoothstep(0.0, 0.05 + fw, min(u, 1.0 - u))) * (1.0 - smoothstep(0.12, 0.35, fw));
    glow *= seam * mix(1.0, 0.7, smoothstep(0.84, 1.0, h));
    col *= glow * vI * uExposure;
    col = mix(col, uHazeColor * vI * uExposure, vHaze * 0.62);
    col = 1.0 - exp(-col * 1.35);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLOW_VERT = /* glsl */ `
  ${MOTION}
  uniform vec2 uHaze;
  uniform float uViewScale;
  uniform float uMaxPoint;
  uniform float uSize;
  uniform float uMirror;
  uniform float uWaterY;
  uniform float uReflect;
  varying float vAlpha;
  varying float vHue;
  varying float vSeed;
  void main() {
    float age;
    vec3 c = lfCenter(age);
    if (age < 0.0 || age > aStart.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float s = aParams.w;
    c.y -= 0.2 * s; // the flame sits low in the lantern
    float a = lfSpark(age, aStart.w) * lfFlicker(uTime, aParams.y) * aExtra.y;
    vHue = aExtra.z;
    vSeed = aParams.y;
    vec4 mv;
    if (uMirror > 0.5) {
      float hgt = max(c.y - uWaterY, 0.0);
      a *= uReflect * exp(-hgt / 170.0);
      vec3 V = vec3(c.x + sin(uTime * 1.3 + c.z * 0.07) * 0.25 * s, 2.0 * uWaterY - c.y, c.z);
      mv = modelViewMatrix * vec4(V, 1.0);
      gl_Position = projectionMatrix * mv;
      // depth-test against what stands on the water (boats, the kingdom) at the surface point
      vec3 wv = (modelMatrix * vec4(V, 1.0)).xyz;
      float k = (cameraPosition.y - uWaterY) / max(cameraPosition.y - wv.y, 1e-3);
      vec4 cw = projectionMatrix * viewMatrix * vec4(cameraPosition + (wv - cameraPosition) * k, 1.0);
      gl_Position.z = clamp(cw.z / cw.w, -1.0, 1.0) * gl_Position.w;
    } else {
      mv = modelViewMatrix * vec4(c, 1.0);
      gl_Position = projectionMatrix * mv;
    }
    float depth = max(-mv.z, 0.05);
    float hz = lfHaze(uHaze, depth, aParams.y);
    float px = uSize * s * (1.0 + hz * 0.7) * uViewScale / depth;
    a *= 1.0 - hz * 0.55;
    a *= smoothstep(0.5, 2.2, px);
    a *= 1.0 - smoothstep(uMaxPoint * 0.6, uMaxPoint * 1.6, px) * 0.6; // very close: don't wash the screen
    gl_PointSize = min(px, uMaxPoint);
    vAlpha = a;
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform float uMirror;
  uniform float uTime;
  uniform float uIntensity;
  varying float vAlpha;
  varying float vHue;
  varying float vSeed;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float band = 1.0;
    if (uMirror > 0.5) {
      q *= vec2(2.7, 0.92);
      band = 0.62 + 0.38 * sin(gl_PointCoord.y * 24.0 - uTime * 2.1 + vSeed * 30.0);
    }
    float d = dot(q, q);
    float a = (exp(-d * 15.0) * 0.36 + exp(-d * 120.0) * 0.62) * band * vAlpha * uIntensity;
    vec3 halo = vHue > 0.5 ? vec3(1.0, 0.48, 0.66) : vec3(1.0, 0.54, 0.22);
    vec3 core = vHue > 0.5 ? vec3(1.0, 0.86, 0.92) : vec3(1.0, 0.88, 0.68);
    vec3 col = mix(halo, core, exp(-d * 70.0));
    gl_FragColor = vec4(col * a, a);
  }
`;

/* ============================================================ lantern field */

/**
 * GPU-instanced sky lanterns with depth haze, warm flicker, sway and (optionally)
 * reflections on still water. Adds itself to `scene`.
 *
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {THREE.Camera} o.camera
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {object} [o.device]   ctx.device ({ tier, reducedMotion, … })
 * @param {number} [o.max]      capacity (default by tier: high 1800, mid 900, low 450)
 * @param {false|{y?:number, strength?:number}} [o.water]  draw reflections on a water plane
 * @param {{near?:number, far?:number, color?:string}} [o.haze]  atmospheric haze toward distance
 * @param {[number, number]} [o.wind]   steady drift (world units/s along x and z)
 * @param {number} [o.size]     glow size relative to a lantern
 */
export function createLanternField({ scene, camera, renderer, device = {}, max, water = false, haze = {}, wind = [0.45, -0.25], size = 3.4, exposure = 1, intensity = 1 } = {}) {
  const tier = device.tier || 'high';
  const N = Math.max(8, Math.round(max || TIER_MAX[tier] || 900));
  const motion = device.reducedMotion ? 0.35 : 1;
  const W = { x: wind[0] || 0, z: wind[1] || 0 };

  const aStart = new Float32Array(N * 4);
  const aParams = new Float32Array(N * 4);
  const aExtra = new Float32Array(N * 4);
  const aForm = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    aStart[i * 4 + 3] = 1e5;
    aParams[i * 4 + 1] = Math.random();
    aParams[i * 4 + 2] = NEVER;
    aParams[i * 4 + 3] = 2;
    aExtra[i * 4 + 1] = 1;
    aForm[i * 4 + 3] = NEVER;
  }
  const pinned = new Uint8Array(N);

  const U = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(W.x, W.z) },
    uMotion: { value: motion },
    uHaze: { value: new THREE.Vector2(haze.near ?? 140, haze.far ?? 1900) },
    uHazeColor: { value: rgb(haze.color || '#f08a4a') },
    uExposure: { value: exposure },
    uIntensity: { value: intensity },
    uViewScale: { value: 600 },
    uMaxPoint: { value: 256 },
  };
  try {
    const gl = renderer.getContext();
    const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    U.uMaxPoint.value = Math.max(32, Math.min(r ? r[1] : 256, 400 * (device.dpr || 1)));
  } catch { /* keep default */ }

  // a sky lantern: a paper bag, wide and rounded at the top, open at the bottom
  const profile = [[0.27, -0.5], [0.33, -0.36], [0.41, -0.12], [0.46, 0.12], [0.47, 0.3], [0.42, 0.43], [0.26, 0.5], [0.0, 0.52]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const base = new THREE.LatheGeometry(profile, tier === 'low' ? 8 : 12);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, base.getAttribute(k));
  const attrs = [
    ['aStart', aStart], ['aParams', aParams], ['aExtra', aExtra], ['aForm', aForm],
  ].map(([name, arr]) => {
    const a = new THREE.InstancedBufferAttribute(arr, 4);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  });
  geo.instanceCount = N;

  const pgeo = new THREE.InstancedBufferGeometry();
  pgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  ['aStart', 'aParams', 'aExtra', 'aForm'].forEach((name, k) => pgeo.setAttribute(name, attrs[k]));
  pgeo.instanceCount = N;

  const bodyMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, side: THREE.DoubleSide });
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uSize: { value: size }, uMirror: { value: 0 }, uWaterY: { value: 0 }, uReflect: { value: 0 } },
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
  const object = new THREE.Group();
  object.name = 'lantern-field';
  const bodies = new THREE.Mesh(geo, bodyMat);
  const glows = new THREE.Points(pgeo, glowMat);
  bodies.frustumCulled = glows.frustumCulled = false;
  glows.renderOrder = 6;
  object.add(bodies, glows);

  const size2 = new THREE.Vector2();
  const syncView = (r, s, cam) => {
    r.getDrawingBufferSize(size2);
    U.uViewScale.value = size2.y * 0.5 * cam.projectionMatrix.elements[5];
  };
  glows.onBeforeRender = syncView;

  let mirrorMat = null;
  if (water) {
    mirrorMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uSize: { value: size * 1.45 }, uMirror: { value: 1 }, uWaterY: { value: water.y || 0 }, uReflect: { value: water.strength ?? 0.5 } },
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    });
    const mirrors = new THREE.Points(pgeo, mirrorMat);
    mirrors.frustumCulled = false;
    mirrors.renderOrder = 1;
    mirrors.onBeforeRender = syncView;
    object.add(mirrors);
  }
  scene.add(object);

  /* ---------------- CPU mirror of the GPU motion ---------------- */
  let time = 0;
  const swayX = (a, seed) => Math.sin(a * 0.31 + seed * 6.2832) * 0.85 + Math.sin(a * 0.11 + seed * 3.1) * 1.6;
  const swayZ = (a, seed) => Math.cos(a * 0.27 + seed * 4.7) * 0.75;
  const riseOf = (a) => a - RISE_TAU * (1 - Math.exp(-a / RISE_TAU));

  function ageOf(i, t = time) { return t - aParams[i * 4 + 2]; }
  function isAlive(i, t = time) {
    const age = ageOf(i, t);
    return age >= 0 && age <= aStart[i * 4 + 3];
  }

  /** World position of lantern `i` at time `t` (null when not alive). */
  function positionOf(i, out = new THREE.Vector3(), t = time) {
    const o = i * 4;
    const age = t - aParams[o + 2];
    if (!(age >= 0 && age <= aStart[o + 3])) return null;
    const s = aParams[o + 3] * motion;
    const seed = aParams[o + 1];
    let x = aStart[o] + (swayX(age, seed) - swayX(0, seed)) * s + W.x * age;
    const y0 = aStart[o + 1] + aParams[o] * riseOf(age);
    let z = aStart[o + 2] + (swayZ(age, seed) - swayZ(0, seed)) * s + W.z * age;
    let y = y0;
    const fs = aForm[o + 3];
    if (fs < 1e8) {
      const k = smooth5(clamp((t - fs) / Math.max(aExtra[o + 3], 0.001), 0, 1));
      const hx = Math.sin(t * 0.53 + seed * 20) * 0.22 * s;
      const hy = Math.sin(t * 0.71 + seed * 13) * 1.3 * 0.22 * s;
      const hz = Math.cos(t * 0.37 + seed * 9) * 0.22 * s;
      x += (aForm[o] + hx - x) * k;
      y += (aForm[o + 1] + hy - y) * k;
      z += (aForm[o + 2] + hz - z) * k;
    }
    return out.set(x, y, z);
  }

  let rect = { left: 0, top: 0, width: 1, height: 1 };
  const readRect = () => {
    const r = renderer.domElement.getBoundingClientRect();
    rect = { left: r.left, top: r.top, width: r.width || window.innerWidth, height: r.height || window.innerHeight };
  };
  readRect();
  const tv = new THREE.Vector3();
  const tv2 = new THREE.Vector3();

  /** Screen position (CSS px) of lantern `i`: { x, y, r (approx. glow radius px), dist, visible } or null. */
  function screenOf(i, out = {}, t = time) {
    const p = positionOf(i, tv, t);
    if (!p) return null;
    const dist = p.distanceTo(camera.position);
    p.project(camera);
    out.x = rect.left + (p.x + 1) * 0.5 * rect.width;
    out.y = rect.top + (1 - p.y) * 0.5 * rect.height;
    out.dist = dist;
    const fy = camera.projectionMatrix.elements[5];
    out.r = (aParams[i * 4 + 3] * 0.55 * fy * rect.height * 0.5) / Math.max(dist, 0.01);
    out.visible = p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
    out.ndcX = p.x;
    out.ndcY = p.y;
    return out;
  }

  function onScreen(i, t = time, margin = 1.15) {
    const p = positionOf(i, tv2, t);
    if (!p) return false;
    p.project(camera);
    return p.z < 1 && Math.abs(p.x) <= margin && Math.abs(p.y) <= margin;
  }

  /* ---------------- allocation ---------------- */
  let fresh = 0;
  let dmin = Infinity;
  let dmax = -1;
  const dirty = (i) => { if (i < dmin) dmin = i; if (i > dmax) dmax = i; };

  function allocMany(k) {
    const out = [];
    while (out.length < k && fresh < N) out.push(fresh++);
    if (out.length >= k) return out;
    const cands = [];
    for (let i = 0; i < N; i++) {
      if (pinned[i] || aForm[i * 4 + 3] < 1e8) continue;
      const age = ageOf(i);
      if (age < 0 && aParams[i * 4 + 2] < NEVER * 0.5) continue; // scheduled, not born yet
      const born = aParams[i * 4 + 2];
      let score;
      if (born >= NEVER * 0.5 || age > aStart[i * 4 + 3]) score = -2e9 + born; // free / burnt out
      else if (age > 12 && !onScreen(i)) score = -1e9 + born; // long gone from view
      else score = born; // last resort: the oldest
      cands.push([score, i]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let j = 0; j < cands.length && out.length < k; j++) out.push(cands[j][1]);
    return out;
  }

  function write(i, { x, y, z, speed, birth, scale, warmth, brightness, hue, life }) {
    const o = i * 4;
    aStart[o] = x; aStart[o + 1] = y; aStart[o + 2] = z; aStart[o + 3] = life;
    aParams[o] = speed; aParams[o + 1] = Math.random(); aParams[o + 2] = birth; aParams[o + 3] = scale;
    aExtra[o] = warmth; aExtra[o + 1] = brightness; aExtra[o + 2] = hue; aExtra[o + 3] = 0;
    aForm[o + 3] = NEVER;
    dirty(i);
  }

  function spec(o = {}, defaults = {}) {
    const d = { speed: [1.6, 3], scale: [1.8, 2.6], warmth: [-1, 1], brightness: [0.8, 1.1], hue: 0, life: 1e5, ...defaults };
    return {
      speed: val(o.speed, d.speed),
      scale: val(o.scale, d.scale),
      warmth: clamp(val(o.warmth, d.warmth), -1, 1),
      brightness: val(o.brightness, d.brightness),
      hue: o.hue === 'rose' || o.hue === 1 ? 1 : 0,
      life: val(o.life, d.life),
    };
  }

  /**
   * Schedule `count` births between `start` and `start + spread` seconds from now.
   * `from` is { x:[a,b], y:[a,b], z:[a,b] } or a function (k, birth) → [x,y,z] | {x,y,z, ...overrides}.
   * `curve` < 1 makes births accelerate (more of them late), > 1 front-loads them.
   * Negative `start` places lanterns that were "born in the past" (already risen) — handy for a full sky.
   */
  function wave({ count = 100, from, start = 0, spread = 8, curve = 1, keep = false, ...o } = {}) {
    const slots = allocMany(Math.max(0, Math.round(count)));
    const fn = typeof from === 'function' ? from : null;
    const fr = from || {};
    slots.forEach((i, k) => {
      const birth = time + start + spread * Math.pow(Math.random(), curve);
      let p = fn ? fn(k, birth, i) : [val(fr.x, [-300, 300]), val(fr.y, [0, 20]), val(fr.z, [-900, -150])];
      if (!p) p = [0, -9999, 0];
      const pos = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
      const s = spec({ ...o, ...(Array.isArray(p) ? {} : p) });
      write(i, { x: pos.x, y: pos.y, z: pos.z, birth, ...s });
      pinned[i] = keep ? 1 : 0;
    });
    return slots;
  }

  /** One lantern now (or after `delay` s) at `pos`. Returns its slot index. */
  function release(pos, { delay = 0, keep = false, lit = false, ...o } = {}) {
    const [i] = allocMany(1);
    if (i == null) return -1;
    const p = v3(pos);
    const s = spec(o, { speed: 1.6, scale: 2.1, warmth: [-0.4, 0.6], brightness: 1.05 });
    write(i, { x: p.x, y: p.y, z: p.z, birth: time + delay - (lit ? LIT_AGE : 0), ...s });
    if (lit) {
      // already burning: rebase so it sits exactly at `pos` now
      aStart[i * 4 + 1] -= s.speed * riseOf(LIT_AGE);
    }
    pinned[i] = keep ? 1 : 0;
    return i;
  }

  /** Re-start a lantern's free flight from where it is now (keeps it lit, no pop). */
  function rebase(i, speed) {
    const p = positionOf(i, new THREE.Vector3());
    if (!p) return;
    const o = i * 4;
    const sp = speed != null ? speed : aParams[o];
    const s = aParams[o + 3] * motion;
    const seed = aParams[o + 1];
    const A = LIT_AGE;
    aStart[o] = p.x - (swayX(A, seed) - swayX(0, seed)) * s - W.x * A;
    aStart[o + 1] = p.y - sp * riseOf(A);
    aStart[o + 2] = p.z - (swayZ(A, seed) - swayZ(0, seed)) * s - W.z * A;
    aParams[o] = sp;
    aParams[o + 2] = time - A;
    aForm[o + 3] = NEVER;
    dirty(i);
  }

  /* ---------------- shapes ---------------- */
  const waiters = [];
  const formed = new Set();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();

  /**
   * Smoothly steer lanterns onto `points` (e.g. a heart). Picks the alive lanterns
   * nearest the shape (spawning new ones that ignite in place if there aren't enough).
   * Resolves (after `duration`) with the slot indices in the order of `points`;
   * the same array is available immediately as `promise.indices`.
   */
  function formShape(points, { duration = 6, stagger = 0.35, indices = null, spawn = true } = {}) {
    const P = points.map(v3);
    const n = P.length;
    const c = P.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, n));
    let chosen = [];
    if (indices) chosen = indices.filter((i) => isAlive(i)).slice(0, n);
    else {
      const cand = [];
      const p = new THREE.Vector3();
      for (let i = 0; i < N; i++) {
        if (pinned[i] || formed.has(i) || aExtra[i * 4 + 2] > 0.5) continue;
        if (!(ageOf(i) > LIT_AGE) || !positionOf(i, p)) continue;
        cand.push([p.distanceTo(c) * (onScreen(i) ? 1 : 3), i]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      chosen = cand.slice(0, n).map((x) => x[1]);
    }
    if (chosen.length < n && spawn) {
      const extra = allocMany(n - chosen.length);
      extra.forEach((i, k) => {
        const t = P[(chosen.length + k) % n];
        write(i, { x: t.x + rnd(-12, 12), y: t.y - rnd(20, 60), z: t.z + rnd(-12, 12), birth: time + Math.random() * stagger * duration * 0.5, ...spec({}) });
        pinned[i] = 0;
      });
      chosen = chosen.concat(extra);
    }
    // pair lanterns with targets by angle around the centre (as seen by the camera) → no criss-crossing
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const ang = (p) => Math.atan2(tv.copy(p).sub(c).dot(camUp), tv.copy(p).sub(c).dot(camRight));
    const cur = chosen.map((i) => {
      const p = positionOf(i, new THREE.Vector3(), Math.max(time, aParams[i * 4 + 2])) || new THREE.Vector3(aStart[i * 4], aStart[i * 4 + 1], aStart[i * 4 + 2]);
      return { i, a: ang(p) };
    }).sort((a, b) => a.a - b.a);
    const tgt = P.map((p, k) => ({ k, a: ang(p) })).sort((a, b) => a.a - b.a);
    const order = new Array(n).fill(-1);
    const m = Math.min(cur.length, tgt.length);
    for (let j = 0; j < m; j++) {
      const i = cur[j].i;
      const t = P[tgt[j].k];
      const o = i * 4;
      aForm[o] = t.x; aForm[o + 1] = t.y; aForm[o + 2] = t.z;
      aForm[o + 3] = Math.max(time, aParams[o + 2]) + Math.random() * stagger * duration;
      aExtra[o + 3] = duration * (1 - stagger);
      formed.add(i);
      order[tgt[j].k] = i;
      dirty(i);
    }
    const result = order.filter((i) => i >= 0);
    const promise = new Promise((res) => waiters.push({ t: time + duration, res, value: result }));
    promise.indices = result;
    return promise;
  }

  /** Let shaped lanterns go again (they keep their light and drift up). */
  function releaseShape({ indices = null, speed = [1.1, 2.2] } = {}) {
    const list = indices || [...formed];
    for (const i of list) {
      rebase(i, val(speed));
      formed.delete(i);
    }
  }

  /* ---------------- per frame ---------------- */
  function update(t, dt) {
    time = t;
    U.uTime.value = t;
    readRect();
    for (let k = waiters.length - 1; k >= 0; k--) {
      if (t >= waiters[k].t) { waiters[k].res(waiters[k].value); waiters.splice(k, 1); }
    }
    if (dmax >= dmin) {
      for (const a of attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(dmin * 4, (dmax - dmin + 1) * 4);
        a.needsUpdate = true;
      }
      dmin = Infinity;
      dmax = -1;
    }
    return dt;
  }

  /** Alive lanterns currently on screen (optionally filtered by distance range). */
  function visible({ near = 0, far = Infinity, margin = 0.95, rose = false } = {}) {
    const out = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      if (!isAlive(i) || (!rose && aExtra[i * 4 + 2] > 0.5) || ageOf(i) < LIT_AGE) continue;
      if (!positionOf(i, p)) continue;
      const d = p.distanceTo(camera.position);
      if (d < near || d > far) continue;
      p.project(camera);
      if (p.z < 1 && Math.abs(p.x) <= margin && Math.abs(p.y) <= margin) out.push(i);
    }
    return out;
  }

  /** The on-screen lantern nearest to a screen point (CSS px), within `maxPx`. */
  function nearest(x, y, { maxPx = 40, filter = null } = {}) {
    let best = -1;
    let bd = Infinity;
    const s = {};
    for (let i = 0; i < N; i++) {
      if (filter && !filter(i)) continue;
      if (!screenOf(i, s) || !s.visible) continue;
      const d = Math.hypot(s.x - x, s.y - y) - s.r;
      if (d < maxPx && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    object.parent && object.parent.remove(object);
    base.dispose();
    geo.dispose();
    pgeo.dispose();
    bodyMat.dispose();
    glowMat.dispose();
    mirrorMat && mirrorMat.dispose();
    waiters.splice(0).forEach((w) => w.res(w.value));
  }

  return {
    object,
    capacity: N,
    uniforms: U,
    get time() { return time; },
    wave,
    release,
    formShape,
    releaseShape,
    update,
    dispose,
    positionOf,
    screenOf,
    isAlive,
    ageOf,
    visible,
    nearest,
    pin(i, on = true) { if (i >= 0 && i < N) pinned[i] = on ? 1 : 0; },
    /** Restart lantern `i`'s free flight from where it is now at a new rising speed (stays lit; no pop). */
    rebase(i, speed) { if (i >= 0 && i < N && isAlive(i)) rebase(i, speed); },
    /** Let lantern `i` burn out gently over ~4 s (and free its slot). */
    extinguish(i) {
      if (!(i >= 0 && i < N)) return;
      const age = ageOf(i);
      if (age < 0) aParams[i * 4 + 2] = NEVER;
      else aStart[i * 4 + 3] = Math.min(aStart[i * 4 + 3], age + 4);
      pinned[i] = 0;
      dirty(i);
    },
    birthOf(i) { return aParams[i * 4 + 2]; },
    /** Overall glow / body brightness (e.g. dim the sky while a photo is in focus). */
    setIntensity(v) { U.uIntensity.value = v; },
    setExposure(v) { U.uExposure.value = v; },
    setHaze({ near, far, color } = {}) {
      if (near != null) U.uHaze.value.x = near;
      if (far != null) U.uHaze.value.y = far;
      if (color) U.uHazeColor.value.copy(rgb(color));
    },
  };
}

/* =========================================================== soft glow quad */

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const QUAD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uOpacity;
  uniform float uFall;
  varying vec2 vUv;
  void main() {
    vec2 q = vUv - 0.5;
    float d = dot(q, q) * 4.0;
    float a = exp(-d * uFall) * (1.0 - smoothstep(0.7, 1.0, d));
    vec3 col = mix(uColor, uCore, exp(-d * uFall * 4.0));
    a *= uOpacity;
    gl_FragColor = vec4(col * a, a);
  }
`;
function glowQuad(w, h, { color = '#ff9a45', core = '#ffe6b8', opacity = 0.5, fall = 3.2 } = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: rgb(color) }, uCore: { value: rgb(core) }, uOpacity: { value: opacity }, uFall: { value: fall } },
    vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
  return new THREE.Mesh(g, m);
}

/* ============================================================ photo lantern */

const FRAME_VERT = /* glsl */ `
  uniform vec2 uPlane;
  varying vec2 vP;
  void main() {
    vP = (uv - 0.5) * uPlane;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SD_BOX = /* glsl */ `
  float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;
const FRAME_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uCrop;
  uniform float uReady;
  uniform float uOpacity;
  uniform float uClarity;
  uniform float uTime;
  uniform vec2 uHalf;
  uniform float uMargin;
  uniform float uSeed;
  varying vec2 vP;
  ${SD_BOX}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float ri = min(uHalf.x, uHalf.y) * 0.03;
    float dIn = sdBox(vP, uHalf, ri);
    float dOut = sdBox(vP, uHalf + uMargin, ri + uMargin * 0.7);
    float aa = max(fwidth(dIn), 1e-4) * 1.2;
    if (dOut > aa) discard;
    float flick = 0.95 + 0.035 * sin(uTime * 2.3 + uSeed * 9.0) + 0.015 * sin(uTime * 7.1 + uSeed * 3.0);
    float rest = 1.0 - uClarity;

    // the photograph (never distorted: the crop window keeps its aspect)
    vec2 uv = clamp((vP + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    vec3 photo = texture2D(uMap, uCrop.xy + uv * uCrop.zw).rgb;
    photo = mix(vec3(0.2, 0.12, 0.22), photo, uReady);
    float edge = exp(-max(-dIn, 0.0) / (uMargin * 0.85));
    float below = pow(1.0 - uv.y, 2.0);
    vec3 pc = photo * mix(0.8, 1.0, uClarity);
    pc *= mix(vec3(1.0), vec3(1.05, 0.97, 0.86), rest * 0.55);          // a breath of warm glass
    pc += vec3(1.0, 0.68, 0.34) * (edge * mix(0.2, 0.06, uClarity) + below * 0.06 * rest) * flick; // light from the frame

    // glowing paper border, lit from inside (brightest along the photo and at the bottom)
    float t = clamp(dIn / uMargin, 0.0, 1.0);
    float yb = clamp((vP.y + uHalf.y + uMargin) / (2.0 * (uHalf.y + uMargin)), 0.0, 1.0);
    vec2 fp = vP / uMargin;
    float fib = hash(floor(fp * 26.0)) * 0.05 + hash(floor(vec2(fp.x * 5.0, fp.y * 70.0))) * 0.05;
    vec3 paper = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.66, 0.34), smoothstep(0.0, 1.0, t));
    paper *= (0.98 - 0.34 * t + 0.18 * (1.0 - yb)) * (0.97 - fib) * flick * 0.86;

    float inPhoto = 1.0 - smoothstep(-aa, aa, dIn);
    float inside = 1.0 - smoothstep(-aa, aa, dOut);
    vec3 col = mix(paper, pc, inPhoto);
    // a thin bright glass rim + a fine gold line around the photograph
    float rimOut = 1.0 - smoothstep(0.0, aa + uMargin * 0.05, abs(dOut + uMargin * 0.07));
    float rimIn = 1.0 - smoothstep(0.0, aa + uMargin * 0.035, abs(dIn - uMargin * 0.08));
    col += vec3(1.0, 0.93, 0.8) * rimOut * 0.32 + vec3(1.0, 0.82, 0.5) * rimIn * 0.26;
    gl_FragColor = vec4(col * inside * uOpacity, inside * uOpacity);
  }
`;
const RIM_FRAG = /* glsl */ `
  uniform vec2 uHalf;
  uniform float uMargin;
  uniform float uPad;
  uniform float uOpacity;
  uniform float uClarity;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vP;
  ${SD_BOX}
  void main() {
    float ri = min(uHalf.x, uHalf.y) * 0.03;
    float od = max(sdBox(vP, uHalf + uMargin, ri + uMargin * 0.7), 0.0);
    float og = exp(-od / (uMargin * 1.5)) * (1.0 - smoothstep(uPad * 0.5, uPad, od));
    float flick = 0.94 + 0.04 * sin(uTime * 2.3 + uSeed * 9.0) + 0.02 * sin(uTime * 7.1 + uSeed * 3.0);
    float a = og * 0.4 * flick * uOpacity * (1.0 - 0.4 * uClarity);
    gl_FragColor = vec4(vec3(1.0, 0.6, 0.28) * a, a);
  }
`;
const SHEEN_FRAG = /* glsl */ `
  uniform vec2 uHalf;
  uniform float uMargin;
  uniform float uShift;
  uniform float uOpacity;
  varying vec2 vP;
  ${SD_BOX}
  void main() {
    vec2 b = uHalf + uMargin;
    float inside = 1.0 - smoothstep(-0.01, 0.01, sdBox(vP, b, min(b.x, b.y) * 0.08));
    float s = (vP.x * 0.62 + vP.y * 0.78) / max(b.x, b.y) - uShift;
    float band = exp(-s * s * 26.0) * 0.07 + exp(-pow(s + 0.42, 2.0) * 140.0) * 0.035;
    float a = band * inside * uOpacity;
    gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a);
  }
`;

/**
 * A real photograph inside a softly glowing paper/glass lantern frame: warm light
 * around it (halo), a thin bright rim, an inner glow and a glass pane a little in
 * front whose sheen slides as the lantern turns. The photo's aspect is never
 * changed (a focal-point crop window is used only if the frame needs one).
 * Returns a THREE.Group with: setOpacity(a), setClarity(0..1), update(time, camera), dispose(),
 * plus .ready (Promise), .photo, .size {w, h, outerW, outerH, radius}, .hiRes() (swap in the full image).
 * The group faces the camera in update() unless { billboard:false }.
 */
export function createPhotoLantern(photo, { size = 4.4, device = {}, src, billboard = true, glow = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'photo-lantern';
  const motion = device.reducedMotion ? 0.3 : 1;
  const ratio = clamp(Number(photo && photo.ratio) || 1, 0.5, 2);
  const w = size * Math.sqrt(ratio);
  const h = size / Math.sqrt(ratio);
  const m = size * 0.062;
  const pad = size * 0.4;
  const OW = w + 2 * m;
  const OH = h + 2 * m;
  const seed = Math.random() * 10;

  const blank = new THREE.DataTexture(new Uint8Array([40, 24, 48, 255]), 1, 1);
  blank.needsUpdate = true;
  const U = {
    uMap: { value: blank },
    uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    uReady: { value: 0 },
    uOpacity: { value: 0 },
    uClarity: { value: 0 },
    uTime: { value: 0 },
    uHalf: { value: new THREE.Vector2(w / 2, h / 2) },
    uMargin: { value: m },
    uPad: { value: pad },
    uSeed: { value: seed },
    uShift: { value: 0 },
  };
  const mat = (frag, plane, opts) => new THREE.ShaderMaterial({
    uniforms: { ...U, uPlane: { value: new THREE.Vector2(plane[0], plane[1]) } },
    vertexShader: FRAME_VERT, fragmentShader: frag,
    transparent: true, premultipliedAlpha: true, ...opts,
  });
  const additive = { depthWrite: false, blending: THREE.AdditiveBlending };

  const halo = glowQuad(OW * 2.7, OH * 2.7, { color: '#ff9440', core: '#ffd9a0', opacity: 0.34 * glow, fall: 2.6 });
  halo.position.z = -0.25;
  halo.renderOrder = 3;
  const rimGlow = new THREE.Mesh(new THREE.PlaneGeometry(OW + 2 * pad, OH + 2 * pad), mat(RIM_FRAG, [OW + 2 * pad, OH + 2 * pad], additive));
  rimGlow.position.z = -0.02;
  rimGlow.renderOrder = 3;
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(OW, OH), mat(FRAME_FRAG, [OW, OH], { depthWrite: true, blending: THREE.NormalBlending }));
  frame.renderOrder = 4;
  // a pane of glass a little in front: its sheen slides over the photo as the lantern turns (parallax)
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(OW, OH), mat(SHEEN_FRAG, [OW, OH], additive));
  sheen.position.z = size * 0.07;
  sheen.renderOrder = 5;
  // the little flame that lights it, just below the frame
  const flame = glowQuad(size * 0.5, size * 0.62, { color: '#ff8a30', core: '#fff1cf', opacity: 0.8, fall: 5.5 });
  flame.position.set(0, -OH / 2 - size * 0.05, 0.05);
  flame.renderOrder = 5;
  group.add(halo, rimGlow, frame, sheen, flame);

  let tex = null;
  let hiTex = null;
  const focal = (photo && photo.focal) || { x: 0.5, y: 0.4 };
  const applyCrop = (iw, ih) => {
    const fa = w / h;
    const ia = iw / ih;
    if (!(ia > 0)) return;
    if (Math.abs(ia - fa) / fa < 0.01) U.uCrop.value.set(0, 0, 1, 1);
    else if (ia > fa) {
      const sx = fa / ia;
      U.uCrop.value.set(clamp(focal.x - sx / 2, 0, 1 - sx), 0, sx, 1);
    } else {
      const sy = ia / fa;
      U.uCrop.value.set(0, clamp(1 - focal.y - sy / 2, 0, 1 - sy), 1, sy);
    }
  };
  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((resolve) => {
    if (!url) return resolve(null);
    loader.load(url, (t) => {
      t.colorSpace = THREE.NoColorSpace; // keep her photo's pixels exactly as they are
      t.anisotropy = 4;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  let disposed = false;
  let loaded = false;
  group.failed = false;
  group.ready = load(src || (photo && (photo.thumbUrl || photo.url))).then((t) => {
    if (!t) { group.failed = true; return group; }
    if (disposed) { t.dispose(); return group; }
    tex = t;
    applyCrop(t.image.width, t.image.height);
    U.uMap.value = t;
    loaded = true;
    return group;
  });
  /** Swap in the full-resolution image (for a close-up). */
  group.hiRes = () => {
    if (hiTex) return hiTex;
    if (!photo || !photo.url || photo.url === photo.thumbUrl || src) return Promise.resolve(group);
    hiTex = load(photo.url).then((t) => {
      if (!t) return group;
      if (disposed) { t.dispose(); return group; }
      applyCrop(t.image.width, t.image.height);
      U.uMap.value = t;
      if (tex) tex.dispose();
      tex = t;
      loaded = true;
      U.uReady.value = 1;
      return group;
    });
    return hiTex;
  };

  group.photo = photo;
  /** True once the photograph's pixels are on the GPU (fade in only after this). */
  group.isReady = () => loaded;
  group.size = { w, h, outerW: OW, outerH: OH, radius: 0.5 * Math.hypot(OW, OH) };
  let opacity = 0;
  group.setOpacity = (a) => {
    opacity = clamp(a, 0, 1);
    U.uOpacity.value = opacity;
    group.visible = opacity > 0.001;
  };
  group.setClarity = (c) => { U.uClarity.value = clamp(c, 0, 1); };
  group.getOpacity = () => opacity;
  group.setOpacity(0);

  let lastT = null;
  group.update = (time, camera) => {
    const dt = lastT == null ? 0 : clamp(time - lastT, 0, 0.1);
    lastT = time;
    U.uTime.value = time;
    if (loaded && U.uReady.value < 1) U.uReady.value = Math.min(1, U.uReady.value + dt / 0.8);
    const still = 1 - 0.85 * U.uClarity.value; // a memory held close stops swaying
    const yaw = Math.sin(time * 0.41 + seed) * 0.07 * motion * still;
    const roll = Math.sin(time * 0.57 + seed * 2.3) * 0.035 * motion * still;
    if (billboard && camera) {
      group.quaternion.copy(camera.quaternion);
      group.rotateY(yaw);
      group.rotateZ(roll);
    }
    U.uShift.value = Math.sin(time * 0.13 + seed) * 0.35 + yaw * 3.0;
    const f = 0.92 + 0.06 * Math.sin(time * 2.1 + seed * 5) + 0.03 * Math.sin(time * 6.3 + seed);
    const clar = U.uClarity.value;
    halo.material.uniforms.uOpacity.value = opacity * 0.34 * glow * f * (1 - clar * 0.5);
    flame.material.uniforms.uOpacity.value = opacity * 0.8 * f;
    flame.scale.set(1 + 0.04 * Math.sin(time * 9 + seed), 1 + 0.08 * Math.sin(time * 7.3 + seed * 2), 1);
  };

  group.dispose = () => {
    if (disposed) return;
    disposed = true;
    group.parent && group.parent.remove(group);
    for (const mesh of [halo, rimGlow, frame, sheen, flame]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    blank.dispose();
    if (tex) tex.dispose();
    tex = null;
  };
  return group;
}

/* ================================================================ ribbon 3D */

const RIB_VERT = /* glsl */ `
  attribute vec3 aTan;
  attribute float aSide;
  attribute float aT;
  attribute float aStrand;
  attribute float aEnv;
  uniform float uTime;
  uniform float uWidth;
  uniform float uViewScale;
  uniform float uMinPx;
  uniform float uMotion;
  varying float vSide;
  varying float vT;
  varying float vStrand;
  varying float vFade;
  void main() {
    vec3 P = position;
    vec3 T = normalize(aTan + vec3(1e-5, 0.0, 0.0));
    vec3 up = abs(T.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 n1 = normalize(cross(T, up));
    vec3 n2 = normalize(cross(T, n1));
    float ph = aStrand * 2.094;
    // silk: the side strands part between the anchors and gather at each lantern
    float amp = (aStrand > 0.5 ? 1.0 : 0.3) * uWidth * 1.1 * aEnv * uMotion;
    P += n1 * sin(aT * 23.0 + uTime * 0.9 + ph) * amp + n2 * cos(aT * 17.0 - uTime * 0.7 + ph * 1.3) * amp * 0.8;
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vec3 tv = (modelViewMatrix * vec4(T, 0.0)).xyz;
    vec3 side = cross(tv, normalize(-mv.xyz));
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
    float w = uWidth * (aStrand > 0.5 ? 0.6 : 1.0);
    float px = w * uViewScale / max(-mv.z, 0.05);
    float grow = max(1.0, uMinPx / max(px, 1e-4));
    vFade = 1.0 / grow;
    mv.xyz += side * aSide * w * grow * 0.5;
    vSide = aSide;
    vT = aT;
    vStrand = aStrand;
    gl_Position = projectionMatrix * mv;
  }
`;
const RIB_FRAG = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDrawing;
  uniform vec3 uColor;
  varying float vSide;
  varying float vT;
  varying float vStrand;
  varying float vFade;
  void main() {
    float d = vSide;
    float core = exp(-d * d * 20.0);
    float soft = exp(-d * d * 3.2);
    float b = vStrand > 0.5 ? 0.42 : 1.0;
    float vis = 1.0 - smoothstep(uProgress - 0.008, uProgress, vT);
    float ends = smoothstep(0.0, 0.02, vT) * (1.0 - smoothstep(0.98, 1.0, vT));
    float flow = 0.74 + 0.26 * sin(vT * 64.0 - uTime * 2.2 + vStrand * 2.0);
    float head = exp(-pow((vT - uProgress) / 0.016, 2.0)) * uDrawing;
    vec3 col = mix(uColor, vec3(1.0, 0.95, 0.82), core * 0.42 + head * 0.35);
    float a = (core * 0.7 + soft * 0.2) * b * flow * vFade + head * core * 1.1;
    a *= vis * ends * uOpacity;
    gl_FragColor = vec4(col * a, a);
  }
`;
const DUST_VERT = /* glsl */ `
  attribute float aLife;
  uniform float uViewScale;
  uniform float uSize;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = sin(clamp(aLife, 0.0, 1.0) * 3.14159);
    gl_PointSize = clamp(uSize * uViewScale / max(-mv.z, 0.05), 0.0, 24.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    float a = exp(-d * 6.0) * vA * uOpacity * 0.8;
    gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.9), exp(-d * 20.0)) * a, a);
  }
`;

/**
 * A soft golden ribbon of light through 3D points (camera-facing silk strands along
 * a centripetal Catmull-Rom curve). Returns a THREE.Group with:
 * setPoints(points), setProgress(0..1), setOpacity(a), update(time), dispose(), head(out), progress.
 */
export function createRibbon3D({ points = [], color = '#ffd98a', width = 0.6, strands = 3, segments, opacity = 1, minPixels = 1.6, dust = true, device = {} } = {}) {
  const group = new THREE.Group();
  group.name = 'ribbon-3d';
  const S = Math.max(1, Math.min(5, device.tier === 'low' ? Math.min(strands, 2) : strands));
  const nPts = Math.max(2, points.length);
  const M = Math.round(segments || clamp(nPts * 26, 40, 180));
  const V = S * M * 2;
  const pos = new Float32Array(V * 3);
  const tan = new Float32Array(V * 3);
  const env = new Float32Array(V);
  const side = new Float32Array(V);
  const tt = new Float32Array(V);
  const strand = new Float32Array(V);
  const index = [];
  for (let s = 0; s < S; s++) {
    for (let j = 0; j < M; j++) {
      const v = (s * M + j) * 2;
      side[v] = -1; side[v + 1] = 1;
      tt[v] = tt[v + 1] = j / (M - 1);
      strand[v] = strand[v + 1] = s;
      if (j < M - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const tanAttr = new THREE.BufferAttribute(tan, 3).setUsage(THREE.DynamicDrawUsage);
  const envAttr = new THREE.BufferAttribute(env, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aTan', tanAttr);
  geo.setAttribute('aEnv', envAttr);
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  geo.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1));
  geo.setIndex(index);
  const U = {
    uTime: { value: 0 },
    uWidth: { value: width },
    uViewScale: { value: 600 },
    uMinPx: { value: minPixels },
    uMotion: { value: device.reducedMotion ? 0.4 : 1 },
    uProgress: { value: 0 },
    uOpacity: { value: opacity },
    uDrawing: { value: 0 },
    uColor: { value: rgb(color) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: RIB_VERT, fragmentShader: RIB_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  const size2 = new THREE.Vector2();
  const syncView = (r, s, cam) => {
    r.getDrawingBufferSize(size2);
    U.uViewScale.value = size2.y * 0.5 * cam.projectionMatrix.elements[5];
  };
  mesh.onBeforeRender = syncView;
  group.add(mesh);

  // shed golden dust from the head while it draws
  const D = dust ? (device.tier === 'low' ? 18 : 36) : 0;
  let dustPts = null;
  const dp = new Float32Array(Math.max(1, D) * 3);
  const dl = new Float32Array(Math.max(1, D)).fill(2);
  const dv = new Float32Array(Math.max(1, D) * 3);
  const dmax = new Float32Array(Math.max(1, D)).fill(1);
  if (D) {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aLife', new THREE.BufferAttribute(dl, 1).setUsage(THREE.DynamicDrawUsage));
    const dm = new THREE.ShaderMaterial({
      uniforms: { uViewScale: U.uViewScale, uSize: { value: width * 0.55 }, uColor: U.uColor, uOpacity: U.uOpacity },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    });
    dustPts = new THREE.Points(dg, dm);
    dustPts.frustumCulled = false;
    dustPts.renderOrder = 7;
    dustPts.onBeforeRender = syncView;
    group.add(dustPts);
  }

  const curve = new THREE.CatmullRomCurve3(points.map(v3), false, 'centripetal', 0.5);
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  let nAnchors = nPts;
  let hasCurve = false;

  function setPoints(pts) {
    if (!pts || pts.length < 2) return;
    if (curve.points.length !== pts.length) curve.points = pts.map(v3);
    else pts.forEach((p, k) => (p.isVector3 ? curve.points[k].copy(p) : curve.points[k].copy(v3(p))));
    nAnchors = pts.length;
    curve.needsUpdate = true;
    curve.updateArcLengths();
    for (let j = 0; j < M; j++) {
      const u = j / (M - 1);
      const t = curve.getUtoTmapping(u);
      curve.getPoint(t, P);
      curve.getTangent(t, T);
      const segPos = t * (nAnchors - 1);
      const local = segPos - Math.floor(segPos);
      const e = j === 0 || j === M - 1 ? 0 : Math.sin(Math.PI * local);
      for (let s = 0; s < S; s++) {
        const v = (s * M + j) * 2;
        for (let k = 0; k < 2; k++) {
          pos[(v + k) * 3] = P.x; pos[(v + k) * 3 + 1] = P.y; pos[(v + k) * 3 + 2] = P.z;
          tan[(v + k) * 3] = T.x; tan[(v + k) * 3 + 1] = T.y; tan[(v + k) * 3 + 2] = T.z;
          env[v + k] = e;
        }
      }
    }
    posAttr.needsUpdate = tanAttr.needsUpdate = envAttr.needsUpdate = true;
    hasCurve = true;
  }
  setPoints(points);

  let progress = 0;
  let lastP = 0;
  let lastT = -1;
  let spawnAcc = 0;
  const head = (out = new THREE.Vector3()) => (hasCurve ? curve.getPointAt(clamp(progress, 0, 1), out) : out.set(0, 0, 0));

  group.setPoints = setPoints;
  group.setProgress = (p) => { progress = clamp(p, 0, 1); U.uProgress.value = progress * 1.01; };
  group.setOpacity = (a) => { U.uOpacity.value = clamp(a, 0, 1); group.visible = a > 0.001; };
  group.setWidth = (wd) => { U.uWidth.value = wd; };
  group.head = head;
  Object.defineProperty(group, 'progress', { get: () => progress });

  group.update = (time) => {
    const dt = lastT < 0 ? 0 : clamp(time - lastT, 0, 0.1);
    lastT = time;
    U.uTime.value = time;
    const drawing = progress > 0.001 && progress < 0.999 && progress !== lastP;
    U.uDrawing.value += ((drawing ? 1 : 0) - U.uDrawing.value) * Math.min(1, dt * 4);
    lastP = progress;
    if (!dustPts) return;
    spawnAcc += dt * (drawing ? 16 : 0);
    const hp = drawing ? head(new THREE.Vector3()) : null;
    for (let i = 0; i < D; i++) {
      if (dl[i] < 1) {
        dl[i] += dt / dmax[i];
        dv[i * 3 + 1] -= dt * width * 0.6;
        for (let k = 0; k < 3; k++) {
          dv[i * 3 + k] *= 1 - dt * 0.9;
          dp[i * 3 + k] += dv[i * 3 + k] * dt;
        }
      } else if (spawnAcc >= 1 && hp) {
        spawnAcc -= 1;
        dl[i] = 0;
        dmax[i] = rnd(0.9, 1.8);
        dp[i * 3] = hp.x; dp[i * 3 + 1] = hp.y; dp[i * 3 + 2] = hp.z;
        dv[i * 3] = rnd(-1, 1) * width * 1.4;
        dv[i * 3 + 1] = rnd(-1.2, 0.6) * width * 1.4;
        dv[i * 3 + 2] = rnd(-1, 1) * width * 1.4;
      }
    }
    spawnAcc = Math.min(spawnAcc, 2);
    dustPts.geometry.attributes.position.needsUpdate = true;
    dustPts.geometry.attributes.aLife.needsUpdate = true;
  };

  let disposed = false;
  group.dispose = () => {
    if (disposed) return;
    disposed = true;
    group.parent && group.parent.remove(group);
    geo.dispose();
    mat.dispose();
    if (dustPts) { dustPts.geometry.dispose(); dustPts.material.dispose(); }
  };
  return group;
}
