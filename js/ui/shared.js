import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.mjs';
import { state, commit } from '../store.js';
import { todayStr, timeStr, dayName } from '../dates.js';

export { html };
export const now = () => { const d = new Date(); return { today: todayStr(d), time: timeStr(d) }; };
export const byId = (list, id) => list.find(x => x.id === id);

// One bottom sheet at a time, built on <dialog> so Android's back gesture closes it.
// openSheet takes a render function, so the sheet re-renders with fresh data.
let setSheet = () => {};
export const openSheet = render => setSheet(() => render);
export const closeSheet = () => setSheet(null);

export function SheetHost() {
  const [render, set] = useState(null);
  setSheet = set;
  return render && html`<${Dialog} onClose=${closeSheet}>${render()}</${Dialog}>`;
}
function Dialog({ onClose, children }) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; d.showModal(); return () => d.open && d.close(); }, []);
  return html`<dialog ref=${ref} class="sheet" onClose=${onClose} onClick=${e => e.target === ref.current && onClose()}>
    <div class="sheet-in"><div class="grab"></div>${children}</div></dialog>`;
}

// A change with a 5-second "Undo" bar. Undo restores the whole data as it was before.
let showUndo = () => {};
export function undoable(label, mutate) {
  const before = structuredClone(state.db);
  commit(mutate);
  showUndo({ label, undo: () => commit(db => { for (const k of Object.keys(db)) delete db[k]; Object.assign(db, structuredClone(before)); }) });
}
export function UndoBar() {
  const [u, set] = useState(null);
  showUndo = set;
  useEffect(() => { if (u) { const t = setTimeout(() => set(null), 5000); return () => clearTimeout(t); } }, [u]);
  return u && html`<div class="undo" role="status"><span>${u.label}</span><button onClick=${() => { set(null); u.undo(); }}>Undo</button></div>`;
}

// ---- form pieces ----
export const Field = ({ label, children }) => html`<label class="field"><span>${label}</span>${children}</label>`;

export function Seg({ options, value, onChange }) {
  return html`<div class="seg">${options.map(([v, text]) =>
    html`<button type="button" class=${v === value ? 'on' : ''} onClick=${() => onChange(v)}>${text}</button>`)}</div>`;
}

export const DURATIONS = [30, 45, 60, 90];
export function Duration({ value, onChange }) {
  return html`<div class="field"><span>Length</span>
    <${Seg} options=${DURATIONS.map(m => [m, `${m}`])} value=${value} onChange=${onChange} />
    <div class="row" style="margin-top:4px"><span class="muted">or minutes:</span>
      <input type="number" min="5" max="600" step="5" inputmode="numeric" style="width:96px" value=${value}
        onInput=${e => +e.target.value > 0 && onChange(+e.target.value)} /></div></div>`;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7].map(d => [d, dayName(d)]);

// Save / Cancel row; the save button is a real tap, which the file permission request needs.
export const Buttons = ({ onSave, saveText = 'Save', extra }) => html`<div class="actions" style="margin-top:14px">
  ${extra}<span class="grow"></span>
  <button class="btn" type="button" onClick=${closeSheet}>Cancel</button>
  <button class="btn pri" type="button" onClick=${onSave}>${saveText}</button></div>`;
