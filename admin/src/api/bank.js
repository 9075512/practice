import http from './http.js';

export const listBanks = (params) => http.get('/banks', { params });
export const bankOptions = () => http.get('/banks/options');
export const createBank = (data) => http.post('/banks', data);
export const updateBank = (id, data) => http.put(`/banks/${id}`, data);
export const deleteBank = (id) => http.delete(`/banks/${id}`);
