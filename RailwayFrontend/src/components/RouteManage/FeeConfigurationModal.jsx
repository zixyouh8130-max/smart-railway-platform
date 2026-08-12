// src/components/admin/FeeConfigurationModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Loader, AlertCircle, Train, Info, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/button';
import feesApi from '@/api/fees';
import trainsApi from '@/api/trains';
import routesApi from '@/api/routes';

// Error handling utility
const extractErrorMessage = (error) => {
  if (!error) return 'An unexpected error occurred';
  if (typeof error === 'string') return error;
  
  // FastAPI validation errors (array of objects with loc, msg, input, type)
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
  
  // Standard Error object
  if (error.message) return error.message;
  
  // Fallback
  try {
    return JSON.stringify(error);
  } catch {
    return 'An unexpected error occurred';
  }
};

const FeeConfigurationModal = ({ isOpen, onClose, routeId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Train selection
  const [trains, setTrains] = useState([]);
  const [selectedTrainId, setSelectedTrainId] = useState(null);
  const [trainsLoading, setTrainsLoading] = useState(false);
  
  // Route data
  const [stations, setStations] = useState([]);

  // Station-to-station fare matrix
  const [fareMatrix, setFareMatrix] = useState({});

  // Stats
  const [totalFarePairs, setTotalFarePairs] = useState(0);
  const [filledFarePairs, setFilledFarePairs] = useState(0);

  // Fetch trains for this route when modal opens
  useEffect(() => {
    if (isOpen && routeId) {
      fetchTrainsForRoute();
    }
    
    return () => {
      if (!isOpen) {
        resetState();
      }
    };
  }, [isOpen, routeId]);

  // Fetch stations when train is selected
  useEffect(() => {
    if (selectedTrainId) {
      fetchStationsForTrain();
    } else {
      setStations([]);
      setFareMatrix({});
    }
  }, [selectedTrainId]);

  const resetState = () => {
    setTrains([]);
    setSelectedTrainId(null);
    setStations([]);
    setFareMatrix({});
    setError(null);
    setSuccess(null);
    setTotalFarePairs(0);
    setFilledFarePairs(0);
  };

  const fetchTrainsForRoute = async () => {
    setTrainsLoading(true);
    setError(null);
    try {
      const response = await trainsApi.getByRoute(routeId);
      console.log('Trains response:', response);
      
      const trainsList = response.trains || response.data?.trains || [];
      setTrains(trainsList);
      
      if (trainsList.length > 0) {
        setSelectedTrainId(trainsList[0].id);
      } else {
        setSelectedTrainId(null);
      }
    } catch (err) {
      console.error('Error fetching trains:', err);
      setError('Failed to fetch trains for this route');
    } finally {
      setTrainsLoading(false);
    }
  };

  const fetchStationsForTrain = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching route data for routeId:', routeId);
      const routeResponse = await routesApi.getById(routeId);
      console.log('Route response:', routeResponse);
      
      let routeData = routeResponse.data || routeResponse;
      let routeStations = [];
      
      if (routeData.stations && Array.isArray(routeData.stations)) {
        routeStations = routeData.stations;
      } else if (routeData.route_stations && Array.isArray(routeData.route_stations)) {
        routeStations = routeData.route_stations;
      }
      
      if (routeStations.length > 0) {
        const sortedStations = [...routeStations].sort((a, b) => {
          const orderA = a.order_number || a.stop_order || a.sequence || 0;
          const orderB = b.order_number || b.stop_order || b.sequence || 0;
          return orderA - orderB;
        });
        
        console.log('Sorted stations:', sortedStations);
        setStations(sortedStations);
        initializeFareMatrix(sortedStations);
        await fetchExistingFees();
      } else {
        console.warn('No stations found in route data');
        setStations([]);
        setError('No stations found for this route. Please add stations first.');
      }
    } catch (err) {
      console.error('Error fetching stations:', err);
      setError('Failed to fetch station data');
      setStations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingFees = async () => {
    if (!selectedTrainId) return;
    
    try {
      const response = await feesApi.getFeeRules(selectedTrainId);
      console.log('Existing fees response:', response);
      
      let rules = [];
      
      if (Array.isArray(response)) {
        rules = response;
      } else if (response && response.rules && Array.isArray(response.rules)) {
        rules = response.rules;
      } else if (response && response.data && response.data.rules && Array.isArray(response.data.rules)) {
        rules = response.data.rules;
      } else if (response && Array.isArray(response.data)) {
        rules = response.data;
      }

      console.log(`Found ${rules.length} existing fee rules`);

      // Populate fare matrix from existing rules
      const matrix = {};
      rules.forEach((rule) => {
        const fromStationId = rule.from_station_id;
        const toStationId = rule.to_station_id;
        const fare = rule.base_fare || 0;
        
        if (fromStationId && toStationId) {
          const key = `${fromStationId}-${toStationId}`;
          matrix[key] = {
            fromId: fromStationId,
            toId: toStationId,
            fare: fare,
            classType: rule.class_type || 'ORDINARY',
            calculatedDistance: rule.calculated_distance || 0
          };
        }
      });
      
      console.log('Matrix from existing rules:', matrix);
      
      setFareMatrix(prev => {
        const updated = { ...prev, ...matrix };
        return updated;
      });
      
      if (rules.length > 0) {
        setSuccess(`Loaded ${rules.length} existing fare rules`);
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      console.error('Failed to fetch existing fees:', err);
    }
  };

  const initializeFareMatrix = (stationList) => {
    const matrix = {};
    let pairCount = 0;
    
    for (let i = 0; i < stationList.length; i++) {
      for (let j = i + 1; j < stationList.length; j++) {
        const fromStation = stationList[i];
        const toStation = stationList[j];
        
        // Use route_station ID (the 'id' field)
        const fromId = fromStation.id;
        const toId = toStation.id;
        const key = `${fromId}-${toId}`;

        const distance = Math.abs(
          (toStation.distance_from_origin || 0) - (fromStation.distance_from_origin || 0)
        );

        if (!matrix[key]) {
          matrix[key] = {
            fromId,
            toId,
            fare: 0,
            classType: 'ORDINARY',
            calculatedDistance: distance
          };
          pairCount++;
        }
      }
    }
    
    setTotalFarePairs(pairCount);
    setFareMatrix(prev => {
      const updated = { ...matrix, ...prev };
      return updated;
    });
  };

  // Update filled pairs count whenever fareMatrix changes
  useEffect(() => {
    const filled = Object.values(fareMatrix).filter(entry => entry.fare > 0).length;
    setFilledFarePairs(filled);
  }, [fareMatrix, totalFarePairs]);

  const handleFareChange = (fromId, toId, value) => {
    const key = `${fromId}-${toId}`;
    setFareMatrix(prev => ({
      ...prev,
      [key]: { ...prev[key], fare: parseFloat(value) || 0 }
    }));
  };

  const handleGenerateFees = async () => {
    if (!selectedTrainId) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await feesApi.generateFeeRules(selectedTrainId);
      console.log('Generate fees result:', result);
      
      const rulesCount = result.rules_count || result.data?.rules_count || 0;
      if (rulesCount > 0) {
        setSuccess(`✅ Successfully generated ${rulesCount} fee rules!`);
      } else {
        setSuccess(`✅ Fee rules are up to date!`);
      }
      
      await fetchExistingFees();
    } catch (err) {
      console.error('Failed to generate fees:', err);
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage || 'Failed to generate fee rules');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!selectedTrainId) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const rules = Object.values(fareMatrix)
        .filter(entry => entry.fare > 0)
        .map(entry => ({
          train_id: selectedTrainId,
          route_id: routeId,
          from_station_id: entry.fromId,
          to_station_id: entry.toId,
          base_fare: entry.fare,
          per_km_rate: 0,
          class_type: entry.classType || 'ORDINARY',
          seat_type: null,
          calculated_distance: entry.calculatedDistance || 0,
          surcharge_percentage: 0,
          is_active: true
        }));

      if (rules.length === 0) {
        setError('⚠️ Please set at least one fare before saving');
        setSaving(false);
        return;
      }

      console.log('Saving rules:', rules);
      
      // Try sending as object with rules key
      await feesApi.bulkUpdateFeeRules(selectedTrainId, { rules });
      
      setSuccess(`✅ Successfully saved ${rules.length} fare rules!`);
      await fetchExistingFees();
    } catch (err) {
      console.error('Failed to save:', err);
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTrainChange = (e) => {
    const newTrainId = parseInt(e.target.value);
    setSelectedTrainId(newTrainId);
    setStations([]);
    setFareMatrix({});
    setError(null);
    setSuccess(null);
    setTotalFarePairs(0);
    setFilledFarePairs(0);
  };

  // Helper function to get station display name
  const getStationName = (station) => {
    if (typeof station === 'string') return station;
    if (!station) return 'Unknown';
    
    return station.station_name || 
           station.name || 
           station.station?.name || 
           station.station?.station_name ||
           'Unknown Station';
  };

  // Helper function to get station ID (route_station ID)
  const getStationId = (station) => {
    if (!station) return 0;
    return station.id || station.station_id || 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Station-to-Station Fare Configuration</h2>
            <p className="text-sm text-gray-600 mt-1">
              Set fares between each station pair for selected train
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Messages */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm flex-1">
                {typeof error === 'string' ? error : extractErrorMessage(error)}
              </p>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">✕</button>
            </div>
          )}
          
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-green-700 text-sm flex-1">{success}</p>
              <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">✕</button>
            </div>
          )}

          {/* Train Selection */}
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <Train className="w-4 h-4" />
              Select Train for Fare Configuration
            </h3>
            {trainsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader className="w-5 h-5 text-indigo-600 animate-spin mr-2" />
                <span className="text-sm text-indigo-700">Loading trains...</span>
              </div>
            ) : trains.length > 0 ? (
              <>
                <select
                  value={selectedTrainId || ''}
                  onChange={handleTrainChange}
                  className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {trains.map(train => (
                    <option key={train.id} value={train.id}>
                      {train.train_no} - {train.train_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-indigo-600 mt-2">
                  💡 Fare rules are train-specific. Select a train to configure its fares.
                </p>
              </>
            ) : (
              <div className="text-center py-4">
                <Info className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-indigo-700 font-medium">
                  No trains assigned to this route
                </p>
                <p className="text-xs text-indigo-600 mt-1">
                  Please add trains to this route first before configuring fares.
                </p>
              </div>
            )}
          </div>

          {/* Loading state */}
          {loading && selectedTrainId && (
            <div className="text-center py-12">
              <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading station data...</p>
            </div>
          )}

          {/* Fare Matrix */}
          {!loading && selectedTrainId && stations.length >= 2 && (
            <>
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                  <div className="text-2xl font-bold text-blue-700">{stations.length}</div>
                  <div className="text-xs text-blue-600">Stations</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                  <div className="text-2xl font-bold text-purple-700">{totalFarePairs}</div>
                  <div className="text-xs text-purple-600">Total Pairs</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{filledFarePairs}</div>
                  <div className="text-xs text-green-600">Configured</div>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-gray-900">Fare Matrix</h3>
                <Button
                  type="button"
                  onClick={handleGenerateFees}
                  disabled={saving}
                  className="bg-purple-100 text-purple-700 hover:bg-purple-200 text-sm"
                >
                  {saving ? (
                    <Loader className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <RotateCcw className="w-3 h-3 mr-1" />
                  )}
                  Auto-Generate
                </Button>
              </div>

              {/* Fare Matrix Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
                  <table className="w-full border-collapse" style={{ minWidth: `${stations.length * 160 + 180}px` }}>
                    <thead className="sticky top-0 z-20">
                      <tr>
                        <th 
                          className="sticky left-0 z-30 bg-gray-100 text-left py-3 px-4 font-semibold text-gray-700 border-b border-r text-sm"
                          style={{ minWidth: '180px', maxWidth: '180px' }}
                        >
                          From ↓ / To →
                        </th>
                        {stations.map((station, idx) => (
                          <th 
                            key={getStationId(station) || idx} 
                            className="bg-gray-100 text-center py-3 px-3 font-semibold text-gray-700 border-b text-sm"
                            style={{ minWidth: '160px' }}
                          >
                            <div className="truncate font-bold" style={{ maxWidth: '150px' }}>
                              {getStationName(station)}
                            </div>
                            <div className="text-xs text-gray-500 font-normal mt-1">
                              {(station.distance_from_origin || 0).toLocaleString()} km
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((fromStation, i) => {
                        const fromId = getStationId(fromStation);
                        const fromName = getStationName(fromStation);
                        
                        return (
                          <tr key={fromId || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                            <td 
                              className="sticky left-0 z-10 py-3 px-4 font-bold text-gray-900 border-b border-r text-sm bg-inherit"
                              style={{ minWidth: '180px', maxWidth: '180px' }}
                            >
                              <div className="truncate" style={{ maxWidth: '160px' }}>
                                {fromName}
                              </div>
                            </td>
                            {stations.map((toStation, j) => {
                              const toId = getStationId(toStation);
                              const key = `${fromId}-${toId}`;
                              const fareData = fareMatrix[key];

                              // Diagonal - same station
                              if (i === j) {
                                return (
                                  <td 
                                    key={toId || j} 
                                    className="text-center py-3 px-3 border-b bg-gray-100/50"
                                    style={{ minWidth: '160px' }}
                                  >
                                    <span className="text-gray-300 text-lg font-bold">—</span>
                                  </td>
                                );
                              }

                              // Lower triangle - show reverse fare
                              if (i > j) {
                                const reverseKey = `${toId}-${fromId}`;
                                const reverseData = fareMatrix[reverseKey];
                                return (
                                  <td 
                                    key={toId || j} 
                                    className="text-center py-3 px-3 border-b bg-gray-50"
                                    style={{ minWidth: '160px' }}
                                  >
                                    {reverseData?.fare > 0 ? (
                                      <div className="text-xs text-gray-500">
                                        <span className="text-gray-400">← </span>
                                        {reverseData.fare.toLocaleString()} Ks
                                      </div>
                                    ) : (
                                      <span className="text-gray-300 text-sm">←</span>
                                    )}
                                  </td>
                                );
                              }

                              // Upper triangle - editable
                              const distance = Math.abs(
                                (toStation.distance_from_origin || 0) - (fromStation.distance_from_origin || 0)
                              );
                              const hasValue = fareData?.fare > 0;

                              return (
                                <td 
                                  key={toId || j} 
                                  className={`text-center py-2 px-2 border-b transition-colors ${
                                    hasValue ? 'bg-green-50 hover:bg-green-100' : 'bg-blue-50/30 hover:bg-blue-50'
                                  }`}
                                  style={{ minWidth: '160px' }}
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        value={fareData?.fare || ''}
                                        onChange={(e) => handleFareChange(fromId, toId, e.target.value)}
                                        placeholder={hasValue ? '' : 'Enter fare'}
                                        min="0"
                                        step="50"
                                        className={`w-28 px-2 py-2 border-2 rounded-lg text-sm text-center font-medium
                                          focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all
                                          ${hasValue 
                                            ? 'border-green-400 focus:ring-green-500 text-green-700 bg-white' 
                                            : 'border-gray-300 focus:ring-blue-500 text-gray-700 bg-white hover:border-blue-400'
                                          }`}
                                        />
                                        {hasValue && (
                                          <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                                        )}
                                      </div>
                                      <span className="text-xs text-gray-500 font-medium">{distance} km</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-green-50 border-2 border-green-400 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    </div>
                    <span>Fare configured</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-blue-50 border-2 border-gray-300 rounded"></div>
                    <span>Enter fare (editable)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gray-100 border-2 border-gray-200 rounded flex items-center justify-center">
                      <span className="text-gray-400 text-xs">—</span>
                    </div>
                    <span>Same station</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gray-50 border-2 border-gray-200 rounded flex items-center justify-center">
                      <span className="text-gray-400 text-xs">←</span>
                    </div>
                    <span>Reverse direction</span>
                  </div>
                  <span className="ml-auto text-indigo-600">💡 Use Auto-Generate or manually enter fares</span>
                </div>
              </>
            )}

            {/* No stations message */}
            {!loading && selectedTrainId && stations.length < 2 && (
              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Need at least 2 stations to configure fares</p>
                <p className="text-sm text-gray-500 mt-1">
                  Please add stations to this route first. Go to Edit Route to add stations.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            {selectedTrainId && stations.length >= 2 && (
              <div className="flex gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white pb-2">
                <Button
                  type="button"
                  onClick={handleSaveConfiguration}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                >
                  {saving ? (
                    <Loader className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save All Fares ({filledFarePairs}/{totalFarePairs})
                </Button>
                <Button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

export default FeeConfigurationModal;