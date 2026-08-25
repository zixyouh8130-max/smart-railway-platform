import {
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

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
import TrainMonitoringPage from '@/pages/admin/TrainMonitoringPage';
import TrackIssuesAdminPage from '@/pages/admin/TrackIssuesAdminPage';
import ProtectedRoute from '@/routes/ProtectedRoute';

const AdminRoutes = () => (
  <Routes>
    <Route
      path="login"
      element={<AdminLogin />}
    />

    <Route
      element={
        <ProtectedRoute
          allowedRoles={[
            'ADMIN',
            'SUPER_ADMIN',
          ]}
          redirectTo="/admin/login"
        />
      }
    >
      <Route element={<AdminLayout />}>
        <Route
          index
          element={
            <Navigate
              to="dashboard"
              replace
            />
          }
        />

        <Route
          path="dashboard"
          element={<Dashboard />}
        />
        <Route
          path="trains"
          element={<TrainManagement />}
        />
        <Route
          path="routes"
          element={<RoutesManagement />}
        />
        <Route
          path="stations"
          element={<StationManagement />}
        />
        <Route
          path="schedules"
          element={<SchedulesManagement />}
        />
        <Route
          path="users"
          element={<UsersManagement />}
        />
        <Route
          path="inspection"
          element={<InspectionDashboard />}
        />
        <Route
          path="track-issues"
          element={<TrackIssuesAdminPage />}
        />
        <Route
          path="settings"
          element={<Settings />}
        />
        <Route
          path="train-monitoring"
          element={<TrainMonitoringPage />}
        />
      </Route>
    </Route>
  </Routes>
);

export default AdminRoutes;
