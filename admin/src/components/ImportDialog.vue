<template>
  <el-dialog
    v-model="visible"
    title="导入 Excel 题目"
    :width="isMobile ? '94%' : '860px'"
    :top="isMobile ? '5vh' : '6vh'"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="reset"
  >
    <div v-loading="loading" element-loading-text="正在解析 Excel…" class="import-body">
      <template v-if="!preview">
        <div class="section">
          <div class="section-title">导入方式</div>
          <el-radio-group v-model="mode" @change="onModeChange">
            <el-radio-button value="excel">按 Excel 的「题库」列</el-radio-button>
            <el-radio-button value="target">全部导入指定题库</el-radio-button>
          </el-radio-group>
          <el-select
            v-if="mode === 'target'"
            v-model="targetBankId"
            placeholder="选择目标题库"
            class="target-select"
            @change="refreshPreview"
          >
            <el-option
              v-for="bank in banks"
              :key="bank.id"
              :label="`${bank.name}（${bank.questionCount} 题）`"
              :value="bank.id"
            />
          </el-select>
          <p class="section-hint">
            {{
              mode === 'excel'
                ? '按表格中的题库名称自动分库，不存在的题库会自动创建。'
                : '忽略表格中的题库名称，所有题目都写入所选题库。'
            }}
          </p>
        </div>

        <el-upload
          class="uploader"
          drag
          action="#"
          accept=".xlsx,.xls"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onFileChange"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text">把 Excel 拖到这里，或 <em>点击选择文件</em></div>
          <template #tip>
            <div class="upload-tip">支持 .xlsx / .xls，单文件不超过 10MB，最多 20000 行</div>
          </template>
        </el-upload>

        <div class="template-row">
          <span>第一次使用？先下载标准模板，按示例填写。</span>
          <el-button link type="primary" :icon="Download" @click="onDownload">下载 Excel 模板</el-button>
        </div>
      </template>

      <template v-else>
        <div class="file-bar">
          <div class="file-name">
            <el-icon><Document /></el-icon>
            <span>{{ preview.fileName }}</span>
            <el-tag v-if="preview.sheetName" size="small" effect="plain">工作表：{{ preview.sheetName }}</el-tag>
          </div>
          <el-button link type="primary" @click="reset">重新选择</el-button>
        </div>

        <div class="stat-row">
          <div class="stat">
            <b>{{ preview.total }}</b>
            <span>识别行数</span>
          </div>
          <div class="stat ok">
            <b>{{ preview.validCount }}</b>
            <span>可导入</span>
          </div>
          <div class="stat warn">
            <b>{{ preview.duplicateCount }}</b>
            <span>重复跳过</span>
          </div>
          <div class="stat danger">
            <b>{{ preview.invalidCount }}</b>
            <span>异常跳过</span>
          </div>
        </div>

        <div v-if="preview.banks.length" class="chips">
          <span class="chips-label">题库</span>
          <el-tag v-for="bank in preview.banks" :key="bank.name" type="info" effect="plain" round>
            {{ bank.name }} · {{ bank.count }} 题
          </el-tag>
        </div>

        <div v-if="preview.typeCounts.length" class="chips">
          <span class="chips-label">题型</span>
          <span v-for="item in preview.typeCounts" :key="item.type" class="type-chip">
            <TypeTag :type="item.type" />
            <span>{{ item.count }}</span>
          </span>
        </div>

        <div class="preview-table">
          <el-table :data="preview.rows" size="small" max-height="252" border>
            <el-table-column prop="row" label="行号" width="62" align="center" />
            <el-table-column label="题型" width="86">
              <template #default="{ row }">
                <TypeTag :type="row.type" />
              </template>
            </el-table-column>
            <el-table-column prop="stem" label="题干" min-width="240" show-overflow-tooltip />
            <el-table-column prop="answer" label="答案" min-width="110" show-overflow-tooltip />
          </el-table>
        </div>
        <div class="preview-note">
          仅展示前 {{ preview.rows.length }} 道，确认后将写入 {{ preview.validCount }} 道题目
        </div>

        <el-collapse
          v-if="preview.errors.length || preview.duplicates.length"
          class="issue-list"
        >
          <el-collapse-item v-if="preview.errors.length" :title="`异常 ${preview.invalidCount} 行，已跳过`" name="errors">
            <div v-for="item in preview.errors" :key="`e-${item.row}`" class="issue-item">
              <span class="issue-row">第 {{ item.row }} 行</span>
              <span>{{ item.message }}</span>
            </div>
            <div v-if="preview.invalidCount > preview.errors.length" class="issue-more">
              仅显示前 {{ preview.errors.length }} 条
            </div>
          </el-collapse-item>
          <el-collapse-item
            v-if="preview.duplicates.length"
            :title="`重复 ${preview.duplicateCount} 行，已跳过`"
            name="duplicates"
          >
            <div v-for="item in preview.duplicates" :key="`d-${item.row}`" class="issue-item">
              <span class="issue-row">第 {{ item.row }} 行</span>
              <span>{{ item.message }}</span>
            </div>
            <div v-if="preview.duplicateCount > preview.duplicates.length" class="issue-more">
              仅显示前 {{ preview.duplicates.length }} 条
            </div>
          </el-collapse-item>
        </el-collapse>
      </template>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button v-if="preview" @click="reset">重新选择</el-button>
        <el-button
          type="primary"
          :disabled="!preview || !preview.validCount"
          :loading="committing"
          @click="submit"
        >
          确认导入{{ preview ? ` ${preview.validCount} 道` : '' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Document, Download, UploadFilled } from '@element-plus/icons-vue';
import TypeTag from './TypeTag.vue';
import { bankOptions } from '../api/bank.js';
import { commitImport, downloadTemplate, previewImport } from '../api/import.js';
import { useMobile } from '../composables/useMobile.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue', 'done']);

