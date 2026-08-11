// RailwayFrontend/src/api/axios.js

import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },

  // AI/chatbot requests may take longer
  timeout: 600000,
});


// ============================================================
// REQUEST INTERCEPTOR
// ============================================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },

  (error) => {
    return Promise.reject(error);
  }
);


// ============================================================
// RESPONSE INTERCEPTOR
// ============================================================

api.interceptors.response.use(
  (response) => response,

  (error) => {
    // Handle authentication errors
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;

      const isLoginPage =
        currentPath === '/login' ||
        currentPath === '/admin/login';

      const isAdminPage =
        currentPath.startsWith('/admin');

      // Normal users are redirected to login.
      // Admin pages handle authentication errors separately.
      if (!isLoginPage && !isAdminPage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        window.location.href = '/login';
      }
    }

    // Log API errors during development
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
