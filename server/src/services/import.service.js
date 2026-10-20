import { randomUUID } from 'node:crypto';
import pkg from 'xlsx';
import { all, get, run, tx } from '../db/index.js';
import config from '../config.js';
import { nowSql } from '../utils/date.js';
import { AppError, ERR } from '../utils/errors.js';
import { assert, requireId } from '../utils/validate.js';
import { isQuestionType, normalizeType, QUESTION_TYPES } from '../constants/question.js';

const XLSX = pkg.default || pkg;

const HEADER_ALIASES = {
  bank: ['题库', '题库名称', '所属题库', '科目', '分类', '类别'],
  type: ['题型', '题目类型', '试题类型', '类型'],
  stem: ['题干', '题目', '问题', '试题', '题目内容', '题干内容', '内容'],
  answer: ['答案', '正确答案', '参考答案', '标准答案', '答'],
  analysis: ['解析', '答案解析', '试题解析', '题目解析', '说明', '备注']
};

const OPTION_HEADERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const TRUE_WORDS = ['对', '正确', '是', '真', '√', '✓', 'TRUE', 'T', 'YES', 'Y', '1'];
const FALSE_WORDS = ['错', '错误', '否', '假', '×', '✗', 'X', 'FALSE', 'F', 'NO', 'N', '0'];

const importCache = new Map();

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizeHeader(value) {
  return cleanCell(value)
    .replace(/[\s*＊:：()（）]/g, '')
    .toLowerCase();
}

function decodeBase64(input) {
  const text = String(input || '').replace(/^data:[^;]+;base64,/, '');
  if (!text) throw new AppError(ERR.PARAM, '请先选择要导入的 Excel 文件', 400);

  let buffer;
  try {
    buffer = Buffer.from(text, 'base64');
  } catch (_) {
    throw new AppError(ERR.PARAM, '文件内容无法解析', 400);
  }

  if (!buffer.length) throw new AppError(ERR.PARAM, '文件内容为空', 400);
  if (buffer.length > config.maxImportBytes) {
    throw new AppError(ERR.PARAM, `文件超过 ${Math.round(config.maxImportBytes / 1024 / 1024)}MB 上限`, 400);
  }

  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  if (!isZip && !isOle) {
    throw new AppError(ERR.PARAM, '只支持 .xlsx / .xls 文件，请使用下载的模板填写', 400);
  }

  return buffer;
}

function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 20);
  let best = null;

  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i] || [];
    const map = {};
    const options = {};

    cells.forEach((cell, column) => {
      const header = normalizeHeader(cell);
      if (!header) return;

      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (!map[field] && aliases.includes(header)) {
          map[field] = column;
          break;
        }
      }

      const optionMatch = header.match(/^选项([a-h])$/);
      if (optionMatch) {
        options[optionMatch[1].toUpperCase()] = column;
      }
    });

    const score = Object.keys(map).length + Object.keys(options).length;
    if (map.stem !== undefined && score >= 2) {
      if (!best || score > best.score) {
        best = { index: i, columns: map, options, score };
      }
    }
  }

  return best;
}

function extractOptions(row, optionColumns, type) {
  const options = [];
  for (const key of OPTION_HEADERS) {
    const column = optionColumns[key];
    if (column === undefined) continue;
    const text = cleanCell(row[column]);
    if (text) options.push({ key, text });
  }

  if (!options.length && type === '判断题') {
    return [
      { key: 'A', text: '正确' },
      { key: 'B', text: '错误' }
    ];
  }

  return options;
}

function inferType(options, answer) {
  if (options.length >= 2) {
    if (options.some((item) => /^(正确|错误|对|错)$/.test(item.text))) return '判断题';
    const letters = answer.toUpperCase().replace(/[^A-H]/g, '');
    if (letters.length > 1) return '多选题';
    return '单选题';
  }
  if (TRUE_WORDS.includes(answer.toUpperCase()) || FALSE_WORDS.includes(answer.toUpperCase())) {
    return '判断题';
  }
  return answer.length <= 24 ? '填空题' : '简答题';
}

function normalizeJudgeAnswer(answer, options) {
  const text = cleanCell(answer);
  const upper = text.toUpperCase();

  const byText = options.find((item) => item.text === text);
  if (byText) return byText.text;

  const byKey = options.find((item) => item.key === upper);
  if (byKey) return byKey.text;

  if (TRUE_WORDS.includes(upper)) return '正确';
  if (FALSE_WORDS.includes(upper)) return '错误';
  return '';
}

