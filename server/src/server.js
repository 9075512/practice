import config from './config.js';
import app from './app.js';

if (!process.env.CARD_SECRET) {
  console.warn('[config] 未设置 CARD_SECRET，正在使用开发默认值；生产环境必须配置并备份');
}

const server = app.listen(config.port, config.host, () => {
  console.log('==============================================');
  console.log('  背题系统服务已启动');
  console.log(`  接口地址：http://127.0.0.1:${config.port}/api`);
  console.log(`  管理后台：http://127.0.0.1:${config.port}`);
  console.log(`  移动端：  http://127.0.0.1:${config.port}/m/`);
  console.log('  管理员账号：admin / 123456');
  console.log('==============================================');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
