/**
 * 背题 + 卡密 VIP 冒烟测试
 *
 * 用临时数据库启动服务，跑完整链路：
 * 登录鉴权 → 题库/题目/Excel 导入 → 用户设备登录 → 卡密生成/激活/异常 → VIP 题库门槛
 *
 * 运行：npm run smoke
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(os.tmpdir(), `recite-smoke-${Date.now()}-${process.pid}.db`);

process.env.NODE_ENV = 'test';
process.env.DB_FILE = dbFile;
process.env.CARD_SECRET = 'smoke-only-secret';

const realLog = console.log;
console.log = () => {};

const { default: app } = await import('../src/app.js');
const db = await import('../src/db/index.js');

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api`;

let passed = 0;
let admin = '';
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push(`${name}${detail ? ` → ${detail}` : ''}`);
  return false;
}

async function call(method, url, { body, token, kind = 'admin', raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers[kind === 'admin' ? 'X-Admin-Token' : 'X-User-Token'] = token;

  const response = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()) };
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const get = (url, options) => call('GET', url, options);
const post = (url, body, options) => call('POST', url, { ...options, body });
const put = (url, body, options) => call('PUT', url, { ...options, body });
const del = (url, options) => call('DELETE', url, options);

/** 注册一个新账号并直接拿到会话（小程序下线后，注册是唯一的用户入口） */
async function createUser(username, password = 'abc123') {
  const { json } = await post('/mp/auth/register', { username, password });
  return json.data;
}

/** 账号密码登录 */
async function loginPassword(username, password = 'abc123') {
  const { json } = await post('/mp/auth/login/password', { username, password });
  return json.data;
}

