// The deep sky behind the constellation: a painted midnight wash (one small
// canvas texture, dithered in the shader so it never bands) and a far field of
// softly twinkling stars at many depths, so the slow camera drift has parallax.
import * as THREE from 'three';

const NEB_VERT = /* glsl */ `
  uniform vec2 uShift;
  varying vec2 vUv;
  void main() {
    vUv = uv * 0.94 + 0.03 + uShift;
    gl_Position = vec4(position.xy * 2.0, 0.999, 1.0);
  }
`;
const NEB_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uFade;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = texture2D(uMap, vUv).rgb * uFade;
    c += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither: no banding in the dark gradients
    gl_FragColor = vec4(c, 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute vec4 aStar;   // size (css px), brightness, seed, warmth
  uniform float uTime;
  uniform float uPr;
  uniform float uFade;
  varying float vA;
  varying float vWarm;
  varying float vRay;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.72 + 0.28 * sin(uTime * (0.6 + aStar.z * 1.9) + aStar.z * 60.0) * sin(uTime * (0.23 + aStar.z * 0.4) + aStar.z * 13.0);
    vA = aStar.y * tw * uFade;
    vWarm = aStar.w;
    vRay = step(0.82, aStar.y);
    gl_PointSize = aStar.x * uPr * (vRay > 0.5 ? 3.2 : 1.6);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying float vWarm;
  varying float vRay;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float k = vRay > 0.5 ? 2.0 : 1.0;      // bright stars: a wider sprite with hair-thin rays
    float core = exp(-d * d * 26.0 * k * k);
    float halo = exp(-d * d * 6.0 * k) * 0.22;
    float rays = vRay * (exp(-abs(q.x) * 160.0) * exp(-abs(q.y) * 9.0) + exp(-abs(q.y) * 160.0) * exp(-abs(q.x) * 9.0)) * 0.35;
    float a = (core + halo + rays) * vA * (1.0 - smoothstep(0.85, 1.0, d));
    vec3 col = mix(vec3(0.84, 0.88, 1.0), vec3(1.0, 0.86, 0.62), vWarm);
    col = mix(col, vec3(1.0), core * 0.5);
    gl_FragColor = vec4(col * a, a);
  }
`;

function paintNebula(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#04030b');
  base.addColorStop(0.45, '#080a1f');
  base.addColorStop(1, '#0b0c26');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const blob = (x, y, r, col, a) => {
    const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
    gr.addColorStop(0, col.replace('A', String(a)));
    gr.addColorStop(0.55, col.replace('A', String(a * 0.35)));
    gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  g.globalCompositeOperation = 'lighter';
  // a faint river of indigo and violet across the sky, and a whisper of warmth low in the frame
  blob(0.22, 0.3, 0.42, 'rgba(36,17,61,A)', 0.55);
  blob(0.7, 0.22, 0.36, 'rgba(20,26,70,A)', 0.6);
  blob(0.5, 0.52, 0.5, 'rgba(26,20,64,A)', 0.42);
  blob(0.82, 0.62, 0.3, 'rgba(59,26,87,A)', 0.3);
  blob(0.12, 0.78, 0.32, 'rgba(20,26,70,A)', 0.4);
  blob(0.5, 0.95, 0.42, 'rgba(70,40,40,A)', 0.16);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/**
 * createSky({ device, count }) → { group, nebula, update(time, camera), setFade(a), setPixelRatio(v), dispose() }
 * `group` holds the stars (add it to the scene); `nebula` is a full-screen backdrop mesh (add it too).
 */
export function createSky({ device = {}, count } = {}) {
  const tier = device.tier || 'high';
  const N = count || (tier === 'low' ? 260 : tier === 'mid' ? 520 : 760);
  const group = new THREE.Group();
  group.name = 'constellation-sky';

  const pos = new Float32Array(N * 3);
  const star = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    // a deep shell in front of the camera: wide enough to survive the drift and any aspect
    const z = -40 - Math.pow(Math.random(), 0.7) * 150;
    const span = (12 - z) * 1.25;
    pos[i * 3] = (Math.random() * 2 - 1) * span;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * span * 0.75;
    pos[i * 3 + 2] = z;
    const b = Math.random();
    const bright = b > 0.965 ? 0.95 : b > 0.85 ? 0.62 : 0.16 + Math.random() * 0.36;
    star[i * 4] = 1.1 + Math.random() * 1.2 + (bright > 0.9 ? 1.4 : 0);
    star[i * 4 + 1] = bright;
    star[i * 4 + 2] = Math.random();
    star[i * 4 + 3] = Math.random() < 0.28 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.25;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  const U = { uTime: { value: 0 }, uPr: { value: 1 }, uFade: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 0;
  group.add(points);

  const nebTex = new THREE.CanvasTexture(paintNebula(tier === 'low' ? 256 : 512, tier === 'low' ? 256 : 512));
  nebTex.colorSpace = THREE.NoColorSpace;
  nebTex.minFilter = THREE.LinearFilter;
  nebTex.generateMipmaps = false;
  const nebU = { uMap: { value: nebTex }, uFade: { value: 1 }, uShift: { value: new THREE.Vector2() } };
  const nebGeo = new THREE.PlaneGeometry(1, 1);
  const nebMat = new THREE.ShaderMaterial({ uniforms: nebU, vertexShader: NEB_VERT, fragmentShader: NEB_FRAG, depthWrite: false, depthTest: false });
  const nebula = new THREE.Mesh(nebGeo, nebMat);
  nebula.frustumCulled = false;
  nebula.renderOrder = -10;

  return {
    group,
    nebula,
    update(time, camera) {
      U.uTime.value = time;
      // the wash moves a hair with the camera (it is very far away)
      nebU.uShift.value.set(camera.position.x * 0.0016, camera.position.y * 0.0016);
    },
    setFade(a) { U.uFade.value = a; nebU.uFade.value = 0.35 + 0.65 * a; },
    setPixelRatio(v) { U.uPr.value = v; },
    dispose() {
      group.parent && group.parent.remove(group);
      nebula.parent && nebula.parent.remove(nebula);
      geo.dispose();
      mat.dispose();
      nebGeo.dispose();
      nebMat.dispose();
      nebTex.dispose();
    },
  };
}
