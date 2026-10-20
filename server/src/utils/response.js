export function ok(res, data = null) {
  res.json({ code: 0, message: 'ok', data });
}

export function page(res, list, total, pageNo, pageSize) {
  res.json({
    code: 0,
    message: 'ok',
    data: { list, total, page: pageNo, pageSize }
  });
}
