import { get } from '../db/index.js';
import { resolveToken } from '../utils/token.js';
import { AppError, ERR } from '../utils/errors.js';

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || bearerToken(req);
  if (!token) return next(new AppError(ERR.UNAUTHORIZED, '请先登录', 401));

  const row = resolveToken(token);
  if (!row || row.subject_type !== 'admin') {
    return next(new AppError(ERR.TOKEN_INVALID, '登录已过期，请重新登录', 401));
  }

  const admin = get(
    'SELECT id, username, display_name, role, status FROM admin_user WHERE id = ?',
    [row.subject_id]
  );
  if (!admin) return next(new AppError(ERR.TOKEN_INVALID, '管理员不存在', 401));
  if (Number(admin.status) !== 1) return next(new AppError(ERR.FORBIDDEN, '账号已被禁用', 403));

  req.admin = {
    id: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role
  };
  return next();
}

function loadUser(row) {
  return get(
    'SELECT id, identity_type, identity_value, nickname, username, session_id, status FROM app_user WHERE id = ?',
    [row.subject_id]
  );
}

/**
 * 唯一在线校验：令牌里的 sid 必须与库里当前会话号一致。
 * 新设备登录会覆盖 session_id，旧令牌因此失效（40110），前端据此提示「已被挤下线」。
 */
function isSessionAlive(row, user) {
  return Boolean(row.session_id) && Boolean(user.session_id) && row.session_id === user.session_id;
}

/**
 * 可选登录：带令牌就解析（禁用照样拦），没带就放行。
 * 用于题库列表这类「不登录也能看、但要按会员身份标记锁定」的接口。
 * 令牌格式不对/已过期按游客处理；会话被挤掉则明确返回 40110，让客户端回登录页。
 */
export function optionalUser(req, res, next) {
  const token = req.headers['x-user-token'] || bearerToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const row = resolveToken(token);
  if (!row || row.subject_type !== 'user') {
    req.user = null;
    return next();
  }

  const user = loadUser(row);
  if (!user) {
    req.user = null;
    return next();
  }
  if (Number(user.status) !== 1) return next(new AppError(ERR.FORBIDDEN, '账号已被禁用', 403));
  if (!isSessionAlive(row, user)) {
    return next(new AppError(ERR.SESSION_KICKED, '账号已在其他设备登录，请重新登录', 401));
  }

  req.user = {
    id: user.id,
    identityType: user.identity_type,
    nickname: user.nickname,
    username: user.username || ''
  };
  return next();
}

export function requireUser(req, res, next) {
  const token = req.headers['x-user-token'] || bearerToken(req);
  if (!token) return next(new AppError(ERR.UNAUTHORIZED, '请先登录', 401));

  const row = resolveToken(token);
  if (!row || row.subject_type !== 'user') {
    return next(new AppError(ERR.TOKEN_INVALID, '登录已过期，请重新登录', 401));
  }

  const user = loadUser(row);
  if (!user) return next(new AppError(ERR.TOKEN_INVALID, '用户不存在', 401));
  if (Number(user.status) !== 1) return next(new AppError(ERR.FORBIDDEN, '账号已被禁用', 403));
  if (!isSessionAlive(row, user)) {
    return next(new AppError(ERR.SESSION_KICKED, '账号已在其他设备登录，请重新登录', 401));
  }

  req.user = {
    id: user.id,
    identityType: user.identity_type,
    nickname: user.nickname,
    username: user.username || ''
  };
  return next();
}
