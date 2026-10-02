// Candle flames: one instanced draw for all flame quads (animated teardrop
// shader with noise flicker & sway, leaning away from the camera while she
// blows) and one for the additive glow halos / glowing embers.
import * as THREE from 'three';

const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
`;

const COMMON_VS = /* glsl */`
attribute vec3 aBase;
attribute float aSeed;
attribute float aLit;
attribute float aOut;
attribute float aEmber;
uniform float uTime;
uniform float uBlow;
uniform float uBlowLocal;
${NOISE}
vec3 flameLean(float h, out vec3 right, out vec3 toCam, out float blow){
  toCam = cameraPosition - aBase; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-5));
  right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float t = uTime;
  float gust = vnoise(vec2(t * 6.0, aSeed * 31.0));
  blow = clamp(uBlow * (0.55 + 0.6 * gust) + aOut * 0.9, 0.0, 1.6);
  float sway = (vnoise(vec2(t * 0.9, aSeed * 13.0)) - 0.5) * 0.18 + (vnoise(vec2(t * 2.7, aSeed * 7.0)) - 0.5) * 0.08;
  // blowing: flames bow away from her and thrash sideways
  float lateral = sway + blow * ((vnoise(vec2(t * 11.0, aSeed * 5.0)) - 0.5) * 1.6 + 0.35 * sin(aSeed * 40.0));
  float bend = h * h;
  return (-toCam * blow * 1.1 + right * lateral + vec3(0.0, -0.25 * blow, 0.0)) * bend;
}
`;

export function createFlames(bases, { reduced = false } = {}) {
  const N = bases.length;
  const mk = (name, n, size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
  const aBase = mk('aBase', N, 3), aSeed = mk('aSeed', N, 1), aLit = mk('aLit', N, 1), aOut = mk('aOut', N, 1), aEmber = mk('aEmber', N, 1);
  bases.forEach((b, i) => { aBase.setXYZ(i, b.x, b.y, b.z); aSeed.setX(i, Math.random()); });
  for (const a of [aLit, aOut, aEmber]) a.setUsage(THREE.DynamicDrawUsage);

  const uniforms = { uTime: { value: 0 }, uBlow: { value: 0 }, uBlowLocal: { value: 0 }, uGain: { value: 1 } };

  // --- flame quads ---
  const fg = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1, 1, 8);
  plane.translate(0, 0.5, 0);
  fg.index = plane.index;
  fg.setAttribute('position', plane.getAttribute('position'));
  fg.setAttribute('uv', plane.getAttribute('uv'));
  Object.entries({ aBase, aSeed, aLit, aOut, aEmber }).forEach(([k, v]) => fg.setAttribute(k, v));
  fg.instanceCount = N;

  const flameMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      ${COMMON_VS}
      varying vec2 vUv; varying float vLit; varying float vSeed; varying float vBlow;
      void main(){
        vUv = uv; vLit = aLit; vSeed = aSeed;
        vec3 right, toCam; float blow;
        float h = position.y;
        vec3 lean = flameLean(h, right, toCam, blow);
        vBlow = blow;
        float flick = 1.0 + (vnoise(vec2(uTime * 9.0, aSeed * 17.0)) - 0.5) * 0.22 + (vnoise(vec2(uTime * 23.0, aSeed * 3.0)) - 0.5) * 0.12 * (1.0 + blow * 3.0);
        float lit = smoothstep(0.0, 1.0, aLit);
        float H = 0.165 * flick * mix(1.0, 0.62, clamp(blow, 0.0, 1.0)) * (0.25 + 0.75 * lit);
        float W = 0.07 * (0.45 + 0.55 * lit) * (1.0 + 0.3 * clamp(blow, 0.0, 1.0));
        vec3 p = aBase + vec3(0.0, -0.03, 0.0) + right * position.x * W + vec3(0.0, h * H, 0.0) + lean * H * 2.2;
        if (aLit < 0.002) p = aBase; // collapse
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uGain;
      varying vec2 vUv; varying float vLit; varying float vSeed; varying float vBlow;
      ${NOISE}
      void main(){
        float y = vUv.y;
        float n1 = vnoise(vec2(y * 3.0 - uTime * 4.0, vSeed * 13.0));
        float n2 = vnoise(vec2(y * 7.0 - uTime * 9.0, vSeed * 29.0));
        float wob = ((n1 - 0.5) * 0.10 + (n2 - 0.5) * 0.05 * (1.0 + vBlow * 3.0)) * smoothstep(0.15, 0.9, y);
        float x = vUv.x - 0.5 - wob;
        float base = 0.26;
        float tip = 0.96 + (n1 - 0.5) * 0.05;
        float R = 0.17;
        float r;
        if (y < base) { float d = (base - y) / base; r = R * sqrt(max(0.0, 1.0 - d * d)); }
        else { float k = clamp((y - base) / (tip - base), 0.0, 1.0); r = R * pow(1.0 - k, 0.75) * (1.0 + 0.35 * sin(k * 3.1416) * (1.0 - k)); }
        float d = abs(x) / max(r, 1e-4);
        float body = (1.0 - smoothstep(0.55, 1.0, d)) * step(0.001, r);
        float core = (1.0 - smoothstep(0.0, 0.62, d)) * (1.0 - smoothstep(base - 0.06, tip * 0.78, y)) * smoothstep(0.02, 0.16, y);
        float tipFade = 1.0 - smoothstep(0.55, 1.0, y);
        vec3 outer = vec3(1.0, 0.42, 0.10);
        vec3 mid = vec3(1.0, 0.70, 0.30);
        vec3 hot = vec3(1.0, 0.96, 0.84);
        vec3 col = mix(outer, mid, smoothstep(0.95, 0.35, d));
        col = mix(col, hot, core);
        // faint blue at the very base of the flame
        float blue = (1.0 - smoothstep(0.0, 0.16, y)) * smoothstep(0.25, 0.9, d) * body;
        col = mix(col, vec3(0.35, 0.45, 1.0), blue * 0.7);
        float a = body * (0.55 + 0.45 * tipFade) * (0.75 + 0.25 * core);
        a *= smoothstep(0.0, 0.25, vLit);
        gl_FragColor = vec4(col * (1.0 + core * 1.6) * uGain, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const flames = new THREE.Mesh(fg, flameMat);
  flames.frustumCulled = false;
  flames.renderOrder = 10;

  // --- halos & embers ---
  const hg = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  hg.index = quad.index;
  hg.setAttribute('position', quad.getAttribute('position'));
  hg.setAttribute('uv', quad.getAttribute('uv'));
  Object.entries({ aBase, aSeed, aLit, aOut, aEmber }).forEach(([k, v]) => hg.setAttribute(k, v));
  hg.instanceCount = N;
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uHalo: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      ${COMMON_VS}
      uniform float uHalo;
      varying vec2 vUv; varying float vLit; varying float vEmber; varying float vFl;
      void main(){
        vUv = uv; vLit = aLit; vEmber = aEmber;
        vec3 right, toCam; float blow;
        vec3 lean = flameLean(0.6, right, toCam, blow);
        float fl = 0.85 + 0.3 * vnoise(vec2(uTime * 8.0, aSeed * 9.0));
        vFl = fl;
        float lit = aLit;
        float size = max(0.44 * lit * uHalo * fl, aEmber * 0.05);
        vec3 c = aBase + vec3(0.0, 0.05 * lit, 0.0) + lean * 0.1 * lit;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * size;
        if (size < 1e-4) mv = vec4(0.0, 0.0, 2.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain;
      varying vec2 vUv; varying float vLit; varying float vEmber; varying float vFl;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float halo = exp(-d * d * 6.0) * 0.2 + exp(-d * d * 30.0) * 0.32;
        vec3 col = vec3(1.0, 0.58, 0.24) * halo * vLit * vFl;
        float ember = exp(-d * d * 9.0) * vEmber * (1.0 - vLit);
        col += vec3(1.0, 0.36, 0.08) * ember * 2.2;
        gl_FragColor = vec4(col * uGain, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const halos = new THREE.Mesh(hg, haloMat);
  halos.frustumCulled = false;
  halos.renderOrder = 11;

  plane.dispose(); quad.dispose();

  return {
    flames, halos, uniforms, haloUniforms: haloMat.uniforms,
    lit: aLit.array, out: aOut.array, ember: aEmber.array,
    commit() { aLit.needsUpdate = true; aOut.needsUpdate = true; aEmber.needsUpdate = true; },
    update(time, blow) {
      uniforms.uTime.value = time;
      uniforms.uBlow.value = reduced ? blow * 0.6 : blow;
    },
    dispose() { fg.dispose(); hg.dispose(); flameMat.dispose(); haloMat.dispose(); },
  };
}
