// Calendar dates are 'YYYY-MM-DD' strings and times are 'HH:MM' wall-clock strings (local time, no time zone).
// Day arithmetic runs on UTC midnights, so daylight-saving changes never shift a lesson.

const pad = n => String(n).padStart(2, '0');
const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = t => new Date(t).toISOString().slice(0, 10);

export const addDays = (s, n) => iso(ms(s) + n * 864e5);
export const dayDiff = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
export const weekday = s => (new Date(ms(s)).getUTCDay() + 6) % 7 + 1; // 1 = Monday … 7 = Sunday
export const mondayOf = s => addDays(s, 1 - weekday(s));

// Last day of "one calendar month" from s: the day before the same date next month (10 Nov -> 9 Dec).
// If next month has no such date (31 Jan), the month runs to the end of next month (28/29 Feb).
export function monthAhead(s) {
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1, last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return d <= last ? addDays(`${ny}-${pad(nm)}-${pad(d)}`, -1) : `${ny}-${pad(nm)}-${pad(last)}`;
}

export const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const fromMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
export const endTime = (start, minutes) => fromMin(toMin(start) + minutes);

export const todayStr = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const timeStr = (now = new Date()) => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayName = wd => DAYS[wd - 1];
const dm = s => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;

// 'Tue 29 Sep'
export const fmtDate = s => `${dayName(weekday(s))} ${dm(s)}`;
// 'Today' / 'Tomorrow' / 'Yesterday' / 'Tue 29 Sep'
export function fmtDay(s, today) {
  const d = dayDiff(today, s);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : fmtDate(s);
}
// '9 – 15 Nov 2026', '28 Sep – 4 Oct 2026', '28 Dec 2026 – 3 Jan 2027'
export function fmtWeek(monday) {
  const sun = addDays(monday, 6), y1 = monday.slice(0, 4), y2 = sun.slice(0, 4);
  if (y1 !== y2) return `${dm(monday)} ${y1} – ${dm(sun)} ${y2}`;
  if (monday.slice(5, 7) === sun.slice(5, 7)) return `${+monday.slice(8, 10)} – ${dm(sun)} ${y2}`;
  return `${dm(monday)} – ${dm(sun)} ${y2}`;
}

// Polish public holidays (14 days a year incl. Christmas Eve since 2025). Easter: anonymous Gregorian algorithm.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
const holidayCache = new Map();
export function holidays(y) {
  if (!holidayCache.has(y)) {
    const e = easter(y);
    holidayCache.set(y, new Set([
      '01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', ...(y >= 2025 ? ['12-24'] : []), '12-25', '12-26',
    ].map(md => `${y}-${md}`).concat([0, 1, 49, 60].map(n => addDays(e, n)))));
  }
  return holidayCache.get(y);
}
export const isHoliday = s => holidays(+s.slice(0, 4)).has(s);
