// api/auth.js
import api from './axios';

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

  // Refresh access token; backend rotates the refresh token as well.
  refreshToken: async (refreshToken) => {
    try {
      const response = await api.post('/auth/refresh', {
        refresh_token: refreshToken,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Stateless logout acknowledgement. The caller should clear local tokens.
  logout: async () => {
    try {
      const response = await api.post('/auth/logout');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // passwordData = { current_password, new_password }
  changePassword: async (passwordData) => {
    try {
      const response = await api.post('/auth/change-password', passwordData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Admin: list all users
  getAllUsers: async () => {
    try {
      const response = await api.get('/auth/admin/users');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Super admin: JSON body now matches the backend request model.
  updateUserRole: async (userId, newRole) => {
    try {
      const response = await api.put(`/auth/admin/users/${userId}/role`, {
        new_role: newRole,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },
};

export default authApi;
