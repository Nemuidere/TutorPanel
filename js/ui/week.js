import { useState, useRef } from '../../vendor/preact-htm.mjs';
import { html, now, byId, openSheet, closeSheet, undoable } from './shared.js';
import { LessonForm, EntryForm } from './forms.js';
import { state } from '../store.js';
import { subjectOf, textColor, live, activeStudents, uid } from '../data.js';
import { occurrences, examMarks, examLabel, examBadge, recapMissing, hourRange, lanes, changeLesson, pauseRange } from '../schedule.js';
import { addDays, dayName, fmtDate, fmtWeek, isHoliday, endTime, toMin } from '../dates.js';

const findIn = (db, list, id) => db[list].find(x => x.id === id);
const goWeek = monday => location.replace('#/week/' + monday);   // replace: the back gesture leaves the calendar instead of stepping through weeks

export function Week({ monday }) {
  const db = state.db, { today, time } = now(), days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(monday, i));
  const occs = occurrences(db, monday, days[6]), marks = examMarks(db, monday, days[6]);
  const [h0, h1] = hourRange(occs), span = (h1 - h0) * 60, pct = min => (min - h0 * 60) / span * 100;
  const active = new Set(activeStudents(db).map(s => s.id));
  const exams = live(db.exams).filter(e => active.has(e.studentId) && e.date >= monday && e.date <= days[6]);
  const swipe = useRef(null);
  const onDown = e => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onUp = e => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) goWeek(addDays(monday, dx < 0 ? 7 : -7));
  };

  const block = o => {
    const s = byId(db.students, o.studentId), sub = subjectOf(db, s), mark = marks.get(o.key);
    const past = o.date + ' ' + endTime(o.start, o.minutes) <= today + ' ' + time;
    const style = `top:${pct(toMin(o.start))}%;height:${o.minutes / span * 100}%;left:calc(${o.lane / o.lanes * 100}% + 2px);` +
      `width:calc(${100 / o.lanes}% - 4px);background:${sub.color};color:${textColor(sub.color)}`;
    return html`<button class="ev ${past ? 'past' : ''} ${o.off ? 'off' : ''} ${mark && !o.off ? 'warn' : ''}" style=${style}
        onClick=${() => openSheet(() => html`<${LessonMenu} o=${o} />`)}>
      ${mark && !o.off && html`<span class="badge">${examBadge(mark)}</span>`}
      <b>${s.name.split(' ')[0]}</b>${o.start}
      ${recapMissing(db, o, today, time) && html`<span class="dot"></span>`}</button>`;
  };

  return html`<header><button class="btn icon" aria-label="Previous week" onClick=${() => goWeek(addDays(monday, -7))}>‹</button>
      <div class="center">${fmtWeek(monday)}</div>
      <button class="btn" onClick=${() => location.replace('#/week')}>Today</button>
      <button class="btn icon" aria-label="Next week" onClick=${() => goWeek(addDays(monday, 7))}>›</button></header>
    <div class="week" onPointerDown=${onDown} onPointerUp=${onUp} onPointerCancel=${() => { swipe.current = null; }}>
      <div class="dh"></div>
      ${days.map((d, i) => html`<div class="dh ${d === today ? 'today' : ''} ${isHoliday(d) ? 'holiday' : ''}">${dayName(i + 1)}<b>${+d.slice(8)}</b></div>`)}
      <div class="er"></div>
      ${days.map(d => html`<div class="er">${exams.filter(e => e.date === d).map(e => {
        const s = byId(db.students, e.studentId);
        return html`<a class="chip" href="#/student/${s.id}" style="border-color:${subjectOf(db, s).color};color:var(--tx)">✎ ${s.name.split(' ')[0]}</a>`;
      })}</div>`)}
      <div class="hours">${Array.from({ length: h1 - h0 }, (_, k) => html`<span style="top:${k / (h1 - h0) * 100}%">${h0 + k}</span>`)}</div>
      ${days.map((d, i) => html`<div class="col ${i > 4 ? 'weekend' : ''}">
        ${Array.from({ length: h1 - h0 }, (_, k) => html`<div class="gl" style="top:${k / (h1 - h0) * 100}%"></div>`)}
        ${d === today && toMin(time) >= h0 * 60 && toMin(time) <= h1 * 60 && html`<div class="now" style="top:${pct(toMin(time))}%"></div>`}
        ${lanes(occs.filter(o => o.date === d)).map(block)}</div>`)}
    </div>`;
}

function LessonMenu({ o }) {
  const [weeks, setWeeks] = useState(1);
  const db = state.db, s = byId(db.students, o.studentId), sub = subjectOf(db, s), { today, time } = now();
  const mark = examMarks(db, o.date, o.date).get(o.key);
  const pause = o.paused && live(db.pauses).find(p => p.studentId === o.studentId && o.date >= p.from && o.date <= p.until);
  const missing = recapMissing(db, o, today, time), range = pauseRange(o.date, weeks);
  const info = [o.disabled && 'disabled', pause && `paused until ${fmtDate(pause.until)}`, missing && 'recap missing'].filter(Boolean).join(' · ');
  const act = (label, mutate) => { undoable(label, mutate); closeSheet(); };

  return html`<h3>${s.name} · ${sub.name}</h3>
    <div class="muted">${fmtDate(o.date)} · ${o.start}–${endTime(o.start, o.minutes)}${info && ' · ' + info}</div>
    ${mark && html`<div class="pill" style="display:inline-block;margin-top:6px">${examLabel(mark)} (${fmtDate(mark[0].exam.date)}${mark[0].exam.label ? ': ' + mark[0].exam.label : ''})</div>`}
    <div style="margin-top:8px">
      <button class="opt" onClick=${() => { closeSheet(); location.hash = '#/student/' + s.id; }}>→ Open student card</button>
      ${missing && html`<button class="opt" onClick=${() => openSheet(() => html`<${EntryForm} studentId=${s.id} date=${o.date} />`)}>✎ Add recap</button>`}
      <button class="opt" onClick=${() => openSheet(() => html`<${LessonForm} occ=${o} />`)}>◷ Change this lesson</button>
      ${o.disabled
        ? html`<button class="opt" onClick=${() => act('Lesson enabled', d => changeLesson(d, o, { disabled: false }))}>✓ Enable this lesson</button>`
        : html`<button class="opt" onClick=${() => act('Lesson disabled', d => changeLesson(d, o, { disabled: true }))}>⊘ Disable this lesson</button>`}
      ${pause
        ? html`<button class="opt" onClick=${() => act('Lessons resumed', d => { findIn(d, 'pauses', pause.id).deleted = true; })}>▶ Resume (paused until ${fmtDate(pause.until)})</button>`
        : html`<div class="opt">‖ Next
            <span class="stepper"><button aria-label="Fewer weeks" onClick=${() => setWeeks(Math.max(1, weeks - 1))}>−</button><b>${weeks}</b>
              <button aria-label="More weeks" onClick=${() => setWeeks(weeks + 1)}>+</button></span> wk
            <button class="btn" onClick=${() => act(`Disabled ${fmtDate(range.from)} – ${fmtDate(range.until)}`,
              d => { d.pauses.push({ id: uid('p'), studentId: o.studentId, ...range }); })}>Disable</button></div>
          <div class="muted" style="padding:0 4px">${fmtDate(range.from)} – ${fmtDate(range.until)}, all of ${s.name.split(' ')[0]}'s lessons</div>`}
    </div>`;
}