function normalizeChoiceAnswer(answer, options, type) {
  const text = cleanCell(answer);
  const byText = options.find((item) => item.text === text);
  if (byText) return { answer: byText.key };

  const letters = Array.from(new Set(text.toUpperCase().replace(/[^A-H]/g, '').split(''))).sort();
  if (letters.length) {
    if (options.length) {
      const invalid = letters.filter((key) => !options.some((item) => item.key === key));
      if (invalid.length) {
        return { error: `答案 ${invalid.join('、')} 不在选项范围内` };
      }
    }
    if (type === '单选题' && letters.length > 1) {
      return { error: '单选题答案只能有一个选项，多个答案请把题型改为多选题' };
    }
    return { answer: letters.join('') };
  }

  if (!text) return { error: '答案不能为空' };
  return { answer: text };
}

function normalizeRow(row, columns, optionColumns) {
  const stem = cleanCell(row[columns.stem]);
  if (!stem) return { error: '题干为空' };
  if (stem.length > 5000) return { error: '题干超过 5000 字' };

  const rawAnswer = cleanCell(row[columns.answer]);
  if (!rawAnswer) return { error: '答案为空' };
  if (rawAnswer.length > 2000) return { error: '答案超过 2000 字' };

  const analysis = columns.analysis === undefined ? '' : cleanCell(row[columns.analysis]);
  if (analysis.length > 10000) return { error: '解析超过 10000 字' };

  const rawType = columns.type === undefined ? '' : cleanCell(row[columns.type]);
  let type = normalizeType(rawType);
  let inferred = false;

  if (!type) {
    type = inferType(extractOptions(row, optionColumns, ''), rawAnswer);
    inferred = true;
  }
  if (!isQuestionType(type)) return { error: `无法识别题型「${rawType}」` };

  const options = extractOptions(row, optionColumns, type);

  let answer = rawAnswer;
  if (type === '判断题') {
    const normalized = normalizeJudgeAnswer(rawAnswer, options);
    if (!normalized) return { error: '判断题答案应为正确 / 错误（或 对 / 错）' };
    answer = normalized;
  } else if (type === '单选题' || type === '多选题') {
    const result = normalizeChoiceAnswer(rawAnswer, options, type);
    if (result.error) return { error: result.error };
    answer = result.answer;
  }

  const bankName = columns.bank === undefined ? '' : cleanCell(row[columns.bank]);
  if (bankName.length > 80) return { error: '题库名称超过 80 字' };

  return {
    bankName,
    type,
    stem,
    options,
    answer,
    analysis,
    inferred
  };
}

function stemKey(type, stem) {
  return `${type}::${stem.replace(/\s+/g, '').replace(/[，。；：、？！,.;:?!（）()【】\[\]"'“”‘’]/g, '')}`;
}

function resolveBanks() {
  const map = new Map();
  for (const row of all('SELECT id, name FROM bank WHERE deleted_at IS NULL')) {
    map.set(row.name, row.id);
  }
  return map;
}

function collectExistingKeys(bankIds) {
  const keys = new Set();
  const unique = [...new Set(bankIds)].filter((id) => id > 0);
  if (!unique.length) return keys;

  for (const bankId of unique) {
    const rows = all(
      'SELECT type, stem FROM question WHERE bank_id = ? AND deleted_at IS NULL',
      [bankId]
    );
    for (const row of rows) keys.add(`${bankId}|${stemKey(row.type, row.stem)}`);
  }
  return keys;
}

function readWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  } catch (_) {
    throw new AppError(ERR.PARAM, 'Excel 解析失败，请确认文件未损坏', 400);
  }

  const preferred = workbook.SheetNames.find((name) => /题目|题库/.test(name));
  const sheetName = preferred || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new AppError(ERR.PARAM, 'Excel 中没有可读取的工作表', 400);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true, raw: false });
  if (!rows.length) throw new AppError(ERR.PARAM, '工作表是空的', 400);

  const header = findHeaderRow(rows);
  if (!header) {
    throw new AppError(
      ERR.PARAM,
      '未找到表头行，请确保第一行包含「题干 / 题型 / 答案」等列名',
      400
    );
  }

  if (header.columns.answer === undefined) {
    throw new AppError(ERR.PARAM, '缺少「答案」列，无法导入', 400);
  }

  return { sheetName, rows, header };
}

