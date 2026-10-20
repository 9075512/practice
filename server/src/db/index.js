import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { hashPassword } from '../utils/password.js';
import { nowSql } from '../utils/date.js';
import { toDbParams } from './helpers.js';
import { applyLegacy, prepareLegacy } from './legacy.js';
import {
  openDatabase,
  get as drvGet,
  all as drvAll,
  run as drvRun,
  exec as drvExec,
  tx as drvTx,
  close,
  dbKind
} from './driver.js';

await openDatabase(config.dbFile);

const here = path.dirname(fileURLToPath(import.meta.url));

// 旧版（章节/分类）库先让位，等新表建好后再回填数据
const legacy = prepareLegacy();
drvExec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// 已有库不会走 CREATE TABLE 的新增列，这里做一次轻量补列
function ensureColumn(table, column, ddl) {
  const columns = drvAll(`PRAGMA table_info(${table})`);
  if (columns.some((item) => item.name === column)) return false;
  drvExec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`[db] 已为 ${table} 补充字段 ${column}`);
  return true;
}

/**
 * 老库升级：vip_membership 原本 source_card_id NOT NULL（会员只能来自卡密）。
 * 后台支持手动设置身份后要允许「无卡密来源」，SQLite 只能重建表。
 */
function migrateVipMembership() {
  const columns = drvAll('PRAGMA table_info(vip_membership)');
  if (!columns.length) return false;
  if (columns.some((item) => item.name === 'source')) return false;

  drvTx(() => {
    drvExec('DROP TABLE IF EXISTS vip_membership_new');
    drvExec(`
      CREATE TABLE vip_membership_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE RESTRICT,
        level           TEXT    NOT NULL DEFAULT 'permanent' CHECK (level IN ('permanent')),
        source          TEXT    NOT NULL DEFAULT 'card' CHECK (source IN ('card', 'admin')),
        source_card_id  INTEGER UNIQUE REFERENCES card_key(id) ON DELETE RESTRICT,
        source_admin_id INTEGER REFERENCES admin_user(id) ON DELETE SET NULL,
        activated_at    TEXT    NOT NULL,
        created_at      TEXT    NOT NULL,
        CHECK (
          (source = 'card'  AND source_card_id IS NOT NULL)
          OR
          (source = 'admin' AND source_card_id IS NULL)
        )
      )
    `);
    drvExec(`
      INSERT INTO vip_membership_new
        (id, user_id, level, source, source_card_id, source_admin_id, activated_at, created_at)
      SELECT id, user_id, level, 'card', source_card_id, NULL, activated_at, created_at
        FROM vip_membership
    `);
    drvExec('DROP TABLE vip_membership');
    drvExec('ALTER TABLE vip_membership_new RENAME TO vip_membership');
  });

  console.log('[db] 已重建 vip_membership：会员支持无卡密来源（后台设置身份）');
  return true;
}

ensureColumn('bank', 'vip_only', 'vip_only INTEGER NOT NULL DEFAULT 0');
// 账号体系（用户名 + 密码）：老库补列，再用部分唯一索引保证用户名不重复。
// 索引必须放在补列之后（schema.sql 先执行，老库那时还没有 username 列）。
ensureColumn('app_user', 'username', 'username TEXT');
ensureColumn('app_user', 'password_hash', 'password_hash TEXT');
// 唯一在线会话号：每次登录覆盖该字段，令旧令牌立即失效
ensureColumn('app_user', 'session_id', 'session_id TEXT');
drvExec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_username ON app_user(username) WHERE username IS NOT NULL'
);
migrateVipMembership();

if (legacy) {
  const result = applyLegacy(legacy);
  console.log(`[db] 已迁移旧版数据：${result.bankCount} 个题库 / ${result.questionCount} 道题`);
}

export function get(sql, params = []) {
  return drvGet(sql, toDbParams(params));
}

export function all(sql, params = []) {
  return drvAll(sql, toDbParams(params));
}

export function run(sql, params = []) {
  return drvRun(sql, toDbParams(params));
}

export function exec(sql) {
  return drvExec(sql);
}

export function tx(fn) {
  return drvTx(fn);
}

/**
 * 首次启动时创建默认管理员 admin / 123456。
 * 已存在则什么都不做，避免覆盖用户改过的密码。
 */
export function ensureAdmin() {
  const exists = drvGet('SELECT id FROM admin_user WHERE username = ?', ['admin']);
  if (exists) return false;

  const now = nowSql();
  drvRun(
    `INSERT INTO admin_user (username, password_hash, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'super', 1, ?, ?)`,
    ['admin', hashPassword('123456'), '管理员', now, now]
  );
  return true;
}

ensureAdmin();

export { close, dbKind };
