// src/components/RouteManage/RoutesManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit, Trash2, MapPin, ArrowRight, Search,
  AlertCircle, Loader, Map, CheckCircle, RefreshCw
} from 'lucide-react';
import Button from '@/components/ui/button';
import RouteFormModal from '@/components/RouteManage/RouteFormModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import routesApi from '@/api/routes';

// Error handling utility
const extractErrorMessage = (error) => {
  if (!error) return 'An unexpected error occurred';
  if (typeof error === 'string') return error;
  
  // FastAPI validation errors (array of objects)
  if (Array.isArray(error)) {
    return error
      .map(e => {
        const field = e.loc?.join('.') || '';
        const msg = e.msg || 'Validation error';
        return field ? `${field}: ${msg}` : msg;
      })
      .join('; ');
  }
  
  // Error with detail property
  if (error.detail) {
    if (Array.isArray(error.detail)) {
      return extractErrorMessage(error.detail);
    }
    if (typeof error.detail === 'string') return error.detail;
    if (error.detail.message) return error.detail.message;
    return JSON.stringify(error.detail);
  }
  
  // Axios error response
  if (error.response?.data?.detail) {
    return extractErrorMessage(error.response.data.detail);
  }
  
  // Standard Error object
  if (error.message) return error.message;
  
  // Fallback
  try {
    return JSON.stringify(error);
  } catch {
    return 'An unexpected error occurred';
  }
};

const handleApiError = (error, defaultMessage = 'An error occurred') => {
  console.error('API Error:', error);
  return extractErrorMessage(error) || defaultMessage;
};

