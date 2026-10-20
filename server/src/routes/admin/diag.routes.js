/**
 * 临时诊断 / 修复路由：线上 vip_membership 表损坏时重建。
 * 修复完成后立即删除本文件与挂载。
 */
import { Router } from 'express';
import { all, exec, get, run } from '../../db/index.js';
import { ok } from '../../utils/response.js';
import { listUsers } from '../../services/user.service.js';
import { getUserStats } from '../../services/maintenance.service.js';
import { getVipStatus } from '../../services/vip.service.js';

const router = Router();

function safe(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

router.get('/db', (req, res) => {
  const out = { sqlite: safe(() => get('SELECT sqlite_version() AS v').v) };

  out.integrity = safe(() => all('PRAGMA integrity_check').map((r) => r.integrity_check).slice(0, 10));
  out.quickCheck = safe(() => all('PRAGMA quick_check').map((r) => r.quick_check).slice(0, 10));

  for (const table of ['app_user', 'vip_membership', 'card_key', 'card_batch', 'card_activation_log']) {
    out[table] = safe(() => ({
      columns: all(`PRAGMA table_info(${table})`).map((c) => `${c.name}${Number(c.notnull) ? '!' : ''}`),
      count: Number(get(`SELECT COUNT(*) AS c FROM ${table}`).c)
    }));
  }

  out.appUsers = safe(() => all('SELECT id, username, nickname, status FROM app_user'));
  out.appUsersFull = safe(() =>
    all('SELECT * FROM app_user').map((u) => ({
      id: u.id,
      username: u.username,
      hasHash: Boolean(u.password_hash),
      hashLen: String(u.password_hash || '').length,
      identity: u.identity_value,
      createdAt: u.created_at
    }))
  );
  out.questions = safe(() => ({
    total: Number(get('SELECT COUNT(*) AS c FROM question').c),
    sample: all('SELECT id, bank_id, type FROM question ORDER BY id LIMIT 3'),
    last: all('SELECT id FROM question ORDER BY id DESC LIMIT 3')
  }));
  out.banks = safe(() => all('SELECT id, name, vip_only, deleted_at FROM bank'));
  out.cards = safe(() => all('SELECT id, code_tail, status, used_by_user_id FROM card_key'));
  out.batches = safe(() => all('SELECT id, batch_no, name, quantity, note, created_by, created_at FROM card_batch'));
  out.logs = safe(() => all('SELECT id, card_id, user_id, code_tail, result, created_at FROM card_activation_log'));
  out.statsProbe = safe(() => getUserStats());
  out.listProbe = safe(() => {
    const data = listUsers({ page: 1, pageSize: 5 });
    return { total: data.total, list: data.list.map((u) => ({ id: u.id, username: u.username, isVip: u.isVip })) };
  });

  ok(res, out);
});

/** 重建 vip_membership，并从「已使用卡密」恢复会员记录；随后重建索引、清理探测账号 */
router.post('/repair-vip', (req, res) => {
  const steps = [];

  steps.push({
    step: 'drop',
    ...safe(() => {
      exec('DROP TABLE IF EXISTS vip_membership');
      return 'dropped';
    })
  });

  steps.push({
    step: 'create',
    ...safe(() => {
      exec(`
        CREATE TABLE IF NOT EXISTS vip_membership (
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
      return 'created';
    })
  });

  steps.push({
    step: 'restore-from-cards',
    ...safe(() => {
      const used = all(
        `SELECT c.id AS card_id, c.used_by_user_id, c.used_at, c.created_at
           FROM card_key c
           JOIN app_user u ON u.id = c.used_by_user_id
          WHERE c.status = 'used'`
      );
      let restored = 0;
      for (const card of used) {
        const exists = get('SELECT id FROM vip_membership WHERE user_id = ?', [card.used_by_user_id]);
        if (exists) continue;
        run(
          `INSERT INTO vip_membership
             (user_id, level, source, source_card_id, source_admin_id, activated_at, created_at)
           VALUES (?, 'permanent', 'card', ?, NULL, ?, ?)`,
          [card.used_by_user_id, card.card_id, card.used_at || card.created_at, card.created_at]
        );
        restored += 1;
      }
      return { restored };
    })
  });

  steps.push({
    step: 'reindex',
    ...safe(() => {
      exec('REINDEX');
      return 'reindexed';
    })
  });

  steps.push({
    step: 'drop-probe',
    ...safe(() => {
      run('DELETE FROM vip_membership WHERE user_id IN (SELECT id FROM app_user WHERE username LIKE ?)', ['probe%']);
      const deleted = run('DELETE FROM app_user WHERE username LIKE ?', ['probe%']);
      return { deleted: deleted.changes };
    })
  });

  steps.push({
    step: 'verify',
    ...safe(() => ({
      members: all('SELECT id, user_id, source, source_card_id, activated_at FROM vip_membership'),
      stats: getUserStats(),
      duzheVip: getVipStatus(get("SELECT id FROM app_user WHERE username = 'duzhe'").id)
    }))
  });

  steps.push({
    step: 'integrity',
    ...safe(() => all('PRAGMA quick_check').map((r) => r.quick_check).slice(0, 8))
  });

  ok(res, { steps });
});

/** 删除诊断时注册的临时账号 */
router.post('/drop-probe', (req, res) => {
  const result = safe(() => {
    run('DELETE FROM vip_membership WHERE user_id IN (SELECT id FROM app_user WHERE username LIKE ?)', ['probe%']);
    const deleted = run('DELETE FROM app_user WHERE username LIKE ?', ['probe%']);
    return { deleted: deleted.changes };
  });
  ok(res, result);
});

export default router;
