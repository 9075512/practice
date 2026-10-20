<template>
  <div class="page">
    <div class="panel">
      <div class="toolbar">
        <el-select
          v-model="filters.bankId"
          placeholder="全部题库"
          clearable
          filterable
          style="width: 210px"
          @change="search"
        >
          <el-option
            v-for="bank in banks"
            :key="bank.id"
            :label="`${bank.name}（${bank.questionCount}）`"
            :value="bank.id"
          />
        </el-select>
        <el-select
          v-model="filters.type"
          placeholder="全部题型"
          clearable
          style="width: 140px"
          @change="search"
        >
          <el-option v-for="item in QUESTION_TYPES" :key="item.value" :label="item.value" :value="item.value" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索题干、答案或解析"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        <div class="spacer"></div>
        <span class="total-text">共 {{ total }} 道</span>
      </div>

      <div class="table-wrap">
        <el-table v-loading="loading" :data="list" row-key="id">
          <el-table-column label="题型" :width="isMobile ? 80 : 92">
            <template #default="{ row }">
              <TypeTag :type="row.type" />
            </template>
          </el-table-column>

          <el-table-column label="题干" :min-width="isMobile ? 168 : 320">
            <template #default="{ row }">
              <div class="stem-cell" @click="openDetail(row)">{{ row.stem }}</div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="答案" min-width="150">
            <template #default="{ row }">
              <span class="answer-cell">{{ shortAnswer(row) }}</span>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" prop="bankName" label="所属题库" width="190" show-overflow-tooltip />

          <el-table-column label="操作" :width="isMobile ? 72 : 150" align="right">
            <template #default="{ row }">
              <div class="row-actions" :class="{ stacked: isMobile }">
                <el-button link type="primary" @click="openDetail(row)">查看</el-button>
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button link type="danger" @click="remove(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>

          <template #empty>
            <div class="empty-box">
              <div class="empty-title">没有符合条件的题目</div>
              <div class="empty-desc">换个题库或题型试试，也可以到题库管理里导入 Excel</div>
            </div>
          </template>
        </el-table>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="search"
        />
      </div>
    </div>

    <el-drawer
      v-model="drawer"
      :title="editing ? '编辑题目' : '题目详情'"
      :size="isMobile ? '100%' : '620px'"
      @closed="editing = false"
    >
      <div v-if="current" class="detail">
        <template v-if="!editing">
          <div class="detail-head">
            <TypeTag :type="current.type" />
            <span class="detail-bank">{{ current.bankName }}</span>
          </div>

          <h3 class="detail-stem">{{ current.stem }}</h3>

          <div v-if="current.options.length" class="option-list">
            <div
              v-for="option in current.options"
              :key="option.key"
              class="option-item"
              :class="{ correct: isCorrectOption(current, option) }"
            >
              <span class="option-key">{{ option.key }}</span>
              <span class="option-text">{{ option.text }}</span>
              <el-icon v-if="isCorrectOption(current, option)" class="correct-icon"><Check /></el-icon>
            </div>
          </div>

          <div class="answer-block">
            <div class="block-label">答案</div>
            <div class="block-text answer-text">{{ answerText(current) }}</div>
          </div>

          <div class="answer-block analysis-block">
            <div class="block-label">解析</div>
            <div v-if="current.analysis" class="block-text">{{ current.analysis }}</div>
            <div v-else class="block-text muted">这道题没有填写解析</div>
          </div>
        </template>

        <el-form v-else ref="formRef" :model="form" :rules="rules" label-position="top">
          <div class="form-row">
            <el-form-item label="题型" prop="type" class="form-type">
              <el-select v-model="form.type">
                <el-option v-for="item in QUESTION_TYPES" :key="item.value" :label="item.value" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="所属题库">
              <el-input :model-value="current.bankName" disabled />
            </el-form-item>
          </div>

          <el-form-item label="题干" prop="stem">
            <el-input v-model="form.stem" type="textarea" :rows="4" maxlength="5000" show-word-limit />
          </el-form-item>

          <el-form-item label="选项">
            <div class="option-editor">
              <div v-for="(option, index) in form.options" :key="option.key" class="option-edit-row">
                <span class="option-key">{{ option.key }}</span>
                <el-input v-model="option.text" maxlength="1000" placeholder="选项内容" />
                <el-button link type="danger" :icon="Delete" @click="removeOption(index)" />
              </div>
              <el-button
                v-if="form.options.length < 8"
                link
                type="primary"
                :icon="Plus"
                @click="addOption"
              >
                添加选项
              </el-button>
              <div v-if="!form.options.length" class="option-empty">
                当前题目没有选项，判断题与填空题通常不需要。
              </div>
            </div>
          </el-form-item>

          <el-form-item label="答案" prop="answer">
            <el-input v-model="form.answer" maxlength="2000" :placeholder="answerHint" />
            <div class="field-hint">{{ answerHint }}</div>
          </el-form-item>

          <el-form-item label="解析">
            <el-input v-model="form.analysis" type="textarea" :rows="4" maxlength="10000" show-word-limit />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawer = false">{{ editing ? '取消' : '关闭' }}</el-button>
          <el-button v-if="!editing" type="primary" @click="startEdit">编辑</el-button>
          <el-button v-else type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check, Delete, Plus, RefreshLeft, Search } from '@element-plus/icons-vue';
