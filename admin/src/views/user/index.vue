<template>
  <div class="page">
    <div class="panel">
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索昵称、身份或用户 ID"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select
          v-model="filters.status"
          placeholder="全部状态"
          clearable
          style="width: 130px"
          @change="search"
        >
          <el-option label="正常" value="1" />
          <el-option label="已禁用" value="0" />
        </el-select>
        <el-select
          v-model="filters.vip"
          placeholder="全部用户"
          clearable
          style="width: 130px"
          @change="search"
        >
          <el-option label="仅 VIP" value="vip" />
          <el-option label="非 VIP" value="normal" />
        </el-select>
        <el-select
          v-model="filters.account"
          placeholder="全部账号类型"
          clearable
          style="width: 150px"
          @change="search"
        >
          <el-option label="已注册账号" value="account" />
          <el-option label="历史游客" value="guest" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        <div class="spacer"></div>
        <span class="total-text">共 {{ total }} 位用户</span>
      </div>

      <div class="table-wrap">
        <el-table v-loading="loading" :data="list" row-key="id">
          <el-table-column label="用户" :min-width="isMobile ? 150 : 200">
            <template #default="{ row }">
              <div class="user-cell">
                <div class="user-avatar">{{ avatarText(row) }}</div>
                <div class="user-main">
                  <div class="user-name">
                    {{ row.nickname || '未命名用户' }}
                    <span v-if="row.username" class="acct-tag">账号</span>
                    <span v-else class="guest-tag">游客</span>
                  </div>
                  <div class="user-id">ID {{ row.id }}</div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="身份" min-width="200">
            <template #default="{ row }">
              <template v-if="row.username">
                <span class="identity-type">账号</span>
                <span class="identity-value">{{ row.username }}</span>
              </template>
              <template v-else>
                <span class="identity-type">{{ row.identityType === 'wx_openid' ? '微信' : '设备' }}</span>
                <span class="identity-value">{{ row.identity }}</span>
              </template>
            </template>
          </el-table-column>

          <el-table-column label="VIP" :width="isMobile ? 96 : 116" align="center">
            <template #default="{ row }">
              <template v-if="row.vipActive">
                <el-tag type="success" size="small" effect="plain">永久 VIP</el-tag>
                <div class="vip-source">{{ row.vipSource === 'admin' ? '后台设置' : '卡密激活' }}</div>
              </template>
              <el-tag v-else-if="row.isVip" type="warning" size="small" effect="plain">已封禁</el-tag>
              <span v-else class="muted">未开通</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" :width="isMobile ? 82 : 90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small" effect="plain">
                {{ row.status === 1 ? '正常' : '已禁用' }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" prop="createdAt" label="注册时间" width="165" />

          <el-table-column v-if="!isMobile" label="最近登录" width="165">
            <template #default="{ row }">{{ row.lastLoginAt || '—' }}</template>
          </el-table-column>

          <el-table-column label="操作" :width="isMobile ? 96 : 170" align="right">
            <template #default="{ row }">
              <div class="row-actions" :class="{ stacked: isMobile }">
                <el-button link type="primary" @click="openDetail(row)">查看</el-button>
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button
                  link
                  :type="row.status === 1 ? 'danger' : 'success'"
                  @click="toggleStatus(row)"
                >
                  {{ row.status === 1 ? '禁用' : '启用' }}
                </el-button>
              </div>
            </template>
          </el-table-column>

          <template #empty>
            <div class="empty-box">
              <div class="empty-title">还没有用户</div>
              <div class="empty-desc">用户注册并登录移动端后会出现在这里</div>
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

    <el-dialog
      v-model="editVisible"
      title="编辑用户"
      :width="isMobile ? '92%' : '440px'"
      :close-on-click-modal="false"
      @closed="editFormRef?.clearValidate()"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="editForm.nickname" maxlength="30" placeholder="用户昵称" show-word-limit />
        </el-form-item>
        <el-form-item label="用户身份">
          <el-radio-group v-model="editForm.isVip">
            <el-radio-button :value="false">普通用户</el-radio-button>
            <el-radio-button :value="true">永久 VIP</el-radio-button>
          </el-radio-group>
          <div class="form-tip">
            永久 VIP 可解锁全部题库，权益与卡密激活相同；后台设置不消耗卡密，取消后卡密也不会退回。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer
      v-model="drawer"
      :title="'用户详情'"
      :size="isMobile ? '100%' : '620px'"
      @closed="detail = null"
    >
      <div v-if="detail" class="detail">
        <div class="profile-head">
          <div class="profile-avatar">{{ avatarText(detail) }}</div>
          <div class="profile-main">
            <div class="profile-name">{{ detail.nickname || '未命名用户' }}</div>
            <div class="profile-id">ID {{ detail.id }}</div>
          </div>
          <el-tag :type="detail.status === 1 ? 'success' : 'danger'" size="small" effect="plain">
            {{ detail.status === 1 ? '正常' : '已禁用' }}
          </el-tag>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">身份</span>
            <span class="info-value">
              <template v-if="detail.username">账号 · {{ detail.username }}</template>
              <template v-else>{{ detail.identityType === 'wx_openid' ? '微信' : '设备' }} · {{ detail.identity }}</template>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">用户身份</span>
            <span class="info-value">
              <template v-if="detail.isVip">
                永久 VIP
                <div class="info-sub">
                  {{ vipSourceText(detail) }}{{ detail.vipActivatedAt ? ` · ${detail.vipActivatedAt}` : '' }}
                </div>
              </template>
              <template v-else>普通用户</template>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">注册时间</span>
            <span class="info-value">{{ detail.createdAt }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最近登录</span>
            <span class="info-value">{{ detail.lastLoginAt || '—' }}</span>
          </div>
        </div>

        <div class="section-title">激活记录</div>
        <div v-if="detail.activationLogs && detail.activationLogs.length" class="log-list">
          <div v-for="log in detail.activationLogs" :key="log.id" class="log-item">
            <div class="log-row">
              <span class="log-tail">{{ log.codeTail ? `尾号 ${log.codeTail}` : '后台操作' }}</span>
              <el-tag :type="logMeta(log.result).type" size="small" effect="plain">
                {{ logMeta(log.result).label }}
              </el-tag>
            </div>
            <div v-if="log.message" class="log-msg">{{ log.message }}</div>
            <div class="log-meta">{{ log.createdAt }}</div>
          </div>
        </div>
        <div v-else class="muted" style="padding: 16px 0">该用户还没有激活记录</div>

        <div class="drawer-actions">
          <el-button @click="openEdit(detail)">编辑资料</el-button>
          <el-button :type="detail.isVip ? 'warning' : 'primary'" plain @click="toggleVip(detail)">
            {{ detail.isVip ? '取消 VIP' : '设为永久 VIP' }}
          </el-button>
          <el-button
            :type="detail.status === 1 ? 'danger' : 'success'"
            @click="toggleStatus(detail)"
          >
            {{ detail.status === 1 ? '禁用账号' : '启用账号' }}
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { RefreshLeft, Search } from '@element-plus/icons-vue';
import { getUser, listUsers, setUserStatus, setUserVip, updateUser } from '../../api/user.js';
import { useMobile } from '../../composables/useMobile.js';

const { isMobile } = useMobile();

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const filters = reactive({
  keyword: '',
  status: '',
  vip: '',
  account: ''
});

const drawer = ref(false);
const detail = ref(null);

const editVisible = ref(false);
const saving = ref(false);
const editFormRef = ref(null);
const editTarget = ref(null);
const editForm = reactive({ nickname: '', isVip: false });
const editRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }]
};

