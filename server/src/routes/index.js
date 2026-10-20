import { Router } from 'express';
import mpRoutes from './mp/index.js';
import adminRoutes from './admin/index.js';
import { get } from '../db/index.js';
import { ok } from '../utils/response.js';
import { nowSql } from '../utils/date.js';

const router = Router();

router.get('/health', (req, res) => {
  let dbStatus = 'ok';
  try {
    get('SELECT 1 AS ok');
  } catch (_) {
    dbStatus = 'error';
  }
  ok(res, { status: 'up', db: dbStatus, time: nowSql() });
});

router.use('/mp', mpRoutes);
router.use('/admin', adminRoutes);

export default router;
