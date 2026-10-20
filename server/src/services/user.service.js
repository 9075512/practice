import { all, get, run } from '../db/index.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import { assert, clamp, cleanQueryText, requireId, requireText, toInt } from '../utils/validate.js';
import { getVipStatus, setVipByAdmin } from './vip.service.js';

/** 身份值脱敏：openid 只展示首尾，设备号原样展示 */
function maskIdentity(type, value) {
  const text = String(value || '');
  if (type === 'wx_openid' && text.length > 10) {
    return `${text.slice(0, 4)}****${text.slice(-4)}`;
  }
  return text;
}

function shapeUser(row) {
  const isVip = !!row.membership_id;
  const username = row.username || '';
  return {
    id: row.id,
    nickname: row.nickname || '',
    username,
    // 有账号密码的用户统一显示为「账号」，否则按原来的微信 / 设备走
    identityType: username ? 'account' : row.identity_type,
    identity: username || maskIdentity(row.identity_type, row.identity_value),
    status: Number(row.status),
    isVip,
    // 禁用即封禁：账号被禁用时 VIP 一并失效，恢复启用后自动恢复
    vipActive: isVip && Number(row.status) === 1,
    // card = 卡密激活，admin = 后台手动设置
    vipSource: row.membership_source || '',
    vipActivatedAt: row.activated_at || '',
    cardTail: row.code_tail || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || ''
  };
}

export function listUsers(query = {}) {
  const keyword = cleanQueryText(query.keyword);
  const status = cleanQueryText(query.status);
  const vip = cleanQueryText(query.vip);
  const account = cleanQueryText(query.account);
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = clamp(toInt(query.pageSize, 20), 1, 100);

  const where = ['1 = 1'];
  const params = [];

  if (keyword) {
    const like = `%${keyword.replace(/[%_]/g, '\\$&')}%`;
    where.push(
      `(u.nickname LIKE ? ESCAPE '\\'
         OR u.username LIKE ? ESCAPE '\\'
         OR u.identity_value LIKE ? ESCAPE '\\'
         OR CAST(u.id AS TEXT) = ?)`
    );
    params.push(like, like, like, keyword);
  }

  if (status === '0' || status === '1') {
    where.push('u.status = ?');
    params.push(Number(status));
  }

  if (vip === 'vip') {
    where.push('m.id IS NOT NULL');
  } else if (vip === 'normal') {
    where.push('m.id IS NULL');
  }

  if (account === 'account') {
    where.push('u.username IS NOT NULL');
  } else if (account === 'guest') {
    where.push('u.username IS NULL');
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    get(
      `SELECT COUNT(*) AS count
         FROM app_user u
         LEFT JOIN vip_membership m ON m.user_id = u.id
        WHERE ${whereSql}`,
      params
    ).count
  );

  const rows = all(
    `SELECT u.id, u.nickname, u.username, u.identity_type, u.identity_value, u.status,
            u.created_at, u.last_login_at,
            m.id AS membership_id, m.source AS membership_source, m.activated_at, c.code_tail
       FROM app_user u
       LEFT JOIN vip_membership m ON m.user_id = u.id
       LEFT JOIN card_key c ON c.id = m.source_card_id
      WHERE ${whereSql}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  return {
    list: rows.map(shapeUser),
    total,
    page,
    pageSize
  };
}

export function getUserDetail(id) {
  const userId = requireId(id, '用户 ID');
  const row = get(
    `SELECT u.id, u.nickname, u.username, u.identity_type, u.identity_value, u.status,
            u.created_at, u.last_login_at,
            m.id AS membership_id, m.source AS membership_source, m.activated_at, c.code_tail
       FROM app_user u
       LEFT JOIN vip_membership m ON m.user_id = u.id
       LEFT JOIN card_key c ON c.id = m.source_card_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!row) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404);

  const logs = all(
    `SELECT id, code_tail, result, message, client_ip, user_agent, created_at
       FROM card_activation_log
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 50`,
    [userId]
  );

  return {
    ...shapeUser(row),
    activationLogs: logs.map((item) => ({
      id: item.id,
      codeTail: item.code_tail,
      result: item.result,
      message: item.message,
      clientIp: item.client_ip,
      createdAt: item.created_at
    }))
  };
}

export function updateUser(id, body = {}) {
  const userId = requireId(id, '用户 ID');
  const user = get('SELECT id FROM app_user WHERE id = ?', [userId]);
  if (!user) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404);

  const nickname = requireText(body.nickname, '昵称', 30);
  run('UPDATE app_user SET nickname = ? WHERE id = ?', [nickname, userId]);
  return getUserDetail(userId);
}

export function setUserStatus(id, status) {
  const userId = requireId(id, '用户 ID');
  const user = get('SELECT id, status FROM app_user WHERE id = ?', [userId]);
  if (!user) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404);

  assert(status === 0 || status === 1, '状态只能为 0 或 1');
  run('UPDATE app_user SET status = ? WHERE id = ?', [status, userId]);
  return getUserDetail(userId);
}

/**
 * 后台设置用户身份：普通用户 ↔ 永久 VIP。
 * 不消耗卡密；改完直接回最新的用户详情，前端无需二次请求。
 */
export function setUserVip(id, isVip, adminId = null) {
  const userId = requireId(id, '用户 ID');
  const result = setVipByAdmin(userId, isVip, adminId);
  return { ...result, user: getUserDetail(userId) };
}

/** 移动端「我的」：当前用户资料 + VIP 状态 */
export function getMyProfile(userId) {
  const user = get(
    `SELECT id, nickname, username, password_hash, identity_type, identity_value,
            status, created_at, last_login_at
       FROM app_user WHERE id = ?`,
    [userId]
  );
  if (!user) throw new AppError(ERR.TOKEN_INVALID, '用户不存在', 401);

  return {
    id: user.id,
    nickname: user.nickname || '',
    username: user.username || '',
    hasPassword: Boolean(user.password_hash),
    identityType: user.username ? 'account' : user.identity_type,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at || '',
    vip: getVipStatus(user.id)
  };
}

export function updateMyNickname(userId, body = {}) {
  const nickname = requireText(body.nickname, '昵称', 30);
  run('UPDATE app_user SET nickname = ? WHERE id = ?', [nickname, userId]);
  return getMyProfile(userId);
}

// 供其它模块复用（card.service 内部有相同逻辑，这里独立维护）
export { maskIdentity };
