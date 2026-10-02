// Small CPU-simulated particle systems (one draw call each):
//  - glitter: additive golden sparkles / dust (strand trail, dissolve, wick ignition)
//  - crumbs: tiny lit sponge & frosting crumbs that hop off the knife and settle
import * as THREE from 'three';

export function createGlitter(max = 300) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  quad.dispose();
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage); // size, alpha, hue
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aData', aData);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aData;
      varying vec2 vUv; varying float vA; varying float vHue;
      void main(){
        vUv = uv; vA = aData.y; vHue = aData.z;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        mv.xy += position.xy * aData.x;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain;
      varying vec2 vUv; varying float vA; varying float vHue;
      void main(){
        vec2 q = vUv - 0.5;
        float d = length(q) * 2.0;
        float core = exp(-d * d * 18.0);
        float halo = exp(-d * d * 4.0) * 0.35;
        float cross = (exp(-abs(q.x) * 60.0) * exp(-abs(q.y) * 7.0) + exp(-abs(q.y) * 60.0) * exp(-abs(q.x) * 7.0)) * 0.5;
        vec3 col = mix(vec3(1.0, 0.78, 0.4), vec3(1.0, 0.95, 0.82), vHue);
        gl_FragColor = vec4(col * (core * 1.6 + halo + cross) * vA * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 16;
  const P = Array.from({ length: max }, () => ({ alive: false }));
  let cursor = 0;
  return {
    mesh,
    emit(pos, { vel = null, spread = 0.15, life = 1.2, size = 0.03, up = 0.1, drag = 1.2, gravity = 0, n = 1 } = {}) {
      for (let k = 0; k < n; k++) {
        const p = P[cursor]; cursor = (cursor + 1) % max;
        p.alive = true; p.age = 0; p.life = life * (0.7 + Math.random() * 0.6);
        p.x = pos.x; p.y = pos.y; p.z = pos.z;
        p.vx = (vel ? vel.x : 0) + (Math.random() - 0.5) * spread;
        p.vy = (vel ? vel.y : 0) + (Math.random() - 0.3) * spread + up;
        p.vz = (vel ? vel.z : 0) + (Math.random() - 0.5) * spread;
        p.size = size * (0.5 + Math.random() * 0.9);
        p.hue = Math.random(); p.tw = Math.random() * 20; p.drag = drag; p.g = gravity;
      }
    },
    update(dt, time) {
      let n = 0;
      const pa = aPos.array, da = aData.array;
      for (const p of P) {
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) { p.alive = false; continue; }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k - p.g * dt; p.vz *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const t = p.age / p.life;
        const tw = 0.55 + 0.45 * Math.sin(time * 14 + p.tw);
        pa[n * 3] = p.x; pa[n * 3 + 1] = p.y; pa[n * 3 + 2] = p.z;
        da[n * 3] = p.size * (1 - t * 0.5); da[n * 3 + 1] = Math.min(1, t * 8) * (1 - t) * tw; da[n * 3 + 2] = p.hue;
        n++;
      }
      geo.instanceCount = n;
      if (n) { aPos.needsUpdate = true; aData.needsUpdate = true; }
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

export function createCrumbs(max = 60) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocate instanceColor before the first compile
  mesh.count = 0;
  mesh.frustumCulled = false;
  const cols = [new THREE.Color(0xf6dac6), new THREE.Color(0xf1d0b8), new THREE.Color(0xd9c6f5), new THREE.Color(0xfbf1e4), new THREE.Color(0xe9b25a)];
  const P = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  return {
    mesh, mat,
    // a little burst of crumbs from a point, landing back on `floorY`
    burst(pos, floorY, n = 8, away = null) {
      for (let k = 0; k < n; k++) {
        if (P.length >= max) P.shift();
        const c = cols[Math.floor(Math.random() * cols.length)];
        P.push({
          x: pos.x + (Math.random() - 0.5) * 0.04, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.04,
          vx: (Math.random() - 0.5) * 0.5 + (away ? away.x * 0.25 : 0), vy: 0.5 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.5 + (away ? away.z * 0.25 : 0),
          rx: Math.random() * 6, ry: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
          size: 0.009 + Math.random() * 0.013, floor: floorY, age: 0, life: 2.6 + Math.random(), color: c, rest: false,
        });
      }
    },
    update(dt) {
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.age += dt;
        if (p.age > p.life) { P.splice(i, 1); continue; }
      }
      for (const p of P) {
        if (!p.rest) {
          p.vy -= 3.2 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rx += p.vr * dt; p.ry += p.vr * 0.7 * dt;
          if (p.y <= p.floor + p.size) {
            p.y = p.floor + p.size;
            if (Math.abs(p.vy) > 0.25) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.vr *= 0.5; }
            else p.rest = true;
          }
        }
        const fade = Math.min(1, (p.life - p.age) / 0.6);
        e.set(p.rx, p.ry, 0); q.setFromEuler(e);
        s.setScalar(p.size * fade);
        m.compose(v.set(p.x, p.y, p.z), q, s);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, p.color);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose?.(); },
  };
}
