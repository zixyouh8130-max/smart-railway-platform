import api from '@/api/axios';

const ADMIN_TOKEN_KEY = 'adminToken';
const ADMIN_USER_KEY = 'adminUser';

export const adminAuthService = {
  /**
   * Login as admin
   */
  async adminLogin(email, password) {
    try {
      const response = await api.post('/auth/admin/login', {
        email,
        password
      });

      const { access_token, user } = response.data;

      // Store admin credentials
      localStorage.setItem(ADMIN_TOKEN_KEY, access_token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));

      return response.data;
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'Admin login failed';
      throw new Error(message);
    }
  },

  /**
   * Get current admin user from localStorage
   */
  getAdminUser() {
    try {
      const userStr = localStorage.getItem(ADMIN_USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing admin user:', error);
      return null;
    }
  },

  /**
   * Get admin token
   */
  getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  /**
   * Check if current user is admin
   */
  isAdmin() {
    try {
      const adminUser = this.getAdminUser();
      const adminToken = this.getAdminToken();

      if (!adminToken || !adminUser) {
        return false;
      }

      return adminUser.role === 'ADMIN' || adminUser.role === 'SUPER_ADMIN';
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  },

  /**
   * Get current admin profile from API
   */
  async getCurrentAdmin() {
    try {
      const token = this.getAdminToken();
      if (!token) {
        throw new Error('No admin token found');
      }

      const response = await api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // Update stored user data
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(response.data));

      return response.data;
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      // If token is invalid, logout
      if (error.response?.status === 401) {
        this.logout();
      }
      throw error;
    }
  },

  /**
   * Check if admin is authenticated
   */
  isAuthenticated() {
    const token = this.getAdminToken();
    const user = this.getAdminUser();

    if (!token || !user) {
      return false;
    }

    // Check if user has admin role
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return false;
    }

    return true;
  },

  /**
   * Get all users (admin only)
   */
  async getAllUsers() {
    try {
      const token = this.getAdminToken();
      const response = await api.get('/auth/admin/users', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  /**
   * Update user role (super admin only)
   */
  async updateUserRole(userId, newRole) {
    try {
      const token = this.getAdminToken();
      const response = await api.put(
        `/auth/admin/users/${userId}/role`,
        { new_role: newRole },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  },

  /**
   * Logout admin
   */
  logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  },

  /**
   * Setup axios interceptor for admin token
   */
  setupAxiosInterceptor() {
    api.interceptors.request.use(
      (config) => {
        // Check if the request is for admin endpoints
        if (config.url?.includes('/admin/') || config.url?.includes('/auth/admin/')) {
          const token = this.getAdminToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }
};

// Initialize the interceptor
adminAuthService.setupAxiosInterceptor();