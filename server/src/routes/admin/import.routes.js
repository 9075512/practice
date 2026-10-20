import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.js';
import { ok } from '../../utils/response.js';
import { buildTemplate, commitImport, previewImport } from '../../services/import.service.js';

const router = Router();

router.use(requireAdmin);

router.get('/template', (req, res) => {
  const buffer = buildTemplate();
  const fileName = '背题题库导入模板.xlsx';
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  res.send(buffer);
});

router.post('/preview', (req, res) => {
  ok(res, previewImport(req.body || {}));
});

router.post('/commit', (req, res) => {
  ok(res, commitImport(req.body || {}));
});

export default router;
