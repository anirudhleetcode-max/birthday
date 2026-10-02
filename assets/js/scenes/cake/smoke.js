// Smoke wisps: a CPU-simulated pool of soft billboard puffs (one draw call).
// Each extinguished candle emits a little puff and then a thin curling ribbon.
import * as THREE from 'three';
import { smokeTexture } from './textures.js';

export function createSmoke(max = 480) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage); // size, alpha, rot
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aData', aData);
  geo.instanceCount = 0;
  const tex = smokeTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uColor: { value: new THREE.Color(0.62, 0.6, 0.68) }, uGain: { value: 1 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aData;
      varying vec2 vUv; varying float vA;
      void main(){
        float c = cos(aData.z), s = sin(aData.z);
        vUv = uv;
        vec2 q = mat2(c, -s, s, c) * position.xy;
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        mv.xy += q * aData.x;
        vA = aData.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uGain;
      varying vec2 vUv; varying float vA;
      void main(){
        float a = texture2D(uMap, vUv).a * vA * uGain;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  quad.dispose();

  const P = [];
  for (let i = 0; i < max; i++) P.push({ alive: false });
  let cursor = 0;
  const streams = []; // {pos, t, dur, acc, dir}

  function spawn(pos, o) {
    const p = P[cursor]; cursor = (cursor + 1) % max;
    p.alive = true;
    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0.18; p.vz = o.vz || 0;
    p.age = 0; p.life = o.life || 2.4;
    p.s0 = o.s0 || 0.02; p.s1 = o.s1 || 0.16;
    p.a0 = o.a0 ?? 0.5;
    p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 1.2;
    p.seed = Math.random() * 100;
    p.curl = o.curl ?? 1;
  }

  return {
    mesh,
    // A puff pushed away from the camera (dir), then a curling ribbon.
    extinguish(pos, dir, strength = 1) {
      for (let k = 0; k < 5; k++) {
        spawn(pos, {
          vx: dir.x * (0.15 + Math.random() * 0.2) * strength + (Math.random() - 0.5) * 0.05,
          vy: 0.08 + Math.random() * 0.1,
          vz: dir.z * (0.15 + Math.random() * 0.2) * strength + (Math.random() - 0.5) * 0.05,
          life: 0.9 + Math.random() * 0.5, s0: 0.025, s1: 0.11 + Math.random() * 0.05, a0: 0.14,
        });
      }
      streams.push({ pos: pos.clone(), t: 0, dur: 3.2 + Math.random() * 1.4, acc: 0, dir: dir.clone(), seed: Math.random() * 10 });
    },
    update(dt, time) {
      for (let i = streams.length - 1; i >= 0; i--) {
        const s = streams[i];
        s.t += dt; s.acc += dt;
        const k = s.t / s.dur;
        const every = 0.022 + k * 0.05;
        while (s.acc > every) {
          s.acc -= every;
          // a thin ribbon: tiny, faint puffs in quick succession that curl as they rise
          spawn(s.pos, {
            vx: Math.sin(time * 2.3 + s.seed) * 0.015 + s.dir.x * 0.03, vy: 0.22 + Math.random() * 0.04,
            vz: Math.cos(time * 1.9 + s.seed) * 0.015 + s.dir.z * 0.03,
            life: 2.4 + Math.random() * 0.9, s0: 0.012, s1: 0.06 + Math.random() * 0.04,
            a0: 0.2 * (1 - k) + 0.03, curl: 1.4,
          });
        }
        if (s.t > s.dur) streams.splice(i, 1);
      }
      let n = 0;
      const pa = aPos.array, da = aData.array;
      for (const p of P) {
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) { p.alive = false; continue; }
        const t = p.age / p.life;
        // buoyancy + curling drift that grows as it rises
        const curl = p.curl * (0.08 + t * 0.32);
        p.vx += (Math.sin(p.seed + p.age * 2.6 + p.y * 7.0) * curl - p.vx * 0.9) * dt;
        p.vz += (Math.cos(p.seed * 1.3 + p.age * 2.1 + p.y * 6.0) * curl - p.vz * 0.9) * dt;
        p.vy += (0.05 - p.vy * 0.35) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += p.vr * dt;
        const size = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
        const alpha = p.a0 * Math.min(1, t * 6) * Math.pow(1 - t, 1.6);
        pa[n * 3] = p.x; pa[n * 3 + 1] = p.y; pa[n * 3 + 2] = p.z;
        da[n * 3] = size; da[n * 3 + 1] = alpha; da[n * 3 + 2] = p.rot;
        n++;
      }
      geo.instanceCount = n;
      if (n) { aPos.needsUpdate = true; aData.needsUpdate = true; }
      return n;
    },
    get active() { return streams.length > 0 || geo.instanceCount > 0; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
