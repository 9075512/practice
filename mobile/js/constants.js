/** 题型配色（与后台题目管理保持一致） */
export const TYPE_COLORS = {
  单选题: '#2563eb',
  多选题: '#7c3aed',
  判断题: '#0891b2',
  填空题: '#ea580c',
  简答题: '#059669'
};

export function typeColor(type) {
  return TYPE_COLORS[type] || '#64748b';
}

export function typeBackground(type) {
  return `${typeColor(type)}14`;
}

/** 渐变封面，按题库顺序循环 */
export const COVERS = [
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #06b6d4, #0e7490)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #10b981, #047857)'
];
