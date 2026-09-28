import { useState } from '../../vendor/preact-htm.mjs';
import { html, now, byId, openSheet, Seg } from './shared.js';
import { Week, LessonMenu } from './week.js';
import { state } from '../store.js';
import { subjectOf, textColor } from '../data.js';
import { lessonDays, examMarks, examLabel, recapMissing } from '../schedule.js';
import { addDays, fmtDate, fmtDay, endTime, monthAhead } from '../dates.js';

// Lessons tab: Daily list or Weekly grid. Switching views replaces the address, so the back gesture leaves the tab.
export function Lessons({ view, monday }) {
  return html`<header><div class="grow"><${Seg} options=${[['day', 'Daily'], ['week', 'Weekly']]} value=${view}
      onChange=${v => location.replace(v === 'week' ? '#/lessons/week' : '#/lessons')} /></div></header>
    ${view === 'week' ? html`<${Week} monday=${monday} />` : html`<${Daily} />`}`;
}

function Daily() {
  const [older, setOlder] = useState(0);   // days of past lessons shown; hidden again every time the view opens
  const db = state.db, { today, time } = now(), days = lessonDays(db, today, older);
  const marks = examMarks(db, addDays(today, -older), monthAhead(today));
  const label = d => { const rel = fmtDay(d, today); return rel === fmtDate(d) ? rel : `${rel} · ${fmtDate(d)}`; };

  const card = o => {
    const s = byId(db.students, o.studentId), sub = subjectOf(db, s), mark = marks.get(o.key);
    const past = o.date + ' ' + endTime(o.start, o.minutes) <= today + ' ' + time;
    return html`<button class="lcard ${past ? 'past' : ''}" style="background:${sub.color};color:${textColor(sub.color)}"
        onClick=${() => openSheet(() => html`<${LessonMenu} o=${o} />`)}>
      <div class="row"><div class="name grow">${s.name}</div>${mark && html`<span class="pill">${examLabel(mark)}</span>`}</div>
      <div class="t">${o.start}–${endTime(o.start, o.minutes)} · ${o.minutes} min${past && (recapMissing(db, o, today, time)
        ? html` · <span class="dotmark"></span>recap missing` : ' · done')}</div></button>`;
  };

  return html`<main><div class="list">
    <button class="btn" onClick=${() => setOlder(older + 7)}>Show older</button>
    ${older > 0 && !days.some(d => d.date < today) && html`<div class="muted" style="text-align:center">No lessons in the last ${older} days.</div>`}
    ${days.map(d => html`<div class="divider">${label(d.date)}</div>${d.lessons.map(card)}`)}
    ${!days.some(d => d.date >= today) && html`<div class="empty">No lessons in the coming month.</div>`}
  </div></main>`;
}
