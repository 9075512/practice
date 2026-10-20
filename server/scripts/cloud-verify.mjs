// 验证云服务 SDK 连通性：读回 banks
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

const cloud = createWorkBuddyCloud({
  endpoint: 'https://practice-quiz-admin.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_DwdgUhZmm3xNHc432CLuxM_yKjDo5oEhWKFiSNsGMcKv0LEkaJVMHbQ',
});

const { data, error } = await cloud.database.from('banks').select('*');
if (error) {
  console.log('ERROR:', JSON.stringify(error));
  process.exit(1);
}
console.log('banks rows =', Array.isArray(data) ? data.length : data);
console.log(JSON.stringify(data, null, 2));

const q = await cloud.database.from('questions').select('id, type, stem', { count: 'exact', head: false }).limit(3);
console.log('questions sample:', JSON.stringify(q));
