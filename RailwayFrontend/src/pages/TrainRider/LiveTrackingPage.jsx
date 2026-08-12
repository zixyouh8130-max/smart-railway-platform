// pages/TrainRider/LiveTrackingPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MapPin, Navigation, Clock, Gauge, Satellite, Train } from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import TrainTrackerMap from '@/pages/TrainRider/TrainTrackerMap';

import api from '@/api/axios';

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

  useEffect(() => {
    if (currentAssignment) {
      fetchRouteStops();
      startGPSTracking();
    }
    return () => stopGPSTracking();
  }, [currentAssignment]);

  
  useEffect(() => {
    if (routeStops.length > 0) {
      // Find the first upcoming station (not DEPARTED)
      const nextIdx = routeStops.findIndex(
        stop => stop.status !== 'DEPARTED'
      );
      if (nextIdx >= 0) {
        setNextStation(routeStops[nextIdx].station_name);
      }
      
      // Find current station (ARRIVED status)
      const currentStop = routeStops.find(stop => stop.status === 'ARRIVED');
      if (currentStop) {
        setCurrentStation(currentStop.station_name);
      }
    }
  }, [routeStops]);

  const fetchRouteStops = async () => {
    try {
      // Get route stops with coordinates
      const response = await api.get(`/schedules/${currentAssignment.schedule_id}/route-stops`);
      setRouteStops(response.data.stops || []);
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
      // Fallback to dashboard endpoint
      try {
        const dashboardRes = await api.get(`/dashboard/train/${currentAssignment.train_id}`);
        setRouteStops(dashboardRes.data.route_progress || []);
        
        // Set current/next station
        const currentStop = dashboardRes.data.route_progress?.find(s => s.status === 'ARRIVED');
        if (currentStop) setCurrentStation(currentStop.station_name);
        
        const nextIdx = dashboardRes.data.route_progress?.findIndex(s => s.status === 'ARRIVED');
        if (nextIdx >= 0 && nextIdx < dashboardRes.data.route_progress?.length - 1) {
          setNextStation(dashboardRes.data.route_progress[nextIdx + 1]?.station_name);
        }
      } catch (err2) {
        console.error('Fallback also failed:', err2);
      }
    }
  };

  const startGPSTracking = () => {
    if (!navigator.geolocation) return;
    setIsTracking(true);
    const id = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        distanceFilter: 5
      }
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
      speed: speed ? Math.round(speed * 3.6) : null,
      accuracy: Math.round(accuracy),
      lastUpdate: new Date()
    });
    
    setCurrentLocation([latitude, longitude]);

    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      const response = await api.post('/tracking/update-location', {
        device_id: deviceId,
        latitude,
        longitude,
        speed: speed ? Math.round(speed * 3.6) : null,
        accuracy: Math.round(accuracy)
      });

      if (response.data.arrival_detected) {
        setArrivalAlert(response.data);
        setCurrentStation(response.data.station_name);
        setNextStation(response.data.next_station?.name || null);
        fetchRouteStops(); // Refresh route progress
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
      await api.post(`/tracking/log-departure/${deviceId}/${arrivalAlert.train_stop_id}`);
      setArrivalAlert(null);
      fetchRouteStops();
    } catch (err) {
      console.error('Failed to log departure:', err);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* GPS Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Satellite className={`w-4 h-4 ${isTracking ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500">GPS</p>
              <p className="text-sm font-semibold">{isTracking ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-railway-red-500" />
            <div>
              <p className="text-xs text-gray-500">Speed</p>
              <p className="text-sm font-semibold">{gpsData.speed || 0} km/h</p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-xs text-gray-500">Station</p>
              <p className="text-sm font-semibold truncate">{currentStation || 'In Transit'}</p>
            </div>
          </div>
        </Card>
        <Card padding="p-3" hover={false}>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-gray-500">Next</p>
              <p className="text-sm font-semibold truncate">{nextStation || '--'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Arrival Alert */}
      {arrivalAlert && (
        <Card padding="p-4" className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0">
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
          <Button 
            className="w-full bg-white text-green-600 hover:bg-green-50"
            onClick={handleLogDeparture}
          >
            Confirm Departure
          </Button>
        </Card>
      )}

      {/* 🗺️ Map */}
      <Card padding="p-0" hover={false} className="overflow-hidden">
        <TrainTrackerMap
          routeStops={routeStops}
          currentLocation={currentLocation}
          currentStation={currentStation}
          nextStation={nextStation}
          scheduleId={currentAssignment?.schedule_id} 
        />
      </Card>

      {/* Current Coordinates */}
      <Card padding="p-4">
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
      </Card>
    </div>
  );
};

export default LiveTrackingPage;