// Loads data/site.json (or the admin's unpublished draft) and resolves photos.
import { placeholderURL } from './placeholders.js';

export function parseRatio(str) {
  const [w, h] = String(str || '1:1').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

async function loadDraftSafe() {
  try {
    const mod = await import('../shared/drafts.js');
    return await mod.loadDraft();
  } catch (err) {
    console.warn('[data] no draft available', err);
    return null;
  }
}

export async function loadSite({ draft = false } = {}) {
  let site = null;
  let files = null;
  if (draft) {
    const d = await loadDraftSafe();
    if (d && d.site) {
      site = d.site;
      files = d.files;
    }
  }
  if (!site) {
    const res = await fetch(`data/site.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`site.json ${res.status}`);
    site = await res.json();
  }
  return createStore(site, files);
}

function createStore(site, files) {
  const blobUrls = new Map();
  const resolve = (path) => {
    if (!path) return null;
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    if (files && files.get && files.get(path)) {
      if (!blobUrls.has(path)) blobUrls.set(path, URL.createObjectURL(files.get(path)));
      return blobUrls.get(path);
    }
    return path;
  };

  const slots = new Map((site.slots || []).map((s, i) => [s.id, { ...s, index: i }]));

  const toPhoto = (s, index, kind = 'slot') => {
    const ratio = parseRatio(s.ratio);
    const url = resolve(s.src);
    return {
      id: s.id,
      kind,
      label: s.label || '',
      caption: s.caption || '',
      ratio,
      ratioStr: s.ratio || '1:1',
      isPlaceholder: !url,
      url: url || placeholderURL({ id: s.id, label: s.label, ratio, index }),
    };
  };

  return {
    site,
    text: site.text || {},
    media: site.media || {},
    photo(id) {
      const s = slots.get(id);
      if (!s) return toPhoto({ id, ratio: '1:1', label: id }, 0);
      return toPhoto(s, s.index);
    },
    chapter(name) {
      return (site.slots || []).filter((s) => s.chapter === name).map((s) => this.photo(s.id));
    },
    extras() {
      return (site.extras || []).filter((x) => x.src).map((x, i) => toPhoto(x, 40 + i, 'extra'));
    },
    all() {
      return [...(site.slots || []).map((s) => this.photo(s.id)), ...this.extras()];
    },
    real() {
      return this.all().filter((p) => !p.isPlaceholder);
    },
    mediaUrl(key) {
      return resolve(site.media && site.media[key]);
    },
  };
}

// Decode an image ahead of time so reveals never pop in half-loaded.
const decoded = new Map();
export function preload(url) {
  if (!url) return Promise.resolve(null);
  if (decoded.has(url)) return decoded.get(url);
  const p = new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(img));
    img.onerror = () => res(null);
    img.src = url;
  });
  decoded.set(url, p);
  return p;
}
