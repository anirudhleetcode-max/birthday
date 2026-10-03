// Her photographs as softly lit prints floating in 3D (one instanced draw for all
// of them, from a texture atlas), their warm halos, the star-points they turn into,
// and the golden motes that flow between them. No post-processing; her photo
// pixels are shown exactly as they are (atlas kept in NoColorSpace, raw shaders).
import * as THREE from 'three';

const SD_BOX = /* glsl */ `
  float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

const CARD_VERT = /* glsl */ `
  attribute vec4 aRect;    // atlas uv rect (u0, v0, du, dv)
  attribute vec4 aShape;   // photo w, h, border margin, seed
  attribute vec4 aState;   // opacity, lit, light (0 print … 1 pure light), ready
  uniform float uPad;      // extra size around the print (halo), as a fraction of its short side
  uniform float uZ;
  varying vec2 vP;
  varying vec4 vShape;
  varying vec4 vState;
  varying vec4 vRect;
  varying float vShade;
  varying float vPad;
  void main() {
    vec2 full = aShape.xy + 2.0 * aShape.z;
    float pad = uPad * min(full.x, full.y);
    vP = position.xy * (full + 2.0 * pad);
    vPad = pad;
    vShape = aShape;
    vState = aState;
    vRect = aRect;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(vP, uZ, 1.0);
    vec3 n = normalize((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vShade = dot(n, normalize(vec3(-0.45, 0.6, 0.66)));
    gl_Position = projectionMatrix * mv;
  }
`;

const CARD_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vP;
  varying vec4 vShape;
  varying vec4 vState;
  varying vec4 vRect;
  varying float vShade;
  ${SD_BOX}
  void main() {
    vec2 hb = vShape.xy * 0.5;
    float m = vShape.z;
    float rIn = min(hb.x, hb.y) * 0.03;
    float dIn = sdBox(vP, hb, rIn);
    float dOut = sdBox(vP, hb + m, rIn + m * 0.6);
    float aa = max(fwidth(dOut), 1e-5) * 1.1;
    float inside = 1.0 - smoothstep(-aa, aa, dOut);
    float light = vState.z;
    float op = vState.x * (1.0 - smoothstep(0.55, 0.95, light));
    if (inside * op < 0.002) discard;

    // the photograph, exactly as it is (only light around it)
    vec2 uv = clamp((vP + hb) / (2.0 * hb), 0.0, 1.0);
    vec3 photo = texture2D(uAtlas, vRect.xy + uv * vRect.zw).rgb;
    photo = mix(vec3(0.13, 0.09, 0.2), photo, vState.w);
    float inPhoto = 1.0 - smoothstep(-aa, aa, dIn);

    // a thin cream border, lit softly as the print turns
    float shade = 0.86 + 0.14 * clamp(vShade, 0.0, 1.0);
    vec3 paper = vec3(0.97, 0.92, 0.83) * shade * (1.0 - 0.07 * smoothstep(0.0, m, dIn));
    vec3 col = mix(paper, photo, inPhoto);
    // a hairline where the photograph meets its border
    col *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, aa * 1.5 + m * 0.1, abs(dIn)));

    // a faint sheen sliding across as it rotates (glass-like, very subtle)
    float s = (vP.x * 0.62 + vP.y * 0.78) / max(hb.x, hb.y) - (vShade * 2.2 - 0.6);
    col += vec3(1.0, 0.95, 0.86) * exp(-s * s * 10.0) * 0.04;

    // warm light when the golden thread touches it (stronger on the border than the photo)
    col += vec3(1.0, 0.72, 0.38) * vState.y * mix(0.16, 0.05, inPhoto);

    // turning into light: the print warms, brightens and condenses into a star
    col = mix(col, vec3(1.0, 0.9, 0.7), smoothstep(0.0, 0.75, light) * 0.9);
    float a = inside * op;
    gl_FragColor = vec4(col * a, a);
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vP;
  varying vec4 vShape;
  varying vec4 vState;
  varying float vPad;
  ${SD_BOX}
  void main() {
    vec2 hb = vShape.xy * 0.5 + vShape.z;
    float od = max(sdBox(vP, hb, min(hb.x, hb.y) * 0.06), 0.0);
    float fall = vPad * 0.3;
    float g = exp(-od / fall) * (1.0 - smoothstep(vPad * 0.5, vPad, od));
    float a = g * vState.x * (0.12 + 0.42 * vState.y) * (1.0 - smoothstep(0.15, 0.8, vState.z)) * uIntensity;
    vec3 col = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.86, 0.62), exp(-od / (fall * 0.45)));
    gl_FragColor = vec4(col * a, a);
  }
`;

// star-points: a warm core, a soft halo and two hair-thin rays
const STAR_VERT = /* glsl */ `
  attribute vec4 aStar;    // size (css px), alpha, seed, twinkle
  uniform float uTime;
  uniform float uPr;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.8 + 0.2 * sin(uTime * (1.1 + aStar.z * 1.7) + aStar.z * 40.0);
    vA = aStar.y * mix(1.0, tw, aStar.w);
    gl_PointSize = aStar.x * uPr;
    gl_Position = projectionMatrix * mv;
    if (aStar.y < 0.002) gl_PointSize = 0.0;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float core = exp(-d * d * 60.0);
    float halo = exp(-d * d * 7.0) * 0.3;
    float rays = (exp(-abs(q.x) * 140.0) * exp(-abs(q.y) * 7.0) + exp(-abs(q.y) * 140.0) * exp(-abs(q.x) * 7.0)) * 0.5;
    float a = (core + halo + rays * 0.55) * vA * (1.0 - smoothstep(0.8, 1.0, d));
    vec3 col = mix(vec3(1.0, 0.7, 0.36), vec3(1.0, 0.97, 0.88), clamp(core * 1.4, 0.0, 1.0));
    gl_FragColor = vec4(col * a, a);
  }
`;

// the golden motes that flow between photographs
const MOTE_VERT = /* glsl */ `
  attribute float aA;
  attribute float aS;
  uniform float uPr;
  varying float vA;
  void main() {
    vA = aA;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aA > 0.002 ? aS * uPr : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    float a = (exp(-d * 9.0) * 0.8 + exp(-d * 2.5) * 0.2) * vA;
    gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.95, 0.8), exp(-d * 20.0)) * a, a);
  }
`;

/**
 * Draw every photo (thumbUrl) into one atlas canvas of square cells (`cell` px,
 * shrunk to fit `maxSize`). The photo keeps its aspect (its `ratio`); if the image
 * file differs, a focal-point crop window is used.
 * Resolves { texture, rects[], canvas } (rects[k] = { u0, v0, du, dv, ok }).
 */
export async function buildAtlas(photos, { cell = 320, maxSize = 4096, preload, timeout = 9 } = {}) {
  const n = Math.max(1, photos.length);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cs = Math.max(64, Math.floor(Math.min(cell, maxSize / cols, maxSize / rows)));
  const cw = cs;
  const chh = cs;
  const size = cols * cs;
  const H = rows * cs;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1d1230';
  g.fillRect(0, 0, size, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const timer = (s) => new Promise((r) => setTimeout(() => r(null), s * 1000));
  const imgs = await Promise.all(photos.map((p) => Promise.race([preload(p.thumbUrl || p.url), timer(timeout)]).catch(() => null)));
  const gut = Math.max(4, Math.round(Math.min(cw, chh) * 0.025));
  const rects = photos.map((p, k) => {
    const cx = (k % cols) * cw;
    const cy = Math.floor(k / cols) * chh;
    const r = Math.min(2, Math.max(0.5, Number(p.ratio) || 1));
    const aw = cw - 2 * gut;
    const ah = chh - 2 * gut;
    let w = aw;
    let h = aw / r;
    if (h > ah) { h = ah; w = ah * r; }
    const dx = cx + (cw - w) / 2;
    const dy = cy + (chh - h) / 2;
    const img = imgs[k];
    const ok = !!(img && img.naturalWidth);
    if (ok) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const ia = iw / ih;
      let sx = 0;
      let sy = 0;
      let sw = iw;
      let sh = ih;
      const f = p.focal || { x: 0.5, y: 0.4 };
      if (Math.abs(ia - r) / r > 0.01) {
        if (ia > r) { sw = ih * r; sx = Math.min(iw - sw, Math.max(0, f.x * iw - sw / 2)); }
        else { sh = iw / r; sy = Math.min(ih - sh, Math.max(0, f.y * ih - sh / 2)); }
      }
      try {
        // bleed the edges into the gutter so mip-maps never pull in a neighbour
        g.drawImage(img, sx, sy, sw, sh, dx - gut * 0.8, dy - gut * 0.8, w + gut * 1.6, h + gut * 1.6);
        g.drawImage(img, sx, sy, sw, sh, dx, dy, w, h);
      } catch { /* undecodable image — leave the soft placeholder */ }
    }
    const inset = 0.75; // half a texel and a little more
    return { u0: (dx + inset) / size, v0: 1 - (dy + h - inset) / H, du: (w - 2 * inset) / size, dv: (h - 2 * inset) / H, ok };
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return { texture, rects, canvas };
}

/**
 * The prints, their halos and their star-points. `write(items, camera)` each frame:
 * items[k] = { pos (Vector3, local to .group), quat, w, h, opacity, lit, light, rect, ready,
 *              star: { size (px), alpha, twinkle } }.
 */
export function createCards({ count, device = {}, motes = 0 }) {
  const N = Math.max(1, count);
  const group = new THREE.Group();
  group.name = 'constellation-cards';
  const pr = { value: 1 };

  const geo = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  const aRect = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aShape = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aState = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRect', aRect);
  geo.setAttribute('aShape', aShape);
  geo.setAttribute('aState', aState);

  const blank = new THREE.DataTexture(new Uint8Array([30, 18, 46, 255]), 1, 1);
  blank.needsUpdate = true;
  const cardU = { uAtlas: { value: blank }, uPad: { value: 0 }, uZ: { value: 0 } };
  const cardMat = new THREE.ShaderMaterial({
    uniforms: cardU, vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
  });
  const haloU = { uPad: { value: 0.85 }, uZ: { value: -0.03 }, uIntensity: { value: 1 } };
  const haloMat = new THREE.ShaderMaterial({
    uniforms: haloU, vertexShader: CARD_VERT, fragmentShader: HALO_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cards = new THREE.InstancedMesh(geo, cardMat, N);
  const halos = new THREE.InstancedMesh(geo, haloMat, N);
  halos.instanceMatrix = cards.instanceMatrix;
  cards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cards.frustumCulled = halos.frustumCulled = false;
  cards.renderOrder = 2;
  halos.renderOrder = 3;

  // star-points
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(N * 3);
  const sStar = new Float32Array(N * 4);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('aStar', new THREE.BufferAttribute(sStar, 4).setUsage(THREE.DynamicDrawUsage));
  const starU = { uTime: { value: 0 }, uPr: pr };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(sGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 5;

  // motes
  const M = Math.max(0, motes);
  let mGeo = null;
  let moteMat = null;
  let moteObj = null;
  const mPos = new Float32Array(Math.max(1, M) * 3);
  const mA = new Float32Array(Math.max(1, M));
  const mS = new Float32Array(Math.max(1, M));
  if (M) {
    mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
    mGeo.setAttribute('aA', new THREE.BufferAttribute(mA, 1).setUsage(THREE.DynamicDrawUsage));
    mGeo.setAttribute('aS', new THREE.BufferAttribute(mS, 1).setUsage(THREE.DynamicDrawUsage));
    moteMat = new THREE.ShaderMaterial({
      uniforms: { uPr: pr }, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    moteObj = new THREE.Points(mGeo, moteMat);
    moteObj.frustumCulled = false;
    moteObj.renderOrder = 4;
  }
  group.add(cards, halos, stars);
  if (moteObj) group.add(moteObj);

  const m4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const wp = new THREE.Vector3();
  const order = [];
  let atlas = null;

  function write(items, camera) {
    group.updateMatrixWorld();
    // back to front, so half-faded prints blend correctly over one another
    order.length = 0;
    for (let k = 0; k < items.length && k < N; k++) {
      const it = items[k];
      wp.copy(it.pos).applyMatrix4(group.matrixWorld);
      order.push([wp.distanceToSquared(camera.position), k]);
    }
    order.sort((a, b) => b[0] - a[0]);
    const R = aRect.array;
    const S = aShape.array;
    const T = aState.array;
    order.forEach(([, k], j) => {
      const it = items[k];
      m4.compose(it.pos, it.quat, one);
      cards.setMatrixAt(j, m4);
      const r = it.rect || { u0: 0, v0: 0, du: 0, dv: 0 };
      R[j * 4] = r.u0; R[j * 4 + 1] = r.v0; R[j * 4 + 2] = r.du; R[j * 4 + 3] = r.dv;
      S[j * 4] = it.w; S[j * 4 + 1] = it.h; S[j * 4 + 2] = Math.min(it.w, it.h) * 0.045; S[j * 4 + 3] = k;
      T[j * 4] = it.opacity; T[j * 4 + 1] = it.lit; T[j * 4 + 2] = it.light; T[j * 4 + 3] = it.ready;
    });
    for (let k = 0; k < items.length && k < N; k++) {
      const it = items[k];
      sPos[k * 3] = it.pos.x; sPos[k * 3 + 1] = it.pos.y; sPos[k * 3 + 2] = it.pos.z;
      const st = it.star || {};
      sStar[k * 4] = st.size || 0; sStar[k * 4 + 1] = st.alpha || 0; sStar[k * 4 + 2] = (k * 0.618) % 1; sStar[k * 4 + 3] = st.twinkle ?? 1;
    }
    const n = Math.min(items.length, N);
    cards.count = halos.count = n;
    sGeo.setDrawRange(0, n);
    cards.instanceMatrix.needsUpdate = true;
    aRect.needsUpdate = aShape.needsUpdate = aState.needsUpdate = true;
    sGeo.attributes.position.needsUpdate = sGeo.attributes.aStar.needsUpdate = true;
  }

  /** Motes: call with a filler fn(i, outPos) → { a, s } for each of the `motes` slots. */
  function writeMotes(fill) {
    if (!M) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < M; i++) {
      const r = fill(i, v);
      mPos[i * 3] = v.x; mPos[i * 3 + 1] = v.y; mPos[i * 3 + 2] = v.z;
      mA[i] = r ? r.a : 0;
      mS[i] = r ? r.s : 0;
    }
    mGeo.attributes.position.needsUpdate = mGeo.attributes.aA.needsUpdate = mGeo.attributes.aS.needsUpdate = true;
  }

  return {
    group,
    motes: M,
    write,
    writeMotes,
    setAtlas(tex) { atlas = tex; cardU.uAtlas.value = tex; },
    setTime(t) { starU.uTime.value = t; },
    setPixelRatio(v) { pr.value = v; },
    setHalo(v) { haloU.uIntensity.value = v; },
    dispose() {
      group.parent && group.parent.remove(group);
      plane.dispose();
      geo.dispose();
      cardMat.dispose();
      haloMat.dispose();
      sGeo.dispose();
      starMat.dispose();
      if (mGeo) { mGeo.dispose(); moteMat.dispose(); }
      blank.dispose();
      if (atlas) atlas.dispose();
      atlas = null;
      cards.dispose();
      halos.dispose();
    },
  };
}
