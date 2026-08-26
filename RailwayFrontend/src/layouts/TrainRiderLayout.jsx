// layouts/TrainRiderLayout.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import api from '@/api/axios';

const TrainRiderLayout = () => {
  const [user, setUser] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null);
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'offline'
      : 'online'
  );
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState(null);

  const refreshStaffContext = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setContextLoading(true);
    }

    setContextError(null);

    try {
      const userResponse = await api.get('/auth/me');
      const nextUser = userResponse.data || null;
      const nextStaff = nextUser?.staff || null;

      setUser(nextUser);
      setStaffInfo(nextStaff);

      let nextAssignment = null;

      // Track Engineers use the maintenance-issue workspace and must not be
      // treated as train crew with a live train assignment.
      if (nextStaff?.staff_id && nextStaff.role !== 'TRACK_ENGINEER') {
        const assignmentResponse = await api.get(
          `/staff/assignments/current/${nextStaff.staff_id}`
        );
        nextAssignment = assignmentResponse.data || null;
      }

      setCurrentAssignment(nextAssignment);
      setConnectionStatus('online');

      return {
        user: nextUser,
        staffInfo: nextStaff,
        currentAssignment: nextAssignment,
      };
    } catch (error) {
      console.error('Failed to load train-rider context:', error);
      setContextError(error);
      setConnectionStatus(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'offline'
          : 'error'
      );
      return null;
    } finally {
      if (!silent) {
        setContextLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshStaffContext();
  }, [refreshStaffContext]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getBattery) {
      return undefined;
    }

    let battery = null;
    let cancelled = false;

    const updateBatteryLevel = () => {
      if (!cancelled && battery) {
        setBatteryLevel(Math.round(battery.level * 100));
      }
    };

    navigator.getBattery()
      .then((batteryManager) => {
        if (cancelled) return;
        battery = batteryManager;
        updateBatteryLevel();
        battery.addEventListener('levelchange', updateBatteryLevel);
      })
      .catch(() => {
        // Battery Status API is optional and unsupported in many browsers.
        setBatteryLevel(null);
      });

    return () => {
      cancelled = true;
      if (battery) {
        battery.removeEventListener('levelchange', updateBatteryLevel);
      }
    };
  }, []);

  const outletContext = useMemo(
    () => ({
      user,
      staffInfo,
      currentAssignment,
      connectionStatus,
      batteryLevel,
      contextLoading,
      contextError,
      setUser,
      setStaffInfo,
      setCurrentAssignment,
      refreshStaffContext,
    }),
    [
      user,
      staffInfo,
      currentAssignment,
      connectionStatus,
      batteryLevel,
      contextLoading,
      contextError,
      refreshStaffContext,
    ]
  );

  return <Outlet context={outletContext} />;
};

export default TrainRiderLayout;