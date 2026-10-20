// 用云服务 SDK 把本地 SQLite 的题目批量写入云库 questions 表
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { createRequire } from 'node:module';
const require = createRequire('D:/项目/练题项目/server/package.json');
const D = require('better-sqlite3');

const cloud = createWorkBuddyCloud({
  endpoint: 'https://practice-quiz-admin.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_DwdgUhZmm3xNHc432CLuxM_yKjDo5oEhWKFiSNsGMcKv0LEkaJVMHbQ',
});

const db = new D('D:/项目/练题项目/server/data/app.db', { readonly: true });
const bank = db.prepare('SELECT id FROM bank WHERE deleted_at IS NULL ORDER BY sort_order,id LIMIT 1').get();
const rows = db.prepare('SELECT type, stem, options, answer, analysis, sort_order FROM question WHERE deleted_at IS NULL AND bank_id = ? ORDER BY sort_order, id').all(bank.id);
db.close();

console.log('待迁移题目数:', rows.length, 'bank_id =', bank.id);

const BATCH = 50;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const part = rows.slice(i, i + BATCH).map((r, idx) => ({
    bank_id: 1, // 云库 banks.id
    type: r.type,
    stem: r.stem,
    options: (() => { try { return JSON.parse(r.options || '[]'); } catch { return []; } })(),
    answer: r.answer,
    analysis: r.analysis,
    sort_order: Number(r.sort_order) || (i + idx),
  }));
  const { data, error } = await cloud.database.from('questions').insert(part).select('id');
  if (error) {
    console.log('第', i, '批插入失败:', JSON.stringify(error));
    process.exit(1);
  }
  done += (data || []).length;
  console.log('已写入', done, '/', rows.length);
}
console.log('迁移完成，共写入', done, '题');
