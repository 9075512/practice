export class AppError extends Error {
  constructor(code, message, status = 400, data = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export const ERR = {
  PARAM: 40001,
  BIZ_PARAM: 40002,
  NO_QUESTION: 40004,
  CARD_FORMAT: 40010,
  UNAUTHORIZED: 40100,
  TOKEN_INVALID: 40101,
  // 唯一在线：同一账号在新设备登录后，旧令牌立刻失效
  SESSION_KICKED: 40110,
  FORBIDDEN: 40301,
  VIP_REQUIRED: 40310,
  NOT_FOUND: 40401,
  CARD_NOT_FOUND: 40410,
  CONFLICT: 40901,
  REFERENCED: 40902,
  CARD_USED: 40910,
  CARD_VOID: 40911,
  CARD_EXPIRED: 40912,
  ALREADY_VIP: 40913,
  RATE_LIMITED: 42910,
  SERVER: 50000
};

export function badRequest(message, code = ERR.PARAM) {
  return new AppError(code, message, 400);
}

export function notFound(message = '资源不存在') {
  return new AppError(ERR.NOT_FOUND, message, 404);
}

export function conflict(message, code = ERR.CONFLICT) {
  return new AppError(code, message, 409);
}

export function unauthorized(message = 'Token 无效或已过期', code = ERR.TOKEN_INVALID) {
  return new AppError(code, message, 401);
}
