import axios from 'axios';
import {
  clearSession,
  getStoredToken,
} from '@/utils/authSession';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 600000,
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;

      clearSession();

      // Public passenger pages stay public. A failed API request on a
      // public page must not force a guest to log in.
      if (currentPath.startsWith('/admin')) {
        if (currentPath !== '/admin/login') {
          window.location.assign('/admin/login');
        }
      } else if (currentPath.startsWith('/train-rider')) {
        if (currentPath !== '/train-rider/login') {
          window.location.assign('/train-rider/login');
        }
      }
    }

    if (import.meta.env.DEV) {
      console.error(
        'API Error:',
        error.response?.data || error.message
      );
    }

    return Promise.reject(error);
  }
);

export default api;
