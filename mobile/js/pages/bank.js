import * as api from '../api.js';
import * as cloud from '../cloud.js';
import { escapeHtml, toast } from '../ui.js';
import { icons } from '../icons.js';
import { navigate, back } from '../router.js';
import * as storage from '../storage.js';
import { COVERS, typeColor, typeBackground } from '../constants.js';

export default function bankPage(ctx) {
  const bankId = Number(ctx.query.get('id') || 0);

  let root = null;
  const state = {
    bankId,
    bank: null,
    loading: true,
    failed: false,
    selectedType: '',
    mode: storage.getMode(),
    order: 'seq',
    onlyUnmastered: false,
    masteredCount: 0,
    filterCount: 0,
    startLabel: '开始背题',
    progressIndex: 0,
    hasProgress: false
  };

  function paint() {
    if (!root) return;
    root.innerHTML = html();
    bind();
  }

  function html() {
    if (state.loading) {
      return `
        <div class="screen">
          <header class="appbar"><div class="appbar-inner">
            <button class="icon-btn" data-act="back">${icons.back}</button>
            <div class="appbar-title">背诵设置</div>
            <span class="appbar-slot"></span>
          </div></header>
          <div class="scroll has-footer"><div class="skeleton" style="height:96px"></div><div class="skeleton"></div></div>
        </div>`;
    }

    if (state.failed || !state.bank) {
      return `
        <div class="screen">
          <header class="appbar"><div class="appbar-inner">
            <button class="icon-btn" data-act="back">${icons.back}</button>
            <div class="appbar-title">背诵设置</div>
            <span class="appbar-slot"></span>
          </div></header>
          <div class="scroll">
            <div class="empty">
              ${icons.inbox}
              <p>题库加载失败</p>
              <button class="btn btn-primary btn-sm" data-act="retry" style="margin-top:14px">重新加载</button>
            </div>
          </div>
        </div>`;
    }

    const bank = state.bank;
    const types = bank.typeCounts || [];
    const cover = COVERS[Math.abs(bank.id) % COVERS.length];
    const initial = String(bank.name || '').slice(0, 1);

    const chips = [
      `<button class="filter-chip ${state.selectedType === '' ? 'active' : ''}" data-type="">
        全部<span class="count">${bank.questionCount}</span>
      </button>`,
      ...types.map(
        (item) => `
        <button class="filter-chip ${state.selectedType === item.type ? 'active' : ''}" data-type="${escapeHtml(
          item.type
        )}"
          style="${
            state.selectedType === item.type
              ? `border-color:${typeColor(item.type)};background:${typeBackground(
                  item.type
                )};color:${typeColor(item.type)}`
              : ''
          }">
          ${escapeHtml(item.type)}<span class="count">${item.count}</span>
        </button>`
      )
    ].join('');

    return `
      <div class="screen">
        <header class="appbar">
          <div class="appbar-inner">
            <button class="icon-btn" data-act="back">${icons.back}</button>
            <div class="appbar-title">背诵设置</div>
            <span class="appbar-slot"></span>
          </div>
        </header>

        <div class="scroll has-footer">
          <section class="bank-hero">
            <span class="bank-cover" style="background:${cover}">${escapeHtml(initial)}</span>
            <div class="bank-hero-main">
              <h2>${escapeHtml(bank.name)}</h2>
              <p>${escapeHtml(bank.description || '暂无简介')}</p>
              <div class="badges">
                <span class="type-chip" style="color:var(--brand);background:var(--brand-soft)">${bank.questionCount} 道题</span>
                ${
                  bank.locked
                    ? `<span class="lock-badge">${icons.lock}VIP 专属</span>`
                    : '<span class="type-chip" style="color:var(--green);background:var(--green-soft)">免费</span>'
                }
              </div>
            </div>
          </section>

          <div class="stat-row">
            <div class="stat"><b style="color:var(--brand)">${bank.questionCount}</b><span>总题数</span></div>
            <div class="stat"><b style="color:var(--green)">${state.masteredCount}</b><span>已掌握</span></div>
            <div class="stat"><b>${types.length}</b><span>题型</span></div>
          </div>

          <section class="panel">
            <div class="panel-title">背诵模式</div>
            <div class="mode-grid">
              <button class="mode-tile ${state.mode === 'normal' ? 'active' : ''}" data-mode="normal" type="button">
                <b>普通模式</b>
                <span>先自己回忆，点击卡片揭晓答案</span>
              </button>
              <button class="mode-tile ${state.mode === 'recite' ? 'active' : ''}" data-mode="recite" type="button">
                <b>背题模式</b>
                <span>进题即展开答案与解析</span>
              </button>
            </div>
            <div class="mode-desc">${
              state.mode === 'recite'
                ? '适合快速过题：每翻一页都能直接看到答案，翻页后仍保持展开。'
                : '适合自测：先在心里作答，再点卡片核对答案与解析。'
            }</div>
          </section>

          <section class="panel">
            <div class="panel-title">题型</div>
            <div class="filter-group">${chips || '<span class="muted small">暂无题型</span>'}</div>

            <div class="panel-split"></div>

            <div class="panel-title">出题顺序</div>
            <div class="segment">
              <button data-order="seq" class="${state.order === 'seq' ? 'active' : ''}">按序号</button>
              <button data-order="random" class="${state.order === 'random' ? 'active' : ''}">随机</button>
            </div>

            <div class="switch-row">
              <div>
                <b>只看未掌握</b>
                <div class="small muted">跳过已标记掌握的题目</div>
              </div>
              <button class="switch ${state.onlyUnmastered ? 'on' : ''}" data-act="toggle-only" role="switch"
                aria-checked="${state.onlyUnmastered}" aria-label="只看未掌握"></button>
            </div>
          </section>

          <p class="hint">${state.mode === 'recite' ? '背题模式 · ' : ''}当前共 ${state.filterCount} 道题可背</p>
        </div>

        <div class="footer-bar">
          ${state.hasProgress ? '<button class="btn btn-ghost" data-act="restart">从头开始</button>' : ''}
          <button class="btn ${bank.locked ? 'btn-gold' : 'btn-primary'}" data-act="start">${escapeHtml(
            state.startLabel
          )}</button>
        </div>
      </div>`;
  }

  function bind() {
    const backBtn = root.querySelector('[data-act="back"]');
    if (backBtn) backBtn.addEventListener('click', () => back('#/'));

    const retry = root.querySelector('[data-act="retry"]');
    if (retry) retry.addEventListener('click', () => load());

    root.querySelectorAll('[data-type]').forEach((el) => {
      el.addEventListener('click', () => {
        const type = el.dataset.type || '';
        if (type === state.selectedType) return;
        state.selectedType = type;
        const found = (state.bank.typeCounts || []).find((item) => item.type === type);
        state.filterCount = type ? (found ? found.count : 0) : state.bank.questionCount;
        refreshStart(true);
      });
    });

    root.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.dataset.mode;
        if (mode === state.mode) return;
        state.mode = mode;
        storage.setMode(mode);
        refreshStart(true);
      });
    });

    root.querySelectorAll('[data-order]').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.order === state.order) return;
        state.order = el.dataset.order;
        refreshStart(true);
      });
    });

    const toggle = root.querySelector('[data-act="toggle-only"]');
    if (toggle) {
      toggle.addEventListener('click', () => {
        state.onlyUnmastered = !state.onlyUnmastered;
        refreshStart(true);
      });
    }

    const startBtn = root.querySelector('[data-act="start"]');
    if (startBtn) startBtn.addEventListener('click', start);

    const restartBtn = root.querySelector('[data-act="restart"]');
    if (restartBtn) restartBtn.addEventListener('click', () => openRecite(0));
  }

  function refreshStart(repaint = false) {
    if (!state.bank) return;

    const key = storage.progressKey(
      state.bankId,
      state.selectedType,
      state.order,
      state.onlyUnmastered,
      state.mode
    );
    const saved = storage.getProgress(key);
    const hasProgress = saved > 0;

    let startLabel = '开始背题';
    if (state.bank.locked) startLabel = '激活 VIP 后解锁';
    else if (!state.filterCount && !state.onlyUnmastered) startLabel = '暂无题目';
    else if (hasProgress) startLabel = `继续背题（第 ${saved + 1} 题）`;

    state.progressIndex = hasProgress ? saved : 0;
    state.hasProgress = hasProgress;
    state.startLabel = startLabel;

    if (repaint) paint();
  }

  function start() {
    if (state.bank && state.bank.locked) {
      navigate('#/vip');
      return;
    }
    openRecite(state.progressIndex);
  }

  function openRecite(startIndex) {
    if (state.bank && state.bank.locked) {
      navigate('#/vip');
      return;
    }
    if (!state.filterCount && !state.onlyUnmastered) {
      toast('这个题型下还没有题目');
      return;
    }

    const query = [
      `bankId=${state.bankId}`,
      `type=${encodeURIComponent(state.selectedType)}`,
      `order=${state.order}`,
      `only=${state.onlyUnmastered ? 1 : 0}`,
      `mode=${state.mode}`,
      `start=${startIndex || 0}`
    ].join('&');

    navigate(`#/recite?${query}`);
  }

  async function load() {
    state.loading = true;
    state.failed = false;
    paint();

    try {
      const [bank, vip] = await Promise.all([
        cloud.getBank(bankId),
        api.get('/vip/status', null, { silent: true }).catch(() => null)
      ]);
      if (!bank) throw new Error('题库不存在');
      state.bank = { ...bank, locked: !!bank.vipOnly && !(vip && vip.isVip) };
      state.loading = false;
      state.filterCount = bank.questionCount;
      state.masteredCount = storage.masteryCount(bankId);
      refreshStart();
    } catch (err) {
      state.loading = false;
      state.failed = true;
    }

    paint();
  }

  return {
    render: () => html(),
    mount(el) {
      root = el;
      bind();
      load();
    }
  };
}
