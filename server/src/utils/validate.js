import { AppError, ERR } from './errors.js';

export function assert(condition, message, code = ERR.PARAM) {
  if (!condition) throw new AppError(code, message, 400);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function parsePaging(query) {
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = clamp(toInt(query.pageSize, 20), 1, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function requireText(value, field, max = 2000) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  assert(text.length > 0, `${field}不能为空`);
  assert(text.length <= max, `${field}不能超过 ${max} 个字符`);
  return text;
}

export function optionalText(value, max = 2000) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  assert(text.length <= max, `文本不能超过 ${max} 个字符`);
  return text;
}

export function requireId(value, field = 'ID') {
  const n = toInt(value, 0);
  assert(n > 0, `${field}无效`);
  return n;
}

/**
 * 清洗查询参数：把序列化残留的 "undefined" / "null" 字符串视为空值。
 * 部分客户端（如旧版 WebView 的 fetch 封装）会把 undefined 拼进 query string，
 * 若直接参与筛选会得到空结果。
 */
export function cleanQueryText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (text === 'undefined' || text === 'null') return '';
  return text;
}
