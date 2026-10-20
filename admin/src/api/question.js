import http from './http.js';

export const listQuestions = (params) => http.get('/questions', { params });
export const getQuestion = (id) => http.get(`/questions/${id}`);
export const updateQuestion = (id, data) => http.put(`/questions/${id}`, data);
export const deleteQuestion = (id) => http.delete(`/questions/${id}`);
