#!/usr/bin/env node
/**
 * build — the production copy of the site in dist/: only what visitors (and the admin) load.
 * No bundling or minifying is needed (the site is plain HTML/CSS/ES modules); this step
 *   • copies the public files (film, admin, assets, data, photos, media, icons) — not tests,
 *     scripts, docs, dev pages or package files,
 *   • checks every local reference: HTML src/href, CSS url(), JS imports, data → photo/media
 *     files, with EXACT case (GitHub Pages is case-sensitive),
 *   • refuses root-absolute paths ("/x"), which would break under https://<user>.github.io/birthday/,
 *   • runs the release checks (content, secrets, photos).
 *   node scripts/build.mjs        → dist/   (exit 1 on any problem)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const PUBLIC = ['index.html', 'site.webmanifest', '.nojekyll', 'assets', 'admin', 'data', 'photos', 'media'];
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db)$/;
const problems = [];

// 1 · release checks first (content, 7,305 days, CSP hash, secrets, photo shapes & metadata)
for (const script of ['scripts/check-assets.mjs', 'scripts/check-photos.mjs']) {
  try { execFileSync(process.execPath, [path.join(ROOT, script)], { stdio: 'pipe' }); } catch (e) { problems.push(`${script} failed:\n${String(e.stdout || '')}${String(e.stderr || '')}`.trim()); }
}

// 2 · copy
fs.rmSync(OUT, { recursive: true, force: true });
const files = [];
const copy = (rel) => {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) { for (const n of fs.readdirSync(src).sort()) copy(path.posix.join(rel, n)); return; }
  if (SKIP.test(rel)) return;
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, rel));
  files.push({ rel, size: st.size });
};
PUBLIC.forEach(copy);
const have = new Set(files.map((f) => f.rel));

// 3 · references (exact case, relative, inside dist)
const isLocal = (u) => u && !/^(https?:|data:|blob:|mailto:|tel:|#|%23|javascript:)/i.test(u) && !u.startsWith('//'); // %23… = an SVG fragment inside a data URI
const check = (from, ref) => {
  if (!isLocal(ref)) return;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return;
  if (clean.startsWith('/')) { problems.push(`${from}: root-absolute path "${ref}" breaks on GitHub Pages project sites`); return; }
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  const t = target.endsWith('/') ? `${target}index.html` : target;
  if (!have.has(t) && !have.has(`${t}/index.html`)) problems.push(`${from}: "${ref}" → ${t} is missing (or differs in upper/lower case)`);
};
for (const { rel } of files) {
  const ext = path.extname(rel);
  if (!['.html', '.css', '.js', '.mjs', '.webmanifest'].includes(ext)) continue;
  if (rel.startsWith('assets/vendor/')) continue; // third-party, self-contained
  const text = fs.readFileSync(path.join(OUT, rel), 'utf8');
  if (ext === '.html') {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) check(rel, m[1]);
    const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(text);
    if (map) for (const v of Object.values(JSON.parse(map[1]).imports || {})) if (!v.endsWith('/')) check(rel, v);
  }
  if (ext === '.css') for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) check(rel, m[1]);
  if (ext === '.js' || ext === '.mjs') {
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) check(rel, m[1]);
    for (const m of text.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) check(rel, m[1]);
  }
  if (ext === '.webmanifest') for (const m of text.matchAll(/"src"\s*:\s*"([^"]+)"/g)) check(rel, m[1]);
}
// data → files
const photos = JSON.parse(fs.readFileSync(path.join(OUT, 'data/photos.json'), 'utf8')).photos || [];
// (paths in the data files are relative to the site root, like index.html's)
for (const p of photos) for (const k of ['src', 'thumb', 'original']) if (p[k]) check('index.html', p[k]);
const settings = JSON.parse(fs.readFileSync(path.join(OUT, 'data/settings.json'), 'utf8'));
for (const k of ['music', 'video', 'voice']) { const v = settings.media && settings.media[k]; if (typeof v === 'string' && v) check('index.html', v); }

// 4 · report
const total = files.reduce((a, f) => a + f.size, 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const sum = (pre) => files.filter((f) => f.rel.startsWith(pre)).reduce((a, f) => a + f.size, 0);
console.log(`dist/: ${files.length} files, ${(total / 1048576).toFixed(1)} MB`);
console.log(`  photos ${kb(sum('photos/') - sum('photos/originals/') - sum('photos/thumbs/'))} display · ${kb(sum('photos/thumbs/'))} thumbs · ${kb(sum('photos/originals/'))} originals (admin only)`);
console.log(`  code ${kb(sum('assets/js/') + sum('admin/'))} · vendor ${kb(sum('assets/vendor/'))} · fonts ${kb(sum('assets/fonts/'))} · css ${kb(sum('assets/css/'))}`);
const big = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map((f) => `${f.rel} ${kb(f.size)}`);
console.log(`  largest: ${big.join(' · ')}`);
if (problems.length) {
  console.log(`\n✗ build: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\n✓ build passed: every reference resolves, no root-absolute paths, release checks clean');
