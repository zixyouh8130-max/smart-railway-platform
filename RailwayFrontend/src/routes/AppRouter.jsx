import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import AuthLayout from '@/layouts/AuthLayout';
import MainLayout from '@/layouts/MainLayout';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import HomePage from '@/pages/Home/HomePage';
import TrainSearchResults from '@/pages/Train/TrainSearchResults';
import BookingPage from '@/pages/Booking/BookingPage';
import TicketStatusPage from '@/pages/Booking/TicketStatusPage';
import AdminRoutes from '@/routes/AdminRoutes';

import TrainRiderLayout from '@/layouts/TrainRiderLayout';
import LiveTrackingPage from '@/pages/TrainRider/LiveTrackingPage';
import StaffLoginPage from '@/pages/TrainRider/StaffLoginPage';
import RoleAwareStaffHome from '@/pages/TrainRider/RoleAwareStaffHome';
import TrackEngineerHome from '@/pages/TrainRider/TrackEngineerHome';
import TrackEngineerIssuePage from '@/pages/TrainRider/TrackEngineerIssuePage';
import ScheduleTab from '@/pages/TrainRider/ScheduleTab';
import ProtectedRoute from '@/routes/ProtectedRoute';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Optional account login/registration. Public website use does
            not require either one. */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route
            path="/register"
            element={<Register />}
          />
        </Route>

        {/* Admin portal. */}
        <Route
          path="/admin/*"
          element={<AdminRoutes />}
        />

        {/* Public passenger website. */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/trains/search"
            element={<TrainSearchResults />}
          />
          <Route
            path="/booking/:scheduleId"
            element={<BookingPage />}
          />
          <Route
            path="/pnr-status"
            element={<TicketStatusPage />}
          />
          <Route path="/booking" element={<Navigate to="/" replace />} />
          <Route path="/status" element={<Navigate to="/pnr-status" replace />} />
          <Route path="/schedules" element={<Navigate to="/" replace />} />
          <Route path="/services" element={<Navigate to="/" replace />} />
        </Route>

        {/* Staff login is public; staff portal is not. */}
        <Route
          path="/train-rider/login"
          element={<StaffLoginPage />}
        />

        <Route
          element={
            <ProtectedRoute
              requireStaff
              redirectTo="/train-rider/login"
            />
          }
        >
          <Route
            path="/train-rider"
            element={<TrainRiderLayout />}
          >
            <Route
              index
              element={<RoleAwareStaffHome />}
            />
            <Route
              element={
                <ProtectedRoute
                  allowedStaffRoles={[
                    'TRAIN_DRIVER',
                    'ASSISTANT_DRIVER',
                    'TRAIN_GUARD',
                    'TICKET_CHECKER',
                  ]}
                />
              }
            >
              <Route
                path="tracking"
                element={<LiveTrackingPage />}
              />
              <Route
                path="schedule"
                element={<ScheduleTab />}
              />
            </Route>

            <Route
              element={
                <ProtectedRoute
                  allowedStaffRoles={['TRACK_ENGINEER']}
                />
              }
            >
              <Route
                path="issues"
                element={<TrackEngineerHome />}
              />
              <Route
                path="issues/:issueId"
                element={<TrackEngineerIssuePage />}
              />
            </Route>
          </Route>
        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
