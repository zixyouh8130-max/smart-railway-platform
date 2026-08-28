// layouts/AdminLayout.jsx - Modern Railway Admin Layout (Light Theme with Fixed Sidebar)
import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Train, LayoutDashboard, Calendar, Route, Users, Settings,
  LogOut, Menu, X, ChevronDown, Bell, User, Shield, MapPin,
  Search, AlertTriangle, Radio, TrainFront, Gauge, Signal, Wrench
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const AdminLayout = () => {
  const { user: adminUser, isAdmin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
      if (notificationsOpen && !event.target.closest('.notifications-container')) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);

  const menuItems = [
    {
      icon: <LayoutDashboard className="w-5 h-5" />,
      label: 'Dashboard',
      path: '/admin/dashboard',
      myanmarLabel: 'ထိန်းချုပ်စင်တာ',
      badge: null
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      label: 'Stations',
      path: '/admin/stations',
      myanmarLabel: 'ဘူတာများ',
      badge: null
    },
     {
      icon: <Route className="w-5 h-5" />,
      label: 'Routes',
      path: '/admin/routes',
      myanmarLabel: 'လမ်းကြောင်းများ',
      badge: null
    },
    {
      icon: <TrainFront className="w-5 h-5" />,
      label: 'Trains',
      path: '/admin/trains',
      myanmarLabel: 'ရထားများ',
      badge: null
    }, 
    {
      icon: <Calendar className="w-5 h-5" />,
      label: 'Schedules',
      path: '/admin/schedules',
      myanmarLabel: 'အချိန်ဇယား',
      badge: null
    },
    
    {
      icon: <Radio className="w-5 h-5" />,
      label: 'Live Tracking',
      path: '/admin/train-monitoring',
      myanmarLabel: 'ရထားတည်နေရာ',
      badge: 'LIVE'
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'Track Inspection',
      path: '/admin/inspection',
      myanmarLabel: 'လမ်းစစ်ဆေးမှု',
      badge: null
    },
    {
      icon: <Wrench className="w-5 h-5" />,
      label: 'Track Issues',
      path: '/admin/track-issues',
      myanmarLabel: 'လမ်းပိုင်းပြုပြင်မှု',
      badge: null
    },
    {
      icon: <Users className="w-5 h-5" />,
      label: 'Users',
      path: '/admin/users',
      myanmarLabel: 'အသုံးပြုသူများ',
      badge: null
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: 'Settings',
      path: '/admin/settings',
      myanmarLabel: 'ဆက်တင်များ',
      badge: null
    },
  ];

  const handleLogout = async () => {
    await logout();
    navigate(
      '/admin/login',
      { replace: true }
    );
  };

  if (!adminUser || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 flex">
      {/* Sidebar - Fixed Position */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white transform transition-all duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 shadow-xl border-r border-blue-100`}>
        
        {/* Logo Section */}
        <div className="relative flex items-center justify-between h-20 px-6 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50">
          <Link to="/admin/dashboard" className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-400/30 rounded-xl blur-lg group-hover:bg-blue-400/50 transition-all" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-blue-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                <Train className="w-7 h-7 text-white" />
              </div>
            </div>
            <div>
              <span className="text-blue-900 font-bold text-xl tracking-wide block">RailConnect</span>
              <span className="text-blue-600 text-xs font-medium">Admin Panel</span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-blue-400 hover:text-blue-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation - Fixed height, scrollable within sidebar with hidden scrollbar */}
        <nav className="relative mt-6 px-4 space-y-1.5 overflow-y-auto scrollbar-hide" 
             style={{ height: 'calc(100vh - 80px)', paddingBottom: '20px' }}>
          {/* <div className="px-4 mb-3 text-left">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Main Menu</span>
          </div> */}
          
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setSidebarOpen(false);
                  }
                }}
                className={`group relative flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900 hover:translate-x-1'
                }`}
              >
                {/* Active Indicator */}
                {isActive && (
                  <>
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sky-300 rounded-r-full" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-white/30 rounded-full" />
                  </>
                )}
                
                <span className={`flex-shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-blue-500 group-hover:text-blue-600'
                }`}>
                  {item.icon}
                </span>
                
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-sm font-medium truncate">{item.label}</span>
                  <span className={`text-xs truncate ${
                    isActive ? 'text-blue-100' : 'text-blue-400'
                  }`}>
                    {item.myanmarLabel}
                  </span>
                </div>
                
                {/* Badge for Live Tracking */}
                {item.badge === 'LIVE' && (
                  <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                    LIVE
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-blue-900/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content - Scrollable independently */}
      <div className="flex-1 min-w-0 lg:ml-72">
        {/* Top Bar - Fixed */}
        <div className="bg-white/90 backdrop-blur-md shadow-sm border-b border-blue-100 sticky top-0 z-30">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-blue-600 hover:text-blue-900 lg:hidden p-2 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              {/* Quick link to Train Monitoring */}
              <Link
                to="/admin/train-monitoring"
                className="relative text-blue-600 hover:text-blue-800 p-2.5 rounded-xl hover:bg-blue-50 transition-all group"
                title="Live Train Tracking"
              >
                <Radio className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500/20 rounded-full animate-ping" />
              </Link>

              {/* Notifications */}
              <div className="relative notifications-container">
                <button 
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative text-blue-600 hover:text-blue-900 p-2.5 rounded-xl hover:bg-blue-50 transition-all"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                  <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500/20 rounded-full animate-ping" />
                </button>
                
                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-blue-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-blue-50">
                      <h3 className="font-semibold text-blue-900">Notifications</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto scrollbar-hide">
                      <div className="px-4 py-3 hover:bg-blue-50 cursor-pointer">
                        <p className="text-sm text-blue-800 font-medium">Train #123 Delayed</p>
                        <p className="text-xs text-blue-500 mt-1">Yangon - Mandalay route delayed by 15 minutes</p>
                      </div>
                      <div className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-t border-blue-50">
                        <p className="text-sm text-blue-800 font-medium">Track Inspection Required</p>
                        <p className="text-xs text-blue-500 mt-1">Section B-12 needs immediate attention</p>
                      </div>
                      <div className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-t border-blue-50">
                        <p className="text-sm text-blue-800 font-medium">New User Registered</p>
                        <p className="text-xs text-blue-500 mt-1">Station Master at Naypyidaw Central</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Profile with Dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center space-x-3 pl-2 border-l border-blue-100 hover:bg-blue-50 rounded-xl p-1.5 transition-all"
                >
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="hidden lg:block text-left">
                    <span className="text-sm font-semibold text-blue-900 block">
                      {adminUser?.full_name || 'Admin'}
                    </span>
                    <span className="text-xs text-blue-600">Administrator</span>
                  </div>
                  <ChevronDown className={`hidden lg:block w-4 h-4 text-blue-500 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Profile Dropdown Menu */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-blue-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-blue-50">
                      <p className="text-sm font-semibold text-blue-900">{adminUser?.full_name || 'Admin User'}</p>
                      <p className="text-xs text-blue-500 mt-0.5">{adminUser?.email || 'admin@railconnect.com'}</p>
                      <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        <Shield className="w-3 h-3" />
                        {adminUser?.role || 'ADMIN'}
                      </span>
                    </div>
                    
                    <div className="py-1">
                      <Link
                        to="/admin/settings"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-blue-800 hover:bg-blue-50 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-blue-500" />
                        Account Settings
                      </Link>
                      <Link
                        to="/admin/dashboard"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-blue-800 hover:bg-blue-50 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-blue-500" />
                        Dashboard
                      </Link>
                    </div>
                    
                    <div className="border-t border-blue-50 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page Content - Scrollable area with hidden scrollbar */}
        <div className="overflow-y-auto scrollbar-hide" style={{ height: 'calc(100vh - 64px)' }}>
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;