import { all, get, run, tx } from '../db/index.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import { assert, optionalText, requireId, requireText } from '../utils/validate.js';
import { QUESTION_TYPES, TYPE_ORDER_SQL } from '../constants/question.js';

function typeCountsByBank(bankIds) {
  if (!bankIds.length) return new Map();
  const placeholders = bankIds.map(() => '?').join(',');
  const rows = all(
    `SELECT bank_id, type, COUNT(*) AS count
       FROM question
      WHERE deleted_at IS NULL AND bank_id IN (${placeholders})
      GROUP BY bank_id, type
      ORDER BY ${TYPE_ORDER_SQL}`,
    bankIds
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.bank_id)) map.set(row.bank_id, []);
    map.get(row.bank_id).push({ type: row.type, count: Number(row.count) });
  }
  return map;
}

function shapeBank(row, counts = [], isVip = false) {
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const vipOnly = Number(row.vip_only) === 1;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    vipOnly,
    locked: vipOnly && !isVip,
    sortOrder: row.sort_order,
    questionCount: total,
    typeCounts: counts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function userIsVip(userId) {
  if (!userId) return false;
  return !!get('SELECT id FROM vip_membership WHERE user_id = ?', [userId]);
}

export function listBanks({ keyword = '', forUserId = 0 } = {}) {
  const kw = String(keyword || '').trim();
  const rows = kw
    ? all(
        `SELECT * FROM bank
          WHERE deleted_at IS NULL AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
          ORDER BY sort_order ASC, id ASC`,
        [`%${kw.replace(/[%_]/g, '\\$&')}%`, `%${kw.replace(/[%_]/g, '\\$&')}%`]
      )
    : all('SELECT * FROM bank WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC');

  const counts = typeCountsByBank(rows.map((row) => row.id));
  const isVip = userIsVip(forUserId);
  return rows.map((row) => shapeBank(row, counts.get(row.id) || [], isVip));
}

export function bankOptions() {
  return all(
    `SELECT b.id, b.name,
            (SELECT COUNT(*) FROM question q WHERE q.bank_id = b.id AND q.deleted_at IS NULL) AS questionCount
       FROM bank b
      WHERE b.deleted_at IS NULL
      ORDER BY b.sort_order ASC, b.id ASC`
  ).map((row) => ({ id: row.id, name: row.name, questionCount: Number(row.questionCount) }));
}

export function getBank(id, options = {}) {
  const bankId = requireId(id, '题库 ID');
  const row = get('SELECT * FROM bank WHERE id = ? AND deleted_at IS NULL', [bankId]);
  if (!row) throw new AppError(ERR.NOT_FOUND, '题库不存在', 404);

  const counts = typeCountsByBank([bankId]).get(bankId) || [];
  return shapeBank(row, counts, userIsVip(options.forUserId));
}

export function createBank(body = {}) {
  const name = requireText(body.name, '题库名称', 80);
  const description = optionalText(body.description, 500);
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  const vipOnly = body.vipOnly ? 1 : 0;
  const now = nowSql();

  const exists = get('SELECT id FROM bank WHERE name = ? AND deleted_at IS NULL', [name]);
  assert(!exists, '题库名称已存在', ERR.CONFLICT);

  const result = run(
    `INSERT INTO bank (name, description, vip_only, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, description, vipOnly, Math.trunc(sortOrder), now, now]
  );
  return getBank(result.lastInsertRowid);
}

export function updateBank(id, body = {}) {
  const bank = getBank(id);
  const name = body.name === undefined ? bank.name : requireText(body.name, '题库名称', 80);
  const description = body.description === undefined ? bank.description : optionalText(body.description, 500);
  const sortOrder = body.sortOrder === undefined ? bank.sortOrder : Math.trunc(Number(body.sortOrder) || 0);
  const vipOnly = body.vipOnly === undefined ? (bank.vipOnly ? 1 : 0) : body.vipOnly ? 1 : 0;

  const duplicate = get(
    'SELECT id FROM bank WHERE name = ? AND deleted_at IS NULL AND id <> ?',
    [name, bank.id]
  );
  assert(!duplicate, '题库名称已存在', ERR.CONFLICT);

  run(
    `UPDATE bank
        SET name = ?, description = ?, vip_only = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`,
    [name, description, vipOnly, sortOrder, nowSql(), bank.id]
  );
  return getBank(bank.id);
}

/** 删除题库时同步软删除其下全部题目，避免残留数据被重新导入时命中。 */
export function deleteBank(id) {
  const bank = getBank(id);
  const now = nowSql();

  tx(() => {
    run('UPDATE question SET deleted_at = ?, updated_at = ? WHERE bank_id = ? AND deleted_at IS NULL', [
      now,
      now,
      bank.id
    ]);
    run('UPDATE bank SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, bank.id]);
  });

  return { id: bank.id };
}

export function typeSummary() {
  return QUESTION_TYPES.map((type) => ({ type }));
}
