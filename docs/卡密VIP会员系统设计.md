# 卡密激活 · 永久 VIP 会员系统设计

> 版本：v1.2 · 2026-10-20（已按本文实现并验证，见 `server/test/smoke.mjs` 115 项断言）
> 适用：背题库移动端（H5）+ 管理后台（也可独立复用到其他内容型产品）
> 变更：小程序端已下线；用户身份改为「用户名 + 密码」，并按账号做单点登录（唯一在线）
> 范围：卡密生命周期、VIP 绑定、激活事务、状态判定与异常处理。本文负责「是不是 VIP」；VIP 解锁的题库由 `bank.vip_only` 定义。

**落地差异说明**（相对 v1.0 评审稿）：

- 用户身份：`app_user` 表，用户名 + 密码注册；`session_id` 记录唯一在线会话，新登录挤掉旧设备（`40110`）
- 卡密格式：16 位 Crockford Base32（去掉 I/L/O/U），展示 `XXXX-XXXX-XXXX-XXXX`；输入自动大写、去分隔符、O/I/L 归一为 0/1
- 限流：每用户 10 分钟 5 次失败、每 IP 每小时 30 次失败（测试环境放宽）
- 管理接口前缀：`/api/admin/card-batches`、`/api/admin/cards/:id/void`、`/api/admin/vip-members`

---

## 0. 结论先行

| # | 规则 | 说明 |
|---|---|---|
| 1 | **一卡一用户，一用户一会员** | 一张卡只能被一个用户激活；一个用户最多一条 VIP 记录 |
| 2 | **永久 VIP 不设到期字段** | 会员表没有 `expires_at`，从结构上杜绝误过期 |
| 3 | **卡密只存哈希** | 数据库不保存明文，明文仅在生成时返回一次 |
| 4 | **激活是一个事务** | 核销卡密、写会员、写绑定必须同生共死 |
| 5 | **条件更新 + 唯一索引双保险** | `UPDATE ... WHERE status='unused'` 保证只成功一次 |
| 6 | **激活后不可解绑、不可转移** | 不提供解绑接口，卡密的 `used_by_user_id` 不可修改 |
| 7 | **已是 VIP 时新卡不消耗** | 先查会员再核销卡密，避免用户白扔一张卡 |

---

## 1. 目标与非目标

### 1.1 目标

- 管理端按批次生成卡密，支持导出与分发
- 移动端输入卡密，一次激活，永久 VIP
- 卡密唯一、可用、只能使用一次
- 激活结果明确：成功、格式错误、卡密无效、已使用、已作废、已是 VIP、限流、系统异常
- 并发安全：同一张卡被多人同时提交，最多一个成功
- VIP 状态可查询、可判定，服务端为唯一可信来源
- 全链路可审计：谁在什么时候用哪张卡激活了哪个账号

### 1.2 非目标

- 付费购买、退款、发票
- 会员等级、续费、临时 VIP、过期提醒
- 卡密转让、解绑、换绑账号
- 分销、邀请返利、裂变
- 实体卡印刷与物流（只负责生成可印刷的卡号文件）

---

## 2. 角色与总体流程

| 角色 | 动作 |
|---|---|
| 管理员 | 生成批次、下载卡密、查看库存、作废未使用卡、查看 VIP 列表 |
| 用户 | 登录、输入卡密、激活、查看 VIP 状态 |
| 系统 | 校验格式与状态、核销卡密、建立绑定、记录日志、限流 |

```
管理员                         服务端                          用户
  │  生成批次 N 张               │                              │
  ├────────────────────────────▶│  生成明文 + 存哈希            │
  │◀──── 明文仅此一次 ───────────┤                              │
  │  导出 CSV / 印刷 / 分发       │                              │
  │                              │        输入 16 位卡密         │
  │                              │◀─────────────────────────────┤
  │                              │  事务：校验→核销→建会员→提交  │
  │                              │─────────────────────────────▶│
  │                              │        永久 VIP / 失败原因    │
```

---

## 3. 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 用户身份 | 用户名 + 密码（已落地） | 换手机、清缓存后重新登录即可找回 VIP；同一账号只允许一台设备在线 |
| 卡密存储 | HMAC-SHA256 哈希 + 末 4 位 | 数据库泄露也拿不到可用卡密；末 4 位供客服定位 |
| 卡密格式 | 16 位 Crockford Base32 | 80 bit 熵，肉眼可读，去掉易混字符 |
| 会员期限 | 永久，无 `expires_at` | 与需求一致，结构上不可能过期 |
| 绑定关系 | `vip_membership.user_id UNIQUE` | 数据库层保证一人一会员 |
| 卡密消费顺序 | 先查会员，再核销卡密 | 已是 VIP 时不会误消耗新卡 |
| 并发控制 | `BEGIN IMMEDIATE` + 条件 UPDATE + 唯一索引 | SQLite 单写锁天然串行；唯一索引兜底 |
| 明文可见性 | 仅生成响应返回一次 | 不存明文，管理员必须当场下载 |
| 解绑 | 不支持 | 防止一卡多号、账号买卖；客服也不能改绑 |

