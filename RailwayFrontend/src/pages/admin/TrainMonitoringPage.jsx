// pages/Admin/TrainMonitoringPage.jsx
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Train, RefreshCw, Wifi, WifiOff, MapPin, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Navigation, Gauge, Calendar, Users, Activity } from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import adminDashboardApi from '@/api/adminDashboard';
import { formatRailwayTime } from '@/utils/railwayDateTime';


// Train icon (red)
const trainIcon = L.divIcon({
  className: 'custom-train-icon',
  html: `<div style="
    background: linear-gradient(135deg, #dc2626, #b91c1c); 
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 3px solid white; box-shadow: 0 4px 15px rgba(220,38,38,0.5);
    transition: transform 0.2s;
  "><span style="font-size: 17px;">🚂</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// Station icon (blue)
const stationIcon = L.divIcon({
  className: 'custom-station-icon',
  html: `<div style="
    background: linear-gradient(135deg, #2563eb, #1d4ed8); 
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid white; box-shadow: 0 2px 8px rgba(37,99,235,0.4);
  "><span style="font-size: 12px;">🚉</span></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Map Controller to center on first active train
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

  const defaultCenter = [21.9162, 95.9560];

  // Load one snapshot when the page opens. After that, the Refresh button
  // is the only action that asks the backend for a newer train location.
  useEffect(() => {
    fetchData();
    // Intentionally no polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const mapCenter = trainsWithLocation.length > 0
    ? [trainsWithLocation[0].device.latitude, trainsWithLocation[0].device.longitude]
    : defaultCenter;

  const mapZoom = trainsWithLocation.length > 0 ? 12 : 7;

  const getStatusColor = (status) => {
    const colors = {
      'ACTIVE': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'ARRIVED': 'bg-blue-100 text-blue-700 border-blue-200',
      'DEPARTED': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'DELAYED': 'bg-amber-100 text-amber-700 border-amber-200',
      'SCHEDULED': 'bg-gray-100 text-gray-600 border-gray-200',
      'CANCELLED': 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[status] || colors['SCHEDULED'];
  };

  const getStatusLabel = (status) => {
    const labels = {
      'ACTIVE': 'ပြေးဆွဲနေသည်',
      'ARRIVED': 'ဆိုက်ရောက်ပြီး',
      'DEPARTED': 'ထွက်ခွာပြီး',
      'DELAYED': 'နှောင့်နှေးနေသည်',
      'SCHEDULED': 'စီစဉ်ထား',
      'CANCELLED': 'ဖျက်သိမ်းထား',
    };
    return labels[status] || status;
  };

  const getStationStatusLabel = (status) => {
    const labels = {
      'ARRIVED': 'ဆိုက်ရောက်ပြီး',
      'DEPARTED': 'ထွက်ခွာပြီး',
      'DELAYED': 'နှောင့်နှေးနေသည်',
      'SCHEDULED': 'စီစဉ်ထား',
      'CURRENT': 'လက်ရှိ',
    };
    return labels[status] || status;
  };

  const getStationStatusColor = (status) => {
    const colors = {
      'ARRIVED': 'bg-blue-100 text-blue-700',
      'DEPARTED': 'bg-emerald-100 text-emerald-700',
      'DELAYED': 'bg-amber-100 text-amber-700',
      'SCHEDULED': 'bg-gray-100 text-gray-500',
      'CURRENT': 'bg-purple-100 text-purple-700',
    };
    return colors[status] || colors['SCHEDULED'];
  };

  const getStatusDot = (status) => {
    const colors = {
      'ACTIVE': 'bg-emerald-500',
      'ARRIVED': 'bg-blue-500',
      'DEPARTED': 'bg-indigo-500',
      'DELAYED': 'bg-amber-500',
      'SCHEDULED': 'bg-gray-400',
      'CANCELLED': 'bg-red-500',
    };
    return colors[status] || 'bg-gray-400';
  };

  const formatTime = (timeString) =>
    timeString ? formatRailwayTime(timeString, 'my-MM') : null;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('my-MM', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">ဒေတာများ ရယူနေသည်...</p>
          <p className="text-gray-400 text-sm mt-1">ရထားနှင့် ဘူတာများ၏ တည်နေရာကို ဆောင်ယူနေပါသည်</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            
            <p className="mt-1 text-sm text-gray-500">
              {allStations.length} ဘူတာ · {activeTrains.length} ရထား ပြေးဆွဲနေ
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {connectionError ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
                <WifiOff className="w-4 h-4" />
                ချိတ်ဆက်မှုပြတ်တောက်နေ
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-sm border border-emerald-200">
                <Wifi className="w-4 h-4" />
                လက်ဖြင့် အပ်ဒိတ်
              </span>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData}
              className="border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              ဒေတာအသစ်ပြန်လည်ရယူရန်
            </Button>
          </div>
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
            နောက်ဆုံး အပ်ဒိတ်: {lastUpdated.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{allStations.length}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" />
              စုစုပေါင်း ဘူတာ
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{activeTrains.length}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <Train className="w-3 h-3" />
              ပြေးဆွဲနေသော ရထား
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{trainsWithLocation.length}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <Navigation className="w-3 h-3" />
              GPS ခြေရာခံနေ
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{stationsWithCoords.length}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" />
              မြေပုံပေါ်ရှိ ဘူတာ
            </p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6 relative" style={{ height: '500px' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <MapController center={mapCenter} zoom={mapZoom} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Station Markers */}
          {stationsWithCoords.map((station) => (
            <Marker key={`station-${station.id}`} position={[station.latitude, station.longitude]} icon={stationIcon}>
              <Popup>
                <div className="text-sm min-w-[140px]">
                  <p className="font-bold text-gray-900">{station.name}</p>
                  {station.code && <p className="text-xs text-gray-500">ကုဒ်: {station.code}</p>}
                  {station.city && <p className="text-xs text-gray-500">{station.city}</p>}
                  {station.state_region && <p className="text-xs text-gray-500">{station.state_region}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Train Markers */}
          {trainsWithLocation.map((train) => (
            <React.Fragment key={`train-${train.train_id}`}>
              <Marker position={[train.device.latitude, train.device.longitude]} icon={trainIcon}>
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    <p className="font-bold text-gray-900 flex items-center gap-2">
                      🚂 {train.train_name}
                    </p>
                    <p className="text-xs text-gray-500">{train.train_no}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(train.status)}`}></span>
                        အခြေအနေ: <span className="font-semibold">{getStatusLabel(train.status)}</span>
                      </p>
                      <p className="text-xs">တိုးတက်မှု: {Math.round(train.progress_percent)}%</p>
                      {train.device.speed !== null && (
                        <p className="text-xs flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          အမြန်နှုန်း: {train.device.speed || 0} km/h
                        </p>
                      )}
                      {train.device.last_update && (
                        <p className="text-xs text-gray-400">
                          နောက်ဆုံးအပ်ဒိတ်: {formatTime(train.device.last_update)}
                        </p>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[train.device.latitude, train.device.longitude]}
                radius={50}
                pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.05, weight: 2, dashArray: '4, 4' }}
              />
            </React.Fragment>
          ))}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-[1000] text-xs border border-gray-100">
          <h4 className="font-semibold text-gray-700 mb-1.5">သင်္ကေတ</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-red-600 to-red-700"></div>
              <span className="text-gray-600">ပြေးဆွဲနေသော ရထား</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-600 to-blue-700"></div>
              <span className="text-gray-600">ဘူတာ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 border-t-2 border-red-400 border-dashed"></div>
              <span className="text-gray-600">၅၀ မီတာ အကွာအဝေး</span>
            </div>
          </div>
        </div>

        {/* Map Info */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-gray-500 border border-gray-100 shadow-sm">
          {trainsWithLocation.length} ရထား · {stationsWithCoords.length} ဘူတာ
        </div>
      </div>

      {/* Active Trains with Station Progress */}
      {activeTrains.length > 0 ? (
        <div className="space-y-4">
          {activeTrains.map((train) => {
            const isExpanded = expandedTrain === train.train_id;
            return (
              <div key={train.train_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                {/* Train Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedTrain(isExpanded ? null : train.train_id)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        train.status === 'ACTIVE' ? 'bg-emerald-100' : 'bg-blue-100'
                      }`}>
                        <Train className={`w-5 h-5 ${
                          train.status === 'ACTIVE' ? 'text-emerald-600' : 'text-blue-600'
                        }`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{train.train_name}</h3>
                        <p className="text-xs text-gray-500">
                          {train.train_no} · ထွက်ခွာ: {train.departure_time}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(train.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${getStatusDot(train.status)}`}></span>
                        {getStatusLabel(train.status)}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {train.completed_stations}/{train.total_stations} ဘူတာ
                      </span>
                      <span className="text-sm text-gray-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3 h-3" />
                        လမ်းကြောင်းတိုးတက်မှု
                      </span>
                      <span className="font-medium text-gray-700">{Math.round(train.progress_percent)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          train.progress_percent > 75 
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' 
                            : train.progress_percent > 40 
                            ? 'bg-gradient-to-r from-blue-400 to-blue-600' 
                            : 'bg-gradient-to-r from-amber-400 to-amber-600'
                        }`}
                        style={{ width: `${Math.min(train.progress_percent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Device Info */}
                  {train.device && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                      {train.device.speed !== null && (
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {train.device.speed || 0} km/h
                        </span>
                      )}
                      {train.device.latitude && train.device.longitude && (
                        <span className="flex items-center gap-1 font-mono">
                          <MapPin className="w-3 h-3" />
                          {train.device.latitude?.toFixed(4)}, {train.device.longitude?.toFixed(4)}
                        </span>
                      )}
                      {train.device.last_update && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(train.device.last_update)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Station List (Expanded) */}
                {isExpanded && train.stations && (
                  <div className="px-4 pb-4">
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        လမ်းကြောင်းရှိ ဘူတာများ
                      </h4>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {train.stations.map((station, idx) => {
                          const isStart = idx === 0;
                          const isEnd = idx === train.stations.length - 1;
                          const isCompleted = station.status === 'ARRIVED' || station.status === 'DEPARTED';
                          
                          return (
                            <div
                              key={idx}
                              className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl text-xs transition-colors ${
                                isCompleted 
                                  ? 'bg-emerald-50/50 border border-emerald-100' 
                                  : station.status === 'CURRENT'
                                  ? 'bg-blue-50/70 border border-blue-200'
                                  : station.status === 'DELAYED'
                                  ? 'bg-amber-50/50 border border-amber-100'
                                  : 'bg-gray-50 border border-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  station.status === 'DEPARTED' ? 'bg-emerald-500' :
                                  station.status === 'ARRIVED' ? 'bg-blue-500' :
                                  station.status === 'CURRENT' ? 'bg-purple-500 animate-pulse' :
                                  station.status === 'DELAYED' ? 'bg-amber-500' :
                                  'bg-gray-300'
                                }`} />
                                <span className="font-medium text-gray-800">{station.station_name}</span>
                                {isStart && <span className="text-amber-600 text-[10px] font-medium">(စတင်ရာ)</span>}
                                {isEnd && <span className="text-purple-600 text-[10px] font-medium">(အဆုံးသတ်)</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1 sm:mt-0">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStationStatusColor(station.status)}`}>
                                  {getStationStatusLabel(station.status)}
                                </span>
                                {station.arrival_time && (
                                  <span className="text-gray-500 text-[10px]">
                                    ဆိုက်: {formatTime(station.arrival_time)}
                                  </span>
                                )}
                                {station.departure_time && station.status === 'DEPARTED' && (
                                  <span className="text-gray-500 text-[10px]">
                                    ထွက်: {formatTime(station.departure_time)}
                                  </span>
                                )}
                                {station.delay_minutes > 0 && (
                                  <span className="text-red-500 font-medium text-[10px]">
                                    +{station.delay_minutes}မိ
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Train className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-600">ပြေးဆွဲနေသော ရထားမရှိပါ</h3>
          <p className="text-gray-400 text-sm mt-1">လက်ရှိအချိန်တွင် ရထားအားလုံး ရပ်နားထားပါသည်</p>
        </div>
      )}

      {/* All Stations Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mt-6 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            ဘူတာများ ({allStations.length})
          </h3>
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
            {stationsWithCoords.length} ဘူတာ မြေပုံပေါ်တွင်
          </span>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left">
                <th className="pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">အမည်</th>
                <th className="pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">ကုဒ်</th>
                <th className="pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">မြို့</th>
                <th className="pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">တည်နေရာ</th>
                {/* <th className="pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">အခြေအနေ</th> */}
              </tr>
            </thead>
            <tbody>
              {allStations.map((station) => (
                <tr key={station.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 font-medium text-gray-800">{station.name}</td>
                  <td className="py-2.5 text-gray-500 font-mono text-xs">{station.code || '--'}</td>
                  <td className="py-2.5 text-gray-600">{station.city || '--'}</td>
                  <td className="py-2.5 text-xs font-mono text-gray-500">
                    {station.latitude && station.longitude
                      ? `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {/* <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      station.is_active 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {station.is_active ? 'အသက်ဝင်' : 'မသက်ဝင်'}
                    </span>
                  </td> */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TrainMonitoringPage;