const RoutesManagement = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Selected items
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Action loading state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  
  // Success message
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Reverse route creation state
  const [creatingReverseForRoute, setCreatingReverseForRoute] = useState(null);

  // Fetch routes on component mount
  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await routesApi.getAll();

      let routesData = [];
      if (response.routes) {
        routesData = response.routes;
      } else if (response.data?.routes) {
        routesData = response.data.routes;
      } else if (Array.isArray(response)) {
        routesData = response;
      } else if (response.data && Array.isArray(response.data)) {
        routesData = response.data;
      } else {
        console.warn('Unexpected response format:', response);
      }

      setRoutes(routesData);
    } catch (err) {
      setError(handleApiError(err, 'Failed to fetch routes'));
      console.error('Error fetching routes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter routes based on search
  const filteredRoutes = useMemo(() => {
    if (!searchTerm.trim()) return routes;

    const searchLower = searchTerm.toLowerCase();
    return routes.filter(route =>
      route.name?.toLowerCase().includes(searchLower) ||
      route.origin?.toLowerCase().includes(searchLower) ||
      route.destination?.toLowerCase().includes(searchLower) ||
      route.stations?.some(station =>
        station.station_name?.toLowerCase().includes(searchLower) ||
        station.station?.name?.toLowerCase().includes(searchLower)
      )
    );
  }, [routes, searchTerm]);

  // Create new route
  const handleCreate = async (formData) => {
    setActionLoading(true);
    setActionMessage('Saving route...');
    try {
      await routesApi.create(formData);
      await fetchRoutes();
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'Failed to create route');
      setError(errorMessage);
      throw err;
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  // Update existing route
  const handleUpdate = async (formData) => {
    if (!selectedRoute) return;

    setActionLoading(true);
    setActionMessage('Updating route...');
    try {
      const { stations, ...routeData } = formData;

      // Update route basic info
      await routesApi.update(selectedRoute.id, routeData);

      // Update stations separately if they exist
      if (stations && Array.isArray(stations) && stations.length > 0) {
        await routesApi.updateRouteStations(selectedRoute.id, stations);
      }

      await fetchRoutes();
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'Failed to update route');
      setError(errorMessage);
      throw err;
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  // Delete route
  const handleDelete = async () => {
    if (!deleteId) return;

    setActionLoading(true);
    setActionMessage('Deleting route...');
    try {
      await routesApi.delete(deleteId);
      setRoutes(prev => prev.filter(route => route.id !== deleteId));
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      setError(null);
    } catch (err) {
      const errorMessage = handleApiError(err, 'Cannot delete route');
      setError(errorMessage);
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    } finally {
      setActionLoading(false);
      setActionMessage('');
    }
  };

  // Create reverse route
  const handleCreateReverseRoute = async (route, e) => {
    e.stopPropagation();
    
    if (!route || !route.stations || route.stations.length < 2) {
      setError('Route must have at least 2 stations to create a reverse route');
      return;
    }

    setCreatingReverseForRoute(route.id);
    setError(null);
    
    try {
      // Get sorted stations
      const sortedStations = [...route.stations].sort(
        (a, b) => (a.order_number || 0) - (b.order_number || 0)
      );
      
      // Get last station's distance for reverse calculations
      const lastStationDistance = sortedStations[sortedStations.length - 1].distance_from_origin || 0;
      
      // Reverse the stations array
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

      // Create reverse route name
      const originStation = sortedStations[sortedStations.length - 1];
      const destinationStation = sortedStations[0];
      const reverseName = `${originStation.station_name || 'Unknown'} - ${destinationStation.station_name || 'Unknown'}`;
      
      // Prepare route data matching backend's RouteCreate schema
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

      console.log('Creating reverse route:', reverseRouteData);
      
      // Create the route with stations in a single API call
      await routesApi.create(reverseRouteData);
      
      setSuccessMessage(`✅ Reverse route "${reverseName}" created successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Refresh routes list
      await fetchRoutes();
    } catch (err) {
      console.error('Failed to create reverse route:', err);
      const errorMessage = handleApiError(err, 'Failed to create reverse route');
      setError(errorMessage);
    } finally {
      setCreatingReverseForRoute(null);
    }
  };

  // Open edit modal
  const handleEditClick = (route) => {
    setSelectedRoute(route);
    setIsFormOpen(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  // Open create modal
  const handleAddClick = () => {
    setSelectedRoute(null);
    setIsFormOpen(true);
  };

  // Close form modal
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedRoute(null);
  };

  // Handle form submission
  const handleFormSubmit = async (formData) => {
    try {
      if (selectedRoute) {
        await handleUpdate(formData);
      } else {
        await handleCreate(formData);
      }
    } catch (err) {
      throw err;
    }
  };

  // Format distance for display
  const formatDistance = (distance) => {
    if (!distance) return '';
    return `${Number(distance).toLocaleString()} km`;
  };

  const formatHour = (timeStr) => {
    if (!timeStr) return '';
    return timeStr
      .split(':')
      .map(num => Number(num).toLocaleString('my-MM', { minimumIntegerDigits: num.length }))
      .join(':') + ' hrs';
  };

  // Format price for display
  const formatPrice = (price) => {
    if (!price) return '';
    return `${Number(price).toLocaleString()} MMK`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading routes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routes Management</h1>
          <p className="text-gray-600 mt-1">
            Manage train routes and stations
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white shadow text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'map'
                  ? 'bg-white shadow text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              disabled
              title="Map view coming soon"
            >
              <Map className="w-4 h-4 inline mr-1" />
              Map
            </button>
          </div>
          <Button
            onClick={handleAddClick}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Add Route
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-700 text-sm flex-1">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">
            {typeof error === 'string' ? error : extractErrorMessage(error)}
          </p>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search and Stats */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by route, station name or city..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 text-sm">
          <div className="px-4 py-2 bg-blue-50 rounded-lg">
            <span className="text-blue-600 font-medium">{routes.length}</span>
            <span className="text-gray-600 ml-1">Routes</span>
          </div>
          <div className="px-4 py-2 bg-green-50 rounded-lg">
            <span className="text-green-600 font-medium">
              {routes.filter(r => r.status === 'ACTIVE').length}
            </span>
            <span className="text-gray-600 ml-1">Active</span>
          </div>
        </div>
      </div>

      {/* Routes List */}
      {filteredRoutes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          {searchTerm ? (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No routes found</h3>
              <p className="text-gray-600 mb-4">No routes match your search criteria</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No routes yet</h3>
              <p className="text-gray-600 mb-4">Start by adding a new route</p>
            </>
          )}
          {!searchTerm && (
            <Button
              onClick={handleAddClick}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4" />
              Add Route
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {filteredRoutes.map((route) => (
              <div
                key={route.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                {/* Route Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {route.name || `${route.origin} - ${route.destination}`}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        route.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {route.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Route Details */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      {route.distance && (
                        <span className="text-sm text-gray-600">
                          📏 {formatDistance(route.distance)}
                        </span>
                      )}
                      {route.duration && (
                        <span className="text-sm text-gray-600">
                          ⏱️ {formatHour(route.duration)}
                        </span>
                      )}
                      {route.base_price && (
                        <span className="text-sm text-gray-600">
                          💰 Base {formatPrice(route.base_price)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Station Flow */}
                {route.stations && route.stations.length > 0 && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-xl">
                    <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
                      {route.stations.map((station, index) => (
                        <React.Fragment key={station.id || index}>
                          <div className="flex items-center space-x-1 whitespace-nowrap">
                            <MapPin className="w-4 h-4 flex-shrink-0 text-blue-500" />
                            <div>
                              <span className="text-sm font-medium text-gray-700">
                                {station.station_name || station.station?.name}
                              </span>
                              {(station.station_code || station.station?.code) && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({station.station_code || station.station?.code})
                                </span>
                              )}
                            </div>
                          </div>
                          {index < route.stations.length - 1 && (
                            <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Station Stats */}
                    <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs text-gray-500">
                        {route.stations.length} stations
                      </span>
                      <span className="text-xs text-blue-500">
                        💡 Schedule and fees configured per train
                      </span>
                    </div>
                  </div>
                )}

                {/* No Stations Message */}
                {(!route.stations || route.stations.length === 0) && (
                  <div className="mb-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                    <p className="text-sm text-yellow-700">
                      ⚠️ No stations added yet. Add stations to configure this route.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleEditClick(route)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>

                  {/* Create Reverse Route Button */}
                  {route.stations && route.stations.length >= 2 && (
                    <button
                      onClick={(e) => handleCreateReverseRoute(route, e)}
                      disabled={creatingReverseForRoute === route.id}
                      className="flex items-center space-x-2 px-4 py-2 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Create reverse direction route"
                    >
                      {creatingReverseForRoute === route.id ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          <span>Reverse</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={(e) => handleDeleteClick(route.id, e)}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors ml-auto"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Route Footer Info */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    {route.trains_count > 0 && (
                      <>🚂 {route.trains_count} trains running</>
                    )}
                  </p>
                  {route.updated_at && (
                    <p className="text-xs text-gray-400">
                      Updated: {new Date(route.updated_at).toLocaleDateString('en-US')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Route count */}
          <div className="text-sm text-gray-600 text-center">
            Total {filteredRoutes.length} routes found
            {searchTerm && ` (search: "${searchTerm}")`}
          </div>
        </>
      )}

      {/* Route Form Modal */}
      <RouteFormModal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleFormSubmit}
        route={selectedRoute}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setDeleteId(null);
        }}
        onConfirm={handleDelete}
        title="Delete Route"
        message="Are you sure you want to delete this route? This may affect related trains and schedules."
      />

      {/* Loading Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 shadow-xl">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-700">{actionMessage || 'Processing...'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutesManagement;