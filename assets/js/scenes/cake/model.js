// Builds the hero cake: gold stand, two cuttable fondant tiers with gold drips,
// rosettes, pearls, sugar flowers, 20 spiral candles and the sun-plaque topper.
import * as THREE from 'three';
import {
  revolve, tierProfile, tierSection, cutFace, dripRimProfile, dripCurtain, layoutDrips,
  rosetteGeometry, flowerGeometry, sunRayShapes, standGeometry, plateGeometry, forkGeometry, angDiff,
} from './geometry.js';
import {
  spongeTexture, paintedSideTexture, goldLeafSideTextures, candleTexture, candleGlowTexture,
  plaqueTexture, frostingBumpTexture, rng,
} from './textures.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// Physical (clearcoat / sheen / iridescence) only where the GPU can afford it.
const PHYS_ONLY = ['sheen', 'sheenColor', 'sheenRoughness', 'clearcoat', 'clearcoatRoughness', 'iridescence'];
export function pbr(props, physical) {
  if (physical) return new THREE.MeshPhysicalMaterial(props);
  const p = { ...props };
  PHYS_ONLY.forEach((k) => delete p[k]);
  return new THREE.MeshStandardMaterial(p);
}

export const DIM = {
  standTop: 0.4,
  plateR: 1.42,
  t1: { R: 1.12, H: 0.82, rc: 0.055 },
  t2: { R: 0.78, H: 0.68, rc: 0.05 },
  candleRing: 0.56,
  candleCount: 20,
  wedgeAngle: (38 * Math.PI) / 180,
  wedgeCentre: (34 * Math.PI) / 180, // front-right, toward the camera & the plate
  topperLift: 1.08,
  plateAt: new THREE.Vector3(2.5, 0, 0.45), // just out of a phone's frame until the slice is served
};

