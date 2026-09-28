import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayDiff, weekday, mondayOf, endTime, fmtDate, fmtDay, fmtWeek, holidays, isHoliday, todayStr, timeStr } from '../js/dates.js';

test('day arithmetic ignores daylight-saving changes', () => {
  assert.equal(addDays('2026-10-20', 7), '2026-10-27');           // across the 25 Oct 2026 change
  assert.equal(addDays('2027-03-23', 7), '2027-03-30');           // across the 28 Mar 2027 change
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(dayDiff('2026-10-20', '2026-10-27'), 7);
  assert.equal(dayDiff('2026-11-13', '2026-11-10'), -3);
});

test('weekdays are Monday-first', () => {
  assert.equal(weekday('2026-09-28'), 1);
  assert.equal(weekday('2026-10-04'), 7);
  assert.equal(mondayOf('2026-10-04'), '2026-09-28');
  assert.equal(mondayOf('2026-09-28'), '2026-09-28');
});

test('times', () => {
  assert.equal(endTime('17:00', 45), '17:45');
  assert.equal(endTime('16:30', 90), '18:00');
  assert.equal(todayStr(new Date(2026, 8, 5, 7, 3)), '2026-09-05');
  assert.equal(timeStr(new Date(2026, 8, 5, 7, 3)), '07:03');
});

test('formatting', () => {
  assert.equal(fmtDate('2026-09-29'), 'Tue 29 Sep');
  assert.equal(fmtDay('2026-09-29', '2026-09-29'), 'Today');
  assert.equal(fmtDay('2026-09-30', '2026-09-29'), 'Tomorrow');
  assert.equal(fmtDay('2026-09-28', '2026-09-29'), 'Yesterday');
  assert.equal(fmtDay('2026-10-02', '2026-09-29'), 'Fri 2 Oct');
  assert.equal(fmtWeek('2026-11-09'), '9 – 15 Nov 2026');
  assert.equal(fmtWeek('2026-09-28'), '28 Sep – 4 Oct 2026');
  assert.equal(fmtWeek('2026-12-28'), '28 Dec 2026 – 3 Jan 2027');
});

test('Polish public holidays', () => {
  const exp = {
    2026: ['01-01', '01-06', '04-05', '04-06', '05-01', '05-03', '05-24', '06-04', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26'],
    2027: ['01-01', '01-06', '03-28', '03-29', '05-01', '05-03', '05-16', '05-27', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26'],
  };
  for (const [y, days] of Object.entries(exp)) assert.deepEqual([...holidays(+y)].sort(), days.map(d => `${y}-${d}`));
  assert.ok(isHoliday('2026-11-11'));
  assert.ok(!isHoliday('2026-11-12'));
  assert.ok(!isHoliday('2024-12-24'));                            // Christmas Eve is a holiday only from 2025
});
