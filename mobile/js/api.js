import { clearAuth, getToken, isLoggedIn } from './auth.js';
import { toast } from './ui.js';

const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api/mp';

/** 账号令牌失效时的处理挂钩（由 app.js 注册，跳登录页） */
let authExpiredHandler = null;
export function setAuthExpiredHandler(fn) {
  authExpiredHandler = fn;
}

function createError(message, code, status) {
  const error = new Error(message || '请求失败');
  error.code = code;
  error.statusCode = status;
  return error;
}

async function send(options) {
  const method = (options.method || 'GET').toUpperCase();
  let url = BASE + options.url;

  if (method === 'GET' && options.data) {
    const params = new URLSearchParams();
    Object.keys(options.data).forEach((key) => {
      const value = options.data[key];
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    if (query) url += `?${query}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-User-Token'] = token;

  const init = { method, headers };
  if (method !== 'GET' && options.data !== undefined) {
    init.body = JSON.stringify(options.data);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const error = createError('网络异常，请确认后端已启动', null, 0);
    if (!options.silent) toast(error.message);
    throw error;
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    // 强制注册后没有游客态可降级：令牌失效一律清干净并回登录页
    clearAuth();
    const expired = createError('登录已过期，请重新登录', body.code, 401);
    if (authExpiredHandler) authExpiredHandler(expired);
    else if (!options.silent) toast(expired.message);
    throw expired;
  }

  if (res.ok && body.code === 0) return body.data;

  const error = createError(body.message || '请求失败', body.code, res.status);
  if (!options.silent) toast(error.message);
  throw error;
}

function request(options) {
  // 未登录不发起请求：silent 调用（如题库页探测 VIP 状态）静默失败即可
  if (!isLoggedIn()) {
    const need = createError('请先登录后继续', 40100, 401);
    if (!options.silent && authExpiredHandler) authExpiredHandler(need);
    else if (!options.silent) toast(need.message);
    return Promise.reject(need);
  }
  return send(options);
}

export function get(url, data, options = {}) {
  return request({ url, method: 'GET', data, ...options });
}

export function post(url, data, options = {}) {
  return request({ url, method: 'POST', data, ...options });
}

export function put(url, data, options = {}) {
  return request({ url, method: 'PUT', data, ...options });
}

/* ---------- 账号：注册 / 登录 / 退出 / 改密 ---------- */

function parseBody(res, body) {
  if (res.ok && body && body.code === 0) return body.data;
  throw createError((body && body.message) || '请求失败', body && body.code, res.status);
}

/** 账号密码登录；成功后由调用方保存会话 */
export async function loginByPassword(username, password) {
  const res = await fetch(`${BASE}/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).catch(() => {
    throw createError('网络异常，请确认网络后重试', null, 0);
  });
  return parseBody(res, await res.json().catch(() => ({})));
}

/** 注册：无需登录态，成功后直接拿到令牌 */
export async function registerAccount(payload) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {
    throw createError('网络异常，请确认网络后重试', null, 0);
  });
  return parseBody(res, await res.json().catch(() => ({})));
}

/** 退出登录（后端会摘掉设备绑定，避免静默登录又登回去） */
export function logoutAccount() {
  return post('/auth/logout', {}, { silent: true });
}

export function changePassword(oldPassword, newPassword) {
  return put('/me/password', { oldPassword, newPassword });
}
