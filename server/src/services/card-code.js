import { createHmac, randomBytes } from 'node:crypto';
import config from '../config.js';

// Crockford Base32：去掉 I / L / O / U，避免与 1 / 0 混淆
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16;

export function randomCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // 256 能被 32 整除，& 31 无模偏差
    code += ALPHABET[bytes[i] & 31];
  }
  return code;
}

/**
 * 用户输入归一化：
 * - 去空白与连字符
 * - 转大写
 * - O→0、I/L→1（生成侧不会出现 I/L/O，可安全映射）
 */
export function normalizeCode(raw) {
  if (raw === null || raw === undefined) return '';
  const code = String(raw)
    .toUpperCase()
    .replace(/[\s\-—_]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(code) ? code : '';
}

export function formatCode(code) {
  return String(code || '').replace(/(.{4})(?=.)/g, '$1-');
}

export function codeTail(code) {
  return String(code || '').slice(-4);
}

export function hashCode(code) {
  return createHmac('sha256', config.cardSecret).update(code).digest('hex');
}
