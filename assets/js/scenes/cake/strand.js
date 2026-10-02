// The golden strand — the film's signature motif: a soft, silky ribbon of warm
// light (a nod to her impossibly long golden hair). Rendered as camera-facing
// ribbons along a pre-sampled spline: one wide soft glow plus three thin fibres
// that twist around the path. Additive, HDR core, no neon edges.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Pre-sample a curve by arc length so the head/trail can be evaluated quickly
// at any frame rate (and the trail is just "the path between two distances").
export class PathSampler {
  constructor(points, { samples = 1600, tension = 0.5 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', tension);
    this.length = curve.getLength();
    this.pts = curve.getSpacedPoints(samples);
    this.n = this.pts.length;
    this.tmp = new THREE.Vector3();
  }
  // position at arc distance s (clamped)
  at(s, out = new THREE.Vector3()) {
    const f = Math.min(1, Math.max(0, s / this.length)) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    return out.lerpVectors(this.pts[i], this.pts[i + 1], f - i);
  }
  tangent(s, out = new THREE.Vector3()) {
    const d = this.length / (this.n - 1);
    this.at(s + d, out);
    return out.sub(this.at(s - d, this.tmp)).normalize();
  }
  // arc distance of the sample closest to p (optionally within [sMin, sMax])
  closest(p, sMin = 0, sMax = Infinity) {
    let best = 0, bd = Infinity;
    const i0 = Math.max(0, Math.floor((sMin / this.length) * (this.n - 1)));
    const i1 = Math.min(this.n - 1, Math.ceil((Math.min(sMax, this.length) / this.length) * (this.n - 1)));
    for (let i = i0; i <= i1; i++) {
      const d = this.pts[i].distanceToSquared(p);
      if (d < bd) { bd = d; best = i; }
    }
    return (best / (this.n - 1)) * this.length;
  }
}

export function createStrand({ segments = 150, fibres = 3 } = {}) {
  const S = fibres + 1; // strip 0 = soft glow
  const N = segments;
  const V = S * N * 2;
  const pos = new Float32Array(V * 3), prev = new Float32Array(V * 3), next = new Float32Array(V * 3);
  const side = new Float32Array(V), au = new Float32Array(V), sid = new Float32Array(V);
  const idx = [];
  for (let s = 0; s < S; s++) {
    for (let i = 0; i < N; i++) {
      const v = (s * N + i) * 2;
      side[v] = -1; side[v + 1] = 1;
      au[v] = au[v + 1] = i / (N - 1);
      sid[v] = sid[v + 1] = s;
      if (i < N - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aPrev = new THREE.BufferAttribute(prev, 3).setUsage(THREE.DynamicDrawUsage);
  const aNext = new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aPrev', aPrev);
  geo.setAttribute('aNext', aNext);
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aU', new THREE.BufferAttribute(au, 1));
  geo.setAttribute('aStrand', new THREE.BufferAttribute(sid, 1));
  geo.setIndex(idx);

  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uRing: { value: 0 }, uWidth: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aU; attribute float aStrand;
      uniform float uTime; uniform float uRing; uniform float uWidth;
      varying float vU; varying float vSide; varying float vStrand;
      void main(){
        mat4 pv = projectionMatrix * modelViewMatrix;
        vec4 c = pv * vec4(position, 1.0);
        vec4 p = pv * vec4(aPrev, 1.0);
        vec4 n = pv * vec4(aNext, 1.0);
        float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
        vec2 sp = p.xy / p.w, sn = n.xy / n.w;
        sp.x *= aspect; sn.x *= aspect;
        vec2 dir = sn - sp;
        float l = length(dir);
        dir = l > 1e-6 ? dir / l : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        nrm.x /= aspect;
        bool glow = aStrand < 0.5;
        float w = glow ? 0.13 : 0.013;
        // tail tapers to nothing, head is rounded; a closed ring is even all round
        float taper = mix(smoothstep(0.0, 0.5, aU) * (1.0 - smoothstep(0.97, 1.0, aU) * 0.6), 1.0, uRing);
        float pulse = glow ? 1.0 : 0.75 + 0.25 * sin(aU * 26.0 + aStrand * 2.1 - uTime * 3.0);
        c.xy += nrm * aSide * w * taper * pulse * uWidth * projectionMatrix[1][1];
        gl_Position = c;
        vU = aU; vSide = aSide; vStrand = aStrand;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uOpacity; uniform float uRing;
      varying float vU; varying float vSide; varying float vStrand;
      void main(){
        bool glow = vStrand < 0.5;
        float across = exp(-vSide * vSide * (glow ? 3.2 : 2.4));
        float along = mix(pow(vU, 1.4), 1.0, uRing);
        float shimmer = 0.78 + 0.22 * sin(vU * 70.0 - uTime * 9.0 + vStrand * 1.7);
        vec3 col = glow ? vec3(1.0, 0.6, 0.22) * 0.42 : vec3(1.0, 0.8, 0.42) * 1.35 * shimmer;
        // the hot head
        col += vec3(1.0, 0.93, 0.75) * pow(vU, 14.0) * (glow ? 0.6 : 2.2) * (1.0 - uRing);
        gl_FragColor = vec4(col * across * along * uOpacity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 15;

  const P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), Q = new THREE.Vector3();
  const pts = Array.from({ length: S * N }, () => new THREE.Vector3());

  return {
    mesh, uniforms,
    // Draw the strand along `path` between arc distances s0 (tail) and s1 (head).
    update(path, s0, s1, time, { wobble = 1 } = {}) {
      uniforms.uTime.value = time;
      for (let s = 0; s < S; s++) {
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          const d = s0 + (s1 - s0) * t;
          path.at(d, P);
          path.tangent(d, T);
          N1.crossVectors(T, UP);
          if (N1.lengthSq() < 1e-6) N1.set(1, 0, 0);
          N1.normalize();
          N2.crossVectors(N1, T).normalize();
          // gentle secondary wobble shared by all fibres (silk in a breeze)
          const w1 = Math.sin(d * 9.0 + time * 2.6) * 0.012 * wobble, w2 = Math.cos(d * 6.0 + time * 1.9) * 0.009 * wobble;
          Q.copy(P).addScaledVector(N1, w1).addScaledVector(N2, w2);
          if (s > 0) {
            // fibres twist around each other, loosening toward the tail
            const a = d * 14.0 + time * 2.2 + (s * Math.PI * 2) / (S - 1);
            const r = 0.009 + 0.022 * (1 - t) * wobble;
            Q.addScaledVector(N1, Math.cos(a) * r).addScaledVector(N2, Math.sin(a) * r);
          }
          pts[s * N + i].copy(Q);
        }
      }
      for (let s = 0; s < S; s++) {
        for (let i = 0; i < N; i++) {
          const k = s * N + i, v = k * 2;
          const c = pts[k], pr = pts[s * N + Math.max(0, i - 1)], nx = pts[s * N + Math.min(N - 1, i + 1)];
          for (const o of [v, v + 1]) {
            pos[o * 3] = c.x; pos[o * 3 + 1] = c.y; pos[o * 3 + 2] = c.z;
            prev[o * 3] = pr.x; prev[o * 3 + 1] = pr.y; prev[o * 3 + 2] = pr.z;
            next[o * 3] = nx.x; next[o * 3 + 1] = nx.y; next[o * 3 + 2] = nx.z;
          }
        }
      }
      aPos.needsUpdate = aPrev.needsUpdate = aNext.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
