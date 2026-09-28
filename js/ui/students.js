import { html, now, openSheet } from './shared.js';
import { StudentForm } from './forms.js';
import { state } from '../store.js';
import { textColor, fmtPhone, live } from '../data.js';
import { studentsBySubject, nextLesson, cardExam } from '../schedule.js';
import { fmtDay } from '../dates.js';

export function Students() {
  const db = state.db, { today, time } = now(), groups = studentsBySubject(db);

  const card = (s, sub) => {
    const phone = live(s.phones ?? [])[0], exam = cardExam(db, s.id, today), next = nextLesson(db, s.id, today, time);
    return html`<a class="card" href="#/student/${s.id}" style="background:${sub.color};color:${textColor(sub.color)}">
      <div class="row"><div class="name grow">${s.name}</div>${exam && html`<span class="pill">${exam.label}</span>`}</div>
      <div class="sub">${phone ? `${phone.label ? phone.label + ': ' : ''}${fmtPhone(phone.number)}` : 'No phone number'}</div>
      <div class="when ${next ? '' : 'none'}">${next ? `Next: ${fmtDay(next.date, today)} ${next.start}` : 'No lesson planned'}</div></a>`;
  };

  return html`<header><h1>Students</h1><a class="btn icon" href="#/settings" aria-label="Settings">⚙</a></header>
    <main><div class="list">
      ${groups.map(g => html`<div class="divider">${g.subject.name}</div>${g.students.map(s => card(s, g.subject))}`)}
      ${!groups.length && html`<div class="empty">No students yet. Tap + to add one.</div>`}
    </div></main>
    <button class="fab" aria-label="Add student" onClick=${() => openSheet(() => html`<${StudentForm} />`)}>+</button>`;
}
