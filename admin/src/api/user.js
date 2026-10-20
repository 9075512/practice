import http from './http.js';

export const listUsers = (params) => http.get('/users', { params });
export const getUser = (id) => http.get(`/users/${id}`);
export const updateUser = (id, data) => http.put(`/users/${id}`, data);
export const setUserStatus = (id, status) => http.post(`/users/${id}/status`, { status });
export const setUserVip = (id, isVip) => http.post(`/users/${id}/vip`, { isVip });
