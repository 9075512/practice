/**
 * 用户数据维护：清空历史用户（切到强制注册后重置用）。
 *
 * 清理范围：
 *   - app_user 全部用户（游客 + 已注册账号）
 *   - vip_membership 会员记录
 *   - card_activation_log 激活记录
 *   - 已使用的卡密退回 unused 并解绑用户，可重新发放
 *
 * 题库、题目、卡密批次本身不受影响。
 */
import { get, run, tx } from '../db/index.js';
import { AppError, ERR } from '../utils/errors.js';

export const RESET_CONFIRM = 'RESET_USERS';

export function getUserStats() {
  return {
    users: get('SELECT COUNT(*) AS c FROM app_user').c,
    accounts: get('SELECT COUNT(*) AS c FROM app_user WHERE username IS NOT NULL').c,
    guests: get('SELECT COUNT(*) AS c FROM app_user WHERE username IS NULL').c,
    vip: get('SELECT COUNT(*) AS c FROM vip_membership').c,
    logs: get('SELECT COUNT(*) AS c FROM card_activation_log').c,
    usedCards: get("SELECT COUNT(*) AS c FROM card_key WHERE status = 'used'").c
  };
}

export function resetUsers(confirm) {
  if (confirm !== RESET_CONFIRM) {
    throw new AppError(ERR.PARAM, '确认参数不正确，未执行任何清理');
  }

  const before = getUserStats();

  tx(() => {
    // 会员记录同时引用 app_user 与 card_key，必须先删
    run('DELETE FROM vip_membership');
    run('DELETE FROM card_activation_log');
    // 卡密回到未使用：CHECK 约束要求 status <> 'used' 时两个使用字段都为 NULL
    run("UPDATE card_key SET status = 'unused', used_by_user_id = NULL, used_at = NULL WHERE status = 'used'");
    run('DELETE FROM app_user');
    try {
      run("DELETE FROM sqlite_sequence WHERE name IN ('app_user', 'vip_membership', 'card_activation_log')");
    } catch (err) {
      /* node:sqlite 或非 AUTOINCREMENT 表可能没有 sqlite_sequence，忽略 */
    }
  });

  return { before, after: getUserStats() };
}
