import { Router } from 'express';
import { loginAdmin } from '../../services/auth.service.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { get } from '../../db/index.js';
import { ok } from '../../utils/response.js';

const router = Router();

router.post('/login', (req, res) => {
  ok(res, loginAdmin(req.body || {}));
});

router.get('/profile', requireAdmin, (req, res) => {
  const admin = get(
    'SELECT id, username, display_name AS displayName, role, last_login_at AS lastLoginAt FROM admin_user WHERE id = ?',
    [req.admin.id]
  );
  ok(res, admin);
});

// 令牌是无状态签名串，退出登录只需客户端丢弃，服务端无需存储状态
router.post('/logout', requireAdmin, (req, res) => {
  ok(res, { ok: true });
});

export default router;
