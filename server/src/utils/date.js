function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDateTime(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowSql() {
  return formatDateTime(new Date());
}

export function todayStr() {
  return formatDate(new Date());
}

export function parseSqlDate(text) {
  if (!text) return null;
  const m = String(text).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0)
  );
}

export function toDateStr(input) {
  if (input instanceof Date) return formatDate(input);
  return String(input).slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(`${toDateStr(dateStr)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function lastNDates(n, endDate = todayStr()) {
  const dates = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    dates.push(addDays(endDate, -i));
  }
  return dates;
}

export function weekdayCn(dateStr) {
  const d = new Date(`${toDateStr(dateStr)}T12:00:00`);
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

export function shortDate(dateStr) {
  const s = toDateStr(dateStr);
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
}

export function elapsedMs(startText, endText) {
  const a = parseSqlDate(startText);
  const b = parseSqlDate(endText);
  if (!a || !b) return 0;
  return Math.max(0, b.getTime() - a.getTime());
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}小时${m % 60}分`;
  }
  return `${m}分${pad2(s)}秒`;
}

export function streakFromDates(dateSet, today = todayStr()) {
  let cursor = today;
  if (!dateSet.has(cursor)) {
    cursor = addDays(today, -1);
    if (!dateSet.has(cursor)) return 0;
  }
  let count = 0;
  while (dateSet.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}
