/**
 * 本地状态：已掌握标记与背诵进度。
 * 只存在本机 localStorage，不上传服务器。
 */
const MASTERY_PREFIX = 'recite_mastery_v1_';
const PROGRESS_PREFIX = 'recite_progress_v1_';
const MODE_KEY = 'recite_mode_v1';

/** 背诵模式：normal=先自己想再看答案；recite=背题模式，答案与解析默认展开 */
export const MODES = ['normal', 'recite'];

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : {};
  } catch (err) {
    return {};
  }
}

export function getMastery(bankId) {
  return readObject(MASTERY_PREFIX + bankId);
}

export function setMastery(bankId, map) {
  try {
    localStorage.setItem(MASTERY_PREFIX + bankId, JSON.stringify(map || {}));
  } catch (err) {
    /* 忽略 */
  }
}

export function masteryCount(bankId) {
  return Object.keys(getMastery(bankId)).length;
}

export function getMode() {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return MODES.indexOf(value) >= 0 ? value : 'normal';
  } catch (err) {
    return 'normal';
  }
}

export function setMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, MODES.indexOf(mode) >= 0 ? mode : 'normal');
  } catch (err) {
    /* 忽略 */
  }
}

export function progressKey(bankId, type, order, onlyUnmastered, mode) {
  const parts = [
    PROGRESS_PREFIX + bankId,
    type || 'all',
    order || 'seq',
    onlyUnmastered ? 'unmastered' : 'all'
  ];
  // 背题模式单独记进度；普通模式沿用老的 key，老用户的进度不丢
  if (mode === 'recite') parts.push('recite');
  return parts.join('_');
}

export function getProgress(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (err) {
    return 0;
  }
}

export function setProgress(key, index) {
  try {
    localStorage.setItem(key, String(Math.max(0, Number(index) || 0)));
  } catch (err) {
    /* 忽略 */
  }
}
