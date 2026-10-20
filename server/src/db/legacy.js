import { all, exec, run, tx } from './driver.js';
import { nowSql } from '../utils/date.js';

const LEGACY_TABLES = [
  'practice_answer',
  'practice_session',
  'wrong_book',
  'user_daily_stat',
  'question_tag',
  'tag',
  'chapter',
  'category',
  'app_user',
  'auth_token'
];

const TYPE_MAP = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题'
};

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

/**
 * 检测旧版（章节 + 分类 + 英文题型）数据库。
 * 若有，先把旧表改名让位，返回内存中的数据供新表建好后回填。
 */
export function prepareLegacy() {
  const columns = all('PRAGMA table_info(bank)');
  if (!columns.length) return null;
  if (columns.some((column) => column.name === 'name')) return null;

  const banks = all('SELECT * FROM bank ORDER BY sort_order ASC, id ASC');
  const questions = all(
    'SELECT * FROM question WHERE deleted_at IS NULL ORDER BY bank_id ASC, id ASC'
  );

  exec('PRAGMA foreign_keys = OFF');
  try {
    for (const table of LEGACY_TABLES) {
      exec(`DROP TABLE IF EXISTS ${table}`);
    }
    exec('ALTER TABLE question RENAME TO legacy_question');
    exec('ALTER TABLE bank RENAME TO legacy_bank');
  } finally {
    exec('PRAGMA foreign_keys = ON');
  }

  return { banks, questions };
}

function legacyOptions(row) {
  if (row.type === 'judge') {
    return [
      { key: 'A', text: '正确' },
      { key: 'B', text: '错误' }
    ];
  }

  const options = parseJson(row.options, []);
  if (!Array.isArray(options)) return [];
  return options
    .filter((item) => item && item.key && item.text)
    .map((item) => ({ key: String(item.key), text: String(item.text) }));
}

function legacyAnswer(row) {
  const values = parseJson(row.answer, []);
  const list = Array.isArray(values) ? values.map((item) => String(item)) : [String(row.answer || '')];

  if (row.type === 'judge') {
    const first = String(list[0] || '').toUpperCase();
    return ['T', 'TRUE', '正确', '对', '1'].includes(first) ? '正确' : '错误';
  }
  if (row.type === 'single' || row.type === 'multiple') {
    return list.join('').toUpperCase();
  }
  return list.filter(Boolean).join('、');
}

export function applyLegacy(data) {
  const now = nowSql();
  let questionCount = 0;

  tx(() => {
    const idMap = new Map();
    for (const bank of data.banks) {
      const result = run(
        'INSERT INTO bank (name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [bank.title, bank.description || '', Number(bank.sort_order || 0), bank.created_at || now, bank.updated_at || now]
      );
      idMap.set(bank.id, result.lastInsertRowid);
    }

    const sortMap = new Map();
    for (const row of data.questions) {
      const bankId = idMap.get(row.bank_id);
      if (!bankId) continue;

      const sortOrder = sortMap.get(bankId) || 0;
      sortMap.set(bankId, sortOrder + 1);

      run(
        `INSERT INTO question (bank_id, type, stem, options, answer, analysis, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bankId,
          TYPE_MAP[row.type] || '简答题',
          row.stem,
          JSON.stringify(legacyOptions(row)),
          legacyAnswer(row),
          row.analysis || '',
          sortOrder,
          row.created_at || now,
          row.updated_at || now
        ]
      );
      questionCount += 1;
    }
  });

  exec('DROP TABLE IF EXISTS legacy_question');
  exec('DROP TABLE IF EXISTS legacy_bank');

  return { bankCount: data.banks.length, questionCount };
}
