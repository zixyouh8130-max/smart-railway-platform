import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Battery,
  ChevronRight,
  Clock,
  LogOut,
  Menu,
  Radio,
  Train,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';

import Button from '@/components/ui/button';
import api from '@/api/axios';
import { useAuth } from '@/context/AuthContext';

const TrainRiderLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isStaff, logout } = useAuth();
  const staffInfo = user?.staff || null;
  const isTrackEngineer = staffInfo?.role === 'TRACK_ENGINEER';

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(navigator.onLine ? 'connected' : 'disconnected');
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [currentAssignment, setCurrentAssignment] = useState(null);

  useEffect(() => {
    const online = () => setConnectionStatus('connected');
    const offline = () => setConnectionStatus('disconnected');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);

    if ('getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        const update = () => setBatteryLevel(Math.round(battery.level * 100));
        update();
        battery.addEventListener('levelchange', update);
      });
    }

    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    // Track Engineers are assigned to maintenance issues, not train schedules.
    if (!isStaff || !staffInfo?.staff_id || isTrackEngineer) {
      setCurrentAssignment(null);
      return undefined;
    }

    const fetchCurrentAssignment = async () => {
      try {
        const response = await api.get(`/staff/assignments/current/${staffInfo.staff_id}`);
        setCurrentAssignment(response.data || null);
      } catch (err) {
        console.error('Failed to fetch staff train assignment:', err);
      }
    };

    fetchCurrentAssignment();
    const interval = setInterval(fetchCurrentAssignment, 30000);
    return () => clearInterval(interval);
  }, [isStaff, staffInfo?.staff_id, isTrackEngineer]);

  const navigationItems = useMemo(() => {
    if (isTrackEngineer) {
      return [
        {
          name: 'Issues',
          path: '/train-rider/issues',
          icon: Wrench,
          description: 'AI findings & maintenance work',
        },
      ];
    }

    return [
      {
        name: 'Home',
        path: '/train-rider',
        icon: Radio,
        description: 'Train duty & journey controls',
      },
      {
        name: 'Schedule',
        path: '/train-rider/schedule',
        icon: Clock,
        description: 'Train schedule & timing',
      },
    ];
  }, [isTrackEngineer]);

  const getStaffRoleBadge = (role) => {
    const styles = {
      TRAIN_DRIVER: 'bg-blue-100 text-blue-700 border-blue-300',
      ASSISTANT_DRIVER: 'bg-indigo-100 text-indigo-700 border-indigo-300',
      TRAIN_GUARD: 'bg-green-100 text-green-700 border-green-300',
      TICKET_CHECKER: 'bg-purple-100 text-purple-700 border-purple-300',
      TRACK_ENGINEER: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    };
    return styles[role] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const getStaffRoleLabel = (role) => {
    const labels = {
      TRAIN_DRIVER: 'Driver',
      ASSISTANT_DRIVER: 'Asst. Driver',
      TRAIN_GUARD: 'Guard',
      TICKET_CHECKER: 'Ticket Checker',
      TRACK_ENGINEER: 'Track Engineer',
    };
    return labels[role] || role;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/train-rider/login', { replace: true });
  };

  if (!isStaff || !staffInfo) return null;

  const PortalIcon = isTrackEngineer ? Wrench : Train;
  const portalTitle = isTrackEngineer ? 'Track Engineer' : 'Train Rider';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(true)} icon={<Menu className="w-5 h-5" />} />
            <div className="flex items-center gap-2">
              <PortalIcon className={`w-6 h-6 ${isTrackEngineer ? 'text-emerald-600' : 'text-railway-red-500'}`} />
              <span className="font-bold text-gray-800 hidden sm:block">{portalTitle}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {currentAssignment && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-white">
                <Train className="w-3 h-3 text-railway-red-500" />
                {currentAssignment.train_name}
              </span>
            )}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStaffRoleBadge(staffInfo.role)}`}>
              {getStaffRoleLabel(staffInfo.role)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${connectionStatus === 'connected' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </span>
            {batteryLevel !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-50 border border-gray-200">
                <Battery className={`w-3 h-3 ${batteryLevel > 20 ? 'text-green-500' : 'text-red-500'}`} /> {batteryLevel}%
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} icon={<LogOut className="w-5 h-5 text-red-500" />} />
          </div>
        </div>
      </header>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className={`p-6 text-white ${isTrackEngineer ? 'bg-gradient-to-br from-emerald-600 to-teal-600' : 'bg-gradient-to-br from-railway-red-500 to-railway-orange-500'}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center"><PortalIcon className="w-7 h-7" /></div>
                <div><h2 className="font-bold text-lg">{portalTitle}</h2><p className="text-sm opacity-80">Railway Staff Portal</p></div>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path || (item.path !== '/train-rider' && location.pathname.startsWith(`${item.path}/`));
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${active ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200' : 'hover:bg-gray-50 text-gray-700 border border-transparent'}`}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="text-left flex-1"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-gray-500">{item.description}</p></div>
                    {active && <ChevronRight className="w-4 h-4" />}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="p-3 rounded-xl bg-white border border-gray-200">
                <p className="text-sm font-semibold text-gray-800">{user.full_name || staffInfo.staff_id}</p>
                <p className="text-xs text-gray-500 mt-1">{getStaffRoleLabel(staffInfo.role)} · {staffInfo.staff_id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="p-4">
        <Outlet context={{ user, staffInfo, currentAssignment, connectionStatus, batteryLevel }} />
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 shadow-lg z-50">
        <div className="flex justify-around items-center h-16">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || (item.path !== '/train-rider' && location.pathname.startsWith(`${item.path}/`));
            return (
              <button key={item.path} onClick={() => navigate(item.path)} className={`flex flex-col items-center justify-center w-full h-full ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                <Icon className="w-5 h-5" /><span className="text-xs mt-1">{item.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default TrainRiderLayout;
