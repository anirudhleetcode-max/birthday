/**
 * cropper.js — full-screen, touch-friendly cropper LOCKED to a ratio.
 *
 *   openCropper({ source, ratio, shapes?, title, rule, step?, strength, initialRect?,
 *                 allowSkip?, confirmLabel?, caption? })
 *     → Promise<{ rect, ratio, caption } | { skip: true } | null>
 *
 * Drag to pan (pointer events), pinch with two fingers, mouse-wheel or slider to zoom.
 * The image always covers the frame, so the result is always exactly the ratio.
 */
import { h, icon, clearToasts } from './ui.js';
import { parseRatio } from './model.js';
import { drawRegion, previewCrop, autoCropRect } from './images.js';

const DISPLAY_MAX = 1800;
const MAX_ZOOM = 6;

export function openCropper(opts) {
  const {
    source, shapes = null, title = 'Crop', rule = '', step = '', strength = 0.85,
    initialRect = null, allowSkip = false, confirmLabel = 'Use this crop', caption = null,
  } = opts;
  let ratio = opts.ratio || (shapes && shapes[0].ratio) || '1:1';
  const srcW = source.width, srcH = source.height;

  return new Promise((resolve) => {
    // ---------- display bitmap ----------
    const dsf = Math.min(1, DISPLAY_MAX / Math.max(srcW, srcH));
    const disp = drawRegion(source, 0, 0, srcW, srcH, Math.round(srcW * dsf), Math.round(srcH * dsf));
    disp.className = 'crop-img';
    disp.setAttribute('aria-hidden', 'true');

    // ---------- DOM ----------
    const frame = h('div.crop-frame', h('i.third.v1'), h('i.third.v2'), h('i.third.h1'), h('i.third.h2'),
      h('i.corner.tl'), h('i.corner.tr'), h('i.corner.bl'), h('i.corner.br'));
    const stage = h('div.crop-stage', { tabindex: '0', 'aria-label': 'Drag to move the photo, pinch or scroll to zoom' }, disp, frame);
    const ruleText = h('span.crop-rule-text', rule);
    const ruleBadge = h('span.ratio-badge', parseRatio(ratio).label);
    const ruleBar = h('div.crop-rule', ruleBadge, ruleText);

    const zoom = h('input.zoom-range', { type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Zoom' });
    const zoomRow = h('div.zoom-row',
      h('button.icon-btn', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.25) }, h('span.zoom-glyph', '−')),
      zoom,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.25) }, h('span.zoom-glyph', '+')),
    );

    let shapeRow = null;
    if (shapes && shapes.length) {
      shapeRow = h('div.shape-row', { role: 'radiogroup', 'aria-label': 'Shape' },
        shapes.map((s) => {
          const r = parseRatio(s.ratio);
          const box = 22;
          const bw = r.value >= 1 ? box : box * r.value, bh = r.value >= 1 ? box / r.value : box;
          return h('button.shape-chip', {
            type: 'button', role: 'radio', 'aria-checked': String(s.ratio === ratio), dataset: { ratio: s.ratio },
            onclick: () => setRatio(s.ratio),
          }, h('span.shape-glyph', { style: { width: `${bw}px`, height: `${bh}px` } }), h('span.shape-txt', h('b', s.label), h('small', s.sub)));
        }));
    }

    const pv = h('canvas.crop-preview-canvas');
    const preview = h('figure.crop-preview', h('div.crop-preview-box', pv), h('figcaption', 'How it will look'));
    let captionInput = null;
    if (caption !== null) {
      captionInput = h('input.input', { type: 'text', value: caption || '', placeholder: 'Caption (optional)', maxlength: '140', 'aria-label': 'Caption' });
    }

    const btnConfirm = h('button.btn.gold', { type: 'button', onclick: () => finish('ok') }, icon('check'), confirmLabel);
    const actions = h('div.crop-actions',
      h('button.btn.ghost', { type: 'button', onclick: () => finish(null) }, 'Cancel'),
      btnConfirm,
    );

    const root = h('div.cropper', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header.crop-head',
        h('button.icon-btn', { type: 'button', 'aria-label': 'Cancel', onclick: () => finish(null) }, icon('close')),
        h('div.crop-titles', step ? h('p.crop-step', step) : null, h('h2.crop-title', title)),
        allowSkip ? h('button.btn.sm.ghost.crop-skip', { type: 'button', onclick: () => finish('skip') }, 'Skip this one') : null,
      ),
      ruleBar,
      stage,
      h('div.crop-panel',
        shapeRow,
        zoomRow,
        h('p.crop-tip', 'Drag to move · pinch or scroll to zoom'),
        h('div.crop-bottom', preview, h('div.crop-side', captionInput, actions)),
      ),
    );
    clearToasts();
    document.body.append(root);
    document.body.classList.add('has-cropper');
    requestAnimationFrame(() => root.classList.add('in'));

    // ---------- state ----------
    let fx = 0, fy = 0, fw = 100, fh = 100; // frame box in stage coords
    let S = 1, ox = 0, oy = 0;             // CSS px per source px; image offset relative to frame
    let sMin = 1, sMax = 6;

    function layout(keepRect) {
      const r = parseRatio(ratio).value;
      const sw = stage.clientWidth, sh = stage.clientHeight;
      const pad = Math.max(14, Math.min(36, Math.min(sw, sh) * 0.06));
      const aw = Math.max(40, sw - pad * 2), ah = Math.max(40, sh - pad * 2);
      fw = Math.min(aw, ah * r);
      fh = fw / r;
      fx = (sw - fw) / 2;
      fy = (sh - fh) / 2;
      Object.assign(frame.style, { left: `${fx}px`, top: `${fy}px`, width: `${fw}px`, height: `${fh}px` });
      sMin = Math.max(fw / srcW, fh / srcH);
      sMax = sMin * MAX_ZOOM;
      if (keepRect) setFromRect(keepRect);
    }

    function setFromRect(rect) {
      S = clamp(fw / rect.w, sMin, sMax);
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      ox = fw / 2 - cx * S;
      oy = fh / 2 - cy * S;
      clampPos();
      apply();
    }

    function currentRect() {
      const r = parseRatio(ratio).value;
      let w = Math.min(srcW, fw / S);
      let hh = w / r;
      if (hh > srcH) { hh = srcH; w = hh * r; }
      let x = clamp(-ox / S, 0, srcW - w);
      let y = clamp(-oy / S, 0, srcH - hh);
      return { x, y, w, h: hh };
    }

    function clampPos() {
      ox = clamp(ox, fw - srcW * S, 0);
      oy = clamp(oy, fh - srcH * S, 0);
    }

    function apply() {
      const k = S / dsf;
      disp.style.transform = `translate3d(${fx + ox}px, ${fy + oy}px, 0) scale(${k})`;
      const t = Math.log(S / sMin) / Math.log(sMax / sMin);
      zoom.value = String(Math.round(clamp(isFinite(t) ? t : 0, 0, 1) * 1000));
      schedulePreview();
    }

    function zoomAt(newS, px, py) {
      newS = clamp(newS, sMin, sMax);
      ox = px - (px - ox) * (newS / S);
      oy = py - (py - oy) * (newS / S);
      S = newS;
      clampPos();
      apply();
    }
    function zoomBy(f) { zoomAt(S * f, fw / 2, fh / 2); }

    function setRatio(next) {
      if (next === ratio) return;
      const prev = currentRect();
      const zoomRel = S / sMin;
      ratio = next;
      ruleBadge.textContent = parseRatio(ratio).label;
      if (shapeRow) for (const b of shapeRow.children) b.setAttribute('aria-checked', String(b.dataset.ratio === ratio));
      layout(null);
      S = clamp(sMin * zoomRel, sMin, sMax);
      ox = fw / 2 - (prev.x + prev.w / 2) * S;
      oy = fh / 2 - (prev.y + prev.h / 2) * S;
      clampPos();
      apply();
    }

    // ---------- pointer gestures ----------
    const pts = new Map();
    let gesture = null;
    const local = (e) => { const b = stage.getBoundingClientRect(); return { x: e.clientX - b.left - fx, y: e.clientY - b.top - fy }; };

    function startGesture() {
      const p = [...pts.values()];
      if (p.length >= 2) {
        const [a, b] = p;
        gesture = { type: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, s0: S, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox0: ox, oy0: oy };
      } else if (p.length === 1) {
        gesture = { type: 'pan', x0: p[0].x, y0: p[0].y, ox0: ox, oy0: oy };
      } else gesture = null;
    }

    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      stage.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, local(e));
      stage.classList.add('dragging');
      startGesture();
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (!gesture) return;
      const p = [...pts.values()];
      if (gesture.type === 'pinch' && p.length >= 2) {
        const [a, b] = p;
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const newS = clamp(gesture.s0 * (d / gesture.d0), sMin, sMax);
        // the source point under the starting midpoint follows the fingers
        const sx = (gesture.mx - gesture.ox0) / gesture.s0, sy = (gesture.my - gesture.oy0) / gesture.s0;
        S = newS;
        ox = mx - sx * S;
        oy = my - sy * S;
        clampPos();
        apply();
      } else if (gesture.type === 'pan' && p.length === 1) {
        ox = gesture.ox0 + (p[0].x - gesture.x0);
        oy = gesture.oy0 + (p[0].y - gesture.y0);
        clampPos();
        apply();
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!pts.size) stage.classList.remove('dragging');
      startGesture();
      schedulePreview(true);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const p = local(e);
      zoomAt(S * Math.exp(-e.deltaY * unit * 0.0016), p.x, p.y);
    }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const stepPx = e.shiftKey ? 40 : 10;
      let used = true;
      if (e.key === 'ArrowLeft') ox += stepPx;
      else if (e.key === 'ArrowRight') ox -= stepPx;
      else if (e.key === 'ArrowUp') oy += stepPx;
      else if (e.key === 'ArrowDown') oy -= stepPx;
      else if (e.key === '+' || e.key === '=') { zoomBy(1.15); return e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.15); return e.preventDefault(); }
      else used = false;
      if (used) { e.preventDefault(); clampPos(); apply(); }
    });
    zoom.addEventListener('input', () => {
      const t = Number(zoom.value) / 1000;
      zoomAt(sMin * Math.pow(sMax / sMin, t), fw / 2, fh / 2);
    });

    // ---------- live graded preview ----------
    let pvTimer = 0, pvBusy = false, pvAgain = false;
    function schedulePreview(now) {
      clearTimeout(pvTimer);
      pvTimer = setTimeout(renderPreview, now ? 30 : 140);
    }
    async function renderPreview() {
      if (pvBusy) { pvAgain = true; return; }
      pvBusy = true;
      try {
        const c = await previewCrop(source, currentRect(), ratio, strength, 360);
        pv.width = c.width; pv.height = c.height;
        pv.getContext('2d').drawImage(c, 0, 0);
        pv.style.aspectRatio = `${c.width} / ${c.height}`;
      } catch (err) {
        console.warn('[cropper] preview failed', err);
      } finally {
        pvBusy = false;
        if (pvAgain) { pvAgain = false; schedulePreview(true); }
      }
    }

    // ---------- resize ----------
    let ro = null;
    const relayout = () => { const r = currentRect(); layout(r); };
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => relayout());
      ro.observe(stage);
    } else window.addEventListener('resize', relayout);

    // ---------- init ----------
    requestAnimationFrame(() => {
      layout(null);
      const r0 = initialRect && Math.abs((initialRect.w / initialRect.h) / parseRatio(ratio).value - 1) < 0.02
        ? initialRect
        : autoCropRect(srcW, srcH, ratio);
      setFromRect(r0);
      stage.focus({ preventScroll: true });
    });

    const onKey = (e) => { if (e.key === 'Escape') finish(null); else if (e.key === 'Enter' && document.activeElement === stage) finish('ok'); };
    document.addEventListener('keydown', onKey);

    let finished = false;
    function finish(kind) {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', relayout);
      clearTimeout(pvTimer);
      const out = kind === 'ok' ? { rect: currentRect(), ratio, caption: captionInput ? captionInput.value.trim() : undefined }
        : kind === 'skip' ? { skip: true } : null;
      root.classList.remove('in');
      root.classList.add('out');
      setTimeout(() => {
        root.remove();
        if (!document.querySelector('.cropper')) document.body.classList.remove('has-cropper');
      }, 220);
      resolve(out);
    }
  });
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
