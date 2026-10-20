import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { ok, page } from '../../utils/response.js';
import {
  generateBatch,
  getBatch,
  listBatches,
  listCards,
  listVipMembers,
  voidBatch,
  voidCard
} from '../../services/card.service.js';
const router = Router();

router.use(requireAdmin);

router.get('/card-batches', (req, res) => {
  ok(res, listBatches());
});

router.post('/card-batches', (req, res) => {
  ok(res, generateBatch(req.admin.id, req.body || {}));
});

router.get('/card-batches/:id', (req, res) => {
  ok(res, getBatch(req.params.id));
});

router.get('/card-batches/:id/cards', (req, res) => {
  ok(res, listCards(req.params.id, req.query || {}));
});

router.post('/card-batches/:id/void', (req, res) => {
  ok(res, voidBatch(req.params.id, req.body && req.body.reason));
});

router.post('/cards/:id/void', (req, res) => {
  ok(res, voidCard(req.params.id, req.body && req.body.reason));
});

router.get('/vip-members', (req, res) => {
  const data = listVipMembers(req.query || {});
  page(res, data.list, data.total, data.page, data.pageSize);
});

export default router;
