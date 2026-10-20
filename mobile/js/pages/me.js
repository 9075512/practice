import * as api from '../api.js';
import { escapeHtml, confirm, toast } from '../ui.js';
import { icons } from '../icons.js';
import { navigate } from '../router.js';
import { clearAuth, setSession, setUser, setVip, getUser, getVip } from '../auth.js';
import { tabbarHtml, bindTabbar } from '../tabbar.js';

export default function mePage() {
  let root = null;
  const state = {
    loading: true,
    failed: false,
    me: null,
    editing: false,
    nickname: '',
    saving: false,
    pwdOpen: false,
    pwdOld: '',
    pwdNext: '',
    pwdConfirm: '',
    pwdSaving: false
  };

  function paint() {
    if (!root) return;
    root.innerHTML = html();
    bind();
  }

  function profile() {
    return state.me || { nickname: (getUser() || {}).nickname || '', vip: getVip() };
  }

  function header() {
    return `<header class="appbar">
      <div class="appbar-inner">
        <div class="appbar-title" style="text-align:left;padding-left:4px">我的</div>
      </div>
    </header>`;
  }

  function html() {
    if (state.loading) {
      return `
        <div class="screen">
          ${header()}
          <div class="scroll has-tabbar"><div class="skeleton" style="height:108px"></div><div class="skeleton"></div></div>
          ${tabbarHtml('/me')}
        </div>`;
    }

    if (state.failed) {
      return `
        <div class="screen">
          ${header()}
          <div class="scroll has-tabbar">
            <div class="empty">
              ${icons.inbox}
              <p>账号信息加载失败</p>
              <button class="btn btn-primary btn-sm" data-act="retry" style="margin-top:14px">重新加载</button>
            </div>
          </div>
          ${tabbarHtml('/me')}
        </div>`;
    }

    const me = profile();
    const vip = me.vip || { isVip: false };
    const initial = escapeHtml(String(me.nickname || me.username || '背').slice(0, 1).toUpperCase());

    let nicknameBlock;
    if (state.editing) {
      nicknameBlock = `
        <div class="nick-edit">
          <input class="nick-input" data-act="nick-input" maxlength="30"
            placeholder="输入新昵称" value="${escapeHtml(state.nickname)}" />
          <div class="nick-actions">
            <button class="btn btn-ghost btn-sm" data-act="nick-cancel" type="button">取消</button>
            <button class="btn btn-primary btn-sm" data-act="nick-save" type="button" ${state.saving ? 'disabled' : ''}>
              ${state.saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>`;
    } else {
      nicknameBlock = `
        <div class="nick-row">
          <div class="nick-name">${escapeHtml(me.nickname || '未设置昵称')}</div>
          <button class="icon-btn" data-act="edit" aria-label="编辑昵称">${icons.edit}</button>
        </div>`;
    }

    const vipRow = vip.isVip
      ? `<button class="list-row" data-act="vip" type="button">
           <span class="row-icon gold">${icons.crown}</span>
           <span class="row-label">会员状态</span>
           <span class="row-value" style="color:var(--gold);font-weight:600">永久 VIP</span>
           <i class="chev">${icons.chevron}</i>
         </button>`
      : `<button class="list-row" data-act="vip" type="button">
           <span class="row-icon gold">${icons.crown}</span>
           <span class="row-label">开通会员</span>
           <span class="row-value">未开通</span>
           <i class="chev">${icons.chevron}</i>
         </button>`;

    const pwdBlock = state.pwdOpen
      ? `
        <section class="panel" style="margin-top:12px">
          <div class="panel-title">修改密码</div>
          <div class="field">
            <div class="field-label">原密码</div>
            <input class="field-input" data-act="pwd-old" type="password" value="${escapeHtml(state.pwdOld)}"
              placeholder="请输入原密码" maxlength="32" autocomplete="current-password" />
          </div>
          <div class="field">
            <div class="field-label">新密码</div>
            <input class="field-input" data-act="pwd-next" type="password" value="${escapeHtml(state.pwdNext)}"
              placeholder="6-32 位" maxlength="32" autocomplete="new-password" />
          </div>
          <div class="field">
            <div class="field-label">确认新密码</div>
            <input class="field-input" data-act="pwd-confirm" type="password" value="${escapeHtml(state.pwdConfirm)}"
              placeholder="再输入一次" maxlength="32" autocomplete="new-password" />
          </div>
          <div class="nick-actions">
            <button class="btn btn-ghost btn-sm" data-act="pwd-cancel" type="button">取消</button>
            <button class="btn btn-primary btn-sm" data-act="pwd-save" type="button" ${state.pwdSaving ? 'disabled' : ''}>
              ${state.pwdSaving ? '保存中…' : '保存新密码'}
            </button>
          </div>
          <p class="small muted" style="margin:10px 2px 0">修改后其他设备会自动下线，本机保持登录。</p>
        </section>`
      : '';

    return `
      <div class="screen">
        ${header()}

        <div class="scroll has-tabbar">
          <section class="profile">
            <div class="profile-avatar">${initial}</div>
            <div class="profile-main">
              ${nicknameBlock}
              <div class="profile-sub">@${escapeHtml(me.username || '-')} · ID ${me.id != null ? me.id : '-'}</div>
            </div>
            ${vip.isVip ? `<span class="vip-badge">${icons.crown}VIP</span>` : ''}
          </section>

          <section class="panel list-panel" style="margin-top:12px">
            ${vipRow}
            <button class="list-row" data-act="pwd" type="button">
              <span class="row-icon">${icons.key}</span>
              <span class="row-label">修改密码</span>
              <i class="chev">${icons.chevron}</i>
            </button>
            <div class="list-row">
              <span class="row-icon">${icons.clock}</span>
              <span class="row-label">注册时间</span>
              <span class="row-value">${escapeHtml(me.createdAt || '-')}</span>
            </div>
            <div class="list-row">
              <span class="row-icon green">${icons.shield}</span>
              <span class="row-label">最近登录</span>
              <span class="row-value">${escapeHtml(me.lastLoginAt || '-')}</span>
            </div>
          </section>

          ${pwdBlock}

          <section class="panel list-panel" style="margin-top:12px">
            <button class="list-row danger" data-act="logout" type="button">
              <span class="row-icon danger">${icons.logout}</span>
              <span class="row-label">退出登录</span>
            </button>
          </section>

          <p class="foot-note">背诵进度与掌握状态保存在本机，不会上传；换设备后需重新标记。</p>
        </div>

        ${tabbarHtml('/me')}
      </div>`;
  }

  function bind() {
    const retry = root.querySelector('[data-act="retry"]');
    if (retry) retry.addEventListener('click', () => load());

    const edit = root.querySelector('[data-act="edit"]');
    if (edit) {
      edit.addEventListener('click', () => {
        state.nickname = profile().nickname || '';
        state.editing = true;
        paint();
      });
    }

    const cancel = root.querySelector('[data-act="nick-cancel"]');
    if (cancel) {
      cancel.addEventListener('click', () => {
        state.editing = false;
        paint();
      });
    }

    const input = root.querySelector('[data-act="nick-input"]');
    if (input) {
      input.addEventListener('input', () => {
        state.nickname = input.value;
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') saveNickname();
      });
      input.focus();
    }

    const save = root.querySelector('[data-act="nick-save"]');
    if (save) save.addEventListener('click', saveNickname);

    const vipBtn = root.querySelector('[data-act="vip"]');
    if (vipBtn) vipBtn.addEventListener('click', () => navigate('#/vip'));

    const logoutBtn = root.querySelector('[data-act="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const pwdBtn = root.querySelector('[data-act="pwd"]');
    if (pwdBtn) {
      pwdBtn.addEventListener('click', () => {
        state.pwdOpen = !state.pwdOpen;
        state.pwdOld = '';
        state.pwdNext = '';
        state.pwdConfirm = '';
        paint();
      });
    }

    const pwdCancel = root.querySelector('[data-act="pwd-cancel"]');
    if (pwdCancel) {
      pwdCancel.addEventListener('click', () => {
        state.pwdOpen = false;
        paint();
      });
    }

    const pwdFields = {
      'pwd-old': (v) => {
        state.pwdOld = v;
      },
      'pwd-next': (v) => {
        state.pwdNext = v;
      },
      'pwd-confirm': (v) => {
        state.pwdConfirm = v;
      }
    };
    Object.keys(pwdFields).forEach((act) => {
      const field = root.querySelector(`[data-act="${act}"]`);
      if (!field) return;
      field.addEventListener('input', () => pwdFields[act](field.value));
    });

    const pwdSave = root.querySelector('[data-act="pwd-save"]');
    if (pwdSave) pwdSave.addEventListener('click', savePassword);

    bindTabbar(root);
  }

  async function logout() {
    const ok = await confirm({
      title: '退出登录',
      content: '退出后需要重新输入账号密码，会员仍在账号里，重新登录即可恢复。',
      confirmText: '退出登录'
    });
    if (!ok) return;

    try {
      await api.logoutAccount();
    } catch (err) {
      /* 网络异常也允许本地退出 */
    }
    clearAuth();
    setUser(null);
    setVip({ isVip: false });
    state.me = null;
    state.pwdOpen = false;
    toast('已退出登录');
    navigate('#/login', true);
  }

  async function savePassword() {
    if (state.pwdSaving) return;

    if (!state.pwdOld) {
      toast('请输入原密码');
      return;
    }
    if (state.pwdNext.length < 6 || state.pwdNext.length > 32) {
      toast('新密码需 6-32 个字符');
      return;
    }
    if (state.pwdNext !== state.pwdConfirm) {
      toast('两次输入的新密码不一致');
      return;
    }

    state.pwdSaving = true;
    paint();
    try {
      const data = await api.changePassword(state.pwdOld, state.pwdNext);
      // 服务端改密后会轮换会话并补发令牌，这里同步保存，避免本机被自己踢下线
      if (data && data.token) setSession(data);
      state.pwdSaving = false;
      state.pwdOpen = false;
      state.pwdOld = '';
      state.pwdNext = '';
      state.pwdConfirm = '';
      toast('密码已更新');
      paint();
    } catch (err) {
      state.pwdSaving = false;
      paint();
    }
  }

  async function saveNickname() {
    if (state.saving) return;
    const nickname = String(state.nickname || '').trim();
    if (!nickname) {
      toast('昵称不能为空');
      return;
    }
    if (nickname.length > 30) {
      toast('昵称不能超过 30 个字符');
      return;
    }

    state.saving = true;
    paint();
    try {
      const me = await api.put('/me', { nickname });
      state.me = me;
      setUser({
        id: me.id,
        nickname: me.nickname,
        username: me.username || ''
      });
      setVip(me.vip);
      state.editing = false;
      state.saving = false;
      toast('昵称已更新');
      paint();
    } catch (err) {
      state.saving = false;
      paint();
    }
  }

  async function load() {
    state.loading = true;
    state.failed = false;
    if (root) root.innerHTML = html();

    try {
      const me = await api.get('/me', null, { silent: true });
      state.me = me;
      setUser({
        id: me.id,
        nickname: me.nickname,
        username: me.username || ''
      });
      setVip(me.vip);
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
    }
  };
}
