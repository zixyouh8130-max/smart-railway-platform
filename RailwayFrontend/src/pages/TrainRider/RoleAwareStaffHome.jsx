import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import TrainRiderHome from '@/pages/TrainRider/TrainRiderHome';

const RoleAwareStaffHome = () => {
  const { user } = useAuth();

  if (user?.staff?.role === 'TRACK_ENGINEER') {
    return <Navigate to="/train-rider/issues" replace />;
  }

  return <TrainRiderHome />;
};

export default RoleAwareStaffHome;
