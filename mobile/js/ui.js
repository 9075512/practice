const toastEl = () => document.getElementById('toast');
const modalRoot = () => document.getElementById('modal-root');

let toastTimer = null;

export function toast(message, duration = 1800) {
  const el = toastEl();
  if (!el || !message) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function renderModal(html, onAction, { dismissible = true } = {}) {
  const root = modalRoot();
  return new Promise((resolve) => {
    let done = false;
    root.innerHTML = `<div class="modal">${html}</div>`;
    // 兜底：老版本 index.html 里这个容器没有 class，只有 id
    root.classList.add('modal-root');
    root.classList.add('show');

    const close = (value) => {
      if (done) return;
      done = true;
      root.removeEventListener('click', onRootClick);
      root.classList.remove('show');
      root.innerHTML = '';
      resolve(value);
    };

    function onRootClick(event) {
      if (dismissible && event.target === root) close(false);
    }

    root.addEventListener('click', onRootClick);
    onAction(root, close);
  });
}

/** 确认弹窗：点主按钮 resolve(true)，取消或点遮罩 resolve(false) */
export function confirm({
  title = '提示',
  content = '',
  confirmText = '确定',
  cancelText = '取消'
} = {}) {
  const html = `
    <h4>${escapeHtml(title)}</h4>
    <p>${escapeHtml(content)}</p>
    <div class="modal-actions">
      ${cancelText ? `<button class="btn btn-cancel" data-act="cancel">${escapeHtml(cancelText)}</button>` : ''}
      <button class="btn btn-ok" data-act="ok">${escapeHtml(confirmText)}</button>
    </div>`;

  return renderModal(html, (root, close) => {
    const cancelBtn = root.querySelector('[data-act="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
  });
}

/** 单按钮提示 */
export function alert({ title = '提示', content = '', confirmText = '知道了' } = {}) {
  const html = `
    <h4>${escapeHtml(title)}</h4>
    <p>${escapeHtml(content)}</p>
    <div class="modal-actions">
      <button class="btn btn-ok" data-act="ok">${escapeHtml(confirmText)}</button>
    </div>`;

  return renderModal(html, (root, close) => {
    root.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
  });
}

export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

/** 转义后保留换行 */
export function escapeText(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}
