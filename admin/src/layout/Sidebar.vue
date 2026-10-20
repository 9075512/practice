<template>
  <aside class="sidebar" :class="{ open }">
    <div class="brand">
      <div class="brand-mark">背</div>
      <div class="brand-text">
        <div class="brand-name">背题库</div>
        <div class="brand-sub">RECITE ADMIN</div>
      </div>
      <button class="close-btn" type="button" @click="emit('close')">×</button>
    </div>

    <div class="menu-label">题库</div>
    <el-menu :default-active="active" router class="menu">
      <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </el-menu-item>
    </el-menu>

    <div class="sidebar-foot">
      <div class="foot-dot"></div>
      <div>
        <div class="foot-title">服务运行中</div>
        <div class="foot-sub">SQLite · 本地数据</div>
      </div>
    </div>  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);
const route = useRoute();

const menus = [
  { path: '/banks', label: '题库管理', icon: 'Collection' },
  { path: '/questions', label: '题目管理', icon: 'Document' },
  { path: '/cards', label: '卡密管理', icon: 'Ticket' },
  { path: '/users', label: '用户管理', icon: 'User' }
];

const active = computed(() => route.meta.activeMenu || route.path);
</script>

<style scoped>
.sidebar {
  width: 232px;
  flex: 0 0 232px;
  height: 100vh;
  position: sticky;
  top: 0;
  background: #ffffff;
  border-right: 1px solid #e5e9f2;
  display: flex;
  flex-direction: column;
  padding: 22px 14px 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 8px 22px;
}

.close-btn {
  display: none;
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 8px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  font-weight: 700;
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.26);
}

.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #0f172a;
}

.brand-sub {
  font-size: 9px;
  letter-spacing: 1.4px;
  color: #94a3b8;
  margin-top: 2px;
}

.menu-label {
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 1px;
  padding: 0 12px 8px;
}

.menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
}

.menu :deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  border-radius: 9px;
  margin-bottom: 4px;
  color: #475569;
  font-size: 14px;
}

.menu :deep(.el-menu-item:hover) {
  background: #f1f5f9;
  color: #0f172a;
}

.menu :deep(.el-menu-item.is-active) {
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}

.menu :deep(.el-menu-item.is-active .el-icon) {
  color: #2563eb;
}

.sidebar-foot {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.foot-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.14);
}

.foot-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.foot-sub {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    height: 100vh;
    width: 268px;
    flex: none;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.24s ease;
    box-shadow: 12px 0 32px rgba(15, 23, 42, 0.12);
    padding: 18px 14px 14px;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand {
    padding-bottom: 18px;
  }

  .menu :deep(.el-menu-item) {
    height: 46px;
    line-height: 46px;
  }
}
</style>
