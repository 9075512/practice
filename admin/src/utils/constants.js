export const QUESTION_TYPES = [
  { value: '单选题', color: '#2563eb' },
  { value: '多选题', color: '#7c3aed' },
  { value: '判断题', color: '#0891b2' },
  { value: '填空题', color: '#ea580c' },
  { value: '简答题', color: '#059669' }
];

export const TYPE_COLOR = Object.fromEntries(QUESTION_TYPES.map((item) => [item.value, item.color]));

export function typeColor(type) {
  return TYPE_COLOR[type] || '#64748b';
}