const avatarText = (row) => String(row.nickname || '用').slice(0, 1).toUpperCase();

/** 会员来源说明：卡密激活 vs 后台设置 */
const vipSourceText = (row) => {
  if (!row || !row.isVip) return '未开通';
  if (row.vipSource === 'admin') return '后台设置';
  return row.cardTail ? `卡密激活 · 尾号 ${row.cardTail}` : '卡密激活';
};

const logMeta = (result) => {
  if (result === 'SUCCESS') return { label: '成功', type: 'success' };
  if (result === 'ADMIN_GRANT') return { label: '后台开通', type: 'success' };
  if (result === 'ADMIN_REVOKE') return { label: '后台取消', type: 'info' };
  if (result === 'CARD_FORMAT' || result === 'CARD_NOT_FOUND') return { label: '失败', type: 'danger' };
  if (result === 'RATE_LIMITED') return { label: '限频', type: 'warning' };
  if (result === 'ALREADY_VIP') return { label: '已 VIP', type: 'info' };
  return { label: result || '—', type: 'info' };
};

async function load() {
  loading.value = true;
  try {
    const data = await listUsers({
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      vip: filters.vip || undefined,
      account: filters.account || undefined,
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
}

function resetFilters() {
  filters.keyword = '';
  filters.status = '';
  filters.vip = '';
  filters.account = '';
  search();
}

async function openDetail(row) {
  detail.value = await getUser(row.id);
  drawer.value = true;
}

function openEdit(row) {
  editTarget.value = row;
  editForm.nickname = row.nickname || '';
  editForm.isVip = !!row.isVip;
  editVisible.value = true;
}

async function saveEdit() {
  const valid = await editFormRef.value.validate().catch(() => false);
  if (!valid) return;

  const target = editTarget.value;
  if (!target) return;

  const nickname = editForm.nickname.trim();
  const vipChanged = editForm.isVip !== !!target.isVip;

  saving.value = true;
  try {
    await updateUser(target.id, { nickname });
    if (vipChanged) {
      await setUserVip(target.id, editForm.isVip);
      ElMessage.success(`${nickname}：${editForm.isVip ? '已设为永久 VIP' : '已取消 VIP'}`);
    } else {
      ElMessage.success('昵称已更新');
    }
    editVisible.value = false;
    if (detail.value && detail.value.id === target.id) {
      detail.value = await getUser(target.id);
    }
    load();
  } finally {
    saving.value = false;
  }
}

/** 设置身份：普通用户 ↔ 永久 VIP（不消耗、也不退回卡密） */
async function toggleVip(row) {
  const enabling = !row.isVip;
  const name = row.nickname || `ID ${row.id}`;
  const tip = enabling
    ? `将「${name}」设为永久 VIP？立即解锁全部题库，不消耗卡密。`
    : `将取消「${name}」的永久 VIP，该用户立即失去全部题库权限。`
      + `${row.vipSource === 'card' ? '该会员由卡密激活，卡密仍保持已使用、不会退回。' : ''}`;

  try {
    await ElMessageBox.confirm(tip, enabling ? '设为永久 VIP' : '取消 VIP', {
      type: 'warning',
      confirmButtonText: enabling ? '确认开通' : '确认取消',
      confirmButtonClass: enabling ? '' : 'el-button--danger'
    });
  } catch (_) {
    return;
  }

  try {
    const data = await setUserVip(row.id, enabling);
    ElMessage.success(enabling ? '已设为永久 VIP' : '已取消 VIP');
    if (detail.value && detail.value.id === row.id) {
      detail.value = data.user;
    }
    load();
  } catch (_) {
    /* 错误提示已处理 */
  }
}

async function toggleStatus(row) {
  const disabling = row.status === 1;
  const tip = disabling
    ? `禁用后该用户将无法登录使用，其永久 VIP 也会一并失效；恢复启用后 VIP 自动恢复。`
    : `启用后该用户可重新登录使用，已激活的 VIP 将自动恢复。`;

  try {
    await ElMessageBox.confirm(tip, disabling ? '禁用账号' : '启用账号', {
      type: 'warning',
      confirmButtonText: disabling ? '确认禁用' : '确认启用',
      confirmButtonClass: disabling ? 'el-button--danger' : ''
    });
  } catch (_) {
    return;
  }

  try {
    await setUserStatus(row.id, disabling ? 0 : 1);
    ElMessage.success(disabling ? '账号已禁用' : '账号已启用');
    if (detail.value && detail.value.id === row.id) {
      detail.value = await getUser(row.id);
    }
    load();
  } catch (_) {
    /* 错误提示已处理 */
  }
}

onMounted(load);
</script>

<style scoped>
.total-text {
  font-size: 12.5px;
  color: #94a3b8;
}

.vip-source {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.2;
  color: #94a3b8;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #94a3b8;
}

.info-sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: #94a3b8;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: linear-gradient(135deg, #60a5fa, #2563eb);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-main {
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.user-id {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.acct-tag,
.guest-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 400;
  line-height: 17px;
  border-radius: 4px;
  vertical-align: 1px;
}

.acct-tag {
  background: #ecfdf5;
  color: #047857;
}

.guest-tag {
  background: #f1f5f9;
  color: #64748b;
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eef2f7;
}

.profile-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #60a5fa, #2563eb);
  color: #fff;
  font-weight: 650;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.profile-main {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 17px;
  font-weight: 650;
  color: #0f172a;
}

.profile-id {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 3px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 16px 0;
}

.info-item {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.info-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 5px;
}

.info-value {
  font-size: 13px;
  color: #334155;
  word-break: break-all;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin: 18px 0 10px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 9px;
}

.log-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.log-tail {
  font-size: 12.5px;
  color: #334155;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.log-msg {
  margin-top: 5px;
  font-size: 12px;
  color: #64748b;
}

.log-meta {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid #eef2f7;
}

@media (max-width: 768px) {
  .total-text {
    display: none;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
