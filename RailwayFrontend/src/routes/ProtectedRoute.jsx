import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
} from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  getDefaultPathForUser,
} from '@/utils/authSession';

export default function ProtectedRoute({
  allowedRoles = null,
  requireStaff = false,
  allowedStaffRoles = null,
  redirectTo = '/login',
}) {
  const {
    user,
    isAuthenticated,
    loading,
  } = useAuth();

  const location = useLocation();

  // Important for nested guards:
  // TrainRiderLayout provides staffInfo/currentAssignment through Outlet context.
  // A nested <Outlet /> without context would replace that value with null before
  // LiveTrackingPage receives it. Read the parent context and forward it.
  const parentOutletContext = useOutletContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location }}
      />
    );
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(user?.role)
  ) {
    return (
      <Navigate
        to={getDefaultPathForUser(user)}
        replace
      />
    );
  }

  if (requireStaff && !user?.staff) {
    return (
      <Navigate
        to={getDefaultPathForUser(user)}
        replace
      />
    );
  }

  if (
    allowedStaffRoles &&
    !allowedStaffRoles.includes(user?.staff?.role)
  ) {
    return (
      <Navigate
        to="/train-rider"
        replace
      />
    );
  }

  return <Outlet context={parentOutletContext} />;
}
