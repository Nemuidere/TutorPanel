// The whole database is one plain JSON document. Items are never removed by the app:
// students get "archived": true, everything else gets "deleted": true. Unknown fields are kept untouched.

export const VERSION = 1;
export const LISTS = ['subjects', 'students', 'slots', 'meetings', 'pauses', 'lessons', 'exams'];
export const NO_SUBJECT = { id: '', name: 'No subject', color: '#454b57' };

export const emptyDb = () => ({
  version: VERSION,
  subjects: [{ id: 'math', name: 'Math', color: '#2b5780' }, { id: 'english', name: 'English', color: '#8c3b67' }],
  students: [], slots: [], meetings: [], pauses: [], lessons: [], exams: [],
});

export const uid = prefix => prefix + Math.random().toString(36).slice(2, 8);

// Throws a FormatError on a wrong top-level shape; fills in missing lists. Items that point to missing records are simply ignored later.
const bad = message => Object.assign(new Error(message), { name: 'FormatError' });
export function checkDb(db) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw bad('The file is not a TutorPanel data object.');
  if (typeof db.version !== 'number') throw bad('The file has no "version" number.');
  if (db.version > VERSION) throw bad(`The file is from a newer app version (${db.version}).`);
  for (const k of LISTS) {
    if (db[k] === undefined) db[k] = [];
    if (!Array.isArray(db[k])) throw bad(`"${k}" must be a list.`);
    if (db[k].some(x => !x || typeof x !== 'object' || typeof x.id !== 'string')) throw bad(`Every item in "${k}" needs an "id".`);
  }
  return db;
}

export const parseDb = text => checkDb(JSON.parse(text));
export const serialize = db => JSON.stringify(db, null, 2) + '\n';

export const live = list => list.filter(x => !x.deleted);
export const activeStudents = db => db.students.filter(s => !s.deleted && !s.archived);
export const subjectOf = (db, student) => db.subjects.find(s => s.id === student.subjectId && !s.deleted) ?? NO_SUBJECT;

// Light or dark text, whichever contrasts more with the background colour (WCAG contrast ratio).
const lum = hex => hex.slice(1, 7).match(/../g).map(h => parseInt(h, 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const LIGHT_TEXT = '#f1f3f5', DARK_TEXT = '#101217';
export function textColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return LIGHT_TEXT;   // e.g. a hand-edited colour
  const l = lum(hex);
  return (lum(LIGHT_TEXT) + 0.05) / (l + 0.05) >= (l + 0.05) / (lum(DARK_TEXT) + 0.05) ? LIGHT_TEXT : DARK_TEXT;
}

// '600123456' -> '600 123 456' for display; SMS links get +48 for 9-digit Polish numbers.
export const digits = n => n.replace(/[^\d+]/g, '');
export const fmtPhone = n => /^\d{9}$/.test(digits(n)) ? digits(n).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : n;
export const smsHref = n => 'sms:' + (/^\d{9}$/.test(digits(n)) ? '+48' + digits(n) : digits(n));
export const mapsHref = address => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address) + '&dir_action=navigate';
