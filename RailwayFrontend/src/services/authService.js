import api from '@/api/axios';
import {
  clearSession,
  persistSession,
  persistUser,
} from '@/utils/authSession';

const extractMessage = (error, fallback) =>
  error.response?.data?.detail ||
  error.message ||
  fallback;

export const authService = {
  async login(email, password) {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      persistSession(response.data);
      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(error, 'Login failed')
      );
    }
  },

  async adminLogin(email, password) {
    try {
      const response = await api.post(
        '/auth/admin/login',
        {
          email,
          password,
        }
      );

      persistSession(response.data);
      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(error, 'Admin login failed')
      );
    }
  },

  async staffLogin(email, password) {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      if (!response.data?.user?.staff) {
        clearSession();
        throw new Error('Staff profile required');
      }

      persistSession(response.data);
      return response.data;
    } catch (error) {
      // Do not leave a normal USER session behind after a failed
      // staff-portal login attempt.
      clearSession();

      if (error instanceof Error && !error.response) {
        throw error;
      }

      throw new Error(
        extractMessage(error, 'Staff login failed')
      );
    }
  },

  async register(userData) {
    try {
      const response = await api.post('/auth/register', {
        full_name: userData.full_name,
        email: userData.email,
        phone: userData.phone,
        password: userData.password,
      });

      // Registration creates USER only in the backend.
      if (
        response.data.message ===
        'Registration successful'
      ) {
        return await this.login(
          userData.email,
          userData.password
        );
      }

      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(error, 'Registration failed')
      );
    }
  },

  async getCurrentUser() {
    try {
      const response = await api.get('/auth/me');
      persistUser(response.data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async logout() {
    clearSession();
  },

  async refreshToken() {
    return null;
  },
};
