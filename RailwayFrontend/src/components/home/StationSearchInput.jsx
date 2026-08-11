// components/home/StationSearchInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, MapPin, X, Search, Train } from 'lucide-react';
import stationsApi from '@/api/stations';

const StationSearchInput = ({
  value,
  onChange,
  placeholder = 'ဘူတာရွေးချယ်ပါ...',
  label,
  excludeStation,
  connectedToStation,
  className = '',
  error
}) => {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const wrapperRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch stations based on whether we need connected stations or all stations
  useEffect(() => {
    setStations([]);
    setSelectedStation(null);

    if (connectedToStation) {
      fetchConnectedStations(connectedToStation);
    } else {
      fetchAllStations();
    }
  }, [connectedToStation]);

  // Load initial station if value is provided
  useEffect(() => {
    const loadInitialStation = async () => {
      if (value && stations.length > 0) {
        const found = stations.find(s => s.id === value || String(s.id) === String(value));
        if (found) {
          setSelectedStation(found);
        }
      }
    };
    loadInitialStation();
  }, [value, stations]);

  // Clear selection if value is cleared externally
  useEffect(() => {
    if (!value && selectedStation) {
      setSelectedStation(null);
    }
  }, [value]);

  // Fetch all stations (for departure station selection)
  const fetchAllStations = async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const response = await stationsApi.getAll({
        is_active: true,
        limit: 1000,
        sort_by: 'name',
        sort_order: 'asc'
      });

      let stationList = [];
      if (Array.isArray(response)) {
        stationList = response;
      } else if (response && response.stations) {
        stationList = response.stations;
      } else if (response && response.data) {
        stationList = Array.isArray(response.data) ? response.data : response.data.stations || [];
      }

      setStations(stationList);
    } catch (err) {
      console.error('Failed to fetch stations:', err);
      setFetchError('ဘူတာများ ရယူရန် မအောင်မြင်ပါ');
    } finally {
      setLoading(false);
    }
  };

  // Fetch connected stations (for arrival station selection)
  const fetchConnectedStations = async (stationId) => {
    try {
      setLoading(true);
      setFetchError(null);

      const connectedStations = await stationsApi.getConnectedStations(stationId);
      console.log('Connected stations response:', connectedStations);

      let stationList = [];
      if (Array.isArray(connectedStations)) {
        stationList = connectedStations;
      } else if (connectedStations && connectedStations.stations) {
        stationList = connectedStations.stations;
      } else if (connectedStations && connectedStations.data) {
        stationList = Array.isArray(connectedStations.data) ? connectedStations.data : [];
      }

      setStations(stationList);
    } catch (err) {
      console.error('Failed to fetch connected stations:', err);
      setFetchError('ဆက်သွယ်ထားသော ဘူတာများ ရယူရန် မအောင်မြင်ပါ');
      fetchAllStations();
    } finally {
      setLoading(false);
    }
  };

  // Filter stations based on search query
  const filteredStations = stations.filter(station => {
    if (excludeStation && (String(station.id) === String(excludeStation) || station.code === excludeStation)) {
      return false;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        station.name?.toLowerCase().includes(query) ||
        station.city?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Handle station selection
  const handleStationSelect = async (station) => {
    setSelectedStation(station);
    setIsOpen(false);
    setSearchQuery('');

    if (!connectedToStation) {
      try {
        const stationWithRoutes = await stationsApi.getWithRoutes(station.id);
        onChange({
          stationId: stationWithRoutes.id,
          routeIds: stationWithRoutes.route_ids || []
        });
      } catch (err) {
        onChange({
          stationId: station.id,
          routeIds: station.route_ids || []
        });
      }
    } else {
      onChange({
        stationId: station.id,
        routeIds: station.route_ids || []
      });
    }
  };

  // Clear selection
  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedStation(null);
    setSearchQuery('');
    onChange('');
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Calculate dropdown position
  useEffect(() => {
    if (isOpen && dropdownRef.current && wrapperRef.current) {
      const dropdown = dropdownRef.current;
      const rect = dropdown.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      if (rect.bottom > viewportHeight - 20) {
        dropdown.style.maxHeight = `${viewportHeight - rect.top - 20}px`;
      }
    }
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-white/90 mb-1.5">
          {label}
        </label>
      )}

      {/* Select Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:bg-white/20 focus:border-sky-400 focus:outline-none transition-all flex items-center justify-between hover:bg-white/15"
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {selectedStation ? (
            <>
              <MapPin className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span className="text-white text-sm truncate text-left">
                {selectedStation.name}
              </span>
            </>
          ) : (
            <>
              {connectedToStation ? (
                <Train className="h-4 w-4 text-sky-300 flex-shrink-0" />
              ) : (
                <MapPin className="h-4 w-4 text-sky-300 flex-shrink-0" />
              )}
              <span className="text-white/40 text-sm truncate text-left">
                {loading ? 'ရယူနေသည်...' : placeholder}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {selectedStation && (
            <X
              className="h-3.5 w-3.5 text-white/70 hover:text-white cursor-pointer"
              onClick={handleClear}
            />
          )}
          {loading ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-sky-300"></div>
          ) : (
            <ChevronDown className={`h-4 w-4 text-white/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
      {fetchError && (
        <p className="mt-1 text-xs text-red-400">{fetchError}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] w-full mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-2xl max-h-48 overflow-y-auto"
        >
          {/* Search within dropdown */}
          <div className="sticky top-0 p-2 border-b border-white/10 bg-slate-800 z-10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ရှာဖွေရန် ရိုက်ထည့်ပါ..."
                className="w-full bg-white/10 border border-white/20 rounded-md pl-7 pr-2 py-1.5 text-white text-xs placeholder-white/40 focus:bg-white/20 focus:border-sky-400 focus:outline-none transition-all"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Station List */}
          {loading ? (
            <div className="px-3 py-4 text-white/60 text-xs text-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-300 mx-auto mb-1"></div>
              {connectedToStation ? 'ဆက်သွယ်ထားသော ဘူတာများ ရယူနေသည်...' : 'ဘူတာများ ရယူနေသည်...'}
            </div>
          ) : filteredStations.length > 0 ? (
            <ul className="py-1">
              {filteredStations.map((station) => (
                <li key={station.id || station.code}>
                  <button
                    type="button"
                    onClick={() => handleStationSelect(station)}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-start space-x-2 hover:bg-white/10 ${
                      selectedStation?.id === station.id ? 'bg-blue-500/20 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <MapPin className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                      selectedStation?.id === station.id ? 'text-blue-400' : 'text-sky-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">
                        {station.name}
                      </p>
                      {station.city && (
                        <p className="text-white/50 text-[10px] truncate">
                          {[station.city, station.state_region].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-white/60 text-xs text-center">
              <MapPin className="h-6 w-6 mx-auto mb-1 text-white/40" />
              {searchQuery ? 'ရှာဖွေတွေ့ရှိမှုမရှိပါ' : connectedToStation ? 'ဤဘူတာမှ သွားရောက်နိုင်သော ဘူတာမရှိပါ' : 'ဘူတာမရှိပါ'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StationSearchInput;