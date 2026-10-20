import { get, run, tx } from '../db/index.js';
import config from '../config.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import { hashCode, normalizeCode } from './card-code.js';

const attemptsByUser = new Map();
const attemptsByIp = new Map();

function prune(list, windowMs, now) {
  return list.filter((time) => now - time < windowMs);
}

function allowAttempt(userId, ip) {
  const now = Date.now();
  const userHits = prune(attemptsByUser.get(userId) || [], config.vipAttemptWindowMs, now);
  if (userHits.length >= config.vipAttemptLimit) return false;

  if (ip) {
    const ipHits = prune(attemptsByIp.get(ip) || [], config.vipIpWindowMs, now);
    if (ipHits.length >= config.vipIpLimit) return false;
  }
  return true;
}

function recordFailure(userId, ip) {
  const now = Date.now();

  const userHits = prune(attemptsByUser.get(userId) || [], config.vipAttemptWindowMs, now);
  userHits.push(now);
  attemptsByUser.set(userId, userHits);

  if (ip) {
    const ipHits = prune(attemptsByIp.get(ip) || [], config.vipIpWindowMs, now);
    ipHits.push(now);
    attemptsByIp.set(ip, ipHits);
  }
}

function clearUserAttempts(userId) {
  attemptsByUser.delete(userId);
}

function logAttempt({ cardId = null, userId, code, result, message = '', meta = {} }) {
  try {
    run(
      `INSERT INTO card_activation_log
         (card_id, user_id, code_tail, result, message, client_ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        userId,
        String(code || '').slice(-4),
        result,
        String(message || '').slice(0, 300),
        String(meta.ip || '').slice(0, 80),
        String(meta.userAgent || '').slice(0, 300),
        nowSql()
      ]
    );
  } catch (_) {
    /* 审计日志失败不影响激活结果 */
  }
}

/**
 * 会员状态。来源有两种：卡密激活（source=card）与后台手动设置（source=admin）。
 * 后台开通常见的会员没有卡密，所以这里必须 LEFT JOIN，否则会被误判成非会员。
 */
export function getVipStatus(userId) {
  const row = get(
    `SELECT m.level, m.source, m.source_card_id, m.activated_at, c.code_tail
       FROM vip_membership m
       LEFT JOIN card_key c ON c.id = m.source_card_id
      WHERE m.user_id = ?`,
    [userId]
  );

  if (!row) return { isVip: false };
  return {
    isVip: true,
    level: row.level,
    source: row.source || (row.source_card_id ? 'card' : 'admin'),
    activatedAt: row.activated_at,
    cardTail: row.code_tail || ''
  };
}

export function isVipUser(userId) {
  if (!userId) return false;
  return !!get('SELECT id FROM vip_membership WHERE user_id = ?', [userId]);
}

/**
 * 后台手动设置用户身份：开通 / 取消永久 VIP。
 *
 * - 开通：写一条 source='admin' 的会员记录，不占用任何卡密；已是会员则不改动。
 * - 取消：删除会员记录。若该会员来自卡密，卡密保持「已使用」不退回
 *   （退款/换卡走卡密管理，避免后台误点导致卡密被重复使用）。
 * - 两种情况都写一条审计日志，用户详情里的「激活记录」能看到是谁动过。
 */
export function setVipByAdmin(userId, isVip, adminId = null) {
  if (isVip !== true && isVip !== false) {
    throw new AppError(ERR.PARAM, '身份参数不正确', 400);
  }

  const user = get('SELECT id FROM app_user WHERE id = ?', [userId]);
  if (!user) throw new AppError(ERR.NOT_FOUND, '用户不存在', 404);

  return tx(() => {
    const current = get('SELECT id, source FROM vip_membership WHERE user_id = ?', [userId]);

    if (isVip) {
      if (current) return { changed: false, isVip: true };

      const now = nowSql();
      run(
        `INSERT INTO vip_membership
           (user_id, level, source, source_card_id, source_admin_id, activated_at, created_at)
         VALUES (?, 'permanent', 'admin', NULL, ?, ?, ?)`,
        [userId, adminId, now, now]
      );
      logAttempt({
        userId,
        code: '',
        result: 'ADMIN_GRANT',
        message: adminId ? `后台手动开通永久 VIP（管理员 #${adminId}）` : '后台手动开通永久 VIP'
      });
      return { changed: true, isVip: true };
    }

    if (!current) return { changed: false, isVip: false };

    run('DELETE FROM vip_membership WHERE user_id = ?', [userId]);
    logAttempt({
      userId,
      code: '',
      result: 'ADMIN_REVOKE',
      message: current.source === 'card'
        ? '后台取消 VIP（卡密保持已使用，未退回）'
        : '后台取消 VIP'
    });
    return { changed: true, isVip: false };
  });
}

