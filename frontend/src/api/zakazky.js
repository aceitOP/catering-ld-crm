import { api, downloadBlob } from './core';

export const zakazkyApi = {
  list: (params) => api.get('/zakazky', { params }),
  get: (id) => api.get(`/zakazky/${id}`),
  create: (data) => api.post('/zakazky', data),
  update: (id, d) => api.patch(`/zakazky/${id}`, d),
  setStav: (id, d) => api.patch(`/zakazky/${id}/stav`, d),
  delete: (id) => api.delete(`/zakazky/${id}`),
  komando: (id, d) => api.post(`/zakazky/${id}/komando`, d),
  dekujeme: (id, d) => api.post(`/zakazky/${id}/dekujeme`, d),
  removePersonal: (id, pid) => api.delete(`/zakazky/${id}/personal/${pid}`),
  archivovat: (id) => api.patch(`/zakazky/${id}/archivovat`),
  obnovit: (id) => api.patch(`/zakazky/${id}/obnovit`),
  getPodklady: (id) => api.get(`/zakazky/${id}/podklady`, { responseType: 'text' }),
  getDodaciList: (id) => api.get(`/zakazky/${id}/dodaci-list`, { responseType: 'text' }),
  downloadDodaciListPdf: async (id, fallbackName) => {
    const res = await api.get(`/zakazky/${id}/dodaci-list`, { params: { format: 'pdf' }, responseType: 'blob' });
    downloadBlob(res.data, fallbackName || `dodaci-list-${id}.pdf`, res.headers['content-type']);
    return res;
  },
  getIngredientSummary: (id) => api.get(`/zakazky/${id}/ingredient-summary`),
  getVenueBrief: (id) => api.get(`/zakazky/${id}/venue-brief`),
  createVenueSnapshot: (id) => api.post(`/zakazky/${id}/venue-snapshot`),
  submitVenueDebrief: (id, data) => api.post(`/zakazky/${id}/venue-debrief`, data),
};
