import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb } from '../js/data.js';
import {
  slotDates, occurrences, nextLesson, studentsBySubject, lessonDays, recapMissing, entryDate, planFor, examMarks, examLabel, examBadge,
  cardExam, overlaps, slotCandidates, pauseRange, hourRange, lanes, changeLesson, changeSlotFrom, stopSlotFrom,
} from '../js/schedule.js';

// Reference "now": Tue 10 Nov 2026, 16:30.
const TODAY = '2026-11-10', NOW = '16:30';

function fixture() {
  const db = emptyDb();
  const st = (id, name, extra = {}) => db.students.push({ id, name, subjectId: 'math', phones: [], address: '', notes: '', grades: '', archived: false, created: '2026-09-01', ...extra });
  st('ania', 'Ania'); st('kuba', 'Kuba'); st('ola', 'Ola'); st('zosia', 'Zosia');
  db.slots.push(
    { id: 's1', studentId: 'ania', weekday: 2, start: '17:00', minutes: 60, everyWeeks: 1, from: '2026-09-01', until: null },  // Tue 17:00
    { id: 's2', studentId: 'kuba', weekday: 2, start: '15:00', minutes: 45, everyWeeks: 1, from: '2026-09-01', until: null },  // Tue 15:00
    { id: 's3', studentId: 'ola', weekday: 3, start: '16:30', minutes: 60, everyWeeks: 2, from: '2026-09-02', until: null },   // every 2nd Wed
  );
  return db;
}
const keys = list => list.map(o => `${o.studentId} ${o.date} ${o.start}`);

