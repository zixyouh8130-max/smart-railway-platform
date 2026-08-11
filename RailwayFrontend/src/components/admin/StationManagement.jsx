import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit, Trash2, Search, AlertCircle, Loader,
  MapPin, Navigation, Building2
} from 'lucide-react';
import Button from '@/components/ui/Button';
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
    } catch (err) {
      setError(err.detail || err.message || 'Failed to fetch stations');
      console.error('Error fetching stations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter stations based on search
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading stations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Station Management</h1>
          <p className="text-gray-600 mt-1">Manage master station catalog with GPS coordinates</p>
        </div>
        <Button
          onClick={handleAddClick}
          className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Add Station
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            ✕
          </button>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, code, city..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <select
            value={filters.has_coordinates === null ? '' : filters.has_coordinates.toString()}
            onChange={(e) => setFilters(prev => ({
              ...prev,
              has_coordinates: e.target.value === '' ? null : e.target.value === 'true'
            }))}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Coordinates</option>
            <option value="true">With GPS</option>
            <option value="false">Without GPS</option>
          </select>

          <select
            value={filters.is_active === null ? '' : filters.is_active.toString()}
            onChange={(e) => setFilters(prev => ({
              ...prev,
              is_active: e.target.value === '' ? null : e.target.value === 'true'
            }))}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stations Grid */}
      {filteredStations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No stations found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm ? 'No stations match your search' : 'Start by adding a new station'}
          </p>
          {!searchTerm && (
            <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" />
              Add Station
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStations.map((station) => (
            <div
              key={station.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">{station.name}</h3>
                    {station.code && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                        {station.code}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      station.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {station.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {station.city && (
                    <p className="text-sm text-gray-600 mt-1">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      {station.city}{station.state_region ? `၊ ${station.state_region}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Coordinates */}
              {(station.latitude && station.longitude) ? (
                <div className="bg-green-50 rounded-lg p-2 mb-3">
                  <div className="flex items-center gap-2 text-xs text-green-700">
                    <Navigation className="w-3 h-3" />
                    <span>
                      {Number(station.latitude).toFixed(4)}, {Number(station.longitude).toFixed(4)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 rounded-lg p-2 mb-3">
                  <p className="text-xs text-yellow-700">⚠️ No GPS coordinates set</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleEditClick(station)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={(e) => handleDeleteClick(station.id, e)}
                  className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
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