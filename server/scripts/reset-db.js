import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hard = process.argv.includes('--hard');

if (hard) {
  for (const file of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log('[reset] 已删除', file);
      }
    } catch (err) {
      console.error('[reset] 无法删除数据库文件，请先停止服务：', err.message);
      process.exit(1);
    }
  }
  const result = spawnSync(process.execPath, [path.join(here, 'seed.js')], {
    stdio: 'inherit',
    cwd: path.resolve(here, '..')
  });
  process.exit(result.status === null ? 1 : result.status);
}

// 常规重置：保留管理员账号，只清空题库与题目（服务运行中也可执行）
console.log('[reset] 清空题库与题目');
const result = spawnSync(process.execPath, [path.join(here, 'seed.js'), '--reset'], {
  stdio: 'inherit',
  cwd: path.resolve(here, '..')
});
process.exit(result.status === null ? 1 : result.status);
