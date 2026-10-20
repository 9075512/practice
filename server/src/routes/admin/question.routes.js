import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { ok, page } from '../../utils/response.js';
import {
  deleteQuestion,
  getQuestion,
  listQuestions,
  updateQuestion
} from '../../services/question.service.js';
import { QUESTION_TYPES } from '../../constants/question.js';

const router = Router();

router.use(requireAdmin);

router.get('/types', (req, res) => {
  ok(res, QUESTION_TYPES);
});

router.get('/', (req, res) => {
  const data = listQuestions(req.query || {});
  page(res, data.list, data.total, data.page, data.pageSize);
});

router.get('/:id', (req, res) => {
  ok(res, getQuestion(req.params.id));
});

router.put('/:id', (req, res) => {
  ok(res, updateQuestion(req.params.id, req.body || {}));
});

router.delete('/:id', (req, res) => {
  ok(res, deleteQuestion(req.params.id));
});

export default router;
