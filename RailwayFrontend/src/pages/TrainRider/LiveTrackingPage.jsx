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
    <div className="space-y-4 pb-20">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg border-l-4 shadow-lg ${getNotificationStyles(notification.type)}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{notification.title}</p>
              {notification.description && <p className="text-sm mt-1">{notification.description}</p>}
            </div>
            <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Journey Completed Banner */}
      {journeyCompleted && (
        <Card padding="p-6" className="bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-0 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-xl font-bold mb-2">Journey Completed!</h3>
          <p className="text-sm opacity-90 mb-3">
            All stations have been visited. The schedule, staff assignments, and device status have been updated.
          </p>
        </Card>
      )}

      {/* GPS Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Satellite className={`w-4 h-4 ${isTracking && !journeyCompleted ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500">GPS</p>
              <p className="text-sm font-semibold">
                {journeyCompleted ? 'Done' : isTracking ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-railway-red-500" />
            <div>
              <p className="text-xs text-gray-500">Speed</p>
              <p className="text-sm font-semibold">{journeyCompleted ? '0' : gpsData.speed || 0} mph</p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-xs text-gray-500">Station</p>
              <p className="text-sm font-semibold truncate">
                {journeyCompleted ? 'Destination' : currentStation || 'In Transit'}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-gray-500">Next</p>
              <p className="text-sm font-semibold truncate">{journeyCompleted ? '--' : nextStation || '--'}</p>
            </div>
          </div>
        </Card>
      </div>

      {gpsError && !journeyCompleted && (
        <Card padding="p-4" className="bg-red-50 border-red-200">
          <div className="flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">GPS / Tracking problem</p>
              <p className="text-sm mt-1">{gpsError}</p>
              <p className="text-xs mt-2 opacity-80">
                Schedule: {runtimeScheduleId || '--'} · Runtime: {trackingReady ? 'READY' : 'NOT READY'}
              </p>
              {trackingReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
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
        </Card>
      )}

      {distanceToStation && !journeyCompleted && (
        <p className="text-xs text-center text-gray-500">
          {distanceToStation.station ? `${distanceToStation.station}: ` : ''}
          {distanceToStation.meters} m from station trigger point
        </p>
      )}

      {/* Arrival Alert */}
      {arrivalAlert && !journeyCompleted && (
        <Card padding="p-4" className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <MapPin className="w-8 h-8" />
            <div>
              <h3 className="text-lg font-bold">Station Arrived!</h3>
              <p className="text-sm opacity-90">{arrivalAlert.station_name}</p>
            </div>
          </div>
          {arrivalAlert.next_station && (
            <div className="bg-white/10 rounded-lg p-3 mb-3">
              <p className="text-sm">Next: <strong>{arrivalAlert.next_station.name}</strong></p>
            </div>
          )}
          {manualMode ? (
            <Button className="w-full bg-white text-green-600 hover:bg-green-50" onClick={handleLogDeparture}>
              Manual Depart Now
            </Button>
          ) : (
            <p className="text-xs opacity-90">Departure will be logged automatically after the train moves more than 50 m from the station.</p>
          )}
        </Card>
      )}

      {/* 🗺️ Map */}
      <div className="flex justify-center">
        <Card
          padding="p-0"
          hover={false}
          className="overflow-hidden"
          style={{ width: '100%', maxWidth: '800px' }}  // 🆕 Specific width
        >
          <TrainTrackerMap
            routeStops={routeStops}
            currentLocation={currentLocation}
            currentStation={currentStation}
            nextStation={nextStation}
            scheduleId={runtimeScheduleId}
          />
        </Card>
      </div>

      {/* Optional manual fallback controls */}
      {!journeyCompleted && routeStops.length > 0 && (
        <Card padding="p-4" className="border-amber-200 bg-amber-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-900">Manual station fallback</p>
              <p className="text-xs text-amber-700 mt-1">
                Automatic GPS remains primary. Enable this only when GPS arrival/departure detection needs help.
              </p>
            </div>
            <Button
              variant={manualMode ? 'default' : 'outline'}
              onClick={() => setManualMode(value => !value)}
              disabled={isUpdating}
            >
              {manualMode ? 'Disable Manual' : 'Enable Manual'}
            </Button>
          </div>

          {manualMode && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              {arrivedManualStop ? (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleStationDeparture(arrivedManualStop.route_station_id, arrivedManualStop.train_stop_id)}
                  disabled={isUpdating || !arrivedManualStop.train_stop_id}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Manual Depart — {arrivedManualStop.station_name}
                </Button>
              ) : nextManualStop ? (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleStationArrival(nextManualStop.route_station_id, nextManualStop.train_stop_id)}
                  disabled={isUpdating || !nextManualStop.train_stop_id}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Manual Arrive — {nextManualStop.station_name}
                </Button>
              ) : (
                <p className="text-sm text-amber-800">No manual action is currently available.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Route Stations List */}
      {routeStops.length > 0 && (
        <Card padding="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Train className="w-5 h-5 text-railway-blue-500" />
              <h3 className="font-bold text-lg">Route Stations</h3>
            </div>
            <span className="text-sm text-gray-500">
              {completedCount}/{routeStops.length} completed
            </span>
          </div>

          <div className="w-full h-2 bg-gray-200 rounded-full mb-4">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                journeyCompleted
                  ? 'bg-gradient-to-r from-green-500 via-purple-500 to-pink-500'
                  : 'bg-gradient-to-r from-green-500 via-blue-500 to-purple-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="space-y-3">
            {routeStops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === routeStops.length - 1;

              return (
                <div
                  key={stop.route_station_id || stop.id || index}
                  className={`p-3 rounded-lg border ${getStationStatusColor(stop.status)} transition-all duration-300`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-gray-300">
                        {getStationStatusIcon(stop.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{stop.station_name}</p>
                          {isFirst && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Start</span>}
                          {isLast && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">End</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                          {stop.expected_arrival && <span>🕐 ETA: {stop.expected_arrival}</span>}
                          {stop.expected_departure && <span>🚂 ETD: {stop.expected_departure}</span>}
                          {stop.actual_arrival && <span className="text-green-600">✅ Arr: {formatTime(stop.actual_arrival)}</span>}
                          {stop.actual_departure && <span className="text-blue-600">🚂 Dep: {formatTime(stop.actual_departure)}</span>}
                          {stop.delay_minutes > 0 && <span className="text-red-500 font-medium">⚠️ +{stop.delay_minutes}min</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-3">
                      {stop.status === 'ARRIVED' && (
                        <span className="text-xs text-green-700 font-medium self-center">At station</span>
                      )}
                      {stop.status === 'SCHEDULED' && nextManualStop?.route_station_id === stop.route_station_id && (
                        <span className="text-xs text-blue-600 font-medium self-center">Next</span>
                      )}
                      {stop.status === 'DEPARTED' && (
                        <span className="text-xs text-green-600 font-medium self-center">
                          {isLast ? '🏁 Done' : '✓ Done'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* GPS Coordinates */}
      <Card padding="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Satellite className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-sm">GPS Coordinates</h3>
          {gpsData.lastUpdate && (
            <span className="text-xs text-gray-400 ml-auto">
              Updated: {gpsData.lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs text-gray-500">Latitude</Label>
            <p className="font-mono font-semibold">{gpsData.latitude?.toFixed(6) || '--'}</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Longitude</Label>
            <p className="font-mono font-semibold">{gpsData.longitude?.toFixed(6) || '--'}</p>
          </div>
        </div>
        {gpsData.accuracy && (
          <p className="text-xs text-gray-400 mt-2">
            GPS Accuracy: ±{gpsData.accuracy} meters
          </p>
        )}
      </Card>
    </div>
  );
};

export default LiveTrackingPage;