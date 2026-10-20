import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import config from '../config.js';

const SECRET = 'recite-quiz-stateless-secret-2026';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function formatExpiry(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 无状态令牌：payload.signature，payload 只含主体类型、ID、过期时间和随机串。
 * 管理员与 App 用户共用签名逻辑，靠 t 字段区分。
 *
 * 用户令牌额外带 sid（会话号）：服务端在 app_user.session_id 上只保留最近一次的
 * 会话，令牌里的 sid 与库里的不一致就视为「已被新设备挤下线」。
 * 管理员令牌不带 sid，后台允许多处同时登录。
 */
export function issueToken(subjectType, subjectId, options = {}) {
  const ttl = subjectType === 'admin' ? config.tokenTtlAdminMs : config.tokenTtlUserMs;
  const expiresAtMs = Date.now() + ttl;
  const payload = base64url(
    JSON.stringify({
      t: subjectType,
      s: subjectId,
      exp: expiresAtMs,
      n: randomBytes(8).toString('hex'),
      ...(options.sessionId ? { sid: String(options.sessionId) } : {})
    })
  );
  return {
    token: `${payload}.${sign(payload)}`,
    expiresAt: formatExpiry(expiresAtMs)
  };
}

export function resolveToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = sign(payload);
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }

  if (!data || (data.t !== 'admin' && data.t !== 'user')) return null;
  if (!Number(data.exp) || Number(data.exp) <= Date.now()) return null;

  return {
    subject_type: data.t,
    subject_id: Number(data.s),
    session_id: data.sid ? String(data.sid) : ''
  };
}
