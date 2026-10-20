/**
 * 极简 hash 路由。
 * 页面模块导出 { title, render(ctx) -> html, mount(root, ctx), unmount() }
 */

const routes = new Map();
let currentRoute = null;
let currentPage = null;
let beforeEach = null;

/** 路由守卫：返回一个 hash 字符串表示拦截并跳转，返回空表示放行 */
export function setBeforeEach(fn) {
  beforeEach = fn;
}

export function defineRoute(path, loader) {
  routes.set(path, loader);
}

export function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  let path = pathPart || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return { path: path || '/', query: new URLSearchParams(queryPart || '') };
}

export function navigate(to, replace = false) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (replace) location.replace(target);
  else location.hash = target;
}

export function back(fallback = '#/') {
  if (history.length > 1) history.back();
  else navigate(fallback, true);
}

export async function start(mountEl) {
  const render = async () => {
    const { path, query } = parseHash();

    if (beforeEach) {
      let redirect = '';
      try {
        redirect = beforeEach({ path, query }) || '';
      } catch (err) {
        redirect = '';
      }
      if (redirect) {
        navigate(redirect, true);
        return;
      }
    }

    const loader = routes.get(path) || routes.get('/');

    if (currentPage && typeof currentPage.unmount === 'function') {
      try {
        currentPage.unmount();
      } catch (err) {
        /* 页面卸载失败不影响跳转 */
      }
    }
    currentRoute = path;

    try {
      currentPage = await loader({ query, path });
      mountEl.innerHTML = currentPage.render({ query, path });
      if (typeof currentPage.mount === 'function') {
        currentPage.mount(mountEl, { query, path });
      }
      window.scrollTo(0, 0);
    } catch (err) {
      mountEl.innerHTML = `<div class="screen"><div class="empty"><p>页面加载失败</p>
        <p class="small">${err && err.message ? err.message : ''}</p></div></div>`;
    }
  };

  window.addEventListener('hashchange', render);
  if (!location.hash) location.replace('#/');
  await render();
}

export function currentPath() {
  return currentRoute;
}
