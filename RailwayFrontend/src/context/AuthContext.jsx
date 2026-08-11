import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '@/services/authService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      const data = await authService.login(email, password);
      setUser(data.user);
      return data;
    } catch (error) {
      setError(error.detail || 'Login failed');
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      setError(null);
      const data = await authService.register(userData);
      setUser(data.user);
      return data;
    } catch (error) {
      setError(error.detail || 'Registration failed');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Add the clearError function
  const clearError = () => {
    setError(null);
  };
  const setAuthError = (message) => {
      setError(message);
    };
  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError, // Include it in the context value
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};