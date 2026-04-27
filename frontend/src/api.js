import { api, pubApi, downloadBlob } from './api/core';
export { authApi } from './api/auth';
export { zakazkyApi } from './api/zakazky';
export { venuesApi } from './api/venues';
export {
  uzivateleApi,
  nastaveniApi,
  backupApi,
  errorLogApi,
  loginLogApi,
  notificationRulesApi,
} from './api/admin';

export const klientiApi = {
  list: (params) => api.get('/klienti', { params }),
  get: (id) => api.get(`/klienti/${id}`),
  create: (data) => api.post('/klienti', data),
  update: (id, d) => api.patch(`/klienti/${id}`, d),
  delete: (id) => api.delete(`/klienti/${id}`),
  archivovat: (id) => api.patch(`/klienti/${id}/archivovat`),
  obnovit: (id) => api.patch(`/klienti/${id}/obnovit`),
  pravidelni: () => api.get('/klienti/pravidelni'),
  setPravidelny: (id, v) => api.patch(`/klienti/${id}`, { pravidelny: v }),
  import: (rows) => api.post('/klienti/import', { rows }),
};

export const followupApi = {
  list: (params) => api.get('/followup', { params }),
  create: (data) => api.post('/followup', data),
  update: (id, d) => api.patch(`/followup/${id}`, d),
  delete: (id) => api.delete(`/followup/${id}`),
};

export const nabidkyApi = {
  list: (params) => api.get('/nabidky', { params }),
  get: (id) => api.get(`/nabidky/${id}`),
  create: (data) => api.post('/nabidky', data),
  update: (id, d) => api.patch(`/nabidky/${id}`, d),
  setStav: (id, d) => api.patch(`/nabidky/${id}/stav`, d),
  odeslat: (id, d) => api.post(`/nabidky/${id}/odeslat`, d),
};

export const kalkulaceApi = {
  list: (params) => api.get('/kalkulace', { params }),
  get: (id) => api.get(`/kalkulace/${id}`),
  create: (data) => api.post('/kalkulace', data),
};

export const ingredientsApi = {
  list: (params) => api.get('/ingredients', { params }),
  get: (id) => api.get(`/ingredients/${id}`),
  create: (data) => api.post('/ingredients', data),
  update: (id, data) => api.patch(`/ingredients/${id}`, data),
  addPriceHistory: (id, data) => api.post(`/ingredients/${id}/price-history`, data),
};

export const recipesApi = {
  list: (params) => api.get('/recipes', { params }),
  get: (id) => api.get(`/recipes/${id}`),
  create: (data) => api.post('/recipes', data),
  update: (id, data) => api.patch(`/recipes/${id}`, data),
  createVersion: (id, data) => api.post(`/recipes/${id}/versions`, data),
  getVersion: (id, versionId) => api.get(`/recipes/${id}/versions/${versionId}`),
  updateVersion: (id, versionId, data) => api.patch(`/recipes/${id}/versions/${versionId}`, data),
  activateVersion: (id, versionId) => api.post(`/recipes/${id}/versions/${versionId}/activate`),
  addItem: (id, versionId, data) => api.post(`/recipes/${id}/versions/${versionId}/items`, data),
  addStep: (id, versionId, data) => api.post(`/recipes/${id}/versions/${versionId}/steps`, data),
  cost: (id, params) => api.get(`/recipes/${id}/cost`, { params }),
  printCard: (id, params) => api.get(`/recipes/${id}/print-card`, { params, responseType: 'text' }),
};

export const cenikApi = {
  list: (params) => api.get('/cenik', { params }),
  create: (data) => api.post('/cenik', data),
  update: (id, d) => api.patch(`/cenik/${id}`, d),
  delete: (id) => api.delete(`/cenik/${id}`),
  listKategorie: () => api.get('/cenik/kategorie'),
  addKategorie: (data) => api.post('/cenik/kategorie', data),
  updateKategorie: (klic, d) => api.patch(`/cenik/kategorie/${klic}`, d),
  deleteKategorie: (klic, d) => api.delete(`/cenik/kategorie/${klic}`, { data: d }),
};

export const personalApi = {
  list: (params) => api.get('/personal', { params }),
  get: (id) => api.get(`/personal/${id}`),
  create: (data) => api.post('/personal', data),
  update: (id, d) => api.patch(`/personal/${id}`, d),
  delete: (id) => api.delete(`/personal/${id}`),
  priradZakazku: (id, d) => api.post(`/personal/${id}/prirazeni`, d),
  archivovat: (id) => api.patch(`/personal/${id}/archivovat`),
  obnovit: (id) => api.patch(`/personal/${id}/obnovit`),
  import: (rows) => api.post('/personal/import', { rows }),
};

