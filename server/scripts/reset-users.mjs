/**
 * 清空用户数据（本地用；线上用后台接口 POST /api/admin/users/reset-all）
 *
 * 做四件事，全部在一个事务里，失败自动回滚：
 *   1. 删掉所有 app_user（含游客与已注册账号）
 *   2. 删掉所有 vip_membership（会员身份归零）
 *   3. 删掉所有 card_activation_log（激活记录归零）
 *   4. 已使用的卡密回到 unused，解绑用户，可重新发放
 *
 * 用法：
 *   node scripts/reset-users.mjs --dry-run   # 只看会删多少
 *   node scripts/reset-users.mjs --yes       # 真正执行
 *
 * 注意：不可逆。执行前建议先备份 data/app.db。
 */
import { all, close } from '../src/db/index.js';
import { RESET_CONFIRM, getUserStats, resetUsers } from '../src/services/maintenance.service.js';

const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--yes');

const before = getUserStats();

console.log('当前数据：');
console.log(`  用户 ${before.users}（账号 ${before.accounts} / 游客 ${before.guests}）`);
console.log(`  VIP 会员 ${before.vip}`);
console.log(`  激活记录 ${before.logs}`);
console.log(`  已使用卡密 ${before.usedCards}`);

if (dryRun) {
  console.log('\n--dry-run 模式，未做任何修改。');
  close();
  process.exit(0);
}

if (!confirmed) {
  console.log('\n这是不可逆操作，确认请加 --yes 再执行。');
  close();
  process.exit(1);
}

const { after } = resetUsers(RESET_CONFIRM);

console.log('\n已清空：');
console.log(`  用户 ${before.users} → ${after.users}`);
console.log(`  VIP 会员 ${before.vip} → ${after.vip}`);
console.log(`  激活记录 ${before.logs} → ${after.logs}`);
console.log(`  已使用卡密 ${before.usedCards} → ${after.usedCards}（已回到未使用）`);

const cards = all("SELECT SUM(status = 'unused') AS unused, SUM(status = 'void') AS voided FROM card_key")[0];
console.log(`  卡密现状：可用 ${cards.unused || 0} 张 / 已作废 ${cards.voided || 0} 张`);

close();
