// Lessons are never stored one by one. They are expanded on the fly from:
//   slots    - recurring lessons (weekday, start, minutes, every 1 or 2 weeks, valid from/until),
//   meetings - one-off lessons (slotId null) and changes to one lesson of a slot (keyed by slotId + origDate),
//   pauses   - "disable next X weeks" ranges per student.
// An occurrence: { key, studentId, date, start, minutes, slotId, origDate, meetingId, disabled, paused, off }.

import { addDays, dayDiff, weekday, mondayOf, endTime, toMin, monthAhead } from './dates.js';
import { live, activeStudents, uid, NO_SUBJECT } from './data.js';

export const LOOKBACK = 28;     // days searched before an exam for its "last lesson"
export const CARD_EXAM_DAYS = 14;
const AHEAD = 182;              // how far ahead "next lesson" looks

const firstDate = slot => addDays(slot.from, (slot.weekday - weekday(slot.from) + 7) % 7);
const step = slot => 7 * (slot.everyWeeks || 1);

export function slotDates(slot, from, to) {
  const first = firstDate(slot), n = step(slot), out = [];
  let d = from > first ? addDays(first, Math.ceil(dayDiff(first, from) / n) * n) : first;
  for (; d <= to && (!slot.until || d <= slot.until); d = addDays(d, n)) out.push(d);
  return out;
}

const isSlotDate = (slot, d) => d >= firstDate(slot) && (!slot.until || d <= slot.until) && dayDiff(firstDate(slot), d) % step(slot) === 0;
const stampOf = (o, end) => o.date + ' ' + (end ? endTime(o.start, o.minutes) : o.start);

export function occurrences(db, from, to) {
  const students = new Set(activeStudents(db).map(s => s.id));
  const slots = new Map(live(db.slots).filter(s => students.has(s.studentId)).map(s => [s.id, s]));
  const meetings = live(db.meetings).filter(m => students.has(m.studentId));
  const changed = new Set(meetings.filter(m => m.slotId).map(m => m.slotId + ':' + m.origDate));
  const pauses = live(db.pauses);
  const out = [];
  for (const s of slots.values())
    for (const d of slotDates(s, from, to))
      if (!changed.has(s.id + ':' + d))
        out.push({ key: s.id + ':' + d, studentId: s.studentId, date: d, start: s.start, minutes: s.minutes, slotId: s.id, origDate: d, meetingId: null, disabled: false });
  for (const m of meetings) {
    if (m.date < from || m.date > to) continue;
    if (m.slotId && !(slots.has(m.slotId) && isSlotDate(slots.get(m.slotId), m.origDate))) continue; // change to a lesson of a stopped slot
    out.push({ key: m.slotId ? m.slotId + ':' + m.origDate : m.id, studentId: m.studentId, date: m.date, start: m.start, minutes: m.minutes,
      slotId: m.slotId || null, origDate: m.origDate || null, meetingId: m.id, disabled: !!m.disabled });
  }
  for (const o of out) {
    o.paused = pauses.some(p => p.studentId === o.studentId && o.date >= p.from && o.date <= p.until);
    o.off = o.disabled || o.paused;
  }
  return out.sort((a, b) => stampOf(a).localeCompare(stampOf(b)) || a.key.localeCompare(b.key));
}

export const nextLesson = (db, studentId, today, time) =>
  occurrences(db, today, addDays(today, AHEAD)).find(o => o.studentId === studentId && !o.off && stampOf(o, true) > today + ' ' + time) ?? null;

// Students tab: one group per subject in the Settings order ("No subject" last), names A–Z (Polish order) inside each group.
export function studentsBySubject(db) {
  const subjects = live(db.subjects), groups = subjects.map(subject => ({ subject, students: [] })), none = { subject: NO_SUBJECT, students: [] };
  for (const s of activeStudents(db)) (groups.find(g => g.subject.id === s.subjectId) ?? none).students.push(s);
  for (const g of [...groups, none]) g.students.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pl'));
  return [...groups, none].filter(g => g.students.length);
}

// Daily view: every day from (today - olderDays) to one calendar month ahead that has lessons; disabled and paused ones are left out.
export function lessonDays(db, today, olderDays = 0) {
  const days = [];
  for (const o of occurrences(db, addDays(today, -olderDays), monthAhead(today))) {
    if (o.off) continue;
    if (days.at(-1)?.date !== o.date) days.push({ date: o.date, lessons: [] });
    days.at(-1).lessons.push(o);
  }
  return days;
}

export function recapMissing(db, o, today, time) {
  const s = db.students.find(x => x.id === o.studentId);
  return !o.off && stampOf(o, true) <= today + ' ' + time && o.date >= (s?.created ?? '') &&
    !live(db.lessons).some(l => l.studentId === o.studentId && l.date === o.date);
}

// Default date for a new lesson entry: the student's latest lesson that has already started, else today.
export function entryDate(db, studentId, today, time) {
  const past = occurrences(db, addDays(today, -60), today).filter(o => o.studentId === studentId && !o.off && stampOf(o) <= today + ' ' + time);
  return past.at(-1)?.date ?? today;
}

export const entries = (db, studentId) =>
  live(db.lessons).filter(l => l.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date) || db.lessons.indexOf(b) - db.lessons.indexOf(a));
export const planFor = (db, studentId) => entries(db, studentId)[0]?.plan || '';

