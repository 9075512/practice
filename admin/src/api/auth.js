import http from './http.js';

export const login = (data) => http.post('/auth/login', data);
export const getProfile = () => http.get('/auth/profile');
export const logout = () => http.post('/auth/logout');
