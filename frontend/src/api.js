import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

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
};

// ── Klienti ──────────────────────────────────────────────────
export const klientiApi = {
  list:      (params) => api.get('/klienti', { params }),
  get:       (id)     => api.get(`/klienti/${id}`),
  create:    (data)   => api.post('/klienti', data),
  update:    (id, d)  => api.patch(`/klienti/${id}`, d),
  delete:    (id)     => api.delete(`/klienti/${id}`),
  archivovat: (id)    => api.patch(`/klienti/${id}/archivovat`),
  obnovit:    (id)    => api.patch(`/klienti/${id}/obnovit`),
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
};

// ── Dokumenty ────────────────────────────────────────────────
export const dokumentyApi = {
  list:   (params) => api.get('/dokumenty', { params }),
  upload: (formData) => api.post('/dokumenty/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/dokumenty/${id}`),
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

// ── Archiv ───────────────────────────────────────────────────
export const archivApi = {
  list: () => api.get('/archiv'),
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
