import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit, Trash2, Search, AlertCircle, Loader,
  MapPin, Navigation, Building2, ChevronDown, ChevronUp,
  Filter, X, Train, Activity, Globe
} from 'lucide-react';
import Button from '@/components/ui/button';
import StationFormModal from '@/components/StationManage/StationFormModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import stationsApi from '@/api/stations';

const StationManagement = () => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    has_coordinates: null,
    is_active: null
  });
  
  // UI state
  const [expandedRegions, setExpandedRegions] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [sortBy, setSortBy] = useState('name'); // 'name', 'code', 'city'

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Selected items
  const [selectedStation, setSelectedStation] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchStations();
  }, [filters]);

  useEffect(() => {
    const count = [filters.has_coordinates, filters.is_active].filter(f => f !== null).length;
    setActiveFilterCount(count);
  }, [filters]);

  const fetchStations = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 200 };
      if (filters.has_coordinates !== null) {
        params.has_coordinates = filters.has_coordinates;
      }
      if (filters.is_active !== null) {
        params.is_active = filters.is_active;
      }

      const response = await stationsApi.getAll(params);
      setStations(response.stations || []);
      
      // Initialize all regions as expanded
      const regions = {};
      (response.stations || []).forEach(station => {
        const region = station.state_region || 'Unassigned';
        regions[region] = true;
      });
      setExpandedRegions(regions);
    } catch (err) {
      setError(err.detail || err.message || 'Failed to fetch stations');
      console.error('Error fetching stations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter stations based on search - THIS MUST COME FIRST
  const filteredStations = useMemo(() => {
    if (!searchTerm.trim()) return stations;

    const searchLower = searchTerm.toLowerCase();
    return stations.filter(station =>
      station.name?.toLowerCase().includes(searchLower) ||
      station.code?.toLowerCase().includes(searchLower) ||
      station.city?.toLowerCase().includes(searchLower) ||
      station.state_region?.toLowerCase().includes(searchLower)
    );
  }, [stations, searchTerm]);

  // Group and sort stations by region - NOW THIS CAN REFERENCE filteredStations
  const groupedStations = useMemo(() => {
    const filtered = filteredStations;
    const groups = {};
    
    filtered.forEach(station => {
      const region = station.state_region || 'Unassigned';
      if (!groups[region]) {
        groups[region] = [];
      }
      groups[region].push(station);
    });
    
    // Sort stations within each group
    Object.keys(groups).forEach(region => {
      groups[region].sort((a, b) => {
        switch(sortBy) {
          case 'code':
            return (a.code || '').localeCompare(b.code || '');
          case 'city':
            return (a.city || '').localeCompare(b.city || '');
          default:
            return (a.name || '').localeCompare(b.name || '');
        }
      });
    });
    
    // Sort regions alphabetically
    return Object.keys(groups)
      .sort()
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {});
  }, [filteredStations, sortBy]);

  const handleCreate = async (formData) => {
    setActionLoading(true);
    try {
      await stationsApi.create(formData);
      await fetchStations();
      setError(null);
      setIsFormOpen(false);
    } catch (err) {
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (formData) => {
    if (!selectedStation) return;
    setActionLoading(true);
    try {
      await stationsApi.update(selectedStation.id, formData);
      await fetchStations();
      setError(null);
      setIsFormOpen(false);
      setSelectedStation(null);
    } catch (err) {
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(true);
    try {
      await stationsApi.delete(deleteId, true);
      setStations(prev => prev.filter(s => s.id !== deleteId));
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      setError(null);
    } catch (err) {
      setError(err.detail?.message || err.message || 'Failed to delete station');
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditClick = (station) => {
    setSelectedStation(station);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleAddClick = () => {
    setSelectedStation(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (formData) => {
    if (selectedStation) {
      await handleUpdate(formData);
    } else {
      await handleCreate(formData);
    }
  };

  const toggleRegion = (region) => {
    setExpandedRegions(prev => ({
      ...prev,
      [region]: !prev[region]
    }));
  };

  const clearFilters = () => {
    setFilters({
      has_coordinates: null,
      is_active: null
    });
    setSearchTerm('');
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const total = stations.length;
    const active = stations.filter(s => s.is_active).length;
    const withGPS = stations.filter(s => s.latitude && s.longitude).length;
    const regions = new Set(stations.map(s => s.state_region)).size;
    return { total, active, withGPS, regions };
  }, [stations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">ဘူတာများ ဒေတာများ ရယူနေသည်...</p>
          <p className="text-gray-400 text-sm mt-1">နောက်ဆုံးဒေတာများကို ရယူနေပါသည်...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="text-red-600 hover:text-red-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, code, city..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleAddClick}
              className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add New Station
            </Button>

            <Button
              onClick={() => setShowFilters(!showFilters)}
              className={`border ${
                showFilters || activeFilterCount > 0
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="name">Sort by Name</option>
              <option value="code">Sort by Code</option>
              <option value="city">Sort by City</option>
            </select>
          </div>
        </div>

        {/* Expandable Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">GPS Coordinates</label>
                <select
                  value={filters.has_coordinates === null ? '' : filters.has_coordinates.toString()}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    has_coordinates: e.target.value === '' ? null : e.target.value === 'true'
                  }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="true">With GPS</option>
                  <option value="false">Without GPS</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filters.is_active === null ? '' : filters.is_active.toString()}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    is_active: e.target.value === '' ? null : e.target.value === 'true'
                  }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              {(activeFilterCount > 0 || searchTerm) && (
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stations List */}
      {filteredStations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No stations found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm ? 'No stations match your search criteria' : 'Start by adding a new station'}
          </p>
          {!searchTerm && (
            <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" />
              Add New Station
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedStations).map(([region, regionStations]) => (
            <div key={region} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Region Header */}
              <button
                onClick={() => toggleRegion(region)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-lg">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{region}</h3>
                    <p className="text-sm text-gray-500">
                      {regionStations.length} station{regionStations.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {expandedRegions[region] ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Region Stations */}
              {expandedRegions[region] && (
                <div className="border-t border-gray-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {regionStations.map((station) => (
                      <div
                        key={station.id}
                        className="bg-gray-50 rounded-xl p-4 hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer group"
                        onClick={() => handleEditClick(station)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 truncate">{station.name}</h3>
                              {station.code && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                                  {station.code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                station.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {station.is_active ? 'Active' : 'Inactive'}
                              </span>
                              {(station.latitude && station.longitude) ? (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium flex items-center gap-1">
                                  <Navigation className="w-3 h-3" />
                                  GPS Ready
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  No GPS
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {station.city && (
                          <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {station.city}
                          </p>
                        )}

                        {(station.latitude && station.longitude) && (
                          <div className="mt-3 bg-white rounded-lg p-2 border border-gray-200">
                            <p className="text-xs text-gray-500 font-mono">
                              {Number(station.latitude).toFixed(4)}, {Number(station.longitude).toFixed(4)}
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(station);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(station.id, e)}
                            className="px-3 py-2 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Station Form Modal */}
      <StationFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedStation(null);
        }}
        onSubmit={handleFormSubmit}
        station={selectedStation}
        loading={actionLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setDeleteId(null);
        }}
        onConfirm={handleDelete}
        title="Delete Station"
        message="Are you sure you want to delete this station? This will also remove it from all routes."
      />
    </div>
  );
};

export default StationManagement;