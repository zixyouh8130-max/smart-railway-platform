import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Search, Loader, MapPin } from 'lucide-react';
import Button from '@/components/ui/button';
import stationsApi from '@/api/stations';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Error extraction helper
const extractError = (error) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) {
    return error.map(e => {
      const field = e.loc?.join('.') || '';
      const msg = e.msg || '';
      return field ? `${field}: ${msg}` : msg;
    }).join('; ');
  }
  if (error.detail) {
    if (Array.isArray(error.detail)) return extractError(error.detail);
    if (typeof error.detail === 'string') return error.detail;
    return JSON.stringify(error.detail);
  }
  if (error.message) return error.message;
  return 'An error occurred';
};

// SortableStation Component
const SortableStation = ({
  station,
  index,
  totalStations,
  onRemove,
  onChange,
  onSearch,
  errors,
  stationDropdowns,
  getFilteredStations,
  handleStationSelect,
  stationSearchTerms,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `station-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isFirstStation = index === 0;
  const isLastStation = index === totalStations - 1;
  const isMiddleStation = !isFirstStation && !isLastStation;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start space-x-2 p-3 bg-gray-50 rounded-lg ${
        isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''
      }`}
    >
      <div className="flex items-center pt-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing hover:bg-gray-200 p-1 rounded transition-colors"
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <span className="ml-1 text-xs font-medium text-gray-500 w-6">{index + 1}.</span>
        {isFirstStation && (
          <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Origin</span>
        )}
        {isLastStation && (
          <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Destination</span>
        )}
        {isMiddleStation && (
          <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Stop</span>
        )}
      </div>

      <div className="flex-1 space-y-2">
        {/* Station Search/Autocomplete */}
        <div className="relative">
          <div className="flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search station or type custom name..."
              value={station.station_name}
              onChange={(e) => {
                onChange(index, 'station_name', e.target.value);
                onSearch(index, e.target.value);
              }}
              onFocus={() => {
                if (station.station_name) onSearch(index, station.station_name);
              }}
              className={`w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors?.stationDetails?.[index]?.station_name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
          </div>

          {stationDropdowns[index] && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {getFilteredStations(index).length > 0 ? (
                getFilteredStations(index).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStationSelect(index, s)}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      {s.code && <span className="text-xs text-gray-500 font-mono">{s.code}</span>}
                    </div>
                    {s.city && <p className="text-xs text-gray-500">{s.city}</p>}
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-gray-500">
                  {stationSearchTerms[index]
                    ? 'No stations found. Type to create custom station.'
                    : 'Type to search stations...'}
                </div>
              )}
            </div>
          )}

          {errors?.stationDetails?.[index]?.station_name && (
            <p className="mt-1 text-xs text-red-600">{errors.stationDetails[index].station_name}</p>
          )}
        </div>

        {/* Station Details */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Station Code (optional)</label>
            <input
              type="text"
              placeholder="e.g., YGN"
              value={station.station_code || ''}
              onChange={(e) => onChange(index, 'station_code', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Distance from Origin (km)</label>
            <input
              type="number"
              placeholder="0.0"
              value={station.distance_from_origin || ''}
              onChange={(e) => onChange(index, 'distance_from_origin', parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Major Stop Checkbox */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id={`major-stop-${index}`}
            checked={station.is_major_stop || false}
            onChange={(e) => onChange(index, 'is_major_stop', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <label htmlFor={`major-stop-${index}`} className="text-xs text-gray-600">
            Major Stop
          </label>
        </div>

        {/* Station type indicator */}
        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {isFirstStation && 'Origin - trains depart from here'}
          {isLastStation && 'Destination - trains terminate here'}
          {isMiddleStation && 'Intermediate stop'}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(index)}
        className={`p-2 rounded-lg transition-colors ${
          (isFirstStation || isLastStation) ? 'text-gray-300 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'
        }`}
        disabled={isFirstStation || isLastStation}
        title={isFirstStation ? 'Cannot remove origin' : isLastStation ? 'Cannot remove destination' : 'Remove station'}
      >
        <Trash2 className={`w-4 h-4 ${(isFirstStation || isLastStation) ? 'opacity-30' : ''}`} />
      </button>
    </div>
  );
};

// Main RouteFormModal Component
const RouteFormModal = ({ isOpen, onClose, onSubmit, route }) => {
  const [formData, setFormData] = useState({
    name: '',
    origin: '',
    destination: '',
    distance: '',
    duration: '',
    base_price: '',
    status: 'ACTIVE',
    stations: [{
      station_id: null,
      station_name: '',
      station_code: '',
      order_number: 1,
      distance_from_origin: 0,
      is_major_stop: false,
    }],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [masterStations, setMasterStations] = useState([]);
  const [stationSearchTerms, setStationSearchTerms] = useState({});
  const [stationDropdowns, setStationDropdowns] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchMasterStations(); }, []);

  useEffect(() => {
    if (route) {
      setFormData({
        name: route.name || '',
        origin: route.origin || '',
        destination: route.destination || '',
        distance: route.distance || '',
        duration: route.duration || '',
        base_price: route.base_price || '',
        status: route.status || 'ACTIVE',
        stations: route.stations?.length > 0
          ? route.stations.map((s) => ({
              station_id: s.station_id || s.station?.id || null,
              station_name: s.station_name || s.station?.name || '',
              station_code: s.station_code || s.station?.code || '',
              order_number: s.order_number,
              distance_from_origin: s.distance_from_origin || 0,
              is_major_stop: s.is_major_stop || false,
            }))
          : [{
              station_id: null, station_name: '', station_code: '',
              order_number: 1, distance_from_origin: 0, is_major_stop: false,
            }],
      });
    } else {
      setFormData({
        name: '', origin: '', destination: '', distance: '', duration: '',
        base_price: '', status: 'ACTIVE',
        stations: [{
          station_id: null, station_name: '', station_code: '',
          order_number: 1, distance_from_origin: 0, is_major_stop: false,
        }],
      });
    }
    setErrors({});
    setStationSearchTerms({});
    setStationDropdowns({});
  }, [route, isOpen]);

  const fetchMasterStations = async () => {
    try {
      const response = await stationsApi.getAll({ limit: 200, is_active: true });
      setMasterStations(response.stations || []);
    } catch (err) {
      console.error('Error fetching stations:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleStationSearch = (index, searchTerm) => {
    setStationSearchTerms((prev) => ({ ...prev, [index]: searchTerm }));
    setStationDropdowns((prev) => ({ ...prev, [index]: searchTerm.length > 0 }));
  };

  const handleStationSelect = (index, station) => {
    const updatedStations = [...formData.stations];
    updatedStations[index] = {
      ...updatedStations[index],
      station_id: station.id,
      station_name: station.name,
      station_code: station.code || '',
      order_number: index + 1,
    };
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
    setStationSearchTerms((prev) => ({ ...prev, [index]: '' }));
    setStationDropdowns((prev) => ({ ...prev, [index]: false }));
  };

  const handleStationChange = (index, field, value) => {
    const updatedStations = [...formData.stations];
    updatedStations[index] = { ...updatedStations[index], [field]: value, order_number: index + 1 };
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const addStation = () => {
    setFormData((prev) => ({
      ...prev,
      stations: [
        ...prev.stations.slice(0, -1),
        { station_id: null, station_name: '', station_code: '', order_number: prev.stations.length,
          distance_from_origin: 0, is_major_stop: false },
        prev.stations[prev.stations.length - 1],
      ],
    }));
  };

  const removeStation = (index) => {
    if (index === 0 || index === formData.stations.length - 1) return;
    if (formData.stations.length <= 2) {
      setErrors((prev) => ({ ...prev, stations: 'At least 2 stations are required' }));
      return;
    }
    const updatedStations = formData.stations
      .filter((_, i) => i !== index)
      .map((station, i) => ({ ...station, order_number: i + 1 }));
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const getFilteredStations = (index) => {
    const searchTerm = (stationSearchTerms[index] || '').toLowerCase();
    if (!searchTerm) return [];
    return masterStations
      .filter(s => s.name.toLowerCase().includes(searchTerm) ||
        (s.code && s.code.toLowerCase().includes(searchTerm)) ||
        (s.city && s.city.toLowerCase().includes(searchTerm)))
      .slice(0, 10);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = parseInt(active.id.split('-')[1]);
      const newIndex = parseInt(over.id.split('-')[1]);
      if (oldIndex === 0 || oldIndex === formData.stations.length - 1 ||
          newIndex === 0 || newIndex === formData.stations.length - 1) return;
      const newStations = arrayMove(formData.stations, oldIndex, newIndex);
      setFormData((prev) => ({
        ...prev,
        stations: newStations.map((station, i) => ({ ...station, order_number: i + 1 })),
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.origin.trim()) newErrors.origin = 'Origin city is required';
    if (!formData.destination.trim()) newErrors.destination = 'Destination city is required';
    if (formData.origin.trim() && formData.destination.trim() &&
        formData.origin.trim().toLowerCase() === formData.destination.trim().toLowerCase()) {
      newErrors.destination = 'Origin and destination must be different';
    }
    const stationErrors = [];
    formData.stations.forEach((station, index) => {
      if (!station.station_name.trim() && !station.station_id) {
        stationErrors[index] = { station_name: 'Station name is required' };
      }
    });
    if (stationErrors.length > 0) newErrors.stationDetails = stationErrors;
    const stationIds = formData.stations.map((s) => s.station_id || s.station_name.toLowerCase()).filter(Boolean);
    if (new Set(stationIds).size !== stationIds.length) {
      newErrors.stations = 'Duplicate stations are not allowed';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const submitData = {
        name: formData.name || `${formData.origin} - ${formData.destination}`,
        origin: formData.origin,
        destination: formData.destination,
        distance: formData.distance ? parseFloat(formData.distance) : null,
        duration: formData.duration || null,
        base_price: formData.base_price ? parseFloat(formData.base_price) : null,
        status: formData.status,
        stations: formData.stations
          .filter((s) => s.station_name.trim() || s.station_id)
          .map((s) => ({
            station_id: s.station_id || null,
            station_name: s.station_name,
            station_code: s.station_code || null,
            order_number: s.order_number,
            distance_from_origin: s.distance_from_origin || 0,
            is_major_stop: s.is_major_stop || false,
          })),
      };
      await onSubmit(submitData);
      onClose();
    } catch (error) {
      const errorMsg = extractError(error) || 'An error occurred';
      setErrors({ submit: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">
            {route ? 'Edit Route' : 'Add New Route'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error display */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {typeof errors.submit === 'string' ? errors.submit : extractError(errors.submit)}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Origin City <span className="text-red-500">*</span>
              </label>
              <input
                type="text" name="origin" value={formData.origin} onChange={handleChange}
                placeholder="e.g., Yangon"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.origin ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.origin && <p className="mt-1 text-sm text-red-600">{errors.origin}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination City <span className="text-red-500">*</span>
              </label>
              <input
                type="text" name="destination" value={formData.destination} onChange={handleChange}
                placeholder="e.g., Mandalay"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.destination ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.destination && <p className="mt-1 text-sm text-red-600">{errors.destination}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Route Name</label>
            <input
              type="text" name="name" value={formData.name} onChange={handleChange}
              placeholder="e.g., Yangon - Mandalay Express"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'}`}
            />
            <p className="mt-1 text-xs text-gray-500">Leave blank to auto-generate from origin and destination</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Distance (km)</label>
              <input type="number" name="distance" value={formData.distance} onChange={handleChange}
                placeholder="620" step="0.1" min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
              <input type="text" name="duration" value={formData.duration} onChange={handleChange}
                placeholder="e.g., 8 hours"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Base Price (MMK)</label>
              <input type="number" name="base_price" value={formData.base_price} onChange={handleChange}
                placeholder="15000" step="100" min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select name="status" value={formData.status} onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Stations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Stations <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 ml-2">
                  (Schedule times are configured per train)
                </span>
              </label>
              <Button type="button" onClick={addStation}
                className="bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-3">
                <Plus className="w-4 h-4 mr-1" /> Add Stop
              </Button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Drag the grip handle <GripVertical className="w-3 h-3 inline" /> to reorder stations. 
              Origin and destination cannot be removed or moved.
            </p>

            {errors.stations && <p className="mb-2 text-sm text-red-600">{errors.stations}</p>}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={formData.stations.map((_, index) => `station-${index}`)}
                strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {formData.stations.map((station, index) => (
                    <SortableStation
                      key={`station-${index}`} station={station} index={index}
                      totalStations={formData.stations.length} onRemove={removeStation}
                      onChange={handleStationChange} onSearch={handleStationSearch}
                      errors={errors} stationDropdowns={stationDropdowns}
                      getFilteredStations={getFilteredStations}
                      handleStationSelect={handleStationSelect}
                      stationSearchTerms={stationSearchTerms}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <Button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700">Cancel</Button>
            <Button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" /> Saving...
                </span>
              ) : route ? 'Update Route' : 'Create Route'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RouteFormModal;