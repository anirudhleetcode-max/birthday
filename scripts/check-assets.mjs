#!/usr/bin/env node
// Release check: content files are valid, every referenced file exists, nothing secret is committed.
//   node scripts/check-assets.mjs        (exit code 1 on errors)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combine, validate, usedFiles, daysAlive, FILES } from '../assets/js/shared/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const rel = (p) => path.relative(root, p);
const exists = (p) => fs.existsSync(path.join(root, p));

// 1. content
let site;
try {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  site = combine({ settings: read(FILES.settings), messages: read(FILES.messages), photos: read(FILES.photos) });
} catch (e) {
  errors.push(`content files unreadable: ${e.message}`);
}
if (site) {
  const v = validate(site);
  v.errors.forEach((e) => errors.push(`content: ${e.message}`));
  v.warnings.forEach((w) => warnings.push(`content: ${w.message}`));
  for (const f of usedFiles(site)) if (!/^(https?:|data:)/.test(f) && !exists(f)) errors.push(`missing file referenced by content: ${f}`);
  const d = daysAlive(site);
  if (site.settings.lock.unlockAt.startsWith('2027-01-03') && d !== 7305) errors.push(`daysAlive should be 7305 on 2027-01-03, got ${d}`);
  console.log(`content: ${site.photos.length} photo records (${site.photos.filter((p) => p.src).length} with images), days alive at unlock: ${d}`);
}

// 2. html / css / js references
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="(?!https?:|data:|#)([^"]+)"/g)) if (!exists(m[1].replace(/^\.\//, ''))) errors.push(`index.html references missing ${m[1]}`);
const adminHtml = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8');
for (const m of adminHtml.matchAll(/(?:href|src)="(?!https?:|data:|#)([^"]+)"/g)) if (!exists(path.join('admin', m[1]))) errors.push(`admin/index.html references missing ${m[1]}`);
const fontsCss = fs.readFileSync(path.join(root, 'assets/fonts/fonts.css'), 'utf8');
for (const m of fontsCss.matchAll(/url\(([^)]+)\)/g)) if (!exists(path.join('assets/fonts', m[1].replace(/['"]/g, '')))) errors.push(`fonts.css references missing ${m[1]}`);
const main = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
for (const m of main.matchAll(/import\('\.\/([^']+)'\)/g)) {
  const f = path.join('assets/js', m[1]);
  if (!exists(f)) (m[1].includes('video') ? warnings : errors).push(`main.js lazy-loads missing ${f}`);
}
const og = html.match(/property="og:image" content="([^"]+)"/);
if (!og) errors.push('index.html has no og:image');
else if (!exists(og[1].replace(/^https:\/\/[^/]+\/[^/]+\//, ''))) errors.push(`og:image file missing: ${og[1]}`);

// 2b. the CSP must allow the inline import map (hash must match its exact text)
{
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if (map && csp) {
    const { createHash } = await import('node:crypto');
    const h = createHash('sha256').update(map[1]).digest('base64');
    if (!csp[1].includes(`'sha256-${h}'`)) errors.push(`CSP script hash does not match the import map — update index.html CSP to 'sha256-${h}'`);
  }
}

// 3. secrets & size
const SECRET = /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const st = fs.statSync(p);
      if (st.size > 95 * 1024 * 1024) errors.push(`file too large for GitHub: ${rel(p)}`);
      else if (st.size > 25 * 1024 * 1024) warnings.push(`large file: ${rel(p)} (${(st.size / 1e6).toFixed(1)} MB)`);
      if (st.size < 2e6 && /\.(js|json|html|css|md|txt|cjs|mjs)$/.test(p)) {
        const text = fs.readFileSync(p, 'utf8');
        const hits = [...text.matchAll(new RegExp(SECRET.source, 'g'))].map((m) => m[0]).filter((t) => !/SECRET|TEST|EXAMPLE|FAKE|unit|QA0/i.test(t));
        if (hits.length) errors.push(`possible secret in ${rel(p)}`);
      }
    }
  }
}
walk(root);

warnings.forEach((w) => console.log('warn ', w));
errors.forEach((e) => console.log('ERROR', e));
console.log(errors.length ? `\n✗ ${errors.length} error(s)` : '\n✓ release check passed');
process.exit(errors.length ? 1 : 0);
