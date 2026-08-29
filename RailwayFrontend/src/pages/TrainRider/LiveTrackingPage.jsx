// pages/TrainRider/LiveTrackingPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MapPin, Navigation, Clock, Gauge, Satellite, Train, CheckCircle, LogOut, AlertCircle, X } from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import TrainTrackerMap from '@/pages/TrainRider/TrainTrackerMap';

import api from '@/api/axios';
import schedulesApi from '@/api/schedules';
import locationTrackingApi from '@/api/locationTracking';
import { formatRailwayTime } from '@/utils/railwayDateTime';

const LOCATION_UPLOAD_INTERVAL_MS = 10000;

const LiveTrackingPage = () => {
  const outletContext = useOutletContext() || {};
  const {
    user = null,
    staffInfo = null,
    currentAssignment = null,
    connectionStatus = 'online',
    batteryLevel = null,
    contextLoading = false,
    setCurrentAssignment = null,
  } = outletContext;

  const [gpsData, setGpsData] = useState({
    latitude: null,
    longitude: null,
    speed: null,
    accuracy: null,
    lastUpdate: null
  });
  const [currentLocation, setCurrentLocation] = useState(null);
  const [arrivalAlert, setArrivalAlert] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [currentStation, setCurrentStation] = useState(null);
  const [nextStation, setNextStation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [journeyCompleted, setJourneyCompleted] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [distanceToStation, setDistanceToStation] = useState(null);
  const [runtimeScheduleId, setRuntimeScheduleId] = useState(
    currentAssignment?.schedule_id || null
  );
  const [trackingReady, setTrackingReady] = useState(false);
  const [trackingContextLoading, setTrackingContextLoading] = useState(true);

  const watchIdRef = useRef(null);
  const uploadIntervalRef = useRef(null);
  const latestLocationRef = useRef(null);
  const journeyCompletedRef = useRef(false);
  const sendingLocationRef = useRef(false);
  const firstLocationSentRef = useRef(false);
  const staffIdRef = useRef(staffInfo?.staff_id || null);
  const lastAutoEventRef = useRef({ station: null, time: null, type: null });

  const showNotification = (title, description, type = 'success') => {
    setNotification({ title, description, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const stopGPSTracking = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (uploadIntervalRef.current != null) {
      clearInterval(uploadIntervalRef.current);
      uploadIntervalRef.current = null;
    }

    firstLocationSentRef.current = false;
    sendingLocationRef.current = false;
    setIsTracking(false);
  };

  useEffect(() => {
    staffIdRef.current = staffInfo?.staff_id || null;
  }, [staffInfo?.staff_id]);

  useEffect(() => {
    journeyCompletedRef.current = journeyCompleted;

    if (journeyCompleted) {
      stopGPSTracking();
    }
  }, [journeyCompleted]);

  /*
   * Resolve the RUNTIME tracking context.
   *
   * Important: after a page refresh/restart, React outlet state can be empty or
   * stale even though the backend still has an ACTIVE TrainRiderDevice.  The
   * original working LiveTrackingPage started GPS as soon as it had an
   * assignment; the regression happened when GPS startup became dependent on a
   * very specific pair of assignment/schedule status fields.
   *
   * For an already-started journey, TrainRiderDevice is the authoritative
   * runtime pointer, so recover schedule_id from /tracking/device-status first.
   * Assignment remains the planning/departure source before the journey starts.
   */
  useEffect(() => {
    if (contextLoading || !staffInfo?.staff_id) {
      return undefined;
    }

    let cancelled = false;

    const resolveTrackingContext = async () => {
      setTrackingContextLoading(true);

      try {
        const staffId = staffInfo.staff_id;
        let assignment = currentAssignment || null;
        let deviceStatus = null;

        // Refresh the assignment directly if the outlet context was lost during
        // a browser refresh/direct navigation.
        if (!assignment?.schedule_id) {
          try {
            const response = await api.get(
              `/staff/assignments/current/${staffId}`
            );
            assignment = response.data || null;

            if (assignment && typeof setCurrentAssignment === 'function') {
              setCurrentAssignment(assignment);
            }
          } catch (assignmentError) {
            console.warn(
              'Could not refresh current assignment on tracking page:',
              assignmentError
            );
          }
        }

        // A journey that was already started has a device row bound to the
        // schedule. This survives a frontend reload and is the safest way to
        // resume live tracking.
        try {
          deviceStatus = await locationTrackingApi.getDeviceStatus(staffId);
        } catch (deviceError) {
          // A missing device is expected before the rider presses Depart.
          console.debug(
            'No active/recoverable tracking device yet:',
            deviceError?.detail || deviceError
          );
        }

        if (cancelled) return;

        const deviceIsActive =
          deviceStatus?.status === 'ACTIVE' &&
          Boolean(deviceStatus?.schedule_id);

        const assignmentStatus = assignment?.status || null;
        const scheduleStatus =
          assignment?.schedule_status || assignmentStatus;

        // Backward compatibility: older assignment responses did not include
        // schedule_status. In that shape, ACTIVE assignment is enough because
        // start-journey is what made it ACTIVE.
        const assignmentIsRuntimeActive =
          Boolean(assignment?.schedule_id) &&
          assignmentStatus === 'ACTIVE' &&
          (!assignment?.schedule_status || scheduleStatus === 'ACTIVE');

        const scheduleId =
          (deviceIsActive ? deviceStatus.schedule_id : null) ||
          assignment?.schedule_id ||
          null;

        setRuntimeScheduleId(scheduleId);
        setTrackingReady(deviceIsActive || assignmentIsRuntimeActive);

        if (deviceIsActive || assignmentIsRuntimeActive) {
          setGpsError(null);
        } else if (assignment?.schedule_id) {
          if (
            assignment?.schedule_status === 'ACTIVE' &&
            assignmentStatus !== 'ACTIVE'
          ) {
            setGpsError(
              'The train schedule is ACTIVE, but the rider assignment/device '
              + 'has not been activated. Return Home and press Depart/Resume.'
            );
          } else {
            setGpsError(
              'Journey has not started yet. Press Depart on Train Rider Home first.'
            );
          }
        } else {
          setGpsError(
            'No active journey was found for this rider. '
            + 'Return Home, confirm the assignment, and press Depart.'
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to resolve live tracking context:', error);
          setTrackingReady(false);
          setGpsError(
            'Could not restore the live tracking context from the backend.'
          );
        }
      } finally {
        if (!cancelled) {
          setTrackingContextLoading(false);
        }
      }
    };

    resolveTrackingContext();

    return () => {
      cancelled = true;
    };
  }, [
    contextLoading,
    staffInfo?.staff_id,
    currentAssignment?.assignment_id,
    currentAssignment?.schedule_id,
    currentAssignment?.status,
    currentAssignment?.schedule_status,
    setCurrentAssignment,
  ]);

  useEffect(() => {
    if (!runtimeScheduleId) {
      setRouteStops([]);
      setCurrentStation(null);
      setNextStation(null);
      return;
    }

    fetchRouteStops(runtimeScheduleId);
  }, [runtimeScheduleId]);

  useEffect(() => {
    if (
      !trackingContextLoading &&
      trackingReady &&
      runtimeScheduleId &&
      staffInfo?.staff_id &&
      !journeyCompleted
    ) {
      startGPSTracking();
    } else {
      stopGPSTracking();
    }

    return () => stopGPSTracking();
  }, [
    trackingContextLoading,
    trackingReady,
    runtimeScheduleId,
    staffInfo?.staff_id,
    journeyCompleted,
  ]);

  useEffect(() => {
    if (routeStops.length > 0) {
      updateCurrentAndNextStation();
    }
  }, [routeStops]);

  const updateCurrentAndNextStation = () => {
    const currentStop = routeStops.find(stop => stop.status === 'ARRIVED');

    if (currentStop) {
      setCurrentStation(currentStop.station_name);
    } else {
      setCurrentStation(null);
    }

    const nextStop = routeStops.find(stop => stop.status === 'SCHEDULED');

    if (nextStop) {
      setNextStation(nextStop.station_name);
    } else {
      setNextStation(null);
    }
  };

  const fetchRouteStops = async (
    scheduleId = runtimeScheduleId || currentAssignment?.schedule_id
  ) => {
    if (!scheduleId) return;

    try {
      const response = await schedulesApi.getRouteStops(scheduleId);
      const mappedStops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
        train_stop_id: stop.train_stop_id || null,
      }));

      setRouteStops(mappedStops);

      if (response.schedule_status === 'COMPLETED') {
        setJourneyCompleted(true);
      }
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
      const message =
        err?.detail?.message ||
        err?.detail ||
        'Route stations could not be loaded for this schedule.';

      setGpsError(
        typeof message === 'string'
          ? message
          : 'Route stations could not be loaded for this schedule.'
      );
    }
  };

  const handleStationArrival = async (routeStationId, trainStopId) => {
    if (!routeStationId || !staffInfo?.staff_id) {
      showNotification(
        'Error',
        'Missing rider or station information',
        'error'
      );
      return;
    }

    try {
      setIsUpdating(true);

      // Use the backward-compatible update-location manual path so this file
      // works with both the original locationTracking.js and the newer API
      // wrapper that also exposes /manual-arrival.
      const payload = {
        device_id: staffInfo.staff_id,
        latitude: gpsData.latitude ?? latestLocationRef.current?.latitude ?? 0,
        longitude: gpsData.longitude ?? latestLocationRef.current?.longitude ?? 0,
        speed: gpsData.speed ?? latestLocationRef.current?.speed ?? null,
        accuracy: gpsData.accuracy ?? latestLocationRef.current?.accuracy ?? null,
        manual_arrival: true,
        route_station_id: routeStationId,
        train_stop_id: trainStopId || null,
      };

      const response = await locationTrackingApi.updateLocation(payload);

      if (response.is_last_station) {
        setJourneyCompleted(true);
        setArrivalAlert(null);
        setCurrentStation(response.station_name || null);
        setNextStation(null);
        showNotification(
          '🎉 Journey Complete!',
          'Train has arrived at the final destination.'
        );
      } else {
        setArrivalAlert(response);
        showNotification(
          'Manual Arrival Logged',
          `Arrived at ${response.station_name}.`
        );
      }

      await fetchRouteStops();
    } catch (err) {
      console.error('Failed to log station arrival:', err);
      showNotification(
        'Error',
        err.detail || 'Failed to log station arrival',
        'error'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStationDeparture = async (routeStationId, trainStopId) => {
    try {
      setIsUpdating(true);

      if (!staffInfo?.staff_id) {
        throw { detail: 'Missing rider staff ID' };
      }

      await locationTrackingApi.logDeparture(
        staffInfo.staff_id,
        trainStopId,
        {
          manual_departure: true,
          route_station_id: routeStationId
        }
      );

      showNotification(
        'Station Departed',
        'Train departure has been logged successfully.'
      );
      await fetchRouteStops();
    } catch (err) {
      console.error('Failed to log station departure:', err);
      showNotification(
        'Error',
        err.detail || 'Failed to log station departure',
        'error'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTrackingResponse = async (response) => {
    if (response?.distance_to_station_m != null) {
      setDistanceToStation({
        meters: response.distance_to_station_m,
        station: response.proximity_station_name || null,
      });
    }

    if (response?.arrival_detected) {
      const stationName = response.station_name;
      const now = Date.now();

      if (
        lastAutoEventRef.current.station !== stationName ||
        lastAutoEventRef.current.type !== 'arrival' ||
        now - lastAutoEventRef.current.time > 10000
      ) {
        lastAutoEventRef.current = {
          station: stationName,
          time: now,
          type: 'arrival'
        };

        if (response.is_last_station) {
          setJourneyCompleted(true);
          setArrivalAlert(null);
          setCurrentStation(stationName);
          setNextStation(null);
          showNotification(
            '🎉 Journey Complete!',
            `Train has arrived at final destination: ${stationName}`
          );
        } else {
          showNotification(
            '📍 Auto-Arrived!',
            `Train has arrived at ${stationName}`
          );
          setArrivalAlert(response);
          setCurrentStation(stationName);
          setNextStation(response.next_station?.name || null);
        }
      }

      await fetchRouteStops();
    }

    if (response?.auto_departed) {
      const now = Date.now();

      if (
        lastAutoEventRef.current.type !== 'departure' ||
        now - lastAutoEventRef.current.time > 10000
      ) {
        lastAutoEventRef.current = {
          station: response.station_name || null,
          time: now,
          type: 'departure'
        };

        showNotification(
          '🚂 Auto-Departed!',
          `Train has left ${response.station_name || 'the station'}.`
        );
      }

      setArrivalAlert(null);
      setCurrentStation(null);
      await fetchRouteStops();
    }
  };

  const sendLatestLocation = async () => {
    if (
      journeyCompletedRef.current ||
      sendingLocationRef.current
    ) {
      return;
    }

    const location = latestLocationRef.current;
    const staffId = staffIdRef.current;

    if (!location || !staffId) {
      return;
    }

    sendingLocationRef.current = true;

    try {
      const payload = {
        device_id: staffId,
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        accuracy: location.accuracy
      };

      console.log('📍 POST /tracking/update-location', payload);

      const response = await locationTrackingApi.updateLocation(payload);

      console.log('✅ Tracking update accepted:', response);
      setGpsError(null);
      await handleTrackingResponse(response);
    } catch (err) {
      console.error('Failed to update location:', err);
      const detail = err?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || 'Location could not be sent to the backend.';
      setGpsError(message);
    } finally {
      sendingLocationRef.current = false;
    }
  };

  const handlePosition = (position) => {
    const { latitude, longitude, speed, accuracy } = position.coords;

    const location = {
      latitude,
      longitude,
      speed: speed != null
        ? Math.max(0, Math.round(speed * 2.2369362920544))
        : null,
      accuracy: accuracy != null ? Math.round(accuracy) : null,
    };

    latestLocationRef.current = location;

    setGpsData({
      ...location,
      lastUpdate: new Date()
    });
    setCurrentLocation([latitude, longitude]);
    setGpsError(null);

    // Preserve the behavior of the first working implementation: the first GPS
    // callback immediately sends location to the backend.
    if (!firstLocationSentRef.current) {
      firstLocationSentRef.current = true;
      sendLatestLocation();
    }
  };

  const handleError = (error) => {
    console.error('GPS Error:', error);

    const messages = {
      1: 'Location permission was denied. Allow location access and retry GPS.',
      2: 'Current GPS position is unavailable. Check device location services.',
      3: 'GPS request timed out. Check location services and retry.',
    };

    setGpsError(
      messages[error.code] ||
      error.message ||
      'Unable to read GPS location.'
    );

    // Permission denial will not recover without user action.
    if (error.code === 1) {
      stopGPSTracking();
    }
  };

  const startGPSTracking = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }

    if (!staffIdRef.current) {
      setGpsError('Rider staff ID is missing. Please sign in again.');
      return;
    }

    if (
      !window.isSecureContext &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ) {
      setGpsError(
        'Browser GPS requires HTTPS outside localhost. '
        + 'Open this frontend through HTTPS.'
      );
      return;
    }

    // Do not create duplicate watchers when React StrictMode re-runs effects.
    if (
      watchIdRef.current != null ||
      uploadIntervalRef.current != null
    ) {
      return;
    }

    setGpsError(null);
    setIsTracking(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000
    };

    console.log(
      '🛰️ Starting live GPS for schedule',
      runtimeScheduleId,
      'device',
      staffIdRef.current
    );

    // Request one immediate fix and also start the watcher.
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      options
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    );

    // watchPosition is movement/provider driven, not a guaranteed heartbeat.
    // Keep sending the latest known fix so the backend continues to receive
    // location while the train is moving slowly or temporarily stationary.
    uploadIntervalRef.current = setInterval(
      sendLatestLocation,
      LOCATION_UPLOAD_INTERVAL_MS
    );
  };

  const handleLogDeparture = async () => {
    if (!arrivalAlert?.train_stop_id || !staffInfo?.staff_id) return;

    try {
      await locationTrackingApi.logDeparture(
        staffInfo.staff_id,
        arrivalAlert.train_stop_id,
        {
          manual_departure: true,
          route_station_id: arrivalAlert.route_station_id,
        }
      );

      setArrivalAlert(null);
      await fetchRouteStops();
      showNotification('Departed Station', 'Train has departed.');
    } catch (err) {
      console.error('Failed to log departure:', err);
      showNotification('Error', 'Failed to log departure', 'error');
    }
  };

  const getStationStatusIcon = (status) => {
    switch (status) {
      case 'ARRIVED': return <MapPin className="w-4 h-4 text-green-500" />;
      case 'DEPARTED': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'SCHEDULED': return <Clock className="w-4 h-4 text-gray-400" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStationStatusColor = (status) => {
    switch (status) {
      case 'ARRIVED': return 'bg-green-50 border-green-200';
      case 'DEPARTED': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTime = (timeString) =>
    timeString ? formatRailwayTime(timeString, 'en-US') : null;



  const getNotificationStyles = (type) => {
    switch (type) {
      case 'success': return 'bg-green-50 border-green-500 text-green-800';
      case 'error': return 'bg-red-50 border-red-500 text-red-800';
      case 'warning': return 'bg-yellow-50 border-yellow-500 text-yellow-800';
      default: return 'bg-blue-50 border-blue-500 text-blue-800';
    }
  };

  const departedCount = routeStops.filter(s => s.status === 'DEPARTED').length;
  const finalArrivedCompleted = journeyCompleted && routeStops[routeStops.length - 1]?.status === 'ARRIVED' ? 1 : 0;
  const completedCount = departedCount + finalArrivedCompleted;
  const progressPercent = routeStops.length > 0 ? Math.min(100, (completedCount / routeStops.length) * 100) : 0;
  const nextManualStop = routeStops.find(stop => stop.status === 'SCHEDULED');
  const arrivedManualStop = routeStops.find(stop => stop.status === 'ARRIVED');

  return (
    <div className="min-h-full bg-slate-50/80 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-5 lg:px-6">
        {/* Toast notification */}
        {notification && (
          <div
            className={`fixed right-3 top-3 z-[100] w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl sm:right-5 sm:top-5 sm:w-auto ${
              notification.type === 'success'
                ? 'border-emerald-200 bg-white/95'
                : notification.type === 'error'
                  ? 'border-red-200 bg-white/95'
                  : notification.type === 'warning'
                    ? 'border-amber-200 bg-white/95'
                    : 'border-blue-200 bg-white/95'
            }`}
          >
            <div
              className={`h-1 ${
                notification.type === 'success'
                  ? 'bg-emerald-500'
                  : notification.type === 'error'
                    ? 'bg-red-500'
                    : notification.type === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
              }`}
            />
            <div className="flex items-start gap-3 p-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  notification.type === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : notification.type === 'error'
                      ? 'bg-red-100 text-red-700'
                      : notification.type === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                }`}
              >
                {notification.type === 'success' ? '✓' : notification.type === 'error' ? '!' : 'i'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{notification.title}</p>
                {notification.description && (
                  <p className="mt-0.5 text-sm leading-5 text-slate-600">
                    {notification.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                aria-label="Close notification"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Journey completed */}
        {journeyCompleted && (
          <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-indigo-50" />
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="relative px-5 py-7 text-center sm:px-8 sm:py-9">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-4xl shadow-sm ring-8 ring-emerald-50">
                🎉
              </div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Journey finished
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Journey Completed!
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                All stations have been visited. The schedule, staff assignments, and device
                status have been updated.
              </p>
            </div>
          </section>
        )}

        {/* Live tracking header */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
                <Train className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                    Live Journey Tracking
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      isTracking && !journeyCompleted
                        ? 'bg-emerald-100 text-emerald-700'
                        : journeyCompleted
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isTracking && !journeyCompleted
                          ? 'animate-pulse bg-emerald-500'
                          : journeyCompleted
                            ? 'bg-slate-400'
                            : 'bg-amber-500'
                      }`}
                    />
                    {journeyCompleted ? 'Completed' : isTracking ? 'Live' : 'Standby'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {runtimeScheduleId ? `Schedule #${runtimeScheduleId}` : 'Tracking journey status'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              {connectionStatus === 'online' ? 'Connected' : 'Connection issue'}
              {batteryLevel != null && <span className="ml-2">• Battery {batteryLevel}%</span>}
            </div>
          </div>
        </section>

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: 'GPS',
              value: journeyCompleted ? 'Done' : isTracking ? 'Active' : 'Inactive',
              icon: Satellite,
              iconClass:
                isTracking && !journeyCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
              valueClass:
                isTracking && !journeyCompleted ? 'text-emerald-700' : 'text-slate-900',
            },
            {
              label: 'Speed',
              value: `${journeyCompleted ? 0 : gpsData.speed || 0} mph`,
              icon: Gauge,
              iconClass: 'bg-red-50 text-railway-red-500',
              valueClass: 'text-slate-900',
            },
            {
              label: 'Current station',
              value: journeyCompleted ? 'Destination' : currentStation || 'In Transit',
              icon: MapPin,
              iconClass: 'bg-emerald-100 text-emerald-700',
              valueClass: 'text-slate-900',
            },
            {
              label: 'Next station',
              value: journeyCompleted ? '--' : nextStation || '--',
              icon: Navigation,
              iconClass: 'bg-blue-100 text-blue-700',
              valueClass: 'text-slate-900',
            },
          ].map(({ label, value, icon: Icon, iconClass, valueClass }) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {label}
                  </p>
                  <p className={`mt-0.5 truncate text-sm font-bold ${valueClass}`}>{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* GPS error */}
        {gpsError && !journeyCompleted && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-red-900">GPS / Tracking problem</p>
                <p className="mt-1 text-sm leading-5 text-red-700">{gpsError}</p>
                <p className="mt-2 text-xs text-red-600/80">
                  Schedule: {runtimeScheduleId || '--'} · Runtime: {trackingReady ? 'READY' : 'NOT READY'}
                </p>
                {trackingReady && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 !border-red-300 !bg-white !font-semibold !text-red-700 shadow-sm hover:!bg-red-100 hover:!text-red-800"
                    onClick={() => {
                      stopGPSTracking();
                      startGPSTracking();
                    }}
                  >
                    Retry GPS
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Distance indicator */}
        {distanceToStation && !journeyCompleted && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-500 shadow-sm">
            <Navigation className="h-3.5 w-3.5 text-blue-500" />
            {distanceToStation.station ? `${distanceToStation.station}: ` : ''}
            {distanceToStation.meters} m from station trigger point
          </div>
        )}

        {/* Arrival alert */}
        {arrivalAlert && !journeyCompleted && (
          <section className="relative overflow-hidden rounded-3xl border border-emerald-300 bg-white shadow-xl shadow-emerald-100/60">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
            <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-emerald-100/70 blur-3xl" />
            <div className="relative p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50">
                    <MapPin className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Arrival detected
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-900">Station Arrived!</h2>
                    <p className="mt-0.5 text-sm font-medium text-slate-600">
                      {arrivalAlert.station_name}
                    </p>
                  </div>
                </div>

                {arrivalAlert.next_station && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:min-w-[190px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Next station
                    </p>
                    <p className="mt-1 font-bold text-slate-800">{arrivalAlert.next_station.name}</p>
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-5">
                {manualMode ? (
                  <Button
                    className="!flex !h-12 !w-full !items-center !justify-center !rounded-xl !border-0 !bg-slate-900 !px-5 !font-bold !text-white !shadow-lg hover:!bg-slate-800 sm:!w-auto sm:!min-w-[220px]"
                    onClick={handleLogDeparture}
                    disabled={isUpdating}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {isUpdating ? 'Logging departure…' : 'Manual Depart Now'}
                  </Button>
                ) : (
                  <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    Departure will be logged automatically after the train moves more than 50 m from the station.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Map */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
            <div>
              <h2 className="font-bold text-slate-900">Live route map</h2>
              <p className="text-xs text-slate-500">Current train position and station route</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <span className={`h-1.5 w-1.5 rounded-full ${isTracking ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {isTracking ? 'Tracking' : 'Paused'}
            </div>
          </div>
          <div className="overflow-hidden">
            <TrainTrackerMap
              routeStops={routeStops}
              currentLocation={currentLocation}
              currentStation={currentStation}
              nextStation={nextStation}
              scheduleId={runtimeScheduleId}
            />
          </div>
        </section>

        {/* Manual fallback */}
        {!journeyCompleted && routeStops.length > 0 && (
          <section
            className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${
              manualMode
                ? 'border-amber-300 bg-amber-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    manualMode ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Navigation className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Manual station fallback</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Automatic GPS remains primary. Enable this only when GPS arrival/departure detection needs help.
                  </p>
                </div>
              </div>

              <Button
                variant={manualMode ? 'default' : 'outline'}
                onClick={() => setManualMode(value => !value)}
                disabled={isUpdating}
                className={
                  manualMode
                    ? '!h-11 !rounded-xl !border-0 !bg-slate-900 !px-5 !font-bold !text-white !shadow-md hover:!bg-slate-800'
                    : '!h-11 !rounded-xl !border-2 !border-slate-300 !bg-white !px-5 !font-bold !text-slate-800 !shadow-sm hover:!border-slate-400 hover:!bg-slate-50'
                }
              >
                {manualMode ? 'Disable Manual' : 'Enable Manual'}
              </Button>
            </div>

            {manualMode && (
              <div className="mt-4 border-t border-amber-200 pt-4">
                {arrivedManualStop ? (
                  <Button
                    className="!flex !h-12 !w-full !items-center !justify-center !rounded-xl !border-0 !bg-blue-600 !font-bold !text-white !shadow-md hover:!bg-blue-700 disabled:!opacity-60"
                    onClick={() =>
                      handleStationDeparture(
                        arrivedManualStop.route_station_id,
                        arrivedManualStop.train_stop_id
                      )
                    }
                    disabled={isUpdating || !arrivedManualStop.train_stop_id}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {isUpdating ? 'Processing…' : `Manual Depart — ${arrivedManualStop.station_name}`}
                  </Button>
                ) : nextManualStop ? (
                  <Button
                    className="!flex !h-12 !w-full !items-center !justify-center !rounded-xl !border-0 !bg-emerald-600 !font-bold !text-white !shadow-md hover:!bg-emerald-700 disabled:!opacity-60"
                    onClick={() =>
                      handleStationArrival(
                        nextManualStop.route_station_id,
                        nextManualStop.train_stop_id
                      )
                    }
                    disabled={isUpdating || !nextManualStop.train_stop_id}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {isUpdating ? 'Processing…' : `Manual Arrive — ${nextManualStop.station_name}`}
                  </Button>
                ) : (
                  <p className="rounded-xl bg-white/70 px-4 py-3 text-sm font-medium text-amber-800">
                    No manual action is currently available.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Route stations */}
        {routeStops.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Train className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Route Stations</h2>
                  <p className="text-xs text-slate-500">Journey progress and station activity</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {completedCount}/{routeStops.length} completed
              </span>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>Progress</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    journeyCompleted
                      ? 'bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500'
                      : 'bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {routeStops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === routeStops.length - 1;
                const statusMeta = {
                  ARRIVED: {
                    icon: <MapPin className="h-4 w-4" />,
                    iconWrap: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    card: 'border-emerald-200 bg-emerald-50/60',
                    label: 'At station',
                    labelClass: 'bg-emerald-100 text-emerald-700',
                  },
                  DEPARTED: {
                    icon: <CheckCircle className="h-4 w-4" />,
                    iconWrap: 'bg-blue-100 text-blue-700 border-blue-200',
                    card: 'border-slate-200 bg-slate-50/80',
                    label: isLast ? 'Done' : 'Completed',
                    labelClass: 'bg-blue-100 text-blue-700',
                  },
                  SCHEDULED: {
                    icon: <Clock className="h-4 w-4" />,
                    iconWrap: 'bg-white text-slate-400 border-slate-200',
                    card:
                      nextManualStop?.route_station_id === stop.route_station_id
                        ? 'border-blue-200 bg-blue-50/60'
                        : 'border-slate-200 bg-white',
                    label: 'Next',
                    labelClass: 'bg-blue-100 text-blue-700',
                  },
                }[stop.status] || {
                  icon: <AlertCircle className="h-4 w-4" />,
                  iconWrap: 'bg-slate-100 text-slate-400 border-slate-200',
                  card: 'border-slate-200 bg-white',
                  label: '',
                  labelClass: '',
                };

                return (
                  <div
                    key={stop.route_station_id || stop.id || index}
                    className={`relative rounded-2xl border p-3.5 transition-all duration-300 hover:shadow-sm sm:p-4 ${statusMeta.card}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-white ${statusMeta.iconWrap}`}
                      >
                        {statusMeta.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate font-bold text-slate-900">{stop.station_name}</p>
                          {isFirst && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              Start
                            </span>
                          )}
                          {isLast && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                              End
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          {stop.expected_arrival && <span>🕐 ETA: {stop.expected_arrival}</span>}
                          {stop.expected_departure && <span>🚂 ETD: {stop.expected_departure}</span>}
                          {stop.actual_arrival && (
                            <span className="font-medium text-emerald-600">
                              ✓ Arr: {formatTime(stop.actual_arrival)}
                            </span>
                          )}
                          {stop.actual_departure && (
                            <span className="font-medium text-blue-600">
                              🚂 Dep: {formatTime(stop.actual_departure)}
                            </span>
                          )}
                          {stop.delay_minutes > 0 && (
                            <span className="font-bold text-red-500">
                              ⚠ +{stop.delay_minutes}min
                            </span>
                          )}
                        </div>
                      </div>

                      {statusMeta.label && (
                        <span
                          className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${statusMeta.labelClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* GPS coordinates */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Satellite className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">GPS Coordinates</h2>
              <p className="text-[11px] text-slate-400">Latest device position</p>
            </div>
            {gpsData.lastUpdate && (
              <span className="ml-auto text-[11px] text-slate-400">
                Updated: {gpsData.lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Latitude
              </Label>
              <p className="mt-1 font-mono text-sm font-bold text-slate-800">
                {gpsData.latitude?.toFixed(6) || '--'}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Longitude
              </Label>
              <p className="mt-1 font-mono text-sm font-bold text-slate-800">
                {gpsData.longitude?.toFixed(6) || '--'}
              </p>
            </div>
          </div>

          {gpsData.accuracy && (
            <p className="mt-3 text-xs text-slate-400">
              GPS Accuracy: ±{gpsData.accuracy} meters
            </p>
          )}
        </section>
      </div>
    </div>
  )
};

export default LiveTrackingPage;