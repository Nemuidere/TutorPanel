import { useState } from '../../vendor/preact-htm.mjs';
import { html, now, byId, closeSheet, undoable, Field, Seg, Duration, WEEKDAYS, Buttons } from './shared.js';
import { state, commit } from '../store.js';
import { uid, live, NO_SUBJECT } from '../data.js';
import { fmtDate, endTime, weekday, addDays } from '../dates.js';
import { overlaps, slotCandidates, slotDates, changeLesson, changeSlotFrom, stopSlotFrom, nextWeekdayDate, studentsBySubject } from '../schedule.js';

const name = id => byId(state.db.students, id)?.name ?? '?';
const findIn = (db, list, id) => db[list].find(x => x.id === id);

// Shows the collisions and turns "Save" into "Save anyway".
function useOverlap() {
  const [hits, setHits] = useState(null);
  return {
    check(found, save) { if (found.length && !hits) setHits(found); else save(); },
    box: hits && html`<div class="warnbox"><b>Overlaps with:</b>${hits.slice(0, 3).map(o =>
      html`<div>${name(o.studentId)} · ${fmtDate(o.date)} ${o.start}–${endTime(o.start, o.minutes)}</div>`)}
      ${hits.length > 3 && html`<div>…and ${hits.length - 3} more</div>`}</div>`,
    saveText: hits ? 'Save anyway' : 'Save',
  };
}

