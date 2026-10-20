import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import authRoutes from './auth.routes.js';
import bankRoutes from './bank.routes.js';
import questionRoutes from './question.routes.js';
import importRoutes from './import.routes.js';
import cardRoutes from './card.routes.js';
import userRoutes from './user.routes.js';
import diagRoutes from './diag.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/banks', bankRoutes);
router.use('/questions', questionRoutes);
router.use('/import', importRoutes);
router.use('/users', userRoutes);
// 临时诊断（用完删除）
router.use('/_diag', requireAdmin, diagRoutes);
router.use('/', cardRoutes);

export default router;
