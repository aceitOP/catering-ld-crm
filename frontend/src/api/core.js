import axios from 'axios';
import { safeGetItem, safeRemoveItem } from '../utils/storage';

export const CLIENT_PORTAL_TOKEN_KEY = 'client_portal_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

export const pubApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

export const clientApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

export function downloadBlob(data, fallbackName, contentType) {
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

api.interceptors.request.use((config) => {
  const token = safeGetItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      safeRemoveItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

clientApi.interceptors.request.use((config) => {
  const token = safeGetItem(CLIENT_PORTAL_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

clientApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      safeRemoveItem(CLIENT_PORTAL_TOKEN_KEY);
      if (window.location.pathname.startsWith('/portal')) {
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(err);
  }
);
