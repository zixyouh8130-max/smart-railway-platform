import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Loader, Navigation, Maximize2 } from 'lucide-react';
import Button from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icon for stations
const stationIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Myanmar States and Divisions in Myanmar Language
const MYANMAR_REGIONS = {
  states: [
    { value: 'ကချင်ပြည်နယ်', label: 'ကချင်ပြည်နယ်' },
    { value: 'ကယားပြည်နယ်', label: 'ကယားပြည်နယ်' },
    { value: 'ကရင်ပြည်နယ်', label: 'ကရင်ပြည်နယ်' },
    { value: 'ချင်းပြည်နယ်', label: 'ချင်းပြည်နယ်' },
    { value: 'မွန်ပြည်နယ်', label: 'မွန်ပြည်နယ်' },
    { value: 'ရခိုင်ပြည်နယ်', label: 'ရခိုင်ပြည်နယ်' },
    { value: 'ရှမ်းပြည်နယ်', label: 'ရှမ်းပြည်နယ်' }
  ],
  divisions: [
    { value: 'ဧရာဝတီ တိုင်းဒေသကြီး', label: 'ဧရာဝတီတိုင်းဒေသကြီး' },
    { value: 'ပဲခူး တိုင်းဒေသကြီး', label: 'ပဲခူးတိုင်းဒေသကြီး' },
    { value: 'မကွေး တိုင်းဒေသကြီး', label: 'မကွေးတိုင်းဒေသကြီး' },
    { value: 'မန္တလေး တိုင်းဒေသကြီး', label: 'မန္တလေးတိုင်းဒေသကြီး' },
    { value: 'စစ်ကိုင်း တိုင်းဒေသကြီး', label: 'စစ်ကိုင်းတိုင်းဒေသကြီး' },
    { value: 'တနင်္သာရီ တိုင်းဒေသကြီး', label: 'တနင်္သာရီတိုင်းဒေသကြီး' },
    { value: 'ရန်ကုန် တိုင်းဒေသကြီး', label: 'ရန်ကုန်တိုင်းဒေသကြီး' }
  ], 
  unionTerritory: [
    { value: 'Nay Pyi Taw Union Territory', label: 'နေပြည်တော် ပြည်ထောင်စုနယ်မြေ' }
  ]
};

// Component to handle map clicks
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

// Component to handle map view changes
const MapViewUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 13);
    }
  }, [center, zoom, map]);
  return null;
};

// Component for current location button
const LocationButton = ({ onLocationFound }) => {
  const map = useMap();

  const handleLocate = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  useEffect(() => {
    const handleLocationFound = (e) => {
      onLocationFound(e.latlng);
    };

    map.on('locationfound', handleLocationFound);
    return () => {
      map.off('locationfound', handleLocationFound);
    };
  }, [map, onLocationFound]);

  return (
    <button
      type="button"
      onClick={handleLocate}
      className="absolute bottom-4 left-4 z-[1000] bg-white p-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
      title="Use my current location"
    >
      <Navigation className="w-5 h-5 text-blue-600" />
    </button>
  );
};

