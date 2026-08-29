import api from '@/api/axios';

import {
  clearSession,
  getStoredRefreshToken,
  persistSession,
  persistTokens,
  persistUser,
} from '@/utils/authSession';

const extractMessage = (error, fallback) =>
  error.response?.data?.detail ||
  error.message ||
  fallback;

export const authService = {
  async login(email, password) {
    try {
      const response = await api.post(
        '/auth/login',
        {
          email,
          password,
        }
      );

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
      const response = await api.post(
        '/auth/login',
        {
          email,
          password,
        }
      );

      if (!response.data?.user?.staff) {
        clearSession();
        throw new Error(
          'Staff profile required'
        );
      }

      persistSession(response.data);

      return response.data;
    } catch (error) {
      clearSession();

      if (
        error instanceof Error &&
        !error.response
      ) {
        throw error;
      }

      throw new Error(
        extractMessage(
          error,
          'Staff login failed'
        )
      );
    }
  },

  async register(userData) {
    try {
      await api.post('/auth/register', {
        full_name: userData.full_name,
        email: userData.email,
        phone: userData.phone,
        password: userData.password,
      });

      // Registration succeeded, so log in immediately.
      return await this.login(
        userData.email,
        userData.password
      );
    } catch (error) {
      throw new Error(
        extractMessage(
          error,
          'Registration failed'
        )
      );
    }
  },

  async getCurrentUser() {
    try {
      const response = await api.get(
        '/auth/me'
      );

      persistUser(response.data);

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async refreshToken() {
    const refreshToken =
      getStoredRefreshToken();

    if (!refreshToken) {
      clearSession();

      throw new Error(
        'No refresh token available'
      );
    }

    try {
      const response = await api.post(
        '/auth/refresh',
        {
          refresh_token: refreshToken,
        }
      );

      persistTokens(response.data);

      return response.data.access_token;
    } catch (error) {
      clearSession();

      throw new Error(
        extractMessage(
          error,
          'Session expired'
        )
      );
    }
  },

  async logout() {
    const refreshToken =
      getStoredRefreshToken();

    try {
      if (refreshToken) {
        await api.post('/auth/logout', {
          refresh_token: refreshToken,
        });
      }
    } catch (error) {
      console.warn(
        'Backend logout failed:',
        error
      );
    } finally {
      clearSession();
    }
  },

  async changePassword(
    currentPassword,
    newPassword
  ) {
    try {
      const response = await api.post(
        '/auth/change-password',
        {
          current_password: currentPassword,
          new_password: newPassword,
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(
          error,
          'Password change failed'
        )
      );
    }
  },

  async getAllUsers() {
    try {
      const response = await api.get(
        '/auth/admin/users'
      );

      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(
          error,
          'Failed to load users'
        )
      );
    }
  },

  async updateUserRole(
    userId,
    newRole
  ) {
    try {
      const response = await api.put(
        `/auth/admin/users/${userId}/role`,
        {
          new_role: newRole,
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(
        extractMessage(
          error,
          'Failed to update user role'
        )
      );
    }
  },
};