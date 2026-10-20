import { all, get, dbKind, close } from '../src/db/index.js';
import config from '../src/config.js';

const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
const mode = get('PRAGMA journal_mode');
const version = get('SELECT sqlite_version() AS v');

console.log('[init] 数据库文件：', config.dbFile);
console.log('[init] 驱动：', dbKind());
console.log('[init] SQLite 版本：', version.v, '，日志模式：', mode.journal_mode);
console.log('[init] 数据表（' + tables.length + '）：', tables.map((t) => t.name).join(', '));
console.log('[init] 外键检查：', all('PRAGMA foreign_key_check').length === 0 ? '通过' : '存在异常');
close();
