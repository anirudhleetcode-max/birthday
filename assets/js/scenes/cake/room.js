// The room around the cake: a warm plum night, out-of-focus fairy lights and
// tiny distant lanterns, floating gold dust, a glossy walnut table.
import * as THREE from 'three';
import { woodTexture, radialTexture, envGradientTexture, rng } from './textures.js';

// Pre-filtered environment for reflections (gold, glaze, porcelain).
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const disposables = [];
  const gradTex = envGradientTexture();
  disposables.push(gradTex);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.BackSide }));
  env.add(dome);
  const panel = (w, h, rgb, pos, look = new THREE.Vector3(0, 1.5, 0)) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(look);
    env.add(m);
  };
  const blob = (r, rgb, pos) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb) }));
    m.position.copy(pos); env.add(m);
  };
  // warm soft key from the front/above (candle-glow + lamp) — makes the gold read as gold
  panel(18, 8, [2.6, 1.55, 0.75], new THREE.Vector3(-4, 10, 18));
  panel(10, 4, [1.4, 0.8, 0.4], new THREE.Vector3(10, 4, 14));
  // a broad warm band low in front (what vertical gold surfaces reflect toward the camera)
  panel(40, 5, [1.5, 0.95, 0.45], new THREE.Vector3(0, 2.5, 22), new THREE.Vector3(0, 2.5, 0));
  panel(16, 6, [2.0, 1.3, 0.62], new THREE.Vector3(-14, 4, 12));
  // cool indigo rim from behind
  panel(14, 10, [0.4, 0.5, 1.25], new THREE.Vector3(14, 8, -16));
  panel(8, 8, [0.22, 0.28, 0.75], new THREE.Vector3(-16, 6, -10));
  // a string of warm fairy-light glints around the horizon
  const R = rng(17);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2;
    blob(0.35 + R() * 0.4, [3.2, 2.0, 0.9], new THREE.Vector3(Math.cos(a) * 24, 3 + R() * 6, Math.sin(a) * 24));
  }
  // low warm bounce from the table
  panel(30, 30, [0.18, 0.09, 0.05], new THREE.Vector3(0, -6, 0), new THREE.Vector3(0, 0, 0));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  disposables.forEach((d) => d.dispose());
  return rt;
}

// Sky dome behind everything: deep plum → indigo, with a warm haze behind the cake.
export function buildBackdrop() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uRoom: { value: 1 }, uWarm: { value: 0 } },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uRoom; uniform float uWarm;
      varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.0016, 0.0021, 0.0085);  // deep midnight (#05081a)
        vec3 mid = vec3(0.0075, 0.0100, 0.0560);  // indigo at the horizon (#151a44)
        vec3 col = mix(mid, top, smoothstep(-0.05, 0.6, y));
        col = mix(col, vec3(0.001, 0.0012, 0.003), smoothstep(0.0, -0.4, y));
        // a faint rose-indigo haze behind the cake (we look toward -z)…
        float h = pow(max(0.0, dot(normalize(vDir * vec3(1.0, 1.6, 1.0)), vec3(0.0, 0.05, -1.0))), 6.0);
        col += vec3(0.02, 0.012, 0.04) * h * 0.6;
        // …which turns into warm golden light once the candles are out
        col += vec3(0.075, 0.036, 0.008) * pow(h, 1.1) * smoothstep(0.55, -0.05, y) * uWarm;
        col *= 0.35 + 0.65 * uRoom;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// Billboard light-particles: bokeh discs (kind 0), fairy-light strings (kind 1),
