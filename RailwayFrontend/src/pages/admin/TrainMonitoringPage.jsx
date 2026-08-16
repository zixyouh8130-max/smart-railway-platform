// pages/Admin/TrainMonitoringPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Train, RefreshCw, Wifi, WifiOff, MapPin, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import adminDashboardApi from '@/api/adminDashboard';

const POLL_INTERVAL = 60000;

// Train icon (red)
const trainIcon = L.divIcon({
  className: 'custom-train-icon',
  html: `<div style="
    background: #dc2626; width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white; box-shadow: 0 4px 15px rgba(220,38,38,0.6);
  "><span style="font-size: 16px;">🚂</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Station icon (blue)
const stationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #2563eb; width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid white; box-shadow: 0 2px 8px rgba(37,99,235,0.4);
  "><span style="font-size: 11px;">🚉</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// 🆕 Map Controller to center on first active train
const MapController = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);

  return null;
};

const TrainMonitoringPage = () => {
  const [activeTrains, setActiveTrains] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [expandedTrain, setExpandedTrain] = useState(null);
  const pollRef = useRef(null);

  // 🆕 Default center: Myanmar center (will be overridden by MapController)
  const defaultCenter = [21.9162, 95.9560];

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [trainsData, stationsData] = await Promise.all([
        adminDashboardApi.getActiveTrains(),
        adminDashboardApi.getAllStations(),
      ]);

      setActiveTrains(trainsData.trains || []);
      setAllStations(stationsData.stations || []);
      setLastUpdated(new Date());
      setConnectionError(false);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  };

  const stationsWithCoords = allStations.filter(s => s.latitude && s.longitude);
  const trainsWithLocation = activeTrains.filter(t => t.device?.latitude && t.device?.longitude);

  // 🆕 Calculate map center based on first active train
  const mapCenter = trainsWithLocation.length > 0
    ? [trainsWithLocation[0].device.latitude, trainsWithLocation[0].device.longitude]
    : defaultCenter;

  const mapZoom = trainsWithLocation.length > 0 ? 12 : 7;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ARRIVED': return <MapPin className="w-3 h-3 text-green-500" />;
      case 'DEPARTED': return <CheckCircle className="w-3 h-3 text-blue-500" />;
      case 'SCHEDULED': return <Clock className="w-3 h-3 text-gray-400" />;
      case 'DELAYED': return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      default: return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ARRIVED': return 'bg-green-100 text-green-700';
      case 'DEPARTED': return 'bg-blue-100 text-blue-700';
      case 'DELAYED': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return null;
    try {
      let date;
      if (timeString.endsWith('Z') || timeString.includes('+')) {
        date = new Date(timeString);
      } else {
        date = new Date(timeString + 'Z');
      }

      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Yangon'
      });
    } catch (err) {
      console.error('Error formatting time:', timeString, err);
      return timeString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🚂 Train Monitoring</h1>
            <p className="text-sm text-gray-500">
              {allStations.length} stations · {activeTrains.length} active trains
            </p>
          </div>
          <div className="flex items-center gap-4">
            {connectionError ? (
              <span className="flex items-center gap-1 text-red-500 text-sm">
                <WifiOff className="w-4 h-4" /> Disconnected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-green-500 text-sm">
                <Wifi className="w-4 h-4" /> Live
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-1">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card padding="p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{allStations.length}</p>
            <p className="text-xs text-gray-500">Total Stations</p>
          </div>
        </Card>
        <Card padding="p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{activeTrains.length}</p>
            <p className="text-xs text-gray-500">Active Trains</p>
          </div>
        </Card>
        <Card padding="p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{trainsWithLocation.length}</p>
            <p className="text-xs text-gray-500">GPS Tracked</p>
          </div>
        </Card>
        <Card padding="p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{stationsWithCoords.length}</p>
            <p className="text-xs text-gray-500">Mapped Stations</p>
          </div>
        </Card>
      </div>

      {/* Map */}
      <Card padding="p-0" className="overflow-hidden mb-4 relative" style={{ height: '450px' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
        >
          {/* 🆕 Auto-center on first active train */}
          <MapController center={mapCenter} zoom={mapZoom} />

          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Station Markers */}
          {stationsWithCoords.map((station) => (
            <Marker key={`station-${station.id}`} position={[station.latitude, station.longitude]} icon={stationIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{station.name}</p>
                  {station.code && <p className="text-xs text-gray-500">Code: {station.code}</p>}
                  {station.city && <p className="text-xs text-gray-500">{station.city}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Train Markers */}
          {trainsWithLocation.map((train) => (
            <React.Fragment key={`train-${train.train_id}`}>
              <Marker position={[train.device.latitude, train.device.longitude]} icon={trainIcon}>
                <Popup>
                  <div className="text-sm min-w-[160px]">
                    <p className="font-bold">🚂 {train.train_name}</p>
                    <p className="text-xs">{train.train_no}</p>
                    <p className="text-xs mt-1">Status: <span className="text-green-600 font-semibold">{train.status}</span></p>
                    <p className="text-xs">Progress: {Math.round(train.progress_percent)}%</p>
                    {train.device.speed !== null && <p className="text-xs">Speed: {train.device.speed || 0} km/h</p>}
                    {train.device.last_update && (
                      <p className="text-xs text-gray-400">
                        Updated: {new Date(train.device.last_update).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[train.device.latitude, train.device.longitude]}
                radius={3}
                pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.1, weight: 2, dashArray: '4, 4' }}
              />
            </React.Fragment>
          ))}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg shadow-lg p-3 z-[1000] text-xs">
          <h4 className="font-semibold mb-1">Legend</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-600"></div> Active Train</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600"></div> Station</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-red-400" style={{ width: '12px', borderTop: '2px dashed #dc2626' }}></div>
              3m Zone
            </div>
          </div>
        </div>
      </Card>

      {/* Active Trains with Station Progress */}
      {activeTrains.length > 0 ? (
        <div className="space-y-4">
          {activeTrains.map((train) => (
            <Card key={train.train_id} padding="p-4">
              {/* Train Header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedTrain(expandedTrain === train.train_id ? null : train.train_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Train className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">{train.train_name}</h3>
                    <p className="text-xs text-gray-500">{train.train_no} · Dep: {train.departure_time}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    train.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {train.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {train.completed_stations}/{train.total_stations}
                  </span>
                  <span className="text-sm">{expandedTrain === train.train_id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-gray-200 rounded-full mt-3 mb-1">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${train.progress_percent}%` }}
                />
              </div>

              {/* Device Info */}
              {train.device && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                  {train.device.speed !== null && <span>⚡ {train.device.speed || 0} km/h</span>}
                  <span className="font-mono">
                    📍 {train.device.latitude?.toFixed(4)}, {train.device.longitude?.toFixed(4)}
                  </span>
                  {train.device.last_update && (
                    <span>🕐 {new Date(train.device.last_update).toLocaleTimeString()}</span>
                  )}
                </div>
              )}

              {/* Station List (Expanded) */}
              {expandedTrain === train.train_id && train.stations && (
                <div className="mt-3 pt-3 border-t">
                  <h4 className="font-semibold text-sm mb-2">Route Stations</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {train.stations.map((station, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded text-xs ${
                          station.status === 'ARRIVED' ? 'bg-blue-50' :
                          station.status === 'DEPARTED' ? 'bg-green-50' :
                          station.status === 'DELAYED' ? 'bg-yellow-50' :
                          'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            station.status === 'DEPARTED' ? 'bg-green-500' :
                            station.status === 'ARRIVED' ? 'bg-blue-500' :
                            station.status === 'DELAYED' ? 'bg-yellow-500' :
                            'bg-gray-300'
                          }`} />
                          <span className="font-medium">{station.station_name}</span>
                          {idx === 0 && <span className="text-amber-600 text-xs">(Start)</span>}
                          {idx === train.stations.length - 1 && <span className="text-purple-600 text-xs">(End)</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${getStatusColor(station.status)}`}>
                            {station.status}
                          </span>
                          {station.arrival_time && (
                            <span className="text-gray-500">Arr: {formatTime(station.arrival_time)}</span>
                          )}
                          {station.departure_time && station.status === 'DEPARTED' && (
                            <span className="text-gray-500">Dep: {formatTime(station.departure_time)}</span>
                          )}
                          {station.delay_minutes > 0 && (
                            <span className="text-red-500 font-medium">+{station.delay_minutes}m</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card padding="p-8" className="text-center">
          <Train className="w-16 h-16 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-600">No Active Trains</h3>
          <p className="text-gray-400">There are no trains currently running.</p>
        </Card>
      )}

      {/* All Stations Table */}
      <Card padding="p-4" className="mt-4">
        <h3 className="font-bold text-lg mb-3">🚉 All Stations ({allStations.length})</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left">
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 font-semibold">Code</th>
                <th className="pb-2 font-semibold">City</th>
                <th className="pb-2 font-semibold">Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {allStations.map((station) => (
                <tr key={station.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 font-medium">{station.name}</td>
                  <td className="py-2 text-gray-500">{station.code || '--'}</td>
                  <td className="py-2">{station.city || '--'}</td>
                  <td className="py-2 text-xs font-mono">
                    {station.latitude
                      ? `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default TrainMonitoringPage;