import { bankOptions } from '../../api/bank.js';
import { deleteQuestion, listQuestions, updateQuestion } from '../../api/question.js';
import { QUESTION_TYPES } from '../../utils/constants.js';
import TypeTag from '../../components/TypeTag.vue';
import { useMobile } from '../../composables/useMobile.js';

const route = useRoute();
const router = useRouter();
const { isMobile } = useMobile();

const loading = ref(false);
const saving = ref(false);
const banks = ref([]);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const filters = reactive({
  bankId: route.query.bankId ? Number(route.query.bankId) : null,
  type: '',
  keyword: ''
});

const drawer = ref(false);
const editing = ref(false);
const current = ref(null);
const formRef = ref(null);
const form = reactive({
  type: '单选题',
  stem: '',
  options: [],
  answer: '',
  analysis: ''
});

const rules = {
  type: [{ required: true, message: '请选择题型', trigger: 'change' }],
  stem: [{ required: true, message: '请输入题干', trigger: 'blur' }],
  answer: [{ required: true, message: '请输入答案', trigger: 'blur' }]
};

const answerHint = computed(() => {
  if (form.type === '单选题') return '填选项字母，如 A';
  if (form.type === '多选题') return '填多个选项字母，如 ABD';
  if (form.type === '判断题') return '填「正确」或「错误」';
  return '直接填写答案文本';
});

function shortAnswer(row) {
  if (!row.answer) return '—';
  return row.answer.length > 26 ? `${row.answer.slice(0, 26)}…` : row.answer;
}

function answerText(question) {
  if (/^[A-H]+$/.test(question.answer)) return question.answer.split('').join('、');
  return question.answer;
}

function isCorrectOption(question, option) {
  if (question.type === '单选题' || question.type === '多选题') {
    return /^[A-H]+$/.test(question.answer) && question.answer.includes(option.key);
  }
  if (question.type === '判断题') {
    return option.text === question.answer;
  }
  return false;
}

