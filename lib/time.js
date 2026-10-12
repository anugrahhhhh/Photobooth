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

// Batas "hari ini" menurut tz, sebagai ISO UTC. end = awal hari berikutnya.
export function dayBoundsUTC(now, tz) {
  const p = wallClock(now.getTime(), tz);
  const start = localMidnight(p.year, p.month, p.day, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
