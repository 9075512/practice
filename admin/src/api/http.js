import axios from 'axios';
import { ElMessage } from 'element-plus';
import { auth, clearAuth } from '../stores/auth.js';
import router from '../router/index.js';

const http = axios.create({
  baseURL: '/api/admin',
  timeout: 20000
});

http.interceptors.request.use((config) => {
  if (auth.token) {
    config.headers['X-Admin-Token'] = auth.token;
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && body.code === 0) return body.data;
    const message = (body && body.message) || '请求失败';
    ElMessage.error(message);
    return Promise.reject(new Error(message));
  },
  (error) => {
    const status = error.response && error.response.status;
    const message = (error.response && error.response.data && error.response.data.message) || '网络异常，请稍后重试';
    if (status === 401) {
      clearAuth();
      if (router.currentRoute.value.path !== '/login') {
        router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
      }
    }
    ElMessage.error(message);
    return Promise.reject(error);
  }
);

export default http;
