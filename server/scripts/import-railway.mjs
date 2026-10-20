/**
 * 导入「题库_铁路线路工_高级工.xlsx」并只保留该题库。
 *
 * 走的是正式导入服务（preview → commit），包含题型识别、答案校验、重复跳过；
 * 导入成功后软删除其余题库。执行前会自动备份数据库。
 *
 * 用法：node scripts/import-railway.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewImport, commitImport } from '../src/services/import.service.js';
import { deleteBank } from '../src/services/bank.service.js';
import { all, get } from '../src/db/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const XLSX_FILE = process.argv[2] || path.join(root, '..', '题库_铁路线路工_高级工.xlsx');
const KEEP_BANK = process.env.KEEP_BANK || '铁路线路工（高级工）';

if (!fs.existsSync(XLSX_FILE)) {
  console.error(`找不到题库文件：${XLSX_FILE}`);
  process.exit(1);
}

const dbFile = path.join(root, 'data', 'app.db');
// 备份放在 server 目录之外，避免随部署一起上传
const backupDir = path.join(root, '..', '.backups');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `app.db-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
fs.copyFileSync(dbFile, backup);
console.log(`已备份数据库 → ${path.relative(path.join(root, '..'), backup)}`);

const base64 = fs.readFileSync(XLSX_FILE).toString('base64');
const preview = previewImport({ base64, fileName: path.basename(XLSX_FILE) });

console.log(
  `解析结果：共 ${preview.total} 行，可导入 ${preview.validCount}，重复 ${preview.duplicateCount}，异常 ${preview.invalidCount}`
);
if (preview.errors.length) {
  console.log('异常行：', JSON.stringify(preview.errors.slice(0, 10)));
}
if (!preview.validCount) {
  console.error('没有可导入的题目，已终止');
  process.exit(1);
}

const committed = commitImport({ importId: preview.importId });
console.log(`导入完成：新增 ${committed.created} 题，新建题库 ${committed.banksCreated} 个`);

for (const bank of all('SELECT id, name FROM bank WHERE deleted_at IS NULL')) {
  if (bank.name === KEEP_BANK) continue;
  deleteBank(bank.id);
  console.log(`已删除题库：${bank.name}`);
}

const banks = all('SELECT id, name FROM bank WHERE deleted_at IS NULL ORDER BY id');
console.log('\n当前题库：');
for (const bank of banks) {
  const types = all(
    'SELECT type, COUNT(*) AS count FROM question WHERE bank_id = ? AND deleted_at IS NULL GROUP BY type',
    [bank.id]
  );
  const total = get(
    'SELECT COUNT(*) AS count FROM question WHERE bank_id = ? AND deleted_at IS NULL',
    [bank.id]
  ).count;
  console.log(
    `  ${bank.name}：${total} 题 · ${types.map((item) => `${item.type} ${item.count}`).join(' / ')}`
  );
}
