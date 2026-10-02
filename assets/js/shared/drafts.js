/**
 * drafts.js — shared draft storage between the admin portal and the public site.
 *
 * IndexedDB database "deepu-admin" (version 1), object store "drafts" (out-of-line keys):
 *   "site"    → the full draft site object (structured clone)
 *   "files"   → plain object { "photos/tower-3-20261102-101500.jpg": Blob, ... }
 *   "deleted" → array of repo paths that will be deleted on publish
 *   "savedAt" → ISO timestamp of the last save
 *   "base"    → (admin-only, optional) the published site the draft was started from
 *
 * The public site calls loadDraft() when opened with ?draft and resolves any path found
 * in `files` to a blob: URL. New photos therefore already carry their final `src` paths
 * inside the draft site object, and the Blob is stored under that same path key.
 *
 * No dependencies. ES module.
 */

const DB_NAME = 'deepu-admin';
const DB_VERSION = 1;
const STORE = 'drafts';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support saving drafts (IndexedDB is unavailable).'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab upgrades the DB, let go of our handle so it is not blocked.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open the draft database.'));
    req.onblocked = () => reject(new Error('The draft database is busy in another tab.'));
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Draft transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Draft transaction was aborted.'));
  });
}

function reqValue(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function filesToObject(files) {
  const out = {};
  if (!files) return out;
  if (files instanceof Map) {
    for (const [path, blob] of files) out[path] = blob;
  } else {
    for (const path of Object.keys(files)) out[path] = files[path];
  }
  return out;
}

/**
 * Save (overwrite) the draft.
 * @param {object} site  full site object (plain JSON-compatible data)
 * @param {Map<string, Blob>|Object<string, Blob>|undefined} files  new, not-yet-published files
 *        keyed by their final repo path. Pass `undefined` to keep the files already stored
 *        (cheap save when only words/settings changed).
 * @param {{deleted?: string[], base?: object}} [opts]  admin extras: paths to delete on
 *        publish, and the published site the draft is based on.
 */
export async function saveDraft(site, files, opts = {}) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const done = txDone(tx);
  store.put(site, 'site');
  if (files !== undefined) store.put(filesToObject(files), 'files');
  store.put(Array.from(opts.deleted || []), 'deleted');
  if (opts.base !== undefined) store.put(opts.base, 'base');
  store.put(new Date().toISOString(), 'savedAt');
  await done;
}

/**
 * Load the draft.
 * @returns {Promise<{site: object, files: Map<string, Blob>, deleted: string[], savedAt: string|null, base: object|null} | null>}
 */
export async function loadDraft() {
  let db;
  try {
    db = await openDb();
  } catch (err) {
    console.warn('[drafts] unavailable:', err);
    return null;
  }
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const [site, filesObj, deleted, savedAt, base] = await Promise.all([
    reqValue(store.get('site')),
    reqValue(store.get('files')),
    reqValue(store.get('deleted')),
    reqValue(store.get('savedAt')),
    reqValue(store.get('base')),
  ]);
  if (!site) return null;
  const files = new Map();
  if (filesObj) for (const path of Object.keys(filesObj)) files.set(path, filesObj[path]);
  return {
    site,
    files,
    deleted: Array.isArray(deleted) ? deleted : [],
    savedAt: savedAt || null,
    base: base || null,
  };
}

/** Remove everything from the draft store. */
export async function clearDraft() {
  let db;
  try {
    db = await openDb();
  } catch (err) {
    console.warn('[drafts] unavailable:', err);
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  const done = txDone(tx);
  tx.objectStore(STORE).clear();
  await done;
}