async function load() {
  loading.value = true;
  try {
    const data = await listQuestions({
      bankId: filters.bankId || undefined,
      type: filters.type || undefined,
      keyword: filters.keyword || undefined,
      page: page.value,
      pageSize: pageSize.value
    });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
  const query = { ...route.query };
  if (filters.bankId) query.bankId = String(filters.bankId);
  else delete query.bankId;
  router.replace({ path: '/questions', query });
}

function resetFilters() {
  filters.bankId = null;
  filters.type = '';
  filters.keyword = '';
  search();
}

function fillForm(question) {
  form.type = question.type;
  form.stem = question.stem;
  form.options = question.options.map((item) => ({ key: item.key, text: item.text }));
  form.answer = question.answer;
  form.analysis = question.analysis || '';
}

function openDetail(row) {
  current.value = row;
  editing.value = false;
  drawer.value = true;
}

function openEdit(row) {
  current.value = row;
  fillForm(row);
  editing.value = true;
  drawer.value = true;
}

function startEdit() {
  fillForm(current.value);
  editing.value = true;
}

function addOption() {
  const used = new Set(form.options.map((item) => item.key));
  const key = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].find((item) => !used.has(item));
  if (!key) return;
  form.options.push({ key, text: '' });
}

function removeOption(index) {
  form.options.splice(index, 1);
}

async function save() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  const options = form.options
    .filter((item) => item.text.trim())
    .map((item) => ({ key: item.key, text: item.text.trim() }));

  saving.value = true;
  try {
    const updated = await updateQuestion(current.value.id, {
      type: form.type,
      stem: form.stem,
      options,
      answer: form.answer,
      analysis: form.analysis
    });
    current.value = updated;
    editing.value = false;
    ElMessage.success('题目已保存');
    load();
    bankOptions().then((data) => {
      banks.value = data;
    });
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除这道题吗？删除后移动端不再显示。\n\n${row.stem.slice(0, 60)}`,
      '删除题目',
      { type: 'warning', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' }
    );
  } catch (_) {
    return;
  }

  try {
    await deleteQuestion(row.id);
    ElMessage.success('题目已删除');
    if (list.value.length === 1 && page.value > 1) page.value -= 1;
    load();
  } catch (_) {
    /* 错误提示已处理 */
  }
}

onMounted(async () => {
  banks.value = await bankOptions();
  load();
});
</script>

<style scoped>
.total-text {
  font-size: 12.5px;
  color: #94a3b8;
}

.stem-cell {
  font-size: 13px;
  color: #1e293b;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
}

.stem-cell:hover {
  color: #1d4ed8;
}

.answer-cell {
  font-size: 12.5px;
  color: #475569;
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

.empty-box {
  padding: 30px 0;
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

.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.detail-bank {
  font-size: 12px;
  color: #94a3b8;
}

.detail-stem {
  margin: 0 0 18px;
  font-size: 16px;
  line-height: 1.75;
  font-weight: 600;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 20px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e9f2;
  border-radius: 9px;
  background: #fbfcfe;
  font-size: 13.5px;
  line-height: 1.6;
  color: #334155;
}

.option-item.correct {
  border-color: #a7f3d0;
  background: #f0fdf4;
  color: #065f46;
}

.option-key {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #eef2f7;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.option-item.correct .option-key {
  background: #d1fae5;
  color: #047857;
}

.option-text {
  flex: 1;
  word-break: break-word;
}

.correct-icon {
  color: #059669;
  margin-top: 3px;
}

.answer-block {
  padding: 14px 16px;
  border-radius: 11px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  margin-bottom: 12px;
}

.block-label {
  font-size: 11px;
  letter-spacing: 1px;
  color: #94a3b8;
  margin-bottom: 7px;
}

.block-text {
  font-size: 13.5px;
  line-height: 1.75;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
}

.answer-text {
  font-weight: 600;
  color: #047857;
}

.analysis-block {
  background: #fff;
}

.form-row {
  display: flex;
  gap: 14px;
}

.form-row .el-form-item {
  flex: 1;
}

.option-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-edit-row .el-input {
  flex: 1;
}

.option-empty {
  font-size: 12px;
  color: #94a3b8;
}

.field-hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin-top: 4px;
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
  .total-text {
    display: none;
  }

  .detail-stem {
    font-size: 15px;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