---

## 4. 卡密规则

### 4.1 格式

- 字符集：Crockford Base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
  - 去掉了 `I / L / O / U`，避免与 `1 / 0` 混淆，也避免拼出脏词
- 长度：16 位，展示为 `XXXX-XXXX-XXXX-XXXX`
- 熵：32^16 = 2^80，随机猜测不可行
- 示例：`7K2M-9Q4X-B6RT-H3WZ`

**输入归一化**（用户可能复制粘贴、带空格、小写、把 0 打成 O）：

```text
1. 去首尾空白，转大写
2. 去掉空格、半角/全角连字符
3. O → 0，I → 1，L → 1   （生成侧永远不会产生 I/L/O，可安全映射）
4. 校验 ^[0-9A-HJKMNP-TV-Z]{16}$
```

格式不合法时直接返回，不查数据库，避免无意义的 IO 与计时差异。

### 4.2 生成

```js
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 字符
const CODE_LEN = 16;

// 256 能被 32 整除，bytes[i] & 31 无模偏差
function randomCode() {
  const bytes = randomBytes(CODE_LEN);
  let code = '';
  for (let i = 0; i < CODE_LEN; i += 1) code += ALPHABET[bytes[i] & 31];
  return code;
}

function hashCode(code) {
  return createHmac('sha256', process.env.CARD_SECRET).update(code).digest('hex');
}
```

生成流程：

1. 管理员提交批次：名称、数量（1 ~ 2000）、备注、可选激活截止时间
2. 服务端在一个事务里创建 `card_batch`，循环生成卡密
3. 每条写入 `code_hash`（唯一索引）；若碰撞（概率可忽略）重新生成，最多重试 5 次
4. 事务提交后，把**明文数组**返回给管理端，仅此一次
5. 管理端立即下载 CSV，服务端不保留明文

> 生成数量建议单批不超过 2000：一次性返回的 JSON 约 60KB，管理端也能顺畅下载。需要更多就分多批。

### 4.3 存储

| 字段 | 内容 | 说明 |
|---|---|---|
| `code_hash` | HMAC-SHA256 十六进制 | 唯一索引，查询唯一依据 |
| `code_tail` | 明文末 4 位 | 客服按尾号定位，不能反推完整卡密 |
| `status` | `unused / used / void` | 生命周期状态 |
| `used_by_user_id` | 激活用户 | 只在 `used` 时有值 |
| `used_at` | 激活时间 | 服务器时间 |
| `valid_until` | 可选激活截止时间 | `NULL` 表示永久可激活；只约束「激活动作」，不影响已激活会员的永久性 |
| `batch_id` | 所属批次 | 便于统计、批量作废 |

**明文只出现一次**：管理端关闭生成结果后，无法再次查看。若批次文件丢失，只能把该批次未使用的卡全部作废并重新生成。

### 4.4 分发规则

- 以批次为单位管理：批次号 `VIP-YYYYMMDD-序号`，记录生成人、数量、备注
- 导出文件包含：序号、卡密、批次号、生成时间、使用说明
- 分发渠道：印刷实体卡、客服私发、邮件、渠道商
- 一卡只发给一个购买者；同一批次可拆分给多个渠道，但要记录渠道与起止序号
- 禁止把卡密写入日志、聊天记录以外的公开场所；管理端列表只显示末 4 位
- 作废规则：只有 `unused` 可以作废；`used` 永久不可作废、不可回收

### 4.5 卡密状态机

```
            激活成功（原子）
  unused ───────────────────▶ used（终态，不可逆）
     │
     │ 管理员作废（仅未使用）
     ▼
   void（终态）
```

没有「已使用 → 未使用」的回退路径。任何回退都会破坏一次性约束。

---

## 5. 数据结构

