import { useState } from '../../vendor/preact-htm.mjs';
import { html, now, openSheet } from './shared.js';
import { StudentForm } from './forms.js';
import { state } from '../store.js';
import { subjectOf, textColor, fmtPhone, live } from '../data.js';
import { studentList, cardExam, recapMissing } from '../schedule.js';
import { fmtDay } from '../dates.js';

export function Students() {
  const [older, setOlder] = useState(0);   // days of past lessons shown; hidden again every time the screen opens
  const db = state.db, { today, time } = now(), l = studentList(db, today, time, older);

  const card = ({ student: s, occ, done }, past = false) => {
    const sub = subjectOf(db, s), color = textColor(sub.color);
    if (past) {
      const missing = recapMissing(db, occ, today, time);
      return html`<a class="card past" href="#/student/${s.id}" style="background:${sub.color};color:${color}">
        <div class="name">${s.name}</div>
        <div class="when">${fmtDay(occ.date, today)} ${occ.start}${missing && html` · <span class="dotmark"></span>recap missing`}</div></a>`;
    }
    const phone = live(s.phones ?? [])[0], exam = cardExam(db, s.id, today);
    const when = !occ ? 'No lesson planned' : done ? `${fmtDay(occ.date, today)} ${occ.start} · done` : `Next: ${fmtDay(occ.date, today)} ${occ.start}`;
    return html`<a class="card" href="#/student/${s.id}" style="background:${sub.color};color:${color}">
      <div class="row"><div class="name grow">${s.name}</div>${exam && html`<span class="pill">${exam.label}</span>`}</div>
      <div class="sub">${phone ? `${phone.label ? phone.label + ': ' : ''}${fmtPhone(phone.number)}` : 'No phone number'}</div>
      <div class="when ${occ ? '' : 'none'}">${when}</div></a>`;
  };
  const section = (label, items, past) => items.length > 0 && html`<div class="divider">${label}</div>${items.map(x => card(x, past))}`;
  const later = [...l.later, ...l.none];

  return html`<header><h1>Students</h1><a class="btn icon" href="#/settings" aria-label="Settings">⚙</a></header>
    <main><div class="list">
      <button class="btn" onClick=${() => setOlder(older + 7)}>Show older</button>
      ${older > 0 && !l.earlier.length && html`<div class="muted" style="text-align:center">No lessons in the last ${older} days.</div>`}
      ${section('Earlier', l.earlier, true)}
      ${section('Today', l.today)}
      ${section('Tomorrow', l.tomorrow)}
      ${section('Later', later)}
      ${!l.today.length && !l.tomorrow.length && !later.length && html`<div class="empty">No students yet. Tap + to add one.</div>`}
    </div></main>
    <button class="fab" aria-label="Add student" onClick=${() => openSheet(() => html`<${StudentForm} />`)}>+</button>`;
}
