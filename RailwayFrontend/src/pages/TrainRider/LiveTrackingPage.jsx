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

const LiveTrackingPage = () => {
  const { user, staffInfo, currentAssignment, connectionStatus, batteryLevel } = useOutletContext();
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
  const [watchId, setWatchId] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [journeyCompleted, setJourneyCompleted] = useState(false);

  const lastAutoEventRef = useRef({ station: null, time: null, type: null });

  const showNotification = (title, description, type = 'success') => {
    setNotification({ title, description, type });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    if (currentAssignment) {
      fetchRouteStops();
      startGPSTracking();
    }
    return () => stopGPSTracking();
  }, [currentAssignment]);

  useEffect(() => {
    if (routeStops.length > 0) {
      updateCurrentAndNextStation();

      const allCompleted = routeStops.every(stop => stop.status === 'DEPARTED');
      const lastStationDeparted = routeStops[routeStops.length - 1]?.status === 'DEPARTED';

      if (allCompleted || lastStationDeparted) {
        setJourneyCompleted(true);
      }
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

  const fetchRouteStops = async () => {
    try {
      const response = await schedulesApi.getRouteStops(currentAssignment.schedule_id);
      const mappedStops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
        train_stop_id: stop.train_stop_id || null,
      }));
      setRouteStops(mappedStops);
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
    }
  };

  const handleStationArrival = async (routeStationId, trainStopId) => {
    if (!routeStationId) {
      showNotification('Error', 'Missing station ID', 'error');
      return;
    }

    try {
      setIsUpdating(true);
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';

      const payload = {
        device_id: deviceId,
        latitude: gpsData.latitude || 0,
        longitude: gpsData.longitude || 0,
        speed: gpsData.speed,
        accuracy: gpsData.accuracy,
        manual_arrival: true,
        route_station_id: routeStationId,
        train_stop_id: trainStopId
      };

      const response = await locationTrackingApi.updateLocation(payload);

      if (response.is_last_station) {
        setJourneyCompleted(true);
        setArrivalAlert(null);
        setCurrentStation(null);
        setNextStation(null);
        showNotification('🎉 Journey Complete!', 'Train has arrived at the final destination. All tables updated!');
      } else {
        showNotification('Station Arrived!', 'Train arrival has been logged successfully.');
      }

      fetchRouteStops();
    } catch (err) {
      console.error('Failed to log station arrival:', err);
      showNotification('Error', err.detail || 'Failed to log station arrival', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStationDeparture = async (routeStationId, trainStopId) => {
    try {
      setIsUpdating(true);
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';

      await locationTrackingApi.logDeparture(deviceId, trainStopId, {
        manual_departure: true,
        route_station_id: routeStationId
      });

      showNotification('Station Departed', 'Train departure has been logged successfully.');
      fetchRouteStops();
    } catch (err) {
      console.error('Failed to log station departure:', err);
      showNotification('Error', err.detail || 'Failed to log station departure', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const startGPSTracking = () => {
    if (!navigator.geolocation) {
      showNotification('GPS Not Available', 'Geolocation is not supported.', 'warning');
      return;
    }
    setIsTracking(true);
    const id = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000, distanceFilter: 10 }
    );
    setWatchId(id);
  };

  const stopGPSTracking = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsTracking(false);
    }
  };

  const handlePosition = async (position) => {
    const { latitude, longitude, speed, accuracy } = position.coords;

    setGpsData({
      latitude,
      longitude,
      speed: speed ? Math.round(speed * 2.2369362920544) : null,
      accuracy: Math.round(accuracy),
      lastUpdate: new Date()
    });

    setCurrentLocation([latitude, longitude]);

    if (journeyCompleted) return;

    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      const response = await locationTrackingApi.updateLocation({
        device_id: deviceId,
        latitude,
        longitude,
        speed: speed ? Math.round(speed * 2.2369362920544) : null,
        accuracy: Math.round(accuracy)
      });

      if (response.arrival_detected) {
        const stationName = response.station_name;
        const now = Date.now();

        if (
          lastAutoEventRef.current.station !== stationName ||
          lastAutoEventRef.current.type !== 'arrival' ||
          now - lastAutoEventRef.current.time > 10000
        ) {
          lastAutoEventRef.current = { station: stationName, time: now, type: 'arrival' };

          if (response.is_last_station) {
            setJourneyCompleted(true);
            setArrivalAlert(null);
            setCurrentStation(null);
            setNextStation(null);
            showNotification('🎉 Journey Complete!', `Train has arrived at final destination: ${stationName}`);
          } else {
            showNotification('📍 Auto-Arrived!', `Train has arrived at ${stationName}`);
            setArrivalAlert(response);
            setCurrentStation(stationName);
            setNextStation(response.next_station?.name || null);
          }
        }

        fetchRouteStops();
      }

      if (response.auto_departed) {
        const now2 = Date.now();
        if (
          lastAutoEventRef.current.type !== 'departure' ||
          now2 - lastAutoEventRef.current.time > 10000
        ) {
          lastAutoEventRef.current = { station: null, time: now2, type: 'departure' };
          showNotification('🚂 Auto-Departed!', 'Train has left the station.');
        }

        setArrivalAlert(null);
        setCurrentStation(null);
        fetchRouteStops();
      }

    } catch (err) {
      console.error('Failed to update location:', err);
    }
  };

  const handleError = (error) => {
    console.error('GPS Error:', error);
  };

  const handleLogDeparture = async () => {
    if (!arrivalAlert?.train_stop_id) return;
    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      await locationTrackingApi.logDeparture(deviceId, arrivalAlert.train_stop_id);
      setArrivalAlert(null);
      fetchRouteStops();
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

  const completedCount = routeStops.filter(s => s.status === 'DEPARTED').length;
  const progressPercent = routeStops.length > 0 ? (completedCount / routeStops.length) * 100 : 0;

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
          <Button className="w-full bg-white text-green-600 hover:bg-green-50" onClick={handleLogDeparture}>
            Confirm Departure
          </Button>
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
            scheduleId={currentAssignment?.schedule_id}
          />
        </Card>
      </div>

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
                      {(stop.status === 'SCHEDULED') && (
                        <Button
                          size="sm"
                          onClick={() => handleStationArrival(stop.route_station_id, stop.train_stop_id)}
                          disabled={isUpdating || journeyCompleted}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs whitespace-nowrap"
                        >
                          <MapPin className="w-3 h-3 mr-1" /> Arrive
                        </Button>
                      )}
                      {stop.status === 'ARRIVED' && (
                        <Button
                          size="sm"
                          onClick={() => handleStationDeparture(stop.route_station_id, stop.train_stop_id)}
                          disabled={isUpdating || journeyCompleted}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs whitespace-nowrap"
                        >
                          <LogOut className="w-3 h-3 mr-1" /> Depart
                        </Button>
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