function buildParsed(buffer, options = {}) {
  const { rows, sheetName, header } = readWorkbook(buffer);
  const mode = options.mode === 'target' ? 'target' : 'excel';
  const targetBankId = mode === 'target' ? requireId(options.targetBankId, '目标题库') : 0;

  let targetBankName = '';
  if (mode === 'target') {
    const bank = get('SELECT id, name FROM bank WHERE id = ? AND deleted_at IS NULL', [targetBankId]);
    if (!bank) throw new AppError(ERR.NOT_FOUND, '目标题库不存在', 404);
    targetBankName = bank.name;
  }

  const bankIds = resolveBanks();
  const parsedRows = [];
  const errors = [];
  let total = 0;

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const hasContent = row.some((cell) => cleanCell(cell) !== '');
    if (!hasContent) continue;

    total += 1;
    const excelRow = i + 1;

    if (total > 20000) {
      throw new AppError(ERR.PARAM, '单次最多导入 20000 行，请拆分文件', 400);
    }

    const normalized = normalizeRow(row, header.columns, header.options);
    if (normalized.error) {
      errors.push({ row: excelRow, message: normalized.error });
      continue;
    }

    if (mode === 'target') {
      normalized.bankName = targetBankName;
      normalized.bankId = targetBankId;
    } else {
      if (!normalized.bankName) {
        errors.push({ row: excelRow, message: '题库为空，请填写题库名称或选择指定题库导入' });
        continue;
      }
      normalized.bankId = bankIds.get(normalized.bankName) || 0;
    }

    parsedRows.push({ ...normalized, row: excelRow });
  }

  const existingKeys = collectExistingKeys(parsedRows.map((item) => item.bankId).filter(Boolean));
  const seen = new Set();
  const duplicates = [];
  const valid = [];

  for (const item of parsedRows) {
    let reason = '';
    if (item.bankId && existingKeys.has(`${item.bankId}|${stemKey(item.type, item.stem)}`)) {
      reason = '题库中已存在相同题目';
    } else if (seen.has(`${mode === 'target' ? item.bankId : item.bankName}|${stemKey(item.type, item.stem)}`)) {
      reason = '文件内重复';
    }

    if (reason) {
      duplicates.push({ row: item.row, message: reason });
      continue;
    }

    seen.add(`${mode === 'target' ? item.bankId : item.bankName}|${stemKey(item.type, item.stem)}`);
    valid.push(item);
  }

  const bankMap = new Map();
  for (const item of valid) {
    if (!bankMap.has(item.bankName)) bankMap.set(item.bankName, 0);
    bankMap.set(item.bankName, bankMap.get(item.bankName) + 1);
  }

  const typeCounts = QUESTION_TYPES.map((type) => ({
    type,
    count: valid.filter((item) => item.type === type).length
  })).filter((item) => item.count > 0);

  const previewRows = [...valid.slice(0, 20)].map((item) => ({
    row: item.row,
    bankName: item.bankName,
    type: item.type,
    stem: item.stem,
    options: item.options,
    answer: item.answer,
    analysis: item.analysis,
    inferred: item.inferred
  }));

  return {
    sheetName,
    mode,
    total,
    validCount: valid.length,
    duplicateCount: duplicates.length,
    invalidCount: errors.length,
    banks: [...bankMap.entries()].map(([name, count]) => ({ name, count })),
    typeCounts,
    rows: previewRows,
    errors: errors.slice(0, 50),
    duplicates: duplicates.slice(0, 50),
    validRows: valid
  };
}

function cacheImport(buffer, fileName) {
  const now = Date.now();
  for (const [key, value] of importCache.entries()) {
    if (now - value.createdAt > config.importCacheTtlMs) importCache.delete(key);
  }
  while (importCache.size >= 5) {
    importCache.delete(importCache.keys().next().value);
  }

  const importId = randomUUID();
  importCache.set(importId, { buffer, fileName, createdAt: now });
  return importId;
}

function pickCached(importId) {
  const cached = importCache.get(String(importId || ''));
  if (!cached) throw new AppError(ERR.PARAM, '导入会话已过期，请重新选择文件', 400);
  if (Date.now() - cached.createdAt > config.importCacheTtlMs) {
    importCache.delete(String(importId));
    throw new AppError(ERR.PARAM, '导入会话已过期，请重新选择文件', 400);
  }
  return cached;
}

export function previewImport(body = {}) {
  let buffer;
  let fileName = String(body.fileName || '').trim();

  if (body.importId) {
    const cached = pickCached(body.importId);
    buffer = cached.buffer;
    fileName = cached.fileName;
  } else {
    buffer = decodeBase64(body.base64);
  }

  const parsed = buildParsed(buffer, body);
  const importId = cacheImport(buffer, fileName || '未命名.xlsx');

  return {
    importId,
    fileName: fileName || '未命名.xlsx',
    sheetName: parsed.sheetName,
    mode: parsed.mode,
    total: parsed.total,
    validCount: parsed.validCount,
    duplicateCount: parsed.duplicateCount,
    invalidCount: parsed.invalidCount,
    banks: parsed.banks,
    typeCounts: parsed.typeCounts,
    rows: parsed.rows,
    errors: parsed.errors,
    duplicates: parsed.duplicates
  };
}

