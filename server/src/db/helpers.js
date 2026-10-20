export function toDb(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) {
    throw new Error('禁止将 Date 直接写入数据库，请使用 nowSql() 生成字符串');
  }
  if (typeof value === 'object') {
    throw new Error('数据库参数不支持对象，请先 JSON.stringify');
  }
  return value;
}

export function toDbParams(params = []) {
  return params.map(toDb);
}

export function parseJson(text, fallback = null) {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

export function likeEscape(keyword) {
  return String(keyword).replace(/[%_]/g, (m) => '\\' + m);
}
