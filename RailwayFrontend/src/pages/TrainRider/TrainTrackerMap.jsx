// components/TrainRider/TrainTrackerMap.jsx
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 🚂 Train icon (current location)
const trainIcon = L.divIcon({
  className: 'custom-train-icon',
  html: `<div style="
    background: #dc2626;
    width: 48px; height: 48px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 4px solid white;
    box-shadow: 0 4px 20px rgba(220,38,38,0.6);
    animation: trainPulse 2s infinite;
  ">
    <span style="font-size: 24px;">🚂</span>
  </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

// ✅ Completed station icon (green)
const completedStationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #16a34a;
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white;
    box-shadow: 0 0 0 4px rgba(22,163,74,0.3), 0 2px 8px rgba(0,0,0,0.2);
  ">
    <span style="font-size: 16px;">✅</span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 📍 Current station icon (blue with pulse)
const currentStationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #2563eb;
    width: 42px; height: 42px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 4px solid white;
    box-shadow: 0 0 0 6px rgba(37,99,235,0.4), 0 4px 16px rgba(0,0,0,0.3);
    animation: stationPulse 1.5s infinite;
  ">
    <span style="font-size: 18px;">📍</span>
  </div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

// ⏳ Upcoming station icon (gray)
const upcomingStationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #9ca3af;
    width: 30px; height: 30px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white;
    box-shadow: 0 0 0 3px rgba(156,163,175,0.2), 0 2px 6px rgba(0,0,0,0.1);
  ">
    <span style="font-size: 13px;">⏳</span>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// 🚩 Departure station (first station)
const departureStationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #f59e0b;
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white;
    box-shadow: 0 0 0 4px rgba(245,158,11,0.3), 0 2px 8px rgba(0,0,0,0.2);
  ">
    <span style="font-size: 16px;">🚩</span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 🏁 Destination station (last station)
const destinationStationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: #8b5cf6;
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white;
    box-shadow: 0 0 0 4px rgba(139,92,246,0.3), 0 2px 8px rgba(0,0,0,0.2);
  ">
    <span style="font-size: 16px;">🏁</span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 🆕 Map Controller to auto-recenter on current location
const MapController = ({ currentLocation }) => {
  const map = useMap();

  useEffect(() => {
    if (currentLocation) {
      map.setView(currentLocation, 14); // Zoom to level 14 for closer view
    }
  }, [currentLocation, map]);

  return null;
};

const TrainTrackerMap = ({
  routeStops = [],
  currentLocation,
  currentStation,
  nextStation,
  scheduleId
}) => {
  const [currentStopIndex, setCurrentStopIndex] = useState(-1);
  const [mapReady, setMapReady] = useState(false);

  // 🆕 Default center: current location > first station > Myanmar
  const defaultCenter = currentLocation ||
    (routeStops.find(s => s.latitude && s.longitude)
      ? [routeStops.find(s => s.latitude && s.longitude).latitude,
         routeStops.find(s => s.latitude && s.longitude).longitude]
      : [21.9162, 95.9560]);

  // Find current station index
  useEffect(() => {
    if (routeStops?.length > 0) {
      const arrivedIdx = routeStops.findIndex(s => s.status === 'ARRIVED');
      const idx = arrivedIdx >= 0 ? arrivedIdx : routeStops.filter(s => s.status === 'DEPARTED').length - 1;
      setCurrentStopIndex(idx);
    }
  }, [routeStops]);

  useEffect(() => {
    setMapReady(true);
  }, []);

  // Get route path coordinates
  const routePath = routeStops
    .filter(stop => stop.latitude && stop.longitude)
    .map(stop => [stop.latitude, stop.longitude]);

  // Get completed path
  const completedPath = routeStops
    .filter(stop => (stop.status === 'DEPARTED' || stop.status === 'ARRIVED') && stop.latitude && stop.longitude)
    .map(stop => [stop.latitude, stop.longitude]);

  const getStationIcon = (stop, index) => {
    if (index === 0 && stop.status !== 'DEPARTED') return departureStationIcon;
    if (index === routeStops.length - 1) return destinationStationIcon;
    if (stop.status === 'DEPARTED') return completedStationIcon;
    if (stop.status === 'ARRIVED') return currentStationIcon;
    return upcomingStationIcon;
  };

  const getStationStatusLabel = (stop, index) => {
    if (index === 0 && stop.status !== 'DEPARTED') return 'Departure';
    if (index === routeStops.length - 1) return 'Destination';
    if (stop.status === 'DEPARTED') return 'Completed';
    if (stop.status === 'ARRIVED') return 'Current Station';
    return 'Upcoming';
  };

  const formatTime = (timeString) => {
    if (!timeString) return null;
    try {
      return new Date(timeString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Yangon'
      });
    } catch {
      return timeString;
    }
  };

  if (!mapReady) {
    return (
      <div className="w-full bg-gray-100 flex items-center justify-center" style={{ height: '400px' }}>
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{
      height: '400px',
      minHeight: '350px',
      maxHeight: '500px'
    }}>
      {/* CSS for pulse animations */}
      <style>{`
        @keyframes trainPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(220,38,38,0.6); }
          50% { box-shadow: 0 4px 30px rgba(220,38,38,0.9); }
        }
        @keyframes stationPulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(37,99,235,0.4), 0 4px 16px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(37,99,235,0.1), 0 4px 20px rgba(0,0,0,0.4); }
        }
        .leaflet-container {
          border-radius: 12px;
        }
      `}</style>

      <MapContainer
        center={defaultCenter}
        zoom={currentLocation ? 14 : 8}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        zoomControl={true}
      >
        {/* 🆕 Auto-recenter map when location changes */}
        <MapController currentLocation={currentLocation} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route Line - Full planned route */}
        {routePath.length > 1 && (
          <Polyline
            positions={routePath}
            color="#6b7280"
            weight={3}
            opacity={0.3}
            dashArray="10, 10"
          />
        )}

        {/* Completed Route Line */}
        {completedPath.length > 1 && (
          <Polyline
            positions={completedPath}
            color="#16a34a"
            weight={4}
            opacity={0.6}
          />
        )}

        {/* Station Markers */}
        {routeStops.map((stop, index) => {
          if (!stop.latitude || !stop.longitude) return null;
          const isCurrent = stop.status === 'ARRIVED';
          const isCompleted = stop.status === 'DEPARTED';
          const isFirst = index === 0;
          const isLast = index === routeStops.length - 1;

          return (
            <Marker
              key={`station-${stop.route_station_id || stop.id || index}`}
              position={[stop.latitude, stop.longitude]}
              icon={getStationIcon(stop, index)}
            >
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <p className="font-bold text-gray-900 text-base">{stop.station_name}</p>
                  {stop.station_code && (
                    <p className="text-xs text-gray-500">Code: {stop.station_code}</p>
                  )}

                  <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${
                    isCompleted ? 'bg-green-100 text-green-700' :
                    isCurrent ? 'bg-blue-100 text-blue-700' :
                    isFirst && !isCompleted ? 'bg-amber-100 text-amber-700' :
                    isLast ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {getStationStatusLabel(stop, index)}
                  </div>

                  <div className="mt-2 space-y-1 border-t pt-2">
                    {stop.expected_arrival && (
                      <p className="text-xs flex items-center gap-1">
                        <span>🕐</span> Scheduled Arr: <span className="font-medium">{stop.expected_arrival}</span>
                      </p>
                    )}
                    {stop.expected_departure && (
                      <p className="text-xs flex items-center gap-1">
                        <span>🚂</span> Scheduled Dep: <span className="font-medium">{stop.expected_departure}</span>
                      </p>
                    )}
                    {stop.actual_arrival && (
                      <p className="text-xs flex items-center gap-1 text-green-600">
                        <span>✅</span> Actual Arr: <span className="font-medium">{formatTime(stop.actual_arrival)}</span>
                      </p>
                    )}
                    {stop.actual_departure && (
                      <p className="text-xs flex items-center gap-1 text-green-600">
                        <span>🚂</span> Actual Dep: <span className="font-medium">{formatTime(stop.actual_departure)}</span>
                      </p>
                    )}
                    {stop.delay_minutes > 0 && (
                      <p className="text-xs flex items-center gap-1 text-red-500 font-medium">
                        <span>⚠️</span> Delay: {stop.delay_minutes} minutes
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Station {index + 1} of {routeStops.length}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Current Location (Train) */}
        {currentLocation && (
          <>
            <Marker
              position={currentLocation}
              icon={trainIcon}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-base">🚂 Train Location</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">
                      Lat: {currentLocation[0].toFixed(6)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Lng: {currentLocation[1].toFixed(6)}
                    </p>
                    {currentStation && (
                      <p className="text-xs mt-2 text-blue-600 font-semibold">
                        📍 Currently at: {currentStation}
                      </p>
                    )}
                    {nextStation && (
                      <p className="text-xs text-green-600 font-semibold">
                        ➡️ Next station: {nextStation}
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* 3m detection radius circle */}
            <Circle
              center={currentLocation}
              radius={3}
              pathOptions={{
                color: '#dc2626',
                fillColor: '#dc2626',
                fillOpacity: 0.1,
                weight: 2,
                dashArray: '4, 4',
              }}
            />
          </>
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-[1000] text-xs">
        <h4 className="font-semibold text-gray-700 mb-2">Legend</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-600"></div>
            <span>Train Location</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-600"></div>
            <span>Current Station</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span>Completed Station</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-400"></div>
            <span>Upcoming Station</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-500"></div>
            <span>Departure Point</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
            <span>Destination</span>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <div className="w-4 h-0.5 bg-gray-400" style={{ width: '16px', borderTop: '2px dashed #6b7280' }}></div>
            <span>Planned Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-600" style={{ width: '16px', borderTop: '2px solid #16a34a' }}></div>
            <span>Completed Route</span>
          </div>
        </div>
      </div>

      {/* Station Progress */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-[1000] text-xs">
        <div className="font-semibold text-gray-700 mb-1">
          🚉 {Math.max(0, currentStopIndex + 1)} / {routeStops.length} Stations
        </div>
        <div className="w-36 h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${routeStops.length > 0 ? ((currentStopIndex + 1) / routeStops.length) * 100 : 0}%` }}
          />
        </div>
        {currentStation && (
          <p className="text-xs text-gray-500 mt-1">📍 {currentStation}</p>
        )}
        {nextStation && (
          <p className="text-xs text-blue-500">➡️ {nextStation}</p>
        )}
      </div>
    </div>
  );
};

export default TrainTrackerMap;