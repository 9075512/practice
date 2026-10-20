import * as cloud from '../cloud.js';
import { escapeHtml, escapeText, toast } from '../ui.js';
import { icons } from '../icons.js';
import { back } from '../router.js';
import * as storage from '../storage.js';
import { typeColor, typeBackground } from '../constants.js';

export default function recitePage(ctx) {
  const bankId = Number(ctx.query.get('bankId') || 0);
  const type = ctx.query.get('type') ? decodeURIComponent(ctx.query.get('type')) : '';
  const order = ctx.query.get('order') === 'random' ? 'random' : 'seq';
  const onlyUnmastered = ctx.query.get('only') === '1';
  // 背题模式：进入即展开答案与解析，翻页后保持展开；普通模式仍由用户点击揭晓
  const mode = ctx.query.get('mode') === 'recite' ? 'recite' : 'normal';
  const reciteMode = mode === 'recite';

  const progressKey = storage.progressKey(bankId, type, order, onlyUnmastered, mode);
  const masteryMap = storage.getMastery(bankId);
  const startIndex = Math.max(0, Number(ctx.query.get('start') || 0) || 0);

  let root = null;

  const state = {
    bankId,
    type,
    order,
    onlyUnmastered,
    list: [],
    total: 0,
    loading: true,
    failed: false,
    index: 0,
    revealed: reciteMode,
    reciteMode,
    current: null,
    bankName: '',
    emptyText: onlyUnmastered ? '这个筛选下的题目都已经掌握了' : '这个筛选下还没有题目'
  };

  function paint() {
    if (!root) return;
    root.innerHTML = html();
    bind();
  }

  function optionHtml(option) {
    return `<div class="option ${option.correct ? 'correct' : ''}">
      <span class="key">${escapeHtml(option.key)}</span>
      <span>${escapeText(option.text)}</span>
    </div>`;
  }

  function answerHtml(q) {
    return `<div class="answer-block">
      <div class="answer-label">答案</div>
      <div class="answer-value">${escapeText(q.answerText)}</div>
      ${
        q.analysis
          ? `<div class="analysis">
               <div class="analysis-label">解析</div>
               <div class="analysis-body">${escapeText(q.analysis)}</div>
             </div>`
          : '<div class="analysis analysis-empty">本题暂未录入解析</div>'
      }
    </div>`;
  }

  function html() {
    const percent = state.total ? Math.round(((state.index + 1) / state.total) * 100) : 0;
    const canPrev = state.index > 0;
    const canNext = state.index < state.list.length - 1;
    const atLast = state.revealed && !canNext;

    let body = '';
    if (state.loading) {
      body = '<div class="skeleton" style="height:260px"></div>';
    } else if (state.failed) {
      body = `
        <div class="empty">
          ${icons.inbox}
          <p>题目加载失败</p>
          <button class="btn btn-primary btn-sm" data-act="retry" style="margin-top:14px">重新加载</button>
        </div>`;
    } else if (!state.current) {
      body = `
        <div class="empty">
          ${icons.inbox}
          <p>${escapeHtml(state.emptyText)}</p>
          <button class="btn btn-ghost btn-sm" data-act="back-to-bank" style="margin-top:14px">返回题库</button>
        </div>`;
    } else {
      const q = state.current;
      body = `
        <div class="qcard ${state.revealed ? 'revealed' : ''} ${state.reciteMode ? 'mode-recite' : ''}" data-act="card">
          <div class="qcard-head">
            <span class="qtype" style="color:${q.color};background:${q.bg}">${escapeHtml(q.type)}</span>
            ${state.reciteMode ? '<span class="mode-tag">答案已展开</span>' : ''}
            <button class="master-btn ${q.mastered ? 'on' : ''}" data-act="master" type="button">
              ${q.mastered ? icons.star : icons.starOutline}${q.mastered ? '已掌握' : '标记掌握'}
            </button>
          </div>

          <div class="stem">${escapeText(q.stem)}</div>

          ${q.options.length ? `<div class="options">${q.options.map(optionHtml).join('')}</div>` : ''}

          ${
            state.revealed
              ? answerHtml(q)
              : `<div class="hint">点击卡片或下方按钮显示答案</div>`
          }
        </div>`;
    }

    return `
      <div class="screen">
        <header class="appbar">
          <div class="appbar-inner">
            <button class="icon-btn" data-act="back">${icons.back}</button>
            <div class="appbar-title">${escapeHtml(state.bankName || '背题')}</div>
            ${state.reciteMode ? '<span class="appbar-mode">背题</span>' : ''}
            <span class="counter">${state.total ? `${state.index + 1}/${state.total}` : ''}</span>
          </div>
        </header>

        <div class="scroll has-footer">
          <div class="progress-wrap">
            <div class="progress-bar"><i style="width:${percent}%"></i></div>
            <div class="progress-text">${state.total ? `第 ${state.index + 1} 题 · 共 ${state.total} 题` : ''}</div>
          </div>
          ${body}
        </div>

        ${
          state.current
            ? `<div class="footer-bar">
                 <button class="btn btn-ghost" data-act="prev" ${canPrev ? '' : 'disabled'}>上一题</button>
                 <button class="btn btn-primary" data-act="main" ${atLast ? 'disabled' : ''}>
                   ${state.revealed ? (atLast ? '已是最后一题' : '下一题') : '显示答案'}
                 </button>
               </div>`
            : ''
        }
      </div>`;
  }

  function syncCurrent() {
    const question = state.list[state.index];

    if (!question) {
      state.current = null;
      if (progressKey) storage.setProgress(progressKey, 0);
      return;
    }

    const answer = String(question.answer || '');
    const upper = answer.toUpperCase();
    const isChoice = question.type === '单选题' || question.type === '多选题';
    const letters = /^[A-H]+$/.test(upper) ? upper : '';

    state.current = {
      id: question.id,
      type: question.type,
      stem: question.stem,
      options: (question.options || []).map((option) => ({
        key: option.key,
        text: option.text,
        correct: isChoice ? letters.indexOf(option.key) >= 0 : option.text === answer
      })),
      answerText: letters ? letters.split('').join('、') : answer,
      analysis: question.analysis || '',
      mastered: !!masteryMap[question.id],
      color: typeColor(question.type),
      bg: typeBackground(question.type)
    };

    if (progressKey) storage.setProgress(progressKey, state.index);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  async function loadAll() {
    const all = await cloud.queryQuestions({ bankId: state.bankId, type: state.type });
    let list = all;
    if (state.onlyUnmastered) {
      list = list.filter((q) => !masteryMap[q.id]);
    }
    if (state.order === 'random') {
      list = shuffle(list);
    }
    return list;
  }

  async function loadFirst() {
    state.loading = true;
    state.failed = false;
    paint();

    try {
      const list = await loadAll();
      state.list = list;
      state.total = list.length;
      state.loading = false;

      let index = startIndex;
      if (index > state.list.length - 1) index = Math.max(0, state.list.length - 1);
      state.index = index;
      state.revealed = state.reciteMode;
      syncCurrent();
    } catch (err) {
      state.loading = false;
      state.failed = true;
    }

    paint();
  }

  async function loadBankName() {
    try {
      const bank = await cloud.getBank(bankId);
      if (bank) {
        state.bankName = bank.name;
        paint();
      }
    } catch (err) {
      /* 题库名只用于展示 */
    }
  }

  function goTo(index) {
    if (index < 0) return;
    state.index = index;
    state.revealed = state.reciteMode;
    syncCurrent();
    paint();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function next() {
    if (state.index < state.list.length - 1) goTo(state.index + 1);
  }

  function prev() {
    if (state.index > 0) goTo(state.index - 1);
  }

  function reveal() {
    if (state.revealed || !state.current) return;
    state.revealed = true;
    paint();
  }

  function toggleMaster() {
    const question = state.current;
    if (!question) return;

    if (masteryMap[question.id]) {
      delete masteryMap[question.id];
      toast('已取消标记');
    } else {
      masteryMap[question.id] = 1;
      toast('已标记掌握');
    }

    storage.setMastery(state.bankId, masteryMap);
    syncCurrent();
    paint();
  }

  function bind() {
    const backBtn = root.querySelector('[data-act="back"]');
    if (backBtn) backBtn.addEventListener('click', leave);

    const retry = root.querySelector('[data-act="retry"]');
    if (retry) retry.addEventListener('click', () => loadFirst());

    const backToBank = root.querySelector('[data-act="back-to-bank"]');
    if (backToBank) backToBank.addEventListener('click', () => back(`#/bank?id=${bankId}`));

    const card = root.querySelector('[data-act="card"]');
    if (card) {
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-act="master"]')) return;
        if (state.revealed) next();
        else reveal();
      });
    }

    const masterBtn = root.querySelector('[data-act="master"]');
    if (masterBtn) {
      masterBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMaster();
      });
    }

    const prevBtn = root.querySelector('[data-act="prev"]');
    if (prevBtn) prevBtn.addEventListener('click', prev);

    const mainBtn = root.querySelector('[data-act="main"]');
    if (mainBtn) {
      mainBtn.addEventListener('click', () => {
        if (state.revealed) next();
        else reveal();
      });
    }
  }

  function onKeydown(event) {
    if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') prev();
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (state.revealed) next();
      else reveal();
    }
  }

  function leave() {
    back(`#/bank?id=${bankId}`);
  }

  return {
    render: () => html(),
    mount(el) {
      root = el;
      bind();
      loadFirst();
      loadBankName();
      document.addEventListener('keydown', onKeydown);
    },
    unmount() {
      document.removeEventListener('keydown', onKeydown);
      if (progressKey) storage.setProgress(progressKey, state.index);
    }
  };
}
