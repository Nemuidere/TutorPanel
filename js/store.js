// Data lives in two places:
//   - a working copy in IndexedDB, so the app opens instantly and works without any taps;
//   - the real file tutorpanel.json in a folder the user picked (e.g. Documents/TutorPanel), plus one dated copy per day.
// Chrome on Android forgets folder permission between launches, so the first change of a session asks "Allow" once.
// Every change goes through commit(mutate). A mutation must look records up by id inside `db`,
// because it may be re-applied on top of a file that was edited by hand.
// Functions marked "tap" must be called straight from a tap handler: the permission request needs that tap.

import { emptyDb, parseDb, serialize } from './data.js';
import { todayStr, timeStr } from './dates.js';

const FILE = 'tutorpanel.json', KEEP_DAILY = 14, DAILY = /^tutorpanel-\d{4}-\d{2}-\d{2}\.json$/;

let idbP;
const idb = () => idbP ??= new Promise((res, rej) => {
  const r = indexedDB.open('tutorpanel', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = (mode, fn) => idb().then(d => new Promise((res, rej) => {
  const t = d.transaction('kv', mode), out = fn(t.objectStore('kv'));
  t.oncomplete = () => res(out);
  t.onerror = () => rej(t.error);
}));

export const state = {
  db: null,          // the data; change it only through commit()
  dir: null,         // FileSystemDirectoryHandle of the data folder
  granted: false,    // folder permission granted in this session
  status: 'ok',      // ok | unsaved | broken | conflict | missing | no-folder | unsupported
  error: '',
  savedAt: null,     // last successful write to the file (ms)
  conflict: null,    // data read from the file when both the app and the file changed
  supported: 'showDirectoryPicker' in window,
};
let meta = { dirty: false, stamp: null, daily: null, savedAt: null };
let pending = [], dirtyFromEarlier = false, asking = null, timer = 0, chain = Promise.resolve();

const listeners = new Set();
export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach(fn => fn());
const setStatus = (status, error = '') => { state.status = status; state.error = error; emit(); };
const saveLocal = () => tx('readwrite', s => { s.put(state.db, 'data'); s.put(meta, 'meta'); });
const serial = fn => (chain = chain.then(() => fn()));   // one file operation at a time; each fn handles its own errors

export async function init() {
  navigator.storage?.persist?.();
  const [db, m, dir] = await tx('readonly', s => ['data', 'meta', 'dir'].map(k => s.get(k))).then(r => r.map(x => x.result), () => []);
  state.db = db ?? null; meta = { ...meta, ...m }; state.dir = dir ?? null; state.savedAt = meta.savedAt;
  dirtyFromEarlier = meta.dirty;
  document.addEventListener('visibilitychange', () => {
    if (!state.granted) return;
    if (document.visibilityState === 'hidden') { clearTimeout(timer); serial(flush); }   // leaving the app: save now
    else if (!meta.dirty) serial(refreshFromFile);                                        // back again: pick up hand edits
  });
  if (!state.supported) { state.db ??= emptyDb(); state.status = 'unsupported'; return; }
  if (!state.dir || !state.db) { state.status = 'no-folder'; return; }
  state.status = meta.dirty ? 'unsaved' : 'ok';
  state.granted = (await state.dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted';
  if (state.granted) await serial(meta.dirty ? flush : refreshFromFile);
}

// tap: ask for folder permission once per session.
function ensureGranted() {
  if (state.granted) return Promise.resolve(true);
  return asking ??= state.dir.requestPermission({ mode: 'readwrite' })
    .then(p => (state.granted = p === 'granted'), () => false)
    .finally(() => { asking = null; });
}

// tap: apply a change to the working copy, then save it to the file.
export function commit(mutate) {
  mutate(state.db);
  pending.push(mutate);
  meta.dirty = true;
  saveLocal().catch(() => {});
  if (state.status === 'ok') state.status = 'unsaved';
  emit();
  if (!state.dir) return;
  ensureGranted().then(ok => ok ? scheduleWrite() : emit());
}

// tap: "Save now" after "Don't allow".
export const saveNow = () => ensureGranted().then(ok => ok && scheduleWrite(0));

function scheduleWrite(delay = 500) {
  clearTimeout(timer);
  timer = setTimeout(() => serial(flush), delay);
}

const stampOf = f => f.size + ':' + f.lastModified;
async function writeFile(name, text) {
  const w = await (await state.dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}
async function readMain() {
  const f = await (await state.dir.getFileHandle(FILE, { create: true })).getFile();
  return { text: await f.text(), stamp: stampOf(f) };
}
async function dailyNames() {
  const names = [];
  for await (const name of state.dir.keys()) if (DAILY.test(name)) names.push(name);
  return names.sort();
}
const keepAside = text => writeFile(`tutorpanel-replaced-${todayStr()}-${timeStr().replace(':', '')}.json`, text);

function fail(e) {
  if (e?.name === 'SyntaxError' || e?.name === 'FormatError') setStatus('broken', e.message);
  else if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { state.granted = false; setStatus('unsaved'); }
  else if (e?.name === 'NotFoundError') setStatus('missing');
  else setStatus('broken', e?.message || String(e));
}

// Write the working copy to the file. If the file was edited outside the app, load it first and re-apply this session's changes.
async function flush() {
  if (!state.dir || !state.granted || !meta.dirty || state.status === 'conflict') return;
  try {
    const { text, stamp } = await readMain();
    let fromFile = null;
    // A broken file is only overwritten after the user chose so in repair() (which sets meta.stamp to the broken file's stamp).
    if (text.trim()) try { fromFile = parseDb(text); } catch (e) { if (stamp !== meta.stamp) throw e; }
    if (fromFile && stamp !== meta.stamp) {
      if (dirtyFromEarlier) { state.conflict = fromFile; return setStatus('conflict'); }
      state.db = fromFile;
      for (const m of pending) m(state.db);
    }
    const today = todayStr();
    if (meta.daily !== today && fromFile) {
      await writeFile(`tutorpanel-${today}.json`, text);   // the data as it was before today's first change
      for (const name of (await dailyNames()).reverse().slice(KEEP_DAILY)) await state.dir.removeEntry(name).catch(() => {});
    }
    const n = pending.length;
    await writeFile(FILE, serialize(state.db));
    const f = await (await state.dir.getFileHandle(FILE)).getFile();
    pending = pending.slice(n);
    meta = { ...meta, dirty: pending.length > 0, stamp: stampOf(f), daily: today, savedAt: Date.now() };
    dirtyFromEarlier = false;
    state.savedAt = meta.savedAt;
    await saveLocal();
    setStatus(meta.dirty ? 'unsaved' : 'ok');
    if (meta.dirty) scheduleWrite();
  } catch (e) { fail(e); }
}

// Pick up a hand-edited file (on start and when the app comes back to the foreground).
async function refreshFromFile() {
  try {
    const { text, stamp } = await readMain();
    if (!text.trim() || stamp === meta.stamp) return;
    state.db = parseDb(text);
    meta = { ...meta, stamp };
    await saveLocal();
    setStatus(meta.dirty ? 'unsaved' : 'ok');
  } catch (e) { fail(e); }
}

// ---- User actions (all "tap") ----

// First run, new phone, or "Change folder". Throws a readable error if the folder's tutorpanel.json is broken.
export async function chooseFolder() {
  const dir = await window.showDirectoryPicker({ id: 'tutorpanel', mode: 'readwrite' });
  let text = '', stamp = null;
  try { const f = await (await dir.getFileHandle(FILE)).getFile(); text = await f.text(); stamp = stampOf(f); }
  catch (e) { if (e.name !== 'NotFoundError') throw e; }
  const fromFile = text.trim() ? parseDb(text) : null;
  state.dir = dir; state.granted = true;
  await tx('readwrite', s => { s.put(dir, 'dir'); });
  const hasData = state.db?.students.length > 0;
  if (fromFile && hasData && serialize(fromFile) !== serialize(state.db)) {
    meta = { ...meta, stamp }; dirtyFromEarlier = true; state.conflict = fromFile;
    return setStatus('conflict');
  }
  if (fromFile) {
    state.db = fromFile; pending = []; dirtyFromEarlier = false;
    meta = { ...meta, dirty: false, stamp };
    await saveLocal();
    return setStatus('ok');
  }
  state.db ??= emptyDb();
  meta = { ...meta, dirty: true, stamp: null };
  await saveLocal();
  state.status = 'unsaved';
  await serial(flush);
}

// Both the app and the file changed: keep one, and put the other aside in the folder so nothing is lost.
export async function resolveConflict(keep) {
  if (!(await ensureGranted())) return;
  await serial(async () => {
    try {
      await keepAside(serialize(keep === 'app' ? state.conflict : state.db));
      if (keep === 'file') { state.db = state.conflict; pending = []; }
      meta = { ...meta, dirty: true, stamp: (await readMain()).stamp };
      state.conflict = null; dirtyFromEarlier = false; state.status = 'unsaved';
      await flush();
    } catch (e) { fail(e); }
  });
}

// The file can't be read: overwrite it with the app's copy or the newest daily copy. The broken file is put aside.
export async function repair(source) {
  if (!(await ensureGranted())) return;
  await serial(async () => {
    try {
      const { text, stamp } = await readMain();
      if (source === 'daily') {
        const newest = (await dailyNames()).at(-1);
        if (!newest) return setStatus('broken', 'There is no daily copy in the folder.');
        state.db = parseDb(await (await (await state.dir.getFileHandle(newest)).getFile()).text());
        pending = [];
      }
      if (text.trim()) await keepAside(text);
      meta = { ...meta, dirty: true, stamp };
      dirtyFromEarlier = false; state.status = 'unsaved';
      await flush();
    } catch (e) { fail(e); }
  });
}

// Use the file's version now (after a hand edit). Unsaved app changes are put aside first.
export async function reloadFromFile() {
  if (!(await ensureGranted())) return setStatus('unsaved');
  await serial(async () => {
    try {
      const { text, stamp } = await readMain();
      const fromFile = parseDb(text);
      if (meta.dirty && serialize(fromFile) !== serialize(state.db)) await keepAside(serialize(state.db));
      state.db = fromFile; pending = []; dirtyFromEarlier = false;
      meta = { ...meta, dirty: false, stamp };
      await saveLocal();
      setStatus('ok');
    } catch (e) { fail(e); }
  });
}

// "Try again" after an error.
export async function retry() {
  if (!(await ensureGranted())) return setStatus('unsaved');
  state.status = 'unsaved';
  await serial(meta.dirty ? flush : refreshFromFile);
  if (state.status === 'unsaved' && !meta.dirty) setStatus('ok');
}
