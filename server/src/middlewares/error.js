import { AppError, ERR } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message, data: err.data || null });
  }

  const message = String((err && err.message) || '');
  if (message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ code: ERR.CONFLICT, message: '名称已存在，请勿重复添加', data: null });
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return res.status(409).json({ code: ERR.REFERENCED, message: '存在关联数据，无法完成操作', data: null });
  }

  console.error('[error]', err);
  return res.status(500).json({ code: ERR.SERVER, message: '服务器内部错误', data: null });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ code: ERR.NOT_FOUND, message: `接口不存在：${req.method} ${req.path}`, data: null });
}
