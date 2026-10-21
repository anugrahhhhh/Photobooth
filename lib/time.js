const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

function wallClock(utcMs, tz) {
  const parts = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(utcMs))) parts[type] = Number(value);
  return parts;
}

// Selisih waktu dinding di tz terhadap UTC pada instan utcMs, dalam milidetik.
function offset(utcMs, tz) {
  const p = wallClock(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function localMidnight(year, month, day, tz) {
  const guess = Date.UTC(year, month - 1, day);
  let t = guess - offset(guess, tz);
  t = guess - offset(t, tz);
  return t;
}

// Tanggal kalender lokal tz pada instan now, format 'YYYY-MM-DD'.
export function localDate(now, tz) {
  const p = wallClock(now.getTime(), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Geser tanggal 'YYYY-MM-DD' sebanyak n hari, memakai aritmetika kalender UTC (tanpa zona).
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Batas hari dateStr menurut tz, sebagai ISO UTC. end = awal hari berikutnya.
export function dayBoundsUTCForDate(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = localMidnight(y, m, d, tz);
  const next = addDays(dateStr, 1).split('-').map(Number);
  const end = localMidnight(next[0], next[1], next[2], tz);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

// Batas "hari ini" menurut tz, sebagai ISO UTC. end = awal hari berikutnya.
export function dayBoundsUTC(now, tz) {
  return dayBoundsUTCForDate(localDate(now, tz), tz);
}
