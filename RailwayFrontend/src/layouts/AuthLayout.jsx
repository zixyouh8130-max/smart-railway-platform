import React from 'react';
import {
  Outlet,
  Navigate,
} from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  getDefaultPathForUser,
} from '@/utils/authSession';

const AuthLayout = () => {
  const {
    user,
    isAuthenticated,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={getDefaultPathForUser(user)}
        replace
      />
    );
  }

  return <Outlet />;
};

export default AuthLayout;
