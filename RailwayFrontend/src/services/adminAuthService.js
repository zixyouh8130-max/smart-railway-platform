import { authService } from '@/services/authService';

import {
  getStoredToken,
  getStoredUser,
  isAdminUser,
} from '@/utils/authSession';

export const adminAuthService = {
  async adminLogin(email, password) {
    return authService.adminLogin(
      email,
      password
    );
  },

  getAdminUser() {
    const user = getStoredUser();

    return isAdminUser(user)
      ? user
      : null;
  },

  getAdminToken() {
    const user = getStoredUser();

    return isAdminUser(user)
      ? getStoredToken()
      : null;
  },

  isAdmin() {
    return isAdminUser(
      getStoredUser()
    );
  },

  isAuthenticated() {
    return (
      !!this.getAdminToken() &&
      this.isAdmin()
    );
  },

  async getCurrentAdmin() {
    const user =
      await authService.getCurrentUser();

    if (!isAdminUser(user)) {
      await authService.logout();

      throw new Error(
        'Admin privileges required'
      );
    }

    return user;
  },

  async getAllUsers() {
    return authService.getAllUsers();
  },

  async updateUserRole(
    userId,
    newRole
  ) {
    return authService.updateUserRole(
      userId,
      newRole
    );
  },

  async logout() {
    return authService.logout();
  },

  /*
   * The shared Axios client now handles:
   *
   * - Bearer tokens
   * - 401 responses
   * - refresh tokens
   * - retrying requests
   *
   * so no admin-specific interceptor is needed.
   */
  setupAxiosInterceptor() {},
};