```sql
-- 用户：VIP 必须挂在稳定身份上
CREATE TABLE IF NOT EXISTS app_user (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type  TEXT    NOT NULL CHECK (identity_type IN ('wx_openid', 'device')),
  identity_value TEXT    NOT NULL,
  nickname       TEXT    NOT NULL DEFAULT '',
  status         INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at     TEXT    NOT NULL,
  last_login_at  TEXT,
  UNIQUE (identity_type, identity_value)
);

-- 批次：分发与统计单位
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

-- 卡密：只存哈希
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

-- VIP 会员：有且仅有一条，没有到期字段
-- source = 'card'  卡密激活，必须带 source_card_id
-- source = 'admin' 后台手动设置身份，没有卡密（source_card_id 为空）
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

-- 激活审计：成功与失败都记录，便于排查与风控
CREATE TABLE IF NOT EXISTS card_activation_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER REFERENCES card_key(id) ON DELETE SET NULL,
  user_id    INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  code_tail  TEXT    NOT NULL DEFAULT '',
  result     TEXT    NOT NULL,          -- SUCCESS / CARD_USED / ...
  message    TEXT    NOT NULL DEFAULT '',
  client_ip  TEXT    NOT NULL DEFAULT '',
  user_agent TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activation_user_time
  ON card_activation_log(user_id, created_at);
```

### 5.1 约束说明

| 约束 | 作用 |
|---|---|
| `card_key.code_hash UNIQUE` | 卡密全局唯一，哈希碰撞直接失败 |
| `vip_membership.user_id UNIQUE` | 一个用户最多一条会员记录，防并发重复开通 |
| `vip_membership.source_card_id UNIQUE` | 一张卡最多对应一条会员，双重保险 |
| `vip_membership` 的 CHECK | `source='card'` 必须有卡；`source='admin'` 必须没有卡，来源不会含糊 |
| `card_key` 的 CHECK | `used` 必须有使用人和时间；非 `used` 必须没有，杜绝脏状态 |
| `ON DELETE RESTRICT` | 不允许删除有卡密/会员关联的用户或批次，避免历史断链 |

### 5.2 为什么会员表没有 `expires_at`

需求是永久 VIP。如果表里存在 `expires_at`，任何一次误填、时区换算或后台编辑都可能让会员突然过期。**没有这个字段，就不存在过期逻辑**，查询也退化为「记录是否存在」。

将来如果要加临时会员，应新增 `vip_type` 与 `expires_at` 字段并改查询逻辑，而不是现在预留一个永远为 `NULL` 的字段增加歧义。

---

## 6. 激活流程

### 6.1 前置条件

1. 用户已登录，服务端能拿到可信的 `user_id`（不能信任客户端传的 ID）
2. 用户 `status = 1`
3. 卡密格式合法
4. 未触发限流

### 6.2 事务内步骤

```text
BEGIN IMMEDIATE
  1. 查用户，校验存在且启用
  2. 查 vip_membership(user_id)
     - 已存在：
       - 若本次卡密正是该会员的来源卡 → 幂等返回成功
       - 否则 → ALREADY_VIP（不核销新卡）
  3. 查 card_key(code_hash)
     - 不存在 → CARD_NOT_FOUND
     - used   → CARD_USED
     - void   → CARD_VOID
     - 超过 valid_until → CARD_EXPIRED
  4. UPDATE card_key
       SET status='used', used_by_user_id=?, used_at=?
       WHERE id=? AND status='unused'
     - changes != 1 → 重新读取状态，返回 CARD_USED / CARD_VOID
  5. INSERT vip_membership(user_id, 'permanent', card_id, now)
  6. COMMIT
```

**为什么先查会员再核销卡密**：如果先核销，再发现用户已是 VIP，就必须回滚；虽然事务能保证一致性，但「先判断」路径更短、日志更清晰，也能确保新卡绝不被误消耗。

**为什么用 `BEGIN IMMEDIATE`**：SQLite 在事务开始时就拿写锁，两个激活请求完全串行。第二个请求进入时，第一个已提交，它能看到最新的卡状态和会员状态，不需要额外的应用层锁。

### 6.3 参考实现

