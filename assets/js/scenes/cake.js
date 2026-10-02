// Chapter: "Twenty Candles" — an interactive, candle-lit 3D birthday cake.
// A golden strand of light lights the twenty candles; she blows into the mic
// (or taps / swipes the flames) to put them out; then swipes to cut the first
// slice, which is served onto a little gold-rimmed plate.
import * as THREE from 'three';
import { buildCake, DIM } from './cake/model.js';
import { buildEnvironment, buildBackdrop, buildBokeh, buildDust, buildTable } from './cake/room.js';
import { createFlames } from './cake/flames.js';
import { createSmoke } from './cake/smoke.js';
import { createStrand, PathSampler } from './cake/strand.js';
import { createGlitter, createCrumbs } from './cake/particles.js';
import { knifeGeometry } from './cake/geometry.js';
import { BlowDetector } from './cake/blow.js';
import { radialTexture, starTexture } from './cake/textures.js';

const DEFAULT_TEXT = {
  kicker: 'Chapter Seven',
  title: 'Twenty Candles',
  lines: ['Okay… one last thing.', 'Make a wish, Deepu.', 'But first…', 'Twenty candles.'],
  blowHint: 'Now blow — really blow into your phone',
  tapFallback: 'Blow them out',
  afterBlow: 'Whatever you wished for — I hope the universe is already wrapping it.',
  cutHint: 'Now cut it — swipe across the cake',
  afterCut: "First slice is yours. Obviously. It's always yours.",
};

const CSS = /* css */`
.ck-root{position:absolute;inset:0;overflow:hidden;background:#04050d;contain:strict;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.ck-gl{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.ck-trail{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.ck-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 92% at 50% 42%,rgba(3,4,12,0) 30%,rgba(3,4,12,.6) 66%,rgba(2,2,8,.97) 100%);opacity:.5}
.ck-black{position:absolute;inset:0;pointer-events:none;background:#020208;opacity:1}
.ck-ui{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 104px);display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;padding:0 16px}
.ck-btn{pointer-events:auto;appearance:none;-webkit-appearance:none;cursor:pointer;font:500 19px/1.1 "Cormorant Garamond",Georgia,serif;letter-spacing:.02em;color:#fff4dc;padding:15px 28px 15px 26px;border-radius:999px;border:1px solid rgba(244,196,99,.6);background:linear-gradient(180deg,rgba(40,46,104,.8),rgba(16,18,48,.88));box-shadow:0 0 0 1px rgba(255,230,170,.08) inset,0 10px 30px rgba(2,3,12,.6),0 0 28px rgba(244,196,99,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transform:translateY(12px) scale(.98);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease,background .3s ease,padding .4s ease,font-size .4s ease,border-color .4s ease;display:inline-flex;align-items:center;gap:10px;max-width:100%;text-align:center;touch-action:manipulation}
.ck-btn.on{opacity:1;transform:none}
.ck-btn:hover{box-shadow:0 0 0 1px rgba(255,230,170,.16) inset,0 10px 30px rgba(2,3,12,.6),0 0 38px rgba(244,196,99,.38)}
.ck-btn:active{transform:scale(.97)}
.ck-btn .ck-ico{font-size:18px}
.ck-btn.primary.on{animation:ck-breathe 3.2s ease-in-out infinite}
.ck-btn.alt{font:italic 400 17px/1.1 "Cormorant Garamond",Georgia,serif;color:rgba(240,228,255,.9);padding:9px 16px;background:transparent;border-color:rgba(244,196,99,0);box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;text-decoration:underline;text-decoration-color:rgba(244,196,99,.45);text-underline-offset:5px}
.ck-btn.alt .ck-ico{display:none}
.ck-btn.alt.surfaced{font:500 19px/1.1 "Cormorant Garamond",Georgia,serif;color:#fff4dc;padding:15px 28px;text-decoration:none;border-color:rgba(244,196,99,.6);background:linear-gradient(180deg,rgba(40,46,104,.8),rgba(16,18,48,.88));box-shadow:0 0 0 1px rgba(255,230,170,.08) inset,0 10px 30px rgba(2,3,12,.6),0 0 28px rgba(244,196,99,.26)}
.ck-btn.alt.surfaced .ck-ico{display:inline}
.ck-btn:not(.on){pointer-events:none}
.ck-btn.busy.on{opacity:.7;pointer-events:none}
.ck-chip{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 18px);transform:translate(-50%,-8px);display:flex;align-items:center;gap:9px;padding:7px 14px 7px 12px;border-radius:999px;background:rgba(10,12,34,.6);border:1px solid rgba(244,196,99,.35);color:#f6e6c4;font:500 13px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .5s ease,transform .5s ease;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.ck-chip.on{opacity:1;transform:translate(-50%,0)}
.ck-dot{width:7px;height:7px;border-radius:50%;background:#ff7a8a;box-shadow:0 0 10px #ff7a8a;animation:ck-pulse 1.4s ease-in-out infinite}
.ck-bars{display:flex;align-items:flex-end;gap:2px;height:14px}
.ck-bars i{display:block;width:3px;height:3px;border-radius:2px;background:#f4c463;transition:height .08s linear}
@keyframes ck-breathe{0%,100%{box-shadow:0 0 0 1px rgba(255,230,170,.08) inset,0 10px 30px rgba(2,3,12,.6),0 0 22px rgba(244,196,99,.18)}50%{box-shadow:0 0 0 1px rgba(255,230,170,.16) inset,0 10px 30px rgba(2,3,12,.6),0 0 40px rgba(244,196,99,.42)}}
@keyframes ck-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.ck-btn.primary.on,.ck-dot{animation:none}}
`;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const isAbort = (e) => e && (e.name === 'AbortError' || e === 'abort');
const abortErr = () => new DOMException('Scene exited', 'AbortError');

let live = null;

export default {
  id: 'cake',
  title: 'Twenty Candles',
  // Long-running: builds the scene, plays the whole beat, and ends with
  // ui.waitContinue → ctx.next(handoff). Resolves/rejects(AbortError) on exit.
  async enter(ctx, el) {
    if (live) live.destroy();
    const s = new CakeScene(ctx, el);
    live = s;
    try {
      await s.setup();
      await s.run();
    } catch (e) {
      if (isAbort(e) || s.dead) return;
      throw e;
    }
  },
  async exit() {
    const s = live;
    live = null;
    if (s) s.destroy();
  },
};

class CakeScene {
  constructor(ctx, el) {
    this.ctx = ctx;
    this.el = el;
    const t = ctx.text?.cake || {};
    this.T = { ...DEFAULT_TEXT };
    for (const k of Object.keys(DEFAULT_TEXT)) if (t[k] != null && t[k] !== '') this.T[k] = t[k];
    if (!Array.isArray(this.T.lines) || !this.T.lines.length) this.T.lines = DEFAULT_TEXT.lines;
    this.gsap = ctx.gsap || window.gsap;
    const dev = ctx.device || {};
    this.mobile = !!dev.mobile;
    this.low = !!dev.lowPower;
    this.reduced = !!dev.reducedMotion;
    this.dead = false;
    this.ac = new AbortController();
    this.tweens = new Set();
    this.timers = new Set();
    this.handles = new Set(); // ui.hint handles
    this.time = 0;
    this.frames = 0;
    this.phase = 'init';
    // light/state knobs animated by the flow
    this.L = { black: 1, room: 0.32, party: 0, gold: 0, hush: 0, vignette: 0.42, glint: 0, kick: 0, exposure: 1.0 };
    this.cam = { az: -0.24, el: 0.44, distK: 1.55, tx: 0, ty: 0, tz: 0, drift: 1 };
    this.blow = { key: 0, keyDown: false, wave: null, budget: 0, lastOut: -1, value: 0 };
    this.head = null; // golden strand head
    this.headOn = 0;
    this.headPos = new THREE.Vector3();
    this.tick = this.tick.bind(this);
    if (window.__CAKE_DEV__) window.__cake = this;
  }

