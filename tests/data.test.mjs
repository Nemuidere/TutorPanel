import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, parseDb, serialize, checkDb, textColor, fmtPhone, smsHref, mapsHref, subjectOf, NO_SUBJECT, LIGHT_TEXT, DARK_TEXT } from '../js/data.js';

test('round trip keeps unknown fields and fills missing lists', () => {
  const db = emptyDb();
  db.students.push({ id: 'a', name: 'Ania', subjectId: 'math', myOwnNote: 'kept' });
  const back = parseDb(serialize(db));
  assert.deepEqual(back, db);
  const minimal = parseDb('{"version": 1, "students": []}');
  assert.deepEqual(minimal.slots, []);
  assert.equal(minimal.subjects.length, 0);          // a file without subjects stays without them
});

test('broken files are rejected with a readable reason', () => {
  assert.throws(() => parseDb('{"version": 1, "students": [}'), SyntaxError);
  assert.throws(() => parseDb('[]'), /not a TutorPanel/);
  assert.throws(() => parseDb('{"students": []}'), /version/);
  assert.throws(() => parseDb('{"version": 9}'), /newer/);
  assert.throws(() => parseDb('{"version": 1, "students": {}}'), /"students" must be a list/);
  assert.throws(() => parseDb('{"version": 1, "exams": [{"date": "2026-01-01"}]}'), /"exams" needs an "id"/);
  assert.doesNotThrow(() => checkDb({ version: 1, lessons: [{ id: 'l', studentId: 'gone' }] }));   // dangling refs are fine
});

test('deleted subject falls back to "No subject"', () => {
  const db = emptyDb();
  const s = { id: 'a', subjectId: 'math' };
  assert.equal(subjectOf(db, s).name, 'Math');
  db.subjects[0].deleted = true;
  assert.equal(subjectOf(db, s), NO_SUBJECT);
  assert.equal(subjectOf(db, { subjectId: 'nope' }), NO_SUBJECT);
});

test('text colour stays readable on any background', () => {
  for (const c of ['#2b5780', '#8c3b67', '#454b57', '#000000', '#5a4a8c']) assert.equal(textColor(c), LIGHT_TEXT, c);
  for (const c of ['#ffffff', '#ffeb3b', '#8fd694', '#7cc0f5']) assert.equal(textColor(c), DARK_TEXT, c);
});

test('phones and links', () => {
  assert.equal(fmtPhone('600123456'), '600 123 456');
  assert.equal(fmtPhone('600 123-456'), '600 123 456');
  assert.equal(fmtPhone('+48 600 123 456'), '+48 600 123 456');
  assert.equal(smsHref('600 123 456'), 'sms:+48600123456');
  assert.equal(smsHref('+44 20 7946 0000'), 'sms:+442079460000');
  assert.equal(mapsHref('ul. Kwiatowa 5/12, Warszawa'),
    'https://www.google.com/maps/dir/?api=1&destination=ul.%20Kwiatowa%205%2F12%2C%20Warszawa&dir_action=navigate');
});