function fail(code, message, status, reason) {
  return new AppError(code, message, status, { reason });
}

/**
 * 卡密激活：核销卡密 + 建会员 + 防重复绑定，全部在一个事务内完成。
 * 幂等：同一用户重试同一张卡会返回成功，不产生第二条会员。
 */
export function activateVip(userId, rawCode, meta = {}) {
  const ip = meta.ip || '';

  if (!allowAttempt(userId, ip)) {
    throw fail(ERR.RATE_LIMITED, '尝试过于频繁，请稍后再试', 429, 'RATE_LIMITED');
  }

  const code = normalizeCode(rawCode);
  if (!code) {
    recordFailure(userId, ip);
    logAttempt({ userId, code: rawCode, result: 'CARD_FORMAT', message: '卡密格式不正确', meta });
    throw fail(ERR.CARD_FORMAT, '卡密格式不正确，请检查是否为 16 位', 400, 'CARD_FORMAT');
  }

  const hash = hashCode(code);
  let usedCardId = null;

  try {
    const result = tx(() => {
      const user = get('SELECT id, status FROM app_user WHERE id = ?', [userId]);
      if (!user) throw new AppError(ERR.TOKEN_INVALID, '登录已失效，请重新登录', 401);
      if (Number(user.status) !== 1) {
        throw new AppError(ERR.FORBIDDEN, '账号已被禁用', 403, { reason: 'USER_DISABLED' });
      }

      const membership = get('SELECT * FROM vip_membership WHERE user_id = ?', [userId]);
      const card = get('SELECT * FROM card_key WHERE code_hash = ?', [hash]);

      if (membership) {
        const sameCard = card
          && membership.source_card_id === card.id
          && card.used_by_user_id === userId;

        if (sameCard) {
          usedCardId = card.id;
          return {
            isVip: true,
            level: 'permanent',
            activatedAt: membership.activated_at,
            alreadyActivated: true,
            cardTail: card.code_tail
          };
        }
        throw fail(ERR.ALREADY_VIP, '你已经是永久 VIP，无需重复激活', 409, 'ALREADY_VIP');
      }

      if (!card) {
        throw fail(ERR.CARD_NOT_FOUND, '卡密无效，请核对后重试', 404, 'CARD_NOT_FOUND');
      }
      if (card.status === 'used') {
        throw fail(ERR.CARD_USED, '该卡密已被使用', 409, 'CARD_USED');
      }
      if (card.status === 'void') {
        throw fail(ERR.CARD_VOID, '该卡密已作废，请联系客服', 409, 'CARD_VOID');
      }
      if (card.valid_until && card.valid_until < nowSql()) {
        throw fail(ERR.CARD_EXPIRED, '该卡密已超过激活截止时间', 409, 'CARD_EXPIRED');
      }

      const now = nowSql();
      const claimed = run(
        `UPDATE card_key
            SET status = 'used', used_by_user_id = ?, used_at = ?
          WHERE id = ? AND status = 'unused'`,
        [userId, now, card.id]
      );

      if (claimed.changes !== 1) {
        const latest = get('SELECT status FROM card_key WHERE id = ?', [card.id]);
        if (latest && latest.status === 'used') {
          throw fail(ERR.CARD_USED, '该卡密已被使用', 409, 'CARD_USED');
        }
        if (latest && latest.status === 'void') {
          throw fail(ERR.CARD_VOID, '该卡密已作废，请联系客服', 409, 'CARD_VOID');
        }
        throw new AppError(ERR.SERVER, '激活失败，请稍后重试', 500);
      }

      run(
        `INSERT INTO vip_membership
           (user_id, level, source_card_id, activated_at, created_at)
         VALUES (?, 'permanent', ?, ?, ?)`,
        [userId, card.id, now, now]
      );

      usedCardId = card.id;
      return {
        isVip: true,
        level: 'permanent',
        activatedAt: now,
        alreadyActivated: false,
        cardTail: card.code_tail
      };
    });

    clearUserAttempts(userId);
    logAttempt({ cardId: usedCardId, userId, code, result: 'SUCCESS', meta });
    return result;
  } catch (err) {
    if (err && err.code !== ERR.ALREADY_VIP) {
      recordFailure(userId, ip);
    }
    logAttempt({
      cardId: null,
      userId,
      code,
      result: err && err.data && err.data.reason ? err.data.reason : 'ERROR',
      message: err && err.message,
      meta
    });
    throw err;
  }
}
