// layouts/AdminLayout.jsx - Updated with Train Monitoring menu item
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Train, LayoutDashboard, Calendar, Route, Users, Settings,
  LogOut, Menu, X, ChevronDown, Bell, User, Shield, MapPin,
  Search, AlertTriangle, Radio  // Add Radio icon for live tracking
} from 'lucide-react';
import { adminAuthService } from '@/services/adminAuthService';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminUser, setAdminUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get admin user from localStorage
    const user = adminAuthService.getAdminUser();
    setAdminUser(user);

    // If no admin user, redirect to login
    if (!user || !adminAuthService.isAdmin()) {
      navigate('/admin/login', { replace: true });
    }
  }, [navigate]);

  const menuItems = [
    {
      icon: <LayoutDashboard className="w-5 h-5" />,
      label: 'Dashboard',
      path: '/admin/dashboard',
      myanmarLabel: 'ထိန်းချုပ်စင်တာ'
    },
    {
      icon: <Train className="w-5 h-5" />,
      label: 'Trains',
      path: '/admin/trains',
      myanmarLabel: 'ရထားများ'
    },
    {
      icon: <Route className="w-5 h-5" />,
      label: 'Routes',
      path: '/admin/routes',
      myanmarLabel: 'လမ်းကြောင်းများ'
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      label: 'Stations',
      path: '/admin/stations',
      myanmarLabel: 'ဘူတာများ'
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      label: 'Schedules',
      path: '/admin/schedules',
      myanmarLabel: 'အချိန်ဇယား'
    },
    {
      icon: <Users className="w-5 h-5" />,
      label: 'Users',
      path: '/admin/users',
      myanmarLabel: 'အသုံးပြုသူများ'
    },
    // 🆕 Train Monitoring menu item
    {
      icon: <Radio className="w-5 h-5" />,
      label: 'Live Tracking',
      path: '/admin/train-monitoring',
      myanmarLabel: 'ရထားတည်နေရာ'
    },
    // Track Inspection menu item
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'Track Inspection',
      path: '/admin/inspection',
      myanmarLabel: 'လမ်းစစ်ဆေးမှု'
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: 'Settings',
      path: '/admin/settings',
      myanmarLabel: 'ဆက်တင်များ'
    },
  ];

  const handleLogout = () => {
    adminAuthService.logout();
    navigate('/admin/login');
  };

  // If no admin user, don't render (will redirect)
  if (!adminUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:relative lg:translate-x-0`}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
          <Link to="/admin/dashboard" className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-red-500" />
            <span className="text-white font-bold text-lg">Admin Panel</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-2 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : location.pathname.startsWith(item.path)
                    ? 'bg-slate-800 text-white'
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm truncate">{item.label}</span>
                <span className="text-xs opacity-70 truncate">{item.myanmarLabel}</span>
              </div>
              {/* Active indicator for Live Tracking */}
              {item.path === '/admin/train-monitoring' && (
                <span className="ml-auto w-2 h-2 bg-green-500 rounded-full animate-pulse"
                  title="Live tracking active"
                />
              )}
            </Link>
          ))}
        </nav>

        {/* User Info & Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700 bg-slate-900">
          <div className="flex items-center space-x-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {adminUser?.full_name || 'Admin User'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {adminUser?.role || 'ADMIN'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 text-gray-400 hover:text-white w-full px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>ထွက်မည်</span>
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-600 hover:text-gray-900 lg:hidden"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 hidden sm:block">
                RailConnect Admin
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Quick link to Train Monitoring */}
              <Link
                to="/admin/train-monitoring"
                className="relative text-gray-600 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                title="Live Train Tracking"
              >
                <Radio className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </Link>

              <button className="relative text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {adminUser?.full_name || 'Admin'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;