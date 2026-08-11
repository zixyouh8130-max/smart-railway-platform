// api/auth.js
import api from './axios';  // Use your existing axios instance

const authApi = {
  // Admin login
  login: async (credentials) => {
    try {
      const response = await api.post('/auth/admin/login', credentials);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get current user info
  getCurrentUser: async () => {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Refresh token
  refreshToken: async (refreshToken) => {
    try {
      const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Logout
  logout: async () => {
    try {
      const response = await api.post('/auth/logout');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Change password
  changePassword: async (passwordData) => {
    try {
      const response = await api.post('/auth/change-password', passwordData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default authApi;