export function StudentForm({ id }) {
  const s = id && byId(state.db.students, id);
  const [f, set] = useState({ name: s?.name ?? '', subjectId: s?.subjectId ?? live(state.db.subjects)[0]?.id ?? '', address: s?.address ?? '', label: 'Parent', number: '' });
  const up = k => e => set({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return;
    const fields = { name: f.name.trim(), subjectId: f.subjectId, address: f.address.trim() };
    if (s) { commit(db => Object.assign(findIn(db, 'students', id), fields)); closeSheet(); return; }
    const newId = uid('st');
    commit(db => db.students.push({ id: newId, ...fields, phones: f.number.trim() ? [{ id: uid('ph'), label: f.label.trim(), number: f.number.trim() }] : [],
      notes: '', grades: '', archived: false, created: now().today }));
    closeSheet();
    location.hash = '#/student/' + newId;
  };
  return html`<h3>${s ? 'Edit student' : 'New student'}</h3>
    <${Field} label="Name"><input value=${f.name} onInput=${up('name')} autocomplete="off" /><//>
    <${Field} label="Subject"><select value=${f.subjectId} onChange=${up('subjectId')}>
      ${live(state.db.subjects).map(x => html`<option value=${x.id}>${x.name}</option>`)}<option value="">${NO_SUBJECT.name}</option></select><//>
    ${!s && html`<div class="row"><${Field} label="Contact"><input value=${f.label} onInput=${up('label')} style="width:110px" /><//>
      <div class="grow"><${Field} label="Phone"><input type="tel" value=${f.number} onInput=${up('number')} /><//></div></div>`}
    <${Field} label="Address"><input value=${f.address} onInput=${up('address')} autocomplete="off" /><//>
    <${Buttons} onSave=${save} />`;
}

export function PhoneForm({ studentId, phoneId }) {
  const p = phoneId && byId(byId(state.db.students, studentId).phones, phoneId);
  const [label, setLabel] = useState(p?.label ?? ''), [number, setNumber] = useState(p?.number ?? '');
  const phones = db => findIn(db, 'students', studentId).phones;
  const save = () => {
    if (!number.trim()) return;
    if (p) commit(db => Object.assign(byId(phones(db), phoneId), { label: label.trim(), number: number.trim() }));
    else commit(db => phones(db).push({ id: uid('ph'), label: label.trim(), number: number.trim() }));
    closeSheet();
  };
  const del = () => { undoable('Phone number deleted', db => { byId(phones(db), phoneId).deleted = true; }); closeSheet(); };
  return html`<h3>${p ? 'Edit number' : 'New number'}</h3>
    <${Field} label="Label (e.g. Mom, Dad, Student)"><input value=${label} onInput=${e => setLabel(e.target.value)} /><//>
    <${Field} label="Phone"><input type="tel" value=${number} onInput=${e => setNumber(e.target.value)} /><//>
    <${Buttons} onSave=${save} extra=${p && html`<button class="btn danger" onClick=${del}>Delete</button>`} />`;
}

// Add a lesson: once, every week or every 2 weeks. Without a studentId (Daily view) the student is picked here.
export function AddLessonForm({ studentId }) {
  const { today, time } = now();
  const [f, set] = useState(() => {
    const wd = weekday(today);
    return { studentId: studentId ?? '', weekday: wd, date: nextWeekdayDate(today, time, wd, '17:00'), start: '17:00', minutes: 60, every: 1 };
  });
  const [error, setError] = useState('');
  const ov = useOverlap();
  const save = () => {
    if (!f.studentId) return setError('Choose a student.');
    if (!f.date || !f.start) return;
    const lesson = { date: f.date, start: f.start, minutes: f.minutes };
    const slot = { weekday: weekday(f.date), start: f.start, minutes: f.minutes, everyWeeks: f.every, from: f.date };
    ov.check(overlaps(state.db, f.every ? slotCandidates(slot) : [lesson]), () => {
      if (f.every) commit(db => db.slots.push({ id: uid('sl'), studentId: f.studentId, ...slot, until: null }));
      else commit(db => db.meetings.push({ id: uid('m'), studentId: f.studentId, ...lesson, slotId: null, origDate: null, disabled: false }));
      closeSheet();
    });
  };
  return html`<h3>Add lesson</h3>
    ${!studentId && html`<${Field} label="Student"><select value=${f.studentId} onChange=${e => { setError(''); set({ ...f, studentId: e.target.value }); }}>
      <option value="">Choose a student…</option>
      ${studentsBySubject(state.db).map(g => g.students.map(s => html`<option value=${s.id}>${s.name} · ${g.subject.name}</option>`))}</select><//>`}
    ${error && html`<div class="warnbox">${error}</div>`}
    <div class="field"><span>Day</span><${Seg} options=${WEEKDAYS} value=${f.weekday}
      onChange=${v => set({ ...f, weekday: v, date: nextWeekdayDate(today, time, v, f.start) })} /></div>
    <${Field} label=${f.every ? 'First lesson on' : 'Date'}><input type="date" value=${f.date}
      onInput=${e => set({ ...f, date: e.target.value, weekday: e.target.value ? weekday(e.target.value) : f.weekday })} /><//>
    <${Field} label="Start"><input type="time" value=${f.start} onInput=${e => set({ ...f, start: e.target.value })} /><//>
    <${Duration} value=${f.minutes} onChange=${v => set({ ...f, minutes: v })} />
    <div class="field"><span>Repeat</span><${Seg} options=${[[0, 'Once'], [1, 'Every week'], [2, 'Every 2 weeks']]} value=${f.every}
      onChange=${v => set({ ...f, every: v })} /></div>
    ${ov.box}
    <${Buttons} onSave=${save} saveText=${ov.saveText} />`;
}

// "Change from a date" for a recurring lesson: earlier lessons keep the old values.
export function SlotForm({ slotId }) {
  const s = byId(state.db.slots, slotId), { today } = now();
  const nextDate = slotDates(s, today > s.from ? today : s.from, addDays(today, 400))[0];
  const [f, set] = useState({ weekday: s.weekday, start: s.start, minutes: s.minutes, everyWeeks: s.everyWeeks ?? 1, from: nextDate ?? today });
  const ov = useOverlap();
  const save = () => {
    if (!f.start || !f.from) return;
    const fields = { weekday: f.weekday, start: f.start, minutes: f.minutes, everyWeeks: f.everyWeeks };
    ov.check(overlaps(state.db, slotCandidates({ ...fields, from: f.from }), o => o.slotId === slotId && o.date >= f.from), () => {
      commit(db => changeSlotFrom(db, slotId, f.from, fields));
      closeSheet();
    });
  };
  return html`<h3>Change recurring lesson</h3>
    <div class="field"><span>Day</span><${Seg} options=${WEEKDAYS} value=${f.weekday} onChange=${v => set({ ...f, weekday: v })} /></div>
    <${Field} label="Start"><input type="time" value=${f.start} onInput=${e => set({ ...f, start: e.target.value })} /><//>
    <${Duration} value=${f.minutes} onChange=${v => set({ ...f, minutes: v })} />
    <div class="field"><span>Repeat</span><${Seg} options=${[[1, 'Every week'], [2, 'Every 2 weeks']]} value=${f.everyWeeks} onChange=${v => set({ ...f, everyWeeks: v })} /></div>
    <${Field} label="Change from (earlier lessons stay as they were)"><input type="date" value=${f.from} onInput=${e => set({ ...f, from: e.target.value })} /><//>
    ${ov.box}
    <${Buttons} onSave=${save} saveText=${ov.saveText} />`;
}

export function StopSlotForm({ slotId }) {
  const s = byId(state.db.slots, slotId), { today } = now();
  const [from, setFrom] = useState(slotDates(s, today > s.from ? today : s.from, addDays(today, 400))[0] ?? today);
  const save = () => { undoable('Recurring lesson stopped', db => stopSlotFrom(db, slotId, from)); closeSheet(); };
  return html`<h3>Stop recurring lesson</h3>
    <p class="muted">Lessons from this date on disappear. Earlier lessons and their recaps stay.</p>
    <${Field} label="Stop from"><input type="date" value=${from} onInput=${e => setFrom(e.target.value)} /><//>
    <${Buttons} onSave=${save} saveText="Stop" />`;
}

// Edit a one-off lesson, or "change this lesson" for a lesson from the calendar (occ).
export function LessonForm({ meetingId, occ }) {
  const m = meetingId && byId(state.db.meetings, meetingId), src = occ ?? m;
  const [f, set] = useState({ date: src?.date ?? now().today, start: src?.start ?? '17:00', minutes: src?.minutes ?? 60 });
  const ov = useOverlap();
  const save = () => {
    if (!f.date || !f.start) return;
    const key = occ?.key ?? meetingId;
    ov.check(overlaps(state.db, [f], o => o.key === key), () => {
      if (occ) commit(db => changeLesson(db, occ, { ...f }));
      else commit(db => Object.assign(findIn(db, 'meetings', meetingId), f));
      closeSheet();
    });
  };
  const del = () => { undoable('Lesson deleted', db => { findIn(db, 'meetings', meetingId).deleted = true; }); closeSheet(); };
  return html`<h3>${occ ? 'Change this lesson' : 'Edit one-off lesson'}</h3>
    ${occ && html`<p class="muted">Only this one lesson changes.</p>`}
    <${Field} label="Date"><input type="date" value=${f.date} onInput=${e => set({ ...f, date: e.target.value })} /><//>
    <${Field} label="Start"><input type="time" value=${f.start} onInput=${e => set({ ...f, start: e.target.value })} /><//>
    <${Duration} value=${f.minutes} onChange=${v => set({ ...f, minutes: v })} />
    ${ov.box}
    <${Buttons} onSave=${save} saveText=${ov.saveText} extra=${m && !m.slotId && html`<button class="btn danger" onClick=${del}>Delete</button>`} />`;
}

export function EntryForm({ studentId, entryId, date }) {
  const l = entryId && byId(state.db.lessons, entryId);
  const [f, set] = useState({ date: l?.date ?? date ?? now().today, recap: l?.recap ?? '', plan: l?.plan ?? '' });
  const save = () => {
    if (!f.date) return;
    if (l) commit(db => Object.assign(findIn(db, 'lessons', entryId), f));
    else commit(db => db.lessons.push({ id: uid('l'), studentId, ...f }));
    closeSheet();
  };
  const del = () => { undoable('Lesson entry deleted', db => { findIn(db, 'lessons', entryId).deleted = true; }); closeSheet(); };
  return html`<h3>${l ? 'Edit lesson entry' : 'New lesson entry'}</h3>
    <${Field} label="Date"><input type="date" value=${f.date} onInput=${e => set({ ...f, date: e.target.value })} /><//>
    <${Field} label="What we did"><textarea autofocus value=${f.recap} onInput=${e => set({ ...f, recap: e.target.value })} /><//>
    <${Field} label="Plan for next time / homework"><textarea value=${f.plan} onInput=${e => set({ ...f, plan: e.target.value })} /><//>
    <${Buttons} onSave=${save} extra=${l && html`<button class="btn danger" onClick=${del}>Delete</button>`} />`;
}

export function ExamForm({ studentId, examId }) {
  const x = examId && byId(state.db.exams, examId);
  const [f, set] = useState({ date: x?.date ?? now().today, start: x?.start ?? '', label: x?.label ?? '' });
  const save = () => {
    if (!f.date) return;
    const fields = { date: f.date, start: f.start || null, label: f.label.trim() };
    if (x) commit(db => Object.assign(findIn(db, 'exams', examId), fields));
    else commit(db => db.exams.push({ id: uid('e'), studentId, ...fields }));
    closeSheet();
  };
  const del = () => { undoable('Exam deleted', db => { findIn(db, 'exams', examId).deleted = true; }); closeSheet(); };
  return html`<h3>${x ? 'Edit exam' : 'New exam'}</h3>
    <${Field} label="What (e.g. Fractions test)"><input value=${f.label} onInput=${e => set({ ...f, label: e.target.value })} /><//>
    <${Field} label="Date"><input type="date" value=${f.date} onInput=${e => set({ ...f, date: e.target.value })} /><//>
    <${Field} label="Time (optional)"><input type="time" value=${f.start} onInput=${e => set({ ...f, start: e.target.value })} /><//>
    <${Buttons} onSave=${save} extra=${x && html`<button class="btn danger" onClick=${del}>Delete</button>`} />`;
}

export function TextForm({ studentId, field, title }) {
  const [text, setText] = useState(byId(state.db.students, studentId)[field] ?? '');
  const save = () => { commit(db => { findIn(db, 'students', studentId)[field] = text; }); closeSheet(); };
  return html`<h3>${title}</h3><textarea style="min-height:40dvh" value=${text} onInput=${e => setText(e.target.value)} />
    <${Buttons} onSave=${save} />`;
}

export function SubjectForm({ subjectId }) {
  const x = subjectId && byId(state.db.subjects, subjectId);
  const [f, set] = useState({ name: x?.name ?? '', color: x?.color ?? '#2f6a4e' });
  const save = () => {
    if (!f.name.trim()) return;
    const fields = { name: f.name.trim(), color: f.color };
    if (x) commit(db => Object.assign(findIn(db, 'subjects', subjectId), fields));
    else commit(db => db.subjects.push({ id: uid('sub'), ...fields }));
    closeSheet();
  };
  const del = () => { undoable(`Subject "${x.name}" deleted`, db => { findIn(db, 'subjects', subjectId).deleted = true; }); closeSheet(); };
  return html`<h3>${x ? 'Edit subject' : 'New subject'}</h3>
    <${Field} label="Name"><input value=${f.name} onInput=${e => set({ ...f, name: e.target.value })} /><//>
    <${Field} label="Colour"><input type="color" value=${f.color} onInput=${e => set({ ...f, color: e.target.value })} /><//>
    ${x && html`<p class="muted">Deleting a subject keeps its students; they show as "No subject".</p>`}
    <${Buttons} onSave=${save} extra=${x && html`<button class="btn danger" onClick=${del}>Delete</button>`} />`;
}
