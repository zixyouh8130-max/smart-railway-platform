// AppRouter.jsx - Updated with Inspection route
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthLayout from "@/layouts/AuthLayout";
import MainLayout from "@/layouts/MainLayout";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import HomePage from "@/pages/Home/HomePage";
import TrainSearchResults from "@/pages/Train/TrainSearchResults";
import AdminRoutes from "@/routes/AdminRoutes";
import TrainRiderLayout from '@/layouts/TrainRiderLayout';
import LiveTrackingPage from '@/pages/TrainRider/LiveTrackingPage';
import RouteMapPage from '@/pages/TrainRider/RouteMapPage';
import StaffLoginPage from '@/pages/TrainRider/StaffLoginPage';
import TrainRiderHome from '@/pages/TrainRider/TrainRiderHome';
import ScheduleTab from '@/pages/TrainRider/ScheduleTab';
// Import Inspection Dashboard
import InspectionDashboard from '@/pages/Inspection/InspectionDashboard';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin/*" element={<AdminRoutes />} />

        {/* Main routes with layout */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/trains/search" element={<TrainSearchResults />} />
          {/* Inspection Dashboard Route */}
          <Route path="/inspection" element={<InspectionDashboard />} />
        </Route>

        {/* Train Rider routes */}
        <Route path="/train-rider/login" element={<StaffLoginPage />} />
        <Route path="/train-rider" element={<TrainRiderLayout />}>
          <Route index element={<TrainRiderHome />} />
          <Route path="tracking" element={<LiveTrackingPage />} />
          <Route path="schedule" element={<ScheduleTab />} />
          <Route path="route" element={<RouteMapPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}