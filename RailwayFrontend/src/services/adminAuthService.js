import api from '@/api/axios';
import { authService } from '@/services/authService';
import {
  getStoredToken,
  getStoredUser,
  isAdminUser,
} from '@/utils/authSession';

export const adminAuthService = {
  async adminLogin(email, password) {
    return authService.adminLogin(email, password);
  },

  getAdminUser() {
    const user = getStoredUser();
    return isAdminUser(user) ? user : null;
  },

  getAdminToken() {
    const user = getStoredUser();
    return isAdminUser(user) ? getStoredToken() : null;
  },

  isAdmin() {
    return isAdminUser(getStoredUser());
  },

  isAuthenticated() {
    return !!this.getAdminToken() && this.isAdmin();
  },

  async getCurrentAdmin() {
    const user = await authService.getCurrentUser();

    if (!isAdminUser(user)) {
      await authService.logout();
      throw new Error('Admin privileges required');
    }

    return user;
  },

  async getAllUsers() {
    const response = await api.get('/auth/admin/users');
    return response.data;
  },

  async updateUserRole(userId, newRole) {
    const response = await api.put(
      `/auth/admin/users/${userId}/role`,
      null,
      {
        params: {
          new_role: newRole,
        },
      }
    );

    return response.data;
  },

  logout() {
    return authService.logout();
  },

  // No extra Axios interceptor is required. The shared client sends
  // the one canonical token for USER, STAFF or ADMIN sessions.
  setupAxiosInterceptor() {},
};
