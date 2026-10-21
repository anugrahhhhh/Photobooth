import { svg } from './common.js';

const DAY_FORMAT = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' });

// 'YYYY-MM-DD' → '13 Okt'; UTC supaya zona waktu browser tidak menggeser tanggal
export function formatDay(date) {
  return DAY_FORMAT.format(new Date(`${date}T00:00:00Z`)).replace('.', '');
}

export function barChartModel(daily, { width, height, gap = 4, minBar = 2 }) {
  const n = daily.length;
  const max = Math.max(0, ...daily.map((d) => d.count));
  const w = (width - (n - 1) * gap) / n;
  const bars = daily.map((d, i) => {
    const h = max === 0 ? minBar : Math.max(minBar, (d.count / max) * height);
    return { x: i * (w + gap), y: height - h, w, h, date: d.date, count: d.count, today: i === n - 1 };
  });
  return { max, bars };
}

const W = 280;
const H = 100;

export function renderBarChart(container, daily) {
  const { bars } = barChartModel(daily, { width: W, height: H });
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': 'Sesi 14 hari terakhir',
  });
  for (const b of bars) {
    const title = svg('title');
    title.textContent = `${formatDay(b.date)}: ${b.count} sesi`;
    root.append(
      svg('rect', { class: b.today ? 'bar today' : 'bar', x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.5 }, title),
    );
  }
  container.replaceChildren(root);
}
