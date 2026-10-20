/**
 * 登录态管理。
 *
 * 只有账号登录：没有设备号 / 微信静默登录，没有账号令牌就只能看题库列表。
 * 令牌由后端签发（无状态 + 会话号），前端只负责存取。
 */
const TOKEN_KEY = 'recite_web_token';
const USER_KEY = 'recite_web_user';
const VIP_KEY = 'recite_web_vip';
// 旧版本遗留的设备号，仅用于清理，不再参与登录
const LEGACY_DEVICE_KEY = 'recite_web_device_id';

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* 隐私模式下写入失败不影响使用 */
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function getUser() {
  return read(USER_KEY, null);
}

export function setUser(user) {
  write(USER_KEY, user || null);
}

export function getVip() {
  return read(VIP_KEY, { isVip: false });
}

export function setVip(vip) {
  write(VIP_KEY, vip || { isVip: false });
}

/** 当前是否登录到「账号」（有用户名） */
export function hasAccount() {
  const user = getUser();
  return Boolean(user && user.username);
}

/** 令牌在、账号也在，才算真正登录 */
export function isLoggedIn() {
  return Boolean(getToken() && hasAccount());
}

/** 登录 / 注册成功后保存会话 */
export function setSession(data) {
  try {
    localStorage.setItem(TOKEN_KEY, data.token);
  } catch (err) {
    /* 忽略 */
  }
  write(USER_KEY, data.user);
  write(VIP_KEY, data.vip || { isVip: false });
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(VIP_KEY);
    localStorage.removeItem(LEGACY_DEVICE_KEY);
  } catch (err) {
    /* 忽略 */
  }
}

/** 清理没有账号的旧令牌（老版本设备号/微信静默登录遗留） */
export function dropLegacySession() {
  if (getToken() && !hasAccount()) clearAuth();
}
