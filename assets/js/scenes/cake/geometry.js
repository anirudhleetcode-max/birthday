// Geometry builders for the cake chapter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Profiles are arrays of {r, y, v} ordered bottom → top along the OUTSIDE of
// the surface (lathe convention: faces point outward). Normals are derived
// from the profile tangent; `sharp` duplicates a point so corners stay crisp.
export function profileWithNormals(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dr, dy;
    if (p.sharpIn) { dr = p.r - a.r; dy = p.y - a.y; }
    else if (p.sharpOut) { dr = b.r - p.r; dy = b.y - p.y; }
    else { dr = b.r - a.r; dy = b.y - a.y; }
    const l = Math.hypot(dr, dy) || 1;
    out.push({ r: p.r, y: p.y, v: p.v ?? 0, nr: dy / l, ny: -dr / l });
  }
  return out;
}

// Duplicate a profile point to make a hard crease (normals from each side).
function crease(list, r, y, v) {
  list.push({ r, y, v, sharpIn: true });
  list.push({ r, y, v, sharpOut: true });
}

export function revolve(profile, { phiStart = 0, phiLength = TAU, segments = 64, uScale = 1 } = {}) {
  const n = profile.length, cols = segments + 1;
  const pos = new Float32Array(cols * n * 3), nor = new Float32Array(cols * n * 3), uv = new Float32Array(cols * n * 2);
  for (let i = 0; i < cols; i++) {
    const phi = phiStart + (phiLength * i) / segments;
    const s = Math.sin(phi), c = Math.cos(phi);
    for (let j = 0; j < n; j++) {
      const p = profile[j], k = i * n + j;
      pos[k * 3] = p.r * s; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.r * c;
      nor[k * 3] = p.nr * s; nor[k * 3 + 1] = p.ny; nor[k * 3 + 2] = p.nr * c;
      uv[k * 2] = (phi / TAU) * uScale; uv[k * 2 + 1] = p.v;
    }
  }
  const idx = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = (i + 1) * n + j, c = (i + 1) * n + j + 1, d = i * n + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Fondant body profile: bottom centre → bottom edge → side → rounded top edge → top centre.
// v on the side = y / H; top & bottom sample the plain top row of the side texture.
export function tierProfile(R, H, rc = 0.05) {
  const p = [];
  p.push({ r: 0, y: 0, v: 0.995 });
  crease(p, R, 0, 0);
  const sideSteps = 10;
  for (let i = 1; i <= sideSteps; i++) {
    const y = ((H - rc) * i) / sideSteps;
    p.push({ r: R, y, v: y / H });
  }
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    const r = R - rc + Math.cos(a) * rc, y = H - rc + Math.sin(a) * rc;
    p.push({ r, y, v: Math.min(0.995, y / H) });
  }
  p.push({ r: R * 0.5, y: H, v: 0.995 });
  p.push({ r: 0, y: H, v: 0.995 });
  return profileWithNormals(p);
}

// Closed cross-section polygon (r, y) of a tier, for the cut faces.
export function tierSection(R, H, rc = 0.05) {
  const pts = [[0, 0], [R, 0], [R, H - rc]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push([R - rc + Math.cos(a) * rc, H - rc + Math.sin(a) * rc]);
  }
  pts.push([0, H]);
  return pts;
}

