import { Routes, Route, Navigate } from 'react-router-dom';
import { Outlet } from "react-router-dom";
import AdminLogin from '@/pages/admin/AdminLogin';
import Dashboard from '@/pages/admin/Dashboard';
import TrainManagement from '@/pages/admin/TrainManagement';
import RoutesManagement from '@/pages/admin/RoutesManagement';
import SchedulesManagement from '@/pages/admin/SchedulesManagement';
import StationManagement from '@/pages/admin/StationManagement';
import UsersManagement from '@/pages/admin/UsersManagement';
import Settings from '@/pages/admin/Settings';
import AdminLayout from '@/layouts/AdminLayout';
import InspectionDashboard from '@/pages/Inspection/InspectionDashboard';

const AdminProtectedLayout = () => {
  const adminToken = localStorage.getItem('adminToken');
  const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');

  if (!adminToken || (adminUser.role !== 'ADMIN' && adminUser.role !== 'SUPER_ADMIN')) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
        <Outlet />
    </AdminLayout>
        );
};

const AdminRoutes = () => {
  return (
    <Routes>
      {/* Public admin route */}
      <Route path="login" element={<AdminLogin />} />

      {/* Protected admin routes */}
      <Route element={<AdminProtectedLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="trains" element={<TrainManagement />} />
        <Route path="routes" element={<RoutesManagement />} />
        <Route path="stations" element={<StationManagement />} />
        <Route path="schedules" element={<SchedulesManagement />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="inspection" element={<InspectionDashboard />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AdminRoutes;