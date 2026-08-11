import api from '@/api/axios';

export const authService = {
  async login(email, password) {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }

      return response.data;
    } catch (error) {
      const message = error.response?.data?.detail || 'Login failed';
      throw new Error(message);
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

      // After registration, automatically login
      if (response.data.message === 'Registration successful') {
        // Auto-login after registration
        const loginResponse = await api.post('/auth/login', {
          email: userData.email,
          password: userData.password,
        });

        if (loginResponse.data.access_token) {
          localStorage.setItem('token', loginResponse.data.access_token);
          localStorage.setItem('user', JSON.stringify(loginResponse.data.user));
        }

        return loginResponse.data;
      }

      return response.data;
    } catch (error) {
      const message = error.response?.data?.detail || 'Registration failed';
      throw new Error(message);
    }
  },

  async logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  async getCurrentUser() {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  async refreshToken() {
//    try {
//      const response = await api.post('/auth/refresh');
//      if (response.data.access_token) {
//        localStorage.setItem('token', response.data.access_token);
//      }
//      return response.data;
//    } catch (error) {
//      throw error.response?.data || error.message;
//    }
    return null
  },
};