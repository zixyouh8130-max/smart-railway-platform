// src/components/RouteManage/RoutesManagement.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Edit, Trash2, MapPin, Search,
  AlertCircle, Loader, Map, CheckCircle, RefreshCw,
  Clock, Route, Train, Layers
} from 'lucide-react';
import Button from '@/components/ui/button';
import RouteFormModal from '@/components/RouteManage/RouteFormModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import routesApi from '@/api/routes';
import adminDashboardApi from '@/api/adminDashboard';
import { MapContainer, TileLayer, Polyline, Tooltip, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icons (Leaflet bug with webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Error handling utilities
const extractErrorMessage = (error) => {
  if (!error) return 'မမျှော်လင့်ထားသော အမှားတစ်ခု ဖြစ်ပွားခဲ့သည်။';
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) {
    return error
      .map(e => {
        const field = e.loc?.join('.') || '';
        const msg = e.msg || 'တရားဝင်မှုမရှိပါ';
        return field ? `${field}: ${msg}` : msg;
      })
      .join('; ');
  }
  if (error.detail) {
    if (Array.isArray(error.detail)) return extractErrorMessage(error.detail);
    if (typeof error.detail === 'string') return error.detail;
    if (error.detail.message) return error.detail.message;
    return JSON.stringify(error.detail);
  }
  if (error.response?.data?.detail) {
    return extractErrorMessage(error.response.data.detail);
  }
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'မမျှော်လင့်ထားသော အမှားတစ်ခု ဖြစ်ပွားခဲ့သည်။';
  }
};

const handleApiError = (error, defaultMessage = 'အမှားတစ်ခု ဖြစ်ပွားခဲ့သည်') => {
  console.error('API Error:', error);
  return extractErrorMessage(error) || defaultMessage;
};

