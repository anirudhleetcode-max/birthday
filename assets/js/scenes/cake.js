// Chapter: "Make a Wish" — an interactive, candle-lit 3D birthday cake.
// She blows into the mic (or taps the flames) to put out twenty candles,
// then swipes across the cake to cut the first slice.
import * as THREE from 'three';
import { buildCake, DIM } from './cake/model.js';
import { buildEnvironment, buildBackdrop, buildBokeh, buildDust, buildTable } from './cake/room.js';
import { createFlames } from './cake/flames.js';
import { createSmoke } from './cake/smoke.js';
import { BlowDetector } from './cake/blow.js';
import { radialTexture, starTexture } from './cake/textures.js';

const DEFAULT_TEXT = {
  title: 'Make a Wish',
  kicker: 'Chapter Six',
  lines: ['Twenty candles.', 'One wish.', 'Close your eyes, Kuchu Puchu…'],
  blowHint: 'Now blow — really blow into your phone 🌬️',
  tapFallback: 'or tap the candles',
  afterBlow: 'Whatever you wished for — I hope the universe is already wrapping it.',
  cutHint: 'Now swipe across the cake to cut it',
  afterCut: "First slice is yours. Obviously. It's always yours.",
};

const CSS = /* css */`
.ck-root{position:absolute;inset:0;overflow:hidden;background:#07040c;contain:strict;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.ck-gl{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.ck-trail{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.ck-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 95% at 50% 40%,rgba(6,2,12,0) 34%,rgba(6,2,12,.55) 70%,rgba(4,1,8,.96) 100%);opacity:.5}
.ck-black{position:absolute;inset:0;pointer-events:none;background:#030106;opacity:1}
.ck-ui{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 104px);display:flex;flex-direction:column;align-items:center;gap:14px;pointer-events:none;padding:0 16px}
.ck-btn{pointer-events:auto;appearance:none;-webkit-appearance:none;cursor:pointer;font:500 19px/1.1 "Cormorant Garamond",Georgia,serif;letter-spacing:.02em;color:#fff4dc;padding:15px 28px 15px 26px;border-radius:999px;border:1px solid rgba(244,196,99,.6);background:linear-gradient(180deg,rgba(78,42,112,.78),rgba(34,16,56,.86));box-shadow:0 0 0 1px rgba(255,230,170,.08) inset,0 10px 30px rgba(10,4,20,.55),0 0 28px rgba(244,196,99,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transform:translateY(12px) scale(.98);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease,background .3s ease;display:inline-flex;align-items:center;gap:10px;max-width:100%;text-align:center;touch-action:manipulation}
.ck-btn.on{opacity:1;transform:none}
.ck-btn:hover{box-shadow:0 0 0 1px rgba(255,230,170,.16) inset,0 10px 30px rgba(10,4,20,.55),0 0 38px rgba(244,196,99,.38)}
.ck-btn:active{transform:scale(.97)}
.ck-btn .ck-ico{font-size:18px;filter:saturate(.9)}
.ck-btn.primary{animation:ck-breathe 3.2s ease-in-out infinite}
.ck-btn.busy{opacity:.7;pointer-events:none}
.ck-link{pointer-events:auto;appearance:none;-webkit-appearance:none;background:none;border:0;cursor:pointer;font:italic 400 18px/1.2 "Cormorant Garamond",Georgia,serif;color:rgba(232,214,255,.88);padding:8px 14px;text-decoration:underline;text-decoration-color:rgba(244,196,99,.45);text-underline-offset:5px;opacity:0;transition:opacity .7s ease .15s;touch-action:manipulation}
.ck-link.on{opacity:1}
.ck-chip{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 18px);transform:translate(-50%,-8px);display:flex;align-items:center;gap:9px;padding:7px 14px 7px 12px;border-radius:999px;background:rgba(24,10,40,.6);border:1px solid rgba(244,196,99,.35);color:#f6e6c4;font:500 13px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .5s ease,transform .5s ease;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.ck-chip.on{opacity:1;transform:translate(-50%,0)}
.ck-dot{width:7px;height:7px;border-radius:50%;background:#ff7a8a;box-shadow:0 0 10px #ff7a8a;animation:ck-pulse 1.4s ease-in-out infinite}
.ck-bars{display:flex;align-items:flex-end;gap:2px;height:14px}
.ck-bars i{display:block;width:3px;height:3px;border-radius:2px;background:#f4c463;transition:height .08s linear}
@keyframes ck-breathe{0%,100%{box-shadow:0 0 0 1px rgba(255,230,170,.08) inset,0 10px 30px rgba(10,4,20,.55),0 0 22px rgba(244,196,99,.18)}50%{box-shadow:0 0 0 1px rgba(255,230,170,.16) inset,0 10px 30px rgba(10,4,20,.55),0 0 40px rgba(244,196,99,.42)}}
@keyframes ck-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.ck-btn.primary,.ck-dot{animation:none}}
`;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isAbort = (e) => e && (e.name === 'AbortError' || e === 'abort' || e?.message === 'aborted');
const abortErr = () => new DOMException('Scene exited', 'AbortError');

