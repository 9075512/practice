/**
 * 把项目根目录的 mobile/ 同步一份到 server/mobile/。
 *
 * 部署时只上传 server 目录，而移动端网页版的源码在仓库根的 mobile/，
 * 因此发布前需要这份副本；config.mobileDir 会优先使用 server/mobile。
 *
 * 用法：npm run sync:mobile
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, '..', 'mobile');
const target = path.join(root, 'mobile');

function walk(dir, base = '') {
  const items = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) items.push(...walk(path.join(dir, entry.name), rel));
    else items.push(rel);
  }
  return items;
}

if (!fs.existsSync(source)) {
  console.error(`源目录不存在：${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

let count = 0;
for (const rel of walk(source)) {
  const from = path.join(source, rel);
  const to = path.join(target, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  count += 1;
}

console.log(`已同步 ${count} 个文件到 ${target}`);
