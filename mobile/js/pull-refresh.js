import { icons } from './icons.js';

const THRESHOLD = 56;
const MAX = 96;

/**
 * 下拉刷新：绑定在 document 上，通过 window.scrollY 判断是否处于顶部，
 * 因此页面重绘（重建滚动容器）不会丢失手势。
 * 返回解绑函数。
 */
export function attachPullRefresh({ onRefresh }) {
  const indicator = document.createElement('div');
  indicator.className = 'pull-indicator';
  indicator.innerHTML = `${icons.arrowDown}<span>下拉刷新</span>`;
  document.body.appendChild(indicator);

  let startY = 0;
  let pulling = false;
  let distance = 0;
  let loading = false;

  const setText = (text) => {
    const span = indicator.querySelector('span');
    if (span) span.textContent = text;
  };

  const setOffset = (value) => {
    const scroller = document.querySelector('.scroll');
    if (scroller) {
      scroller.style.transform = value ? `translateY(${value}px)` : '';
      scroller.style.transition = value ? 'none' : 'transform .28s ease';
    }
    indicator.style.transform = value ? `translateY(${value}px)` : '';
    indicator.style.transition = value ? 'none' : 'transform .28s ease';
    indicator.classList.toggle('show', value > 0);
  };

  const reset = () => {
    distance = 0;
    setOffset(0);
    indicator.classList.remove('ready', 'loading', 'show');
    setText('下拉刷新');
  };

  const onTouchStart = (event) => {
    if (loading || event.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    startY = event.touches[0].clientY;
    pulling = true;
    distance = 0;
  };

  const onTouchMove = (event) => {
    if (!pulling || loading) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0) {
      if (distance) reset();
      pulling = false;
      return;
    }
    distance = Math.min(MAX, delta * 0.55);
    setOffset(distance);
    const ready = distance >= THRESHOLD;
    indicator.classList.toggle('ready', ready);
    setText(ready ? '松手刷新' : '下拉刷新');
    if (delta > 12) event.preventDefault();
  };

  const onTouchEnd = async () => {
    if (!pulling || loading) return;
    pulling = false;

    if (distance < THRESHOLD) {
      reset();
      return;
    }

    loading = true;
    setOffset(THRESHOLD);
    indicator.classList.add('loading');
    setText('刷新中…');

    try {
      await onRefresh();
    } catch (err) {
      /* 刷新失败由页面自行提示 */
    } finally {
      loading = false;
      reset();
    }
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });

  return () => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', reset);
    indicator.remove();
  };
}