test('slot dates: weekly, every 2 weeks, start mid-range, until', () => {
  const s = { weekday: 2, from: '2026-09-03', everyWeeks: 1, until: '2026-09-30' };   // from a Thursday -> first Tue is 8 Sep
  assert.deepEqual(slotDates(s, '2026-09-01', '2026-10-31'), ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
  const b = { weekday: 3, from: '2026-09-02', everyWeeks: 2, until: null };
  assert.deepEqual(slotDates(b, '2026-11-01', '2026-11-30'), ['2026-11-11', '2026-11-25']);
  assert.deepEqual(slotDates(b, '2026-11-11', '2026-11-11'), ['2026-11-11']);
  assert.deepEqual(slotDates(b, '2026-11-12', '2026-11-24'), []);
  // across the DST change the wall-clock time is untouched
  assert.deepEqual(slotDates({ weekday: 2, from: '2026-10-20', everyWeeks: 1 }, '2026-10-20', '2026-11-03'), ['2026-10-20', '2026-10-27', '2026-11-03']);
});

test('occurrences: changed, disabled, paused, archived, deleted, stopped', () => {
  const db = fixture();
  changeLesson(db, { studentId: 'ania', date: '2026-11-17', start: '17:00', minutes: 60, slotId: 's1', origDate: '2026-11-17' }, { date: '2026-11-19', start: '18:00' });
  changeLesson(db, { studentId: 'kuba', date: '2026-11-17', start: '15:00', minutes: 45, slotId: 's2', origDate: '2026-11-17' }, { disabled: true });
  db.pauses.push({ id: 'p1', studentId: 'ania', from: '2026-11-23', until: '2026-11-29' });
  db.students.find(s => s.id === 'zosia').archived = true;
  db.slots.push({ id: 's4', studentId: 'zosia', weekday: 4, start: '18:00', minutes: 60, everyWeeks: 1, from: '2026-09-01', until: null });
  db.slots.push({ id: 's5', studentId: 'ola', weekday: 5, start: '18:00', minutes: 60, everyWeeks: 1, from: '2026-09-01', until: null, deleted: true });
  const occ = occurrences(db, '2026-11-16', '2026-11-29');
  assert.deepEqual(keys(occ), ['kuba 2026-11-17 15:00', 'ania 2026-11-19 18:00', 'kuba 2026-11-24 15:00', 'ania 2026-11-24 17:00', 'ola 2026-11-25 16:30']);
  assert.equal(occ.find(o => o.studentId === 'kuba' && o.date === '2026-11-17').off, true);
  assert.equal(occ.find(o => o.studentId === 'ania' && o.date === '2026-11-24').paused, true);
  assert.equal(occ.find(o => o.date === '2026-11-19').key, 's1:2026-11-17');   // a moved lesson keeps its identity
  // stopping the slot drops its later changes too
  stopSlotFrom(db, 's1', '2026-11-17');
  assert.ok(!keys(occurrences(db, '2026-11-16', '2026-11-29')).some(k => k.startsWith('ania')));
});

test('next lesson skips disabled/paused, counts a lesson in progress', () => {
  const db = fixture();
  assert.equal(nextLesson(db, 'ania', TODAY, NOW).date, TODAY);                  // 17:00 today
  assert.equal(nextLesson(db, 'ania', TODAY, '17:30').date, TODAY);              // still in progress
  assert.equal(nextLesson(db, 'ania', TODAY, '18:00').date, '2026-11-17');       // ended
  changeLesson(db, { studentId: 'ania', date: TODAY, start: '17:00', minutes: 60, slotId: 's1', origDate: TODAY }, { disabled: true });
  db.pauses.push({ id: 'p', studentId: 'ania', from: '2026-11-16', until: '2026-11-22' });
  assert.equal(nextLesson(db, 'ania', TODAY, NOW).date, '2026-11-24');
  db.students.push({ id: 'new', name: 'New', subjectId: 'math', created: TODAY });
  assert.equal(nextLesson(db, 'new', TODAY, NOW), null);
});

test('students grouped by subject in Settings order, names in Polish order', () => {
  const db = fixture();
  const st = (id, name, subjectId) => db.students.push({ id, name, subjectId, created: '2026-09-01' });
  st('lena', 'Lena', 'english'); st('lukasz', 'Łukasz', 'english'); st('ewa', 'Ewa', 'english'); st('nosub', 'Adam', '');
  st('gone', 'Basia', 'physics');                                                  // unknown subject -> "No subject"
  db.students.push({ id: 'arch', name: 'Aaron', subjectId: 'math', archived: true });
  db.subjects.push({ id: 'physics', name: 'Physics', color: '#ffeb3b', deleted: true });
  const g = studentsBySubject(db);
  assert.deepEqual(g.map(x => [x.subject.name, x.students.map(s => s.name)]), [
    ['Math', ['Ania', 'Kuba', 'Ola', 'Zosia']],
    ['English', ['Ewa', 'Lena', 'Łukasz']],
    ['No subject', ['Adam', 'Basia']],
  ]);
  db.subjects.reverse();                                                           // the Settings order decides
  assert.deepEqual(studentsBySubject(db).map(x => x.subject.name), ['English', 'Math', 'No subject']);
});

test('lesson days: one entry per day with lessons, up to one calendar month, repeats every time', () => {
  const db = fixture();
  changeLesson(db, { studentId: 'kuba', date: '2026-11-17', start: '15:00', minutes: 45, slotId: 's2', origDate: '2026-11-17' }, { disabled: true });
  db.pauses.push({ id: 'p', studentId: 'ola', from: '2026-11-23', until: '2026-11-29' });
  const days = lessonDays(db, TODAY);
  assert.equal(days[0].date, TODAY);
  assert.equal(days.at(-1).date, '2026-12-09');                                     // 10 Nov -> 9 Dec
  assert.ok(days.every(d => d.lessons.length > 0));
  const all = days.flatMap(d => d.lessons);
  assert.deepEqual(all.filter(o => o.studentId === 'ania').map(o => o.date), ['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08']);
  assert.deepEqual(all.filter(o => o.studentId === 'kuba').map(o => o.date), ['2026-11-10', '2026-11-24', '2026-12-01', '2026-12-08']);   // disabled 17 Nov left out
  assert.deepEqual(all.filter(o => o.studentId === 'ola').map(o => o.date), ['2026-11-11', '2026-12-09']);                              // paused 25 Nov left out
  assert.deepEqual(days.map(d => d.date), ['2026-11-10', '2026-11-11', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08', '2026-12-09']);   // no empty days
  assert.deepEqual(days[0].lessons.map(o => o.start), ['15:00', '17:00']);
  const older = lessonDays(db, TODAY, 7);
  assert.deepEqual(older.slice(0, 2).map(d => d.date), ['2026-11-03', '2026-11-10']);
});

test('recap missing, default entry date, plan for next time', () => {
  const db = fixture();
  const [kubaToday] = occurrences(db, TODAY, TODAY).filter(o => o.studentId === 'kuba');
  assert.equal(recapMissing(db, kubaToday, TODAY, NOW), true);
  assert.equal(recapMissing(db, kubaToday, TODAY, '15:30'), false);              // not ended yet
  const early = occurrences(db, '2026-08-25', '2026-09-08').filter(o => o.studentId === 'kuba');
  assert.equal(recapMissing(db, early[0], TODAY, NOW), true);                    // 1 Sep: the day the card was created
  db.students.find(s => s.id === 'kuba').created = '2026-11-01';
  assert.equal(recapMissing(db, early.at(-1), TODAY, NOW), false);               // before the card existed
  db.lessons.push({ id: 'l1', studentId: 'kuba', date: TODAY, recap: 'Fractions', plan: '' });
  assert.equal(recapMissing(db, kubaToday, TODAY, NOW), false);

  assert.equal(entryDate(db, 'ania', '2026-11-11', '09:00'), TODAY);             // yesterday's lesson
  assert.equal(entryDate(db, 'ania', TODAY, '16:59'), '2026-11-03');             // today's hasn't started
  assert.equal(entryDate(db, 'ania', TODAY, '17:00'), TODAY);
  db.students.push({ id: 'new', name: 'New', subjectId: 'math', created: TODAY });
  assert.equal(entryDate(db, 'new', TODAY, NOW), TODAY);

  db.lessons.push({ id: 'l2', studentId: 'ania', date: '2026-11-03', recap: 'a', plan: 'Test prep' });
  assert.equal(planFor(db, 'ania'), 'Test prep');
  db.lessons.push({ id: 'l3', studentId: 'ania', date: TODAY, recap: 'b', plan: '' });
  assert.equal(planFor(db, 'ania'), '');                                         // latest entry has no plan -> hidden
  db.lessons.find(l => l.id === 'l3').deleted = true;
  assert.equal(planFor(db, 'ania'), 'Test prep');
});

test('exam marks: reference cases', () => {
  const db = fixture();
  const exam = (id, studentId, date, start = null) => db.exams.push({ id, studentId, date, start, label: id });
  exam('e1', 'ania', '2026-11-13');                                              // Fri, untimed -> last lesson Tue 10 Nov
  let m = examMarks(db, '2026-11-09', '2026-11-15');
  assert.deepEqual([...m.keys()], ['s1:2026-11-10']);
  assert.equal(examLabel(m.get('s1:2026-11-10')), '! Exam in 3 days');
  assert.equal(examBadge(m.get('s1:2026-11-10')), '! 3d');
  // disabling that lesson moves the mark a week back
  changeLesson(db, { studentId: 'ania', date: TODAY, start: '17:00', minutes: 60, slotId: 's1', origDate: TODAY }, { disabled: true });
  m = examMarks(db, '2026-11-02', '2026-11-15');
  assert.deepEqual([...m.keys()], ['s1:2026-11-03']);
  assert.equal(examLabel(m.get('s1:2026-11-03')), '! Exam in 10 days');
  // untimed exam on a lesson day ignores that day's lesson; a timed one counts an earlier same-day lesson
  exam('e2', 'kuba', '2026-11-17');
  exam('e3', 'kuba', '2026-11-24', '18:00');
  m = examMarks(db, '2026-11-09', '2026-11-29');
  assert.equal(examLabel(m.get('s2:2026-11-10')), '! Exam in 7 days');
  assert.equal(examLabel(m.get('s2:2026-11-24')), '! Exam today');
  assert.equal(examBadge(m.get('s2:2026-11-24')), '! today');
  // two exams sharing the same last lesson
  exam('e4', 'ola', '2026-11-12'); exam('e5', 'ola', '2026-11-16');
  m = examMarks(db, '2026-11-09', '2026-11-15');
  assert.equal(examLabel(m.get('s3:2026-11-11')), '! Exam tomorrow (+1)');
  // no lesson in the 4 weeks before -> no mark; paused lessons don't count
  db.students.push({ id: 'new', name: 'New', subjectId: 'math', created: TODAY });
  exam('e6', 'new', '2026-11-20');
  db.pauses.push({ id: 'p', studentId: 'kuba', from: '2026-11-09', until: '2026-11-15' });
  m = examMarks(db, '2026-11-09', '2026-11-22');
  assert.ok(![...m.values()].flat().some(x => x.exam.id === 'e6'));
  assert.equal(examLabel(m.get('s2:2026-11-03')), '! Exam in 14 days');          // Kuba's 10 Nov lesson is paused
});

test('card exam pill only within 14 days', () => {
  const db = fixture();
  db.exams.push({ id: 'e1', studentId: 'ania', date: '2026-11-25', start: null, label: 'x' }, { id: 'e2', studentId: 'ania', date: '2026-11-24', start: null, label: 'y', deleted: true });
  assert.equal(cardExam(db, 'ania', TODAY)?.label, undefined);                   // 15 days away
  assert.equal(cardExam(db, 'ania', '2026-11-11').label, '! Exam in 14 days');
  assert.equal(cardExam(db, 'ania', '2026-11-25').label, '! Exam today');
});

test('overlaps: touching is fine, overlapping is flagged, the replaced lesson is ignored', () => {
  const db = fixture();
  assert.equal(overlaps(db, [{ date: TODAY, start: '15:45', minutes: 60 }]).length, 0);       // Kuba ends 15:45
  assert.deepEqual(keys(overlaps(db, [{ date: TODAY, start: '15:30', minutes: 60 }])), ['kuba 2026-11-10 15:00']);
  assert.equal(overlaps(db, [{ date: TODAY, start: '17:30', minutes: 30 }], o => o.studentId === 'ania').length, 0);
  const slot = { weekday: 3, start: '17:00', minutes: 60, everyWeeks: 1, from: '2026-11-11' };                   // Wed 17:00 vs Ola 16:30 every 2nd Wed
  assert.deepEqual(keys(overlaps(db, slotCandidates(slot))), ['ola 2026-11-11 16:30', 'ola 2026-11-25 16:30', 'ola 2026-12-09 16:30', 'ola 2026-12-23 16:30']);
});

test('pause range, slot change from a date, hour range, lanes', () => {
  assert.deepEqual(pauseRange('2026-11-10', 2), { from: '2026-11-16', until: '2026-11-29' });
  assert.deepEqual(pauseRange('2026-11-15', 1), { from: '2026-11-16', until: '2026-11-22' });   // Sunday -> next Monday

  const db = fixture();
  changeSlotFrom(db, 's1', '2026-11-19', { weekday: 4, start: '16:00' });                      // from Thu 19 Nov: Thursdays 16:00
  assert.deepEqual(keys(occurrences(db, '2026-11-09', '2026-11-29').filter(o => o.studentId === 'ania')),
    ['ania 2026-11-10 17:00', 'ania 2026-11-17 17:00', 'ania 2026-11-19 16:00', 'ania 2026-11-26 16:00']);
  assert.equal(db.slots.find(s => s.id === 's1').until, '2026-11-18');
  const fresh = { id: 'sx', studentId: 'kuba', weekday: 5, start: '10:00', minutes: 60, everyWeeks: 1, from: '2026-12-01', until: null };
  db.slots.push(fresh);
  changeSlotFrom(db, 'sx', '2026-12-01', { start: '11:00' });                                  // not started yet: edited in place
  assert.equal(db.slots.filter(s => s.studentId === 'kuba').length, 2);
  assert.equal(fresh.start, '11:00');

  assert.deepEqual(hourRange([]), [14, 21]);
  assert.deepEqual(hourRange([{ start: '10:00', minutes: 90 }, { start: '20:30', minutes: 60 }]), [10, 22]);
  const day = lanes([{ start: '15:00', minutes: 90 }, { start: '16:00', minutes: 60 }, { start: '18:00', minutes: 60 }]);
  assert.deepEqual(day.map(o => [o.lane, o.lanes]), [[0, 2], [1, 2], [0, 1]]);
});
