import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { ok } from '../../utils/response.js';
import {
  bankOptions,
  createBank,
  deleteBank,
  getBank,
  listBanks,
  updateBank
} from '../../services/bank.service.js';

const router = Router();

router.use(requireAdmin);

router.get('/', (req, res) => {
  ok(res, listBanks({ keyword: req.query.keyword }));
});

router.get('/options', (req, res) => {
  ok(res, bankOptions());
});

router.get('/:id', (req, res) => {
  ok(res, getBank(req.params.id));
});

router.post('/', (req, res) => {
  ok(res, createBank(req.body || {}));
});

router.put('/:id', (req, res) => {
  ok(res, updateBank(req.params.id, req.body || {}));
});

router.delete('/:id', (req, res) => {
  ok(res, deleteBank(req.params.id));
});

export default router;
