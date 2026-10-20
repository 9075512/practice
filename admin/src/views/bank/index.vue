<template>
  <div class="page">
    <div class="panel">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索题库名称或简介"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button :icon="Download" @click="onDownload">下载模板</el-button>
        <el-button :icon="Upload" @click="importVisible = true">导入 Excel</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建题库</el-button>
      </div>

      <div class="summary" v-if="list.length">
        <span>共 <b>{{ list.length }}</b> 个题库</span>
        <span class="dot">·</span>
        <span><b>{{ totalQuestions }}</b> 道题</span>
        <span class="summary-hint">按题库和题型组织，移动端直接背诵</span>
      </div>

      <div class="table-wrap">
        <el-table v-loading="loading" :data="list" row-key="id">
          <el-table-column label="题库" :min-width="isMobile ? 180 : 300">
            <template #default="{ row }">
              <div class="bank-cell">
                <div class="bank-cover" :style="{ background: coverColor(row.id) }">
                  {{ row.name.slice(0, 1) }}
                </div>
                <div class="bank-text">
                  <div class="bank-title">
                    {{ row.name }}
                    <span v-if="row.vipOnly" class="vip-tag">VIP 专属</span>
                    <span v-if="isMobile" class="mobile-count">{{ row.questionCount }} 题</span>
                  </div>
                  <div class="bank-desc">{{ row.description || '暂无简介' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="题量" width="90" align="center">
            <template #default="{ row }">
              <span class="count-badge">{{ row.questionCount }}</span>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="题型分布" min-width="300">
            <template #default="{ row }">
              <div class="type-list">
                <span v-for="item in row.typeCounts" :key="item.type" class="type-item">
                  <TypeTag :type="item.type" />
                  <span class="type-count">{{ item.count }}</span>
                </span>
                <span v-if="!row.typeCounts.length" class="muted">暂无题目</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" prop="updatedAt" label="更新时间" width="165" />

          <el-table-column label="操作" :width="isMobile ? 72 : 196" align="right">
            <template #default="{ row }">
              <div class="row-actions" :class="{ stacked: isMobile }">
                <el-button link type="primary" @click="viewQuestions(row)">题目</el-button>
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button link type="danger" @click="remove(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>

          <template #empty>
            <div class="empty-box">
              <div class="empty-title">还没有题库</div>
              <div class="empty-desc">下载模板填好题目后，用 Excel 一键导入</div>
              <div class="empty-actions">
                <el-button :icon="Download" @click="onDownload">下载模板</el-button>
                <el-button type="primary" :icon="Upload" @click="importVisible = true">导入 Excel</el-button>
              </div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <el-drawer
      v-model="drawer"
      :title="form.id ? '编辑题库' : '新建题库'"
      :size="isMobile ? '100%' : '460px'"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="题库名称" prop="name">
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：初级会计 · 经济法基础" />
        </el-form-item>
        <el-form-item label="题库简介" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="简单说明这个题库的适用范围，可留空"
          />
        </el-form-item>
        <el-form-item label="VIP 专属">
          <div class="vip-switch-row">
            <el-switch v-model="form.vipOnly" />
            <span class="form-hint">开启后，非 VIP 用户只能看到题库，不能开始背题</span>
          </div>
        </el-form-item>
        <el-form-item label="展示排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
          <span class="form-hint">数值越小，移动端越靠前</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawer = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </div>
      </template>
    </el-drawer>

    <ImportDialog v-model="importVisible" @done="load" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue';
import {
  createBank,
  deleteBank,
  listBanks,
  updateBank
} from '../../api/bank.js';
import { downloadTemplate } from '../../api/import.js';
import TypeTag from '../../components/TypeTag.vue';
import ImportDialog from '../../components/ImportDialog.vue';
import { useMobile } from '../../composables/useMobile.js';

const router = useRouter();
const { isMobile } = useMobile();

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const keyword = ref('');
const importVisible = ref(false);

const drawer = ref(false);
const formRef = ref(null);
const form = reactive({
  id: null,
  name: '',
  description: '',
  vipOnly: false,
  sortOrder: 0
});

const rules = {
  name: [{ required: true, message: '请输入题库名称', trigger: 'blur' }]
};

const totalQuestions = computed(() =>
  list.value.reduce((sum, item) => sum + item.questionCount, 0)
);

const coverColors = [
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #06b6d4, #0e7490)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #10b981, #047857)'
];

function coverColor(id) {
  return coverColors[Number(id) % coverColors.length];
}

async function load() {
  loading.value = true;
  try {
    list.value = await listBanks({ keyword: keyword.value || undefined });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.id = null;
  form.name = '';
  form.description = '';
  form.vipOnly = false;
  form.sortOrder = list.value.length;
  drawer.value = true;
}

function openEdit(row) {
  form.id = row.id;
  form.name = row.name;
  form.description = row.description || '';
  form.vipOnly = !!row.vipOnly;
  form.sortOrder = row.sortOrder;
  drawer.value = true;
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description,
      vipOnly: form.vipOnly ? 1 : 0,
      sortOrder: form.sortOrder
    };
    if (form.id) {
      await updateBank(form.id, payload);
      ElMessage.success('题库已更新');
    } else {
      await createBank(payload);
      ElMessage.success('题库已创建');
    }
    drawer.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `删除「${row.name}」会同时删除其下 ${row.questionCount} 道题目，移动端立即不可见。`,
      '删除题库',
      { type: 'warning', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' }
    );
  } catch (_) {
    return;
  }

  try {
    await deleteBank(row.id);
    ElMessage.success('题库已删除');
    load();
  } catch (_) {
    /* 错误提示已处理 */
  }
}

function viewQuestions(row) {
  router.push({ path: '/questions', query: { bankId: row.id } });
}

async function onDownload() {
  try {
    await downloadTemplate();
  } catch (err) {
    ElMessage.error(err.message || '模板下载失败');
  }
}

onMounted(load);
</script>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 14px;
  font-size: 12.5px;
  color: #64748b;
}

.summary b {
  color: #1d4ed8;
  font-size: 14px;
}

.summary .dot {
  color: #cbd5e1;
}

.summary-hint {
  margin-left: auto;
  color: #94a3b8;
}

.bank-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.bank-cover {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.bank-text {
  min-width: 0;
}

.bank-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
}

.mobile-count {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  margin-left: 6px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 10.5px;
  font-weight: 600;
  vertical-align: 1px;
}

.vip-tag {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  margin-left: 6px;
  border-radius: 5px;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  font-size: 10.5px;
  font-weight: 600;
  vertical-align: 1px;
}

.vip-switch-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.row-actions.stacked {
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.row-actions.stacked :deep(.el-button) {
  margin-left: 0;
  height: 20px;
  font-size: 12px;
}

.bank-desc {
  font-size: 11.5px;
  color: #94a3b8;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 460px;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12.5px;
  font-weight: 600;
}

.type-list {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.type-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.type-count {
  font-size: 12px;
  color: #64748b;
}

.empty-box {
  padding: 26px 0 20px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
}

.empty-desc {
  margin-top: 6px;
  font-size: 12.5px;
  color: #94a3b8;
}

.empty-actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  gap: 10px;
}

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #94a3b8;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.drawer-footer :deep(.el-button) {
  flex: none;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .summary {
    padding: 0 12px 10px;
  }

  .summary-hint {
    display: none;
  }

  .bank-cell {
    gap: 9px;
  }

  .bank-cover {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    font-size: 15px;
  }

  .bank-desc {
    max-width: 180px;
  }

  .empty-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>
