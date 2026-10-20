import * as api from '../api.js';
import * as cloud from '../cloud.js';
import { COVERS, typeColor, typeBackground } from '../constants.js';
import { escapeHtml, confirm } from '../ui.js';
import { icons } from '../icons.js';
import { navigate } from '../router.js';
import { attachPullRefresh } from '../pull-refresh.js';
import { isLoggedIn } from '../auth.js';
import { tabbarHtml, bindTabbar } from '../tabbar.js';
import * as storage from '../storage.js';

export default function banksPage() {
  let root = null;
  let detachPull = null;
  const state = { loading: true, banks: [], isVip: false, failed: false, mastered: 0 };

  function skeleton() {
    return '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }

  function bankCard(bank) {
    const chips = bank.typeCounts
      .slice(0, 3)
      .map(
        (item) =>
          `<span class="type-chip" style="color:${typeColor(item.type)};background:${typeBackground(
            item.type
          )}">${escapeHtml(item.type)} ${item.count}</span>`
      )
      .join('');

    const more =
      bank.typeCounts.length > 3
        ? `<span class="type-chip" style="color:#93a1b5;background:#f1f5fb">+${bank.typeCounts.length - 3}</span>`
        : '';

    const locked = bank.locked
      ? `<span class="lock-badge">${icons.lock}VIP</span>`
      : '';

    return `
      <button class="bank-card" data-bank="${bank.id}" type="button">
        <span class="bank-cover" style="background:${bank.cover}">${escapeHtml(bank.initial)}</span>
        <span class="bank-body">
          <span class="bank-top">
            <span class="bank-name">${escapeHtml(bank.name)}</span>
            ${locked}
          </span>
          <span class="bank-desc">${escapeHtml(bank.description || '暂无简介')}</span>
          <span class="bank-meta"><b>${bank.questionCount}</b> 道题${
            bank.typeCounts.length ? ` · ${bank.typeCounts.length} 种题型` : ''
          }</span>
          ${bank.typeCounts.length ? `<span class="type-chips">${chips}${more}</span>` : ''}
        </span>
        <span class="bank-chevron">${icons.chevron}</span>
      </button>`;
  }

  function headerPill() {
    if (!isLoggedIn()) {
      return '<button class="pill" data-act="login" type="button">登录 / 注册</button>';
    }
    return `<button class="pill pill-gold" data-act="vip" type="button">${icons.crown}${
      state.isVip ? '永久 VIP' : '开通会员'
    }</button>`;
  }

  function html() {
    const questionCount = state.banks.reduce((sum, bank) => sum + bank.questionCount, 0);

    let body = '';
    if (state.loading) {
      body = skeleton();
    } else if (state.failed) {
      body = `
        <div class="empty">
          ${icons.inbox}
          <p>题库加载失败</p>
          <p class="small">请检查网络后重试</p>
          <button class="btn btn-primary btn-sm" data-act="retry" type="button" style="margin-top:14px">重新加载</button>
        </div>`;
    } else if (!state.banks.length) {
      body = `
        <div class="empty">
          ${icons.inbox}
          <p>还没有题库</p>
          <p class="small">先在后台导入 Excel 题目</p>
        </div>`;
    } else {
      body = `<div class="bank-list">${state.banks.map(bankCard).join('')}</div>`;
    }

    return `
      <div class="screen">
        <header class="appbar">
          <div class="appbar-inner">
            <div class="brand">
              <span class="brand-mark">背</span>
              <span class="brand-text">
                <b>背题库</b>
                <span class="brand-sub">按题型刷，反复记</span>
              </span>
            </div>
            ${headerPill()}
          </div>
        </header>

        <div class="scroll has-tabbar">
          ${
            state.loading
              ? ''
              : `<section class="hero">
                   <div class="hero-row">
                     <div>
                       <div class="hero-kicker">题目总数</div>
                       <div class="hero-number">${questionCount}<span>道</span></div>
                     </div>
                     <div class="hero-side">
                       <div><b>${state.banks.length}</b><span>题库</span></div>
                       <div><b>${state.mastered}</b><span>已掌握</span></div>
                     </div>
                   </div>
                 </section>`
          }

          <div class="section-head">
            <h3>我的题库</h3>
            <span>下拉可刷新</span>
          </div>
          ${body}
        </div>

        ${tabbarHtml('/')}
      </div>`;
  }

  function bind() {
    root.querySelectorAll('[data-bank]').forEach((el) => {
      el.addEventListener('click', () => openBank(Number(el.dataset.bank)));
    });

    const vipBtn = root.querySelector('[data-act="vip"]');
    if (vipBtn) vipBtn.addEventListener('click', () => navigate('#/vip'));

    const loginBtn = root.querySelector('[data-act="login"]');
    if (loginBtn) loginBtn.addEventListener('click', () => navigate('#/login'));

    const retry = root.querySelector('[data-act="retry"]');
    if (retry) retry.addEventListener('click', () => load());

    bindTabbar(root);
  }

  async function openBank(id) {
    const bank = state.banks.find((item) => item.id === id);
    if (bank && bank.locked) {
      const go = await confirm({
        title: 'VIP 专属题库',
        content: '激活永久 VIP 后即可背诵该题库，激活后永久有效。',
        confirmText: '去激活'
      });
      if (go) navigate('#/vip');
      return;
    }
    navigate(`#/bank?id=${id}`);
  }

  async function load() {
    state.loading = true;
    state.failed = false;
    if (root) root.innerHTML = html();

    try {
      const [banks, vip] = await Promise.all([
        cloud.listBanks(),
        api.get('/vip/status', null, { silent: true }).catch(() => null)
      ]);

      state.banks = (banks || []).map((bank) => ({
        ...bank,
        locked: !!bank.vipOnly && !(vip && vip.isVip),
        initial: String(bank.name || '').slice(0, 1),
        // 按题库 id 取封面，和「背诵设置」页保持同一套配色
        cover: COVERS[Math.abs(bank.id) % COVERS.length]
      }));
      state.isVip = !!(vip && vip.isVip);
      state.mastered = state.banks.reduce((sum, bank) => sum + storage.masteryCount(bank.id), 0);
      state.loading = false;
    } catch (err) {
      state.loading = false;
      state.failed = true;
    }

    if (root) {
      root.innerHTML = html();
      bind();
    }
  }

  return {
    render: () => html(),
    mount(el) {
      root = el;
      bind();
      load();
      detachPull = attachPullRefresh({ onRefresh: load });
    },
    unmount() {
      if (detachPull) detachPull();
    }
  };
}