export function buildCake({ lowPower = false, quality = 2, name = 'Deepu', anisotropy = 4, shadows = false } = {}) {
  const hi = quality >= 2, mid = quality >= 1;
  const root = new THREE.Group();
  root.name = 'cake-root';
  const mats = {};
  const R = rng(2027);

  // ---------- materials ----------
  const gold = pbr({ color: 0xf2c46a, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.15 }, hi);
  const goldDrip = pbr({ color: 0xf7cf72, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }, mid);
  const sponge = spongeTexture(lowPower ? 256 : 512);
  sponge.anisotropy = anisotropy;
  const cutMat = new THREE.MeshStandardMaterial({ map: sponge, roughness: 0.82, metalness: 0 });
  const painted = paintedSideTexture({ W: lowPower ? 1024 : 2048, H: lowPower ? 128 : 256 });
  const leaf = goldLeafSideTextures({ W: lowPower ? 768 : 1536, H: lowPower ? 128 : 256 });
  painted.anisotropy = leaf.map.anisotropy = leaf.mr.anisotropy = anisotropy;
  // the faint scraped-buttercream relief under the fondant (skipped on low tier)
  const bump = lowPower ? null : frostingBumpTexture({ W: mid ? 1024 : 512, H: 256 });
  if (bump) { bump.repeat.set(3, 1); bump.anisotropy = anisotropy; }
  const fondantCommon = {
    color: 0xffffff, roughness: 0.6, metalness: 0,
    ...(bump ? { bumpMap: bump, bumpScale: 0.9 } : {}),
    sheen: 0.55, sheenColor: new THREE.Color(0xf3e9ff), sheenRoughness: 0.45,
    clearcoat: 0.08, clearcoatRoughness: 0.5,
    emissive: new THREE.Color(0x2a1545), emissiveIntensity: 0.0,
  };
  const fondant1 = pbr({ ...fondantCommon, map: painted }, hi);
  const fondant2 = pbr({ ...fondantCommon, map: leaf.map, roughnessMap: leaf.mr, metalnessMap: leaf.mr, metalness: 1, roughness: 1 }, hi);
  const cream = pbr({ color: 0xfbf0e2, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6 }, hi);
  const pearl = pbr({
    color: 0xfff6ef, roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12,
    sheen: 0.6, sheenColor: new THREE.Color(0xffd8f0), iridescence: 0.35,
  }, hi);
  const flowerMat = pbr({ color: 0xffffff, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5 }, hi);
  Object.assign(mats, { gold, goldDrip, cutMat, fondant1, fondant2, cream, pearl, flowerMat });
  gold.userData.env = 2.4; goldDrip.userData.env = 2.6; pearl.userData.env = 1.4;
  fondant1.userData.env = fondant2.userData.env = 0.8; cream.userData.env = 0.8; cutMat.userData.env = 0.6;

  // ---------- stand ----------
  const stand = new THREE.Mesh(standGeometry(DIM.plateR, DIM.standTop), gold);
  stand.name = 'stand';
  root.add(stand);
  // a ring of tiny gold beads on the stand rim
  {
    const n = 120;
    const g = new THREE.SphereGeometry(1, 10, 8);
    const im = new THREE.InstancedMesh(g, gold, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      m.compose(
        new THREE.Vector3(Math.sin(a) * (DIM.plateR + 0.025), 0.372, Math.cos(a) * (DIM.plateR + 0.025)),
        new THREE.Quaternion(), new THREE.Vector3(0.017, 0.017, 0.017));
      im.setMatrixAt(i, m);
    }
    root.add(im);
  }

  // ---------- tiers ----------
  const wA = DIM.wedgeCentre - DIM.wedgeAngle / 2, wB = DIM.wedgeCentre + DIM.wedgeAngle / 2;
  const tiers = [];
  const mk = (cfg) => {
    const { R: Rt, H, rc, baseY, fondant, uScale, seed } = cfg;
    const tier = { group: new THREE.Group(), body: new THREE.Group(), wedge: new THREE.Group(), cutFaces: [], cfg };
    tier.group.position.y = baseY;
    tier.group.add(tier.body, tier.wedge);
    const prof = tierProfile(Rt, H, rc);
    const segFull = lowPower ? 96 : 160;
    const segW = Math.max(8, Math.round((segFull * DIM.wedgeAngle) / TAU) + 4);
    const bodyLen = TAU - DIM.wedgeAngle;
    tier.body.add(new THREE.Mesh(revolve(prof, { phiStart: wB, phiLength: bodyLen, segments: segFull, uScale }), fondant));
    tier.wedge.add(new THREE.Mesh(revolve(prof, { phiStart: wA, phiLength: DIM.wedgeAngle, segments: segW, uScale }), fondant));
    // cut faces (hidden until the knife goes in)
    const sec = tierSection(Rt, H, rc);
    const addCut = (grp, phi, outward) => {
      const m = new THREE.Mesh(cutFace(sec, Rt, H, phi, outward), cutMat);
      m.visible = false;
      grp.add(m); tier.cutFaces.push(m);
    };
    // body spans [wB, wA + 2π]: its face at wB looks toward decreasing phi
    addCut(tier.body, wB, -1);
    addCut(tier.body, wA, +1);
    addCut(tier.wedge, wA, -1);
    addCut(tier.wedge, wB, +1);

    // gold drip rim + drips
    const rimProf = dripRimProfile(Rt, H, rc, { T: 0.011, L0: 0, inset: 0.07, lip: false });
    tier.body.add(new THREE.Mesh(revolve(rimProf, { phiStart: wB, phiLength: bodyLen, segments: segFull }), goldDrip));
    tier.wedge.add(new THREE.Mesh(revolve(rimProf, { phiStart: wA, phiLength: DIM.wedgeAngle, segments: segW }), goldDrip));
    const maxLen = H * 0.42;
    const drips = layoutDrips(Rt, { seed, spacing: 0.1, minLen: 0.07, maxLen, avoid: [wA, wB] });
    const inW = (phi) => angDiff(phi, DIM.wedgeCentre) > -DIM.wedgeAngle / 2 && angDiff(phi, DIM.wedgeCentre) < DIM.wedgeAngle / 2;
    const step = quality >= 2 ? 0.0065 : quality >= 1 ? 0.009 : 0.012;
    tier.body.add(new THREE.Mesh(dripCurtain(Rt, H, rc, drips, { phiStart: wB, phiLength: bodyLen, step, maxLen }), goldDrip));
    tier.wedge.add(new THREE.Mesh(dripCurtain(Rt, H, rc, drips, { phiStart: wA, phiLength: DIM.wedgeAngle, step, maxLen }), goldDrip));
    tier.inWedge = inW;
    tiers.push(tier);
    root.add(tier.group);
    return tier;
  };
  const t1 = mk({ ...DIM.t1, baseY: DIM.standTop, fondant: fondant1, uScale: 1, seed: 5 });
  const t2 = mk({ ...DIM.t2, baseY: DIM.standTop + DIM.t1.H, fondant: fondant2, uScale: 1, seed: 9 });

  // Instanced decorations split between body & wedge groups.
  const scatter = (tier, geo, mat, items, { color } = {}) => {
    const groups = { body: [], wedge: [] };
    for (const it of items) (tier.inWedge(it.phi) ? groups.wedge : groups.body).push(it);
    for (const key of ['body', 'wedge']) {
      const list = groups[key];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        if (color) im.setColorAt(i, it.color);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      tier[key].add(im);
    }
  };

  // rosettes around the bottom tier base (sit on the stand)
  {
    const geo = rosetteGeometry();
    const n = lowPower ? 40 : 48;
    const items = [], dragees = [];
    const Rr = DIM.t1.R + 0.045;
    for (let i = 0; i < n; i++) {
      const phi = ((i + 0.5) / n) * TAU;
      const s = 0.082 + R() * 0.008;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, R() * TAU);
      items.push({ phi, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(phi) * Rr, -0.004, Math.cos(phi) * Rr), q, new THREE.Vector3(s, s * 1.05, s)) });
      const p2 = phi + Math.PI / n;
      dragees.push({ phi: p2, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(p2) * (Rr + 0.045), 0.012, Math.cos(p2) * (Rr + 0.045)), new THREE.Quaternion(), new THREE.Vector3(0.017, 0.017, 0.017)) });
    }
    scatter(t1, geo, cream, items);
    scatter(t1, new THREE.SphereGeometry(1, 10, 8), gold, dragees);
  }
  // pearl border around the top tier base (sits on the bottom tier)
  {
    const n = lowPower ? 72 : 96;
    const items = [];
    const Rr = DIM.t2.R + 0.022;
    for (let i = 0; i < n; i++) {
      const phi = ((i + 0.5) / n) * TAU;
      const s = 0.024 + (i % 2) * 0.004;
      items.push({ phi, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(phi) * Rr, s * 0.85, Math.cos(phi) * Rr), new THREE.Quaternion(), new THREE.Vector3(s, s, s)) });
    }
    scatter(t2, new THREE.SphereGeometry(1, 14, 10), pearl, items);
    // tiny pearl line along the bottom tier base, above the rosettes
    const items2 = [];
    const n2 = lowPower ? 90 : 130;
    for (let i = 0; i < n2; i++) {
      const phi = (i / n2) * TAU;
      items2.push({ phi, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(phi) * (DIM.t1.R + 0.008), 0.118, Math.cos(phi) * (DIM.t1.R + 0.008)), new THREE.Quaternion(), new THREE.Vector3(0.011, 0.011, 0.011)) });
    }
    scatter(t1, new THREE.SphereGeometry(1, 8, 6), pearl, items2);
  }
  // sugar flowers on the top-tier ledge (Rapunzel's braid flowers)
  {
    const geo = flowerGeometry();
    const cols = [new THREE.Color(0xf2a7c3), new THREE.Color(0xf3cf6e), new THREE.Color(0xa9c8f2), new THREE.Color(0xf7c0d6)];
    const n = lowPower ? 14 : 18;
    const items = [], centres = [];
    const Rr = DIM.t2.R + 0.1;
    for (let i = 0; i < n; i++) {
      const phi = ((i + 0.25) / n) * TAU + (R() - 0.5) * 0.08;
      const s = 0.052 + R() * 0.02;
      const out = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
      // tilt outward so the faces read from the camera
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)), 0.75);
      const spin = new THREE.Quaternion().setFromAxisAngle(UP, R() * TAU);
      const q = tilt.multiply(spin);
      const pos = out.clone().multiplyScalar(Rr).setY(0.035);
      items.push({ phi, color: cols[i % cols.length], m: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, s)) });
      const cpos = pos.clone().add(new THREE.Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(s * 0.12));
      centres.push({ phi, m: new THREE.Matrix4().compose(cpos, q, new THREE.Vector3(s * 0.2, s * 0.14, s * 0.2)) });
    }
    scatter(t2, geo, flowerMat, items, { color: true });
    scatter(t2, new THREE.SphereGeometry(1, 10, 8), gold, centres);
  }

  // ---------- candles ----------
  const { map: candleTex, bump: candleBump } = candleTexture();
  const glowTex = candleGlowTexture();
  const candleMat = new THREE.MeshStandardMaterial({
    map: candleTex, bumpMap: candleBump, bumpScale: 1.4, roughness: 0.42, metalness: 0,
    emissive: 0xffffff, emissiveMap: glowTex, emissiveIntensity: 1,
  });
  candleMat.userData.env = 0.9;
  // per-instance wax glow (lit candles glow warm near the top)
  candleMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;');
  };
  mats.candle = candleMat;
  const N = DIM.candleCount;
  const candleGeo = new THREE.CylinderGeometry(0.024, 0.026, 1, 18, 1, false);
  candleGeo.translate(0, 0.5, 0);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  candleGeo.setAttribute('aGlow', glowAttr);
  const candles = new THREE.InstancedMesh(candleGeo, candleMat, N);
  // ivory tapers, every other one a soft blush (a lavender one now and then)
  const tints = [new THREE.Color(1, 1, 1), new THREE.Color(1.0, 0.82, 0.87), new THREE.Color(1, 1, 1), new THREE.Color(0.9, 0.86, 1.0)];
  const wickGeo = new THREE.CylinderGeometry(0.0035, 0.004, 1, 6);
  wickGeo.translate(0, 0.5, 0);
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.9 });
  mats.wick = wickMat;
  const wicks = new THREE.InstancedMesh(wickGeo, wickMat, N);
  const candleInfo = [];
  const topY = DIM.t2.H; // relative to t2 group
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    // start at the front (phi = 0) and go around
    const phi = (i / N) * TAU + 0.07;
    const h = 0.25 + R() * 0.09;
    const x = Math.sin(phi) * DIM.candleRing, z = Math.cos(phi) * DIM.candleRing;
    const tiltAx = new THREE.Vector3(R() - 0.5, 0, R() - 0.5).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(tiltAx, (R() - 0.5) * 0.06);
    const spin = new THREE.Quaternion().setFromAxisAngle(UP, R() * TAU);
    m.compose(new THREE.Vector3(x, topY - 0.015, z), q.clone().multiply(spin), new THREE.Vector3(1, h, 1));
    candles.setMatrixAt(i, m);
    candles.setColorAt(i, tints[i % tints.length]);
    const wickH = 0.028;
    const tipLocal = new THREE.Vector3(0, h + wickH - 0.015, 0).applyQuaternion(q).add(new THREE.Vector3(x, topY, z));
    m.compose(new THREE.Vector3(0, h - 0.016, 0).applyQuaternion(q).add(new THREE.Vector3(x, topY - 0.015, z)), q, new THREE.Vector3(1, wickH + 0.004, 1));
    wicks.setMatrixAt(i, m);
    candleInfo.push({ index: i, phi, height: h, tipLocal, inWedge: t2.inWedge(phi), seed: R() });
  }
  candles.instanceMatrix.needsUpdate = true;
  if (candles.instanceColor) candles.instanceColor.needsUpdate = true;
  wicks.instanceMatrix.needsUpdate = true;
  t2.group.add(candles, wicks);

  // ---------- topper: sun with a white-chocolate plaque at its heart ----------
  const topper = new THREE.Group();
  topper.position.set(0, DIM.t2.H + DIM.topperLift, 0.0);
  t2.group.add(topper);
  const rays = new THREE.ExtrudeGeometry(sunRayShapes(), {
    depth: 0.022, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.007, bevelSegments: 2, curveSegments: 6,
  });
  rays.translate(0, 0, -0.03);
  topper.add(new THREE.Mesh(rays, gold));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.02, 14, 96), gold);
  ring.position.z = 0.005;
  topper.add(ring);
  // small gold dots between the rays
  {
    const n = 16;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), gold, n);
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU + Math.PI / 2;
      im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.37, Math.sin(a) * 0.37, -0.01), new THREE.Quaternion(), new THREE.Vector3(0.013, 0.013, 0.013)));
    }
    topper.add(im);
  }
  const plaqueTex = plaqueTexture({ name, line1: 'Happy 20th' });
  plaqueTex.anisotropy = anisotropy;
  const plaqueSide = pbr({ color: 0xf3e6cf, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }, hi);
  const plaqueFace = pbr({ map: plaqueTex, color: 0xe6dccd, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 }, mid);
  mats.plaqueSide = plaqueSide; mats.plaqueFace = plaqueFace;
  const plaque = new THREE.Group();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 72, 1, true).rotateX(Math.PI / 2), plaqueSide);
  const front = new THREE.Mesh(new THREE.CircleGeometry(0.3, 72), plaqueFace);
  front.position.z = 0.015;
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.3, 72), plaqueSide);
  back.rotation.y = Math.PI; back.position.z = -0.015;
  plaque.add(side, front, back);
  plaque.position.z = 0.012;
  topper.add(plaque);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, DIM.topperLift + 0.12, 10), gold);
  pick.position.set(0, -(DIM.topperLift + 0.12) / 2 + 0.02, -0.02);
  topper.add(pick);
  topper.rotation.x = -0.08;

  // ---------- serving plate + fork on the table ----------
  const porcelain = pbr({ color: 0xf6f0ea, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }, mid);
  mats.porcelain = porcelain;
  porcelain.userData.env = 1.3;
  const plateGroup = new THREE.Group();
  plateGroup.position.copy(DIM.plateAt);
  const plate = new THREE.Mesh(plateGeometry(0.62), porcelain);
  plateGroup.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.626, 0.0055, 8, 96), gold);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.067;
  plateGroup.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.003, 6, 96), gold);
  rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.033;
  plateGroup.add(rim2);
  const fork = new THREE.Mesh(forkGeometry(), gold);
  fork.position.set(0.18, 0.0, 0.8);
  fork.rotation.y = 0.32;
  plateGroup.add(fork);
  root.add(plateGroup);

  // soft shadows from the key light (mid/high tiers): every opaque surface casts
  // and receives; the tiny beads & pearls only cast (no self-shadow acne)
  if (shadows) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = !(o.isInstancedMesh && o.geometry.type === 'SphereGeometry');
    });
    wicks.castShadow = false;
  }

  return {
    root, mats, tiers, t1, t2, candles, wicks, glowAttr, candleInfo, topper, plaque, plateGroup,
    textures: [sponge, painted, leaf.map, leaf.mr, candleTex, candleBump, glowTex, plaqueTex, bump].filter(Boolean),
  };
}