export const dokumentyApi = {
  list: (params) => api.get('/dokumenty', { params }),
  upload: (formData) => api.post('/dokumenty/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/dokumenty/${id}`),
  move: (id, slozka_id) => api.patch(`/dokumenty/${id}`, { slozka_id }),
  download: async (id, fallbackName) => {
    const res = await api.get(`/dokumenty/${id}/download`, { responseType: 'blob' });
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"([^\"]+)\"|filename=([^;]+)/i);
    const filename = decodeURIComponent(match?.[1] || match?.[2] || match?.[3] || fallbackName || `dokument-${id}`);
    downloadBlob(res.data, filename, res.headers['content-type']);
    return res;
  },
  listSlozky: () => api.get('/dokumenty/slozky'),
  createSlozka: (data) => api.post('/dokumenty/slozky', data),
  updateSlozka: (id, data) => api.patch(`/dokumenty/slozky/${id}`, data),
  deleteSlozka: (id) => api.delete(`/dokumenty/slozky/${id}`),
};

export const kalendarApi = {
  list: (params) => api.get('/kalendar', { params }),
};

export const reportyApi = {
  get: (params) => api.get('/reporty', { params }),
  dashboardSummary: () => api.get('/reporty/dashboard-summary'),
};

export const googleCalendarApi = {
  events: (params) => api.get('/google-calendar/events', { params }),
  status: () => api.get('/google-calendar/status'),
};

export const fakturyApi = {
  list: (params) => api.get('/faktury', { params }),
  get: (id) => api.get(`/faktury/${id}`),
  create: (data) => api.post('/faktury', data),
  update: (id, d) => api.patch(`/faktury/${id}`, d),
  setStav: (id, d) => api.patch(`/faktury/${id}/stav`, d),
  delete: (id) => api.delete(`/faktury/${id}`),
};

export const notifikaceApi = {
  list: () => api.get('/notifikace'),
  read: (id) => api.patch(`/notifikace/${id}/read`),
  readAll: () => api.patch('/notifikace/read-all'),
  delete: (id) => api.delete(`/notifikace/${id}`),
  deleteRead: () => api.delete('/notifikace'),
};

export const productionApi = {
  calculate: (zakazkaId) => api.get(`/production/calculate/${zakazkaId}`),
  sheet: (zakazkaId) => api.get(`/production/sheet/${zakazkaId}`),
  sheetV2: (zakazkaId) => api.get(`/production/sheet-v2/${zakazkaId}`),
};

export const proposalsApi = {
  list: (params) => api.get('/proposals', { params }),
  get: (id) => api.get(`/proposals/${id}`),
  create: (data) => api.post('/proposals', data),
  update: (id, d) => api.patch(`/proposals/${id}`, d),
  delete: (id) => api.delete(`/proposals/${id}`),
  send: (id, d) => api.post(`/proposals/${id}/send`, d),
  unlock: (id) => api.patch(`/proposals/${id}/unlock`),
  log: (id) => api.get(`/proposals/${id}/log`),
  addSekce: (id, d) => api.post(`/proposals/${id}/sekce`, d),
  updateSekce: (id, sid, d) => api.patch(`/proposals/${id}/sekce/${sid}`, d),
  deleteSekce: (id, sid) => api.delete(`/proposals/${id}/sekce/${sid}`),
  addPolozka: (sekceId, d) => api.post(`/proposals/sekce/${sekceId}/polozky`, d),
  updatePolozka: (pid, d) => api.patch(`/proposals/polozky/${pid}`, d),
  deletePolozka: (pid) => api.delete(`/proposals/polozky/${pid}`),
};

export const publicProposalApi = {
  get: (token) => pubApi.get(`/pub/proposals/${token}`),
  select: (token, d) => pubApi.patch(`/pub/proposals/${token}/select`, d),
  note: (token, d) => pubApi.patch(`/pub/proposals/${token}/note`, d),
  confirm: (token, d) => pubApi.post(`/pub/proposals/${token}/confirm`, d),
};

export const kapacityApi = {
  list: (params) => api.get('/kapacity', { params }),
};

export const archivApi = {
  list: () => api.get('/archiv'),
};

export const emailApi = {
  status: () => api.get('/email/status'),
  folders: () => api.get('/email/folders'),
  messages: (params) => api.get('/email/messages', { params }),
  getMessage: (uid, folder) => api.get(`/email/messages/${uid}`, { params: { folder } }),
  markSeen: (uid, seen, folder) => api.patch(`/email/messages/${uid}/seen`, { seen }, { params: { folder } }),
  markFlagged: (uid, flagged, folder) => api.patch(`/email/messages/${uid}/flagged`, { flagged }, { params: { folder } }),
  delete: (uid, folder, permanent) => api.delete(`/email/messages/${uid}`, { params: { folder, permanent } }),
  move: (uid, folder, target) => api.post(`/email/messages/${uid}/move`, { target }, { params: { folder } }),
  send: (data) => api.post('/email/send', data),
  smtpTest: () => api.post('/email/smtp-test'),
  extractData: (uid, folder) => api.get(`/email/messages/${uid}/extract`, { params: { folder } }),
  createZakazka: (uid, folder, data) => api.post(`/email/messages/${uid}/zakazka`, data || {}, { params: { folder } }),
  getAttachments: (uid, folder) => api.get(`/email/messages/${uid}/attachments`, { params: { folder } }),
  saveAttachment: (uid, idx, folder, data) => api.post(`/email/messages/${uid}/attachments/${idx}/save`, data, { params: { folder } }),
  createFollowup: (uid, data) => api.post(`/email/messages/${uid}/followup`, data),
  linkZakazka: (uid, folder, zakazka_id) => api.post(`/email/messages/${uid}/link`, { zakazka_id }, { params: { folder } }),
  unlinkZakazka: (uid, zakazka_id) => api.delete(`/email/messages/${uid}/link`, { params: { zakazka_id } }),
  getLinks: (zakazka_id) => api.get('/email/links', { params: { zakazka_id } }),
  checkInbox: (folder) => api.post('/email/check-inbox', { folder }),
  listSablony: () => api.get('/email/sablony'),
  createSablona: (data) => api.post('/email/sablony', data),
  updateSablona: (id, data) => api.patch(`/email/sablony/${id}`, data),
  deleteSablona: (id) => api.delete(`/email/sablony/${id}`),
};

export const sablonyApi = {
  list: () => api.get('/sablony'),
  get: (id) => api.get(`/sablony/${id}`),
  create: (data) => api.post('/sablony', data),
  update: (id, d) => api.patch(`/sablony/${id}`, d),
  delete: (id) => api.delete(`/sablony/${id}`),
};

export default api;
