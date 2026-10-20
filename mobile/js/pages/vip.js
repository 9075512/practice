import * as api from '../api.js';
import { escapeHtml, alert, toast } from '../ui.js';
import { icons } from '../icons.js';
import { navigate } from '../router.js';
import { setVip } from '../auth.js';
import { tabbarHtml, bindTabbar } from '../tabbar.js';

function normalizeCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s\-—_]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .slice(0, 16);
}

function formatCode(code) {
  return String(code || '')
    .replace(/(.{4})(?=.)/g, '$1-')
    .slice(0, 19);
}

const ERROR_TEXT = {
  40410: '卡密无效，请核对后重试',
  40910: '该卡密已被使用',
  40911: '该卡密已作废，请联系客服',
  40912: '该卡密已超过激活截止时间',
  40913: '你已经是永久 VIP，无需重复激活',
  42910: '尝试过于频繁，请稍后再试'
};

export default function vipPage() {
  let root = null;
  const state = { loading: true, isVip: false, vip: null, code: '', submitting: false, errorText: '' };

  function paint() {
    if (!root) return;
    root.innerHTML = html();
    bind();
  }

  function header() {
    return `<header class="appbar">
      <div class="appbar-inner">
        <div class="brand">
          <span class="brand-mark" style="background:linear-gradient(140deg,#ffd166,#f0b429);box-shadow:0 8px 18px -8px rgba(240,180,41,.9)">${icons.crown}</span>
          <span class="brand-text"><b>会员</b><span class="brand-sub">一次激活，永久有效</span></span>
        </div>
      </div>
    </header>`;
  }

  function html() {
    if (state.loading) {
      return `
        <div class="screen">
          ${header()}
          <div class="scroll has-tabbar"><div class="skeleton" style="height:150px"></div><div class="skeleton"></div></div>
          ${tabbarHtml('/vip')}
        </div>`;
    }

    if (state.isVip) {
      const vip = state.vip || {};
      return `
        <div class="screen">
          ${header()}

          <div class="scroll has-tabbar">
            <section class="vip-hero">
              <div class="vip-hero-top">
                <span class="vip-crown">${icons.crown}</span>
                <div class="vip-hero-text">
                  <h3>永久 VIP</h3>
                  <p>已解锁全部 VIP 专属题库</p>
                </div>
                <span class="vip-state">已生效</span>
              </div>

              <div class="rows">
                <div><span>激活时间</span><span>${escapeHtml(vip.activatedAt || '-')}</span></div>
                <div><span>卡密尾号</span><span>${escapeHtml(vip.cardTail || '-')}</span></div>
                <div><span>有效期</span><span class="vip-forever">永久有效</span></div>
              </div>
            </section>

            <section class="panel">
              <div class="panel-title">会员权益</div>
              <ul class="perk-list">
                <li>${icons.check}<span>背诵所有 VIP 专属题库</span></li>
                <li>${icons.check}<span>激活后永久有效，无到期时间</span></li>
                <li>${icons.check}<span>换设备后重新登录仍然有效</span></li>
              </ul>
            </section>

            <button class="btn btn-primary btn-block" data-act="start" type="button" style="margin-top:14px">去背题</button>

            <div class="vip-note">
              VIP 与账号绑定；遇到问题请把卡密尾号 ${escapeHtml(vip.cardTail || '-')} 提供给客服。
            </div>
          </div>

          ${tabbarHtml('/vip')}
        </div>`;
    }

    return `
      <div class="screen">
        ${header()}

        <div class="scroll has-tabbar">
          <section class="vip-hero">
            <div class="vip-hero-top">
              <span class="vip-crown">${icons.crown}</span>
              <div class="vip-hero-text">
                <h3>开通永久 VIP</h3>
                <p>输入卡密，解锁全部 VIP 专属题库</p>
              </div>
            </div>
          </section>

          <section class="panel" style="margin-top:14px">
            <div class="panel-title">输入卡密</div>
            <input class="code-input" data-act="code" placeholder="XXXX-XXXX-XXXX-XXXX"
              maxlength="19" autocomplete="off" autocapitalize="characters" spellcheck="false"
              inputmode="text" value="${escapeHtml(formatCode(state.code))}" />
            <div class="error-text">${escapeHtml(state.errorText)}</div>
            <p class="small muted" style="margin:2px 0 0">支持小写、带空格或连字符，输入后自动整理为 16 位。</p>
            <button class="btn btn-gold btn-block" data-act="submit" type="button"
              style="margin-top:14px" ${state.submitting ? 'disabled' : ''}>
              ${state.submitting ? '激活中…' : '立即激活'}
            </button>
          </section>

          <section class="panel">
            <div class="panel-title">开通后可用</div>
            <ul class="perk-list">
              <li>${icons.check}<span>解锁全部 VIP 专属题库</span></li>
              <li>${icons.check}<span>永久有效，无需续费</span></li>
              <li>${icons.check}<span>同一张卡重复提交不会重复扣卡</span></li>
            </ul>
          </section>

          <div class="vip-note">
            卡密由管理员发放，一卡一账号；激活后与当前账号绑定，换设备重新登录依然有效。
          </div>
        </div>

        ${tabbarHtml('/vip')}
      </div>`;
  }

  function bind() {
    const input = root.querySelector('[data-act="code"]');
    if (input) {
      input.addEventListener('input', () => {
        const code = normalizeCode(input.value);
        state.code = code;
        if (state.errorText) state.errorText = '';
        const formatted = formatCode(code);
        if (input.value !== formatted) {
          input.value = formatted;
        }
        const errorEl = root.querySelector('.error-text');
        if (errorEl && !state.errorText) errorEl.textContent = '';
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
      });
    }

    const submitBtn = root.querySelector('[data-act="submit"]');
    if (submitBtn) submitBtn.addEventListener('click', submit);

    const startBtn = root.querySelector('[data-act="start"]');
    if (startBtn) startBtn.addEventListener('click', () => navigate('#/'));

    bindTabbar(root);
  }

  async function submit() {
    if (state.submitting) return;

    if (state.code.length !== 16) {
      state.errorText = '请输入完整的 16 位卡密';
      paint();
      return;
    }

    state.submitting = true;
    state.errorText = '';
    paint();

    try {
      const vip = await api.post('/vip/activate', { code: state.code }, { silent: true });
      setVip(vip);
      state.isVip = true;
      state.vip = vip;
      state.submitting = false;
      state.code = '';
      paint();

      await alert({
        title: '激活成功',
        content: '永久 VIP 已生效，全部 VIP 专属题库已解锁。',
        confirmText: '去背题'
      });
      navigate('#/');
    } catch (err) {
      state.submitting = false;
      state.errorText = (err && ERROR_TEXT[err.code]) || (err && err.message) || '激活失败，请稍后重试';
      paint();
      if (err && err.code === 40913) loadStatus();
    }
  }

  async function loadStatus() {
    try {
      const vip = await api.get('/vip/status', null, { silent: true });
      setVip(vip);
      state.isVip = !!vip.isVip;
      state.vip = vip;
      state.loading = false;
    } catch (err) {
      state.loading = false;
      if (!state.isVip) toast('会员状态加载失败');
    }
    paint();
  }

  return {
    render: () => html(),
    mount(el) {
      root = el;
      bind();
      loadStatus();
    }
  };
}
