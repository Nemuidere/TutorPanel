import { useState, useEffect, useRef } from '../../vendor/preact-htm.mjs';
import { html, openSheet, undoable } from './shared.js';
import { SubjectForm } from './forms.js';
import { state, chooseFolder, reloadFromFile, saveNow, repair, retry, resolveConflict } from '../store.js';
import { live } from '../data.js';
import { todayStr, timeStr, fmtDate } from '../dates.js';

const findIn = (db, list, id) => db[list].find(x => x.id === id);

// Picker errors (e.g. a broken tutorpanel.json in the chosen folder) are shown to the user; cancelling the picker is not an error.
function useFolderPicker() {
  const [error, setError] = useState('');
  const pick = () => chooseFolder().then(() => setError(''), e => e.name !== 'AbortError' && setError(e.message));
  return [pick, error];
}

export function savedText() {
  if (!state.savedAt) return 'No changes saved yet.';
  const d = new Date(state.savedAt);
  return `Saved to the file ${todayStr(d) === todayStr() ? 'today' : fmtDate(todayStr(d))} at ${timeStr(d)}.`;
}

export function Settings() {
  const [pick, pickError] = useFolderPicker();
  const db = state.db, st = state.status;
  const archived = db.students.filter(s => s.archived && !s.deleted).sort((a, b) => a.name.localeCompare(b.name));
  return html`<header><button class="btn icon" onClick=${() => history.back()} aria-label="Back">‹</button><h1>Settings</h1></header>
    <main class="page">
      <div class="box"><h2>Data folder</h2>
        ${st === 'unsupported' ? html`<div>This browser can't save to a folder. Your data stays only inside this browser. Use Chrome on Android.</div>` : html`
          <div><b>${state.dir?.name ?? '?'}</b> · tutorpanel.json</div>
          <div class="muted">${st === 'unsaved' ? 'Not saved to the file yet.' : st === 'missing' ? 'The data folder was not found.' : savedText()}</div>
          ${st === 'broken' && html`<div class="warnbox">tutorpanel.json can't be used: ${state.error}
            <div class="actions"><button class="btn" onClick=${() => repair('app')}>Use the app's copy</button>
              <button class="btn" onClick=${() => repair('daily')}>Use the newest daily copy</button>
              <button class="btn" onClick=${retry}>Try again</button></div>
            <div class="muted">The broken file is kept in the folder as tutorpanel-replaced-….json.</div></div>`}
          <div class="actions">
            ${st === 'unsaved' && html`<button class="btn pri" onClick=${saveNow}>Save now</button>`}
            <button class="btn" onClick=${pick}>${st === 'missing' ? 'Choose folder' : 'Change folder'}</button>
            <button class="btn" onClick=${reloadFromFile}>Reload from file</button></div>
          ${pickError && html`<div class="warnbox">${pickError}</div>`}
          <div class="muted" style="margin-top:6px">A dated copy is saved every day (the last 14 are kept).</div>`}
      </div>

      <div class="box"><h2>Subjects</h2>
        ${live(db.subjects).map(x => html`<div class="item" onClick=${() => openSheet(() => html`<${SubjectForm} subjectId=${x.id} />`)}>
          <span class="swatch" style="background:${x.color}"></span><span class="grow">${x.name}</span></div>`)}
        <div class="actions"><button class="btn" onClick=${() => openSheet(() => html`<${SubjectForm} />`)}>+ Subject</button></div></div>

      <div class="box"><h2>Archive</h2>
        ${archived.map(s => html`<div class="item"><span class="grow">${s.name}</span>
          <button class="btn" onClick=${() => undoable(`${s.name} restored`, d => { findIn(d, 'students', s.id).archived = false; })}>Restore</button></div>`)}
        ${!archived.length && html`<i class="muted">No archived students.</i>`}</div>
    </main>`;
}

export function Welcome() {
  const [pick, error] = useFolderPicker();
  return html`<main class="welcome"><h1>TutorPanel</h1>
    <p>Choose a folder for your data, for example <b>Documents/TutorPanel</b> (you can create it in the picker).</p>
    <p class="muted">The app saves <b>tutorpanel.json</b> there after every change, plus a dated copy each day.
      If the folder already has your data (a new phone, or after clearing Chrome), it's loaded from there.</p>
    <button class="btn pri big" onClick=${pick}>Choose data folder</button>
    ${error && html`<div class="warnbox">${error}</div>`}</main>`;
}

export function ConflictDialog() {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); }, []);
  return html`<dialog ref=${ref} class="sheet" onCancel=${e => e.preventDefault()}><div class="sheet-in">
    <h3>Your data changed in two places</h3>
    <p>The app has changes that weren't saved to the file yet, and tutorpanel.json was changed outside the app. Which one do you want to keep?</p>
    <p class="muted">The other version is saved in the folder as tutorpanel-replaced-….json, so nothing is lost.</p>
    <div class="actions"><button class="btn" onClick=${() => resolveConflict('file')}>Keep the file's version</button>
      <button class="btn pri" onClick=${() => resolveConflict('app')}>Keep the app's version</button></div></div></dialog>`;
}
