-- 背题系统数据库结构（SQLite）
-- 只有三层：管理员 / 题库 / 题目。题目通过 type 字段区分题型，不设章节、分类等层级。
-- 时间统一为 YYYY-MM-DD HH:MM:SS 本地时区字符串；题库与题目使用 deleted_at 软删除。

CREATE TABLE IF NOT EXISTS admin_user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL DEFAULT '管理员',
  role          TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super')),
  status        INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS bank (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  vip_only    INTEGER NOT NULL DEFAULT 0 CHECK (vip_only IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 名称唯一只约束未删除的题库，删除后可以用同名重建
CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_name ON bank(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_list ON bank(deleted_at, sort_order, id);

CREATE TABLE IF NOT EXISTS question (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id    INTEGER NOT NULL REFERENCES bank(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  stem       TEXT    NOT NULL,
  options    TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(options)),
  answer     TEXT    NOT NULL DEFAULT '',
  analysis   TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_question_bank ON question(bank_id, type, deleted_at, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_question_updated ON question(updated_at);

-- ============ 用户与卡密 VIP ============

-- 用户：账号密码登录（用户名唯一），不再有游客/静默登录身份。
-- identity_type / identity_value 保留历史字段（注册时写入 acct:<username>），
-- 便于老数据与卡密审计继续可用。
-- session_id 是唯一在线会话号：每次登录覆盖，旧令牌立即失效。
CREATE TABLE IF NOT EXISTS app_user (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type  TEXT    NOT NULL CHECK (identity_type IN ('wx_openid', 'device')),
  identity_value TEXT    NOT NULL,
  nickname       TEXT    NOT NULL DEFAULT '',
  username       TEXT,
  password_hash  TEXT,
  session_id     TEXT,
  status         INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at     TEXT    NOT NULL,
  last_login_at  TEXT,
  UNIQUE (identity_type, identity_value)
);

CREATE TABLE IF NOT EXISTS card_batch (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no    TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL DEFAULT '',
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  valid_until TEXT,
  note        TEXT    NOT NULL DEFAULT '',
  created_by  INTEGER NOT NULL REFERENCES admin_user(id),
  created_at  TEXT    NOT NULL
);

-- 卡密只存 HMAC 哈希与末 4 位，明文仅在生成响应中出现一次
CREATE TABLE IF NOT EXISTS card_key (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id         INTEGER NOT NULL REFERENCES card_batch(id) ON DELETE RESTRICT,
  code_hash        TEXT    NOT NULL UNIQUE,
  code_tail        TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'unused'
                           CHECK (status IN ('unused', 'used', 'void')),
  used_by_user_id  INTEGER REFERENCES app_user(id) ON DELETE RESTRICT,
  used_at          TEXT,
  valid_until      TEXT,
  voided_at        TEXT,
  void_reason      TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  CHECK (
    (status =  'used' AND used_by_user_id IS NOT NULL AND used_at IS NOT NULL)
    OR
    (status <> 'used' AND used_by_user_id IS NULL     AND used_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_card_batch_status ON card_key(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_card_used_by ON card_key(used_by_user_id);

-- 永久 VIP：没有 expires_at，记录存在即为 VIP
-- source = 'card'  ：卡密激活，source_card_id 必填（一张卡最多对应一条会员）
-- source = 'admin' ：后台手动设置身份，没有卡密来源，source_card_id 为空
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
);

CREATE TABLE IF NOT EXISTS card_activation_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER REFERENCES card_key(id) ON DELETE SET NULL,
  user_id    INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  code_tail  TEXT    NOT NULL DEFAULT '',
  result     TEXT    NOT NULL,
  message    TEXT    NOT NULL DEFAULT '',
  client_ip  TEXT    NOT NULL DEFAULT '',
  user_agent TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activation_user_time
  ON card_activation_log(user_id, created_at);
