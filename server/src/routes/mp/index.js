import { Router } from 'express';
import { optionalUser, requireUser } from '../../middlewares/auth.js';
import { getBank, listBanks } from '../../services/bank.service.js';
import { reciteQuestions } from '../../services/question.service.js';
import { activateVip, getVipStatus } from '../../services/vip.service.js';
import { getMyProfile, updateMyNickname } from '../../services/user.service.js';
import { changeOwnPassword, loginAccount, logoutAccount, registerAccount } from '../../services/auth.service.js';
import { AppError, ERR } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';

const router = Router();

/**
 * 账号密码登录。
 * 唯一在线：登录成功会覆盖该账号的会话号，其他设备上的旧令牌立刻失效（40110）。
 */
router.post('/auth/login/password', (req, res, next) => {
  try {
    ok(res, loginAccount(req.body || {}, { ip: req.ip }));
  } catch (err) {
    next(err);
  }
});

/** 注册：无需登录态，成功后直接拿到令牌 */
router.post('/auth/register', (req, res, next) => {
  try {
    ok(res, registerAccount(req.body || {}));
  } catch (err) {
    next(err);
  }
});

/** 退出登录：清空会话号，当前令牌立即失效 */
router.post('/auth/logout', requireUser, (req, res, next) => {
  try {
    ok(res, logoutAccount(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/vip/status', requireUser, (req, res) => {
  ok(res, getVipStatus(req.user.id));
});

/** 移动端「我的」：当前用户资料 + VIP 状态 */
router.get('/me', requireUser, (req, res) => {
  ok(res, getMyProfile(req.user.id));
});

router.put('/me', requireUser, (req, res) => {
  ok(res, updateMyNickname(req.user.id, req.body || {}));
});

/** 修改自己的密码（需已注册账号） */
router.put('/me/password', requireUser, (req, res, next) => {
  try {
    ok(res, changeOwnPassword(req.user.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.post('/vip/activate', requireUser, (req, res) => {
  const result = activateVip(req.user.id, req.body && req.body.code, {
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
  });
  ok(res, result);
});

/**
 * 题库列表：未登录也放行（先让人看到有什么题），VIP 专属题库标记 locked。
 * 真正取题（/questions/query）才要求登录，未登录会被拦到登录页。
 */
router.get('/banks', optionalUser, (req, res) => {
  ok(res, listBanks({ forUserId: req.user ? req.user.id : 0 }));
});

router.get('/banks/:id', optionalUser, (req, res) => {
  ok(res, getBank(req.params.id, { forUserId: req.user ? req.user.id : 0 }));
});

/**
 * 背题取题：POST 是为了支持 excludeIds（只看未掌握）和稳定随机排序。
 * 返回按 100 条分页，滚动到末尾时继续取下一页。
 */
router.post('/questions/query', requireUser, (req, res) => {
  const body = req.body || {};
  const bank = getBank(body.bankId, { forUserId: req.user.id });
  if (bank.locked) {
    throw new AppError(ERR.VIP_REQUIRED, '该题库仅限 VIP 背诵，请先激活', 403, {
      reason: 'VIP_REQUIRED'
    });
  }
  ok(res, reciteQuestions(body));
});

export default router;
