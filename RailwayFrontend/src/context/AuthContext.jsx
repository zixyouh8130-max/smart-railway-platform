import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { authService } from '@/services/authService';
import {
  clearSession,
  getStoredToken,
  isAdminUser,
  isRegularUser,
  isStaffUser,
} from '@/utils/authSession';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }

  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = getStoredToken();

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData =
          await authService.getCurrentUser();

        setUser(userData);
      } catch (authError) {
        console.error(
          'Auth check failed:',
          authError
        );

        clearSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const runLogin = async (loginFn) => {
    setError(null);

    try {
      const data = await loginFn();
      setUser(data.user);
      return data;
    } catch (loginError) {
      setError(
        loginError.message || 'Login failed'
      );
      throw loginError;
    }
  };

  const login = (email, password) =>
    runLogin(() =>
      authService.login(email, password)
    );

  const adminLogin = (email, password) =>
    runLogin(() =>
      authService.adminLogin(email, password)
    );

  const staffLogin = (email, password) =>
    runLogin(() =>
      authService.staffLogin(email, password)
    );

  const register = async (userData) => {
    setError(null);

    try {
      const data =
        await authService.register(userData);

      if (data?.user) {
        setUser(data.user);
      }

      return data;
    } catch (registerError) {
      setError(
        registerError.message ||
        'Registration failed'
      );
      throw registerError;
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setError(null);
  };

  const clearError = () => setError(null);

  const value = {
    user,
    loading,
    error,

    login,
    adminLogin,
    staffLogin,
    register,
    logout,
    clearError,

    isAuthenticated: !!user,
    isAdmin: isAdminUser(user),
    isStaff: isStaffUser(user),
    isRegularUser: isRegularUser(user),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
