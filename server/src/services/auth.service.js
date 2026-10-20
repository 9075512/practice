import { randomBytes } from 'node:crypto';
import config from '../config.js';
import { get, run } from '../db/index.js';
import { issueToken } from '../utils/token.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError, ERR } from '../utils/errors.js';
import { nowSql } from '../utils/date.js';
import { assert, optionalText, requireText } from '../utils/validate.js';
import { getVipStatus } from './vip.service.js';

export function loginAdmin(body) {
  const username = requireText(body.username, '账号', 60);
  const password = requireText(body.password, '密码', 120);

  const admin = get('SELECT * FROM admin_user WHERE username = ?', [username]);
  assert(admin, '账号或密码错误', ERR.PARAM);
  assert(Number(admin.status) === 1, '账号已被禁用', ERR.FORBIDDEN);
  assert(verifyPassword(password, admin.password_hash), '账号或密码错误', ERR.PARAM);

  run('UPDATE admin_user SET last_login_at = ? WHERE id = ?', [nowSql(), admin.id]);
  const { token, expiresAt } = issueToken('admin', admin.id);

  return {
    token,
    expiresAt,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role
    }
  };
}

/* ================= 账号体系（用户名 + 密码） =================
 *
 * 设计要点：
 * 1. 只有账号：没有游客态、没有设备号 / 微信静默登录，未登录只能看题库列表；
 * 2. 单点登录（唯一在线）：app_user.session_id 只保留最近一次登录的会话号，
 *    新设备登录会覆盖它，旧令牌带着旧 sid 再次请求时会被中间件判定为已被挤下线；
 * 3. 退出登录、修改密码都会轮换会话号：前者让当前令牌作废，
 *    后者顺手把其他设备踢掉，并给当前设备补发一张新令牌。
 */

const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const loginFailures = new Map();

function normalizeUsername(raw) {
  const username = String(raw === null || raw === undefined ? '' : raw).trim();
  assert(username.length >= 3 && username.length <= 20, '用户名需 3-20 个字符');
  assert(USERNAME_RE.test(username), '用户名只能包含中文、字母、数字和下划线');
  return username;
}

function normalizePassword(raw, field = '密码') {
  const password = String(raw === null || raw === undefined ? '' : raw);
  assert(password.length >= 6 && password.length <= 32, `${field}需 6-32 个字符`);
  assert(password.trim() === password, `${field}首尾不能有空格`);
  return password;
}

function failureKey(ip, username) {
  return `${ip || '-'}|${String(username || '').toLowerCase()}`;
}

function pruneFailures(key) {
  const now = Date.now();
  const hits = (loginFailures.get(key) || []).filter((ts) => now - ts < FAIL_WINDOW_MS);
  if (hits.length) loginFailures.set(key, hits);
  else loginFailures.delete(key);
  return hits;
}

function assertLoginAllowed(ip, username) {
  const hits = pruneFailures(failureKey(ip, username));
  if (hits.length >= config.loginAttemptLimit) {
    throw new AppError(ERR.RATE_LIMITED, '密码错误次数过多，请 10 分钟后再试', 429);
  }
}

function recordLoginFailure(ip, username) {
  const key = failureKey(ip, username);
  const hits = pruneFailures(key);
  hits.push(Date.now());
  loginFailures.set(key, hits);
}

function clearLoginFailure(ip, username) {
  loginFailures.delete(failureKey(ip, username));
}

function findByUsername(username) {
  return get('SELECT * FROM app_user WHERE username = ? COLLATE NOCASE', [username]);
}

/** 注册时写进历史身份字段的值，仅用于保证 UNIQUE(identity_type, identity_value) 不冲突 */
function freeIdentityValue(username) {
  const base = `acct:${String(username).toLowerCase()}`;
  let value = base;
  let index = 1;
  while (get('SELECT id FROM app_user WHERE identity_type = ? AND identity_value = ?', ['device', value])) {
    index += 1;
    value = `${base}:${index}`;
  }
  return value;
}

