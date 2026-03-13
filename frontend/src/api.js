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
  komando:   (id, d)  => api.post(`/zakazky/${id}/komando`, d),
  dekujeme:  (id, d)  => api.post(`/zakazky/${id}/dekujeme`, d),
};

// ── Klienti ──────────────────────────────────────────────────
export const klientiApi = {
  list:   (params) => api.get('/klienti', { params }),
  get:    (id)     => api.get(`/klienti/${id}`),
  create: (data)   => api.post('/klienti', data),
  update: (id, d)  => api.patch(`/klienti/${id}`, d),
  delete: (id)     => api.delete(`/klienti/${id}`),
};

// ── Nabídky ──────────────────────────────────────────────────
export const nabidkyApi = {
  list:    (params) => api.get('/nabidky', { params }),
  get:     (id)     => api.get(`/nabidky/${id}`),
  create:  (data)   => api.post('/nabidky', data),
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

export default api;
