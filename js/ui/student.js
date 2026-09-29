import { useState } from '../../vendor/preact-htm.mjs';
import { html, now, byId, openSheet, undoable } from './shared.js';
import { StudentForm, PhoneForm, AddLessonForm, SlotForm, StopSlotForm, LessonForm, EntryForm, ExamForm, TextForm } from './forms.js';
import { state, commit } from '../store.js';
import { subjectOf, fmtPhone, smsHref, mapsHref, live } from '../data.js';
import { nextLesson, planFor, entries, entryDate, cardExam, activePauses, slotDates } from '../schedule.js';
import { fmtDate, fmtDay, dayName, addDays } from '../dates.js';

const findIn = (db, list, id) => db[list].find(x => x.id === id);
const sheet = (C, props) => openSheet(() => html`<${C} ...${props} />`);
const back = () => history.back();

export function Student({ id }) {
  const [showHistory, setShowHistory] = useState(false), [pastExams, setPastExams] = useState(false);
  const db = state.db, s = byId(db.students, id), { today, time } = now();
  if (!s || s.deleted) return html`<header><button class="btn icon" onClick=${back}>‹</button><h1>Not found</h1></header>
    <main class="empty">This student doesn't exist.</main>`;
  if (s.archived) return html`<header><button class="btn icon" onClick=${back}>‹</button><h1>${s.name}</h1></header>
    <main class="page"><div class="box">This student is archived.
      <div class="actions"><button class="btn pri" onClick=${() => commit(d => { findIn(d, 'students', id).archived = false; })}>Restore</button></div></div></main>`;

  const sub = subjectOf(db, s), next = nextLesson(db, id, today, time), plan = planFor(db, id), list = entries(db, id);
  const exam = cardExam(db, id, today);
  const slots = live(db.slots).filter(x => x.studentId === id && slotDates(x, today, x.until ?? addDays(today, 400)).length > 0);
  const first = x => slotDates(x, x.from, addDays(x.from, 14))[0], last = x => x.until && slotDates(x, x.from, x.until).at(-1);
  const oneOffs = live(db.meetings).filter(m => m.studentId === id && !m.slotId && m.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const pauses = activePauses(db, id, today);
  const exams = live(db.exams).filter(x => x.studentId === id).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  const upcoming = exams.filter(x => x.date >= today), past = exams.filter(x => x.date < today).reverse();
  const phones = live(s.phones ?? []);
  const day = d => ['Today', 'Tomorrow'].includes(fmtDay(d, today)) ? `${fmtDay(d, today)}, ${fmtDate(d)}` : fmtDate(d);
  const examRow = x => html`<div class="item" onClick=${() => sheet(ExamForm, { studentId: id, examId: x.id })}>
    <span class="grow">${x.label || 'Exam'}</span><span class="muted">${fmtDate(x.date)}${x.start ? ' ' + x.start : ''}</span></div>`;
  const entry = (l, full) => html`<div class="item" style="display:block" onClick=${() => sheet(EntryForm, { studentId: id, entryId: l.id })}>
    <div class="muted">${fmtDate(l.date)}</div><div class="pre">${l.recap || html`<i class="muted">No recap</i>`}</div>
    ${full && l.plan && html`<div class="pre muted">Plan: ${l.plan}</div>`}</div>`;

  return html`<header><button class="btn icon" onClick=${back} aria-label="Back">‹</button><h1>${s.name}</h1>
      <button class="btn" onClick=${() => sheet(StudentForm, { id })}>Edit</button></header>
    <main class="page">
      <div class="strip" style="background:${sub.color}"></div>
      <div class="row"><span class="muted grow">${sub.name}</span>
        ${exam && html`<span class="pill">${exam.label} · ${fmtDate(exam.exam.date).slice(0, 3)}${exam.exam.label ? ': ' + exam.exam.label : ''}</span>`}</div>

      ${plan && html`<div class="box"><h2>Plan for next time</h2><div class="pre">${plan}</div></div>`}

      <div class="box"><h2>Next lesson</h2>
        <div class="big">${next ? `${day(next.date)} · ${next.start} (${next.minutes} min)` : 'No lesson planned'}</div>
        ${slots.map(x => html`<div class="item" onClick=${() => openSheet(() => html`<h3>Recurring lesson</h3>
            <button class="opt" onClick=${() => sheet(SlotForm, { slotId: x.id })}>Change from a date…</button>
            <button class="opt" onClick=${() => sheet(StopSlotForm, { slotId: x.id })}>Stop from a date…</button>`)}>
          <span class="grow">Every${x.everyWeeks === 2 ? ' 2nd' : ''} ${dayName(x.weekday)} ${x.start} · ${x.minutes} min</span>
          <span class="muted">${first(x) > today ? 'from ' + fmtDate(first(x)) : ''}${x.until ? ' last ' + fmtDate(last(x)) : ''}</span></div>`)}
        ${oneOffs.map(m => html`<div class="item" onClick=${() => sheet(LessonForm, { meetingId: m.id })}>
          <span class="grow">One-off ${day(m.date)} ${m.start} · ${m.minutes} min</span>${m.disabled && html`<span class="muted">disabled</span>`}</div>`)}
        ${pauses.map(p => html`<div class="item"><span class="grow">Paused ${fmtDate(p.from)} – ${fmtDate(p.until)}</span>
          <button class="btn" onClick=${() => undoable('Lessons resumed', d => { findIn(d, 'pauses', p.id).deleted = true; })}>Resume</button></div>`)}
        <div class="actions"><button class="btn pri" onClick=${() => sheet(AddLessonForm, { studentId: id })}>+ Add lesson</button></div></div>

      <div class="box"><h2>Contacts</h2>
        ${phones.map(p => html`<div class="item" onClick=${() => sheet(PhoneForm, { studentId: id, phoneId: p.id })}>
          <span class="grow">${p.label ? p.label + ' · ' : ''}${fmtPhone(p.number)}</span>
          <a class="btn" href=${smsHref(p.number)} onClick=${e => e.stopPropagation()}>SMS</a></div>`)}
        <div class="actions"><button class="btn" onClick=${() => sheet(PhoneForm, { studentId: id })}>+ Number</button></div></div>

      <div class="box"><h2>Address</h2><div class="row"><span class="grow pre">${s.address || html`<i class="muted">No address</i>`}</span>
        ${s.address && html`<a class="btn pri" href=${mapsHref(s.address)} target="_blank" rel="noopener">Navigate</a>`}</div></div>

      <div class="box"><h2>${list[0] ? `Last lesson · ${fmtDate(list[0].date)}` : 'Lessons'}</h2>
        ${!list.length ? html`<i class="muted">No lesson entries yet.</i>` : showHistory ? list.map(l => entry(l, true))
          : html`<div class="pre" onClick=${() => sheet(EntryForm, { studentId: id, entryId: list[0].id })}>${list[0].recap || html`<i class="muted">No recap</i>`}</div>`}
        ${list.length > 1 && html`<div class="muted" style="margin-top:6px;cursor:pointer" onClick=${() => setShowHistory(!showHistory)}>${showHistory ? 'Hide history' : `History (${list.length}) ›`}</div>`}
        <div class="actions"><button class="btn" onClick=${() => sheet(EntryForm, { studentId: id, date: entryDate(db, id, today, time) })}>+ Lesson entry</button></div></div>

      <div class="box"><h2>Exams</h2>
        ${upcoming.map(examRow)}${!upcoming.length && html`<i class="muted">No upcoming exams.</i>`}
        ${past.length > 0 && html`<div class="muted" style="margin-top:6px;cursor:pointer" onClick=${() => setPastExams(!pastExams)}>${pastExams ? 'Hide past exams' : `Past exams (${past.length}) ›`}</div>`}
        ${pastExams && past.map(examRow)}
        <div class="actions"><button class="btn" onClick=${() => sheet(ExamForm, { studentId: id })}>+ Exam</button></div></div>

      <div class="box" onClick=${() => sheet(TextForm, { studentId: id, field: 'notes', title: 'Notes' })}><h2>Notes</h2>
        <div class="pre">${s.notes || html`<i class="muted">Tap to add notes.</i>`}</div></div>
      <div class="box" onClick=${() => sheet(TextForm, { studentId: id, field: 'grades', title: 'Grades' })}><h2>Grades</h2>
        <div class="pre">${s.grades || html`<i class="muted">Tap to add grades.</i>`}</div></div>

      <button class="btn danger" onClick=${() => { undoable(`${s.name} archived`, d => { findIn(d, 'students', id).archived = true; }); back(); }}>Archive student</button>
    </main>`;
}
