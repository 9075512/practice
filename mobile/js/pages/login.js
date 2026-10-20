import * as api from '../api.js';
import { escapeHtml, toast } from '../ui.js';
import { icons } from '../icons.js';
import { back, navigate } from '../router.js';
import { setSession } from '../auth.js';

const ERROR_TEXT = {
  40001: '',
  40901: '该用户名已被注册，换一个试试',
  42910: '尝试次数过多，请 10 分钟后再试',
  40100: '请先登录'
};

function errorText(err) {
  if (!err) return '操作失败，请重试';
  if (ERROR_TEXT[err.code]) return ERROR_TEXT[err.code];
  return err.message || '操作失败，请重试';
}

export default function loginPage(ctx) {
  let root = null;
  const query = (ctx && ctx.query) || new URLSearchParams();

  const nextHash = (function () {
    const raw = query.get('next') || '';
    // 只接受站内 hash，避免被塞外部链接
    return raw.indexOf('#/') === 0 ? raw : '#/';
  })();

  const state = {
    mode: query.get('mode') === 'register' ? 'register' : 'login',
    username: '',
    password: '',
    confirm: '',
    nickname: '',
    submitting: false,
    errorText: query.get('reason') === 'kicked' ? '账号已在其他设备登录，请重新登录' : ''
  };

  function paint(keepFocus) {
    if (!root) return;
    const active = document.activeElement;
    const act = active && active.getAttribute ? active.getAttribute('data-act') : '';
    const pos = active && active.selectionStart;

    root.innerHTML = html();
    bind();

    if (keepFocus && act) {
      const next = root.querySelector(`[data-act="${act}"]`);
      if (next) {
        next.focus();
        try {
          if (typeof pos === 'number') next.setSelectionRange(pos, pos);
        } catch (err) {
          /* 部分老内核不支持 setSelectionRange */
        }
      }
    }
  }

  function html() {
    const isRegister = state.mode === 'register';

    const fields = isRegister
      ? `
        <div class="field">
          <div class="field-label">用户名</div>
          <input class="field-input" data-act="username" type="text" value="${escapeHtml(state.username)}"
            placeholder="3-20 位，中文/字母/数字/下划线" maxlength="20"
            autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" />
        </div>
        <div class="field">
          <div class="field-label">昵称（可选）</div>
          <input class="field-input" data-act="nickname" type="text" value="${escapeHtml(state.nickname)}"
            placeholder="不填默认用用户名" maxlength="30" />
        </div>
        <div class="field">
          <div class="field-label">密码</div>
          <input class="field-input" data-act="password" type="password" value="${escapeHtml(state.password)}"
            placeholder="6-32 位" maxlength="32" autocomplete="new-password" />
        </div>
        <div class="field">
          <div class="field-label">确认密码</div>
          <input class="field-input" data-act="confirm" type="password" value="${escapeHtml(state.confirm)}"
            placeholder="再输入一次" maxlength="32" autocomplete="new-password" />
        </div>`
      : `
        <div class="field">
          <div class="field-label">用户名</div>
          <input class="field-input" data-act="username" type="text" value="${escapeHtml(state.username)}"
            placeholder="请输入用户名" maxlength="20"
            autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" />
        </div>
        <div class="field">
          <div class="field-label">密码</div>
          <input class="field-input" data-act="password" type="password" value="${escapeHtml(state.password)}"
            placeholder="请输入密码" maxlength="32" autocomplete="current-password" />
        </div>`;

    return `
      <div class="screen login-screen">
        <div class="scroll">
          <div class="login-hero">
            <button class="icon-btn login-back" data-act="back" aria-label="返回">${icons.back}</button>
            <div class="login-logo">背</div>
            <h1 class="login-title">${isRegister ? '创建账号' : '欢迎回来'}</h1>
            <p class="login-sub">${
              isRegister ? '注册后即可开始背题' : '登录后开始今日的背诵'
            }</p>
          </div>

          <div class="panel">
            <div class="seg-tabs">
              <button class="${state.mode === 'login' ? 'active' : ''}" data-act="tab-login">登录</button>
              <button class="${state.mode === 'register' ? 'active' : ''}" data-act="tab-register">注册</button>
            </div>

            ${fields}

            <div class="auth-error">${escapeHtml(state.errorText)}</div>

            <div class="auth-actions">
              <button class="btn btn-primary btn-block" data-act="submit" ${state.submitting ? 'disabled' : ''}>
                ${state.submitting ? '处理中…' : isRegister ? '注册并登录' : '登录'}
              </button>
            </div>

            <div class="auth-foot">
              <span>${isRegister ? '已有账号？' : '还没有账号？'}</span>
              <button class="auth-link" data-act="switch">${isRegister ? '去登录' : '立即注册'}</button>
            </div>
          </div>

          <p class="foot-note">账号用于绑定会员：同一个账号只允许一台设备在线，新设备登录会让旧设备下线。</p>
        </div>
      </div>`;
  }

  function bind() {
    const backBtn = root.querySelector('[data-act="back"]');
    if (backBtn) backBtn.addEventListener('click', () => back('#/'));

    root.querySelectorAll('[data-act="tab-login"],[data-act="tab-register"]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.getAttribute('data-act') === 'tab-login' ? 'login' : 'register';
        if (mode === state.mode) return;
        state.mode = mode;
        state.errorText = '';
        paint();
      });
    });

    const switchBtn = root.querySelector('[data-act="switch"]');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        state.mode = state.mode === 'login' ? 'register' : 'login';
        state.errorText = '';
        paint();
      });
    }

    const map = {
      username: (v) => {
        state.username = v;
      },
      nickname: (v) => {
        state.nickname = v;
      },
      password: (v) => {
        state.password = v;
      },
      confirm: (v) => {
        state.confirm = v;
      }
    };

    Object.keys(map).forEach((act) => {
      const input = root.querySelector(`[data-act="${act}"]`);
      if (!input) return;
      input.addEventListener('input', () => map[act](input.value));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
      });
    });

    const submitBtn = root.querySelector('[data-act="submit"]');
    if (submitBtn) submitBtn.addEventListener('click', submit);
  }

  function validate() {
    const username = state.username.trim();
    const password = state.password;

    if (!username) return '请输入用户名';
    if (state.mode === 'register') {
      if (username.length < 3 || username.length > 20) return '用户名需 3-20 个字符';
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(username)) return '用户名只能包含中文、字母、数字和下划线';
      if (password.length < 6 || password.length > 32) return '密码需 6-32 个字符';
      if (password !== state.confirm) return '两次输入的密码不一致';
    } else if (!password) {
      return '请输入密码';
    }
    return '';
  }

  async function submit() {
    if (state.submitting) return;

    const message = validate();
    if (message) {
      state.errorText = message;
      paint(true);
      return;
    }

    state.submitting = true;
    state.errorText = '';
    paint(true);

    try {
      const data =
        state.mode === 'register'
          ? await api.registerAccount({
              username: state.username.trim(),
              password: state.password,
              nickname: state.nickname.trim()
            })
          : await api.loginByPassword(state.username.trim(), state.password);

      setSession(data);
      state.submitting = false;
      toast(state.mode === 'register' ? '注册成功，开始背题吧' : '登录成功');
      navigate(nextHash, true);
    } catch (err) {
      state.submitting = false;
      state.errorText = errorText(err);
      paint(true);
    }
  }

  return {
    render: () => html(),
    mount(el) {
      root = el;
      bind();
    }
  };
}
