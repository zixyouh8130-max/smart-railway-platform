// components/TrainRider/TrainRiderMobileView.jsx
import React, { useState, useEffect } from 'react';
import { MapPin, Train, Clock, Navigation, Wifi, WifiOff, Battery } from 'lucide-react';
import api from '@/api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const TrainRiderMobileView = ({ deviceId = 'TRAIN_RIDER_001' }) => {
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [gpsData, setGpsData] = useState({
    latitude: null,
    longitude: null,
    speed: null,
    accuracy: null,
    lastUpdate: null
  });
  const [arrivalAlert, setArrivalAlert] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [trainStops, setTrainStops] = useState([]);
  const [currentStationIndex, setCurrentStationIndex] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null);

  useEffect(() => {
    fetchDeviceStatus();
    startGPSTracking();
    
    const statusInterval = setInterval(fetchDeviceStatus, 5000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchDeviceStatus = async () => {
    try {
      const response = await api.get(`/tracking/device-status/${deviceId}`);
      setDeviceStatus(response.data);
      
      if (response.data.train) {
        const stopsResponse = await api.get(`/train-stops/train/${response.data.train.id}`);
        setTrainStops(stopsResponse.data);
        
        const currentIndex = stopsResponse.data.findIndex(stop => 
          stop.route_station?.station_name === response.data.current_station
        );
        setCurrentStationIndex(currentIndex);
      }
    } catch (err) {
      console.error('Failed to fetch device status:', err);
    }
  };

  const startGPSTracking = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude, speed, accuracy } = position.coords;
          
          setGpsData({
            latitude,
            longitude,
            speed: speed ? Math.round(speed * 2.2369362920544) : null,
            accuracy: Math.round(accuracy),
            lastUpdate: new Date()
          });
          
          setConnectionStatus('connected');
          
          try {
            const result = await api.post('/tracking/update-location', {
              device_id: deviceId,
              latitude,
              longitude,
              speed: speed ? Math.round(speed * 2.2369362920544) : null,
              accuracy: Math.round(accuracy)
            });
            
            if (result.data.arrival_detected) {
              setArrivalAlert(result.data);
            }
          } catch (err) {
            console.error('Failed to update location:', err);
          }
        },
        (error) => {
          setConnectionStatus('error');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  };

  const handleLogDeparture = async (trainStopId) => {
    try {
      await api.post(`/tracking/log-departure/${deviceId}/${trainStopId}`);
      setArrivalAlert(null);
      fetchDeviceStatus();
    } catch (err) {
      console.error('Failed to log departure:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-3 shadow-lg">
          <Train className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Train Rider</h1>
        
        <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm mt-2 ${
          connectionStatus === 'connected' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {connectionStatus === 'connected' ? (
            <Wifi className="w-4 h-4 mr-2 animate-pulse" />
          ) : (
            <WifiOff className="w-4 h-4 mr-2" />
          )}
          {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Arrival Alert */}
      {arrivalAlert && (
        <Card className="mb-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center mb-3">
              <MapPin className="w-8 h-8 mr-3" />
              <div>
                <h3 className="text-xl font-bold">Station Arrived!</h3>
                <p className="text-sm opacity-90">{arrivalAlert.station_name}</p>
              </div>
            </div>
            
            {arrivalAlert.next_station && (
              <div className="bg-white/10 rounded-lg p-3 mb-3">
                <p className="text-sm">Next: {arrivalAlert.next_station.name}</p>
                {arrivalAlert.next_station.expected_arrival && (
                  <p className="text-sm">
                    Expected: {new Date(arrivalAlert.next_station.expected_arrival).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
            
            <Button 
              className="w-full bg-white text-green-600"
              onClick={() => handleLogDeparture(arrivalAlert.train_stop_id)}
            >
              Log Departure
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status Card */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Current Station</p>
              <p className="font-semibold text-gray-800">
                {deviceStatus?.current_station || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Next Station</p>
              <p className="font-semibold text-gray-800">
                {deviceStatus?.next_station || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Speed</p>
              <p className="font-semibold text-gray-800">
                {gpsData.speed ? `${gpsData.speed} mph` : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Accuracy</p>
              <p className="font-semibold text-gray-800">
                {gpsData.accuracy ? `${gpsData.accuracy}m` : '--'}
              </p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Lat: {gpsData.latitude?.toFixed(6) || '--'}</span>
              <span className="text-gray-500">Lng: {gpsData.longitude?.toFixed(6) || '--'}</span>
              <span className="text-gray-500">
                Updated: {gpsData.lastUpdate?.toLocaleTimeString() || '--'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Route Timeline */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-gray-800 mb-4">Route Timeline</h3>
          <div className="space-y-0">
            {trainStops.map((stop, index) => {
              const station = stop.route_station;
              let status = 'upcoming';
              
              if (currentStationIndex !== null) {
                if (index < currentStationIndex) status = 'completed';
                else if (index === currentStationIndex) status = 'current';
              }
              
              return (
                <div key={stop.id} className="flex items-start">
                  <div className="flex flex-col items-center mr-3">
                    <div className={`w-3 h-3 rounded-full ${
                      status === 'completed' ? 'bg-green-500' :
                      status === 'current' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    {index < trainStops.length - 1 && (
                      <div className={`w-0.5 h-8 ${
                        status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                  <div className={`flex-1 pb-4 ${
                    status === 'current' ? 'bg-blue-50 rounded-lg p-2 -ml-2' : ''
                  }`}>
                    <p className="font-medium text-sm">{station?.station_name}</p>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1">
                      {stop.expected_arrival_time && (
                        <span>Arr: {stop.expected_arrival_time}</span>
                      )}
                      {stop.expected_departure_time && (
                        <span>Dep: {stop.expected_departure_time}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainRiderMobileView;