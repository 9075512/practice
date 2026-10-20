import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { ok, page } from '../../utils/response.js';
import {
  getUserDetail,
  listUsers,
  setUserStatus,
  setUserVip,
  updateUser
} from '../../services/user.service.js';
import { getUserStats, resetUsers } from '../../services/maintenance.service.js';

const router = Router();

router.use(requireAdmin);

/** 用户数据概况（给重置操作做二次确认用） */
router.get('/stats', (req, res) => {
  ok(res, getUserStats());
});

/**
 * 清空所有用户（不可逆）。必须显式传 confirm: "RESET_USERS"。
 * 题库与卡密批次不受影响，已用卡密会退回未使用。
 */
router.post('/reset-all', (req, res) => {
  ok(res, resetUsers(req.body && req.body.confirm));
});

router.get('/', (req, res) => {
  const data = listUsers(req.query || {});
  page(res, data.list, data.total, data.page, data.pageSize);
});

router.get('/:id', (req, res) => {
  ok(res, getUserDetail(req.params.id));
});

router.put('/:id', (req, res) => {
  ok(res, updateUser(req.params.id, req.body || {}));
});

router.post('/:id/status', (req, res) => {
  ok(res, setUserStatus(req.params.id, req.body && req.body.status));
});

/**
 * 设置用户身份：{ isVip: true } 开通永久 VIP，{ isVip: false } 取消。
 * 与卡密无关，不消耗也不会退回卡密。
 */
router.post('/:id/vip', (req, res) => {
  ok(res, setUserVip(req.params.id, req.body && req.body.isVip, req.admin.id));
});

export default router;
