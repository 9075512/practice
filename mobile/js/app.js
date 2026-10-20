import { defineRoute, navigate, setBeforeEach, start } from './router.js';
import { setAuthExpiredHandler } from './api.js';
import { dropLegacySession, isLoggedIn } from './auth.js';
import { toast } from './ui.js';
import banksPage from './pages/banks.js';
import bankPage from './pages/bank.js';
import recitePage from './pages/recite.js';
import vipPage from './pages/vip.js';
import mePage from './pages/me.js';
import loginPage from './pages/login.js';

defineRoute('/', banksPage);
defineRoute('/bank', bankPage);
defineRoute('/recite', recitePage);
defineRoute('/vip', vipPage);
defineRoute('/me', mePage);
defineRoute('/login', loginPage);

// 老版本遗留的游客令牌（没有账号）直接丢弃
dropLegacySession();

/**
 * 未登录只能看题库列表（#/），点进题库、背诵、会员、我的都会被拦到登录页。
 */
const NEED_LOGIN = ['/bank', '/recite', '/vip', '/me'];

function loginTarget(reason) {
  const current = location.hash || '#/';
  const suffix = reason ? `&reason=${encodeURIComponent(reason)}` : '';
  return `#/login?next=${encodeURIComponent(current)}${suffix}`;
}

setBeforeEach(({ path }) => {
  if (NEED_LOGIN.indexOf(path) >= 0 && !isLoggedIn()) return loginTarget();
  if (path === '/login' && isLoggedIn()) return '#/';
  return '';
});

/**
 * 令牌失效：40110 表示同一账号在别的设备登录了（唯一在线），
 * 其它 401 按登录过期处理；两种情况都回登录页，并在页面上说明原因。
 */
setAuthExpiredHandler((err) => {
  const kicked = Boolean(err && err.code === 40110);
  const onLogin = (location.hash || '').indexOf('#/login') === 0;
  toast(kicked ? '账号已在其他设备登录' : '登录已过期，请重新登录');
  if (!onLogin) navigate(loginTarget(kicked ? 'kicked' : 'expired'), true);
});

start(document.getElementById('app'));
