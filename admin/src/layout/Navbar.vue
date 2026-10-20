<template>
  <header class="navbar">
    <div class="navbar-left">
      <button class="menu-btn" type="button" aria-label="打开菜单" @click="emit('toggle-menu')">
        <el-icon><Menu /></el-icon>
      </button>
      <div class="navbar-title">
        <h1>{{ title }}</h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <div class="navbar-right">
      <div class="today">
        <el-icon><Calendar /></el-icon>
        <span>{{ today }}</span>
      </div>
      <el-dropdown trigger="click" @command="handleCommand">
        <div class="profile">
          <div class="avatar">{{ initial }}</div>
          <div class="profile-text">
            <div class="profile-name">{{ auth.admin?.displayName || auth.admin?.username || '管理员' }}</div>
            <div class="profile-role">{{ auth.admin?.role === 'super' ? '超级管理员' : '管理员' }}</div>
          </div>
          <el-icon class="caret"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">账号信息</el-dropdown-item>
            <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { auth, clearAuth } from '../stores/auth.js';
import { logout } from '../api/auth.js';

const route = useRoute();
const router = useRouter();
const emit = defineEmits(['toggle-menu']);

const title = computed(() => route.meta.title || '管理后台');
const subtitle = computed(() => route.meta.subtitle || '');
const initial = computed(() => {
  const name = auth.admin?.displayName || auth.admin?.username || '管';
  return name.slice(0, 1).toUpperCase();
});

const today = computed(() => {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
});

async function handleCommand(command) {
  if (command === 'profile') {
    ElMessageBox.alert(
      `账号：${auth.admin?.username || '-'}\n角色：${auth.admin?.role === 'super' ? '超级管理员' : '管理员'}`,
      '账号信息',
      { confirmButtonText: '知道了' }
    );
    return;
  }
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' });
    } catch (_) {
      return;
    }
    try {
      await logout();
    } catch (_) {
      /* token 失效也继续清理本地状态 */
    }
    clearAuth();
    ElMessage.success('已退出登录');
    router.replace('/login');
  }
}
</script>

<style scoped>
.navbar {
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: rgba(244, 246, 251, 0.86);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.navbar-title {
  min-width: 0;
}

.menu-btn {
  display: none;
  width: 38px;
  height: 38px;
  border: 1px solid #e5e9f2;
  background: #ffffff;
  color: #334155;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
}

.navbar-left h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.2px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.navbar-left p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #7c8aa0;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.today {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  background: #fff;
  border: 1px solid #e5e9f2;
  padding: 7px 12px;
  border-radius: 8px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 6px;
  border-radius: 100px;
  background: #fff;
  border: 1px solid #e5e9f2;
  cursor: pointer;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #60a5fa, #2563eb);
  color: #fff;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.profile-text {
  line-height: 1.2;
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.profile-role {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

.caret {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 900px) {
  .navbar {
    height: 64px;
    padding: 0 14px;
  }

  .menu-btn {
    display: flex;
  }

  .navbar-left h1 {
    font-size: 17px;
  }

  .navbar-left p {
    display: none;
  }

  .today {
    display: none;
  }

  .profile {
    padding: 0;
    border: none;
    background: transparent;
  }

  .profile-text,
  .caret {
    display: none;
  }

  .avatar {
    width: 36px;
    height: 36px;
  }
}
</style>
