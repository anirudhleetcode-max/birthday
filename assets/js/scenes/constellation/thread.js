// The golden thread of the constellation: a silk ribbon of light along a closed
// curve parameterised by u ∈ [0, 1]. The scene hands it the curve every frame
// (photo → photo while it travels, then the heart). Strands part between the
// photographs and gather at each one, like hair caught on a pin; a wide, very
// faint outer strand gives the glow without any post-processing. Additive light,
// depth-tested, so it passes behind the prints and never across her face.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec3 aTan;
  attribute float aSide;    // -1 | 1
  attribute float aT;       // u along the loop
  attribute float aS;       // arc length (world units)
  attribute float aStrand;  // 0 core · 1, 2 side strands · 3 glow
  attribute float aEnv;     // how far the side strands part (0 = gathered)
  attribute float aW;       // width factor (narrower through sharp corners, so the glow never folds)
  uniform float uTime;
  uniform float uWidth;
  uniform float uViewScale;
  uniform float uMinPx;
  uniform float uMotion;
  uniform float uGlowW;
  uniform float uSwell;
  varying float vSide;
  varying float vT;
  varying float vS;
  varying float vStrand;
  varying float vFade;
  void main() {
    vec3 P = position;
    vec3 T = normalize(aTan + vec3(1e-6, 0.0, 0.0));
    vec3 up = abs(T.z) > 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    vec3 n1 = normalize(cross(T, up));
    vec3 n2 = normalize(cross(T, n1));
    float side = step(0.5, aStrand) * (1.0 - step(2.5, aStrand));
    float ph = aStrand * 2.094;
    float k = 6.2832 / (uWidth * 26.0);
    float amp = uWidth * 1.5 * aEnv * uMotion * side;
    P += n1 * sin(aS * k + uTime * 0.9 + ph) * amp + n2 * cos(aS * k * 0.73 - uTime * 0.7 + ph * 1.3) * amp * 0.8;
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vec3 tv = (modelViewMatrix * vec4(T, 0.0)).xyz;
    vec3 sv = cross(tv, normalize(-mv.xyz));
    float sl = length(sv);
    sv = sl > 1e-5 ? sv / sl : vec3(1.0, 0.0, 0.0);
    float glow = step(2.5, aStrand);
    float w = uWidth * uSwell * (glow > 0.5 ? uGlowW * aW : (side > 0.5 ? 0.62 : 1.0) * mix(1.0, aW, 0.5));
    float px = w * uViewScale / max(-mv.z, 0.05);
    float grow = glow > 0.5 ? 1.0 : max(1.0, uMinPx / max(px, 1e-4));
    vFade = 1.0 / grow;
    mv.xyz += sv * aSide * w * grow * 0.5;
    vSide = aSide;
    vT = aT;
    vS = aS;
    vStrand = aStrand;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uHead;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDrawing;
  uniform float uBright;
  uniform float uHalo;
  uniform vec3 uColor;
  varying float vSide;
  varying float vT;
  varying float vS;
  varying float vStrand;
  varying float vFade;
  void main() {
    float d = vSide;
    float vis = 1.0 - smoothstep(uHead - 0.005, uHead + 0.0005, vT);
    float flow = 0.74 + 0.26 * sin(vS * 7.0 - uTime * 2.3 + vStrand * 2.0);
    float head = exp(-pow((vT - uHead) / 0.01, 2.0)) * uDrawing;
    vec3 col;
    float a;
    if (vStrand > 2.5) {
      a = exp(-d * d * 2.6) * 0.15 * uHalo * (0.8 + 0.2 * flow);
      col = vec3(1.0, 0.7, 0.36);
    } else {
      float core = exp(-d * d * 18.0);
      float soft = exp(-d * d * 3.4);
      float b = vStrand < 0.5 ? 1.0 : 0.46;
      a = (core * 0.74 + soft * 0.22) * b * flow * vFade + head * core * 1.3;
      col = mix(uColor, vec3(1.0, 0.95, 0.84), core * 0.4 + head * 0.45);
    }
    a *= vis * uOpacity * uBright;
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * createThread({ segments, width, color, device }) → { mesh, set(curve, env), setHead(u), head, setOpacity(a),
 *   setBright(b), setHalo(h), setSwell(s), update(time, dt), dispose() }
 * `set(curve, env)`: curve(u, outVector3) gives the loop point at u ∈ [0, 1] (u = 1 closes onto u = 0);
 * env(u) → 0..1 how far the side strands part at u.
 */
export function createThread({ segments = 260, width = 0.04, color = '#ffd98a', device = {} } = {}) {
  const tier = device.tier || 'high';
  const strands = tier === 'low' ? [0, 1, 3] : [0, 1, 2, 3];
  const S = strands.length;
  const M = Math.max(48, Math.round(segments)) + 1;
  const V = S * M * 2;
  const pos = new Float32Array(V * 3);
  const tan = new Float32Array(V * 3);
  const env = new Float32Array(V);
  const arc = new Float32Array(V);
  const wid = new Float32Array(V);
  const side = new Float32Array(V);
  const tt = new Float32Array(V);
  const strand = new Float32Array(V);
  const index = [];
  for (let s = 0; s < S; s++) {
    for (let j = 0; j < M; j++) {
      const v = (s * M + j) * 2;
      side[v] = -1; side[v + 1] = 1;
      tt[v] = tt[v + 1] = j / (M - 1);
      strand[v] = strand[v + 1] = strands[s];
      if (j < M - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const tanA = new THREE.BufferAttribute(tan, 3).setUsage(THREE.DynamicDrawUsage);
  const envA = new THREE.BufferAttribute(env, 1).setUsage(THREE.DynamicDrawUsage);
  const arcA = new THREE.BufferAttribute(arc, 1).setUsage(THREE.DynamicDrawUsage);
  const widA = new THREE.BufferAttribute(wid, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posA);
  geo.setAttribute('aTan', tanA);
  geo.setAttribute('aEnv', envA);
  geo.setAttribute('aS', arcA);
  geo.setAttribute('aW', widA);
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  geo.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1));
  geo.setIndex(index);

  const n = parseInt(String(color).replace('#', ''), 16);
  const U = {
    uTime: { value: 0 },
    uWidth: { value: width },
    uViewScale: { value: 600 },
    uMinPx: { value: tier === 'low' ? 1.3 : 1.5 },
    uMotion: { value: device.reducedMotion ? 0.35 : 1 },
    uGlowW: { value: 9 },
    uSwell: { value: 1 },
    uHead: { value: 0 },
    uOpacity: { value: 1 },
    uDrawing: { value: 0 },
    uBright: { value: 1 },
    uHalo: { value: 1 },
    uColor: { value: new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const size2 = new THREE.Vector2();
  mesh.onBeforeRender = (r, s, cam) => {
    r.getDrawingBufferSize(size2);
    U.uViewScale.value = size2.y * 0.5 * cam.projectionMatrix.elements[5];
  };

  const P = Array.from({ length: M }, () => new THREE.Vector3());
  const T = new THREE.Vector3();
  const E = new Float32Array(M);
  const L = new Float32Array(M);
  const WF = new Float32Array(M);
  const dA = new THREE.Vector3();
  const dB = new THREE.Vector3();
  const K = 4; // corner window (samples)
  const at = (j) => P[((j % (M - 1)) + (M - 1)) % (M - 1)];

  function set(curve, envFn) {
    for (let j = 0; j < M; j++) curve(j / (M - 1), P[j]);
    let acc = 0;
    for (let j = 0; j < M; j++) {
      if (j) acc += P[j].distanceTo(P[j - 1]);
      L[j] = acc;
      E[j] = envFn ? envFn(j / (M - 1)) : 0.5;
    }
    for (let j = 0; j < M; j++) {
      // how sharply the loop turns here (heart tip, the dip between the lobes)
      dA.subVectors(at(j), at(j - K));
      dB.subVectors(at(j + K), at(j));
      const la = dA.length();
      const lb = dB.length();
      const c = la > 1e-6 && lb > 1e-6 ? 1 - dA.dot(dB) / (la * lb) : 0;
      WF[j] = 1 / (1 + c * 7);
    }
    for (let j = 0; j < M; j++) {
      // closed loop: the neighbours of the seam are on the other side
      const a = j === 0 ? P[M - 2] : P[j - 1];
      const b = j === M - 1 ? P[1] : P[j + 1];
      T.subVectors(b, a);
      const p = P[j];
      for (let s = 0; s < S; s++) {
        const v = (s * M + j) * 2;
        for (let k = 0; k < 2; k++) {
          const i3 = (v + k) * 3;
          pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z;
          tan[i3] = T.x; tan[i3 + 1] = T.y; tan[i3 + 2] = T.z;
          env[v + k] = E[j];
          arc[v + k] = L[j];
          wid[v + k] = WF[j];
        }
      }
    }
    posA.needsUpdate = tanA.needsUpdate = envA.needsUpdate = arcA.needsUpdate = widA.needsUpdate = true;
  }

  let head = 0;
  let lastHead = 0;
  return {
    mesh,
    set,
    get head() { return head; },
    setHead(u) { head = Math.min(1.02, Math.max(0, u)); U.uHead.value = head; },
    setOpacity(a) { U.uOpacity.value = a; mesh.visible = a > 0.001; },
    setBright(b) { U.uBright.value = b; },
    setHalo(h) { U.uHalo.value = h; },
    setSwell(s) { U.uSwell.value = s; },
    setWidth(w) { U.uWidth.value = w; },
    update(time, dt) {
      U.uTime.value = time;
      const drawing = head > 0.001 && head < 0.999 && Math.abs(head - lastHead) > 1e-5;
      U.uDrawing.value += ((drawing ? 1 : 0) - U.uDrawing.value) * Math.min(1, dt * 3);
      lastHead = head;
    },
    dispose() {
      mesh.parent && mesh.parent.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
