/**
 * 底部导航：题库 / 会员 / 我的。
 *
 * 只有这三个一级页面带 tabbar；题库详情、背题、登录是二级页面，走返回键。
 * tabbar 由各页面自己渲染（router 每次重绘都会重建 DOM），点击统一走 hash 路由。
 */
import { icons } from './icons.js';
import { navigate } from './router.js';

const TABS = [
  { path: '/', label: '题库', icon: icons.books },
  { path: '/vip', label: '会员', icon: icons.crownSolid },
  { path: '/me', label: '我的', icon: icons.userSolid }
];

export const TABBAR_HEIGHT = 58;

export function tabbarHtml(active) {
  const items = TABS.map((tab) => {
    const isActive = tab.path === active;
    return `<button class="tab-item${isActive ? ' active' : ''}" data-tab="${tab.path}"
      role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-label="${tab.label}">
      <span class="tab-icon">${tab.icon}</span>
      <span class="tab-label">${tab.label}</span>
    </button>`;
  }).join('');

  return `<nav class="tabbar" role="tablist">${items}</nav>`;
}

function currentHash() {
  return location.hash || '#/';
}

export function bindTabbar(root) {
  root.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      const path = el.dataset.tab;
      const target = path === '/' ? '#/' : `#${path}`;
      // 已经在该页时不做跳转，避免重复渲染整页
      if (currentHash() === target) return;
      navigate(target);
    });
  });
}