```js
import { get, run, tx } from '../db/index.js';
import { nowSql } from '../utils/date.js';
import { AppError } from '../utils/errors.js';

export function activateVip(userId, rawCode, meta = {}) {
  const code = normalizeCode(rawCode);
  if (!code) throw new AppError(40010, '卡密格式不正确，请检查是否为 16 位', 400);
  const hash = hashCode(code);

  try {
    const result = tx(() => {
      const user = get('SELECT id, status FROM app_user WHERE id = ?', [userId]);
      if (!user) throw new AppError(40101, '登录已失效，请重新登录', 401);
      if (Number(user.status) !== 1) throw new AppError(40301, '账号已被禁用', 403);

      const membership = get('SELECT * FROM vip_membership WHERE user_id = ?', [userId]);
      const card = get('SELECT * FROM card_key WHERE code_hash = ?', [hash]);

      if (membership) {
        const sameCard = card
          && membership.source_card_id === card.id
          && card.used_by_user_id === userId;
        if (sameCard) {
          return {
            isVip: true,
            alreadyActivated: true,
            activatedAt: membership.activated_at,
            cardTail: card.code_tail
          };
        }
        throw new AppError(40913, '你已经是永久 VIP，无需重复激活', 409);
      }

      if (!card) throw new AppError(40410, '卡密无效，请核对后重试', 404);
      if (card.status === 'used') throw new AppError(40910, '该卡密已被使用', 409);
      if (card.status === 'void') throw new AppError(40911, '该卡密已作废，请联系客服', 409);
      if (card.valid_until && card.valid_until < nowSql()) {
        throw new AppError(40912, '该卡密已超过激活截止时间', 409);
      }

      const now = nowSql();
      const claimed = run(
        `UPDATE card_key
            SET status = 'used', used_by_user_id = ?, used_at = ?
          WHERE id = ? AND status = 'unused'`,
        [userId, now, card.id]
      );

      if (claimed.changes !== 1) {
        const latest = get('SELECT status FROM card_key WHERE id = ?', [card.id]);
        if (latest && latest.status === 'used') {
          throw new AppError(40910, '该卡密已被使用', 409);
        }
        if (latest && latest.status === 'void') {
          throw new AppError(40911, '该卡密已作废，请联系客服', 409);
        }
        throw new AppError(50000, '激活失败，请稍后重试', 500);
      }

      run(
        `INSERT INTO vip_membership
           (user_id, level, source_card_id, activated_at, created_at)
         VALUES (?, 'permanent', ?, ?, ?)`,
        [userId, card.id, now, now]
      );

      return {
        isVip: true,
        alreadyActivated: false,
        activatedAt: now,
        cardTail: card.code_tail
      };
    });

    logAttempt({ userId, code, cardId: null, result: 'SUCCESS', meta }); // 提交后尽力记录
    return result;
  } catch (err) {
    logAttempt({ userId, code, result: err.code || 'ERROR', message: err.message, meta });
    throw err;
  }
}
```

> 审计日志放在事务外、提交后写入。日志失败不应回滚一次成功的激活；如果合规要求「无日志不激活」，再把它移进事务。

### 6.4 关键点

- 卡密核销与会员创建在同一个事务里，**不存在「卡被用了但没开通 VIP」**
- 唯一索引 `user_id` 是最后一道防线：即使应用层判断漏了，并发插入也会失败并整体回滚
- `source_card_id UNIQUE` 保证一张卡不会对应两条会员
- 事务失败时，条件更新会回滚，卡密恢复为未使用
- 客户端超时重试同一张卡时，命中幂等分支，返回成功而不是「已使用」

---

## 7. 成功 / 失败判定与结果反馈

### 7.1 业务错误码

| code | HTTP | 场景 | 用户提示 | 卡密是否被消耗 |
|---|---|---|---|---|
| `0` | 200 | 激活成功 | 激活成功，你已成为永久 VIP | 是 |
| `0` | 200 | 同一用户重试同一张卡 | 你已是永久 VIP | 已是 used，不再变化 |
| `40010` | 400 | 格式不合法 | 卡密格式不正确，请检查是否为 16 位 | 否 |
| `40101` | 401 | 未登录 / 登录失效 | 请先登录 | 否 |
| `40301` | 403 | 账号被禁用 | 账号已被禁用 | 否 |
| `40410` | 404 | 哈希不存在 | 卡密无效，请核对后重试 | 否 |
| `40910` | 409 | 已被使用 | 该卡密已被使用 | 否 |
| `40911` | 409 | 已作废 | 该卡密已作废，请联系客服 | 否 |
| `40912` | 409 | 超过激活截止时间 | 该卡密已超过激活截止时间 | 否 |
| `40913` | 409 | 用户已是 VIP | 你已经是永久 VIP，无需重复激活 | 否 |
| `42910` | 429 | 触发限流 | 尝试过于频繁，请稍后再试 | 否 |
| `50000` | 500 | 系统异常 | 激活失败，请稍后重试 | 否（事务回滚） |

