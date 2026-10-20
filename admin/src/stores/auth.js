import { reactive } from 'vue';

const STORAGE_KEY = 'practice_admin_auth';

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

const saved = readStorage();

export const auth = reactive({
  token: saved && saved.token ? saved.token : '',
  admin: saved && saved.admin ? saved.admin : null
});

export function setAuth(payload) {
  auth.token = payload.token;
  auth.admin = payload.admin;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: payload.token, admin: payload.admin }));
}

export function clearAuth() {
  auth.token = '';
  auth.admin = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function isLoggedIn() {
  return !!auth.token;
}
