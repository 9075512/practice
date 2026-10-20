import http from './http.js';

export const listCardBatches = () => http.get('/card-batches');
export const createCardBatch = (data) => http.post('/card-batches', data);
export const getCardBatch = (id) => http.get(`/card-batches/${id}`);
export const listBatchCards = (id, params) => http.get(`/card-batches/${id}/cards`, { params });
export const voidCard = (id, reason) => http.post(`/cards/${id}/void`, { reason });
export const voidBatch = (id, reason) => http.post(`/card-batches/${id}/void`, { reason });
export const listVipMembers = (params) => http.get('/vip-members', { params });