### 7.2 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "isVip": true,
    "level": "permanent",
    "activatedAt": "2026-10-19 08:00:00",
    "alreadyActivated": false,
    "cardTail": "H3WZ"
  }
}
```

### 7.3 失败响应

```json
{
  "code": 40910,
  "message": "该卡密已被使用",
  "data": { "reason": "CARD_USED" }
}
```

`data.reason` 供客户端做分支（例如「已是 VIP」直接刷新状态页），不依赖中文文案。

### 7.4 反馈原则

- **无效与已使用分开提示**：卡密空间 2^80，区分不会带来实际爆破风险，但对用户排查很重要
- **不暴露使用人**：已使用时只说已被使用，不返回是谁、何时
- **系统异常不吞卡**：任何 5xx 都必须保证事务已回滚，卡密仍为 `unused`
- **前端不自行判断成功**：以服务端返回的 `isVip` 为准，激活后重新拉取状态

---

## 8. 并发与异常场景

| 场景 | 结果 | 保证机制 |
|---|---|---|
| 两个用户同时激活同一张卡 | 恰好 1 个成功，另 1 个 `CARD_USED` | `BEGIN IMMEDIATE` 串行 + `WHERE status='unused'` 条件更新 |
| 同一用户同时提交两张不同的卡 | 恰好 1 个成功；另一张**保持未使用** | 事务内先查 `vip_membership`；`user_id UNIQUE` 兜底 |
| 客户端超时后重试同一张卡 | 返回成功，`alreadyActivated=true`，不会重复开通 | 会员来源卡与本次卡一致时走幂等分支 |
| 卡密在提交瞬间被管理员作废 | `CARD_VOID`，不建立会员 | 条件更新失败后重读状态 |
| 同一用户并发请求都通过了会员检查 | 只有 1 条会员；另一条因 `user_id UNIQUE` 回滚，卡不消耗 | 唯一索引 + 事务 |
| 数据库繁忙 / 锁等待 | 自动重试 3 次，仍失败返回 500，卡不消耗 | 现有 `tx()` 的 `SQLITE_BUSY` 重试 |
| 用户被禁用后提交 | `USER_DISABLED`，不核销 | 事务内重新读取用户状态 |
| 卡密不存在 | `CARD_NOT_FOUND`，不写任何业务数据 | 查询为空即返回 |
| 卡密格式错误 | `INVALID_FORMAT`，不查库 | 归一化 + 正则前置校验 |
| 限流触发 | `RATE_LIMITED`，不核销 | 用户/IP 双维度滑动窗口 |
| 批次文件丢失（明文没保存） | 未使用的卡无法恢复，只能作废重发 | 明文只存一次的设计约束 |
| 服务重启 | 不影响已提交结果；未提交事务自动回滚 | SQLite WAL |
| 卡已 used 但没有对应会员（理论不可能） | 对账脚本告警，人工修复 | 见 8.1 对账 SQL |

### 8.1 一致性对账

```sql
-- 已使用但没有会员的卡（应为空）
SELECT c.id, c.code_tail, c.used_by_user_id, c.used_at
  FROM card_key c
  LEFT JOIN vip_membership m ON m.source_card_id = c.id
 WHERE c.status = 'used' AND m.id IS NULL;

-- 会员与卡的使用人不一致（应为空）
SELECT m.id, m.user_id, c.used_by_user_id
  FROM vip_membership m
  JOIN card_key c ON c.id = m.source_card_id
 WHERE c.status <> 'used' OR c.used_by_user_id <> m.user_id;

-- 一个用户多条会员（唯一索引下应为空，用于迁移后核查）
SELECT user_id, COUNT(*) AS cnt
  FROM vip_membership
 GROUP BY user_id
HAVING cnt > 1;
```

### 8.2 为什么不做应用层分布式锁

- 当前是单进程 SQLite，数据库写锁已经足够
- 引入 Redis 锁会多一个依赖，还要处理锁超时、续期、脑裂
- 真正的兜底是数据库约束：条件更新 + 唯一索引。即使多实例，也不会出现双成功

如果将来换 MySQL / PostgreSQL，把 `BEGIN IMMEDIATE` 换成事务 + `SELECT ... FOR UPDATE` 锁用户行，或继续依赖条件更新与唯一索引即可。

---

## 9. VIP 状态查询与判定

### 9.1 唯一可信来源

`vip_membership` 中存在该用户的记录，即为 VIP，与记录来自卡密还是后台无关：

```sql
SELECT m.id, m.level, m.source, m.source_card_id, m.activated_at, c.code_tail
  FROM vip_membership m
  LEFT JOIN card_key c ON c.id = m.source_card_id
 WHERE m.user_id = ?;
