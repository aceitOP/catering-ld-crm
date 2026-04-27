import { api, downloadBlob } from './core';

export const uzivateleApi = {
  list: () => api.get('/uzivatele'),
  create: (data) => api.post('/uzivatele', data),
  update: (id, d) => api.patch(`/uzivatele/${id}`, d),
  delete: (id) => api.delete(`/uzivatele/${id}`),
};

export const nastaveniApi = {
  get: () => api.get('/nastaveni'),
  update: (d) => api.patch('/nastaveni', d),
  publicBranding: () => api.get('/nastaveni/public-branding'),
  setupStatus: () => api.get('/nastaveni/setup-status'),
  submitSetupWizard: (d) => api.post('/nastaveni/setup-wizard', d),
};

export const backupApi = {
  info: () => api.get('/backup/info'),
  run: () => api.post('/backup/run'),
  listFiles: () => api.get('/backup/files'),
  download: async () => {
    const res = await api.get('/backup', { responseType: 'blob' });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(res.data, `crm-backup-${date}.json`, 'application/json');
    return res;
  },
  downloadFile: async (name) => {
    const res = await api.get(`/backup/files/${encodeURIComponent(name)}`, { responseType: 'blob' });
    downloadBlob(res.data, name, 'application/json');
    return res;
  },
};

export const errorLogApi = {
  report: (data) => api.post('/error-log/report', data),
  list: (params) => api.get('/error-log', { params }),
  setResolved: (id, resolved) => api.patch(`/error-log/${id}/resolve`, { resolved }),
  deleteResolved: () => api.delete('/error-log/resolved'),
};

export const loginLogApi = {
  list: (params) => api.get('/login-log', { params }),
  deleteOld: (days) => api.delete('/login-log/old', { params: { days } }),
};

export const notificationRulesApi = {
  list: () => api.get('/notification-rules'),
  update: (id, data) => api.patch(`/notification-rules/${id}`, data),
  dispatchLog: (limit = 100) => api.get('/notification-rules/dispatch-log', { params: { limit } }),
  runSweep: () => api.post('/notification-rules/run-sweep'),
};
