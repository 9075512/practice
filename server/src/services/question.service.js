import { all, get, run } from '../db/index.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import {
  assert,
  clamp,
  cleanQueryText,
  optionalText,
  requireId,
  requireText,
  toInt
} from '../utils/validate.js';
import { isQuestionType, TYPE_ORDER_SQL } from '../constants/question.js';

export function parseOptions(text) {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && item.key && item.text)
      .map((item) => ({ key: String(item.key), text: String(item.text) }));
  } catch (_) {
    return [];
  }
}

function shapeQuestion(row, withBank = false) {
  const data = {
    id: row.id,
    bankId: row.bank_id,
    type: row.type,
    stem: row.stem,
    options: parseOptions(row.options),
    answer: row.answer,
    analysis: row.analysis,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (withBank) {
    data.bankName = row.bank_name;
  }
  return data;
}

export function listQuestions(query = {}) {
  const bankId = toInt(query.bankId, 0);
  const type = cleanQueryText(query.type);
  const keyword = cleanQueryText(query.keyword);
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = clamp(toInt(query.pageSize, 20), 1, 100);

  const where = ['q.deleted_at IS NULL'];
  const params = [];

  if (bankId > 0) {
    where.push('q.bank_id = ?');
    params.push(bankId);
  }
  if (type && isQuestionType(type)) {
    where.push('q.type = ?');
    params.push(type);
  }
  if (keyword) {
    const like = `%${keyword.replace(/[%_]/g, '\\$&')}%`;
    where.push(`(q.stem LIKE ? ESCAPE '\\' OR q.answer LIKE ? ESCAPE '\\' OR q.analysis LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    get(`SELECT COUNT(*) AS count FROM question q WHERE ${whereSql}`, params).count
  );

  const rows = all(
    `SELECT q.*, b.name AS bank_name
       FROM question q
       JOIN bank b ON b.id = q.bank_id
      WHERE ${whereSql}
      ORDER BY ${TYPE_ORDER_SQL}, q.id ASC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  return {
    list: rows.map((row) => shapeQuestion(row, true)),
    total,
    page,
    pageSize
  };
}

export function getQuestion(id) {
  const questionId = requireId(id, '题目 ID');
  const row = get(
    `SELECT q.*, b.name AS bank_name
       FROM question q JOIN bank b ON b.id = q.bank_id
      WHERE q.id = ? AND q.deleted_at IS NULL`,
    [questionId]
  );
  if (!row) throw new AppError(ERR.NOT_FOUND, '题目不存在', 404);
  return shapeQuestion(row, true);
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const options = [];

  for (const item of value) {
    if (!item) continue;
    const text = optionalText(item.text, 1000);
    if (!text) continue;
    const key = String(item.key || '').trim().toUpperCase();
    if (!/^[A-H]$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    options.push({ key, text });
    if (options.length >= 8) break;
  }

  return options.sort((a, b) => a.key.localeCompare(b.key));
}

export function updateQuestion(id, body = {}) {
  const question = getQuestion(id);

  const type = body.type === undefined ? question.type : String(body.type).trim();
  assert(isQuestionType(type), '题型不在支持范围内');

  const stem = body.stem === undefined ? question.stem : requireText(body.stem, '题干', 5000);
  const answer = body.answer === undefined ? question.answer : requireText(body.answer, '答案', 2000);
  const analysis = body.analysis === undefined ? question.analysis : optionalText(body.analysis, 10000);
  const options = body.options === undefined ? question.options : normalizeOptions(body.options);

  run(
    `UPDATE question SET type = ?, stem = ?, options = ?, answer = ?, analysis = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [type, stem, JSON.stringify(options), answer, analysis, nowSql(), question.id]
  );

  return getQuestion(question.id);
}

export function deleteQuestion(id) {
  const question = getQuestion(id);
  const now = nowSql();
  run('UPDATE question SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, question.id]);
  return { id: question.id };
}

/**
 * 移动端背题取题。
 * excludeIds 用于「只看未掌握」，随机排序用固定 seed 保证翻页顺序稳定。
 */
export function reciteQuestions(body = {}) {
  const bankId = requireId(body.bankId, '题库 ID');
  const type = String(body.type || '').trim();
  const order = body.order === 'random' ? 'random' : 'seq';
  const page = Math.max(1, toInt(body.page, 1));
  const pageSize = clamp(toInt(body.pageSize, 100), 1, 200);
  const seed = Math.abs(toInt(body.seed, 1)) || 1;

  const where = ['q.deleted_at IS NULL', 'q.bank_id = ?'];
  const params = [bankId];

  if (type && isQuestionType(type)) {
    where.push('q.type = ?');
    params.push(type);
  }

  if (Array.isArray(body.excludeIds) && body.excludeIds.length) {
    const ids = body.excludeIds
      .map((item) => toInt(item, 0))
      .filter((item) => item > 0)
      .slice(0, 5000);
    if (ids.length) {
      where.push(`q.id NOT IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    get(`SELECT COUNT(*) AS count FROM question q WHERE ${whereSql}`, params).count
  );

  const orderParams = [];
  let orderSql = 'q.sort_order ASC, q.id ASC';
  if (order === 'random') {
    orderSql = '((q.id * 1103515245 + ?) & 2147483647) ASC, q.id ASC';
    orderParams.push(seed);
  }

  const rows = all(
    `SELECT q.id, q.bank_id, q.type, q.stem, q.options, q.answer, q.analysis, q.sort_order,
            q.created_at, q.updated_at
       FROM question q
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`,
    [...params, ...orderParams, pageSize, (page - 1) * pageSize]
  );

  return {
    list: rows.map((row) => shapeQuestion(row)),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    order,
    seed
  };
}
