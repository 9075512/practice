import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import config from './config.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';

const app = express();

app.use(cors());
// Excel 以 base64 放进 JSON，体积约为原文件的 1.35 倍
app.use(express.json({ limit: '20mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/assets')) return;
    console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use('/api', routes);

// 移动端网页版（mobile/），挂在 /m/ 下，需在后台静态资源与兜底路由之前注册
if (fs.existsSync(config.mobileDir)) {
  app.use(
    '/m',
    express.static(config.mobileDir, {
      // 必须每次协商缓存：手机端长期持有旧 CSS/JS 是最常见的「页面错乱」来源
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    })
  );
  app.get(/^\/m(?:\/|$)/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(config.mobileDir, 'index.html'));
  });
}

if (fs.existsSync(config.publicDir)) {
  app.use(express.static(config.publicDir));
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