const { isMobile } = useMobile();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const mode = ref('excel');
const targetBankId = ref(null);
const banks = ref([]);
const loading = ref(false);
const committing = ref(false);
const preview = ref(null);
const importId = ref('');
const localFileName = ref('');

async function loadBanks() {
  try {
    banks.value = await bankOptions();
  } catch (_) {
    banks.value = [];
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function onFileChange(uploadFile) {
  const raw = uploadFile.raw;
  if (!raw) return;

  if (!/\.(xlsx|xls)$/i.test(raw.name)) {
    ElMessage.warning('请选择 .xlsx 或 .xls 文件');
    return;
  }
  if (raw.size > 10 * 1024 * 1024) {
    ElMessage.warning('文件超过 10MB，请拆分后再导入');
    return;
  }
  if (mode.value === 'target' && !targetBankId.value) {
    ElMessage.warning('请先选择目标题库');
    return;
  }

  loading.value = true;
  try {
    const base64 = await readAsDataUrl(raw);
    localFileName.value = raw.name;
    const data = await previewImport({
      base64,
      fileName: raw.name,
      mode: mode.value,
      targetBankId: targetBankId.value || undefined
    });
    preview.value = data;
    importId.value = data.importId;
  } catch (_) {
    /* 错误提示由请求层统一处理 */
  } finally {
    loading.value = false;
  }
}

async function refreshPreview() {
  if (!importId.value) return;
  if (mode.value === 'target' && !targetBankId.value) {
    preview.value = null;
    return;
  }

  loading.value = true;
  try {
    const data = await previewImport({
      importId: importId.value,
      mode: mode.value,
      targetBankId: targetBankId.value || undefined
    });
    preview.value = data;
    importId.value = data.importId;
  } catch (_) {
    preview.value = null;
  } finally {
    loading.value = false;
  }
}

function onModeChange() {
  if (mode.value === 'target' && !targetBankId.value) {
    preview.value = null;
    ElMessage.info('请选择要导入的目标题库');
    return;
  }
  refreshPreview();
}

async function onDownload() {
  try {
    await downloadTemplate();
  } catch (err) {
    ElMessage.error(err.message || '模板下载失败');
  }
}

function reset() {
  preview.value = null;
  importId.value = '';
  localFileName.value = '';
  targetBankId.value = null;
  mode.value = 'excel';
  loadBanks();
}

async function submit() {
  if (!preview.value) return;
  committing.value = true;
  try {
    const data = await commitImport({
      importId: importId.value,
      mode: mode.value,
      targetBankId: targetBankId.value || undefined
    });
    const parts = [`成功导入 ${data.created} 道题`];
    if (data.banksCreated) parts.push(`新建 ${data.banksCreated} 个题库`);
    if (data.duplicateCount) parts.push(`跳过重复 ${data.duplicateCount} 道`);
    if (data.invalidCount) parts.push(`跳过异常 ${data.invalidCount} 条`);
    ElMessage.success(parts.join('，'));
    emit('done');
    visible.value = false;
  } catch (_) {
    /* 错误提示由请求层统一处理 */
  } finally {
    committing.value = false;
  }
}

loadBanks();
</script>

<style scoped>
.import-body {
  min-height: 260px;
}

.section {
  margin-bottom: 18px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}

.target-select {
  width: 260px;
  margin-left: 10px;
}

.section-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.uploader :deep(.el-upload-dragger) {
  padding: 28px 20px;
  border-radius: 12px;
  background: #f8fafc;
  border-color: #dbe3ef;
}

.uploader :deep(.el-upload-dragger:hover) {
  border-color: #93b4fa;
  background: #f8fbff;
}

.upload-icon {
  font-size: 42px;
  color: #93b4fa;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 14px;
  color: #475569;
}

.upload-text em {
  color: #2563eb;
  font-style: normal;
  font-weight: 600;
}

.upload-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 14px;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  font-size: 12.5px;
  color: #475569;
}

.file-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
  min-width: 0;
}

.file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 16px 0 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.stat b {
  font-size: 22px;
  line-height: 1.1;
  color: #0f172a;
}

.stat span {
  font-size: 12px;
  color: #94a3b8;
}

.stat.ok b {
  color: #059669;
}

.stat.warn b {
  color: #d97706;
}

.stat.danger b {
  color: #dc2626;
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.chips-label {
  font-size: 12px;
  color: #94a3b8;
  width: 34px;
  flex: none;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #475569;
}

.preview-table {
  margin-top: 6px;
}

.preview-note {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.issue-list {
  margin-top: 12px;
}

.issue-item {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  color: #64748b;
  padding: 4px 0;
}

.issue-row {
  color: #94a3b8;
  flex: none;
  width: 62px;
}

.issue-more {
  margin-top: 4px;
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
  .stat-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .target-select {
    width: 100%;
    margin: 10px 0 0;
  }

  .template-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .dialog-footer {
    flex-wrap: wrap;
  }

  .dialog-footer .el-button {
    margin-left: 0;
  }
}
</style>