/**
 * 建立会话：写入新的 session_id（挤掉旧会话），再签发带 sid 的令牌。
 * 调用方负责保证 user 是数据库里最新的行。
 */
function buildSession(user) {
  const sessionId = randomBytes(18).toString('hex');
  run('UPDATE app_user SET session_id = ? WHERE id = ?', [sessionId, user.id]);

  const { token, expiresAt } = issueToken('user', user.id, { sessionId });
  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      nickname: user.nickname,
      username: user.username || '',
      identityType: user.username ? 'account' : user.identity_type
    },
    vip: getVipStatus(user.id)
  };
}

/** 注册：直接新建账号行，返回 { token, expiresAt, user, vip } */
export function registerAccount(body = {}) {
  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);
  if (findByUsername(username)) {
    throw new AppError(ERR.CONFLICT, '该用户名已被注册', 409);
  }

  const nickname = optionalText(body.nickname, 30);
  const now = nowSql();

  const inserted = run(
    `INSERT INTO app_user
       (identity_type, identity_value, nickname, username, password_hash, status, created_at, last_login_at)
     VALUES ('device', ?, ?, ?, ?, 1, ?, ?)`,
    [freeIdentityValue(username), nickname || username, username, hashPassword(password), now, now]
  );

  const target = get('SELECT * FROM app_user WHERE id = ?', [inserted.lastInsertRowid]);
  assert(target, '注册失败，请重试', ERR.SERVER);
  return buildSession(target);
}

/** 账号密码登录（成功即成为该账号唯一在线会话） */
export function loginAccount(body = {}, { ip = '' } = {}) {
  const rawUsername = String(body.username === null || body.username === undefined ? '' : body.username).trim();
  const password = String(body.password === null || body.password === undefined ? '' : body.password);
  assert(rawUsername && password, '请输入用户名和密码');

  assertLoginAllowed(ip, rawUsername);

  const user = findByUsername(rawUsername);
  const passed = Boolean(user && user.password_hash) && verifyPassword(password, user.password_hash);
  if (!passed) {
    recordLoginFailure(ip, rawUsername);
    throw new AppError(ERR.PARAM, '用户名或密码错误', 400);
  }

  if (Number(user.status) !== 1) {
    throw new AppError(ERR.FORBIDDEN, '账号已被禁用，请联系管理员', 403);
  }

  clearLoginFailure(ip, rawUsername);
  run('UPDATE app_user SET last_login_at = ? WHERE id = ?', [nowSql(), user.id]);
  return buildSession(user);
}

/**
 * 修改自己的密码。
 * 改完轮换会话号：其他设备立即下线，当前设备拿到新令牌继续用。
 */
export function changeOwnPassword(userId, body = {}) {
  const user = get('SELECT id, username, password_hash FROM app_user WHERE id = ?', [userId]);
  assert(user, '用户不存在', ERR.TOKEN_INVALID);
  assert(user.password_hash, '账号未设置密码，请重新注册', ERR.PARAM);

  const oldPassword = String(body.oldPassword === null || body.oldPassword === undefined ? '' : body.oldPassword);
  const newPassword = normalizePassword(body.newPassword, '新密码');
  assert(verifyPassword(oldPassword, user.password_hash), '原密码不正确');
  assert(!verifyPassword(newPassword, user.password_hash), '新密码不能与原密码相同');

  run('UPDATE app_user SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), userId]);
  const fresh = get('SELECT * FROM app_user WHERE id = ?', [userId]);
  return { username: user.username, updated: true, ...buildSession(fresh) };
}

/** 退出登录：清空会话号，当前令牌立即作废 */
export function logoutAccount(userId) {
  const user = get('SELECT id FROM app_user WHERE id = ?', [userId]);
  assert(user, '用户不存在', ERR.TOKEN_INVALID);

  run('UPDATE app_user SET session_id = NULL WHERE id = ?', [userId]);
  return { loggedOut: true };
}