// Helper to generate distinct colours (for list view badges)
const getRouteColor = (index) => {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const RoutesManagement = () => {
  const [routes, setRoutes] = useState([]);
  const [stationsMap, setStationsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');

  // Map view: selected route ID
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState(null);
  const [creatingReverseForRoute, setCreatingReverseForRoute] = useState(null);

  const mapRef = useRef();

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [routesRes, stationsRes] = await Promise.all([
        routesApi.getAll(),
        adminDashboardApi.getAllStations()
      ]);

      let routesData = [];
      if (routesRes.routes) routesData = routesRes.routes;
      else if (routesRes.data?.routes) routesData = routesRes.data.routes;
      else if (Array.isArray(routesRes)) routesData = routesRes;
      else if (routesRes.data && Array.isArray(routesRes.data)) routesData = routesRes.data;
      else console.warn('Unexpected routes response:', routesRes);
      setRoutes(routesData);

      const stationMap = {};
      const stations = stationsRes.stations || [];
      stations.forEach(st => {
        if (st.latitude != null && st.longitude != null) {
          stationMap[st.id] = {
            lat: st.latitude,
            lng: st.longitude,
            name: st.name,
            code: st.code,
            city: st.city,
          };
        }
      });
      setStationsMap(stationMap);
      console.log(`Loaded ${Object.keys(stationMap).length} stations with coordinates`);

      // Set default selected route if any
      if (routesData.length > 0) {
        setSelectedRouteId(routesData[0].id);
      }
    } catch (err) {
      setError(handleApiError(err, 'ဒေတာများ ရယူရာတွင် မအောင်မြင်ပါ'));
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort routes
  const filteredRoutes = useMemo(() => {
    let result = routes;
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(route =>
        route.name?.toLowerCase().includes(lower) ||
        route.origin?.toLowerCase().includes(lower) ||
        route.destination?.toLowerCase().includes(lower)
      );
    }
    return [...result].sort((a, b) => (a.origin || '').localeCompare(b.origin || ''));
  }, [routes, searchTerm]);

  // Group routes by origin for list view
  const groupedRoutes = useMemo(() => {
    const groups = {};
    filteredRoutes.forEach(route => {
      const origin = route.origin || 'Unknown';
      if (!groups[origin]) groups[origin] = [];
      groups[origin].push(route);
    });
    const sortedKeys = Object.keys(groups).sort();
    const result = {};
    sortedKeys.forEach(key => { result[key] = groups[key]; });
    return result;
  }, [filteredRoutes]);

  // Prepare data for the selected route (for map view)
  const selectedRouteData = useMemo(() => {
    if (!selectedRouteId) return null;
    const route = filteredRoutes.find(r => r.id === selectedRouteId);
    if (!route) return null;

    const stations = route.stations || [];
    const sorted = [...stations].sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
    const coordinates = [];
    const stationMarkers = [];

    for (const st of sorted) {
      const stationId = st.station_id || st.id || st.station?.id;
      const coord = stationId ? stationsMap[stationId] : null;
      if (coord) {
        coordinates.push([coord.lat, coord.lng]);
        stationMarkers.push({
          lat: coord.lat,
          lng: coord.lng,
          name: st.station_name || coord.name || 'Unknown',
          code: st.station_code || coord.code || '',
        });
      } else {
        console.warn(`Station ${st.station_name || st.name || 'unknown'} missing coordinates`);
      }
    }

    return {
      id: route.id,
      name: route.name || `${route.origin} → ${route.destination}`,
      color: '#3b82f6', // Single colour for selected route
      coordinates,
      markers: stationMarkers,
    };
  }, [selectedRouteId, filteredRoutes, stationsMap]);

  // ---------- CRUD Handlers ----------
  const handleCreate = async (formData) => {
    setActionLoading(true);
    setActionMessage('လမ်းကြောင်းအသစ် သိမ်းဆည်းနေသည်...');
    try {
      await routesApi.create(formData);
      await fetchAllData();
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'လမ်းကြောင်းအသစ် ဖန်တီးရာတွင် မအောင်မြင်ပါ');
      setError(errorMessage);
      throw err;
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  const handleUpdate = async (formData) => {
    if (!selectedRoute) return;
    setActionLoading(true);
    setActionMessage('လမ်းကြောင်း အချက်အလက် ပြင်ဆင်နေသည်...');
    try {
      const { stations, ...routeData } = formData;
      await routesApi.update(selectedRoute.id, routeData);
      if (stations && Array.isArray(stations) && stations.length > 0) {
        await routesApi.updateRouteStations(selectedRoute.id, stations);
      }
      await fetchAllData();
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'လမ်းကြောင်း ပြင်ဆင်ရာတွင် မအောင်မြင်ပါ');
      setError(errorMessage);
      throw err;
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(true);
    setActionMessage('လမ်းကြောင်း ဖျက်သိမ်းနေသည်...');
    try {
      await routesApi.delete(deleteId);
      setRoutes(prev => prev.filter(route => route.id !== deleteId));
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'လမ်းကြောင်း ဖျက်သိမ်းရာတွင် မအောင်မြင်ပါ');
      setError(errorMessage);
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  const handleCreateReverseRoute = async (route, e) => {
    e.stopPropagation();
    if (!route || !route.stations || route.stations.length < 2) {
      setError('လမ်းကြောင်း၌ အနည်းဆုံး ဘူတာ ၂ ခု ရှိရပါမည်။');
      return;
    }
    setCreatingReverseForRoute(route.id);
    setError(null);
    try {
      const sortedStations = [...route.stations].sort(
        (a, b) => (a.order_number || 0) - (b.order_number || 0)
      );
      const lastStationDistance = sortedStations[sortedStations.length - 1].distance_from_origin || 0;
      const reversedStations = [...sortedStations].reverse().map((station, index) => ({
        station_id: station.station_id,
        station_name: station.station_name || station.station?.name || '',
        station_code: station.station_code || station.station?.code || '',
        order_number: index + 1,
        distance_from_origin: station.distance_from_origin !== null && station.distance_from_origin !== undefined
          ? Math.abs(lastStationDistance - (station.distance_from_origin || 0))
          : null,
        is_major_stop: station.is_major_stop || false,
        time_from_origin_minutes: null
      }));

      const originStation = sortedStations[sortedStations.length - 1];
      const destinationStation = sortedStations[0];
      const reverseName = `${originStation.station_name || 'Unknown'} - ${destinationStation.station_name || 'Unknown'}`;

      const reverseRouteData = {
        name: reverseName,
        origin: route.destination || originStation.station_name,
        destination: route.origin || destinationStation.station_name,
        distance: route.distance || 0,
        duration: route.duration || '0:00',
        base_price: route.base_price || 0,
        status: 'ACTIVE',
        stations: reversedStations
      };

      await routesApi.create(reverseRouteData);
      setSuccessMessage(`✅ ပြောင်းပြန်လမ်းကြောင်း "${reverseName}" အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchAllData();
    } catch (err) {
      console.error('Failed to create reverse route:', err);
      const errorMessage = handleApiError(err, 'ပြောင်းပြန်လမ်းကြောင်း ဖန်တီးရာတွင် မအောင်မြင်ပါ');
      setError(errorMessage);
    } finally {
      setCreatingReverseForRoute(null);
    }
  };

  // ---------- UI Handlers ----------
  const handleAddClick = () => {
    setSelectedRoute(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (route) => {
    setSelectedRoute(route);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedRoute(null);
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (selectedRoute) {
        await handleUpdate(formData);
      } else {
        await handleCreate(formData);
      }
      setIsFormOpen(false);
      setSelectedRoute(null);
    } catch (err) {
      // Error already handled in handleCreate/handleUpdate
      throw err;
    }
  };

  // ---------- Formatting Helpers ----------
  const formatDistance = (distance) => {
    if (!distance) return '';
    return `${Number(distance).toLocaleString()} မိုင်`;
  };

  const formatHour = (timeStr) => {
    if (!timeStr) return '';
    return timeStr
      .split(':')
      .map(num => Number(num).toLocaleString('my-MM', { minimumIntegerDigits: num.length }))
      .join(':') + ' နာရီ';
  };

  // ---------- Loading State ----------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">ဒေတာများ ရယူနေသည်...</p>
          <p className="text-gray-400 text-sm mt-1">လမ်းကြောင်းနှင့် ဘူတာများကို ဆောင်ယူနေပါသည်</p>
        </div>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="space-y-6 p-4 md:p-6  min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              ရထားလမ်းကြောင်းများနှင့် ဘူတာများကို စီမံပါ
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white shadow text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Layers className="w-4 h-4 inline mr-1" />
                စာရင်း
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'map'
                    ? 'bg-white shadow text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Map className="w-4 h-4 inline mr-1" />
                မြေပုံ
              </button>
            </div>
            <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all">
              <Plus className="w-4 h-4 mr-1" />
              လမ်းကြောင်းအသစ်
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{routes.length}</p>
            <p className="text-xs text-blue-600">စုစုပေါင်း လမ်းကြောင်း</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{routes.filter(r => r.status === 'ACTIVE').length}</p>
            <p className="text-xs text-green-600">လက်ရှိ အသုံးပြုနေ</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{routes.reduce((acc, r) => acc + (r.stations?.length || 0), 0)}</p>
            <p className="text-xs text-purple-600">စုစုပေါင်း ဘူတာ</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">{routes.filter(r => r.status !== 'ACTIVE').length}</p>
            <p className="text-xs text-orange-600">မလှုပ်ရှားသေး / ပိတ်ထား</p>
          </div>
        </div>
      </div>

      {/* Success / Error messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-emerald-700 text-sm flex-1">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 transition-colors">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <p className="text-rose-700 text-sm flex-1">{typeof error === 'string' ? error : extractErrorMessage(error)}</p>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="လမ်းကြောင်းအမည်၊ မူလနေရာ၊ ဦးတည်ရာဖြင့် ရှာဖွေပါ..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow bg-white"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* View Switcher */}
      {viewMode === 'list' ? (
        // ----- LIST VIEW: Grouped by origin with two‑column cards -----
        <div className="space-y-6">
          {Object.keys(groupedRoutes).length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
              <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'လမ်းကြောင်း မတွေ့ပါ' : 'လမ်းကြောင်း မရှိသေးပါ'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'သင်၏ ရှာဖွေမှုနှင့် ကိုက်ညီသော လမ်းကြောင်း မရှိပါ' : 'လမ်းကြောင်းအသစ် ထည့်သွင်းရန် စတင်ပါ'}
              </p>
              {!searchTerm && (
                <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4 mr-1" />
                  လမ်းကြောင်းအသစ်
                </Button>
              )}
            </div>
          ) : (
            Object.entries(groupedRoutes).map(([origin, routes]) => (
              <div key={origin} className="space-y-3">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  {origin}
                  <span className="text-sm font-normal text-gray-500 ml-2">({routes.length} လမ်းကြောင်း)</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {routes.map((route) => (
                    <div
                      key={route.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl transition-all duration-300 hover:scale-[1.01]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-bold text-gray-900">
                              {route.name || `${route.origin} - ${route.destination}`}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              route.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {route.status === 'ACTIVE' ? 'အသက်ဝင်' : 'မသက်ဝင်'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            {route.distance && (
                              <span className="text-sm text-gray-600 flex items-center gap-1">
                                <Clock className="w-4 h-4 text-gray-400" />
                                {formatDistance(route.distance)}
                              </span>
                            )}
                            {route.duration && (
                              <span className="text-sm text-gray-600 flex items-center gap-1">
                                <Clock className="w-4 h-4 text-gray-400" />
                                {formatHour(route.duration)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-gray-500">
                            ဦးတည်ရာ: <span className="font-medium">{route.destination || '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => handleEditClick(route)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium"
                        >
                          <Edit className="w-4 h-4" />
                          ပြင်ဆင်ရန်
                        </button>
                        {route.stations && route.stations.length >= 2 && (
                          <button
                            onClick={(e) => handleCreateReverseRoute(route, e)}
                            disabled={creatingReverseForRoute === route.id}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            title="ပြောင်းပြန်လမ်းကြောင်း ဖန်တီးရန်"
                          >
                            {creatingReverseForRoute === route.id ? (
                              <><Loader className="w-4 h-4 animate-spin" /> ဖန်တီးနေသည်...</>
                            ) : (
                              <><RefreshCw className="w-4 h-4" /> ပြောင်းပြန်</>
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteClick(route.id, e)}
                          className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors ml-auto"
                          title="ဖျက်ရန်"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          {route.trains_count > 0 && (
                            <><Train className="w-3 h-3" /> {route.trains_count} ရထားများ ပြေးဆွဲနေ</>
                          )}
                        </p>
                        {route.updated_at && (
                          <p className="text-xs text-gray-400">
                            နောက်ဆုံး ပြင်ဆင်ချိန်: {new Date(route.updated_at).toLocaleDateString('my-MM', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="text-sm text-gray-500 text-center bg-white rounded-xl py-3 border border-gray-100 shadow-sm">
            စုစုပေါင်း {filteredRoutes.length} လမ်းကြောင်း တွေ့ရှိပါသည်{searchTerm && ` (ရှာဖွေမှု: "${searchTerm}")`}
          </div>
        </div>
      ) : (
        // ----- MAP VIEW with route selector and hover tooltips on stations -----
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Dropdown to select a route */}
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              လမ်းကြောင်းရွေးရန်:
            </label>
            <select
              value={selectedRouteId || ''}
              onChange={(e) => setSelectedRouteId(Number(e.target.value))}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              {filteredRoutes.length === 0 ? (
                <option value="">လမ်းကြောင်းမရှိပါ</option>
              ) : (
                filteredRoutes.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.name || `${route.origin} → ${route.destination}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Map container */}
          <div className="h-[500px] md:h-[600px] w-full relative">
            <MapContainer
              key={selectedRouteId + viewMode}
              center={[21.9162, 95.9560]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              whenCreated={(map) => { mapRef.current = map; }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {selectedRouteData && selectedRouteData.coordinates.length >= 2 && (
                <React.Fragment>
                  {/* Route Polyline */}
                  <Polyline
                    positions={selectedRouteData.coordinates}
                    color={selectedRouteData.color}
                    weight={4}
                    opacity={0.8}
                    smoothFactor={1}
                  >
                    <Tooltip sticky direction="top" offset={[0, -10]}>
                      <div className="font-semibold text-sm">{selectedRouteData.name}</div>
                    </Tooltip>
                  </Polyline>

                  {/* Station Markers with hover tooltips */}
                  {selectedRouteData.markers.map((marker, idx) => (
                    <Marker
                      key={`${selectedRouteData.id}-${idx}`}
                      position={[marker.lat, marker.lng]}
                    >
                      {/* Tooltip shows station name on hover */}
                      <Tooltip 
                        sticky 
                        direction="top" 
                        offset={[0, -10]}
                        className="bg-white/90 backdrop-blur-sm border border-gray-200 shadow-lg rounded-lg px-3 py-1.5"
                      >
                        <div className="font-semibold text-sm text-gray-900">{marker.name}</div>
                        {marker.code && (
                          <div className="text-xs text-gray-500">{marker.code}</div>
                        )}
                      </Tooltip>
                      {/* Popup shows station name on click (optional, kept for extra detail) */}
                      <Popup>
                        <div className="font-semibold">{marker.name}</div>
                        {marker.code && <div className="text-xs text-gray-500">{marker.code}</div>}
                      </Popup>
                    </Marker>
                  ))}
                </React.Fragment>
              )}
            </MapContainer>
            {!selectedRouteData && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
                <div className="text-center text-gray-500">
                  <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>ရွေးချယ်ထားသော လမ်းကြောင်းအတွက် ဘူတာများ မရှိပါ</p>
                  <p className="text-sm">ဘူတာများအတွက် ကိုဩဒိနိတ် သတ်မှတ်ရန် လိုအပ်သည်</p>
                </div>
              </div>
            )}
            {selectedRouteData && selectedRouteData.coordinates.length >= 2 && (
              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-md text-xs font-medium text-gray-700 border border-gray-200">
                ပြသထားသော လမ်းကြောင်း: {selectedRouteData.name}
              </div>
            )}
          </div>
          <div className="p-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex flex-wrap gap-4 justify-center">
            <span>📍 အပြာရောင်မျဉ်းသည် ရွေးချယ်ထားသော လမ်းကြောင်း</span>
            <span>🖱️ မျဉ်းပေါ် ရွှေ့ကြည့်ပါက လမ်းကြောင်းအမည် ပေါ်လာမည်</span>
            <span>📍 အမှတ်အသားပေါ် ရွှေ့ကြည့်ပါက ဘူတာအမည် ပေါ်လာမည်</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <RouteFormModal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleFormSubmit}
        route={selectedRoute}
      />
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => { setIsDeleteDialogOpen(false); setDeleteId(null); }}
        onConfirm={handleDelete}
        title="လမ်းကြောင်း ဖျက်သိမ်းမည်"
        message="ဤလမ်းကြောင်းအား ဖျက်သိမ်းလိုသည်မှာ သေချာပါသလား? ဆက်စပ်ရထားများနှင့် အချိန်ဇယားများကို ထိခိုက်နိုင်ပါသည်။"
      />

      {/* Loading Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
            <Loader className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{actionMessage || 'လုပ်ဆောင်နေသည်...'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutesManagement;