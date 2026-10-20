<template>
  <div class="login-page">
    <section class="login-left">
      <div class="glow glow-1"></div>
      <div class="glow glow-2"></div>

      <div class="brand">
        <div class="brand-mark">背</div>
        <div>
          <div class="brand-name">背题库</div>
          <div class="brand-sub">RECITE ADMIN</div>
        </div>
      </div>

      <div class="hero">
        <h2>导入题库<br />专注背题这一件事</h2>
        <p>一个 Excel 搞定题目录入，按题库与题型翻卡背诵，没有章节、练习记录和统计报表的干扰。</p>
      </div>

      <ul class="features">
        <li><span>01</span> 标准模板导入，自动识别题型与答案</li>
        <li><span>02</span> 只按题库与题型两级筛选</li>
        <li><span>03</span> 移动端翻卡背诵，答案随点随看</li>
      </ul>

      <div class="quote">
        <div class="quote-num">3</div>
        <div class="quote-text">个页面完成全部流程<br />导入 · 筛选 · 背诵</div>
      </div>
    </section>

    <section class="login-right">
      <div class="login-card">
        <div class="login-head">
          <h1>登录管理后台</h1>
          <p>导入题目、维护题库内容</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
          <el-form-item label="管理员账号" prop="username">
            <el-input v-model="form.username" size="large" placeholder="请输入账号" :prefix-icon="User" />
          </el-form-item>
          <el-form-item label="登录密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              type="password"
              show-password
              placeholder="请输入密码"
              :prefix-icon="Lock"
            />
          </el-form-item>

          <el-button type="primary" size="large" class="submit" :loading="loading" @click="submit">
            进入后台
          </el-button>
        </el-form>

        <div class="demo-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>演示账号：<b>admin</b> / <b>123456</b></span>
        </div>

        <div class="login-foot">背题库 · 管理后台</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { login } from '../../api/auth.js';
import { setAuth } from '../../stores/auth.js';

const router = useRouter();
const route = useRoute();
const formRef = ref(null);
const loading = ref(false);

const form = reactive({
  username: 'admin',
  password: '123456'
});

const rules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入登录密码', trigger: 'blur' }]
};

async function submit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    const data = await login({ username: form.username.trim(), password: form.password });
    setAuth(data);
    ElMessage.success(`欢迎回来，${data.admin.displayName || data.admin.username}`);
    const redirect = route.query.redirect ? String(route.query.redirect) : '/banks';
    router.replace(redirect);
  } catch (_) {
    /* 错误提示已由请求层处理 */
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  background: #f8fafc;
}

.login-left {
  position: relative;
  overflow: hidden;
  background: linear-gradient(150deg, #1e40af 0%, #2563eb 45%, #3b82f6 100%);
  color: #fff;
  padding: 46px 60px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  background: rgba(255, 255, 255, 0.08);
}

.glow-1 {
  width: 460px;
  height: 460px;
  right: -160px;
  top: -140px;
}

.glow-2 {
  width: 320px;
  height: 320px;
  left: -120px;
  bottom: -100px;
  background: rgba(255, 255, 255, 0.06);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.26);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  font-weight: 700;
}

.brand-name {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0.6px;
}

.brand-sub {
  font-size: 9px;
  letter-spacing: 1.8px;
  opacity: 0.66;
  margin-top: 3px;
}

.hero {
  position: relative;
  z-index: 1;
  margin-top: -20px;
}

.hero h2 {
  font-size: 40px;
  line-height: 1.28;
  font-weight: 650;
  letter-spacing: -0.8px;
  margin: 0 0 18px;
}

.hero p {
  max-width: 420px;
  font-size: 14px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.76);
  margin: 0;
}

.features {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}

.features span {
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.48);
}

.quote {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}

.quote-num {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}

.quote-text {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.62);
}

.login-right {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.login-card {
  width: 100%;
  max-width: 396px;
}

.login-head h1 {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.6px;
  margin: 0;
  color: #0f172a;
}

.login-head p {
  color: #64748b;
  font-size: 13px;
  margin: 9px 0 30px;
}

.submit {
  width: 100%;
  margin-top: 6px;
  height: 44px;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.demo-tip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 18px;
  padding: 10px 13px;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 9px;
  color: #475569;
  font-size: 12px;
}

.demo-tip b {
  color: #1d4ed8;
}

.login-foot {
  margin-top: 28px;
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .login-left {
    display: none;
  }
}

@media (max-width: 480px) {
  .login-right {
    padding: 24px 20px;
    align-items: flex-start;
    padding-top: 12vh;
  }

  .login-head h1 {
    font-size: 24px;
  }

  .login-head p {
    margin-bottom: 24px;
  }
}
</style>