export function commitImport(body = {}) {
  const cached = pickCached(body.importId);
  const parsed = buildParsed(cached.buffer, body);

  if (!parsed.validCount) {
    throw new AppError(ERR.PARAM, '没有可导入的题目，请检查预览中的错误提示', 400);
  }

  const now = nowSql();
  const result = tx(() => {
    const banks = resolveBanks();
    let banksCreated = 0;

    const nextSort = new Map();
    for (const row of all(
      'SELECT bank_id, MAX(sort_order) AS max_sort FROM question WHERE deleted_at IS NULL GROUP BY bank_id'
    )) {
      nextSort.set(row.bank_id, Number(row.max_sort || 0) + 1);
    }

    let created = 0;
    for (const item of parsed.validRows) {
      let bankId = item.bankId || banks.get(item.bankName) || 0;
      if (!bankId) {
        const inserted = run(
          'INSERT INTO bank (name, description, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
          [item.bankName, '', now, now]
        );
        bankId = inserted.lastInsertRowid;
        banks.set(item.bankName, bankId);
        nextSort.set(bankId, 0);
        banksCreated += 1;
      }

      const sortOrder = nextSort.get(bankId) || 0;
      run(
        `INSERT INTO question (bank_id, type, stem, options, answer, analysis, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bankId,
          item.type,
          item.stem,
          JSON.stringify(item.options),
          item.answer,
          item.analysis,
          sortOrder,
          now,
          now
        ]
      );
      nextSort.set(bankId, sortOrder + 1);
      created += 1;
    }

    return { created, banksCreated };
  });

  return {
    created: result.created,
    banksCreated: result.banksCreated,
    duplicateCount: parsed.duplicateCount,
    invalidCount: parsed.invalidCount,
    banks: parsed.banks
  };
}

export function buildTemplate() {
  const headers = [
    '题库',
    '题型',
    '题干',
    '选项A',
    '选项B',
    '选项C',
    '选项D',
    '答案',
    '解析'
  ];

  const rows = [
    headers,
    [
      '示例题库',
      '单选题',
      '我国现行企业所得税的法定税率是（ ）。',
      '25%',
      '20%',
      '15%',
      '10%',
      'A',
      '企业所得税法定税率为 25%，符合条件的小型微利企业适用优惠税率。'
    ],
    [
      '示例题库',
      '多选题',
      '下列属于会计基本假设的有（ ）。',
      '会计主体',
      '持续经营',
      '会计分期',
      '货币计量',
      'ABCD',
      '会计主体、持续经营、会计分期、货币计量均属于会计基本假设。'
    ],
    [
      '示例题库',
      '判断题',
      '资产负债表是反映企业某一特定日期财务状况的报表。',
      '',
      '',
      '',
      '',
      '正确',
      '资产负债表反映特定日期的财务状况，属于静态报表。'
    ],
    [
      '示例题库',
      '填空题',
      '会计的基本职能包括______和______。',
      '',
      '',
      '',
      '',
      '核算、监督',
      '会计的基本职能是核算（反映）与监督（控制）。'
    ],
    [
      '示例题库',
      '简答题',
      '简述借贷记账法的记账规则。',
      '',
      '',
      '',
      '',
      '有借必有贷，借贷必相等。',
      '任何一笔经济业务都要在两个或两个以上相互联系的账户中登记，借方与贷方金额相等。'
    ]
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 16 },
    { wch: 10 },
    { wch: 46 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 46 }
  ];

  const helpRows = [
    ['填写说明'],
    ['1', '第一行表头请勿修改或删除，从第二行开始每行一道题。'],
    ['2', '题库：题目所属题库名称。名称相同归入同一题库，不存在的题库会自动创建。'],
    ['3', '题型：支持 单选题 / 多选题 / 判断题 / 填空题 / 简答题，留空时按选项和答案自动推断。'],
    ['4', '题干：必填，最多 5000 字。'],
    ['5', '选项：按需填写选项A ~ 选项D（最多可加到选项H）。判断题可留空，系统自动补「正确 / 错误」。'],
    ['6', '答案：必填。单选题填一个字母（如 A），多选题填多个字母（如 ABD 或 A、B、D）。'],
    ['7', '判断题答案填「正确 / 错误」或「对 / 错」；填空题、简答题直接填答案文本。'],
    ['8', '解析：选填，最多 10000 字。'],
    ['9', '相同题库中题型和题干完全一致时视为重复，导入会自动跳过。'],
    ['10', '单次最多 20000 行、文件不超过 10MB。']
  ];

  const helpSheet = XLSX.utils.aoa_to_sheet(helpRows);
  helpSheet['!cols'] = [{ wch: 6 }, { wch: 96 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '题目');
  XLSX.utils.book_append_sheet(workbook, helpSheet, '填写说明');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

