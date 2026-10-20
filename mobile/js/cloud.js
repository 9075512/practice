// 云服务数据访问层：题库 / 题目从云数据库（PostgreSQL）直连读取。
// SDK 通过 index.html 里的 CDN <script> 加载，暴露全局 WorkBuddyCloud。
// publicConfig（endpoint / oauthRelayBaseUrl / publishableKey）来自云服务激活结果，
// 属于可公开的前端配置，不携带任何服务端密钥。
const CLOUD_CONFIG = {
  endpoint: 'https://practice-quiz-admin.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_DwdgUhZmm3xNHc432CLuxM_yKjDo5oEhWKFiSNsGMcKv0LEkaJVMHbQ'
};

let cloud = null;

export function getCloud() {
  if (cloud) return cloud;
  const WBC = window.WorkBuddyCloud;
  if (!WBC || !WBC.createWorkBuddyCloud) {
    throw new Error('云服务未就绪，请检查网络后重试');
  }
  cloud = WBC.createWorkBuddyCloud(CLOUD_CONFIG);
  return cloud;
}

/** 云库字段（snake_case）→ 前端字段（camelCase） */
function mapBank(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    vipOnly: !!row.vip_only,
    questionCount: row.question_count || 0,
    typeCounts: row.type_counts || []
  };
}

/** 题库列表（公开只读） */
export async function listBanks() {
  const { data, error } = await getCloud()
    .database.from('banks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapBank);
}

/** 单个题库 */
export async function getBank(id) {
  const { data, error } = await getCloud()
    .database.from('banks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBank(data) : null;
}

/** 按题库（+题型）读取题目，返回全量（单题库题量小，客户端自行处理顺序/分页/筛选） */
export async function queryQuestions({ bankId, type }) {
  let builder = getCloud()
    .database.from('questions')
    .select('id, bank_id, type, stem, options, answer, analysis, sort_order')
    .eq('bank_id', bankId);
  if (type) builder = builder.eq('type', type);
  builder = builder.order('sort_order', { ascending: true }).order('id', { ascending: true });

  const { data, error } = await builder;
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    stem: row.stem,
    options: row.options || [],
    answer: row.answer || '',
    analysis: row.analysis || ''
  }));
}
