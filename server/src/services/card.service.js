import { all, get, run, tx } from '../db/index.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import { assert, clamp, optionalText, requireId, requireText, toInt } from '../utils/validate.js';
import { codeTail, formatCode, hashCode, randomCode } from './card-code.js';

function normalizeValidUntil(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();

  assert(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(text), '激活截止时间格式不正确');
  return text.length === 10 ? `${text} 23:59:59` : text;
}

function shapeBatch(row) {
  const total = Number(row.total || 0);
  const used = Number(row.used || 0);
  const unused = Number(row.unused || 0);
  const voided = Number(row.voided || 0);

  return {
    id: row.id,
    batchNo: row.batch_no,
    name: row.name,
    quantity: Number(row.quantity),
    validUntil: row.valid_until,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    total,
    used,
    unused,
    voided,
    usedRate: total ? Math.round((used / total) * 100) : 0
  };
}

const BATCH_SELECT = `
  SELECT b.*,
         COUNT(c.id) AS total,
         COALESCE(SUM(CASE WHEN c.status = 'used'   THEN 1 ELSE 0 END), 0) AS used,
         COALESCE(SUM(CASE WHEN c.status = 'unused' THEN 1 ELSE 0 END), 0) AS unused,
         COALESCE(SUM(CASE WHEN c.status = 'void'   THEN 1 ELSE 0 END), 0) AS voided
    FROM card_batch b
    LEFT JOIN card_key c ON c.batch_id = b.id
`;