// distant rising lanterns (kind 2) — all in one instanced draw.
export function buildBokeh({ lowPower = false } = {}) {
  const R = rng(99);
  const items = [];
  const warm = [1.0, 0.78, 0.45], rose = [1.0, 0.62, 0.72], lav = [0.55, 0.62, 1.0], amber = [1.0, 0.62, 0.3], cream = [1.0, 0.9, 0.75];
  // draped strings of fairy lights across the back of the room
  const strings = lowPower ? 2 : 3;
  for (let s = 0; s < strings; s++) {
    const z = -7.2 - s * 3.0, y0 = 3.2 + s * 0.75, x0 = -10 - s * 3, x1 = 10 + s * 3;
    const n = 26 + s * 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const sag = Math.cosh((t - 0.5) * 2.4) - Math.cosh(1.2);
      const y = y0 + sag * 1.15 + Math.sin(t * 19 + s) * 0.04;
      items.push({ p: [x, y, z + Math.sin(t * 7) * 0.3], size: 0.2 + s * 0.08 + R() * 0.08, col: R() < 0.75 ? warm : amber, a: 0.9, kind: 1 });
    }
  }
  // scattered bokeh discs
  const nB = lowPower ? 22 : 38;
  for (let i = 0; i < nB; i++) {
    const z = -6 - R() * 12;
    items.push({
      p: [(R() - 0.5) * (14 - z * 0.9), -0.5 + R() * 6.5, z],
      size: 0.35 + R() * 1.1, col: [warm, rose, lav, cream, amber, warm][Math.floor(R() * 6)], a: 0.14 + R() * 0.32, kind: 0,
    });
  }
  // distant lanterns drifting up
  const nL = lowPower ? 7 : 12;
  for (let i = 0; i < nL; i++) {
    items.push({ p: [(R() - 0.5) * 28, R() * 10, -16 - R() * 8], size: 0.16 + R() * 0.14, col: amber, a: 0.7, kind: 2 });
  }
  const N = items.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const aPos = new Float32Array(N * 3), aCol = new Float32Array(N * 4), aMisc = new Float32Array(N * 3);
  items.forEach((it, i) => {
    aPos.set(it.p, i * 3);
    aCol.set([...it.col, it.a], i * 4);
    aMisc.set([it.size, R(), it.kind], i * 3);
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 4));
  geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(aMisc, 3));
  geo.instanceCount = N;
  quad.dispose();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec4 aCol; attribute vec3 aMisc;
      uniform float uTime;
      varying vec2 vUv; varying vec4 vCol; varying float vKind; varying float vTw;
      void main(){
        vUv = uv; vCol = aCol; vKind = aMisc.z;
        vec3 p = aPos;
        float seed = aMisc.y;
        if (aMisc.z > 1.5) { // lantern: rise & wrap, gentle sway
          p.y = mod(aPos.y + uTime * (0.12 + seed * 0.1), 12.0) - 1.0;
          p.x += sin(uTime * 0.3 + seed * 20.0) * 0.4;
        } else {
          p.x += sin(uTime * 0.12 + seed * 30.0) * 0.12;
          p.y += cos(uTime * 0.1 + seed * 20.0) * 0.1;
        }
        vTw = 0.75 + 0.25 * sin(uTime * (0.6 + seed * 1.3) + seed * 40.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * aMisc.x;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec2 vUv; varying vec4 vCol; varying float vKind; varying float vTw;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a;
        if (vKind > 1.5) {
          a = exp(-d * d * 10.0) + exp(-d * d * 60.0) * 1.5; // tiny glowing lantern
        } else {
          float disc = 1.0 - smoothstep(0.7, 1.0, d);
          float rim = smoothstep(0.6, 0.9, d) * disc * 0.22;
          a = disc * 0.42 + rim + exp(-d * d * 3.0) * 0.2;
          if (vKind > 0.5) a = exp(-d * d * 5.0) * 0.8 + exp(-d * d * 40.0) * 0.9; // fairy bulbs: soft glow + hot core
        }
        vec3 col = vCol.rgb * a * vCol.a * vTw * uBright;
        gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return { mesh, uniforms: mat.uniforms, dispose() { geo.dispose(); mat.dispose(); } };
}

// Floating gold dust motes catching the candlelight around the cake.
export function buildDust({ count = 90 } = {}) {
  const R = rng(5);
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const aPos = new Float32Array(count * 3), aMisc = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, r = 0.6 + R() * 3.2;
    aPos.set([Math.cos(a) * r, 0.3 + R() * 3.6, Math.sin(a) * r * 0.8 + 0.4], i * 3);
    aMisc.set([0.008 + R() * R() * 0.03, R()], i * 2);
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(aMisc, 2));
  geo.instanceCount = count;
  quad.dispose();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec2 aMisc; uniform float uTime;
      varying vec2 vUv; varying float vTw;
      void main(){
        vUv = uv;
        float s = aMisc.y * 50.0;
        vec3 p = aPos;
        p.y = mod(aPos.y + uTime * (0.02 + aMisc.y * 0.03), 4.0) + 0.1;
        p.x += sin(uTime * 0.21 + s) * 0.25 + sin(uTime * 0.53 + s * 2.0) * 0.06;
        p.z += cos(uTime * 0.17 + s * 1.7) * 0.2;
        vTw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (0.8 + aMisc.y * 2.0) + s), 2.0);
        // fade near the wrap points
        vTw *= smoothstep(0.1, 0.6, p.y) * (1.0 - smoothstep(3.4, 4.1, p.y));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * aMisc.x;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec2 vUv; varying float vTw;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = exp(-d * d * 6.0);
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.45) * a * vTw * uBright * 0.9, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, uniforms: mat.uniforms, dispose() { geo.dispose(); mat.dispose(); } };
}

// Round walnut table with a clear-coat sheen + fake contact shadows.
export function buildTable({ lowPower = false, quality = 2, anisotropy = 4 } = {}) {
  const group = new THREE.Group();
  const wood = woodTexture(lowPower ? 512 : 1024);
  wood.anisotropy = anisotropy;
  const mat = quality >= 2
    ? new THREE.MeshPhysicalMaterial({ map: wood, color: 0xa8847a, roughness: 0.6, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3 })
    : new THREE.MeshStandardMaterial({ map: wood, color: 0xa8847a, roughness: 0.58, metalness: 0 });
  mat.userData.env = 0.4; // keep the dark wood dark; its sheen comes from the lights
  const top = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.12, 160, 1), mat);
  top.position.y = -0.06;
  group.add(top);
  // soft shadow decals
  const shadowTex = radialTexture({ size: 256, inner: 'rgba(0,0,0,0.9)', mid: 'rgba(0,0,0,0.55)', outer: 'rgba(0,0,0,0)', midStop: 0.45 });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 });
  const mkShadow = (r, x, z, o = 0.85) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), shadowMat.clone());
    m.material.opacity = o;
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z);
    m.renderOrder = 1;
    group.add(m);
    return m;
  };
  const standShadow = mkShadow(1.15, 0, 0, 0.9);
  const glowTex = radialTexture({ size: 256, inner: 'rgba(255,170,90,0.9)', mid: 'rgba(255,140,70,0.25)', outer: 'rgba(255,120,60,0)', midStop: 0.3 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.003;
  pool.renderOrder = 2;
  group.add(pool);
  shadowMat.dispose();
  return { group, mat, wood, shadowTex, glowTex, standShadow, mkShadow, pool };
}
