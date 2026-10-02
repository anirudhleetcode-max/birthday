// The photo grade must stay SUBTLE and natural: skin hue barely moves, nothing turns orange,
// dark photos lift a little, bright ones barely change, per-photo overrides are honoured.
//   node --test tests/admin/grade.test.mjs           (set GRADE_OUT=dir to also write before|after PNGs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeData, skinHue } from '../../assets/js/shared/grade.js';
import { SCENES, makeScene, FACE, meanLuma, meanRGB, satOf, encodePNG, sideBySide } from './synthetic.mjs';

const W = 240;
const H = 180;
const inner = () => { const f = FACE(W, H); return { x: Math.round(f.x + f.w * 0.25), y: Math.round(f.y + f.h * 0.25), w: Math.round(f.w * 0.5), h: Math.round(f.h * 0.5) }; };
const OUT = process.env.GRADE_OUT || '';

for (const name of Object.keys(SCENES)) {
  test(`grade · ${name}: skin hue stable, subtle overall`, () => {
    const before = makeScene(name, W, H);
    const after = gradeData(new Uint8ClampedArray(before), W, H, { strength: 0.85 });
    const r = inner();
    const hb = skinHue(before, W, H, r);
    const ha = skinHue(after, W, H, r);
    assert.ok(Math.abs(ha - hb) <= 2.5, `skin hue moved ${hb.toFixed(1)}° → ${ha.toFixed(1)}°`);
    const sb = satOf(meanRGB(before, W, r));
    const sa = satOf(meanRGB(after, W, r));
    assert.ok(sa <= sb + 0.03, `skin saturation rose ${sb.toFixed(3)} → ${sa.toFixed(3)} (orange risk)`);
    const lb = meanLuma(before);
    const la = meanLuma(after);
    assert.ok(Math.abs(la - lb) < 0.09, `brightness changed too much ${lb.toFixed(3)} → ${la.toFixed(3)}`);
    if (lb < 0.4) assert.ok(la > lb, 'dark photos are lifted a little');
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      const s = sideBySide(before, after, W, H);
      fs.writeFileSync(`${OUT}/${name}.png`, encodePNG(s.data, s.w, s.h));
    }
  });
}

test('grade · strength 0 with no overrides is the identity', () => {
  const before = makeScene('daylight', W, H);
  const after = gradeData(new Uint8ClampedArray(before), W, H, { strength: 0 });
  assert.deepEqual(after, before);
});

test('grade · warmth and exposure overrides are honoured (even at strength 0)', () => {
  const base = makeScene('daylight', W, H);
  const shirt = (() => { const f = FACE(W, H); return { x: f.x, y: f.y + f.h + 8, w: f.w, h: 10 }; })();
  const warm = gradeData(new Uint8ClampedArray(base), W, H, { strength: 0, warmth: 1 });
  const cool = gradeData(new Uint8ClampedArray(base), W, H, { strength: 0, warmth: -1 });
  const [wr, , wb] = meanRGB(warm, W, shirt);
  const [cr, , cb] = meanRGB(cool, W, shirt);
  assert.ok(wr - wb > cr - cb + 6, 'warmer is warmer than cooler');
  const bright = gradeData(new Uint8ClampedArray(base), W, H, { strength: 0.85, exposure: 1 });
  const dark = gradeData(new Uint8ClampedArray(base), W, H, { strength: 0.85, exposure: -1 });
  assert.ok(meanLuma(bright) > meanLuma(dark) + 0.08);
});

test('grade · whites stay clean (no beige), blacks not crushed', () => {
  const img = makeScene('daylight', W, H);
  const out = gradeData(new Uint8ClampedArray(img), W, H, { strength: 0.85 });
  const f = FACE(W, H);
  const shirt = { x: f.x, y: f.y + f.h + 8, w: f.w, h: 10 };
  const [r, g, b] = meanRGB(out, W, shirt);
  assert.ok(r - b < 22, `white shirt turned warm/beige: ${[r, g, b].map(Math.round)}`);
  assert.ok(Math.min(r, g, b) > 190, 'whites stay bright');
  const hair = { x: f.x + 4, y: Math.round(f.y - f.h * 0.22), w: f.w - 8, h: 4 };
  const [hr] = meanRGB(out, W, hair);
  assert.ok(hr > 8, 'shadows keep detail');
});
