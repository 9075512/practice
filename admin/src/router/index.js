import { createRouter, createWebHistory } from 'vue-router';
import { auth } from '../stores/auth.js';

const routes = [
  {
    path: '/login',
    component: () => import('../views/login/index.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/',
    component: () => import('../layout/index.vue'),
    redirect: '/banks',
    children: [
      {
        path: 'banks',
        component: () => import('../views/bank/index.vue'),
        meta: { title: '题库管理', subtitle: '导入 Excel、维护题库与题量' }
      },
      {
        path: 'questions',
        component: () => import('../views/question/index.vue'),
        meta: { title: '题目管理', subtitle: '按题库和题型筛选、核对与修改' }
      },
      {
        path: 'cards',
        component: () => import('../views/card/index.vue'),
        meta: { title: '卡密管理', subtitle: '生成卡密、管理库存与永久 VIP 会员' }
      },
      {
        path: 'users',
        component: () => import('../views/user/index.vue'),
        meta: { title: '用户管理', subtitle: '查看用户、设置身份、启用与禁用账号' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('../views/NotFound.vue'),
    meta: { public: true, title: '页面不存在' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  if (to.meta.public) {
    if (to.path === '/login' && auth.token) return '/banks';
    return true;
  }
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
