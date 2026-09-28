import { render, useReducer, useErrorBoundary } from '../vendor/preact-htm.mjs';
import { html, now, SheetHost, UndoBar } from './ui/shared.js';
import { state, init, subscribe, saveNow, chooseFolder } from './store.js';
import { mondayOf } from './dates.js';
import { Students } from './ui/students.js';
import { Student } from './ui/student.js';
import { Lessons } from './ui/lessons.js';
import { Settings, Welcome, ConflictDialog } from './ui/settings.js';

function Banner() {
  const st = state.status;
  if (st === 'unsaved' && state.dir && !state.granted)
    return html`<div class="banner"><span class="grow">Not saved to the file yet.</span><button class="btn" onClick=${saveNow}>Save now</button></div>`;
  if (st === 'broken') return html`<div class="banner bad"><span class="grow">The data file can't be read.</span><a class="btn" href="#/settings">Settings</a></div>`;
  if (st === 'missing') return html`<div class="banner bad"><span class="grow">Data folder not found.</span><button class="btn" onClick=${() => chooseFolder().catch(() => {})}>Choose folder</button></div>`;
  if (st === 'unsupported') return html`<div class="banner"><span class="grow">This browser can't save a data file. Use Chrome.</span></div>`;
  return null;
}

// A value in the data that the screens can't handle (e.g. after a hand edit) shows a message instead of a blank page.
function Guard({ children }) {
  const [error] = useErrorBoundary();
  if (!error) return children;
  return html`<main class="welcome"><h1>Something can't be shown</h1><div class="warnbox">${String(error.message || error)}</div>
    <p class="muted">If you edited tutorpanel.json by hand, fix it, then use Reload from file.</p>
    <a class="btn big" href="#/settings">Open Settings</a></main>`;
}

// Re-render on navigation, data changes and every minute ("now", today's lessons, the now line).
// Registered before the first render, so an early tap or data change is never missed.
let refresh = () => {};
addEventListener('hashchange', () => refresh());
subscribe(() => refresh());
setInterval(() => refresh(), 60000);

function App() {
  [, refresh] = useReducer(x => x + 1, 0);
  if (state.status === 'no-folder') return html`<${Welcome} />`;

  const [, route = '', arg = ''] = location.hash.match(/^#\/(\w*)\/?(.*)$/) ?? [];
  const tab = route === 'lessons' ? 'lessons' : route === '' ? 'students' : null;
  const screen = route === 'student' ? html`<${Student} key=${arg} id=${arg} />`
    : route === 'lessons' ? html`<${Lessons} view=${arg.startsWith('week') ? 'week' : 'day'}
        monday=${/\d{4}-\d{2}-\d{2}$/.test(arg) ? mondayOf(arg.slice(-10)) : mondayOf(now().today)} />`
    : route === 'settings' ? html`<${Settings} />`
    : html`<${Students} />`;
  return html`<${Banner} /><${Guard} key=${location.hash}>${screen}<//>
    ${tab && html`<nav class="tabs"><a href="#/" class=${tab === 'students' ? 'on' : ''}>Students</a><a href="#/lessons" class=${tab === 'lessons' ? 'on' : ''}>Lessons</a></nav>`}
    <${SheetHost} /><${UndoBar} />${state.status === 'conflict' && html`<${ConflictDialog} />`}`;
}

init().then(() => render(html`<${App} />`, document.getElementById('app')));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
