import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

function downloadBlob(data, fallbackName, contentType) {
  const blob = new Blob([data], { type: contentType || 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackName || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Přidej JWT token ke každému requestu
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Globální handling chyb
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  login:          (data) => api.post('/auth/login', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword:  (data) => api.post('/auth/reset-password', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ── Zakázky ──────────────────────────────────────────────────
export const zakazkyApi = {
  list:      (params) => api.get('/zakazky', { params }),
  get:       (id)     => api.get(`/zakazky/${id}`),
  create:    (data)   => api.post('/zakazky', data),
  update:    (id, d)  => api.patch(`/zakazky/${id}`, d),
  setStav:   (id, d)  => api.patch(`/zakazky/${id}/stav`, d),
  delete:    (id)     => api.delete(`/zakazky/${id}`),
  komando:        (id, d)   => api.post(`/zakazky/${id}/komando`, d),
  dekujeme:       (id, d)   => api.post(`/zakazky/${id}/dekujeme`, d),
  removePersonal: (id, pid) => api.delete(`/zakazky/${id}/personal/${pid}`),
  archivovat: (id) => api.patch(`/zakazky/${id}/archivovat`),
  obnovit:    (id) => api.patch(`/zakazky/${id}/obnovit`),
  getPodklady: (id) => api.get(`/zakazky/${id}/podklady`, { responseType: 'text' }),
};

// ── Klienti ──────────────────────────────────────────────────
export const klientiApi = {
  list:      (params) => api.get('/klienti', { params }),
  get:       (id)     => api.get(`/klienti/${id}`),
  create:    (data)   => api.post('/klienti', data),
  update:    (id, d)  => api.patch(`/klienti/${id}`, d),
  delete:    (id)     => api.delete(`/klienti/${id}`),
  archivovat:     (id)    => api.patch(`/klienti/${id}/archivovat`),
  obnovit:        (id)    => api.patch(`/klienti/${id}/obnovit`),
  pravidelni:     ()      => api.get('/klienti/pravidelni'),
  setPravidelny:  (id, v) => api.patch(`/klienti/${id}`, { pravidelny: v }),
  import:         (rows)  => api.post('/klienti/import', { rows }),
};

// ── Follow-up úkoly ──────────────────────────────────────────
export const followupApi = {
  list:      (params) => api.get('/followup', { params }),
  create:    (data)   => api.post('/followup', data),
  update:    (id, d)  => api.patch(`/followup/${id}`, d),
  delete:    (id)     => api.delete(`/followup/${id}`),
};

// ── Nabídky ──────────────────────────────────────────────────
export const nabidkyApi = {
  list:    (params) => api.get('/nabidky', { params }),
  get:     (id)     => api.get(`/nabidky/${id}`),
  create:  (data)   => api.post('/nabidky', data),
  update:  (id, d)  => api.patch(`/nabidky/${id}`, d),
  setStav: (id, d)  => api.patch(`/nabidky/${id}/stav`, d),
  odeslat: (id, d)  => api.post(`/nabidky/${id}/odeslat`, d),
};

// ── Kalkulace ────────────────────────────────────────────────
export const kalkulaceApi = {
  list:   (params) => api.get('/kalkulace', { params }),
  get:    (id)     => api.get(`/kalkulace/${id}`),
  create: (data)   => api.post('/kalkulace', data),
};

// ── Ceník ────────────────────────────────────────────────────
export const cenikApi = {
  list:           (params) => api.get('/cenik', { params }),
  create:         (data)   => api.post('/cenik', data),
  update:         (id, d)  => api.patch(`/cenik/${id}`, d),
  delete:         (id)     => api.delete(`/cenik/${id}`),
  listKategorie:  ()       => api.get('/cenik/kategorie'),
  addKategorie:   (data)   => api.post('/cenik/kategorie', data),
  updateKategorie:(klic, d) => api.patch(`/cenik/kategorie/${klic}`, d),
  deleteKategorie:(klic, d) => api.delete(`/cenik/kategorie/${klic}`, { data: d }),
};

// ── Personál ─────────────────────────────────────────────────
export const personalApi = {
  list:     (params)  => api.get('/personal', { params }),
  get:      (id)      => api.get(`/personal/${id}`),
  create:   (data)    => api.post('/personal', data),
  update:   (id, d)   => api.patch(`/personal/${id}`, d),
  delete:   (id)      => api.delete(`/personal/${id}`),
  priradZakazku: (id, d) => api.post(`/personal/${id}/prirazeni`, d),
  archivovat: (id)    => api.patch(`/personal/${id}/archivovat`),
  obnovit:    (id)    => api.patch(`/personal/${id}/obnovit`),
  import:     (rows)  => api.post('/personal/import', { rows }),
};

// ── Dokumenty ────────────────────────────────────────────────
export const dokumentyApi = {
  list:         (params) => api.get('/dokumenty', { params }),
  upload:       (formData) => api.post('/dokumenty/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete:       (id) => api.delete(`/dokumenty/${id}`),
  move:         (id, slozka_id) => api.patch(`/dokumenty/${id}`, { slozka_id }),
  download:     async (id, fallbackName) => {
    const res = await api.get(`/dokumenty/${id}/download`, { responseType: 'blob' });
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
    const filename = decodeURIComponent(match?.[1] || match?.[2] || match?.[3] || fallbackName || `dokument-${id}`);
    downloadBlob(res.data, filename, res.headers['content-type']);
    return res;
  },
  listSlozky:   () => api.get('/dokumenty/slozky'),
  createSlozka: (data) => api.post('/dokumenty/slozky', data),
  updateSlozka: (id, data) => api.patch(`/dokumenty/slozky/${id}`, data),
  deleteSlozka: (id) => api.delete(`/dokumenty/slozky/${id}`),
};

// ── Uživatelé ────────────────────────────────────────────────
export const uzivateleApi = {
  list:   ()       => api.get('/uzivatele'),
  create: (data)   => api.post('/uzivatele', data),
  update: (id, d)  => api.patch(`/uzivatele/${id}`, d),
  delete: (id)     => api.delete(`/uzivatele/${id}`),
};

// ── Nastavení ────────────────────────────────────────────────
export const nastaveniApi = {
  get:    () => api.get('/nastaveni'),
  update: (d) => api.patch('/nastaveni', d),
};

// ── Kalendář ─────────────────────────────────────────────────
export const kalendarApi = {
  list: (params) => api.get('/kalendar', { params }),
};

// ── Reporty ──────────────────────────────────────────────────
export const reportyApi = {
  get: (params) => api.get('/reporty', { params }),
  dashboardSummary: () => api.get('/reporty/dashboard-summary'),
};

// ── Google Calendar ───────────────────────────────────────────
export const googleCalendarApi = {
  events: (params) => api.get('/google-calendar/events', { params }),
  status: ()       => api.get('/google-calendar/status'),
};

// ── Faktury ──────────────────────────────────────────────────
export const fakturyApi = {
  list:    (params) => api.get('/faktury', { params }),
  get:     (id)     => api.get(`/faktury/${id}`),
  create:  (data)   => api.post('/faktury', data),
  update:  (id, d)  => api.patch(`/faktury/${id}`, d),
  setStav: (id, d)  => api.patch(`/faktury/${id}/stav`, d),
  delete:  (id)     => api.delete(`/faktury/${id}`),
};

// ── Notifikace ───────────────────────────────────────────────
export const notifikaceApi = {
  list:       ()   => api.get('/notifikace'),
  read:       (id) => api.patch(`/notifikace/${id}/read`),
  readAll:    ()   => api.patch('/notifikace/read-all'),
  delete:     (id) => api.delete(`/notifikace/${id}`),
  deleteRead: ()   => api.delete('/notifikace'),
};

// ── Backup ───────────────────────────────────────────────────
export const backupApi = {
  info:     () => api.get('/backup/info'),
  download: async () => {
    const res = await api.get('/backup', { responseType: 'blob' });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(res.data, `crm-backup-${date}.json`, 'application/json');
    return res;
  },
};

// ── Error log ────────────────────────────────────────────────
export const errorLogApi = {
  list:           (params) => api.get('/error-log', { params }),
  setResolved:    (id, resolved) => api.patch(`/error-log/${id}/resolve`, { resolved }),
  deleteResolved: () => api.delete('/error-log/resolved'),
};

// ── Production / Výrobní list ─────────────────────────────────
export const productionApi = {
  calculate: (zakazkaId) => api.get(`/production/calculate/${zakazkaId}`),
  sheet:     (zakazkaId) => api.get(`/production/sheet/${zakazkaId}`),
};

// ── Proposals (admin, auth required) ─────────────────────────
export const proposalsApi = {
  list:           (params)          => api.get('/proposals', { params }),
  get:            (id)              => api.get(`/proposals/${id}`),
  create:         (data)            => api.post('/proposals', data),
  update:         (id, d)           => api.patch(`/proposals/${id}`, d),
  delete:         (id)              => api.delete(`/proposals/${id}`),
  send:           (id, d)           => api.post(`/proposals/${id}/send`, d),
  unlock:         (id)              => api.patch(`/proposals/${id}/unlock`),
  log:            (id)              => api.get(`/proposals/${id}/log`),
  // sekce
  addSekce:       (id, d)           => api.post(`/proposals/${id}/sekce`, d),
  updateSekce:    (id, sid, d)      => api.patch(`/proposals/${id}/sekce/${sid}`, d),
  deleteSekce:    (id, sid)         => api.delete(`/proposals/${id}/sekce/${sid}`),
  // polozky
  addPolozka:     (sekceId, d)      => api.post(`/proposals/sekce/${sekceId}/polozky`, d),
  updatePolozka:  (pid, d)          => api.patch(`/proposals/polozky/${pid}`, d),
  deletePolozka:  (pid)             => api.delete(`/proposals/polozky/${pid}`),
};

// ── Public Proposals (no auth, token-based) ───────────────────
const pubApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

export const publicProposalApi = {
  get:     (token)            => pubApi.get(`/pub/proposals/${token}`),
  select:  (token, d)         => pubApi.patch(`/pub/proposals/${token}/select`, d),
  note:    (token, d)         => pubApi.patch(`/pub/proposals/${token}/note`, d),
  confirm: (token, d)         => pubApi.post(`/pub/proposals/${token}/confirm`, d),
};

// ── Kapacity ─────────────────────────────────────────────────
export const kapacityApi = {
  list: (params) => api.get('/kapacity', { params }),
};

// ── Archiv ───────────────────────────────────────────────────
export const archivApi = {
  list: () => api.get('/archiv'),
};

// ── E-mail modul ─────────────────────────────────────────────
export const emailApi = {
  status:    ()               => api.get('/email/status'),
  folders:   ()               => api.get('/email/folders'),
  messages:  (params)         => api.get('/email/messages', { params }),
  getMessage:(uid, folder)    => api.get(`/email/messages/${uid}`, { params: { folder } }),
  markSeen:  (uid, seen, folder) => api.patch(`/email/messages/${uid}/seen`, { seen }, { params: { folder } }),
  markFlagged:(uid, flagged, folder) => api.patch(`/email/messages/${uid}/flagged`, { flagged }, { params: { folder } }),
  delete:    (uid, folder, permanent) => api.delete(`/email/messages/${uid}`, { params: { folder, permanent } }),
  move:      (uid, folder, target) => api.post(`/email/messages/${uid}/move`, { target }, { params: { folder } }),
  send:           (data)                  => api.post('/email/send', data),
  smtpTest:       ()                      => api.post('/email/smtp-test'),
  extractData:    (uid, folder)           => api.get(`/email/messages/${uid}/extract`, { params: { folder } }),
  createZakazka:  (uid, folder, data)     => api.post(`/email/messages/${uid}/zakazka`, data || {}, { params: { folder } }),
  // Přílohy
  getAttachments: (uid, folder)           => api.get(`/email/messages/${uid}/attachments`, { params: { folder } }),
  saveAttachment: (uid, idx, folder, data)=> api.post(`/email/messages/${uid}/attachments/${idx}/save`, data, { params: { folder } }),
  // Followup
  createFollowup: (uid, data)             => api.post(`/email/messages/${uid}/followup`, data),
  // Propojení se zakázkou
  linkZakazka:    (uid, folder, zakazka_id) => api.post(`/email/messages/${uid}/link`, { zakazka_id }, { params: { folder } }),
  unlinkZakazka:  (uid, zakazka_id)       => api.delete(`/email/messages/${uid}/link`, { params: { zakazka_id } }),
  getLinks:       (zakazka_id)            => api.get('/email/links', { params: { zakazka_id } }),
  // Kontrola inboxu
  checkInbox:     (folder)                => api.post('/email/check-inbox', { folder }),
  // Šablony odpovědí
  listSablony:    ()                      => api.get('/email/sablony'),
  createSablona:  (data)                  => api.post('/email/sablony', data),
  updateSablona:  (id, data)              => api.patch(`/email/sablony/${id}`, data),
  deleteSablona:  (id)                    => api.delete(`/email/sablony/${id}`),
};

// ── Šablony zakázek ──────────────────────────────────────────
export const sablonyApi = {
  list:   ()       => api.get('/sablony'),
  get:    (id)     => api.get(`/sablony/${id}`),
  create: (data)   => api.post('/sablony', data),
  update: (id, d)  => api.patch(`/sablony/${id}`, d),
  delete: (id)     => api.delete(`/sablony/${id}`),
};

export default api;
