// Chapter Five — The Night the Sky Lit Up.
// A still lake at night, a kingdom on the water, and thousands of lanterns
// rising — some of them carrying her photos. Tap to release your own.
import * as THREE from 'three';

/* ------------------------------------------------------------------ shaders */
const LANTERN_MOTION = /* glsl */ `
  attribute vec3 aStart;   // x, y0, z
  attribute vec4 aParams;  // speed, seed, birth, scale
  uniform float uTime;
  vec3 lanternPos(vec3 start, vec4 p, float t) {
    float age = t - p.z;
    float alive = step(0.0, age);
    age = max(age, 0.0);
    float y = start.y + p.x * age - (1.0 - alive) * 900.0;
    float sx = sin(age * 0.31 + p.y * 6.283) * 1.7 + sin(age * 0.11 + p.y * 3.1) * 3.2;
    float sz = cos(age * 0.27 + p.y * 4.7) * 1.5;
    return vec3(start.x + sx, y, start.z + sz);
  }
  float flicker(float t, float seed) {
    return 0.86 + 0.09 * sin(t * 11.0 + seed * 61.0) + 0.05 * sin(t * 23.0 + seed * 17.0);
  }
`;

const lanternVert = /* glsl */ `
  ${LANTERN_MOTION}
  varying float vY;
  varying float vSeed;
  varying float vFog;
  varying float vFacing;
  varying float vAlive;
  void main() {
    vec3 c = lanternPos(aStart, aParams, uTime);
    float s = aParams.w;
    float tilt = sin(uTime * 0.6 + aParams.y * 20.0) * 0.07;
    vec3 p = position * s;
    p.xy = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * p.xy;
    vec4 mv = modelViewMatrix * vec4(c + p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(n.z);
    vY = position.y + 0.5;
    vSeed = aParams.y;
    vAlive = step(0.0, uTime - aParams.z);
    vFog = smoothstep(250.0, 1500.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const lanternFrag = /* glsl */ `
  uniform float uTime;
  varying float vY;
  varying float vSeed;
  varying float vFog;
  varying float vFacing;
  varying float vAlive;
  float flicker(float t, float seed) {
    return 0.86 + 0.09 * sin(t * 11.0 + seed * 61.0) + 0.05 * sin(t * 23.0 + seed * 17.0);
  }
  void main() {
    if (vAlive < 0.5) discard;
    vec3 bottom = vec3(1.0, 0.88, 0.58);
    vec3 top = vec3(0.98, 0.42, 0.14);
    vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, vY));
    float glow = (1.55 - vY * 0.85) * (0.62 + 0.55 * vFacing);
    col *= glow * flicker(uTime, vSeed) * 1.35;
    col = mix(col, vec3(1.0, 0.62, 0.32) * 0.9, vFog * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const glowVert = /* glsl */ `
  ${LANTERN_MOTION}
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uMirror;
  varying float vAlpha;
  void main() {
    vec3 c = lanternPos(aStart, aParams, uTime);
    float alive = step(0.0, uTime - aParams.z);
    if (uMirror > 0.5) {
      vAlpha = 0.42 * exp(-max(c.y, 0.0) / 140.0);
      c.y = -c.y - 0.6;
      c.x += sin(uTime * 1.7 + c.z * 0.09) * 0.7;
    } else {
      vAlpha = 1.0;
      c.y -= 0.12 * aParams.w;
    }
    vAlpha *= alive * flicker(uTime, aParams.y);
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    gl_PointSize = clamp(uSize * aParams.w * uPixelRatio * (220.0 / -mv.z), 0.0, 180.0);
    vAlpha *= smoothstep(1.0, 2.5, gl_PointSize);
    gl_Position = projectionMatrix * mv;
  }
`;

const glowFrag = /* glsl */ `
  uniform float uMirror;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    if (uMirror > 0.5) q *= vec2(2.6, 0.75);
    float d = dot(q, q);
    float a = exp(-d * 18.0) * 0.5 + exp(-d * 140.0) * 0.55;
    vec3 col = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.9, 0.7), exp(-d * 90.0));
    gl_FragColor = vec4(col * a * vAlpha, a * vAlpha);
  }
`;

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFrag = /* glsl */ `
  uniform float uGlow;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 zenith = vec3(0.006, 0.004, 0.02);
    vec3 mid = vec3(0.03, 0.014, 0.065);
    vec3 horizon = vec3(0.12, 0.05, 0.15);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
    col = mix(col, zenith, smoothstep(0.15, 0.75, h));
    // warm glow above the kingdom
    float k = exp(-pow(atan(vDir.x, -vDir.z) * 2.2, 2.0)) * exp(-max(h, 0.0) * 9.0);
    col += vec3(0.42, 0.17, 0.07) * k * uGlow;
    gl_FragColor = vec4(col, 1.0);
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
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uGlow;
  varying vec3 vWorld;
  void main() {
    vec3 v = normalize(uCam - vWorld);
    float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 5.0);
    vec3 deep = vec3(0.006, 0.004, 0.016);
    vec3 sky = vec3(0.085, 0.036, 0.11);
    float rip = sin(vWorld.x * 0.045 + uTime * 0.7) * sin(vWorld.z * 0.07 - uTime * 0.5) + sin(vWorld.x * 0.13 - uTime) * 0.35;
    vec3 col = mix(deep, sky, fres) * (1.0 + rip * 0.08);
    float streak = exp(-pow(vWorld.x / (90.0 + -vWorld.z * 0.12), 2.0)) * smoothstep(-80.0, -900.0, vWorld.z);
    col += vec3(0.45, 0.2, 0.08) * streak * (0.55 + 0.45 * rip) * 0.35 * uGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const starVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vA;
  void main() {
    vA = 0.45 + 0.55 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 40.0);
    gl_PointSize = (1.0 + aSeed * 1.8) * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const starFrag = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.95, 0.88), smoothstep(0.5, 0.0, d) * vA);
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

function buildKingdom(scene, disposables) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x0d0718 });
  disposables.push(mat);
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    disposables.push(geo);
    return m;
  };
  add(new THREE.CylinderGeometry(170, 260, 26, 40), 0, 2, 0);
  add(new THREE.CylinderGeometry(110, 170, 40, 32), 0, 30, 0);
  // houses around the hill
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI + Math.PI;
    const r = 120 + (i % 3) * 18;
    const w = 14 + (i % 4) * 5;
    const h = 16 + ((i * 7) % 5) * 6;
    add(new THREE.BoxGeometry(w, h, 14), Math.cos(a) * r * 0.9, 50 + h / 2 - (i % 3) * 6, Math.sin(a) * r * 0.35 + 30);
    add(new THREE.ConeGeometry(w * 0.75, h * 0.6, 4), Math.cos(a) * r * 0.9, 50 + h + h * 0.3 - (i % 3) * 6, Math.sin(a) * r * 0.35 + 30).rotation.y = Math.PI / 4;
  }
  // castle
  add(new THREE.BoxGeometry(80, 110, 60), 0, 105, -10);
  const towers = [[-48, 150, 14], [48, 140, 13], [-22, 190, 11], [22, 175, 12], [0, 225, 10], [-72, 115, 10], [72, 120, 10]];
  for (const [x, h, r] of towers) {
    add(new THREE.CylinderGeometry(r, r * 1.08, h, 12), x, 50 + h / 2, -6);
    add(new THREE.ConeGeometry(r * 1.45, h * 0.32, 12), x, 50 + h + h * 0.16, -6);
  }
  // windows
  const wins = [];
  for (let i = 0; i < 140; i++) {
    const x = (Math.random() - 0.5) * 300;
    const y = 52 + Math.random() * (Math.abs(x) < 60 ? 170 : 50);
    wins.push(x, y, 40 + Math.random() * 10);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wins, 3));
  const wm = new THREE.PointsMaterial({ color: 0xffc56b, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0.95, toneMapped: false });
  group.add(new THREE.Points(wg, wm));
  disposables.push(wg, wm);
  group.position.set(0, 0, -980);
  scene.add(group);
  return group;
}

function buildBoat(scene, disposables) {
  const shape = new THREE.Shape();
  shape.moveTo(-6, 1.2);
  shape.quadraticCurveTo(-4.8, -0.9, 0, -1.1);
  shape.quadraticCurveTo(4.8, -0.9, 6.4, 1.6);
  shape.lineTo(5.6, 1.2);
  shape.quadraticCurveTo(0, 0.6, -5.4, 1.0);
  shape.lineTo(-6, 1.2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
  geo.translate(0, 0, -1.1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x07030c });
  const boat = new THREE.Mesh(geo, mat);
  boat.position.set(-9, 0.2, -26);
  boat.rotation.y = 0.35;
  scene.add(boat);
  const poleG = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6);
  const pole = new THREE.Mesh(poleG, mat);
  pole.position.set(5.6, 2.6, 0);
  pole.rotation.z = -0.3;
  boat.add(pole);
  disposables.push(geo, mat, poleG);
  return boat;
}

/* ------------------------------------------------------------------ scene */
export default {
  id: 'lanterns',
  title: 'The Night the Sky Lit Up',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const t = ctx.text.lanterns || {};
    const lines = t.lines || [];
    const photos = ctx.chapter('lanterns');
    const disposables = [];
    this.disposables = disposables;

    el.innerHTML = '<canvas class="gl"></canvas><div class="ln-veil"></div>';
    const canvas = el.querySelector('canvas');
    const veil = el.querySelector('.ln-veil');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !device.lowPower, powerPreference: 'high-performance' });
    this.renderer = renderer;
    const pr = Math.min(window.devicePixelRatio || 1, device.lowPower ? 1.2 : device.mobile ? 1.6 : 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(window.innerWidth < window.innerHeight ? 62 : 48, window.innerWidth / window.innerHeight, 0.5, 5000);

    // sky, stars, water, kingdom, boat
    const uniforms = { uTime: { value: 0 }, uPixelRatio: { value: pr }, uGlow: { value: 0.35 } };
    const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, uniforms: { uGlow: uniforms.uGlow } });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    disposables.push(skyGeo, skyMat);

    const starCount = device.lowPower ? 900 : 1800;
    const sp = new Float32Array(starCount * 3);
    const ss = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(1 - Math.random() * 0.95);
      sp[i * 3] = Math.sin(v) * Math.cos(u) * 2800;
      sp[i * 3 + 1] = Math.cos(v) * 2800;
      sp[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 2800;
      ss[i] = Math.random();
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    const starMat = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, uniforms });
    scene.add(new THREE.Points(starGeo, starMat));
    disposables.push(starGeo, starMat);

    const waterGeo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({ vertexShader: waterVert, fragmentShader: waterFrag, uniforms: { uCam: { value: new THREE.Vector3() }, uTime: uniforms.uTime, uGlow: uniforms.uGlow } });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.renderOrder = 0;
    scene.add(water);
    disposables.push(waterGeo, waterMat);

    const kingdom = buildKingdom(scene, disposables);
    const kGlowTex = radialTexture('rgba(255,200,130,.9)', 'rgba(255,150,70,.25)');
    const kGlowMat = new THREE.SpriteMaterial({ map: kGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    const kGlow = new THREE.Sprite(kGlowMat);
    kGlow.scale.set(1100, 520, 1);
    kGlow.position.set(0, 120, -1050);
    scene.add(kGlow);
    disposables.push(kGlowTex, kGlowMat);

    const boat = buildBoat(scene, disposables);
    const boatLampMat = new THREE.SpriteMaterial({ map: kGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
    const boatLamp = new THREE.Sprite(boatLampMat);
    boatLamp.scale.set(3.2, 3.2, 1);
    boatLamp.position.set(6.2, 3.8, 0);
    boat.add(boatLamp);
    disposables.push(boatLampMat);

    // ---------------- lanterns (GPU-animated instances) ----------------
    const total = device.lowPower ? 520 : device.mobile ? 900 : 1700;
    const userSlots = 80;
    const N = total + userSlots;
    const aStart = new Float32Array(N * 3);
    const aParams = new Float32Array(N * 4);
    const rand = (a, b) => a + Math.random() * (b - a);
    const set = (i, x, y, z, speed, birth, scale) => {
      aStart.set([x, y, z], i * 3);
      aParams.set([speed, Math.random(), birth, scale], i * 4);
    };
    let i = 0;
    // the first few, from the kingdom
    for (let k = 0; k < 6; k++, i++) set(i, rand(-50, 50), rand(40, 70), -960 + rand(-20, 20), rand(3.2, 4), 3 + k * 1.3, 2.6);
    // a first wave from the shores and boats
    const wave1 = Math.round(total * 0.25);
    for (let k = 0; k < wave1; k++, i++) {
      const z = rand(-1150, -250);
      set(i, rand(-700, 700) * (-z / 900), rand(0, 30), z, rand(1.6, 3.2) * (-z / 600 + 0.4), rand(10, 26), rand(1.8, 2.6));
    }
    // the sky fills
    while (i < total) {
      const near = Math.random() < 0.06;
      const z = near ? rand(-110, -45) : rand(-1300, -150);
      const spread = near ? 70 : 750 * (-z / 900) + 60;
      const y0 = near ? rand(0.6, 2.5) : rand(1, 60);
      set(i, rand(-spread, spread), y0, z, near ? rand(0.9, 1.5) : rand(1.6, 3.4) * (-z / 700 + 0.5), rand(24, 44), near ? rand(1.6, 2.1) : rand(1.8, 2.8));
      i++;
    }
    // user lanterns: hidden until released
    for (let k = 0; k < userSlots; k++, i++) set(i, 0, 0, 0, 0, 1e6, 2);

    const baseGeo = new THREE.CylinderGeometry(0.52, 0.4, 1, 10, 1, true);
    const lg = new THREE.InstancedBufferGeometry();
    lg.index = baseGeo.index;
    lg.setAttribute('position', baseGeo.getAttribute('position'));
    lg.setAttribute('normal', baseGeo.getAttribute('normal'));
    const startAttr = new THREE.InstancedBufferAttribute(aStart, 3);
    const paramAttr = new THREE.InstancedBufferAttribute(aParams, 4);
    lg.setAttribute('aStart', startAttr);
    lg.setAttribute('aParams', paramAttr);
    lg.instanceCount = N;
    const lanternMat = new THREE.ShaderMaterial({ vertexShader: lanternVert, fragmentShader: lanternFrag, uniforms, side: THREE.DoubleSide });
    const lanterns = new THREE.Mesh(lg, lanternMat);
    lanterns.frustumCulled = false;
    scene.add(lanterns);
    disposables.push(baseGeo, lg, lanternMat);

    const pg = new THREE.InstancedBufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    pg.setAttribute('aStart', startAttr);
    pg.setAttribute('aParams', paramAttr);
    pg.instanceCount = N;
    const mkGlow = (mirror) => new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, depthTest: !mirror, blending: THREE.AdditiveBlending,
      uniforms: { ...uniforms, uSize: { value: mirror ? 7 : 10 }, uMirror: { value: mirror ? 1 : 0 } },
    });
    const glowMat = mkGlow(false);
    const mirrorMat = mkGlow(true);
    const glows = new THREE.Points(pg, glowMat);
    const mirrors = new THREE.Points(pg, mirrorMat);
    glows.frustumCulled = mirrors.frustumCulled = false;
    mirrors.renderOrder = 1;
    boat.renderOrder = 2;
    scene.add(glows, mirrors);
    disposables.push(pg, glowMat, mirrorMat);
    // share live uniforms
    glowMat.uniforms.uTime = mirrorMat.uniforms.uTime = uniforms.uTime;

    // ---------------- photo lanterns ----------------
    const loader = new THREE.TextureLoader();
    const glowTex = radialTexture('rgba(255,236,200,1)', 'rgba(255,170,90,.35)');
    disposables.push(glowTex);
    const photoLanterns = [];
    const makePhotoLantern = (photo) => new Promise((resolve) => {
      loader.load(photo.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const w = 4.6;
        const h = w / photo.ratio;
        const g = new THREE.Group();
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        halo.scale.set(w * 2.1, h * 2.1, 1);
        halo.position.z = -0.2;
        const frameGeo = new THREE.PlaneGeometry(w + 0.5, h + 0.5);
        const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.64, 0.3), transparent: true, opacity: 0, toneMapped: false });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.z = -0.02;
        const picGeo = new THREE.PlaneGeometry(w, h);
        const picMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, color: new THREE.Color(1.0, 0.95, 0.88) });
        const pic = new THREE.Mesh(picGeo, picMat);
        g.add(halo, frame, pic);
        g.visible = false;
        scene.add(g);
        disposables.push(tex, frameGeo, frameMat, picGeo, picMat, halo.material);
        resolve({ group: g, mats: [frameMat, picMat], halo: halo.material, seed: Math.random() * 10, born: -1 });
      }, undefined, () => resolve(null));
    });
    Promise.all(photos.map(makePhotoLantern)).then((list) => photoLanterns.push(...list.filter(Boolean)));

    const fwd = new THREE.Vector3();
    const releasePhoto = (k) => {
      const pl = photoLanterns[k];
      if (!pl) return;
      camera.getWorldDirection(fwd);
      const dist = 26 + (k % 3) * 4;
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const portrait = window.innerWidth < window.innerHeight;
      const offs = [-1, 1, -0.4, 0.8, -0.9, 0.3];
      const base = camera.position.clone().addScaledVector(fwd, dist).addScaledVector(right, offs[k % offs.length] * (portrait ? 3.4 : 8)).add(new THREE.Vector3(0, -dist * 0.42, 0));
      pl.start = base;
      pl.born = uniforms.uTime.value;
      pl.group.visible = true;
      audio.sfx('lanternRise');
    };

    // ---------------- camera choreography ----------------
    const cam = { p: 0, drift: 0 };
    const A = { pos: new THREE.Vector3(0, 3.2, 30), look: new THREE.Vector3(0, 30, -600) };
    const B = { pos: new THREE.Vector3(2, 8, 34), look: new THREE.Vector3(0, 140, -560) };
    const C = { pos: new THREE.Vector3(0, 14, 40), look: new THREE.Vector3(0, 380, -420) };
    const look = new THREE.Vector3();
    const placeCamera = (time) => {
      const p = cam.p;
      const a = p < 0.5 ? A : B;
      const b = p < 0.5 ? B : C;
      const k = p < 0.5 ? p * 2 : (p - 0.5) * 2;
      const e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(a.pos, b.pos, e);
      look.lerpVectors(a.look, b.look, e);
      camera.position.x += Math.sin(time * 0.13) * 0.8;
      camera.position.y += Math.sin(time * 0.21) * 0.25;
      camera.lookAt(look);
    };

    // ---------------- loop ----------------
    const clock = new THREE.Clock();
    let running = true;
    const tmp = new THREE.Vector3();
    const loop = () => {
      if (!running) return;
      this.raf = requestAnimationFrame(loop);
      const time = clock.getElapsedTime();
      uniforms.uTime.value = time;
      placeCamera(time);
      waterMat.uniforms.uCam.value.copy(camera.position);
      for (const pl of photoLanterns) {
        if (pl.born < 0) continue;
        const age = time - pl.born;
        const life = 17;
        const fade = Math.min(1, age / 2.5) * Math.min(1, Math.max(0, (life - age) / 3));
        if (age > life) { pl.group.visible = false; pl.born = -1; continue; }
        tmp.copy(pl.start);
        tmp.y += age * 1.55;
        tmp.x += Math.sin(age * 0.5 + pl.seed) * 0.8;
        pl.group.position.copy(tmp);
        pl.group.quaternion.copy(camera.quaternion);
        pl.group.rotateZ(Math.sin(age * 0.7 + pl.seed) * 0.05);
        pl.mats.forEach((m) => (m.opacity = fade));
        pl.halo.opacity = fade * 0.45;
      }
      renderer.render(scene, camera);
    };
    this.stop = () => { running = false; cancelAnimationFrame(this.raf); };
    loop();

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 62 : 48;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    this.onResize = onResize;

    // ---------------- tap to release a lantern ----------------
    let nextUser = total;
    let tapsEnabled = false;
    const ray = new THREE.Vector3();
    const onTap = (e) => {
      if (!tapsEnabled || nextUser >= N) return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
      const p = camera.position.clone().addScaledVector(ray, 44);
      aStart.set([p.x, p.y - 5, p.z], nextUser * 3);
      aParams.set([1.8, Math.random(), uniforms.uTime.value, 2.2], nextUser * 4);
      startAttr.needsUpdate = true;
      paramAttr.needsUpdate = true;
      nextUser++;
      fx.sparkle(e.clientX, e.clientY, 10, { spread: 30 });
      audio.sfx('lanternRise');
    };
    canvas.addEventListener('pointerdown', onTap);

    // ---------------- the story ----------------
    ctx.letterbox(true);
    fx.dust({ density: 0.12 });
    audio.setMood('hush');
    gsap.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: 4, ease: 'power2.inOut' });
    await ui.chapterCard(t.kicker || 'Chapter Five', t.title || 'The Night the Sky Lit Up');

    gsap.to(cam, { p: 1, duration: 62, ease: 'sine.inOut' });
    gsap.to(uniforms.uGlow, { value: 1, duration: 30, ease: 'sine.inOut' });
    clock.start();
    await ui.narrate(lines.slice(0, 1), { position: 'bottom' });
    audio.setMood('wonder');
    await ui.narrate(lines.slice(1, 2), { position: 'bottom' });
    releasePhoto(0);
    await ui.narrate(lines.slice(2, 3), { position: 'bottom' });
    await ctx.wait(2);
    releasePhoto(1);
    await ctx.wait(4);
    releasePhoto(2);
    audio.setMood('soar');
    audio.sfx('swell');
    await ui.narrate(lines.slice(3, 4), { position: 'bottom', style: 'big', hold: 4 });
    releasePhoto(3);
    tapsEnabled = true;
    const hint = ui.hint(t.tapHint || 'Tap anywhere to send a lantern of your own');
    await ctx.wait(5);
    releasePhoto(4);
    await ctx.wait(5);
    hint.remove();
    releasePhoto(5);
    await ctx.wait(3);
    await ui.narrate([t.after].filter(Boolean), { position: 'bottom', hold: 3.5 });
    await ctx.wait(2);
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {
    this.stop && this.stop();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    (this.disposables || []).forEach((d) => d.dispose && d.dispose());
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    }
    this.renderer = null;
    this.disposables = [];
  },
};