const StationFormModal = ({ isOpen, onClose, onSubmit, station, loading }) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    city: '',
    state_region: '',
    latitude: '',
    longitude: '',
    is_active: true
  });
  const [errors, setErrors] = useState({});
  const [showMap, setShowMap] = useState(false);
  const [mapCenter, setMapCenter] = useState([21.9162, 95.9560]); // Myanmar center
  const [markerPosition, setMarkerPosition] = useState(null);
  const [locatingAddress, setLocatingAddress] = useState(false);

  // Get all regions for dropdown
  const allRegions = [
    { group: 'ပြည်နယ်များ (States)', options: MYANMAR_REGIONS.states },
    { group: 'တိုင်းဒေသကြီးများ (Regions)', options: MYANMAR_REGIONS.divisions },
    { group: 'ပြည်ထောင်စုနယ်မြေ (Union Territory)', options: MYANMAR_REGIONS.unionTerritory }
  ];

  useEffect(() => {
    if (station) {
      setFormData({
        name: station.name || '',
        code: station.code || '',
        city: station.city || '',
        state_region: station.state_region || '',
        latitude: station.latitude ? Number(station.latitude).toFixed(6) : '',
        longitude: station.longitude ? Number(station.longitude).toFixed(6) : '',
        is_active: station.is_active !== undefined ? station.is_active : true
      });

      // Set marker position if coordinates exist
      if (station.latitude && station.longitude) {
        setMarkerPosition([parseFloat(station.latitude), parseFloat(station.longitude)]);
        setMapCenter([parseFloat(station.latitude), parseFloat(station.longitude)]);
      }
    } else {
      setFormData({
        name: '',
        code: '',
        city: '',
        state_region: '',
        latitude: '',
        longitude: '',
        is_active: true
      });
      setMarkerPosition(null);
      setMapCenter([21.9162, 95.9560]);
    }
    setErrors({});
    setShowMap(false);
  }, [station, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleMapClick = (latlng) => {
    setMarkerPosition([latlng.lat, latlng.lng]);
    setFormData(prev => ({
      ...prev,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6)
    }));
    setErrors(prev => ({ ...prev, coordinates: '' }));
  };

  const handleLocationFound = (latlng) => {
    setMarkerPosition([latlng.lat, latlng.lng]);
    setFormData(prev => ({
      ...prev,
      latitude: latlng.lat.toFixed(6),
      longitude: latlng.lng.toFixed(6)
    }));
    setErrors(prev => ({ ...prev, coordinates: '' }));
  };

  // Get address from coordinates using reverse geocoding
  const getAddressFromCoordinates = async (lat, lng) => {
    setLocatingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();

      if (data.address) {
        const city = data.address.city || data.address.town || data.address.state || '';
        const state = data.address.state || data.address.region || '';

        setFormData(prev => ({
          ...prev,
          city: prev.city || city,
          state_region: prev.state_region || state
        }));
      }
    } catch (err) {
      console.error('Error getting address:', err);
    } finally {
      setLocatingAddress(false);
    }
  };

  const handleCoordinatesChange = (field, value) => {
    const numValue = parseFloat(value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Update marker when both coordinates are valid
    const lat = field === 'latitude' ? numValue : parseFloat(formData.latitude);
    const lng = field === 'longitude' ? numValue : parseFloat(formData.longitude);

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setMarkerPosition([lat, lng]);
      setMapCenter([lat, lng]);
    }
  };

  // Get display label for selected region
  const getRegionLabel = (value) => {
    for (const group of allRegions) {
      const found = group.options.find(opt => opt.value === value);
      if (found) return found.label;
    }
    return value;
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Station name is required';
    }

    if (formData.code && formData.code.trim().length > 10) {
      newErrors.code = 'Code must be 10 characters or less';
    }

    if (!formData.state_region) {
      newErrors.state_region = 'Please select a state/region';
    }

    if (formData.latitude && (formData.latitude < -90 || formData.latitude > 90)) {
      newErrors.latitude = 'Latitude must be between -90 and 90';
    }

    if (formData.longitude && (formData.longitude < -180 || formData.longitude > 180)) {
      newErrors.longitude = 'Longitude must be between -180 and 180';
    }

    if ((formData.latitude && !formData.longitude) || (!formData.latitude && formData.longitude)) {
      newErrors.coordinates = 'Both latitude and longitude must be provided together';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const submitData = {
      name: formData.name.trim(),
      code: formData.code ? formData.code.trim().toUpperCase() : null,
      city: formData.city?.trim() || null,
      state_region: formData.state_region || null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      is_active: formData.is_active
    };

    await onSubmit(submitData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">
            {station ? 'Edit Station' : 'Add New Station'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Station Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Station Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Yangon Central"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Station Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Station Code
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g., YGN"
              maxLength={10}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.code ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.code ? (
              <p className="mt-1 text-sm text-red-600">{errors.code}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Short code for the station (max 10 chars)</p>
            )}
          </div>

          {/* City and State/Region */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="e.g., Yangon"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State/Region <span className="text-red-500">*</span>
              </label>
              <select
                name="state_region"
                value={formData.state_region}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.state_region ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select State/Region</option>
                {allRegions.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.options.map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errors.state_region && (
                <p className="mt-1 text-sm text-red-600">{errors.state_region}</p>
              )}
              {formData.state_region && (
                <p className="mt-1 text-xs text-gray-500">
                  Selected: {getRegionLabel(formData.state_region)}
                </p>
              )}
            </div>
          </div>

          {/* GPS Coordinates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                GPS Coordinates
              </label>
              <button
                type="button"
                onClick={() => setShowMap(!showMap)}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <MapPin className="w-3 h-3" />
                {showMap ? 'Hide Map' : 'Select from Map'}
              </button>
            </div>

            {/* Map */}
            {showMap && (
              <div className="mb-4 rounded-lg overflow-hidden border border-gray-300">
                <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapClickHandler onMapClick={handleMapClick} />
                    <MapViewUpdater center={mapCenter} zoom={13} />
                    <LocationButton onLocationFound={handleLocationFound} />

                    {markerPosition && (
                      <Marker
                        position={markerPosition}
                        icon={stationIcon}
                        draggable={true}
                        eventHandlers={{
                          dragend: (e) => {
                            const marker = e.target;
                            const position = marker.getLatLng();
                            handleMapClick(position);
                          }
                        }}
                      />
                    )}
                  </MapContainer>

                  {/* Get Address Button */}
                  {markerPosition && (
                    <button
                      type="button"
                      onClick={() => getAddressFromCoordinates(markerPosition[0], markerPosition[1])}
                      disabled={locatingAddress}
                      className="absolute bottom-4 right-4 z-[1000] bg-white px-3 py-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
                    >
                      {locatingAddress ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Getting address...
                        </>
                      ) : (
                        <>
                          <MapPin className="w-4 h-4" />
                          Get Address
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="bg-gray-50 px-4 py-2 text-xs text-gray-600">
                  💡 Click on the map to set coordinates, drag marker to adjust, or use the location button
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <input
                  type="number"
                  name="latitude"
                  value={formData.latitude}
                  onChange={(e) => handleCoordinatesChange('latitude', e.target.value)}
                  placeholder="Latitude"
                  step="0.000001"
                  min="-90"
                  max="90"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.latitude || errors.coordinates ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500">Range: -90 to 90</p>
              </div>
              <div>
                <input
                  type="number"
                  name="longitude"
                  value={formData.longitude}
                  onChange={(e) => handleCoordinatesChange('longitude', e.target.value)}
                  placeholder="Longitude"
                  step="0.000001"
                  min="-180"
                  max="180"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.longitude || errors.coordinates ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500">Range: -180 to 180</p>
              </div>
            </div>

            {(errors.latitude || errors.longitude || errors.coordinates) && (
              <p className="mt-1 text-sm text-red-600">
                {errors.latitude || errors.longitude || errors.coordinates}
              </p>
            )}

            {/* Coordinate Preview */}
            {formData.latitude && formData.longitude && (
              <div className="mt-2 p-2 bg-green-50 rounded-lg text-xs text-green-700">
                📍 Selected: {formData.latitude}, {formData.longitude}
                <a
                  href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:text-blue-700 underline"
                >
                  View on Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="ml-2 text-sm text-gray-700">
              Active Station
            </label>
          </div>

          {/* Preview */}
          {formData.name && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Preview</h3>
              <div className="space-y-1 text-sm text-blue-700">
                <p>Name: {formData.name}</p>
                {formData.code && <p>Code: {formData.code.toUpperCase()}</p>}
                {formData.city && <p>City: {formData.city}</p>}
                {formData.state_region && (
                  <p>State/Region: {getRegionLabel(formData.state_region)}</p>
                )}
                {formData.latitude && formData.longitude && (
                  <p>Coordinates: {formData.latitude}, {formData.longitude}</p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : station ? (
                'Update Station'
              ) : (
                'Create Station'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StationFormModal;