/** 生成批次：明文只在本次响应返回，数据库只落哈希 */
export function generateBatch(adminId, body = {}) {
  const quantity = clamp(toInt(body.quantity, 0), 1, 2000);
  assert(quantity >= 1 && quantity <= 2000, '单批数量需在 1 ~ 2000 之间');

  const name = optionalText(body.name, 80) || '未命名批次';
  const note = optionalText(body.note, 200);
  const validUntil = normalizeValidUntil(body.validUntil);
  const now = nowSql();
  const datePart = now.slice(0, 10).replace(/-/g, '');

  const result = tx(() => {
    const prefix = `VIP-${datePart}-`;
    const todayCount = Number(
      get('SELECT COUNT(*) AS count FROM card_batch WHERE batch_no LIKE ?', [`${prefix}%`]).count
    );
    const batchNo = `${prefix}${String(todayCount + 1).padStart(3, '0')}`;

    const inserted = run(
      `INSERT INTO card_batch (batch_no, name, quantity, valid_until, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [batchNo, name, quantity, validUntil, note, adminId, now]
    );
    const batchId = inserted.lastInsertRowid;

    const codes = [];
    for (let i = 0; i < quantity; i += 1) {
      let saved = false;
      for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
        const code = randomCode();
        try {
          run(
            `INSERT INTO card_key
               (batch_id, code_hash, code_tail, status, valid_until, created_at)
             VALUES (?, ?, ?, 'unused', ?, ?)`,
            [batchId, hashCode(code), codeTail(code), validUntil, now]
          );
          codes.push(formatCode(code));
          saved = true;
        } catch (err) {
          const message = String((err && err.message) || '');
          if (!message.includes('UNIQUE constraint failed')) throw err;
        }
      }
      if (!saved) throw new AppError(ERR.SERVER, '卡密生成冲突，请重试', 500);
    }

    return { batchId, batchNo, codes };
  });

  const batch = getBatch(result.batchId);
  return {
    batch,
    codes: result.codes,
    warning: '卡密明文仅显示一次，请立即下载保存；关闭后无法再次查看'
  };
}

export function listBatches() {
  return all(`${BATCH_SELECT} GROUP BY b.id ORDER BY b.id DESC`).map(shapeBatch);
}

export function getBatch(id) {
  const batchId = requireId(id, '批次 ID');
  const row = get(`${BATCH_SELECT} WHERE b.id = ? GROUP BY b.id`, [batchId]);
  if (!row) throw new AppError(ERR.NOT_FOUND, '批次不存在', 404);
  return shapeBatch(row);
}

function maskIdentity(type, value) {
  const text = String(value || '');
  if (type === 'wx_openid' && text.length > 10) {
    return `${text.slice(0, 4)}****${text.slice(-4)}`;
  }
  return text;
}

export function listCards(batchId, query = {}) {
  const batch = getBatch(batchId);
  const status = String(query.status || '').trim();
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = clamp(toInt(query.pageSize, 20), 1, 100);

  const where = ['c.batch_id = ?'];
  const params = [batch.id];
  if (status === 'unused' || status === 'used' || status === 'void') {
    where.push('c.status = ?');
    params.push(status);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    get(`SELECT COUNT(*) AS count FROM card_key c WHERE ${whereSql}`, params).count
  );

  const rows = all(
    `SELECT c.id, c.code_tail, c.status, c.used_at, c.voided_at, c.void_reason, c.created_at,
            u.id AS user_id, u.nickname, u.identity_type, u.identity_value
       FROM card_key c
       LEFT JOIN app_user u ON u.id = c.used_by_user_id
      WHERE ${whereSql}
      ORDER BY c.id ASC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  return {
    batch,
    list: rows.map((row) => ({
      id: row.id,
      codeTail: row.code_tail,
      status: row.status,
      usedAt: row.used_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      createdAt: row.created_at,
      userId: row.user_id,
      nickname: row.nickname || '',
      identityType: row.identity_type || '',
      identity: row.identity_type ? maskIdentity(row.identity_type, row.identity_value) : ''
    })),
    total,
    page,
    pageSize
  };
}

export function voidCard(id, reason = '') {
  const cardId = requireId(id, '卡密 ID');
  const card = get('SELECT * FROM card_key WHERE id = ?', [cardId]);
  if (!card) throw new AppError(ERR.NOT_FOUND, '卡密不存在', 404);
  if (card.status !== 'unused') {
    throw new AppError(ERR.CONFLICT, '只有未使用的卡密可以作废', 409);
  }

  const now = nowSql();
  const result = run(
    `UPDATE card_key
        SET status = 'void', voided_at = ?, void_reason = ?
      WHERE id = ? AND status = 'unused'`,
    [now, optionalText(reason, 200), cardId]
  );
  if (result.changes !== 1) {
    throw new AppError(ERR.CONFLICT, '卡密状态已变化，请刷新后重试', 409);
  }
  return { id: cardId };
}

export function voidBatch(id, reason = '') {
  const batch = getBatch(id);
  const now = nowSql();
  const result = run(
    `UPDATE card_key
        SET status = 'void', voided_at = ?, void_reason = ?
      WHERE batch_id = ? AND status = 'unused'`,
    [now, optionalText(reason, 200), batch.id]
  );
  return { id: batch.id, voided: result.changes };
}

export function listVipMembers(query = {}) {
  const keyword = String(query.keyword || '').trim();
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = clamp(toInt(query.pageSize, 20), 1, 100);

  const where = ['1 = 1'];
  const params = [];
  if (keyword) {
    const like = `%${keyword.replace(/[%_]/g, '\\$&')}%`;
    where.push(
      `(u.nickname LIKE ? ESCAPE '\\'
         OR u.identity_value LIKE ? ESCAPE '\\'
         OR c.code_tail = ?
         OR CAST(u.id AS TEXT) = ?)`
    );
    params.push(like, like, keyword.toUpperCase(), keyword);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    get(
      `SELECT COUNT(*) AS count
         FROM vip_membership m
         JOIN app_user u ON u.id = m.user_id
         LEFT JOIN card_key c ON c.id = m.source_card_id
        WHERE ${whereSql}`,
      params
    ).count
  );

  const rows = all(
    `SELECT m.id, m.source, m.activated_at, u.id AS user_id, u.nickname, u.identity_type, u.identity_value,
            c.code_tail, b.batch_no
       FROM vip_membership m
       JOIN app_user u ON u.id = m.user_id
       LEFT JOIN card_key c ON c.id = m.source_card_id
       LEFT JOIN card_batch b ON b.id = c.batch_id
      WHERE ${whereSql}
      ORDER BY m.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  return {
    list: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      nickname: row.nickname || '',
      identityType: row.identity_type,
      identity: maskIdentity(row.identity_type, row.identity_value),
      // card = 卡密激活，admin = 后台手动设置（没有卡密与批次）
      source: row.source || 'card',
      cardTail: row.code_tail || '',
      batchNo: row.batch_no || '',
      activatedAt: row.activated_at
    })),
    total,
    page,
    pageSize
  };
}