  // ---------------------------------------------------------------- utils
  get signal() { return this.ctx.signal; }
  guard() { if (this.dead || this.signal?.aborted) throw abortErr(); }
  on(target, type, fn, opts = {}) { target.addEventListener(type, fn, { ...opts, signal: this.ac.signal }); }
  to(target, vars) { const t = this.gsap.to(target, vars); this.tweens.add(t); return t; }
  timeline(vars) { const t = this.gsap.timeline(vars); this.tweens.add(t); return t; }
  later(sec, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.dead) fn(); }, sec * 1000);
    this.timers.add(id);
    return id;
  }
  clearLater(id) { clearTimeout(id); this.timers.delete(id); }
  async wait(sec) {
    if (this.ctx.wait) await this.ctx.wait(sec);
    else await new Promise((res) => this.later(sec, res));
    this.guard();
  }
  sfx(name) { try { this.ctx.audio?.sfx?.(name); } catch (e) { /* ignore */ } }
  mood(m) { try { this.ctx.audio?.setMood?.(m); } catch (e) { /* ignore */ } }
  fx(name, ...args) { try { this.ctx.fx?.[name]?.(...args); } catch (e) { /* ignore */ } }
  async narrate(lines, opts) {
    if (this.ctx.ui?.narrate) await this.ctx.ui.narrate(lines, opts);
    this.guard();
  }
  hint(text) {
    const h = this.ctx.ui?.hint ? this.ctx.ui.hint(text) : null;
    if (!h) return { remove() {} };
    const wrap = { remove: () => { if (!this.handles.has(wrap)) return; this.handles.delete(wrap); try { h.remove(); } catch (e) { /* ignore */ } } };
    this.handles.add(wrap);
    return wrap;
  }

  // ---------------------------------------------------------------- setup
  async setup() {
    const { el } = this;
    const root = document.createElement('div');
    root.className = 'ck-root';
    const style = document.createElement('style');
    style.textContent = CSS;
    const canvas = document.createElement('canvas');
    canvas.className = 'ck-gl';
    canvas.setAttribute('aria-label', 'A birthday cake with twenty candles');
    const trail = document.createElement('canvas');
    trail.className = 'ck-trail';
    const vig = document.createElement('div'); vig.className = 'ck-vig';
    const black = document.createElement('div'); black.className = 'ck-black';
    const ui = document.createElement('div'); ui.className = 'ck-ui';
    const chip = document.createElement('div'); chip.className = 'ck-chip';
    chip.innerHTML = '<span class="ck-dot"></span><span>listening</span><span class="ck-bars"><i></i><i></i><i></i><i></i><i></i></span>';
    root.append(style, canvas, trail, vig, black, chip, ui);
    el.appendChild(root);
    Object.assign(this, { root, canvas, trailCanvas: trail, vigEl: vig, blackEl: black, uiEl: ui, chipEl: chip });
    this.trailCtx = trail.getContext('2d');
    this.bars = [...chip.querySelectorAll('.ck-bars i')];

    // the plaque's script font (loaded by the page); don't wait forever
    try {
      await Promise.race([
        Promise.all([document.fonts.load('120px "Great Vibes"'), document.fonts.load('italic 40px "Cormorant Garamond"')]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* ignore */ }
    this.guard();

    // renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.setPixelRatio(this.pixelRatio());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; // keeps lavender & gold true to colour
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x03040b, 1);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0x05070f, 9, 24);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 120);
    this.camera = camera;

    this.envRT = buildEnvironment(renderer);
    scene.environment = this.envRT.texture;

    // room
    this.quality = this.low ? 0 : this.mobile ? 1 : 2;
    this.backdrop = buildBackdrop();
    scene.add(this.backdrop);
    this.bokeh = buildBokeh({ lowPower: this.low });
    scene.add(this.bokeh.mesh);
    this.dust = buildDust({ count: this.low ? 50 : 90 });
    scene.add(this.dust.mesh);
    this.table = buildTable({ lowPower: this.low, quality: this.quality, anisotropy: aniso });
    scene.add(this.table.group);

    // the cake
    const name = this.ctx.site?.her?.name || 'Deepu';
    this.cake = buildCake({ lowPower: this.low, quality: this.quality, name, anisotropy: aniso });
    scene.add(this.cake.root);
    this.plateShadow = this.table.mkShadow(0.62, DIM.plateAt.x, DIM.plateAt.z, 0.6);

    // a slim cake knife (appears only for the cut)
    const kg = knifeGeometry();
    const steel = new THREE.MeshStandardMaterial({ color: 0xe9e7f2, metalness: 1, roughness: 0.16 });
    steel.userData.env = 2.2;
    this.knife = new THREE.Group();
    this.knife.add(new THREE.Mesh(kg.blade, steel), new THREE.Mesh(kg.handle, this.cake.mats.gold));
    this.knife.visible = false;
    scene.add(this.knife);

    // candles → world flame bases
    const t2y = this.cake.t2.group.position.y;
    this.candles = this.cake.candleInfo.map((c) => ({
      ...c,
      tip: c.tipLocal.clone().add(new THREE.Vector3(0, t2y, 0)),
      target: 0,
      out: false,
    }));
    this.flames = createFlames(this.candles.map((c) => c.tip), { reduced: this.reduced });
    scene.add(this.flames.flames, this.flames.halos);
    this.smoke = createSmoke(this.low ? 260 : 520);
    scene.add(this.smoke.mesh);
    this.glitter = createGlitter(this.low ? 140 : 320);
    scene.add(this.glitter.mesh);
    this.crumbs = createCrumbs(this.low ? 24 : 64);
    scene.add(this.crumbs.mesh);
    this.strand = createStrand({ segments: this.low ? 90 : 150 });
    scene.add(this.strand.mesh);
    this.buildStrandPaths();

    // explicit env maps so metals can take more reflection than fondant
    this.envMats = [];
    const envSeen = new Set();
    scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => {
        if (!m.isMeshStandardMaterial || envSeen.has(m)) return;
        envSeen.add(m);
        m.envMap = this.envRT.texture;
        this.envMats.push([m, m.userData.env ?? 1]);
      });
    });

    // lights: ≤ 2 point lights. They are the candles' warm glow while lit, and
    // become the golden after-glow (behind / below the cake) once they're out.
    this.pl = [new THREE.PointLight(0xffa24f, 0, 0, 2), new THREE.PointLight(0xffb867, 0, 0, 2)];
    this.plCandle = [new THREE.Vector3(-0.2, t2y + DIM.t2.H + 0.36, 0.34), new THREE.Vector3(0.3, t2y + DIM.t2.H + 0.34, -0.08)];
    this.plGold = [new THREE.Vector3(0.1, 1.0, -1.9), new THREE.Vector3(0.5, 0.22, 1.75)];
    this.pl[0].position.copy(this.plCandle[0]);
    this.pl[1].position.copy(this.plCandle[1]);
    this.hemi = new THREE.HemisphereLight(0x5162b0, 0x1c0e08, 0.2);
    this.key = new THREE.SpotLight(0xeee6ff, 0, 0, 0.55, 1, 0);
    this.key.position.set(-3.2, 7.5, 5.5);
    this.key.target.position.set(0, 1.2, 0);
    this.rim = new THREE.DirectionalLight(0x9aa8ff, 0.6);
    this.rim.position.set(1.5, 7, -7);
    this.fill = new THREE.DirectionalLight(0xffc9a0, 0);
    this.fill.position.set(3, 2, 6);
    scene.add(...this.pl, this.hemi, this.key, this.key.target, this.rim, this.fill);
    this.colors = {
      candle0: new THREE.Color(0xffa24f), candle1: new THREE.Color(0xffb867), gold: new THREE.Color(0xffb54a),
      rimCool: new THREE.Color(0x9aa8ff), rimGold: new THREE.Color(0xffc86e),
      groundCool: new THREE.Color(0x1c0e08), groundGold: new THREE.Color(0x6a4010),
    };

    // sprites: strand head & topper glints
    this.glowTex = radialTexture({ size: 128, inner: 'rgba(255,255,255,1)', mid: 'rgba(255,214,140,0.45)', outer: 'rgba(255,170,80,0)', midStop: 0.22 });
    this.starTex = starTexture();
    const sprite = (map, color, size) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.scale.setScalar(size); s.renderOrder = 20;
      scene.add(s); return s;
    };
    this.spark = sprite(this.glowTex, 0xffe2a0, 0.2);
    this.glint = sprite(this.starTex, 0xfff1d0, 0.34);
    this.glint2 = sprite(this.starTex, 0xffe7b0, 0.22);

    // bloom only on capable desktops (half-res, subtle; only HDR flames/strand bloom)
    if (!this.mobile && !this.low) {
      try {
        const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/UnrealBloomPass.js'),
          import('three/addons/postprocessing/OutputPass.js'),
        ]);
        this.guard();
        const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
        const composer = new EffectComposer(renderer, rt);
        composer.addPass(new RenderPass(scene, camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.1);
        composer.addPass(this.bloom);
        composer.addPass(new OutputPass());
        this.composer = composer;
      } catch (e) {
        if (isAbort(e)) throw e;
        this.composer = null;
      }
    }

    // sizing
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.on(window, 'resize', () => this.resize());

    this.bindInput();

    // warm up shaders, then start the loop
    this.updateCamera();
    try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.guard();
  }

  // The strand's journey: a rising spiral around the cake, through every wick,
  // then a closing loop that becomes a halo around the top tier.
  buildStrandPaths() {
    const C = this.candles;
    const top = DIM.standTop + DIM.t1.H + DIM.t2.H;
    const P = (phi, r, y) => new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r);
    const phi0 = C[0].phi, phiL = C[C.length - 1].phi;
    const wick = (c) => c.tip.clone().add(new THREE.Vector3(0, 0.022, 0));
    const pts = [];
    [[-4.5, 1.64, 0.5], [-3.6, 1.52, 0.82], [-2.7, 1.36, 1.16], [-1.8, 1.14, 1.5], [-1.0, 0.88, top - 0.04], [-0.45, 0.68, top + 0.17]]
      .forEach(([d, r, y]) => pts.push(P(phi0 + d, r, y)));
    C.forEach((c) => pts.push(wick(c)));
    pts.push(P(phiL + 0.28, 0.68, top + 0.15), P(phiL + 0.6, 0.86, top + 0.02));
    this.ring = { r: 0.93, y: top - 0.03, phi0: phiL + 1.0 };
    const RING_N = 24;
    for (let k = 0; k <= RING_N; k++) pts.push(P(this.ring.phi0 + (k / RING_N) * TAU, this.ring.r, this.ring.y));
    const path = new PathSampler(pts, { samples: 2600 });
    this.path = path;
    this.candleS = C.map((c) => path.closest(wick(c)));
    this.ringS = path.closest(P(this.ring.phi0, this.ring.r, this.ring.y), this.candleS[C.length - 1], path.length - 1.0);
    // speed profile → time↔distance table (smooth accelerations, no jolts)
    const sA = this.candleS[0], sB = this.candleS[C.length - 1];
    const speed = (s) => {
      let v = 2.5;
      v += (1.4 - 2.5) * smooth(sA - 0.6, sA - 0.05, s);
      v += (3.2 - 1.4) * smooth(sB + 0.05, sB + 0.7, s);
      v *= 0.12 + 0.88 * smooth(0, 1.1, s) ** 0.5;
      v *= 0.1 + 0.9 * smooth(0, 1.8, path.length - s);
      return Math.max(0.05, v);
    };
    this.timeTable = this.integrate(path.length, speed);
    // reduced motion: a quick, soft sweep around the candle ring only
    const sweep = C.map(wick);
    sweep.push(wick(C[0]).clone().lerp(wick(C[1]), 0.5));
    this.sweepPath = new PathSampler(sweep, { samples: 800 });
    this.sweepS = C.map((c) => this.sweepPath.closest(wick(c)));
  }

  integrate(total, speed, steps = 1200) {
    const ts = [0], ss = [0];
    let t = 0;
    for (let i = 1; i <= steps; i++) {
      const s0 = ((i - 1) / steps) * total, s1 = (i / steps) * total;
      t += (s1 - s0) / speed((s0 + s1) / 2);
      ts.push(t); ss.push(s1);
    }
    return {
      T: t,
      at: (time) => {
        if (time <= 0) return 0;
        if (time >= t) return total;
        let lo = 0, hi = ts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] < time) lo = mid; else hi = mid; }
        return ss[lo] + (ss[hi] - ss[lo]) * ((time - ts[lo]) / (ts[hi] - ts[lo]));
      },
    };
  }

  pixelRatio() {
    const devPr = window.__CAKE_DEV__ && +new URLSearchParams(location.search).get('pr');
    return devPr || Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : 2);
  }

  resize() {
    if (this.dead) return;
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    const pr = this.pixelRatio();
    if (this.renderer.getPixelRatio() !== pr) this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    const aspect = w / h;
    const fov = aspect < 0.8 ? 40 : aspect < 1.25 ? 35 : 30;
    const t = Math.tan((fov / 2) * DEG);
    const W = aspect < 0.8 ? 3.25 : 3.4, H = 3.9;
    const dist = Math.max(H / 2 / t, W / 2 / (t * aspect)) * 1.02;
    const vh = 2 * dist * t;
    this.fit = { fov, dist, ty: 1.72 - vh * (aspect < 0.8 ? 0.065 : 0.03), aspect, w, h };
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.trailCanvas.width = Math.round(w * dpr); this.trailCanvas.height = Math.round(h * dpr);
    this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = { w, h };
  }

  // ---------------------------------------------------------------- loop
  tick(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.time += dt;
    this.frames++;
    const t = this.time;

    // --- breath / blow input ---
    const B = this.blow;
    let mic = 0, micLevel = 0;
    if (this.det) { mic = this.det.update(dt); micLevel = this.det.level; }
    B.key += ((B.keyDown ? 0.85 : 0) - B.key) * Math.min(1, dt * (B.keyDown ? 6 : 5));
    let wave = 0;
    if (B.wave) {
      B.wave.t += dt;
      const k = B.wave.t / B.wave.dur;
      wave = k < 1 ? Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.1)), 0.6) : 0;
      if (k >= 1.1) B.wave = null;
    }
    const gust = (B.gustUntil || 0) > t ? 0.6 : 0;
    const blowing = Math.max(mic, B.key, wave);
    B.value = blowing;
    // flames react to her breath even before any candle goes out
    const disturb = Math.max(blowing, gust, micLevel * 0.55);
    if (this.phase === 'blow' && blowing > 0.05) {
      const rate = B.wave ? DIM.candleCount / (B.wave.dur * 0.75) : 2.2 + 5.5 * blowing;
      B.budget += dt * rate;
      while (B.budget >= 1 && this.litCount() > 0) { B.budget -= 1; this.extinguishNext(blowing); }
    } else B.budget = Math.min(B.budget, 0.6);
    if (this.det && this.chipEl.classList.contains('on')) this.updateBars(Math.max(micLevel, mic));
    if (this.det && this.phase === 'blow' && this.det.state === 'listening' && !this.fallbackShown && this.det.listenT > 12 && this.det.lastHeard === 0) this.surfaceFallback();

    // --- golden strand ---
    if (this.head) this.updateStrand(dt, t);

    // --- candles ---
    const F = this.flames;
    let litSum = 0;
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const cur = F.lit[i];
      const k = c.target > cur ? 5 : (c.target < 1 && cur > c.target ? 11 : 3.5);
      F.lit[i] = cur + (c.target - cur) * Math.min(1, dt * k);
      if (F.lit[i] < 0.003 && c.target === 0) F.lit[i] = 0;
      F.out[i] = Math.max(0, F.out[i] - dt * 2.2);
      F.ember[i] = Math.max(0, F.ember[i] - dt * 0.45);
      litSum += Math.min(1, F.lit[i]);
      this.cake.glowAttr.array[i] = Math.min(1.2, F.lit[i]) * (0.85 + 0.15 * Math.sin(t * 9 + i)) + F.ember[i] * 0.25;
    }
    this.cake.glowAttr.needsUpdate = true;
    F.commit();
    F.update(t, disturb);
    const frac = litSum / this.candles.length;
    this.frac = frac;

    // --- light rig ---
    const L = this.L, C = this.colors;
    const flick = 1 + 0.07 * Math.sin(t * 13.3) + 0.05 * Math.sin(t * 7.1 + 1.3) + 0.04 * Math.sin(t * 23.7) + disturb * 0.22 * Math.sin(t * 31.0);
    const g = L.gold, kick = L.kick;
    const cl = 1.6 * frac * flick;
    if (g > 0.001) {
      this.pl[0].position.copy(this.plGold[0]); this.pl[1].position.copy(this.plGold[1]);
      this.pl[0].color.copy(C.gold); this.pl[1].color.copy(C.gold);
    } else {
      this.pl[0].position.copy(this.plCandle[0]); this.pl[1].position.copy(this.plCandle[1]);
      this.pl[0].color.copy(C.candle0); this.pl[1].color.copy(C.candle1);
    }
    this.pl[0].intensity = cl + g * 7.5 * (1 + 0.8 * kick);
    this.pl[1].intensity = cl * 0.85 * (1 + 0.05 * Math.sin(t * 17.0)) + g * 2.4 * (1 + kick);
    if (this.head && this.headOn > 0.01) {
      // the strand carries its own little warm light as it travels
      this.pl[1].position.copy(this.headPos);
      this.pl[1].color.copy(C.gold);
      this.pl[1].intensity += 0.55 * this.headOn;
    }
    const hush = L.hush;
    this.hemi.intensity = (0.32 * L.room + 0.14 * L.party) * (1 - 0.35 * hush);
    this.hemi.groundColor.copy(C.groundCool).lerp(C.groundGold, g);
    this.key.intensity = (1.0 + 1.2 * frac) * L.room * (1 - 0.45 * L.party) + 0.85 * L.party + 0.4 * kick;
    this.rim.intensity = 0.75 * L.room + 1.1 * g;
    this.rim.color.copy(C.rimCool).lerp(C.rimGold, g);
    this.fill.intensity = 0.35 * frac * L.room + 0.28 * L.party;
    const envLevel = 0.06 + 0.22 * L.room * (1 - 0.4 * L.party) + 0.5 * frac * (0.9 + 0.1 * flick) + 0.32 * g + 0.15 * L.party + 0.2 * kick;
    for (const [m, k] of this.envMats) m.envMapIntensity = envLevel * k;
    this.bokeh.uniforms.uTime.value = t;
    this.bokeh.uniforms.uBright.value = (0.1 + 0.75 * L.room + 0.45 * L.party + 0.25 * g) * (1 - 0.6 * hush);
    this.dust.uniforms.uTime.value = t;
    this.dust.uniforms.uBright.value = 0.15 + 0.8 * frac + 0.6 * g;
    this.backdrop.material.uniforms.uRoom.value = (0.25 + 0.6 * L.room + 0.4 * L.party) * (1 - 0.55 * hush);
    this.backdrop.material.uniforms.uWarm.value = g * (1 + 0.5 * kick);
    this.table.pool.material.opacity = 0.32 * frac * flick + 0.3 * g;
    if (this.bloom) this.bloom.strength = 0.35 + 0.45 * kick;
    this.renderer.toneMappingExposure = L.exposure + 0.06 * kick;
    this.blackEl.style.opacity = L.black.toFixed(3);
    this.vigEl.style.opacity = clamp(L.vignette + 0.5 * hush, 0, 1).toFixed(3);

    // glints on the sun topper (the last light in the darkness beat)
    const tp = this.cake.topper;
    tp.updateWorldMatrix(true, false);
    this.glint.position.set(-0.21, 0.22, 0.05).applyMatrix4(tp.matrixWorld);
    this.glint2.position.set(0.3, -0.06, 0.05).applyMatrix4(tp.matrixWorld);
    this.glint.material.opacity = L.glint * (0.6 + 0.4 * Math.sin(t * 2.3));
    this.glint.material.rotation = t * 0.25;
    this.glint2.material.opacity = L.glint * (0.5 + 0.5 * Math.sin(t * 1.7 + 2)) * 0.8;
    this.glint2.material.rotation = -t * 0.3;

    // particles
    this.smoke.update(dt, t);
    this.glitter.update(dt, t);
    this.crumbs.update(dt);

    // knife trail
    this.drawTrail(now);

    this.updateCamera();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  updateCamera() {
    const c = this.cam, f = this.fit;
    if (!f) return;
    const drift = this.reduced ? 0 : c.drift;
    const t = this.time;
    const az = c.az + Math.sin(t * 0.09) * 0.045 * drift;
    const el = c.el + Math.sin(t * 0.067 + 1.0) * 0.012 * drift;
    const d = f.dist * c.distK;
    const tx = c.tx, ty = f.ty + c.ty, tz = c.tz;
    this.camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(tx, ty, tz);
  }

  // world → client (viewport) coordinates, for ctx.fx and hit-testing
  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, z: p.z };
  }

  // ---------------------------------------------------------------- flow
  async run() {
    const jump = window.__CAKE_DEV__ && new URLSearchParams(location.search).get('jump');
    if (jump) return this.devJump(jump);
    const { ctx, T } = this;
    if (ctx.ui?.chapterCard) await ctx.ui.chapterCard(T.kicker, T.title);
    this.guard();
    this.mood('tender');
    this.reveal();
    await this.wait(this.reduced ? 1.2 : 2.0);
    await this.openingLines();
    await this.blowPhase();
    await this.afterglow();
    await this.cutPhase();
    await this.narrate([T.afterCut]);
    if (ctx.ui?.waitContinue) await ctx.ui.waitContinue('Continue');
    this.guard();
    this.phase = 'done';
    // the next transition's light comes from the first slice
    const W = this.cake.t2.wedge;
    W.updateWorldMatrix(true, false);
    const p = this.toScreen(new THREE.Vector3().setFromMatrixPosition(W.matrixWorld).add(new THREE.Vector3(0, 0.35, 0)));
    ctx.next?.({ x: Math.round(p.x), y: Math.round(p.y), color: '#ffd98a', kind: 'ember' });
  }

  reveal() {
    this.phase = 'reveal';
    const dur = this.reduced ? 2.2 : 5.6;
    this.to(this.L, { black: 0, duration: this.reduced ? 1.6 : 2.8, ease: 'power2.inOut' });
    this.to(this.L, { room: 0.45, duration: dur, ease: 'sine.inOut' });
    if (this.reduced) Object.assign(this.cam, { az: 0, el: 0.27, distK: 1.0 });
    else this.to(this.cam, { az: 0, el: 0.27, distK: 1.0, duration: dur, ease: 'power3.inOut' });
  }

  // "Okay… one last thing." … "Twenty candles." — the room closes in around the
  // cake line by line (the cake stays lit); the last line sets the strand off.
  async openingLines() {
    this.phase = 'wish';
    const lines = this.T.lines.filter(Boolean);
    const n = lines.length;
    const holds = [2.3, 2.2, 2.0, 2.6];
    let ignition = null;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      this.to(this.L, { hush: Math.min(0.85, 0.25 + (0.6 * (i + 1)) / n), duration: 2.6, ease: 'sine.inOut' });
      if (!this.reduced) this.to(this.cam, { distK: 1.0 - 0.02 * (i + 1), duration: 3.2, ease: 'sine.inOut' });
      if (last) ignition = this.wait(0.7).then(() => this.ignite());
      await this.narrate([lines[i]], { hold: holds[Math.min(i, holds.length - 1)] + (lines[i].length > 18 ? 0.2 : 0), gap: last ? 0.6 : 0.8 });
      if (!last) await this.wait(0.3);
    }
    if (!ignition) ignition = this.ignite();
    await ignition;
    this.guard();
  }

  // ---- golden strand ignition
  async ignite() {
    this.phase = 'ignite';
    const red = this.reduced;
    const path = red ? this.sweepPath : this.path;
    this.headPath = path;
    this.headS = red ? this.sweepS : this.candleS;
    this.headOn = 0;
    this.head = { tau: 0, s: 0, L: red ? 0.9 : 1.2, emitAcc: 0 };
    this.strand.uniforms.uRing.value = 0;
    this.strand.uniforms.uOpacity.value = 0;
    this.to(this.strand.uniforms.uOpacity, { value: 1, duration: 0.5 });
    this.to(this.spark.material, { opacity: 1, duration: 0.5 });
    this.to(this, { headOn: 1, duration: 0.6 });
    this.sfx('magic');
    const T = red ? 1.8 : this.timeTable.T;
    await this.to(this.head, { tau: T, duration: T, ease: red ? 'sine.inOut' : 'none' });
    this.guard();
    // make sure every wick is lit
    this.candles.forEach((c, i) => { if (!c.target) this.lightCandle(i); });
    if (!red) {
      // the strand has closed into a halo around the top tier — hold, then dust
      this.sfx('shimmer');
      this.to(this.strand.uniforms.uRing, { value: 1, duration: 0.45 });
      this.to(this.spark.material, { opacity: 0, duration: 0.45 });
      this.to(this, { headOn: 0, duration: 0.6 });
      await this.wait(1.0);
      const P = new THREE.Vector3();
      for (let s = this.ringS; s < path.length; s += this.low ? 0.09 : 0.045) {
        path.at(s, P);
        const out = new THREE.Vector3(P.x, 0, P.z).normalize().multiplyScalar(0.12);
        this.glitter.emit(P, { vel: out, spread: 0.12, up: 0.08, life: 1.9, size: 0.035, drag: 1.4, gravity: -0.03 });
      }
    } else {
      this.to(this.spark.material, { opacity: 0, duration: 0.4 });
      this.to(this, { headOn: 0, duration: 0.4 });
    }
    this.to(this.strand.uniforms.uOpacity, { value: 0, duration: red ? 0.4 : 0.8, onComplete: () => { this.head = null; } });
    // …and all twenty flames swell together
    this.candles.forEach((c, i) => { c.target = 1; this.flames.lit[i] = Math.max(this.flames.lit[i], red ? 1.25 : 1.6); });
    this.sfx('sparkle');
    this.to(this.L, { hush: 0.6, duration: 2.2, ease: 'sine.inOut' });
    await this.wait(red ? 0.8 : 1.5);
  }

  updateStrand(dt, t) {
    const h = this.head;
    const path = this.headPath;
    const red = this.reduced;
    h.s = red ? (h.tau / 1.8) * path.length : this.timeTable.at(h.tau);
    let Ltr = h.L;
    if (!red) {
      const ringLen = path.length - this.ringS;
      Ltr = h.L + (ringLen - h.L) * smooth(this.ringS + ringLen * 0.15, path.length, h.s);
    }
    const s0 = Math.max(0, h.s - Ltr);
    const wob = red ? 0.4 : 1 - 0.7 * this.strand.uniforms.uRing.value;
    this.strand.update(path, s0, h.s, t, { wobble: wob });
    path.at(h.s, this.headPos);
    this.spark.position.copy(this.headPos);
    this.spark.scale.setScalar(0.18 + 0.04 * Math.sin(t * 17) + 0.02 * Math.sin(t * 31));
    // light wicks as the strand passes them
    this.headS.forEach((sc, i) => { if (!this.candles[i].target && h.s >= sc) this.lightCandle(i, i); });
    // a few sparkles shed from the head
    if (this.headOn > 0.2 && h.s < path.length - 0.01) {
      h.emitAcc += dt * (this.low ? 22 : 45);
      while (h.emitAcc >= 1) {
        h.emitAcc -= 1;
        this.glitter.emit(this.headPos, { spread: 0.18, up: -0.02, life: 0.9, size: 0.022, drag: 2.0, gravity: 0.05 });
      }
    }
  }

  lightCandle(i, k = 0) {
    const c = this.candles[i];
    if (c.target) return;
    c.target = 1;
    this.flames.lit[i] = Math.max(this.flames.lit[i], 1.4);
    this.glitter.emit(c.tip, { n: this.low ? 2 : 5, spread: 0.25, up: 0.12, life: 0.8, size: 0.025, drag: 2.5 });
    if (k % 4 === 0) this.sfx('sparkle');
  }

  litCount() { return this.candles.reduce((n, c) => n + (c.out ? 0 : 1), 0); }

  // --------------------------------------------------------- blowing
  async blowPhase() {
    this.phase = 'blow';
    this.canvas.style.touchAction = 'none';
    const done = new Promise((res) => { this.onAllOut = res; });
    this.buildBlowUI();
    await done;
    this.guard();
  }

  buildBlowUI() {
    const ui = this.uiEl;
    ui.innerHTML = '';
    const supported = BlowDetector.supported();
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'ck-btn primary';
    primary.innerHTML = '<span class="ck-ico" aria-hidden="true">🎤</span><span>Blow with your breath</span>';
    const alt = document.createElement('button');
    alt.type = 'button';
    alt.className = 'ck-btn alt';
    alt.innerHTML = '<span class="ck-ico" aria-hidden="true">🌬️</span><span></span>';
    alt.lastChild.textContent = this.T.tapFallback;
    this.micBtn = primary; this.altBtn = alt;
    if (supported) ui.append(primary);
    ui.append(alt);
    this.on(primary, 'click', (e) => { e.stopPropagation(); this.startMic(); });
    this.on(alt, 'click', (e) => { e.stopPropagation(); this.startWave(); });
    requestAnimationFrame(() => {
      if (this.dead) return;
      primary.classList.add('on');
      alt.classList.add('on');
      if (!supported) this.surfaceFallback(true);
    });
  }

  async startMic() {
    if (this.det || this.phase !== 'blow') return;
    const det = new BlowDetector({ sharedContext: this.ctx.audio?.context || null });
    this.det = det;
    this.micBtn.classList.add('busy');
    this.fallbackShown = false;
    const slow = this.later(12, () => this.surfaceFallback()); // permission prompt left hanging
    try {
      await det.start(this.signal); // getUserMedia is invoked synchronously inside this tap
    } catch (e) {
      this.clearLater(slow);
      det.stop();
      if (this.det === det) this.det = null;
      if (this.dead || isAbort(e)) return;
      console.warn('[cake] microphone unavailable:', e?.name || e);
      this.micBtn.classList.remove('on', 'busy');
      this.surfaceFallback(true);
      return;
    }
    this.clearLater(slow);
    if (this.dead || this.phase !== 'blow') { det.stop(); return; }
    this.mood('hush');
    this.micBtn.classList.remove('on', 'busy');
    if (!this.fallbackShown) this.altBtn.classList.remove('on');
    this.chipEl.classList.add('on');
    this.blowHintH?.remove();
    this.blowHintH = this.hint(this.T.blowHint);
  }

  // gently bring the one-tap "Blow them out" button forward
  surfaceFallback(force = false) {
    if (this.phase !== 'blow' || (this.fallbackShown && !force)) return;
    this.fallbackShown = true;
    this.altBtn.classList.add('surfaced', 'on');
    if (!this.det) this.micBtn.classList.remove('on');
  }

  startWave() {
    if (this.phase !== 'blow' || this.blow.wave) return;
    this.sfx('blow');
    this.blow.wave = { t: 0, dur: this.reduced ? 1.6 : 2.2 };
    this.altBtn.classList.remove('on');
    this.micBtn?.classList.remove('on');
  }

  extinguishNext(strength) {
    const cam = this.camera.position;
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      if (c.out) continue;
      const d = c.tip.distanceTo(cam) + (c.seed - 0.5) * 0.12;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) this.extinguish(best, strength);
  }

  extinguish(i, strength = 0.7) {
    const c = this.candles[i];
    if (c.out || !c.target) return;
    c.out = true;
    c.target = 0;
    this.flames.out[i] = 1;
    this.flames.ember[i] = 1;
    const away = c.tip.clone().sub(this.camera.position).setY(0).normalize();
    this.smoke.extinguish(c.tip.clone().add(new THREE.Vector3(0, 0.03, 0)), away, 0.6 + strength * 0.6);
    if (this.time - this.blow.lastOut > 0.07) { this.sfx('candleOut'); this.blow.lastOut = this.time; }
    if (this.litCount() === 0) this.allOut();
  }

  allOut() {
    if (this.phase !== 'blow') return;
    this.phase = 'dark';
    this.canvas.style.touchAction = '';
    this.blowHintH?.remove();
    this.blowHintH = null;
    if (this.det) { this.det.stop(); this.det = null; }
    this.chipEl.classList.remove('on');
    this.blow.keyDown = false;
    [...this.uiEl.children].forEach((b) => b.classList.remove('on'));
    this.later(0.8, () => { if (this.uiEl) this.uiEl.innerHTML = ''; });
    const res = this.onAllOut; this.onAllOut = null;
    this.later(0.35, () => res && res());
  }

  updateBars(v) {
    const n = this.bars.length;
    this.bars.forEach((b, i) => {
      const k = clamp(v * 1.4 - (i / n) * 0.6 + Math.sin(this.time * 20 + i * 1.7) * 0.05 * v, 0, 1);
      b.style.height = `${3 + k * 11}px`;
    });
  }

  // --------------------------------------------------------- after-glow & celebration
  async afterglow() {
    const { T } = this;
    const red = this.reduced;
    this.phase = 'dark';
    // a beat of near-darkness: only smoke curling up and the sun topper's glint
    try { this.ctx.audio?.duck?.(0.35, 2.5); } catch (e) { /* ignore */ }
    this.to(this.L, { room: 0.03, hush: 0.9, duration: 0.9, ease: 'power2.out' });
    this.to(this.L, { glint: 1, duration: 0.8, delay: 0.3 });
    await this.wait(red ? 0.9 : 1.5);
    // warm golden light rises from behind & below; the cake turns softly golden
    try { this.ctx.grade?.('golden'); } catch (e) { /* ignore */ }
    this.to(this.L, { gold: 1, duration: red ? 1.0 : 2.2, ease: 'sine.inOut' });
    this.to(this.L, { room: 0.35, hush: 0.55, duration: red ? 1.0 : 2.0, ease: 'sine.inOut' });
    await this.wait(red ? 0.6 : 1.1);
    this.fx('flash', { color: '#ffe3a3', duration: 0.6 });
    this.phase = 'party';
    this.to(this.L, { party: 1, room: 0.75, hush: 0.12, glint: 0, duration: red ? 0.6 : 1.4, ease: 'power2.out' });
    this.mood('festive');
    try { Promise.resolve(this.ctx.audio?.happyBirthday?.()).catch(() => {}); } catch (e) { /* ignore */ }
    this.fx('cannons');
    const top = this.toScreen(new THREE.Vector3(0, 2.3, 0));
    const { w, h } = this.size;
    const size = Math.min(w, h) * 0.42;
    const bursts = [
      [-0.28, -0.06, ['#f2a7c3', '#ffd1e1', '#f4c463']],
      [0.3, -0.1, ['#f4c463', '#ffe3a3', '#fff4dc']],
      [0.0, -0.22, ['#c7b2ec', '#f4c463', '#f2a7c3']],
    ];
    bursts.forEach(([dx, dy, colors], k) => this.later(0.15 + k * (red ? 0.15 : 0.32), () => {
      this.fx('colorBurst', { x: top.x + dx * w, y: top.y + dy * h, colors, size });
    }));
    const sparkleAt = (v, n) => { const p = this.toScreen(v); this.fx('sparkle', p.x, p.y, n); };
    this.later(0.4, () => sparkleAt(new THREE.Vector3(0, 2.9, 0.05), red ? 10 : 24));
    this.later(0.9, () => sparkleAt(new THREE.Vector3(-0.6, 2.2, 0.4), 14));
    this.later(1.3, () => sparkleAt(new THREE.Vector3(0.6, 2.1, 0.4), 14));
    this.sfx('swell');
    await this.wait(red ? 0.8 : 1.4);
    await this.narrate([T.afterBlow]);
  }

  // --------------------------------------------------------- cutting
  async cutPhase() {
    this.phase = 'cut';
    this.canvas.style.touchAction = 'none';
    const h = this.hint(this.T.cutHint);
    const done = new Promise((res) => { this.onCut = res; });
    this.autoCutTimer = this.later(20, () => this.autoCut());
    if (!this.reduced) this.to(this.cam, { distK: 0.92, el: 0.3, duration: 2.5, ease: 'sine.inOut' });
    await done;
    h.remove();
    this.guard();
  }

  cakeRect() {
    const pts = [];
    for (const tier of [DIM.t1, DIM.t2]) {
      const base = tier === DIM.t1 ? DIM.standTop : DIM.standTop + DIM.t1.H;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        for (const y of [base, base + tier.H]) pts.push(this.toScreen(new THREE.Vector3(Math.sin(a) * tier.R, y, Math.cos(a) * tier.R)));
      }
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  // length of segment a→b inside rect r (Liang–Barsky clip)
  static clipLen(a, b, r) {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy], q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return 0; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; }
      else { if (t < t0) return 0; if (t < t1) t1 = t; }
    }
    return Math.hypot(dx, dy) * Math.max(0, t1 - t0);
  }

  autoCut() {
    if (this.phase !== 'cut' || this.cutting) return;
    // nobody swiped: the knife does it for her, gently
    const r = this.cakeRect();
    const y = r.y0 + (r.y1 - r.y0) * 0.38;
    const a = { x: r.x0 - 30, y: y - 20 }, b = { x: r.x1 + 30, y: y + 26 };
    const proxy = { t: 0 };
    this.trail = [];
    this.to(proxy, {
      t: 1, duration: 0.5, ease: 'power2.inOut',
      onUpdate: () => this.trail.push({ x: a.x + (b.x - a.x) * proxy.t, y: a.y + (b.y - a.y) * proxy.t, t: performance.now() }),
      onComplete: () => this.cut(),
    });
  }

  cut() {
    if (this.cutting || this.phase !== 'cut') return;
    this.cutting = true;
    this.phase = 'serving';
    this.clearLater(this.autoCutTimer);
    this.canvas.style.touchAction = '';
    this.sfx('whoosh');
    this.serve().then(() => { const r = this.onCut; this.onCut = null; r && r(); }).catch((e) => { if (!isAbort(e) && !this.dead) console.error('[cake]', e); });
  }

  // place the knife with its blade in the vertical plane of the cut at angle phi
  placeKnife(phi, edgeY) {
    const d = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    const x = d.clone().negate();
    const z = new THREE.Vector3().crossVectors(x, UP);
    this.knife.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, UP, z));
    this.knife.position.copy(d.multiplyScalar(0.98)).setY(edgeY);
  }

  async slice(phi, top, depth) {
    const red = this.reduced;
    const p = { y: top + 0.45 };
    this.placeKnife(phi, p.y);
    let crumbed = false;
    const side = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
    await this.to(p, {
      y: top - depth, duration: red ? 0.2 : 0.3, ease: 'power2.in',
      onUpdate: () => {
        this.placeKnife(phi, p.y);
        if (!crumbed && p.y < top + 0.01) {
          crumbed = true;
          // crumbs & frosting flecks hop off along the cut line
          for (let r = 0.18; r <= DIM.t2.R; r += this.low ? 0.2 : 0.11) {
            const at = new THREE.Vector3(Math.sin(phi) * r, top + 0.01, Math.cos(phi) * r);
            this.crumbs.burst(at, top, this.low ? 1 : 2, side);
          }
          this.crumbs.burst(new THREE.Vector3(Math.sin(phi) * (DIM.t2.R + 0.03), top - 0.05, Math.cos(phi) * (DIM.t2.R + 0.03)), DIM.standTop + DIM.t1.H, this.low ? 2 : 5);
        }
      },
    });
    this.guard();
    await this.wait(red ? 0.04 : 0.08);
    await this.to(p, { y: top + 0.45, duration: red ? 0.18 : 0.26, ease: 'power2.out', onUpdate: () => this.placeKnife(phi, p.y) });
    this.guard();
  }

  async serve() {
    const tier = this.cake.t2;
    const W = tier.wedge;
    const red = this.reduced;
    const top = tier.group.position.y + DIM.t2.H;
    const wA = DIM.wedgeCentre - DIM.wedgeAngle / 2, wB = DIM.wedgeCentre + DIM.wedgeAngle / 2;
    // a subtle push-in as the knife goes in
    if (!red) this.to(this.cam, { distK: this.cam.distK - 0.06, duration: 1.2, ease: 'sine.inOut' });
    // the candles standing on the slice lift away in a little shimmer
    this.candles.forEach((c) => {
      if (!c.inWedge) return;
      this.glitter.emit(c.tip, { n: 6, spread: 0.2, up: 0.15, life: 1.0, size: 0.03 });
      this.hideCandle(c.index);
    });
    // two clean cuts with a real knife
    this.knife.visible = true;
    this.knife.scale.setScalar(1);
    await this.slice(wA, top, DIM.t2.H * 0.85);
    this.sfx('whoosh');
    await this.slice(wB, top, DIM.t2.H * 0.85);
    // the knife bows out
    const kp = { y: this.knife.position.y, s: 1 };
    this.to(kp, { y: kp.y + 0.6, s: 0.001, duration: 0.45, ease: 'power2.in', onUpdate: () => { this.knife.position.y = kp.y; this.knife.scale.setScalar(kp.s); }, onComplete: () => { this.knife.visible = false; } });
    tier.cutFaces.forEach((m) => { m.visible = true; });
    const bis = new THREE.Vector3(Math.sin(DIM.wedgeCentre), 0, Math.cos(DIM.wedgeCentre));
    // 1. ease the slice out — it has weight
    await this.to(W.position, { x: bis.x * 0.16, y: 0.012, z: bis.z * 0.16, duration: red ? 0.45 : 0.75, ease: 'power2.out' });
    this.guard();
    // 2. lift & carry it to the plate, turning the layers toward her
    const plateLocal = DIM.plateAt.clone().add(new THREE.Vector3(0, 0.03, 0)).sub(tier.group.position);
    const rotY = 1.2;
    const bisAfter = new THREE.Vector3(Math.sin(DIM.wedgeCentre + rotY), 0, Math.cos(DIM.wedgeCentre + rotY));
    const dest = plateLocal.clone().sub(bisAfter.multiplyScalar(DIM.t2.R * 0.62));
    const from = W.position.clone();
    const proxy = { t: 0 };
    const portrait = this.fit.aspect < 0.8;
    this.to(this.cam, { az: 0.46, el: 0.3, distK: portrait ? 0.98 : 0.78, tx: portrait ? 1.1 : 1.25, ty: portrait ? -0.75 : -0.62, tz: 0.45, duration: red ? 1.4 : 2.6, ease: 'power2.inOut' });
    const ease = this.gsap.parseEase('power1.inOut');
    await this.to(proxy, {
      t: 1, duration: red ? 1.0 : 1.75, ease: 'power2.inOut',
      onUpdate: () => {
        const k = proxy.t;
        W.position.lerpVectors(from, dest, k);
        W.position.y += Math.sin(k * Math.PI) * 0.45;
        W.rotation.y = rotY * ease(k);
        W.rotation.z = Math.sin(k * Math.PI) * 0.05; // a little sway in the air
      },
    });
    this.guard();
    // 3. it lands: a tiny frosting squish & settle, a puff of crumbs, warm light blooms
    W.rotation.z = 0;
    const plateY = DIM.plateAt.y + 0.03;
    this.crumbs.burst(new THREE.Vector3(DIM.plateAt.x, plateY + 0.02, DIM.plateAt.z), plateY, this.low ? 3 : 7);
    this.timeline()
      .to(W.scale, { y: 0.955, x: 1.022, z: 1.022, duration: 0.09, ease: 'power2.out' })
      .to(W.scale, { y: 1, x: 1, z: 1, duration: red ? 0.3 : 0.75, ease: red ? 'power2.out' : 'elastic.out(1, 0.42)' });
    this.to(this.L, { kick: 1, duration: 0.18, ease: 'power2.out' });
    this.to(this.L, { kick: 0, duration: 1.6, delay: 0.2, ease: 'sine.inOut' });
    W.updateWorldMatrix(true, false);
    const p = this.toScreen(new THREE.Vector3().setFromMatrixPosition(W.matrixWorld).add(new THREE.Vector3(0, 0.45, 0)));
    this.fx('sparkle', p.x, p.y, 26);
    this.sfx('chime');
    await this.wait(red ? 0.6 : 1.3);
  }

  hideCandle(i) {
    const im = this.cake.candles, wk = this.cake.wicks;
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    im.getMatrixAt(i, m); m.decompose(pos, q, sc);
    const m2 = new THREE.Matrix4(); wk.getMatrixAt(i, m2);
    const p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3();
    m2.decompose(p2, q2, s2);
    const proxy = { k: 1 };
    this.to(proxy, {
      k: 0, duration: 0.35, ease: 'back.in(2)',
      onUpdate: () => {
        const k = Math.max(0.0001, proxy.k);
        im.setMatrixAt(i, new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(0, (1 - k) * 0.15, 0)), q, new THREE.Vector3(k, sc.y * k, k)));
        wk.setMatrixAt(i, new THREE.Matrix4().compose(p2.clone().add(new THREE.Vector3(0, (1 - k) * 0.3, 0)), q2, new THREE.Vector3(k, s2.y * k, k)));
        im.instanceMatrix.needsUpdate = true; wk.instanceMatrix.needsUpdate = true;
      },
    });
    this.flames.ember[i] = 0;
  }

  // --------------------------------------------------------- input
  bindInput() {
    const cv = this.canvas;
    this.on(cv, 'pointerdown', (e) => this.onDown(e));
    this.on(cv, 'pointermove', (e) => this.onMove(e));
    this.on(cv, 'pointerup', (e) => this.onUp(e));
    this.on(cv, 'pointercancel', (e) => this.onUp(e));
    this.on(cv, 'contextmenu', (e) => { if (this.phase === 'blow' || this.phase === 'cut') e.preventDefault(); });
    // desktop: hold the spacebar to blow
    this.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && this.phase === 'blow') {
        e.preventDefault();
        if (!this.blow.keyDown) this.sfx('blow');
        this.blow.keyDown = true;
      }
    });
    this.on(window, 'keyup', (e) => { if (e.code === 'Space' || e.key === ' ') this.blow.keyDown = false; });
    this.on(window, 'blur', () => { this.blow.keyDown = false; });
  }

  onDown(e) {
    this.pDown = true;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (this.phase === 'blow') {
      this.blow.gustUntil = this.time + 0.25;
      this.tapCandles(e.clientX, e.clientY);
    } else if (this.phase === 'cut') {
      this.trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      this.swipe = { inside: 0, rect: this.cakeRect(), last: { x: e.clientX, y: e.clientY } };
    }
  }

  onMove(e) {
    if (!this.pDown) return;
    if (this.phase === 'blow') this.tapCandles(e.clientX, e.clientY);
    else if (this.phase === 'cut' && this.swipe) {
      const p = { x: e.clientX, y: e.clientY };
      const s = this.swipe;
      s.inside += CakeScene.clipLen(s.last, p, s.rect);
      s.last = p;
      const now = performance.now();
      this.trail.push({ ...p, t: now });
      if (now - (s.lastSpark || 0) > 90) { s.lastSpark = now; this.fx('sparkle', p.x, p.y, 3); }
      const need = Math.max(70, (s.rect.x1 - s.rect.x0) * 0.38);
      if (s.inside >= need) { this.swipe = null; this.cut(); }
    }
  }

  onUp() {
    this.pDown = false;
    this.swipe = null;
  }

  // tap / swipe over the flames to blow them out (always available while blowing)
  tapCandles(x, y) {
    if (this.phase !== 'blow') return;
    const rad = Math.max(22, Math.min(this.size.w, this.size.h) * 0.03);
    const hits = [];
    this.candles.forEach((c, i) => {
      if (c.out) return;
      const p = this.toScreen(c.tip.clone().add(new THREE.Vector3(0, 0.05, 0)));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < rad) hits.push([d, i]);
    });
    hits.sort((a, b) => a[0] - b[0]).forEach(([, i], k) => {
      if (k === 0) this.extinguish(i, 0.5);
      else this.later(k * 0.06, () => this.phase === 'blow' && this.extinguish(i, 0.4));
    });
  }

  drawTrail(now) {
    const g = this.trailCtx;
    if (!g) return;
    const pts = this.trail;
    if (!pts || !pts.length) { if (this.trailDirty) { g.clearRect(0, 0, this.size.w, this.size.h); this.trailDirty = false; } return; }
    const life = this.trailLife || 260;
    while (pts.length && now - pts[0].t > life) pts.shift();
    g.clearRect(0, 0, this.size.w, this.size.h);
    this.trailDirty = true;
    if (pts.length < 2) return;
    const r = this.canvas.getBoundingClientRect();
    g.save();
    g.translate(-r.left, -r.top);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.shadowColor = pass === 0 ? 'rgba(255,200,110,0.9)' : 'rgba(255,255,255,0.8)';
      g.shadowBlur = pass === 0 ? 16 : 6;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const k = 1 - (now - b.t) / life;
        const w = i / pts.length;
        g.strokeStyle = pass === 0 ? `rgba(244,196,99,${0.42 * k})` : `rgba(255,252,240,${0.95 * k})`;
        g.lineWidth = pass === 0 ? 18 * w * k + 2 : 4.2 * w * k + 0.8;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // the bright glint riding the knife tip
    const tip = pts[pts.length - 1];
    const k = clamp(1 - (now - tip.t) / life, 0, 1);
    g.shadowBlur = 0;
    const gr = g.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 22);
    gr.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); gr.addColorStop(0.3, `rgba(255,226,160,${0.4 * k})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(tip.x, tip.y, 22, 0, TAU); g.fill();
    g.restore();
  }

  // Dev harness only (window.__CAKE_DEV__ + ?jump=…): freeze a look for screenshots.
  async devJump(state) {
    const L = this.L;
    Object.assign(L, { black: 0, room: 0.45, vignette: 0.42, hush: 0.6, glint: 0 });
    Object.assign(this.cam, { az: 0, el: 0.27, distK: 1.0 });
    if (state === 'ignite') { L.hush = 0.8; return this.ignite(); }
    if (state === 'unlit') { L.hush = 0.8; return; }
    this.candles.forEach((c, i) => { c.target = 1; this.flames.lit[i] = 1; });
    if (state === 'blow') this.blow.keyDown = true;
    const out = () => this.candles.forEach((c, i) => { c.target = 0; c.out = true; this.flames.lit[i] = 0; });
    if (state === 'smoke') { this.phase = 'blow'; this.candles.forEach((c, i) => this.later(i * 0.05, () => this.extinguish(i, 0.8))); return; }
    if (['dark', 'gold', 'party', 'cut', 'served'].includes(state)) out();
    if (state === 'dark') Object.assign(L, { room: 0.03, hush: 0.9, glint: 1 });
    if (state === 'gold') Object.assign(L, { room: 0.35, hush: 0.55, gold: 1 });
    if (['party', 'cut', 'served'].includes(state)) Object.assign(L, { party: 1, room: 0.75, hush: 0.12, gold: 1 });
    if (state === 'cut') { Object.assign(this.cam, { distK: 0.92, el: 0.3 }); this.phase = 'cut'; this.canvas.style.touchAction = 'none'; this.onCut = () => {}; }
    if (state === 'served') { this.phase = 'cut'; this.cut(); }
  }

  // --------------------------------------------------------- teardown
  destroy() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.ro?.disconnect();
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
    this.tweens.forEach((t) => { try { t.kill(); } catch (e) { /* ignore */ } });
    this.tweens.clear();
    this.handles.forEach((h) => h.remove());
    this.handles.clear();
    if (this.det) { this.det.stop(); this.det = null; }
    // GPU resources
    const seen = new Set();
    const dispTex = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); } };
    this.scene?.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'alphaMap']) dispTex(m[k]);
        if (m.uniforms) Object.values(m.uniforms).forEach((u) => dispTex(u && u.value));
        m.dispose();
      }
      if (o.isInstancedMesh) o.dispose?.();
    });
    this.cake?.textures.forEach(dispTex);
    [this.table?.wood, this.table?.shadowTex, this.table?.glowTex, this.glowTex, this.starTex].forEach(dispTex);
    this.flames?.dispose(); this.smoke?.dispose(); this.bokeh?.dispose(); this.dust?.dispose();
    this.strand?.dispose(); this.glitter?.dispose(); this.crumbs?.dispose();
    this.envRT?.dispose();
    if (this.composer) {
      this.composer.passes.forEach((p) => p.dispose?.());
      this.composer.renderTarget1?.dispose(); this.composer.renderTarget2?.dispose();
      this.composer = null;
    }
    if (this.scene) { this.scene.environment = null; this.scene.clear(); }
    if (this.renderer) {
      this.renderer.renderLists?.dispose();
      this.renderer.dispose();
      try { this.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      this.renderer = null;
    }
    this.root?.remove();
    this.trailCtx = null;
    if (window.__cake === this) delete window.__cake;
  }
}
