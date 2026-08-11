// api/axios.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
console.log('API Base URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 600000, 
});

// Request interceptor to add token
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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if:
    // 1. It's a 401 error
    // 2. The user is NOT already on the login page
    // 3. The request is not from admin pages (admin pages handle errors differently)
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isLoginPage = currentPath === '/login' || currentPath === '/admin/login';
      const isAdminPage = currentPath.startsWith('/admin');
      
      if (!isLoginPage && !isAdminPage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;