```

- 有记录：`isVip = true`，`level = 'permanent'`
- 无记录：`isVip = false`

`LEFT JOIN` 不能写成 `JOIN`：后台设置的会员没有卡密，内连接会把这类会员判成非会员。

不建议在 `app_user` 上加 `is_vip` 布尔字段：双写会带来不一致，且「永久」语义已经由会员表承载。

### 9.2 查询接口

`GET /api/mp/vip/status`（需登录）

```json
{
  "code": 0,
  "data": {
    "isVip": true,
    "level": "permanent",
    "source": "card",
    "activatedAt": "2026-10-19 08:00:00",
    "cardTail": "H3WZ"
  }
}
```

后台设置身份的会员返回 `"source": "admin"`、`"cardTail": ""`。

未激活：

```json
{ "code": 0, "data": { "isVip": false } }
```

### 9.3 服务端判定

```js
export function requireVip(req, res, next) {
  const row = get('SELECT id FROM vip_membership WHERE user_id = ?', [req.user.id]);
  if (!row) return next(new AppError(40310, '该功能仅限 VIP 使用', 403));
  next();
}
```

- 所有 VIP 权益接口都必须走服务端校验，不能只靠前端隐藏入口
- 查询走 `user_id` 唯一索引，成本极低，无需缓存
- 如果将来加缓存，必须在激活成功后主动失效，且缓存时间不超过 1 分钟

### 9.4 权益接入方式（二选一）

1. **整站 VIP**：所有 `/api/mp/*`（除登录、激活、状态查询）统一挂 `requireVip`
2. **部分题库 VIP**：`bank` 增加 `vip_only INTEGER DEFAULT 0`；题库列表对非 VIP 隐藏或加锁标识；取题接口校验该题库是否 VIP 专属

当前背题产品更适合第 2 种：保留免费题库做体验，VIP 解锁完整题库。

---

## 10. 与用户的绑定关系

### 10.1 绑定链路

```
app_user.id
   ▲
   │ user_id (UNIQUE)
vip_membership
   │ source_card_id (UNIQUE)
   ▼
card_key.id ──used_by_user_id──▶ app_user.id
```

- 会员绑定的是**用户 ID**，不是用户名，也不是设备号
- 卡密的 `used_by_user_id` 与会员的 `user_id` 必须一致（由事务保证）
- 两个唯一索引共同保证：一卡一人、一人一卡

### 10.2 身份选择

| 方式 | 稳定性 | 适用 |
|---|---|---|
| 用户名 + 密码（当前方案） | 高：换机、清缓存后重新登录即可找回 | **已落地** |
| 微信 `openid` | 高，但需要小程序端与 AppID | 已随小程序下线 |
| 手机号 | 高，但需要短信成本与授权 | 需要手机号登录时 |

当前实现（已落地）：

1. 用户用用户名 + 密码注册，`app_user` 写入 `username` / `password_hash`（scrypt）
2. 登录成功生成新的 `session_id` 覆盖旧值，并签发带 `sid` 的 `X-User-Token`（7 天有效）
3. 任何请求都校验令牌 `sid` 与库中 `session_id` 是否一致，不一致返回 `40110`（唯一在线）
4. 会员绑定在 `user_id` 上，换设备重新登录后 VIP 自动恢复

### 10.3 不可解绑 / 不可转移

- 不提供任何「解绑」「换绑」「转移 VIP」接口
- 管理端也不提供修改 `used_by_user_id` 或 `source_card_id` 的功能
- 用户换手机、换浏览器，VIP 仍留在原账号上（重新登录即可）
- 若用户注销账号，会员记录随用户软禁用而失效，但卡密仍是 `used`，不可重新发放

这是「一卡一用」的直接推论。如果业务上必须允许客服换绑，应作为独立的高风险操作：超级管理员双人复核、写入审计、限制频率；默认关闭。

### 10.4 多设备

同一账号只允许一台设备在线：新设备登录会轮换 `session_id`，旧设备的令牌立即失效。用户换设备时在新设备登录即可，VIP 跟着账号走。

---

## 11. 安全与防滥用

| 风险 | 措施 |
|---|---|
| 卡密被猜中 | 80 bit 随机；格式校验；用户/IP 双维度限流 |
| 数据库泄露 | 只存 HMAC 哈希，不存明文；泄露者无法直接使用 |
| 内部人员导出 | 明文仅在生成时返回；管理端列表只显示末 4 位；生成/作废记录操作人 |
| 暴力尝试 | 每用户 5 次/10 分钟，每 IP 30 次/小时；超限 429 |
| 重放 / 重复绑定 | 条件更新 + 唯一索引 + 幂等分支 |
| 日志泄露 | 不记录完整卡密；只记录末 4 位与哈希前缀 |
| 管理端越权 | 生成与作废仅 `role='super'`；普通管理员只读 |
| 传输窃听 | 全站 HTTPS |

### 11.1 关于 `CARD_SECRET`

- 从环境变量读取，不写进代码仓库
- **必须备份**：只存哈希意味着一旦密钥丢失，所有未使用卡密都无法验证，也无法重新计算哈希
- **不要随意轮换**：没有明文就无法把旧卡重新哈希。若要轮换，只能保留旧密钥用于旧卡查询，或作废全部库存
- 如果不想管理密钥，可退化为 `SHA-256(code)`；80 bit 熵下仍然安全，但少一层数据库泄露防护

### 11.2 限流实现

当前单进程可用内存滑动窗口：

```js
// userId -> { count, resetAt }
// ip     -> { count, resetAt }
```

- 只对失败计数，成功清零
- 重启后计数清零可接受；多实例部署时改用数据库表或 Redis
- 触发限流也要写 `card_activation_log`，便于发现异常来源

---

## 12. 管理端设计

### 12.1 页面

| 页面 | 内容 |
|---|---|
| 卡密批次 | 批次号、名称、数量、已用/未用/作废、生成人、生成时间、操作 |
| 生成卡密 | 数量（1~2000）、批次名称、备注、可选截止时间；生成后强制下载 CSV |
| 批次详情 | 卡密列表（末 4 位、状态、使用人、使用时间）、批量作废未使用 |
| VIP 会员 | 用户、激活时间、来源批次、卡密末 4 位；只读。后台设置的会员显示「后台设置」 |
| 用户管理 | 列表/搜索/筛选、详情（含激活记录）、改昵称、设置身份（普通 / 永久 VIP）、启用禁用 |

### 12.2 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/card-batches` | 生成批次，返回明文一次 |
| GET | `/api/admin/card-batches` | 批次列表与状态统计 |
| GET | `/api/admin/card-batches/:id/cards` | 卡密分页，只返回末 4 位 |
| POST | `/api/admin/card-batches/:id/void` | 作废该批次全部未使用卡 |
| POST | `/api/admin/cards/:id/void` | 作废单张未使用卡 |
| GET | `/api/admin/vip-members` | VIP 列表（含后台设置的会员，`source` 区分来源） |
| POST | `/api/admin/users/:id/vip` | 设置身份：`{ "isVip": true }` 开通 / `{ "isVip": false }` 取消 |

### 12.3 生成响应示例

```json
{
  "code": 0,
  "data": {
    "batch": { "id": 12, "batchNo": "VIP-20261019-001", "quantity": 500 },
    "codes": ["7K2M-9Q4X-B6RT-H3WZ", "..."],
    "warning": "明文仅显示一次，请立即下载保存"
  }
}
```

服务端不提供「再次导出」接口，避免把明文长期留在可访问路径上。

### 12.4 后台设置用户身份

用户在后台「用户管理」里可以被直接设为「普通用户」或「永久 VIP」，不必经过卡密：

- **开通**：写一条 `source='admin'`、`source_card_id IS NULL` 的会员记录，记下操作的管理员 `source_admin_id`
- **取消**：删除会员记录。若原会员来自卡密，**卡密保持 `used` 不退回**——退款/换卡属于卡密管理的独立操作，避免后台误点让同一张卡被重复使用
- **幂等**：重复开通返回 `changed=false`；对非会员重复取消同样返回 `changed=false`
- **审计**：两种情况都写 `card_activation_log`，`result` 为 `ADMIN_GRANT` / `ADMIN_REVOKE`，用户详情里的激活记录可见
- **即时生效**：移动端下一次请求 `/mp/banks`、`/mp/questions/query` 就会按新身份判定，不需要重新登录

响应示例：

```json
{
  "code": 0,
  "data": {
    "changed": true,
    "isVip": true,
    "user": { "id": 7, "isVip": true, "vipActive": true, "vipSource": "admin", "cardTail": "" }
  }
}
```

老库升级：`vip_membership` 原先 `source_card_id NOT NULL`，启动时由 `server/src/db/index.js` 自动重建表并回填 `source='card'`，数据不丢。

---

## 13. 移动端设计

### 13.1 入口

- 底部导航第二个 Tab「会员」：未激活展示卡密输入卡片，已激活展示金色会员卡
- 首页右上角胶囊同步显示「开通会员 / 永久 VIP」，点击进入会员页
- 激活成功后回到题库首页，VIP 专属题库立即解锁

### 13.2 输入体验

- 自动大写、自动每 4 位插入连字符
- 支持粘贴整段（自动去空格/连字符）
- 输入满 16 位才允许提交
- 提交中禁用按钮，防连点
- 失败时保留输入，方便用户核对；`CARD_USED` / `CARD_VOID` 直接给出客服指引

### 13.3 状态展示

```
┌─────────────────────────────┐
│  永久 VIP                    │
│  激活时间  2026-10-19 08:00  │
│  卡密尾号  H3WZ              │
│  状态      永久有效           │
└─────────────────────────────┘
```

未激活时展示输入框与「激活后永久有效、不可转移」的说明。

### 13.4 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/mp/auth/login/password` | 用户名 + 密码换 token（旧会话失效） |
| POST | `/api/mp/vip/activate` | `{ code }` |
| GET | `/api/mp/vip/status` | 查询状态 |

---

## 14. 落地到当前项目

### 14.1 前置改造

VIP 依赖身份层，当前已具备：

1. `app_user` 表 + 用户名密码注册
2. `X-User-Token` 鉴权中间件 + 唯一在线会话校验
3. 移动端登录后保存令牌，后续请求自动携带

### 14.2 新增文件（建议）

```
server/src/services/card.service.js     # 生成、作废、批次统计
server/src/services/vip.service.js      # 激活、状态查询、对账
server/src/routes/mp/vip.routes.js      # 激活 / 状态
server/src/routes/admin/card.routes.js  # 批次 / 卡密 / VIP 列表
server/src/db/schema.sql                # 追加 5 张表
admin/src/views/card/index.vue          # 卡密管理
mobile/js/pages/vip.js                  # 会员 / 激活页
```

### 14.3 配置

```bash
CARD_SECRET=<64 位随机串>     # 卡密哈希密钥，必须备份
```

### 14.4 实施顺序

1. 数据表 + 卡密生成 + 管理端批次页（可先内部发卡）
2. 用户登录 + 激活接口 + 移动端会员页
3. VIP 状态查询 + 权益接入（`requireVip` 或 `bank.vip_only`）
4. 限流、对账、监控与压测

---

## 15. 测试与验收

### 15.1 功能用例

| # | 用例 | 期望 |
|---|---|---|
| 1 | 未使用卡激活 | 成功；卡变 used；生成会员；状态查询为 VIP |
| 2 | 再次用同一张卡 | 幂等成功，`alreadyActivated=true`，会员仍 1 条 |
| 3 | 换一张新卡给已是 VIP 的用户 | `ALREADY_VIP`；新卡仍为 unused |
| 4 | 已被他人使用的卡 | `CARD_USED`；不泄露使用人 |
| 5 | 已作废的卡 | `CARD_VOID` |
| 6 | 不存在的卡 | `CARD_NOT_FOUND` |
| 7 | 格式错误（长度、字符） | `INVALID_FORMAT`，不查库 |
| 8 | 未登录 | 401 |
| 9 | 被禁用用户 | 403，不核销 |
| 10 | 超过限流阈值 | 429，不核销 |
| 11 | 作废已使用的卡 | 管理员接口拒绝 |
| 12 | 批次生成 1 万张 | 无重复；数据库无明文 |

### 15.2 并发用例

```js
// 同一张卡，20 个并发请求
const results = await Promise.all(
  Array.from({ length: 20 }, () => activateVip(userA, code))
);
// 期望：1 个成功，19 个 CARD_USED；card_key 只有 1 条 used

// 同一用户，两张不同的卡，20 个并发
// 期望：1 个成功；另 1 张卡仍为 unused；vip_membership 只有 1 条
```

### 15.3 验收清单

- [ ] 卡密全局唯一，格式统一，肉眼不易抄错
- [ ] 数据库查不到任何完整卡密明文
- [ ] 同一张卡并发激活只成功一次
- [ ] 同一用户并发激活两张卡只成功一次，另一张不消耗
- [ ] 网络重试不产生第二条会员，也不会报「已使用」
- [ ] 已是 VIP 时新卡不被消耗
- [ ] 已使用/已作废/不存在/格式错误提示清晰
- [ ] 任何 5xx 后卡密仍为未使用
- [ ] 没有解绑/转移接口
- [ ] VIP 判定只依赖 `vip_membership`，且无过期逻辑

---

## 16. 运维

- **备份**：数据库 + `CARD_SECRET` 分开备份，二者缺一不可
- **监控**：激活成功率、失败原因分布、限流触发次数、每日激活量
- **对账**：每天跑一次 8.1 的 SQL，异常即告警
- **日志保留**：激活日志建议保留 180 天；会员与卡密记录永久保留
- **库存告警**：某批次未使用数量低于阈值时提醒补货
- **客服查询**：只能按卡密末 4 位 + 批次定位状态，不提供完整卡密回显

---

## 17. 约束清单（实现时必须满足）

1. `vip_membership.user_id` 必须有唯一约束
2. `vip_membership.source_card_id` 必须有唯一约束
3. `card_key.code_hash` 必须有唯一约束
4. 激活必须在 `BEGIN IMMEDIATE` 事务内完成
5. 卡密核销必须使用 `WHERE status='unused'` 条件更新，并检查 `changes`
6. 会员记录不得包含到期时间，不得有自动过期任务
7. 不提供任何解绑、换绑、转移接口
8. 卡密明文不得落库、不得写日志、不得在列表接口返回
9. 所有失败路径都必须保证卡密未被消耗
10. 管理端生成/作废仅超级管理员可用，并记录操作人
