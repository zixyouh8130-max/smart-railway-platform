// pages/TrainRider/TrainRiderHome.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Train, Clock, MapPin, Navigation, AlertTriangle,
  Play, Map, Calendar, ChevronRight, Bell, BellRing,
  RefreshCw, Wifi, WifiOff
} from 'lucide-react';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import api from '@/api/axios';
import { formatRailwayDate, railwayDateTimeToInstant } from '@/utils/railwayDateTime';

const POLL_INTERVAL = 15000; // Poll every 15 seconds
const ALERT_THRESHOLD = 15; // Alert when 15 minutes or less to departure

const TrainRiderHome = () => {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const {
    setUser: setSharedUser,
    setStaffInfo: setSharedStaffInfo,
    setCurrentAssignment: setSharedCurrentAssignment,
  } = outletContext;
  const [user, setUser] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeToDeparture, setTimeToDeparture] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [journeyActive, setJourneyActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  const pollIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);

  // 🆕 Fetch schedule data
  const fetchScheduleData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    setConnectionError(false);

    try {
      const userResponse = await api.get('/auth/me');
      setUser(userResponse.data);
      setSharedUser?.(userResponse.data);

      if (userResponse.data.staff) {
        setStaffInfo(userResponse.data.staff);
        setSharedStaffInfo?.(userResponse.data.staff);

        // Get today's assignment
        const staffId = userResponse.data.staff.staff_id;
        const assignmentResponse = await api.get(`/staff/assignments/current/${staffId}`);

        if (assignmentResponse.data) {
          const newSchedule = assignmentResponse.data;
          setTodaySchedule(newSchedule);
          setSharedCurrentAssignment?.(newSchedule);
          setLastUpdated(new Date());

          // Update journey status
          if (newSchedule.status === 'ACTIVE') {
            setJourneyActive(true);
          } else {
            setJourneyActive(false);
          }

          console.log('📅 Schedule updated:', {
            departure: newSchedule.departure_time,
            status: newSchedule.status,
            updated: new Date().toLocaleTimeString()
          });
        } else {
          setTodaySchedule(null);
          setSharedCurrentAssignment?.(null);
          setJourneyActive(false);
        }
      } else {
        setStaffInfo(null);
        setSharedStaffInfo?.(null);
        setTodaySchedule(null);
        setSharedCurrentAssignment?.(null);
      }
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setSharedUser, setSharedStaffInfo, setSharedCurrentAssignment]);

  // 🆕 Initial load + polling
  useEffect(() => {
    fetchScheduleData();

    // Set up polling
    pollIntervalRef.current = setInterval(() => {
      fetchScheduleData(true);
    }, POLL_INTERVAL);

    // Update clock every second
    clockIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [fetchScheduleData]);

  // 🆕 Recalculate time to departure whenever schedule or current time changes
  useEffect(() => {
    if (todaySchedule?.departure_time && todaySchedule?.assignment_date) {
      calculateTimeToDeparture();
    }
  }, [todaySchedule, currentTime]);

  const calculateTimeToDeparture = () => {
    if (!todaySchedule?.departure_time || !todaySchedule?.assignment_date) {
      setTimeToDeparture(null);
      return;
    }

    try {
      const serviceDate = String(todaySchedule.assignment_date).slice(0, 10);
      const departureDateTime = railwayDateTimeToInstant(
        `${serviceDate}T${todaySchedule.departure_time}:00`
      );

      if (!departureDateTime) {
        throw new Error('Invalid railway departure datetime');
      }

      const diffMs = departureDateTime.getTime() - Date.now();
      const diffMinutes = Math.floor(diffMs / 60000);

      setTimeToDeparture(diffMinutes);

      // Show alert when 15 minutes or less to departure
      if (diffMinutes <= ALERT_THRESHOLD && diffMinutes > 0 && !journeyActive) {
        setShowAlert(true);
      } else if (diffMinutes <= 0 && !journeyActive) {
        // Time has passed, show ready state
        setShowAlert(true);
      }
    } catch (err) {
      console.error('Error calculating departure time:', err);
      setTimeToDeparture(null);
    }
  };


  const handleStartJourney = async () => {
    if (!todaySchedule?.assignment_id) {
      alert('No active assignment was found. Please refresh and try again.');
      return;
    }

    const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';

    try {
      console.log('🚂 Starting journey...');
      console.log('  - assignment_id:', todaySchedule.assignment_id);
      console.log('  - device_id:', deviceId);

      const response = await api.post(
        `/staff/assignments/${todaySchedule.assignment_id}/start-journey`,
        { device_id: deviceId }
      );

      console.log('✅ Journey started:', response.data);

      // Keep a usable ACTIVE assignment immediately, even if the refresh below
      // briefly fails after the backend has already started the journey.
      let refreshedAssignment = {
        ...todaySchedule,
        status: response.data?.status || 'ACTIVE',
        schedule_id: response.data?.schedule_id ?? todaySchedule.schedule_id,
      };

      if (staffInfo?.staff_id) {
        try {
          const assignmentResponse = await api.get(
            `/staff/assignments/current/${staffInfo.staff_id}`
          );

          if (assignmentResponse.data) {
            refreshedAssignment = assignmentResponse.data;
          }
        } catch (refreshError) {
          console.warn(
            '⚠️ Journey started, but assignment refresh failed:',
            refreshError
          );
        }
      }

      setTodaySchedule(refreshedAssignment);
      setSharedCurrentAssignment?.(refreshedAssignment);
      setJourneyActive(true);
      setShowAlert(false);
      setLastUpdated(new Date());

      navigate('/train-rider/tracking');
    } catch (err) {
      console.error('❌ Failed to start journey:', err);
      console.error(
        'Error response:',
        JSON.stringify(err.response?.data, null, 2)
      );

      const detail = err.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || 'Failed to start journey. Please try again.';

      alert(message);
    }
  };

  const handleManualRefresh = () => {
    fetchScheduleData(true);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    // Handle both "HH:MM" and "HH:MM:SS" formats
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const formatDate = (dateStr) =>
    dateStr ? formatRailwayDate(dateStr, 'my-MM', { weekday: 'long' }) : '';

  const getTimeStatusText = () => {
    if (journeyActive) return 'ခရီးစဉ်အတွင်း';
    if (timeToDeparture === null) return 'တွက်ချက်နေသည်...';
    if (timeToDeparture > 60) return `${Math.floor(timeToDeparture / 60)} နာရီကျော်`;
    if (timeToDeparture > 0) return `${timeToDeparture} မိနစ်`;
    if (timeToDeparture === 0) return 'ယခုထွက်ခွာရန်';
    return 'ထွက်ခွာပြီး';
  };

  const getTimeStatusColor = () => {
    if (journeyActive) return 'text-green-600';
    if (timeToDeparture === null) return 'text-gray-500';
    if (timeToDeparture <= 5 && timeToDeparture >= 0) return 'text-red-600';
    if (timeToDeparture <= 15) return 'text-amber-600';
    return 'text-blue-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-railway-red-500 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">အချက်အလက်များ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  // No schedule assigned
  if (!todaySchedule) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="flex items-center justify-center min-h-[80vh]">
          <Card padding="p-8" className="text-center max-w-md">
            <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">ယနေ့အတွက် တာဝန်မရှိပါ</h2>
            <p className="text-gray-500 mb-4">
              {staffInfo ? 'ယနေ့ တာဝန်ချထားခြင်း မရှိသေးပါ။' : 'ကျေးဇူးပြု၍ အက်ဒမင်ထံ ဆက်သွယ်ပါ။'}
            </p>
            <Button
              variant="outline"
              onClick={handleManualRefresh}
              icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
            >
              ပြန်လည်စစ်ဆေးမည်
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-railway-red-500 to-railway-orange-500 rounded-2xl mb-3 shadow-lg">
          <Train className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Train Rider</h1>
        {staffInfo && (
          <p className="text-sm text-gray-500 mt-1">
            {staffInfo.role === 'TRAIN_DRIVER' ? 'ရထားမောင်းသူ' :
             staffInfo.role === 'ASSISTANT_DRIVER' ? 'လက်ထောက်မောင်းသူ' :
             staffInfo.role === 'TRAIN_GUARD' ? 'ရထားစောင့်' : 'လက်မှတ်စစ်'}
          </p>
        )}

        {/* 🆕 Connection status & last updated */}
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-400">
          {connectionError ? (
            <span className="flex items-center gap-1 text-red-500">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          ) : (
            <span className="flex items-center gap-1 text-green-500">
              <Wifi className="w-3 h-3" /> Connected
            </span>
          )}
          {lastUpdated && (
            <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={handleManualRefresh}
            className="text-railway-red-500 hover:text-railway-red-700"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 🆕 15-min Alert */}
      {showAlert && !journeyActive && (
        <Card padding="p-4" className="mb-4 bg-amber-50 border-amber-300 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <BellRing className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-800">ထွက်ခွာချိန် နီးပါပြီ!</p>
              <p className="text-sm text-amber-700">
                {timeToDeparture > 0
                  ? `နောက်ထပ် ${timeToDeparture} မိနစ်အတွင်း ထွက်ခွာရမည်`
                  : timeToDeparture === 0
                    ? 'ထွက်ခွာချိန် ရောက်ရှိပါပြီ'
                    : 'ထွက်ခွာချိန် ကျော်လွန်သွားပါပြီ'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Today's Schedule Card */}
      <Card padding="p-6" className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-railway-red-500" />
            ယနေ့ ခရီးစဉ်
          </h2>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            journeyActive
              ? 'bg-green-100 text-green-700 border border-green-200'
              : timeToDeparture <= 0
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-blue-100 text-blue-700 border border-blue-200'
          }`}>
            {journeyActive ? 'ခရီးစဉ်အတွင်း' :
             timeToDeparture <= 0 ? 'ထွက်ခွာရန်' : 'စောင့်ဆိုင်းဆဲ'}
          </span>
        </div>

        <div className="space-y-3">
          {/* Train Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Train className="w-8 h-8 text-railway-red-500" />
            <div>
              <p className="font-bold text-gray-900">{todaySchedule.train_name}</p>
              <p className="text-sm text-gray-500">{todaySchedule.train_no}</p>
            </div>
          </div>

          <Separator />

          {/* Schedule Times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <Label className="text-xs text-blue-600">ထွက်ခွာချိန်</Label>
              <p className="text-xl font-bold text-blue-700">
                {formatTime(todaySchedule.departure_time)}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                {formatDate(todaySchedule.assignment_date)}
              </p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <Label className="text-xs text-green-600">ရောက်ရှိမည့်အချိန်</Label>
              <p className="text-xl font-bold text-green-700">
                {formatTime(todaySchedule.arrival_time)}
              </p>
            </div>
          </div>

          {/* 🆕 Countdown Timer */}
          {!journeyActive && timeToDeparture !== null && (
            <div className={`text-center p-4 rounded-lg border-2 ${
              timeToDeparture <= 0 ? 'bg-red-50 border-red-200' :
              timeToDeparture <= 15 ? 'bg-amber-50 border-amber-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <Label className="text-xs text-gray-500 mb-1">ထွက်ခွာရန် ကျန်ချိန်</Label>
              <p className={`text-3xl font-bold ${getTimeStatusColor()}`}>
                {getTimeStatusText()}
              </p>
              {/* Progress bar */}
              {timeToDeparture > 0 && (
                <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      timeToDeparture <= 15 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, ((ALERT_THRESHOLD - timeToDeparture) / ALERT_THRESHOLD) * 100))}%`
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 🆕 Schedule Status */}
          <div className="text-center text-xs text-gray-400">
            Status: {todaySchedule.status} |
            Last checked: {lastUpdated?.toLocaleTimeString() || 'Never'}
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-3">
        {!journeyActive ? (
          <Button
            variant="primary"
            className="w-full text-lg py-4"
            icon={<Play className="w-6 h-6" />}
            onClick={handleStartJourney}
            disabled={timeToDeparture > 15}
          >
            {timeToDeparture <= 0 ? 'ထွက်ခွာမည်' :
             timeToDeparture <= 15 ? 'စောစီးစွာ ထွက်ခွာမည်' :
             'ထွက်ခွာချိန် စောင့်ဆိုင်းပါ'}
          </Button>
        ) : (
          <Button
            variant="primary"
            className="w-full text-lg py-4 bg-green-600 hover:bg-green-700"
            icon={<Map className="w-6 h-6" />}
            onClick={() => navigate('/train-rider/tracking')}
          >
            Live Tracking ကြည့်ရှုရန်
          </Button>
        )}
        {/* 🆕 Manual refresh button */}
        <Button
          variant="ghost"
          className="w-full text-gray-400"
          icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
          onClick={handleManualRefresh}
        >
          အချက်အလက်များ ပြန်လည်စစ်ဆေးမည်
        </Button>
      </div>
    </div>
  );
};

export default TrainRiderHome;