try {
  /* ---------- 1. 健康检查与管理员鉴权 ---------- */
  {
    const { json } = await get('/health');
    check('健康检查返回 code=0', json && json.code === 0);

    const wrong = await post('/admin/auth/login', { username: 'admin', password: 'wrong' });
    check('管理员密码错误被拒绝', wrong.json && wrong.json.code !== 0, JSON.stringify(wrong.json));

    const noToken = await get('/admin/banks');
    check('管理员接口无令牌返回 401', noToken.status === 401, String(noToken.status));

    const login = await post('/admin/auth/login', { username: 'admin', password: '123456' });
    admin = login.json.data.token;
    check('管理员登录成功', Boolean(admin));
  }

  /* ---------- 2. 题库：VIP 标记与重名约束 ---------- */
  let normalBank;
  let vipBank;
  {
    const created = await post(
      '/admin/banks',
      { name: '冒烟·普通题库', description: '免费体验库' },
      { token: admin }
    );
    normalBank = created.json.data;
    check('新建普通题库 vipOnly=false', normalBank && normalBank.vipOnly === false);

    const dup = await post('/admin/banks', { name: '冒烟·普通题库' }, { token: admin });
    check('题库重名被拒绝', dup.status === 409 || (dup.json && dup.json.code !== 0));

    const createdVip = await post(
      '/admin/banks',
      { name: '冒烟·VIP题库', vipOnly: true },
      { token: admin }
    );
    vipBank = createdVip.json.data;
    check('新建 VIP 题库 vipOnly=true', vipBank && vipBank.vipOnly === true);

    const all = await get('/admin/banks', { token: admin });
    const listed = all.json.data.find((item) => item.id === vipBank.id);
    check('题库列表返回 VIP 标记', listed && listed.vipOnly === true);
  }

  /* ---------- 3. Excel 模板 / 预览 / 导入 ---------- */
  {
    const template = await get('/admin/import/template', { token: admin, raw: true });
    check('模板下载成功且为 xlsx 二进制', template.status === 200 && template.buffer[0] === 0x50);

    const XLSX = (await import('xlsx')).default;
    const rows = [
      ['题库', '题型', '题干', '选项A', '选项B', '选项C', '选项D', '答案', '解析'],
      ['冒烟·普通题库', '单选题', '冒烟单选：2+3=（ ）', '4', '5', '6', '7', 'B', '基础加法'],
      ['冒烟·普通题库', '多选题', '冒烟多选：以下属于偶数的有（ ）', '2', '4', '5', '7', 'A、B', '偶数定义'],
      ['冒烟·VIP题库', '单选题', '冒烟VIP单选：3×4=（ ）', '10', '12', '14', '16', 'B', '乘法表'],
      ['冒烟·VIP题库', '判断题', '冒烟VIP判断：地球是圆的。', '', '', '', '', '正确', '常识'],
      ['冒烟·普通题库', '单选题', '冒烟单选：2+3=（ ）', '4', '5', '6', '7', 'B', '文件内重复'],
      ['冒烟·普通题库', '', '缺少选项与答案的异常行', '', '', '', '', '', '']
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '题目');
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    const preview = await post(
      '/admin/import/preview',
      { base64, fileName: 'smoke.xlsx', mode: 'excel' },
      { token: admin }
    );
    const parsed = preview.json.data;
    check('预览返回有效行数 4', parsed && parsed.validCount === 4, JSON.stringify(parsed && {
      total: parsed.total, validCount: parsed.validCount, duplicateCount: parsed.duplicateCount, invalidCount: parsed.invalidCount
    }));
    check('预览识别文件内重复 1 条', parsed && parsed.duplicateCount === 1);
    check('预览统计题库分布', parsed && parsed.banks.length === 2, JSON.stringify(parsed && parsed.banks));

    const committed = await post(
      '/admin/import/commit',
      { importId: parsed.importId, mode: 'excel' },
      { token: admin }
    );
    check('导入提交创建 4 道题', committed.json.data && committed.json.data.created === 4,
      JSON.stringify(committed.json.data));

    const listed = await get(`/admin/questions?bankId=${normalBank.id}`, { token: admin });
    check('普通题库筛选到 2 道题', listed.json.data.total === 2, String(listed.json.data.total));

    const byType = await get(`/admin/questions?bankId=${normalBank.id}&type=多选题`, { token: admin });
    check('按题型筛选到 1 道多选题', byType.json.data.total === 1, String(byType.json.data.total));
  }

  /* ---------- 4. 用户鉴权与非会员锁定态 ---------- */
  let userOne;
  {
    const noToken = await get('/mp/banks');
    check(
      '未登录也能浏览题库列表',
      noToken.status === 200 && Array.isArray(noToken.json.data),
      String(noToken.status)
    );

    userOne = await createUser('smokeone');
    check('用户注册后立即拿到令牌', Boolean(userOne && userOne.token));
    check('新用户 VIP 状态为 false', userOne.vip && userOne.vip.isVip === false);

    const badToken = await get('/mp/banks', { token: 'not-a-real-token', kind: 'user' });
    check(
      '伪造令牌不会被当成会员',
      badToken.status === 200 && badToken.json.data.every((item) => !item.vipOnly || item.locked),
      String(badToken.status)
    );

    const badMe = await get('/mp/me', { token: 'not-a-real-token', kind: 'user' });
    check('伪造令牌访问私有接口被拒绝', badMe.status === 401, String(badMe.status));

    const { json } = await get('/mp/banks', { token: userOne.token, kind: 'user' });
    const list = json.data;
    const vipItem = list.find((item) => item.id === vipBank.id);
    const freeItem = list.find((item) => item.id === normalBank.id);
    check('非会员看到 VIP 题库为锁定态', vipItem && vipItem.locked === true);
    check('非会员看到免费题库未锁定', freeItem && freeItem.locked === false);

    const locked = await post(
      '/mp/questions/query',
      { bankId: vipBank.id, page: 1, pageSize: 10 },
      { token: userOne.token, kind: 'user' }
    );
    check('非会员取 VIP 题目返回 403 VIP_REQUIRED',
      locked.status === 403 && locked.json.code === 40310,
      `${locked.status}/${locked.json && locked.json.code}`);

    const free = await post(
      '/mp/questions/query',
      { bankId: normalBank.id, page: 1, pageSize: 10 },
      { token: userOne.token, kind: 'user' }
    );
    check('非会员可取免费题库题目',
      free.status === 200 && free.json.data.list.length === 2,
      `${free.status}/${free.json.data && free.json.data.list.length}`);
  }

  /* ---------- 5. 卡密生成与存储 ---------- */
  let batch;
  let codes;
  {
    const generated = await post(
      '/admin/card-batches',
      { name: '冒烟批次', quantity: 6, note: 'smoke' },
      { token: admin }
    );
    batch = generated.json.data.batch;
    codes = generated.json.data.codes;

    check('生成 6 张卡密', codes.length === 6, String(codes.length));
    check('卡密格式为 4-4-4-4 分组', codes.every((code) => /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(code)));
    check('卡密互不重复', new Set(codes).size === 6);
    check('批次统计未使用 6 张', batch.unused === 6 && batch.total === 6, JSON.stringify(batch));
    check('响应给出明文只显示一次提示', Boolean(generated.json.data.warning));

    const listed = await get(`/admin/card-batches/${batch.id}/cards`, { token: admin });
    const cards = listed.json.data;
    check('卡密列表返回批次统计', cards.batch && cards.batch.batchNo === batch.batchNo, JSON.stringify(cards.batch));
    check('卡密列表只返回末 4 位', cards.list.length === 6 && cards.list.every((card) => /^[0-9A-Z]{4}$/.test(card.codeTail)));
    check('管理端列表不含卡密明文', !JSON.stringify(cards).includes(codes[0]));

    const stored = db.all('SELECT code_hash, code_tail FROM card_key WHERE batch_id = ?', [batch.id]);
    check('数据库只存 64 位哈希', stored.every((row) => /^[0-9a-f]{64}$/.test(row.code_hash)));
    const { hashCode } = await import('../src/services/card-code.js');
    const expected = new Set(codes.map((code) => hashCode(code.replace(/-/g, ''))));
    const actual = new Set(stored.map((row) => row.code_hash));
    check('卡密哈希与 HMAC 结果一致',
      expected.size === 6 && [...expected].every((hash) => actual.has(hash)));
    check('明文不会被原样写入数据库',
      !codes.some((code) => actual.has(code) || actual.has(code.replace(/-/g, ''))));
  }

  /* ---------- 6. 激活：成功、幂等、异常 ---------- */
  {
    const bad = await post('/mp/vip/activate', { code: 'ABC' }, { token: userOne.token, kind: 'user' });
    check('格式错误的卡密返回 40010', bad.json.code === 40010, String(bad.json.code));

    const none = await post('/mp/vip/activate', { code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, { token: userOne.token, kind: 'user' });
    check('不存在的卡密返回 40410', none.status === 404 && none.json.code === 40410, String(none.json.code));

    const dirty = codes[0].toLowerCase().replace(/-/g, ' ');
    const first = await post('/mp/vip/activate', { code: dirty }, { token: userOne.token, kind: 'user' });
    check('小写带空格的输入可激活成功', first.status === 200 && first.json.data.isVip === true, JSON.stringify(first.json));
    check('首次激活 alreadyActivated=false', first.json.data && first.json.data.alreadyActivated === false);
    check('返回卡密末 4 位', first.json.data && first.json.data.cardTail === codes[0].slice(-4));

    const status = await get('/mp/vip/status', { token: userOne.token, kind: 'user' });
    check('VIP 状态查询为永久会员',
      status.json.data.isVip === true && status.json.data.level === 'permanent',
      JSON.stringify(status.json.data));

    const repeat = await post('/mp/vip/activate', { code: codes[0] }, { token: userOne.token, kind: 'user' });
    check('同卡重复提交幂等成功', repeat.status === 200 && repeat.json.data.alreadyActivated === true, JSON.stringify(repeat.json));
    check('重复激活未产生第二条会员',
      db.get('SELECT COUNT(*) AS c FROM vip_membership WHERE user_id = ?', [userOne.user.id]).c === 1);

    const another = await post('/mp/vip/activate', { code: codes[1] }, { token: userOne.token, kind: 'user' });
    check('已是 VIP 再用新卡返回 40913', another.json.code === 40913, String(another.json.code));
    check('已是 VIP 时新卡未被消耗',
      db.get('SELECT status FROM card_key WHERE id = ?', [
        db.get('SELECT id FROM card_key WHERE code_tail = ?', [codes[1].slice(-4)]).id
      ]).status === 'unused');

    const cardRow = db.get('SELECT id FROM card_key WHERE code_tail = ?', [codes[2].slice(-4)]);
    const voided = await post(`/admin/cards/${cardRow.id}/void`, { reason: '冒烟作废' }, { token: admin });
    check('未使用卡密可作废', voided.status === 200, JSON.stringify(voided.json));

    // 已是 VIP 的用户先命中 ALREADY_VIP，验证优先顺序
    const vipAgain = await post('/mp/vip/activate', { code: codes[2] }, { token: userOne.token, kind: 'user' });
    check('已是 VIP 时优先返回 40913', vipAgain.json.code === 40913, String(vipAgain.json.code));

    // 用非会员验证作废卡密本身的状态判定
    const voidUser = await createUser('smokevoid');
    const useVoid = await post('/mp/vip/activate', { code: codes[2] }, { token: voidUser.token, kind: 'user' });
    check('已作废卡密返回 40911', useVoid.json.code === 40911, String(useVoid.json.code));
    check('作废卡密不会产生会员',
      db.get('SELECT COUNT(*) AS c FROM vip_membership WHERE user_id = ?', [voidUser.user.id]).c === 0);

    const crossToken = await post('/mp/vip/activate', { code: codes[0] }, { token: admin, kind: 'user' })
      .catch(() => null);
    check('管理员令牌不能用于用户接口', !crossToken || crossToken.status === 401, String(crossToken && crossToken.status));
  }

  /* ---------- 7. 过期卡密 ---------- */
  {
    const expired = await post(
      '/admin/card-batches',
      { name: '冒烟过期批次', quantity: 1, validUntil: '2020-01-01' },
      { token: admin }
    );
    const expiredCode = expired.json.data.codes[0];
    const fresh = await createUser('smokeexpired');

    const result = await post('/mp/vip/activate', { code: expiredCode }, { token: fresh.token, kind: 'user' });
    check('超过截止时间的卡密返回 40912', result.json.code === 40912, String(result.json.code));
    check('过期卡密不会产生会员',
      db.get('SELECT COUNT(*) AS c FROM vip_membership WHERE user_id = ?', [fresh.user.id]).c === 0);
  }

  /* ---------- 8. 并发：同一张卡多个用户抢激活 ---------- */
  {
    const raceBatch = await post('/admin/card-batches', { name: '冒烟并发批次', quantity: 1 }, { token: admin });
    const raceCode = raceBatch.json.data.codes[0];

    const users = [];
    for (let i = 0; i < 4; i += 1) {
      users.push(await createUser(`smokerace${i}`));
    }

    const results = await Promise.all(
      users.map((user) => post('/mp/vip/activate', { code: raceCode }, { token: user.token, kind: 'user' }))
    );

    const success = results.filter((item) => item.status === 200);
    const usedFail = results.filter((item) => item.json && item.json.code === 40910);
    check('4 个并发只有 1 个成功', success.length === 1, `成功 ${success.length}`);
    check('其余并发返回卡密已使用', usedFail.length === 3, `已使用 ${usedFail.length}`);
    check('并发后仅产生 1 条会员',
      db.get('SELECT COUNT(*) AS c FROM vip_membership WHERE source_card_id = ?', [
        db.get('SELECT id FROM card_key WHERE code_tail = ?', [raceCode.slice(-4)]).id
      ]).c === 1);

    const winners = results.filter((item) => item.status === 200).map((item) => item.json.data.cardTail);
    check('并发成功者使用的就是这张卡', winners.every((tail) => tail === raceCode.slice(-4)));
  }

  /* ---------- 9. VIP 用户可解锁 VIP 题库 ---------- */
  {
    // 重新登录会轮换会话，后面的断言统一改用这张新令牌
    userOne = await loginPassword('smokeone');
    const refreshed = userOne;
    check('重新登录后仍是 VIP', refreshed.vip && refreshed.vip.isVip === true);

    const { json } = await get('/mp/banks', { token: refreshed.token, kind: 'user' });
    const item = json.data.find((row) => row.id === vipBank.id);
    check('会员看到 VIP 题库不再锁定', item && item.locked === false);

    const query = await post(
      '/mp/questions/query',
      { bankId: vipBank.id, page: 1, pageSize: 10 },
      { token: refreshed.token, kind: 'user' }
    );
    check('会员可取 VIP 题库题目', query.status === 200 && query.json.data.list.length === 2,
      `${query.status}/${query.json.data && query.json.data.list.length}`);
  }

  /* ---------- 10. 管理端 VIP 名单与批次作废 ---------- */
  {
    const members = await get('/admin/vip-members?keyword=smokeone', { token: admin });
    const rows = members.json.data.list;
    check('VIP 名单包含该会员', rows.length === 1 && rows[0].userId === userOne.user.id, JSON.stringify(rows));
    check('VIP 名单返回批次号与末 4 位', Boolean(rows[0] && rows[0].batchNo && rows[0].cardTail));

    const noAuth = await get('/admin/vip-members');
    check('VIP 名单无令牌返回 401', noAuth.status === 401, String(noAuth.status));

    const idle = await post('/admin/card-batches', { name: '冒烟待作废批次', quantity: 3 }, { token: admin });
    const voided = await post(`/admin/card-batches/${idle.json.data.batch.id}/void`, { reason: '冒烟整批作废' }, { token: admin });
    check('整批作废返回作废数量 3', voided.json.data && voided.json.data.voided === 3, JSON.stringify(voided.json.data));

    const afterVoid = await get(`/admin/card-batches/${idle.json.data.batch.id}`, { token: admin });
    check('批次统计已更新为作废 3', afterVoid.json.data.voided === 3 && afterVoid.json.data.unused === 0);

    const reVoide = await post(`/admin/cards/${db.get('SELECT id FROM card_key WHERE batch_id = ? LIMIT 1', [idle.json.data.batch.id]).id}/void`, {}, { token: admin });
    check('已作废卡密不能重复作废', reVoide.status === 409, String(reVoide.status));
  }

  /* ---------- 11. 数据完整性：理论与代码一致 ---------- */
  {
    const orphan = db.all(
      `SELECT c.id FROM card_key c
        WHERE c.status = 'used'
          AND NOT EXISTS (SELECT 1 FROM vip_membership m WHERE m.source_card_id = c.id)`
    );
    check('没有已使用但未开通会员的卡', orphan.length === 0, JSON.stringify(orphan));

    const mismatch = db.all(
      `SELECT m.id FROM vip_membership m
         JOIN card_key c ON c.id = m.source_card_id
        WHERE c.used_by_user_id <> m.user_id`
    );
    check('会员与卡密使用人一致', mismatch.length === 0, JSON.stringify(mismatch));

    const dupMembership = db.all('SELECT user_id FROM vip_membership GROUP BY user_id HAVING COUNT(*) > 1');
    check('一个用户只有一条会员记录', dupMembership.length === 0);

    const logs = db.get('SELECT COUNT(*) AS c FROM card_activation_log');
    check('激活审计日志已记录', logs.c > 0, String(logs.c));
  }

  /* ---------- 12. 用户管理：列表 / 详情 / 改昵称 / 禁用封禁 ---------- */
  {
    const listAll = await get('/admin/users', { token: admin });
    check('用户列表返回分页数据', listAll.status === 200 && listAll.json.data.total > 0,
      `${listAll.status}/${listAll.json.data && listAll.json.data.total}`);

    const search = await get('/admin/users?keyword=smokeone', { token: admin });
    check('按用户名关键字搜索命中该用户',
      search.json.data.list.some((u) => u.id === userOne.user.id), JSON.stringify(search.json.data.list));

    const vipOnly = await get('/admin/users?vip=vip', { token: admin });
    check('VIP 筛选只返回会员',
      vipOnly.json.data.list.length > 0 && vipOnly.json.data.list.every((u) => u.isVip === true));

    const detail = await get(`/admin/users/${userOne.user.id}`, { token: admin });
    const d = detail.json.data;
    check('用户详情返回 VIP 信息', d.isVip === true && Boolean(d.vipActivatedAt));
    check('用户详情返回激活记录', Array.isArray(d.activationLogs) && d.activationLogs.length > 0);

    const renamed = await put(`/admin/users/${userOne.user.id}`, { nickname: '冒烟改名用户' }, { token: admin });
    check('管理端修改昵称生效', renamed.json.data.nickname === '冒烟改名用户', JSON.stringify(renamed.json.data));

    const me = await get('/mp/me', { token: userOne.token, kind: 'user' });
    check('移动端 /me 返回昵称与 VIP',
      me.json.data.nickname === '冒烟改名用户' && me.json.data.vip.isVip === true, JSON.stringify(me.json.data));

    const meRenamed = await put('/mp/me', { nickname: '自己改的昵称' }, { token: userOne.token, kind: 'user' });
    check('移动端修改自己昵称生效', meRenamed.json.data.nickname === '自己改的昵称');

    const disabled = await post(`/admin/users/${userOne.user.id}/status`, { status: 0 }, { token: admin });
    check('禁用账号返回 status=0', disabled.json.data.status === 0, JSON.stringify(disabled.json.data));

    const blocked = await get('/mp/me', { token: userOne.token, kind: 'user' });
    check('禁用后移动端接口返回 403', blocked.status === 403, String(blocked.status));

    const enabled = await post(`/admin/users/${userOne.user.id}/status`, { status: 1 }, { token: admin });
    check('启用账号返回 status=1', enabled.json.data.status === 1);

    const restored = await get('/mp/me', { token: userOne.token, kind: 'user' });
    check('启用后 VIP 自动恢复',
      restored.status === 200 && restored.json.data.vip.isVip === true,
      `${restored.status}/${restored.json.data && restored.json.data.vip && restored.json.data.vip.isVip}`);
  }
  /* ---------- 13. 后台设置用户身份：普通用户 ↔ 永久 VIP ---------- */
  {
    const target = await createUser('smokesetvip');
    check('新账号默认不是 VIP', target.vip.isVip === false, JSON.stringify(target.vip));

    const usedBefore = db.get("SELECT COUNT(*) AS c FROM card_key WHERE status = 'used'").c;

    const noToken = await post(`/admin/users/${target.user.id}/vip`, { isVip: true });
    check('设置身份无管理员令牌返回 401', noToken.status === 401, String(noToken.status));

    const grant = await post(`/admin/users/${target.user.id}/vip`, { isVip: true }, { token: admin });
    check('后台开通 VIP 成功',
      grant.json.code === 0 && grant.json.data.changed === true && grant.json.data.user.vipActive === true,
      JSON.stringify(grant.json));
    check('后台开通的会员来源为 admin 且无卡密尾号',
      grant.json.data.user.vipSource === 'admin' && grant.json.data.user.cardTail === '',
      JSON.stringify(grant.json.data.user));

    const stored = db.get('SELECT source, source_card_id FROM vip_membership WHERE user_id = ?', [target.user.id]);
    check('会员记录没有卡密来源', stored && stored.source === 'admin' && stored.source_card_id === null,
      JSON.stringify(stored));

    const usedAfter = db.get("SELECT COUNT(*) AS c FROM card_key WHERE status = 'used'").c;
    check('后台开通不消耗卡密', usedAfter === usedBefore, `${usedBefore} → ${usedAfter}`);

    const status = await get('/mp/vip/status', { token: target.token, kind: 'user' });
    check('移动端立即变为 VIP', status.json.data.isVip === true && status.json.data.source === 'admin',
      JSON.stringify(status.json.data));

    const unlocked = await get('/mp/banks', { token: target.token, kind: 'user' });
    check('后台开通后 VIP 题库不再锁定',
      Boolean(unlocked.json.data.find((item) => item.id === vipBank.id && item.locked === false)));

    const queryVip = await post(
      '/mp/questions/query',
      { bankId: vipBank.id, page: 1, pageSize: 10 },
      { token: target.token, kind: 'user' }
    );
    check('后台开通后能取 VIP 题库题目',
      queryVip.status === 200 && queryVip.json.data.list.length === 2, String(queryVip.status));

    const again = await post(`/admin/users/${target.user.id}/vip`, { isVip: true }, { token: admin });
    check('重复开通幂等（changed=false）', again.json.data.changed === false, JSON.stringify(again.json.data));

    const detail = await get(`/admin/users/${target.user.id}`, { token: admin });
    check('用户详情记录后台开通日志',
      detail.json.data.activationLogs.some((log) => log.result === 'ADMIN_GRANT'),
      JSON.stringify(detail.json.data.activationLogs));

    const members = await get('/admin/vip-members?keyword=smokesetvip', { token: admin });
    check('VIP 名单包含后台设置的会员',
      members.json.data.list.some((row) => row.userId === target.user.id && row.source === 'admin'),
      JSON.stringify(members.json.data.list));

    const revoke = await post(`/admin/users/${target.user.id}/vip`, { isVip: false }, { token: admin });
    check('后台取消 VIP 成功',
      revoke.json.data.changed === true && revoke.json.data.user.isVip === false,
      JSON.stringify(revoke.json));

    const downgraded = await get('/mp/vip/status', { token: target.token, kind: 'user' });
    check('取消后移动端恢复非会员', downgraded.json.data.isVip === false, JSON.stringify(downgraded.json.data));

    const relocked = await get('/mp/banks', { token: target.token, kind: 'user' });
    check('取消后 VIP 题库重新锁定',
      Boolean(relocked.json.data.find((item) => item.id === vipBank.id && item.locked === true)));

    const badParam = await post(`/admin/users/${target.user.id}/vip`, { isVip: 'yes' }, { token: admin });
    check('身份参数非法被拒绝', badParam.status !== 200 || badParam.json.code !== 0,
      `${badParam.status}/${badParam.json && badParam.json.code}`);
  }

  /* ---------- 14. 账号注册 / 登录 / 单点登录 / 改密 / 退出 ---------- */
  {
    // 旧的静默登录接口已随小程序一起下线
    const legacy = await post('/mp/auth/login', { deviceId: 'whatever', client: 'miniprogram' });
    check('设备静默登录接口已下线', legacy.status === 404, String(legacy.status));

    const anonReg = await post('/mp/auth/register', { username: 'smokeanon', password: 'abc123' });
    check(
      '未登录也能直接注册',
      anonReg.json.code === 0 && anonReg.json.data.user.username === 'smokeanon',
      JSON.stringify(anonReg.json)
    );

    const anonToken = anonReg.json.data.token;
    const anonMe = await get('/mp/me', { token: anonToken, kind: 'user' });
    check('注册后令牌立即可用', anonMe.status === 200 && anonMe.json.data.username === 'smokeanon');

    const anonBanks = await get('/mp/banks');
    check(
      '未登录可浏览题库列表',
      anonBanks.status === 200 && Array.isArray(anonBanks.json.data),
      String(anonBanks.status)
    );

    const firstBankId = anonBanks.json.data[0] && anonBanks.json.data[0].id;
    const anonQuery = await post('/mp/questions/query', { bankId: firstBankId });
    check('未登录不能取题', anonQuery.status === 401, String(anonQuery.status));

    const weak = await post('/mp/auth/register', { username: 'smokeuser', password: '123' });
    check('弱密码注册被拒绝', weak.status === 400, `${weak.status}/${weak.json && weak.json.code}`);

    const badName = await post('/mp/auth/register', { username: 'a b', password: 'abc123' });
    check('非法用户名被拒绝', badName.status === 400, String(badName.status));

    const reg = await post('/mp/auth/register', {
      username: 'smokeuser',
      password: 'abc123',
      nickname: '冒烟账号'
    });
    check(
      '注册成功并返回账号信息',
      reg.json.code === 0 && reg.json.data.user.username === 'smokeuser',
      JSON.stringify(reg.json)
    );

    const dup = await post('/mp/auth/register', { username: 'SmokeUser', password: 'abc123' });
    check(
      '重复用户名注册返回 409',
      dup.status === 409 && dup.json.code === 40901,
      `${dup.status}/${dup.json && dup.json.code}`
    );

    const login = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'abc123' });
    check(
      '账号密码登录成功',
      login.json.code === 0 && login.json.data.user.username === 'smokeuser',
      JSON.stringify(login.json)
    );

    /* 单点登录（唯一在线）：后登录的设备挤掉先登录的设备 */
    const tokenA = login.json.data.token;
    const meA = await get('/mp/me', { token: tokenA, kind: 'user' });
    check('第一次登录的令牌可用', meA.status === 200, String(meA.status));

    const loginB = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'abc123' });
    const tokenB = loginB.json.data.token;
    check('第二次登录成功', loginB.json.code === 0 && Boolean(tokenB));

    const kicked = await get('/mp/me', { token: tokenA, kind: 'user' });
    check(
      '旧设备令牌被挤下线返回 40110',
      kicked.status === 401 && kicked.json.code === 40110,
      `${kicked.status}/${kicked.json && kicked.json.code}`
    );

    const kickedBanks = await get('/mp/banks', { token: tokenA, kind: 'user' });
    check(
      '旧设备访问公开接口同样被拦',
      kickedBanks.status === 401 && kickedBanks.json.code === 40110,
      `${kickedBanks.status}/${kickedBanks.json && kickedBanks.json.code}`
    );

    const stillB = await get('/mp/me', { token: tokenB, kind: 'user' });
    check('新设备令牌正常', stillB.status === 200, String(stillB.status));

    const wrong = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'wrong123' });
    check('密码错误被拒绝', wrong.status === 400, String(wrong.status));

    const me = await get('/mp/me', { token: tokenB, kind: 'user' });
    check(
      '/me 返回账号与密码状态',
      me.json.data.username === 'smokeuser' && me.json.data.hasPassword === true,
      JSON.stringify(me.json.data)
    );

    // 改密：当前设备补发新令牌，其他设备下线
    const pwd = await put(
      '/mp/me/password',
      { oldPassword: 'abc123', newPassword: 'xyz789' },
      { token: tokenB, kind: 'user' }
    );
    check('修改密码成功并补发新令牌', pwd.json.code === 0 && Boolean(pwd.json.data.token), JSON.stringify(pwd.json));
    const tokenC = pwd.json.data.token;

    const oldAfterPwd = await get('/mp/me', { token: tokenB, kind: 'user' });
    check('改密后旧令牌失效', oldAfterPwd.status === 401, String(oldAfterPwd.status));

    const meC = await get('/mp/me', { token: tokenC, kind: 'user' });
    check(
      '改密后当前设备无需重新登录',
      meC.status === 200 && meC.json.data.username === 'smokeuser',
      `${meC.status}/${meC.json && meC.json.data && meC.json.data.username}`
    );

    const oldLogin = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'abc123' });
    check('旧密码失效', oldLogin.status === 400, String(oldLogin.status));

    const newLogin = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'xyz789' });
    check('新密码可登录', newLogin.json.code === 0, JSON.stringify(newLogin.json));

    const tokenD = newLogin.json.data.token;
    const out = await post('/mp/auth/logout', {}, { token: tokenD, kind: 'user' });
    check('退出登录成功', out.json.code === 0);

    const afterLogout = await get('/mp/me', { token: tokenD, kind: 'user' });
    check('退出后令牌立即失效', afterLogout.status === 401, String(afterLogout.status));

    const byName = await get('/admin/users?keyword=smokeuser', { token: admin });
    check(
      '后台可按用户名搜索到账号',
      byName.json.data.list.some((u) => u.username === 'smokeuser'),
      JSON.stringify(byName.json.data.list.map((u) => u.username))
    );

    const acctOnly = await get('/admin/users?account=account', { token: admin });
    check(
      '后台账号筛选只返回已注册账号',
      acctOnly.json.data.list.length > 0 && acctOnly.json.data.list.every((u) => Boolean(u.username))
    );

    const acctId = newLogin.json.data.user.id;
    const loginE = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'xyz789' });
    const tokenE = loginE.json.data.token;

    await post(`/admin/users/${acctId}/status`, { status: 0 }, { token: admin });
    const banned = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'xyz789' });
    check('禁用账号无法登录', banned.status === 403, String(banned.status));

    const bannedSession = await get('/mp/me', { token: tokenE, kind: 'user' });
    check('禁用后已登录的会话也被拦', bannedSession.status === 403, String(bannedSession.status));

    await post(`/admin/users/${acctId}/status`, { status: 1 }, { token: admin });

    const allowed = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'xyz789' });
    check('启用后可正常登录', allowed.json.code === 0, JSON.stringify(allowed.json));
  }

  /* ---------- 15. 清空用户（重置到强制注册起点） ---------- */
  {
    const stats = await get('/admin/users/stats', { token: admin });
    check(
      '用户统计接口可用',
      stats.json.code === 0 && stats.json.data.users > 0,
      JSON.stringify(stats.json.data)
    );

    const badReset = await post('/admin/users/reset-all', { confirm: 'nope' }, { token: admin });
    check('确认码不对不会清空用户', badReset.status === 400, String(badReset.status));

    const reset = await post('/admin/users/reset-all', { confirm: 'RESET_USERS' }, { token: admin });
    const after = reset.json.data && reset.json.data.after;
    check(
      '清空后用户与会员归零',
      reset.json.code === 0 && after.users === 0 && after.vip === 0 && after.logs === 0,
      JSON.stringify(after)
    );

    const banks = await get('/mp/banks');
    check('清空用户不影响题库', banks.status === 200 && banks.json.data.length > 0);

    const again = await post('/mp/auth/login/password', { username: 'smokeuser', password: 'xyz789' });
    check('清空后旧账号无法登录', again.status === 400, String(again.status));
  }
} catch (err) {
  failures.push(`运行异常：${err && err.stack ? err.stack : err}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }

  console.log = realLog;
  console.log(`\n[smoke] 通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    for (const item of failures) console.log(`  ✗ ${item}`);
    process.exitCode = 1;
  } else {
    console.log('[smoke] 全部通过');
  }
}
