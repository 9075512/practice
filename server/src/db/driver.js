import fs from 'node:fs';
import path from 'node:path';

let raw = null;
let kind = '';

function sleepSync(ms) {
  const arr = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(arr, 0, 0, ms);
}

function isBusy(err) {
  const msg = String((err && err.message) || err);
  return msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
}

export async function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    const mod = await import('better-sqlite3');
    const Database = mod.default;
    raw = new Database(file);
    kind = 'better-sqlite3';
  } catch (err) {
    const mod = await import('node:sqlite');
    const { DatabaseSync } = mod;
    raw = new DatabaseSync(file);
    kind = 'node:sqlite';
    if (process.env.NODE_ENV !== 'test') {
      console.log('[db] better-sqlite3 不可用，已回退到 node:sqlite');
    }
  }

  raw.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  return raw;
}

export function dbKind() {
  return kind;
}

export function get(sql, params = []) {
  const stmt = raw.prepare(sql);
  const row = stmt.get(...params);
  return row ? { ...row } : undefined;
}

export function all(sql, params = []) {
  const stmt = raw.prepare(sql);
  return stmt.all(...params).map((row) => ({ ...row }));
}

export function run(sql, params = []) {
  const stmt = raw.prepare(sql);
  const info = stmt.run(...params);
  return {
    changes: Number(info.changes || 0),
    lastInsertRowid: Number(info.lastInsertRowid || 0)
  };
}

export function exec(sql) {
  raw.exec(sql);
}

export function tx(fn) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch (_) {
          /* ignore */
        }
        throw err;
      }
    } catch (err) {
      lastError = err;
      if (isBusy(err) && attempt < 2) {
        sleepSync(80 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function close() {
  if (raw) {
    raw.close();
    raw = null;
  }
}