// Exam marks: the last (not disabled/paused) lesson of the same card that ends before the exam starts, within LOOKBACK days.
export function examMarks(db, from, to) {
  const occs = occurrences(db, addDays(from, -LOOKBACK), addDays(to, LOOKBACK)).filter(o => !o.off);
  const students = new Set(activeStudents(db).map(s => s.id)), marks = new Map();
  for (const e of live(db.exams)) {
    if (!students.has(e.studentId) || e.date < from || e.date > addDays(to, LOOKBACK)) continue;
    const cutoff = e.date + ' ' + (e.start || '00:00'), lookFrom = addDays(e.date, -LOOKBACK);
    const last = occs.filter(o => o.studentId === e.studentId && o.date >= lookFrom && stampOf(o, true) <= cutoff).at(-1);
    if (!last) continue;
    if (!marks.has(last.key)) marks.set(last.key, []);
    marks.get(last.key).push({ exam: e, days: dayDiff(last.date, e.date) });
  }
  for (const l of marks.values()) l.sort((a, b) => a.days - b.days);
  return marks;
}

const inDays = d => d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
export const examLabel = list => `! Exam ${inDays(list[0].days)}` + (list.length > 1 ? ` (+${list.length - 1})` : '');
export const examBadge = list => `! ${list[0].days === 0 ? 'today' : list[0].days + 'd'}`;

export function cardExam(db, studentId, today) {
  const e = live(db.exams).filter(x => x.studentId === studentId && x.date >= today && dayDiff(today, x.date) <= CARD_EXAM_DAYS)
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))[0];
  return e ? { exam: e, days: dayDiff(today, e.date), label: `! Exam ${inDays(dayDiff(today, e.date))}` } : null;
}

// Lessons (not disabled/paused) that collide with any of the candidate lessons. `ignore` skips the lesson(s) being replaced.
export function overlaps(db, candidates, ignore = () => false) {
  if (!candidates.length) return [];
  const dates = candidates.map(c => c.date).sort();
  const others = occurrences(db, dates[0], dates.at(-1)).filter(o => !o.off && !ignore(o));
  const hits = [];
  for (const c of candidates) {
    const a = toMin(c.start), b = a + c.minutes;
    for (const o of others) if (o.date === c.date && toMin(o.start) < b && a < toMin(o.start) + o.minutes && !hits.includes(o)) hits.push(o);
  }
  return hits;
}
export const slotCandidates = (slot, weeks = 8) => slotDates(slot, slot.from, addDays(slot.from, weeks * 7 - 1)).map(date => ({ date, start: slot.start, minutes: slot.minutes }));

// Date of the next lesson on a weekday: today if its start time is still ahead, otherwise the next such day.
export function nextWeekdayDate(today, time, wd, start) {
  const d = addDays(today, (wd - weekday(today) + 7) % 7);
  return d === today && start <= time ? addDays(d, 7) : d;
}

// "Disable next X weeks": from the Monday after the tapped lesson's week, X full weeks.
export function pauseRange(date, weeks) {
  const from = addDays(mondayOf(date), 7);
  return { from, until: addDays(from, weeks * 7 - 1) };
}

// Week grid hours: 14-21 by default, stretched to fit every lesson of the week.
export function hourRange(occs) {
  let h0 = 14, h1 = 21;
  for (const o of occs) { h0 = Math.min(h0, Math.floor(toMin(o.start) / 60)); h1 = Math.max(h1, Math.ceil((toMin(o.start) + o.minutes) / 60)); }
  return [h0, Math.min(h1, 24)];
}

// Side-by-side lanes for lessons that overlap on the same day: sets o.lane and o.lanes.
export function lanes(dayOccs) {
  const groups = [];
  for (const o of [...dayOccs].sort((a, b) => toMin(a.start) - toMin(b.start))) {
    const end = toMin(o.start) + o.minutes, g = groups.at(-1);
    if (g && toMin(o.start) < g.end) { g.items.push(o); g.end = Math.max(g.end, end); } else groups.push({ end, items: [o] });
  }
  for (const g of groups) {
    const laneEnds = [];
    for (const o of g.items) {
      let i = laneEnds.findIndex(e => e <= toMin(o.start));
      if (i < 0) i = laneEnds.push(0) - 1;
      laneEnds[i] = toMin(o.start) + o.minutes; o.lane = i;
    }
    for (const o of g.items) o.lanes = laneEnds.length;
  }
  return dayOccs;
}

// ---- Changes (pure mutations on the db object) ----


// Change or disable one lesson: edits its meeting row, or creates one for a slot lesson.
export function changeLesson(db, o, fields) {
  let m = o.meetingId && db.meetings.find(x => x.id === o.meetingId);
  if (!m) {
    m = { id: uid('m'), studentId: o.studentId, date: o.date, start: o.start, minutes: o.minutes, slotId: o.slotId, origDate: o.origDate, disabled: false };
    db.meetings.push(m);
  }
  Object.assign(m, fields);
  return m;
}

// Change a recurring slot from a date on: the old slot ends the day before, a new one starts. Past lessons keep the old values.
export function changeSlotFrom(db, slotId, fromDate, fields) {
  const old = db.slots.find(s => s.id === slotId);
  if (fromDate <= firstDate(old)) return Object.assign(old, fields);   // nothing has happened yet: edit in place
  const next = { ...old, ...fields, id: uid('sl'), from: fromDate };
  old.until = addDays(fromDate, -1);
  db.slots.push(next);
  return next;
}

export const stopSlotFrom = (db, slotId, fromDate) => { db.slots.find(s => s.id === slotId).until = addDays(fromDate, -1); };

export const activePauses = (db, studentId, today) => live(db.pauses).filter(p => p.studentId === studentId && p.until >= today);
