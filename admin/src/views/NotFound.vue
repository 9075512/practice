<template>
  <div class="not-found">
    <div class="code">404</div>
    <h2>页面不存在</h2>
    <p>你访问的地址可能已被移动或删除。</p>
    <el-button type="primary" @click="$router.replace('/banks')">返回题库管理</el-button>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #f4f6fb;
}

.code {
  font-size: 96px;
  font-weight: 800;
  letter-spacing: -4px;
  color: #dbeafe;
  line-height: 1;
}

h2 {
  margin: 0;
  font-size: 22px;
  color: #0f172a;
}

p {
  margin: 0 0 14px;
  color: #94a3b8;
  font-size: 13px;
}
</style>
