<template>
  <div class="page">
    <el-tabs v-model="activeTab" class="card-tabs" @tab-change="onTabChange">
      <el-tab-pane label="卡密批次" name="batches">
        <div class="panel">
          <div class="toolbar">
            <div class="tip-text">卡密明文只在生成时显示一次，请当场下载保存</div>
            <div class="spacer"></div>
            <el-button :icon="Refresh" @click="loadBatches">刷新</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">生成卡密</el-button>
          </div>

          <div class="table-wrap">
            <el-table v-loading="loading" :data="batches" row-key="id">
              <el-table-column label="批次" :min-width="isMobile ? 190 : 260">
                <template #default="{ row }">
                  <div class="batch-cell">
                    <div class="batch-no">{{ row.batchNo }}</div>
                    <div class="batch-name">{{ row.name }}</div>
                    <div v-if="isMobile" class="batch-mobile-stats">
                      已用 {{ row.used }} / {{ row.total }}
                    </div>
                  </div>
                </template>
              </el-table-column>

              <el-table-column v-if="!isMobile" prop="quantity" label="数量" width="86" align="center" />

              <el-table-column v-if="!isMobile" label="使用情况" min-width="240">
                <template #default="{ row }">
                  <div class="usage">
                    <div class="usage-line">
                      <span>已用 {{ row.used }} / {{ row.total }}</span>
                      <span class="usage-rate">{{ row.usedRate }}%</span>
                    </div>
                    <el-progress :percentage="row.usedRate" :stroke-width="6" :show-text="false" />
                    <div class="usage-tags">
                      <span class="mini-tag unused">未使用 {{ row.unused }}</span>
                      <span class="mini-tag used">已使用 {{ row.used }}</span>
                      <span class="mini-tag void">作废 {{ row.voided }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <el-table-column v-if="!isMobile" prop="createdAt" label="生成时间" width="165" />

              <el-table-column label="操作" :width="isMobile ? 96 : 150" align="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openDetail(row)">查看</el-button>
                  <el-button link type="danger" :disabled="!row.unused" @click="removeBatch(row)">
                    作废未用
                  </el-button>
                </template>
              </el-table-column>

              <template #empty>
                <div class="empty-box">
                  <div class="empty-title">还没有生成过卡密</div>
                  <div class="empty-desc">生成后立即下载 CSV，再分发给用户</div>
                  <el-button type="primary" :icon="Plus" @click="openCreate">生成卡密</el-button>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="VIP 会员" name="vip">
        <div class="panel">
          <div class="toolbar">
            <el-input
              v-model="memberKeyword"
              placeholder="搜索昵称、用户 ID 或卡密尾号"
              clearable
              style="width: 260px"
              :prefix-icon="Search"
              @keyup.enter="searchMembers"
              @clear="searchMembers"
            />
            <el-button type="primary" :icon="Search" @click="searchMembers">查询</el-button>
            <div class="spacer"></div>
            <span class="tip-text">共 {{ memberTotal }} 位永久 VIP</span>
          </div>

          <div class="table-wrap">
            <el-table v-loading="memberLoading" :data="members" row-key="id">
              <el-table-column label="用户" min-width="180">
                <template #default="{ row }">
                  <div class="member-name">{{ row.nickname || '未命名用户' }}</div>
                  <div class="member-id">ID {{ row.userId }}</div>
                </template>
              </el-table-column>
              <el-table-column v-if="!isMobile" label="身份" min-width="170">
                <template #default="{ row }">
                  <span class="identity-type">{{ row.identityType === 'wx_openid' ? '微信' : '设备' }}</span>
                  <span class="identity-value">{{ row.identity }}</span>
                </template>
              </el-table-column>
              <el-table-column label="卡密尾号" width="100">
                <template #default="{ row }">
                  <el-tag v-if="row.source === 'admin'" size="small" effect="plain" type="info">后台设置</el-tag>
                  <span v-else class="mono">{{ row.cardTail }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="!isMobile" label="来源批次" width="170">
                <template #default="{ row }">{{ row.batchNo || '—' }}</template>
              </el-table-column>
              <el-table-column prop="activatedAt" label="开通时间" :width="isMobile ? 150 : 170" />

              <template #empty>
                <div class="empty-box">
                  <div class="empty-title">还没有 VIP 会员</div>
                  <div class="empty-desc">用户激活卡密，或在用户管理里设为 VIP 后会出现在这里</div>
                </div>
              </template>
            </el-table>
          </div>

          <div class="pager">
            <el-pagination
              v-model:current-page="memberPage"
              v-model:page-size="memberPageSize"
              :total="memberTotal"
              :page-sizes="[20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadMembers"
              @size-change="searchMembers"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="createVisible"
      title="生成卡密"
      :width="isMobile ? '94%' : '480px'"
      :close-on-click-modal="false"
      @closed="resetCreate"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="批次名称" prop="name">
          <el-input v-model="form.name" maxlength="80" placeholder="例如：2026 秋季推广第一批" />
        </el-form-item>
        <el-form-item label="生成数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" :max="2000" />
          <span class="form-hint">单批 1 ~ 2000 张</span>
        </el-form-item>
        <el-form-item label="激活截止时间（可选）">
          <el-date-picker
            v-model="form.validUntil"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="不填表示永久可激活"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" maxlength="200" placeholder="渠道、用途等" />
        </el-form-item>
      </el-form>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="卡密明文仅显示一次"
        description="服务端只保存哈希。生成后请立即下载 CSV；关闭弹窗后无法再次查看，只能作废重发。"
      />

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createVisible = false">取消</el-button>
          <el-button type="primary" :loading="creating" @click="submitCreate">生成</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resultVisible"
      title="卡密生成成功"
      :width="isMobile ? '94%' : '620px'"
      :close-on-click-modal="false"
    >
      <template v-if="result">
        <el-alert
          type="success"
          :closable="false"
          show-icon
          :title="`${result.batch.batchNo} · 共 ${result.codes.length} 张`"
          description="请立即下载或复制。关闭后服务端无法再次提供明文。"
        />
        <div class="result-meta">
          <span>{{ result.batch.name }}</span>
          <span>{{ result.batch.createdAt }}</span>
        </div>
        <el-input :model-value="codesText" type="textarea" :rows="12" readonly class="codes-area" />
        <div class="result-actions">
          <el-button :icon="CopyDocument" @click="copyCodes">复制全部</el-button>
          <el-button type="primary" :icon="Download" @click="downloadCsv">下载 CSV</el-button>
        </div>
      </template>

      <template #footer>
        <el-button @click="resultVisible = false">我已保存，关闭</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="detailVisible"
      title="批次详情"
      :size="isMobile ? '100%' : '760px'"
      @closed="detailBatch = null"
    >
      <div v-if="detailBatch" class="detail-wrap">
        <div class="detail-head">
          <div>
            <div class="detail-title">{{ detailBatch.batchNo }}</div>
            <div class="detail-sub">{{ detailBatch.name }} · {{ detailBatch.createdAt }}</div>
          </div>
        </div>

        <div class="detail-stats">
          <div class="stat"><b>{{ detailBatch.total }}</b><span>总数</span></div>
          <div class="stat ok"><b>{{ detailBatch.unused }}</b><span>未使用</span></div>
          <div class="stat used"><b>{{ detailBatch.used }}</b><span>已使用</span></div>
          <div class="stat void"><b>{{ detailBatch.voided }}</b><span>已作废</span></div>
        </div>

        <div class="detail-toolbar">
          <el-select v-model="cardStatus" placeholder="全部状态" clearable style="width: 140px" @change="loadCards(1)">
            <el-option label="未使用" value="unused" />
            <el-option label="已使用" value="used" />
            <el-option label="已作废" value="void" />
          </el-select>
          <div class="spacer"></div>
          <el-button
            type="danger"
            plain
            :disabled="!detailBatch.unused"
            @click="removeBatch(detailBatch)"
          >
            作废全部未使用
          </el-button>
        </div>

        <el-table v-loading="cardLoading" :data="cards" size="small">
          <el-table-column label="卡密尾号" width="100">
            <template #default="{ row }">
              <span class="mono">····{{ row.codeTail }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag :type="statusMeta(row.status).type" size="small" effect="plain">
                {{ statusMeta(row.status).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="使用人" min-width="120">
            <template #default="{ row }">
              <span v-if="row.userId">{{ row.nickname || '未命名' }} #{{ row.userId }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" prop="usedAt" label="使用时间" width="165">
            <template #default="{ row }">{{ row.usedAt || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="72" align="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'unused'"
                link
                type="danger"
                @click="removeCard(row)"
              >作废</el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <div class="muted" style="padding: 20px 0">没有符合条件的卡密</div>
          </template>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="cardPage"
            v-model:page-size="cardPageSize"
            :total="cardTotal"
            layout="total, prev, pager, next"
            background
            @current-change="loadCards"
          />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Download, Plus, Refresh, Search } from '@element-plus/icons-vue';
import {
  createCardBatch,
  listBatchCards,
  listCardBatches,
  listVipMembers,
  voidBatch,
  voidCard
} from '../../api/card.js';
import { useMobile } from '../../composables/useMobile.js';

const { isMobile } = useMobile();

const activeTab = ref('batches');
const loading = ref(false);
const batches = ref([]);

const createVisible = ref(false);
const creating = ref(false);
const formRef = ref(null);
const form = reactive({
  name: '',
  quantity: 100,
  validUntil: '',
  note: ''
});
const rules = {
  quantity: [{ required: true, message: '请输入生成数量', trigger: 'blur' }]
};

const resultVisible = ref(false);
const result = ref(null);
const codesText = computed(() => (result.value ? result.value.codes.join('\n') : ''));

const detailVisible = ref(false);
const detailBatch = ref(null);
const cards = ref([]);
const cardLoading = ref(false);
const cardStatus = ref('');
const cardPage = ref(1);
const cardPageSize = ref(20);
const cardTotal = ref(0);

const memberLoading = ref(false);
const members = ref([]);
const memberTotal = ref(0);
const memberPage = ref(1);
const memberPageSize = ref(20);
const memberKeyword = ref('');
const memberLoaded = ref(false);

const statusMeta = (status) => {
  if (status === 'used') return { label: '已使用', type: 'success' };
  if (status === 'void') return { label: '已作废', type: 'info' };
  return { label: '未使用', type: 'primary' };
};

async function loadBatches() {
  loading.value = true;
  try {
    batches.value = await listCardBatches();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.name = '';
  form.quantity = 100;
  form.validUntil = '';
  form.note = '';
  createVisible.value = true;
}

function resetCreate() {
  formRef.value?.clearValidate();
}

async function submitCreate() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  creating.value = true;
  try {
    const data = await createCardBatch({
      name: form.name.trim(),
      quantity: form.quantity,
      validUntil: form.validUntil || undefined,
      note: form.note.trim()
    });
    result.value = data;
    createVisible.value = false;
    resultVisible.value = true;
    loadBatches();
  } finally {
    creating.value = false;
  }
}

function escapeCsv(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv() {
  if (!result.value) return;
  const header = ['序号', '卡密', '批次号', '生成时间'];
  const rows = result.value.codes.map((code, index) => [
    index + 1,
    code,
    result.value.batch.batchNo,
    result.value.batch.createdAt
  ]);
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${result.value.batch.batchNo}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyCodes() {
  if (!result.value) return;
  try {
    await navigator.clipboard.writeText(codesText.value);
    ElMessage.success('已复制全部卡密');
  } catch (_) {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

async function openDetail(row) {
  detailBatch.value = row;
  cardStatus.value = '';
  cardPage.value = 1;
  detailVisible.value = true;
  await loadCards(1);
}

async function loadCards(page = cardPage.value) {
  if (!detailBatch.value) return;
  cardLoading.value = true;
  try {
    const data = await listBatchCards(detailBatch.value.id, {
      status: cardStatus.value || undefined,
      page,
      pageSize: cardPageSize.value
    });
    cards.value = data.list;
    cardTotal.value = data.total;
    cardPage.value = data.page;
    detailBatch.value = data.batch;
  } finally {
    cardLoading.value = false;
  }
}

async function removeCard(row) {
  try {
    await ElMessageBox.confirm(`确定作废尾号 ${row.codeTail} 的卡密吗？作废后不可恢复。`, '作废卡密', {
      type: 'warning',
      confirmButtonText: '确认作废',
      confirmButtonClass: 'el-button--danger'
    });
  } catch (_) {
    return;
  }

  try {
    await voidCard(row.id, '管理员手动作废');
    ElMessage.success('已作废');
    await loadCards();
    loadBatches();
  } catch (_) {
    /* 错误已提示 */
  }
}

async function removeBatch(row) {
  try {
    await ElMessageBox.confirm(
      `将作废「${row.batchNo}」下全部 ${row.unused} 张未使用卡密，已使用的卡不受影响。`,
      '作废未使用卡密',
      { type: 'warning', confirmButtonText: '确认作废', confirmButtonClass: 'el-button--danger' }
    );
  } catch (_) {
    return;
  }

  try {
    const data = await voidBatch(row.id, '管理员批量作废');
    ElMessage.success(`已作废 ${data.voided} 张卡密`);
    await loadBatches();
    if (detailVisible.value && detailBatch.value && detailBatch.value.id === row.id) {
      await loadCards();
    }
  } catch (_) {
    /* 错误已提示 */
  }
}

async function loadMembers(page = memberPage.value) {
  memberLoading.value = true;
  try {
    const data = await listVipMembers({
      keyword: memberKeyword.value || undefined,
      page,
      pageSize: memberPageSize.value
    });
    members.value = data.list;
    memberTotal.value = data.total;
    memberPage.value = data.page;
    memberLoaded.value = true;
  } finally {
    memberLoading.value = false;
  }
}

function searchMembers() {
  memberPage.value = 1;
  loadMembers(1);
}

function onTabChange(name) {
  if (name === 'vip' && !memberLoaded.value) loadMembers(1);
}

onMounted(loadBatches);
</script>

<style scoped>
.card-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.card-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: #e5e9f2;
}

.tip-text {
  font-size: 12.5px;
  color: #94a3b8;
}

.batch-cell {
  padding: 3px 0;
}

.batch-no {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.batch-name {
  margin-top: 3px;
  font-size: 11.5px;
  color: #94a3b8;
}

.batch-mobile-stats {
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
}

.usage-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #475569;
  margin-bottom: 5px;
}

.usage-rate {
  color: #1d4ed8;
  font-weight: 600;
}

.usage-tags {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.mini-tag {
  font-size: 11px;
  line-height: 18px;
  padding: 0 7px;
  border-radius: 5px;
}

.mini-tag.unused {
  background: #eff6ff;
  color: #1d4ed8;
}

.mini-tag.used {
  background: #ecfdf5;
  color: #047857;
}

.mini-tag.void {
  background: #f1f5f9;
  color: #64748b;
}

.member-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.member-id {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.identity-type {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eff6ff;
  color: #1d4ed8;
  margin-right: 6px;
}

.identity-value {
  font-size: 11.5px;
  color: #64748b;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.result-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 8px;
  font-size: 12px;
  color: #94a3b8;
}

.codes-area :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;
  letter-spacing: 0.4px;
}

.result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.detail-title {
  font-size: 16px;
  font-weight: 650;
  color: #0f172a;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.detail-sub {
  margin-top: 5px;
  font-size: 12px;
  color: #94a3b8;
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 16px 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.stat b {
  font-size: 20px;
  line-height: 1.2;
  color: #0f172a;
}

.stat span {
  font-size: 11px;
  color: #94a3b8;
}

.stat.ok b {
  color: #1d4ed8;
}

.stat.used b {
  color: #047857;
}

.stat.void b {
  color: #64748b;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.detail-toolbar .spacer {
  flex: 1;
}

.empty-box {
  padding: 28px 0 18px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
}

.empty-desc {
  margin: 6px 0 14px;
  font-size: 12.5px;
  color: #94a3b8;
}

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #94a3b8;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer :deep(.el-button) {
  flex: none;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .detail-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .result-meta {
    flex-direction: column;
    gap: 2px;
  }

  .result-actions {
    flex-wrap: wrap;
  }
}
</style>
