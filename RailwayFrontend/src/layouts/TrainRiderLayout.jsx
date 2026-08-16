// layouts/TrainRiderLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Train, MapPin, Clock, Users, Settings, LogOut,
  Menu, Wifi, WifiOff, Battery, Bell, ChevronRight,
  Radio, User, UserCircle
} from 'lucide-react';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import api from '@/api/axios';

const TrainRiderLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
    checkConnection();
    startBatteryMonitoring();
  }, []);

  useEffect(() => {
    if (isAuthenticated && staffInfo?.staff_id) {
      fetchCurrentAssignment();
      const interval = setInterval(fetchCurrentAssignment, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, staffInfo]);

  const checkAuth = () => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const storedStaff = localStorage.getItem('staffInfo');

    if (!token || !storedUser || !storedStaff) {
      navigate('/train-rider/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      const parsedStaff = JSON.parse(storedStaff);

      if (!parsedUser.staff && !parsedStaff) {
        localStorage.clear();
        navigate('/train-rider/login');
        return;
      }

      setUser(parsedUser);
      setStaffInfo(parsedStaff || parsedUser.staff);
      setIsAuthenticated(true);
    } catch (err) {
      localStorage.clear();
      navigate('/train-rider/login');
    }
  };

  const checkConnection = () => {
    if (navigator.onLine) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
    window.addEventListener('online', () => setConnectionStatus('connected'));
    window.addEventListener('offline', () => setConnectionStatus('disconnected'));
  };

  const fetchCurrentAssignment = async () => {
    if (!staffInfo?.staff_id) return;
    try {
      const response = await api.get(`/staff/assignments/current/${staffInfo.staff_id}`);
      setCurrentAssignment(response.data);
    } catch (err) {
      console.error('Failed to fetch assignment:', err);
    }
  };

  const startBatteryMonitoring = () => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('staffInfo');
    navigate('/train-rider/login');
  };

  const navigationItems = [
    { name: 'Home', path: '/train-rider', icon: Radio, description: 'Real-time GPS tracking' },
    { name: 'Schedule', path: '/train-rider/schedule', icon: Clock, description: 'Train schedule & timing' },
    // { name: 'Live Tracking ', path: '/train-rider/settings', icon: Settings, description: 'App settings' },
    // { name: 'Route Map', path: '/train-rider/route', icon: MapPin, description: 'View route and stations' },
  ];

  const getStaffRoleBadge = (role) => {
    const roleStyles = {
      'TRAIN_DRIVER': 'bg-blue-100 text-blue-700 border-blue-300',
      'ASSISTANT_DRIVER': 'bg-indigo-100 text-indigo-700 border-indigo-300',
      'TRAIN_GUARD': 'bg-green-100 text-green-700 border-green-300',
      'TICKET_CHECKER': 'bg-purple-100 text-purple-700 border-purple-300',
    };
    return roleStyles[role] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const getStaffRoleLabel = (role) => {
    const roleLabels = {
      'TRAIN_DRIVER': 'Driver',
      'ASSISTANT_DRIVER': 'Asst. Driver',
      'TRAIN_GUARD': 'Guard',
      'TICKET_CHECKER': 'Ticket Checker',
    };
    return roleLabels[role] || role;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              icon={<Menu className="w-5 h-5" />}
            />

            <div className="flex items-center gap-2">
              <Train className="w-6 h-6 text-railway-red-500" />
              <span className="font-bold text-gray-800 hidden sm:block">Train Rider</span>
            </div>
          </div>

          {currentAssignment && (
            <div className="hidden md:flex items-center gap-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-white">
                <Train className="w-3 h-3 text-railway-red-500" />
                {currentAssignment.train_name}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStaffRoleBadge(staffInfo?.role)}`}>
                {getStaffRoleLabel(staffInfo?.role)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              connectionStatus === 'connected'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </span>

            {batteryLevel !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                <Battery className={`w-3 h-3 ${batteryLevel > 20 ? 'text-green-500' : 'text-red-500'}`} />
                <span>{batteryLevel}%</span>
              </span>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              icon={<LogOut className="w-5 h-5 text-red-500" />}
            />
          </div>
        </div>

        {currentAssignment && (
          <div className="md:hidden px-4 py-2 bg-blue-50 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Train className="w-4 h-4 text-railway-red-500" />
              <span className="text-sm font-medium">{currentAssignment.train_name}</span>
            </div>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${getStaffRoleBadge(staffInfo?.role)}`}>
              {getStaffRoleLabel(staffInfo?.role)}
            </span>
          </div>
        )}
      </header>

      {/* Sidebar - FIXED: User info moved to bottom */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header Section - Simplified, no user info here */}
            <div className="p-6 bg-gradient-to-br from-railway-red-500 to-railway-orange-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Train className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Train Rider</h2>
                  <p className="text-sm opacity-80">Staff Portal</p>
                </div>
              </div>
            </div>

            {/* Navigation Items - Fixed position, stays at top */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-railway-red-50 text-railway-red-700 font-medium border border-railway-red-200'
                        : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </button>
                );
              })}
            </nav>

            {/* User Info Section - Moved to bottom */}
            {staffInfo && (
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white shadow-sm border border-gray-200">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-railway-red-500 to-railway-orange-500 flex items-center justify-center text-white font-bold text-sm">
                    {staffInfo.staff_id ? staffInfo.staff_id.substring(0, 2).toUpperCase() : 'ST'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {staffInfo.staff_name || staffInfo.staff_id}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStaffRoleBadge(staffInfo?.role)}`}>
                        {getStaffRoleLabel(staffInfo?.role)}
                      </span>
                      <span className="text-xs text-gray-500">
                        ID: {staffInfo.staff_id}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    icon={<LogOut className="w-4 h-4" />}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="p-4">
        <Outlet context={{
          user,
          staffInfo,
          currentAssignment,
          connectionStatus,
          batteryLevel
        }} />
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-200 shadow-lg z-50">
        <div className="flex justify-around items-center h-16">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                  isActive ? 'text-railway-red-500' : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs mt-1">{item.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default TrainRiderLayout;