let live = null;

export default {
  id: 'cake',
  title: 'Make a Wish',
  async enter(ctx, el) {
    if (live) live.destroy();
    const s = new CakeScene(ctx, el);
    live = s;
    try {
      await s.setup();
    } catch (e) {
      if (isAbort(e) || s.dead) return;
      throw e;
    }
    if (s.dead) return;
    // The chapter runs on its own and calls ctx.next() when she continues.
    s.run().catch((e) => { if (!isAbort(e) && !s.dead) console.error('[cake]', e); });
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
    this.T = { ...DEFAULT_TEXT, ...(ctx.text?.cake || {}) };
    if (!Array.isArray(this.T.lines)) this.T.lines = DEFAULT_TEXT.lines;
    this.gsap = ctx.gsap || window.gsap;
    const dev = ctx.device || {};
    this.mobile = !!dev.mobile;
    this.low = !!dev.lowPower;
    this.reduced = !!dev.reducedMotion;
    this.dead = false;
    this.ac = new AbortController();
    this.tweens = new Set();
    this.timers = new Set();
    this.handles = new Set(); // ui.hint / ui.say handles
    this.time = 0;
    this.phase = 'init';
    this.L = { black: 1, room: 0.32, party: 0, vignette: 0.5, exposure: 1.0, glint: 0, glow: 0 };
    this.cam = { az: -0.24, el: 0.44, distK: 1.55, tx: 0, ty: 0, tz: 0, drift: 1 };
    this.blow = { key: 0, keyDown: false, wave: null, budget: 0, lastOut: -1, value: 0 };
    this.tick = this.tick.bind(this);
    if (window.__CAKE_DEV__) window.__cake = this;
  }

  // ---------------------------------------------------------------- utils
  get signal() { return this.ctx.signal; }
  guard() { if (this.dead || this.signal?.aborted) throw abortErr(); }
  on(target, type, fn, opts = {}) { target.addEventListener(type, fn, { ...opts, signal: this.ac.signal }); }
  to(target, vars) { const t = this.gsap.to(target, vars); this.tweens.add(t); return t; }
  fromTo(target, a, b) { const t = this.gsap.fromTo(target, a, b); this.tweens.add(t); return t; }
  timeline(vars) { const t = this.gsap.timeline(vars); this.tweens.add(t); return t; }
  later(sec, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.dead) fn(); }, sec * 1000);
    this.timers.add(id);
    return id;
  }
  async wait(sec) {
    if (this.ctx.wait) await this.ctx.wait(sec);
    else await new Promise((res) => this.later(sec, res));
    this.guard();
  }
  sfx(name) { try { this.ctx.audio?.sfx?.(name); } catch (e) { /* ignore */ } }
  mood(m) { try { this.ctx.audio?.setMood?.(m); } catch (e) { /* ignore */ } }
  fx(name, ...args) { try { this.ctx.fx?.[name]?.(...args); } catch (e) { /* ignore */ } }
  hint(text) {
    const h = this.ctx.ui?.hint ? this.ctx.ui.hint(text) : null;
    if (!h) return { remove() {} };
    const wrap = { remove: () => { this.handles.delete(wrap); try { h.remove(); } catch (e) { /* ignore */ } } };
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

    // fonts for the plaque (Great Vibes is loaded by the page)
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
    renderer.toneMapping = THREE.NeutralToneMapping;
    const tm = window.__CAKE_DEV__ && new URLSearchParams(location.search).get('tm');
    if (tm) renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[tm] ?? renderer.toneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x05020a, 1);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0x0a0512, 9, 24);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 120);
    this.camera = camera;

    this.envRT = buildEnvironment(renderer);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.3;

    // room
    this.backdrop = buildBackdrop();
    scene.add(this.backdrop);
    this.bokeh = buildBokeh({ lowPower: this.low });
    scene.add(this.bokeh.mesh);
    this.dust = buildDust({ count: this.low ? 50 : 90 });
    scene.add(this.dust.mesh);
    this.quality = this.low ? 0 : this.mobile ? 1 : 2;
    this.table = buildTable({ lowPower: this.low, quality: this.quality, anisotropy: aniso });
    scene.add(this.table.group);

    // the cake
    const name = this.ctx.site?.her?.name || 'Deepu';
    this.cake = buildCake({ lowPower: this.low, quality: this.quality, name, anisotropy: aniso });
    scene.add(this.cake.root);
    this.plateShadow = this.table.mkShadow(0.62, DIM.plateAt.x, DIM.plateAt.z, 0.6);
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

    // lights
    const warm = 0xffa24f;
    this.candleLights = [new THREE.PointLight(warm, 0, 0, 2), new THREE.PointLight(0xffb867, 0, 0, 2)];
    this.candleLights[0].position.set(-0.22, t2y + DIM.t2.H + 0.36, 0.34);
    this.candleLights[1].position.set(0.3, t2y + DIM.t2.H + 0.34, -0.08);
    this.hemi = new THREE.HemisphereLight(0x6a4a9c, 0x1c0e08, 0.2);
    this.key = new THREE.SpotLight(0xeee2ff, 0, 0, 0.55, 1, 0);
    this.key.position.set(-3.2, 7.5, 5.5);
    this.key.target.position.set(0, 1.2, 0);
    this.rim = new THREE.DirectionalLight(0xa797ff, 0.6);
    this.rim.position.set(1.5, 7, -7);
    this.fill = new THREE.DirectionalLight(0xffc9a0, 0);
    this.fill.position.set(3, 2, 6);
    scene.add(...this.candleLights, this.hemi, this.key, this.key.target, this.rim, this.fill);

    // sparks & glints
    this.glowTex = radialTexture({ size: 128, inner: 'rgba(255,255,255,1)', mid: 'rgba(255,214,140,0.45)', outer: 'rgba(255,170,80,0)', midStop: 0.22 });
    this.starTex = starTexture();
    const sprite = (map, color, size) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.scale.setScalar(size); s.renderOrder = 20;
      scene.add(s); return s;
    };
    this.spark = sprite(this.glowTex, 0xffe2a0, 0.16);
    this.sparkTrail = Array.from({ length: 7 }, (_, i) => sprite(this.glowTex, 0xffc070, 0.11 * (1 - i / 9)));
    this.sparkHist = [];
    this.glint = sprite(this.starTex, 0xfff1d0, 0.34);
    this.glint2 = sprite(this.starTex, 0xffe7b0, 0.22);

    // bloom only on capable desktops (half-res, subtle)
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
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.96);
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

    // input
    this.bindInput();

    // warm up shaders, then start the loop
    this.updateCamera(0);
    try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.guard();
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
    const W = 3.4, H = 3.9;
    const dist = Math.max(H / 2 / t, W / 2 / (t * aspect)) * 1.02;
    const vh = 2 * dist * t;
    this.fit = { fov, dist, ty: 1.72 - vh * (aspect < 0.8 ? 0.075 : 0.03), aspect, w, h };
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
    this.frames = (this.frames || 0) + 1;
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
    const gust = Math.max(0, (B.gustUntil || 0) - t) > 0 ? 0.6 : 0;
    const blowing = Math.max(mic, B.key, wave);
    B.value = blowing;
    const disturb = Math.max(blowing, gust, micLevel * 0.4);
    if (this.phase === 'blow' && blowing > 0.05) {
      const rate = B.wave ? DIM.candleCount / (B.wave.dur * 0.75) : 2.5 + 6 * blowing;
      B.budget += dt * rate * (B.wave ? 1 : blowing > 0.05 ? 1 : 0);
      while (B.budget >= 1 && this.litCount() > 0) { B.budget -= 1; this.extinguishNext(blowing); }
    } else B.budget = Math.min(B.budget, 0.6);
    if (this.det && this.chipEl.classList.contains('on')) this.updateBars(Math.max(micLevel, mic));
    if (this.det && this.phase === 'blow' && this.det.state === 'listening' && !this.fallbackShown && this.det.listenT > 10 && this.det.lastHeard === 0) this.surfaceFallback();

    // --- candles ---
    const F = this.flames;
    let litSum = 0;
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const cur = F.lit[i];
      const k = c.target > cur ? 5 : (c.target < 1 && cur > c.target ? 11 : 4);
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
    const L = this.L;
    const flick = 1 + 0.07 * Math.sin(t * 13.3) + 0.05 * Math.sin(t * 7.1 + 1.3) + 0.04 * Math.sin(t * 23.7) + disturb * 0.22 * Math.sin(t * 31.0);
    const cl = 1.6 * frac * flick;
    this.candleLights[0].intensity = cl;
    this.candleLights[1].intensity = cl * 0.85 * (1 + 0.05 * Math.sin(t * 17.0));
    this.hemi.intensity = 0.32 * L.room + 0.22 * L.party;
    this.key.intensity = 1.6 * L.party + 2.2 * L.room * (1 - 0.4 * L.party);
    this.rim.intensity = 0.75 * L.room + 0.55 * L.party;
    this.fill.intensity = 0.45 * L.party + 0.35 * frac * L.room;
    const envLevel = 0.06 + 0.22 * L.room * (1 - 0.5 * L.party) + 0.5 * frac * (0.9 + 0.1 * flick) + 0.42 * L.party;
    for (const [m, k] of this.envMats) m.envMapIntensity = envLevel * k;
    this.bokeh.uniforms.uTime.value = t;
    this.bokeh.uniforms.uBright.value = 0.25 + 0.6 * L.room + 0.9 * L.party;
    this.dust.uniforms.uTime.value = t;
    this.dust.uniforms.uBright.value = 0.15 + 0.8 * frac + 0.7 * L.party;
    this.backdrop.material.uniforms.uRoom.value = 0.25 + 0.6 * L.room + 0.6 * L.party;
    this.backdrop.material.uniforms.uWarm.value = frac + L.party;
    this.table.pool.material.opacity = 0.32 * frac * flick + 0.12 * L.party;
    this.renderer.toneMappingExposure = L.exposure;
    this.blackEl.style.opacity = L.black.toFixed(3);
    this.vigEl.style.opacity = L.vignette.toFixed(3);
    this.flames.haloUniforms.uHalo.value = 1;

    // glints on the sun topper
    if (this.glint) {
      const tp = this.cake.topper;
      tp.updateWorldMatrix(true, false);
      const g1 = new THREE.Vector3(-0.21, 0.22, 0.05).applyMatrix4(tp.matrixWorld);
      const g2 = new THREE.Vector3(0.3, -0.06, 0.05).applyMatrix4(tp.matrixWorld);
      this.glint.position.copy(g1);
      this.glint2.position.copy(g2);
      const tw = 0.6 + 0.4 * Math.sin(t * 2.3);
      this.glint.material.opacity = L.glint * tw;
      this.glint.material.rotation = t * 0.25;
      this.glint2.material.opacity = L.glint * (0.5 + 0.5 * Math.sin(t * 1.7 + 2)) * 0.8;
      this.glint2.material.rotation = -t * 0.3;
    }
    this.updateSpark();

    // smoke
    this.smoke.update(dt, t);

    // knife trail
    this.drawTrail(now);

    // camera
    this.updateCamera(dt);

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

  // world → client (viewport) coordinates
  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, z: p.z };
  }

  // ---------------------------------------------------------------- flow
  // Dev harness only: freeze the scene in a given look for screenshots.
  async devJump(state) {
    const L = this.L;
    Object.assign(L, { black: 0, room: 0.5, vignette: 0.42, glint: 0 });
    Object.assign(this.cam, { az: 0, el: 0.27, distK: 1.0 });
    this.candles.forEach((c, i) => { c.target = 1; this.flames.lit[i] = 1; });
    if (state === 'blow') { this.blow.keyDown = true; }
    if (state === 'dark' || state === 'party' || state === 'served' || state === 'cut') {
      this.candles.forEach((c, i) => { c.target = 0; c.out = true; this.flames.lit[i] = 0; });
    }
    if (state === 'dark') Object.assign(L, { room: 0.035, vignette: 0.9, glint: 1 });
    if (state === 'party' || state === 'served' || state === 'cut') Object.assign(L, { party: 1, room: 1, vignette: 0.32, glint: 0.25 });
    if (state === 'cut') { Object.assign(this.cam, { distK: 0.92, el: 0.3 }); this.phase = 'cut'; this.canvas.style.touchAction = 'none'; this.onCut = () => {}; }
    if (state === 'served') { this.phase = 'cut'; this.cut(); }
    if (state === 'smoke') {
      this.phase = 'blow';
      this.candles.forEach((c, i) => this.later(i * 0.05, () => this.extinguish(i, 0.8)));
    }
  }

  async run() {
    const { ctx, T } = this;
    const ui = ctx.ui || {};
    const jump = window.__CAKE_DEV__ && new URLSearchParams(location.search).get('jump');
    if (jump) return this.devJump(jump);
    // Chapter card over a black stage
    if (ui.chapterCard) await ui.chapterCard(T.kicker, T.title);
    this.guard();
    this.mood('tender');
    await this.reveal();
    await this.ignite();
    // The wish
    this.phase = 'wish';
    const lines = (T.lines || []).filter(Boolean);
    if (lines.length > 1 && ui.narrate) { await ui.narrate(lines.slice(0, -1)); this.guard(); }
    if (lines.length) {
      await Promise.all([ui.narrate ? ui.narrate(lines.slice(-1)) : Promise.resolve(), this.breathMoment()]);
      this.guard();
    }
    await this.blowPhase();
    await this.celebrate();
    await this.cutPhase();
    if (ui.narrate) await ui.narrate([T.afterCut]);
    this.guard();
    if (ui.waitContinue) await ui.waitContinue('Continue');
    this.guard();
    this.phase = 'done';
    ctx.next?.();
  }

  async reveal() {
    this.phase = 'reveal';
    const dur = this.reduced ? 2.2 : 5.2;
    this.to(this.L, { black: 0, duration: this.reduced ? 1.6 : 2.8, ease: 'power2.inOut' });
    this.to(this.L, { room: 0.42, duration: dur, ease: 'sine.inOut' });
    if (this.reduced) Object.assign(this.cam, { az: 0, el: 0.27, distK: 1.0 });
    else this.to(this.cam, { az: 0, el: 0.27, distK: 1.0, duration: dur, ease: 'power3.inOut' });
    this.to(this.L, { glint: 0.35, duration: 2, delay: 1.2 });
    await this.wait(this.reduced ? 1.6 : dur - 1.4);
  }

  async ignite() {
    this.phase = 'ignite';
    const order = this.candles.map((c, i) => i); // already ordered around the ring from the front
    this.to(this.L, { glint: 0, duration: 0.8 });
    if (this.reduced) {
      order.forEach((i, k) => this.later(k * 0.05, () => this.lightCandle(i, k)));
      this.to(this.L, { room: 0.5, duration: 1.5 });
      await this.wait(1.6);
      return;
    }
    const tp = this.cake.topper;
    tp.updateWorldMatrix(true, false);
    const start = new THREE.Vector3(0, 0, 0.06).applyMatrix4(tp.matrixWorld);
    const sp = this.spark;
    sp.position.copy(start);
    this.sparkOn = true;
    this.sparkHist = [];
    this.to(sp.material, { opacity: 1, duration: 0.4 });
    this.to(sp.scale, { x: 0.22, y: 0.22, z: 0.22, duration: 0.4, yoyo: true, repeat: 1 });
    this.sfx('magic');
    await this.wait(0.55);
    const tl = this.timeline();
    let prev = start.clone();
    order.forEach((i, k) => {
      const a = prev.clone(), b = this.candles[i].tip.clone().add(new THREE.Vector3(0, 0.02, 0));
      const proxy = { t: 0 };
      const lift = k === 0 ? 0.25 : 0.07;
      tl.to(proxy, {
        t: 1, duration: k === 0 ? 0.6 : 0.105, ease: k === 0 ? 'power2.in' : 'sine.inOut',
        onUpdate: () => {
          const p = a.clone().lerp(b, proxy.t);
          p.y += Math.sin(proxy.t * Math.PI) * lift;
          sp.position.copy(p);
        },
        onComplete: () => this.lightCandle(i, k),
      });
      prev = b;
    });
    this.to(this.L, { room: 0.55, duration: 3.2, ease: 'sine.inOut' });
    await tl;
    this.guard();
    this.to(sp.material, { opacity: 0, duration: 0.5, onComplete: () => { this.sparkOn = false; } });
    await this.wait(0.8);
  }

  lightCandle(i, k = 0) {
    const c = this.candles[i];
    c.target = 1;
    this.flames.lit[i] = Math.max(this.flames.lit[i], 1.45);
    if (k % 5 === 0) this.sfx('sparkle');
  }

  updateSpark() {
    const sp = this.spark;
    if (!sp) return;
    if (this.sparkOn) {
      this.sparkHist.unshift(sp.position.clone());
      if (this.sparkHist.length > 14) this.sparkHist.length = 14;
    } else if (this.sparkHist.length) this.sparkHist.pop();
    this.sparkTrail.forEach((s, i) => {
      const p = this.sparkHist[(i + 1) * 2];
      if (p) { s.position.copy(p); s.material.opacity = sp.material.opacity * (1 - i / this.sparkTrail.length) * 0.7; }
      else s.material.opacity = 0;
    });
    sp.material.rotation += 0.05;
  }

  async breathMoment() {
    // the room holds its breath while she closes her eyes
    await this.wait(0.4);
    this.sfx('heartbeat');
    this.to(this.L, { vignette: 0.97, room: 0.12, duration: this.reduced ? 1.2 : 1.6, ease: 'sine.inOut' });
    if (!this.reduced) this.to(this.cam, { distK: 0.9, el: 0.24, duration: 4.2, ease: 'sine.inOut' });
    await this.wait(3.0);
    this.to(this.L, { vignette: 0.42, room: 0.5, duration: 1.6, ease: 'sine.inOut' });
    await this.wait(0.6);
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
    const { T } = this;
    const ui = this.uiEl;
    ui.innerHTML = '';
    const supported = BlowDetector.supported();
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'ck-btn primary';
    primary.innerHTML = '<span class="ck-ico" aria-hidden="true">🎤</span><span>Blow with your breath</span>';
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'ck-link';
    link.textContent = T.tapFallback;
    this.blowBtn = primary; this.tapLink = link;
    if (supported) ui.append(primary);
    ui.append(link);
    this.on(primary, 'click', (e) => { e.stopPropagation(); this.startMic(); });
    this.on(link, 'click', (e) => { e.stopPropagation(); this.enterTapMode(); });
    requestAnimationFrame(() => { primary.classList.add('on'); link.classList.add('on'); });
    if (!supported) this.later(0.2, () => this.enterTapMode());
  }

  tapHintText() {
    const s = String(this.T.tapFallback || '').replace(/^\s*or\s+/i, '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Tap the candles';
  }

  async startMic() {
    if (this.det || this.phase !== 'blow') return;
    const det = new BlowDetector({ sharedContext: this.ctx.audio?.context || null });
    this.det = det;
    this.blowBtn.classList.add('busy');
    this.fallbackShown = false;
    const slow = this.later(10, () => this.surfaceFallback());
    try {
      await det.start(this.signal); // getUserMedia is invoked synchronously inside this tap
    } catch (e) {
      clearTimeout(slow); this.timers.delete(slow);
      det.stop();
      if (this.det === det) this.det = null;
      if (this.dead || isAbort(e)) return;
      console.warn('[cake] microphone unavailable:', e?.name || e);
      this.enterTapMode(true);
      return;
    }
    clearTimeout(slow); this.timers.delete(slow);
    if (this.dead || this.phase !== 'blow') { det.stop(); return; }
    this.mood('hush');
    this.blowBtn.classList.remove('on');
    if (!this.tapMode) this.tapLink.classList.remove('on');
    this.chipEl.classList.add('on');
    this.blowHintH?.remove();
    this.blowHintH = this.hint(this.T.blowHint);
  }

  surfaceFallback() {
    if (this.phase !== 'blow' || this.fallbackShown || this.tapMode) return;
    this.fallbackShown = true;
    this.tapLink.classList.add('on');
  }

  enterTapMode(micFailed = false) {
    if (this.phase !== 'blow') return;
    this.tapMode = true;
    this.tapLink.classList.remove('on');
    if (this.blowBtn) {
      // the primary becomes a one-tap "Blow" that blows them out in a wave
      this.blowBtn.classList.remove('busy', 'primary');
      this.blowBtn.innerHTML = '<span class="ck-ico" aria-hidden="true">🌬️</span><span>Blow</span>';
      const fresh = this.blowBtn.cloneNode(true);
      this.blowBtn.replaceWith(fresh);
      this.blowBtn = fresh;
      this.on(fresh, 'click', (e) => { e.stopPropagation(); this.startWave(); });
      requestAnimationFrame(() => fresh.classList.add('on'));
    }
    if (!this.det || micFailed) {
      this.blowHintH?.remove();
      this.blowHintH = this.hint(this.tapHintText());
    }
  }

  startWave() {
    if (this.phase !== 'blow' || this.blow.wave) return;
    this.sfx('blow');
    this.blow.wave = { t: 0, dur: this.reduced ? 1.6 : 2.2 };
    this.blowBtn?.classList.remove('on');
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
    if (c.out) return;
    c.out = true;
    c.target = 0;
    this.flames.out[i] = 1;
    this.flames.ember[i] = 1;
    const away = c.tip.clone().sub(this.camera.position).setY(0).normalize();
    this.smoke.extinguish(c.tip.clone().add(new THREE.Vector3(0, 0.03, 0)), away, 0.6 + strength * 0.6);
    const now = this.time;
    if (now - this.blow.lastOut > 0.07) { this.sfx('candleOut'); this.blow.lastOut = now; }
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
      const k = clamp(v * 1.4 - i / n * 0.6 + Math.sin(this.time * 20 + i * 1.7) * 0.05 * v, 0, 1);
      b.style.height = `${3 + k * 11}px`;
    });
  }

  // --------------------------------------------------------- celebration
  async celebrate() {
    const { T } = this;
    this.phase = 'dark';
    // one beat of near-darkness: smoke curling, the plaque catching the last light
    this.to(this.L, { room: 0.035, vignette: 0.9, duration: 0.9, ease: 'power2.out' });
    this.to(this.L, { glint: 1, duration: 0.8, delay: 0.3 });
    await this.wait(this.reduced ? 1.0 : 1.6);
    this.fx('flash', { color: '#ffe3a3', duration: 0.6 });
    this.phase = 'party';
    this.to(this.L, { party: 1, room: 1, vignette: 0.32, duration: this.reduced ? 0.6 : 1.4, ease: 'power2.out' });
    this.to(this.L, { glint: 0.25, duration: 1.5 });
    this.mood('festive');
    try { Promise.resolve(this.ctx.audio?.happyBirthday?.()).catch(() => {}); } catch (e) { /* ignore */ }
    this.fx('cannons');
    const top = this.toScreen(new THREE.Vector3(0, 2.3, 0));
    const { w, h } = this.size;
    const size = Math.min(w, h) * 0.42;
    const bursts = [
      [-0.28, -0.06, ['#f2a7c3', '#ffd1e1', '#f4c463']],
      [0.3, -0.1, ['#c7b2ec', '#e9dcff', '#f4c463']],
      [0.0, -0.22, ['#f4c463', '#ffe3a3', '#f2a7c3']],
    ];
    bursts.forEach(([dx, dy, colors], k) => this.later(0.15 + k * (this.reduced ? 0.15 : 0.32), () => {
      this.fx('colorBurst', { x: top.x + dx * w, y: top.y + dy * h, colors, size });
    }));
    const sparkleAt = (v, n) => { const p = this.toScreen(v); this.fx('sparkle', p.x, p.y, n); };
    this.later(0.4, () => sparkleAt(new THREE.Vector3(0, 2.9, 0.05), this.reduced ? 10 : 24));
    this.later(0.9, () => sparkleAt(new THREE.Vector3(-0.6, 2.2, 0.4), 14));
    this.later(1.3, () => sparkleAt(new THREE.Vector3(0.6, 2.1, 0.4), 14));
    this.sfx('swell');
    await this.wait(this.reduced ? 0.8 : 1.4);
    if (this.ctx.ui?.narrate) await this.ctx.ui.narrate([T.afterBlow]);
    this.guard();
  }

  // --------------------------------------------------------- cutting
  async cutPhase() {
    this.phase = 'cut';
    this.canvas.style.touchAction = 'none';
    const h = this.hint(this.T.cutHint);
    const done = new Promise((res) => { this.onCut = res; });
    this.autoCutTimer = this.later(20, () => this.autoCut());
    this.to(this.cam, { distK: 0.92, el: 0.3, duration: 2.5, ease: 'sine.inOut' });
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
    // the knife does it for her, gently
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
    clearTimeout(this.autoCutTimer); this.timers.delete(this.autoCutTimer);
    this.canvas.style.touchAction = '';
    this.sfx('whoosh');
    this.serve().then(() => { const r = this.onCut; this.onCut = null; r && r(); }).catch((e) => { if (!isAbort(e) && !this.dead) console.error('[cake]', e); });
  }

  async serve() {
    const tier = this.cake.t2;
    const W = tier.wedge;
    const red = this.reduced;
    // the candles standing on the slice dissolve into sparkles first
    this.candles.forEach((c) => {
      if (!c.inWedge) return;
      const p = this.toScreen(c.tip);
      this.fx('sparkle', p.x, p.y, 8);
      this.hideCandle(c.index);
    });
    tier.cutFaces.forEach((m) => { m.visible = true; });
    const bis = new THREE.Vector3(Math.sin(DIM.wedgeCentre), 0, Math.cos(DIM.wedgeCentre));
    // 1. ease the slice out
    await this.to(W.position, { x: bis.x * 0.16, z: bis.z * 0.16, duration: red ? 0.4 : 0.7, ease: 'power2.out' });
    this.guard();
    // 2. lift & carry it to the plate, turning the layers toward her
    const plateLocal = DIM.plateAt.clone().add(new THREE.Vector3(0, 0.03, 0)).sub(tier.group.position);
    const rotY = 1.2;
    const bisAfter = new THREE.Vector3(Math.sin(DIM.wedgeCentre + rotY), 0, Math.cos(DIM.wedgeCentre + rotY));
    const dest = plateLocal.clone().sub(bisAfter.multiplyScalar(DIM.t2.R * 0.62));
    const from = W.position.clone();
    const proxy = { t: 0 };
    // reframe to admire the slice
    const portrait = this.fit.aspect < 0.8;
    this.to(this.cam, { az: 0.46, el: 0.3, distK: portrait ? 0.84 : 0.78, tx: portrait ? 1.45 : 1.25, ty: -0.62, tz: 0.45, duration: red ? 1.4 : 2.6, ease: 'power2.inOut' });
    await this.to(proxy, {
      t: 1, duration: red ? 1.0 : 1.7, ease: 'power2.inOut',
      onUpdate: () => {
        const k = proxy.t;
        W.position.lerpVectors(from, dest, k);
        W.position.y += Math.sin(k * Math.PI) * 0.45;
        W.rotation.y = rotY * this.gsap.parseEase('power1.inOut')(k);
      },
    });
    this.guard();
    // 3. settle with the tiniest bounce
    await this.to(W.position, { y: dest.y + 0.012, duration: 0.12, ease: 'power1.out', yoyo: true, repeat: 1 });
    this.guard();
    W.updateWorldMatrix(true, false);
    const p = this.toScreen(new THREE.Vector3().setFromMatrixPosition(W.matrixWorld).add(new THREE.Vector3(0, 0.45, 0)));
    this.fx('sparkle', p.x, p.y, 26);
    this.sfx('chime');
    await this.wait(red ? 0.6 : 1.2);
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
      this.swipe = { inside: 0, total: 0, rect: this.cakeRect(), last: { x: e.clientX, y: e.clientY }, startT: performance.now() };
    }
  }

  onMove(e) {
    if (!this.pDown) return;
    if (this.phase === 'blow') this.tapCandles(e.clientX, e.clientY);
    else if (this.phase === 'cut' && this.swipe) {
      const p = { x: e.clientX, y: e.clientY };
      const s = this.swipe;
      s.inside += CakeScene.clipLen(s.last, p, s.rect);
      s.total += Math.hypot(p.x - s.last.x, p.y - s.last.y);
      s.last = p;
      this.trail.push({ ...p, t: performance.now() });
      const need = Math.max(70, (s.rect.x1 - s.rect.x0) * 0.38);
      if (s.inside >= need) { this.swipe = null; this.cut(); }
    }
  }

  onUp() {
    this.pDown = false;
    this.swipe = null;
  }

  tapCandles(x, y) {
    if (this.phase !== 'blow') return;
    const rad = Math.max(30, Math.min(this.size.w, this.size.h) * 0.055);
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
    const life = 260;
    while (pts.length && now - pts[0].t > life) pts.shift();
    g.clearRect(0, 0, this.size.w, this.size.h);
    this.trailDirty = true;
    if (pts.length < 2) return;
    const r = this.canvas.getBoundingClientRect();
    g.save();
    g.translate(-r.left, -r.top);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const k = 1 - (now - b.t) / life;
        const w = (i / pts.length);
        g.strokeStyle = pass === 0 ? `rgba(244,196,99,${0.28 * k})` : `rgba(255,252,240,${0.95 * k})`;
        g.lineWidth = pass === 0 ? 14 * w * k + 2 : 3.2 * w * k + 0.6;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // the bright glint at the knife tip
    const tip = pts[pts.length - 1];
    const k = clamp(1 - (now - tip.t) / life, 0, 1);
    const gr = g.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 22);
    gr.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); gr.addColorStop(0.3, `rgba(255,226,160,${0.4 * k})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(tip.x, tip.y, 22, 0, TAU); g.fill();
    g.restore();
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
    if (this.gsap) {
      try { this.gsap.killTweensOf([this.L, this.cam, this.spark?.material, this.spark?.scale]); } catch (e) { /* ignore */ }
    }
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
