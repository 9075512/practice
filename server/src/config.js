import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const isTest = process.env.NODE_ENV === 'test';
// 部署时只上传 server/，移动端网页版会同步一份副本到 server/mobile；本地开发直接用仓库根的 mobile/
const bundledMobile = path.join(root, 'mobile');
const workspaceMobile = path.join(root, '..', 'mobile');

const config = {
  root,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'app.db'),
  publicDir: path.join(root, 'public'),
  // 移动端网页版：优先用同步进来的 server/mobile 副本，否则用仓库根的 mobile/
  mobileDir:
    process.env.MOBILE_DIR ||
    (fs.existsSync(bundledMobile) ? bundledMobile : workspaceMobile),
  tokenTtlAdminMs: 12 * 3600 * 1000,
  tokenTtlUserMs: 7 * 24 * 3600 * 1000,
  // 单次 Excel 导入上限：base64 后的 JSON body 会比原文件大约 1/3
  maxImportBytes: 10 * 1024 * 1024,
  importCacheTtlMs: 30 * 60 * 1000,
  // 卡密哈希密钥；生产必须通过环境变量覆盖并备份
  cardSecret: process.env.CARD_SECRET || 'dev-card-secret-change-in-production',
  vipAttemptLimit: isTest ? 100 : 5,
  vipAttemptWindowMs: 10 * 60 * 1000,
  vipIpLimit: isTest ? 500 : 30,
  vipIpWindowMs: 60 * 60 * 1000,
  // 账号密码登录：同一 IP + 用户名 10 分钟内允许的失败次数
  loginAttemptLimit: isTest ? 1000 : 8,
  isProd: process.env.NODE_ENV === 'production'
};

export default config;