// A planar cut face at angle phi; `outward` is +1 when the solid lies at
// smaller phi (face looks toward increasing phi), -1 otherwise.
export function cutFace(section, R, H, phi, outward) {
  const contour = section.map(([r, y]) => new THREE.Vector2(r, y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const s = Math.sin(phi), c = Math.cos(phi);
  const n = new THREE.Vector3(c, 0, -s).multiplyScalar(outward); // tangent of phi
  const pos = [], uv = [], nor = [];
  for (const [r, y] of section) {
    pos.push(r * s, y, r * c); uv.push(r / R, y / H); nor.push(n.x, n.y, n.z);
  }
  const idx = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (const t of tris) {
    A.fromArray(pos, t[0] * 3); B.fromArray(pos, t[1] * 3); C.fromArray(pos, t[2] * 3);
    const fn = B.clone().sub(A).cross(C.clone().sub(A));
    if (fn.dot(n) >= 0) idx.push(t[0], t[1], t[2]);
    else idx.push(t[0], t[2], t[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// The glossy rim of the gold drip: a thick band hugging the top edge and the
// first L0 of the side, with a rounded lip. Revolved like the tier.
export function dripRimProfile(R, H, rc, { T = 0.016, L0 = 0.05, inset = 0.1, lip = true } = {}) {
  // walk along the fondant surface (top inner → corner → side) and offset outward
  const path = [];
  const steps = 26;
  const sTop = inset, sArc = (Math.PI / 2) * rc, sSide = L0;
  const total = sTop + sArc + sSide;
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * total;
    let r, y, nr, ny;
    if (s <= sTop) { r = R - rc - (sTop - s); y = H; nr = 0; ny = 1; }
    else if (s <= sTop + sArc) {
      const a = Math.PI / 2 - (s - sTop) / rc;
      r = R - rc + Math.cos(a) * rc; y = H - rc + Math.sin(a) * rc; nr = Math.cos(a); ny = Math.sin(a);
    } else { r = R; y = H - rc - (s - sTop - sArc); nr = 1; ny = 0; }
    // thickness: ramps in on the top, swells a little toward the lip
    const tIn = Math.min(1, s / 0.035);
    const th = T * (0.15 + 0.85 * Math.sin(tIn * Math.PI / 2)) * (1 + 0.25 * Math.max(0, (s - sTop - sArc) / Math.max(1e-4, sSide)));
    path.push({ r: r + nr * th, y: y + ny * th, base: { r, y }, th });
  }
  // rounded lip back onto the side (skipped when a drip curtain continues below)
  const last = path[path.length - 1];
  const lipR = last.th;
  if (lip) {
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      path.push({ r: R + Math.cos(a) * lipR, y: last.base.y - Math.sin(a) * lipR * 0.9 });
    }
    path.push({ r: R - 0.002, y: last.base.y - lipR * 0.9 });
  } else {
    path.push({ r: R + lipR, y: last.base.y - 0.004 });
  }
  // inner start tucks into the top surface
  path.unshift({ r: R - rc - inset - 0.002, y: H - 0.002 });
  // order bottom → top (lip first) for outward-facing faces
  path.reverse();
  return profileWithNormals(path.map((p) => ({ r: p.r, y: p.y, v: 0 })));
}

// The drip "curtain": a displaced grid wrapped around the tier side. Its
// thickness is a smooth-max of a band under the rim and round-cone drips; where
// the thickness is zero the surface sinks just inside the fondant, so the depth
// test cuts a clean organic edge. Built per phi-range so a wedge can be lifted.
export function dripCurtain(R, H, rc, drips, { phiStart = 0, phiLength = TAU, step = 0.008, T = 0.011, L0 = 0.022, k = 0.55, maxLen = 0.4 } = {}) {
  const yTop = H - rc;
  const yBot = H - maxLen - 0.03;
  const cols = Math.max(4, Math.ceil((phiLength * R) / step));
  const rows = Math.max(4, Math.ceil((yTop - yBot) / step));
  const wb = T / k; // band edge radius so that the band is exactly T thick
  // p-norm union: zero stays zero, equal values swell a little (a soft fillet)
  const smax = (a, b) => (a <= 0 ? b : b <= 0 ? a : Math.pow(Math.pow(a, 6) + Math.pow(b, 6), 1 / 6));
  // bin drips by angle for quick lookup
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const sorted = drips.map((d) => ({ ...d, yEnd: H - d.len, wB: d.w * 1.22 }));
  for (let i = 0; i <= cols; i++) {
    const phi = phiStart + (phiLength * i) / cols;
    const sn = Math.sin(phi), cs = Math.cos(phi);
    const near = [];
    for (const d of sorted) {
      const x = angDiff(phi, d.phi) * R;
      if (Math.abs(x) < d.wB * 1.6) near.push([d, x]);
    }
    for (let j = 0; j <= rows; j++) {
      const y = yTop - ((yTop - yBot) * j) / rows;
      // band under the rim
      const below = Math.max(0, (yTop - L0) - y);
      let t = k * Math.sqrt(Math.max(0, wb * wb - below * below));
      for (const [d, x] of near) {
        const segTop = yTop, segBot = d.yEnd + d.wB;
        const u = Math.min(1, Math.max(0, (segTop - y) / Math.max(1e-4, segTop - segBot)));
        const yc = segTop - u * (segTop - segBot);
        const rr = d.w + (d.wB - d.w) * Math.pow(u, 3);
        const dist = Math.hypot(x, y - yc);
        const td = k * Math.sqrt(Math.max(0, rr * rr - dist * dist));
        t = smax(t, td);
      }
      const r = t > 0.0004 ? R + t - 0.0012 : R - 0.006;
      const n = (i * (rows + 1) + j) * 3;
      pos[n] = r * sn; pos[n + 1] = y; pos[n + 2] = r * cs;
    }
  }
  const idx = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = (i + 1) * (rows + 1) + j;
      // rows go downward, so (a, a+1, b) faces outward
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Random-but-natural drip layout. Returns [{phi, len, w}] avoiding the wedge seams.
export function layoutDrips(R, { seed = 1, spacing = 0.15, minLen = 0.07, maxLen = 0.26, avoid = [] } = {}) {
  const r = rng(seed);
  const out = [];
  const circ = TAU * R;
  let s = r() * spacing;
  while (s < circ - spacing * 0.5) {
    const phi = s / R;
    const w = 0.02 + r() * 0.026;
    const wa = (w * 1.3) / R;
    const near = avoid.some((a) => Math.abs(angDiff(phi, a)) < wa);
    if (!near) {
      const t = r();
      // mostly short beads with the occasional long, heavy drip
      const len = minLen + (maxLen - minLen) * (t < 0.45 ? t * 0.35 : t < 0.8 ? 0.2 + (t - 0.45) * 1.1 : 0.6 + (t - 0.8) * 2.0);
      out.push({ phi, len, w });
    }
    s += spacing * (0.7 + r() * 0.6);
  }
  return out;
}

export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// A piped star-tip swirl (like a buttercream rosette / kiss). Unit size, base at y=0.
export function rosetteGeometry({ ridges = 8, twist = 2.4, height = 0.85, segU = 48, segV = 14 } = {}) {
  const pos = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    const prof = Math.pow(Math.max(0, 1 - Math.pow(v, 1.7)), 0.55);
    for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * TAU;
      const ridge = 1 + 0.17 * Math.cos(ridges * (u + v * twist)) * (1 - v * 0.6);
      const r = prof * ridge * (1 + 0.06 * Math.sin(u * 2 + v * 3));
      pos.push(Math.cos(u) * r, v * height * (1 - 0.08 * Math.cos(u * 3) * v), Math.sin(u) * r);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + segU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A five-petal sugar flower lying in XZ (facing +Y), unit radius ~1.
export function flowerGeometry() {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const pet = new THREE.SphereGeometry(1, 12, 8);
    pet.scale(0.42, 0.13, 0.56);
    pet.translate(0, 0.08, 0.5);
    pet.rotateX(-0.22);
    pet.rotateY((k / 5) * TAU);
    pet.deleteAttribute('uv');
    parts.push(pet);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}

// 16 alternating straight & wavy sun rays as extrudable shapes (original motif).
export function sunRayShapes({ r0 = 0.3, rStraight = 0.56, rWavy = 0.5, count = 16 } = {}) {
  const shapes = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + Math.PI / 2;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const nrm = new THREE.Vector2(-dir.y, dir.x);
    const P = (along, side) => new THREE.Vector2(dir.x * along + nrm.x * side, dir.y * along + nrm.y * side);
    const s = new THREE.Shape();
    if (i % 2 === 0) {
      // straight ray with gently concave flanks
      const w = 0.05;
      const b1 = P(r0, -w), b2 = P(r0, w), tip = P(rStraight, 0);
      const c1 = P((r0 + rStraight) * 0.5, -w * 0.32), c2 = P((r0 + rStraight) * 0.5, w * 0.32);
      s.moveTo(b1.x, b1.y);
      s.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y);
      s.quadraticCurveTo(c2.x, c2.y, b2.x, b2.y);
      s.lineTo(b1.x, b1.y);
    } else {
      // wavy flame-like ray
      const N = 18, L = rWavy - r0;
      const left = [], right = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const along = r0 + t * L;
        const centre = Math.sin(t * Math.PI * 2.2) * 0.022 * Math.sin(Math.min(1, t * 2) * Math.PI / 2);
        const hw = 0.034 * Math.pow(1 - t, 0.85) + 0.002;
        left.push(P(along, centre - hw)); right.push(P(along, centre + hw));
      }
      s.moveTo(left[0].x, left[0].y);
      for (let k = 1; k <= N; k++) s.lineTo(left[k].x, left[k].y);
      for (let k = N; k >= 0; k--) s.lineTo(right[k].x, right[k].y);
      s.lineTo(left[0].x, left[0].y);
    }
    shapes.push(s);
  }
  return shapes;
}

// Gold cake-stand (lathe), base at y = 0, plate top at y = topY.
export function standGeometry(plateR = 1.42, topY = 0.4) {
  const pts = [
    [0.001, 0], [0.6, 0], [0.63, 0.012], [0.62, 0.03], [0.5, 0.05], [0.33, 0.085], [0.2, 0.13],
    [0.13, 0.18], [0.105, 0.23], [0.15, 0.255], [0.16, 0.27], [0.12, 0.29], [0.1, 0.31],
    [0.2, 0.33], [0.5, 0.348], [plateR - 0.08, 0.356], [plateR - 0.02, 0.36],
    [plateR + 0.012, 0.372], [plateR + 0.02, 0.385], [plateR + 0.012, topY - 0.002], [plateR - 0.02, topY + 0.004],
    [plateR - 0.05, topY], [0.001, topY],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 96);
  return g;
}

// A dessert plate with a raised rim, base at y = 0.
export function plateGeometry(R = 0.62) {
  const pts = [
    [0.001, 0.004], [0.34, 0.004], [0.36, 0], [0.38, 0.006], [0.4, 0.02], [0.5, 0.03], [R - 0.04, 0.048],
    [R, 0.062], [R + 0.008, 0.066], [R + 0.004, 0.072], [R - 0.012, 0.07], [R - 0.06, 0.054],
    [0.44, 0.034], [0.38, 0.026], [0.001, 0.026],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 72);
}

// A simple dessert fork lying flat (along +X), resting on y = 0.
export function forkGeometry() {
  const parts = [];
  const handle = new THREE.CapsuleGeometry(0.012, 0.3, 4, 8);
  handle.rotateZ(Math.PI / 2); handle.scale(1, 0.38, 1.3); handle.translate(-0.18, 0.006, 0);
  parts.push(handle);
  const neck = new THREE.BoxGeometry(0.06, 0.006, 0.03);
  neck.translate(0.0, 0.006, 0); parts.push(neck);
  const head = new THREE.BoxGeometry(0.035, 0.006, 0.062);
  head.translate(0.045, 0.007, 0); parts.push(head);
  for (let k = 0; k < 4; k++) {
    const t = new THREE.CapsuleGeometry(0.0045, 0.075, 2, 6);
    t.rotateZ(Math.PI / 2); t.scale(1, 0.7, 1); t.translate(0.1, 0.008, -0.024 + k * 0.016);
    parts.push(t);
  }
  const nonIndexed = parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; });
  const g = mergeGeometries(nonIndexed, false);
  parts.forEach((p) => p.dispose());
  nonIndexed.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}

// A slim cake knife: blade in the local XY plane (edge along y = 0, tip toward +X),
// handle toward -X. Returns { blade, handle } geometries.
export function knifeGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.62, 0);
  s.quadraticCurveTo(0.74, 0.0, 0.78, 0.035);
  s.quadraticCurveTo(0.7, 0.09, 0.5, 0.1);
  s.lineTo(0.02, 0.105);
  s.quadraticCurveTo(0, 0.105, 0, 0.085);
  s.lineTo(0, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 10 });
  blade.translate(0, 0, -0.002);
  const handle = new THREE.CapsuleGeometry(0.022, 0.26, 4, 12);
  handle.rotateZ(Math.PI / 2);
  handle.scale(1, 1.15, 0.7);
  handle.translate(-0.16, 0.06, 0);
  return { blade, handle };
}
