/**
 * github.js — tiny GitHub REST client for the admin portal (browser + Node-testable).
 *
 * Reads data/settings.json, data/messages.json and data/photos.json through the
 * Contents API (fresh, no CDN, decoded as UTF-8) and publishes everything as ONE
 * commit through the Git Data API:
 *   GET ref → GET commit → GET the three files @commit → GET tree (recursive)
 *   → POST blobs → POST tree (base_tree; new files, changed JSON, sha:null deletions)
 *   → POST commit → PATCH ref   (409/422 on the way → re-fetch, re-merge, retry once)
 *
 * `fetch` is injectable so request building can be unit-checked with a mock.
 */
import { FILES, LEGACY_FILE, combine, upgrade } from '../assets/js/shared/model.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status = 0, data = null, code = '') {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

/** True only for https://api.github.com/… (exact origin) — the one place the token may go. */
export function isApiUrl(url) {
  try { const u = new URL(url); return u.origin === API && u.username === '' && u.password === ''; } catch { return false; }
}

/** Encode each segment of a repo path (keeps the slashes). */
export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

/** base64 (possibly with newlines) → UTF-8 string, properly (TextDecoder). */
export function decodeBase64Utf8(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Blob → base64 string (no data: prefix). */
export async function blobToBase64(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = () => reject(fr.error || new Error('Could not read the file.'));
      fr.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** The JSON text we write: 2-space indent + trailing newline. */
export const jsonText = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

export class GitHub {
  /**
   * @param {{owner:string, repo:string, branch?:string, token?:string, fetch?:Function}} cfg
   */
  constructor({ owner, repo, branch = 'main', token = '', fetch: fetchImpl } = {}) {
    this.owner = String(owner || '').trim();
    this.repo = String(repo || '').trim();
    this.branch = String(branch || 'main').trim() || 'main';
    this.token = String(token || '').trim();
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  }

  get repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  /** Friendly, non-technical message for an HTTP status. */
  friendly(status, data, headers) {
    const msg = (data && data.message) || '';
    const where = `${this.owner}/${this.repo}`;
    switch (status) {
      case 0: return 'Couldn’t reach GitHub. Check your internet connection and try again.';
      case 401: return 'GitHub didn’t accept the token. It may be mistyped, expired or revoked — paste a fresh one (Settings → GitHub).';
      case 403:
        if (/rate limit/i.test(msg) || (headers && headers.get && headers.get('x-ratelimit-remaining') === '0')) {
          return 'GitHub says there have been too many requests. Please wait a few minutes and try again.';
        }
        return `This token isn’t allowed to change ${where}. When creating it, choose “Only select repositories” → ${this.repo}, and set Repository permissions → Contents → “Read and write”.`;
      case 404: return `Couldn’t find ${where} (branch “${this.branch}”). Check the owner / repository / branch in Settings → GitHub, and that the token was given access to this repository.`;
      case 409: return /empty/i.test(msg)
        ? 'The repository is empty. Push the website files to it first, then publish from here.'
        : 'Someone else changed the site at the same moment. Please try publishing again.';
      case 413: return 'That file is too big for GitHub. Try a smaller or shorter file.';
      case 422: return /fast.?forward/i.test(msg)
        ? 'Someone else changed the site at the same moment. Please try publishing again.'
        : `GitHub rejected the change${msg ? ` (“${msg}”)` : ''}. Please try again.`;
      default:
        if (status >= 500) return 'GitHub is having trouble right now. Please try again in a minute.';
        return `GitHub error ${status}${msg ? `: ${msg}` : ''}.`;
    }
  }

  /**
   * Low-level request. `path` is relative to /repos/{owner}/{repo} unless `absolute`.
   * @returns parsed JSON, a Blob (raw), or null (204)
   */
  async request(method, path, body, { raw = false, absolute = false } = {}) {
    const url = API + (absolute ? path : this.repoPath + path);
    const headers = {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    // The token travels ONLY to https://api.github.com, ONLY in this header — never in a URL.
    if (this.token) {
      if (!isApiUrl(url)) throw new GitHubError('Refusing to send the GitHub token anywhere but api.github.com.', 0, null, 'origin');
      headers.Authorization = `Bearer ${this.token}`;
    }
    // no cookies, no referrer (the admin's address isn't GitHub's business)
    const init = { method, headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await this.fetch(url, init);
    } catch {
      throw new GitHubError(this.friendly(0), 0, null, 'network');
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* not json */ }
      throw new GitHubError(this.friendly(res.status, data, res.headers), res.status, data);
    }
    if (raw) return res.blob();
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** Verify the token can see the repo and the branch exists. */
  async check() {
    if (!this.owner || !this.repo) throw new GitHubError('Please fill in the GitHub owner and repository names.', 0, null, 'config');
    const repo = await this.request('GET', '');
    await this.request('GET', `/branches/${encodePath(this.branch)}`).catch((err) => {
      if (err.status === 404) throw new GitHubError(`The repository was found, but it has no branch called “${this.branch}”. Check the branch in Settings → GitHub.`, 404, err.data, 'branch');
      throw err;
    });
    const perms = repo && repo.permissions;
    return {
      fullName: repo.full_name,
      private: !!repo.private,
      canPush: perms ? !!(perms.push || perms.admin || perms.maintain) : null,
      defaultBranch: repo.default_branch,
    };
  }

  /** GET a text file via the Contents API, decoded as UTF-8. */
  async getText(path, ref = this.branch) {
    const q = `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
    const data = await this.request('GET', q);
    if (Array.isArray(data)) throw new GitHubError(`${path} is a folder, not a file.`, 0, null, 'notfile');
    if (data.encoding === 'base64' && typeof data.content === 'string' && (data.content.length || !data.size)) {
      return { text: decodeBase64Utf8(data.content), sha: data.sha };
    }
    // > 1 MB files come back without content → ask for the raw bytes
    const blob = await this.request('GET', q, undefined, { raw: true });
    return { text: await blob.text(), sha: data.sha };
  }

  async getJSON(path, ref = this.branch) {
    const { text, sha } = await this.getText(path, ref);
    try {
      return { json: JSON.parse(text), text, sha };
    } catch {
      throw new GitHubError(`${path} on GitHub isn’t valid JSON. Fix it on GitHub (or restore an older version) and try again.`, 0, null, 'json');
    }
  }

  /**
   * The published content: the three v2 files combined (or an old data/site.json, upgraded).
   * @returns {Promise<{site: object, texts: {settings?:string, messages?:string, photos?:string}, legacy: boolean}>}
   */
  async getContent(ref = this.branch) {
    const keys = Object.keys(FILES);
    const got = await Promise.all(keys.map((k) => this.getJSON(FILES[k], ref).catch((err) => {
      if (err.status === 404) return null;
      throw err;
    })));
    if (got.every((g) => g === null)) {
      const legacy = await this.getJSON(LEGACY_FILE, ref).catch((err) => {
        if (err.status === 404) throw new GitHubError(`The repository has no ${FILES.settings} / ${FILES.messages} / ${FILES.photos}. Push the website files first.`, 404, null, 'nocontent');
        throw err;
      });
      return { site: upgrade(legacy.json), texts: {}, legacy: true };
    }
    const parts = {};
    const texts = {};
    keys.forEach((k, i) => { if (got[i]) { parts[k] = got[i].json; texts[k] = got[i].text; } });
    return { site: combine(parts), texts, legacy: false };
  }

  /** Raw bytes of any file as a Blob. */
  async getBlob(path, ref = this.branch) {
    return this.request('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, { raw: true });
  }

  /** Public raw URL (works without a token for public repos). */
  rawUrl(path) {
    return `https://raw.githubusercontent.com/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/${encodePath(this.branch)}/${encodePath(path)}`;
  }

  /**
   * Publish in ONE commit.
   * @param {{
   *   message: string,
   *   prepare: (remote: {site, texts}, existing: Set<string>) => ({site: object, json: Object<string, object>, files: Map<string, Blob>, deletes: string[]} | Promise<…>),
   *   onProgress?: (fraction: number, label: string) => void,
   * }} opts
   *   `json` maps repo paths (data/*.json) to objects; only include files that changed.
   * @returns {Promise<{commitSha: string, site: object, uploaded: string[], written: string[], deleted: string[], retried: boolean}>}
   */
  async publish({ message, prepare, onProgress = () => {} }) {
    const uploadedShas = new Map(); // Blob → sha (re-used on retry)
    let retried = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        onProgress(0.02, attempt ? 'Fetching the newest version…' : 'Checking the live site…');
        const ref = await this.request('GET', `/git/ref/heads/${encodePath(this.branch)}`);
        const headSha = ref.object.sha;
        const commit = await this.request('GET', `/git/commits/${headSha}`);
        const baseTree = commit.tree.sha;
        const remote = await this.getContent(headSha);
        const treeData = await this.request('GET', `/git/trees/${baseTree}?recursive=1`);
        const existing = new Set((treeData.tree || []).filter((e) => e.type === 'blob').map((e) => e.path));

        const plan = await prepare(remote, existing);
        const files = plan.files instanceof Map ? plan.files : new Map(Object.entries(plan.files || {}));
        const entries = [];
        const total = files.size;
        let i = 0;
        for (const [path, blob] of files) {
          const label = /^media\//.test(path) ? 'file' : 'image';
          onProgress(0.08 + 0.76 * (i / Math.max(1, total)), `Uploading ${label} ${i + 1} of ${total}…`);
          let sha = uploadedShas.get(blob);
          if (!sha) {
            const content = await blobToBase64(blob);
            const res = await this.request('POST', '/git/blobs', { content, encoding: 'base64' });
            sha = res.sha;
            uploadedShas.set(blob, sha);
          }
          entries.push({ path, mode: '100644', type: 'blob', sha });
          i++;
        }
        onProgress(0.86, 'Saving your words, photos & settings…');
        const written = [];
        for (const [path, obj] of Object.entries(plan.json || {})) {
          entries.push({ path, mode: '100644', type: 'blob', content: jsonText(obj) });
          written.push(path);
        }
        const deleted = [];
        for (const p of plan.deletes || []) {
          if (existing.has(p) && !files.has(p) && !written.includes(p)) {
            entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
            deleted.push(p);
          }
        }
        if (!entries.length) {
          onProgress(1, 'Nothing to change.');
          return { commitSha: headSha, site: plan.site, uploaded: [], written, deleted, retried, noop: true };
        }
        const tree = await this.request('POST', '/git/trees', { base_tree: baseTree, tree: entries });
        onProgress(0.93, 'Creating the update…');
        const newCommit = await this.request('POST', '/git/commits', { message, tree: tree.sha, parents: [headSha] });
        onProgress(0.97, 'Publishing…');
        await this.request('PATCH', `/git/refs/heads/${encodePath(this.branch)}`, { sha: newCommit.sha, force: false });
        onProgress(1, 'Published!');
        return { commitSha: newCommit.sha, site: plan.site, uploaded: [...files.keys()], written, deleted, retried };
      } catch (err) {
        if (attempt === 0 && err instanceof GitHubError && (err.status === 409 || err.status === 422) && !/empty/i.test((err.data && err.data.message) || '')) {
          retried = true;
          onProgress(0.05, 'The site changed meanwhile — merging and retrying…');
          continue;
        }
        throw err;
      }
    }
    throw new GitHubError('Publishing failed after a retry. Please try again.', 0, null, 'retry');
  }
}
