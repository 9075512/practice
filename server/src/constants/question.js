/**
 * 题型只保留这五种，导入与手工维护都以这里的文案作为唯一标识。
 * 数据库直接存中文题型，筛选时无需再做映射。
 */
export const QUESTION_TYPES = ['单选题', '多选题', '判断题', '填空题', '简答题'];

export const TYPE_ORDER_SQL = `CASE type
  WHEN '单选题' THEN 1
  WHEN '多选题' THEN 2
  WHEN '判断题' THEN 3
  WHEN '填空题' THEN 4
  WHEN '简答题' THEN 5
  ELSE 99 END`;

export function isQuestionType(value) {
  return QUESTION_TYPES.includes(String(value || '').trim());
}

/** 把常见的题型写法归一，无法识别时返回空串。 */
export function normalizeType(value) {
  const text = String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, '')
    .replace(/[（）()]/g, '')
    .toUpperCase();

  if (!text) return '';

  if (/^(单选|单选题|单项选择|单项选择题|SINGLE|1)$/.test(text)) return '单选题';
  if (/^(多选|多选题|多项选择|多项选择题|不定项选择|不定项|MULTIPLE|2)$/.test(text)) return '多选题';
  if (/^(判断|判断题|是非题|对错题|JUDGE|TRUEORFALSE|3)$/.test(text)) return '判断题';
  if (/^(填空|填空题|FILL|4)$/.test(text)) return '填空题';
  if (/^(简答|简答题|问答|问答题|论述|论述题|名词解释|ESSAY|5)$/.test(text)) return '简答题';

  return '';
}

/** 前端展示用：题型 -> 主题色 */
export const TYPE_COLORS = {
  单选题: '#2563eb',
  多选题: '#7c3aed',
  判断题: '#0891b2',
  填空题: '#ea580c',
  简答题: '#059669'
};
