import http from './http.js';
import { auth } from '../stores/auth.js';

export const previewImport = (data) => http.post('/import/preview', data);
export const commitImport = (data) => http.post('/import/commit', data);

export async function downloadTemplate() {
  const response = await fetch('/api/admin/import/template', {
    headers: { 'X-Admin-Token': auth.token }
  });
  if (!response.ok) throw new Error('模板下载失败，请确认后端服务是否正常');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '背题题库导入模板.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
