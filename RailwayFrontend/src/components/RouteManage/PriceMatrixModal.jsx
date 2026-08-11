import React, { useState, useEffect } from 'react';
import { X, Loader, AlertCircle, Calculator, Train } from 'lucide-react';
import feesApi from '@/api/fees';
import trainsApi from '@/api/trains';

const PriceMatrixModal = ({ isOpen, onClose, routeId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priceMatrix, setPriceMatrix] = useState(null);
  const [selectedClassCode, setSelectedClassCode] = useState('ORDINARY');
  const [selectedTrainId, setSelectedTrainId] = useState(null);
  const [trains, setTrains] = useState([]);
  const [trainClasses, setTrainClasses] = useState([
    { code: 'ORDINARY', name: 'Ordinary', multiplier: 1.0 },
    { code: 'UPPER', name: 'Upper Class', multiplier: 1.5 },
    { code: 'SLEEPER', name: 'Sleeper', multiplier: 2.0 }
  ]);

  useEffect(() => {
    if (isOpen && routeId) {
      fetchTrains();
      fetchTrainClasses();
    }
  }, [isOpen, routeId]);

  useEffect(() => {
    if (selectedTrainId) {
      fetchPriceMatrix();
    }
  }, [selectedTrainId, selectedClassCode]);

  const fetchTrains = async () => {
    try {
      const response = await trainsApi.getByRoute(routeId);
      const trainsList = response.trains || response.data?.trains || [];
      setTrains(trainsList);
      
      // Auto-select first train if available
      if (trainsList.length > 0 && !selectedTrainId) {
        setSelectedTrainId(trainsList[0].id);
      }
    } catch (err) {
      console.error('Error fetching trains:', err);
    }
  };

  const fetchPriceMatrix = async () => {
    if (!selectedTrainId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await feesApi.getPriceMatrix(selectedTrainId, selectedClassCode);
      setPriceMatrix(response);
    } catch (err) {
      setError(err.detail || 'Failed to fetch price matrix');
      console.error('Error fetching price matrix:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrainClasses = async () => {
    try {
      const response = await feesApi.getTrainClasses();
      let classes = [];
      if (response.classes) {
        classes = response.classes;
      } else if (response.data?.classes) {
        classes = response.data.classes;
      } else if (Array.isArray(response)) {
        classes = response;
      } else if (response.data && Array.isArray(response.data)) {
        classes = response.data;
      }
      if (classes.length > 0) {
        setTrainClasses(classes);
      }
    } catch (err) {
      console.error('Failed to fetch train classes:', err);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return Number(amount).toLocaleString() + ' MMK';
  };

  const selectedTrain = trains.find(t => t.id === selectedTrainId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Price Matrix</h2>
            <p className="text-sm text-gray-600 mt-1">
              {priceMatrix?.route_name || `Route #${routeId}`} - Fare overview
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Train Selection */}
            {trains.length > 0 && (
              <select
                value={selectedTrainId || ''}
                onChange={(e) => setSelectedTrainId(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {trains.map(train => (
                  <option key={train.id} value={train.id}>
                    {train.train_no} - {train.train_name}
                  </option>
                ))}
              </select>
            )}
            
            {/* Class Selection */}
            <select
              value={selectedClassCode}
              onChange={(e) => setSelectedClassCode(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {trainClasses.map(tc => (
                <option key={tc.code} value={tc.code}>
                  {tc.name} (x{tc.multiplier})
                </option>
              ))}
            </select>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 mb-6">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-600">✕</button>
            </div>
          )}

          {/* No Trains Message */}
          {!loading && trains.length === 0 && (
            <div className="text-center py-12">
              <Train className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Trains Available</h3>
              <p className="text-gray-600">
                Add trains to this route first to view the price matrix.
                Fare rules are configured per train.
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading price matrix...</p>
              </div>
            </div>
          )}

          {/* Price Matrix Display */}
          {!loading && priceMatrix && priceMatrix.stations ? (
            <>
              {/* Train Info */}
              {selectedTrain && (
                <div className="mb-4 p-3 bg-indigo-50 rounded-lg flex items-center gap-2">
                  <Train className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm text-indigo-700">
                    Showing fares for: <strong>{selectedTrain.train_no}</strong> - {selectedTrain.train_name}
                  </span>
                </div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                  <span>Available Fare</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
                  <span>Same Station</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="text-gray-400">←</span>
                  <span>Reverse Direction</span>
                </div>
              </div>

              {/* Price Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-gray-100 text-left py-3 px-4 text-sm font-medium text-gray-600 rounded-tl-lg border-b z-10">
                        From ↓ / To →
                      </th>
                      {priceMatrix.stations.map((station, idx) => (
                        <th key={station.id || idx} className="bg-gray-100 text-center py-3 px-3 text-sm font-medium text-gray-600 border-b min-w-[100px]">
                          <div className="truncate max-w-[120px]" title={station.name}>
                            {station.name}
                          </div>
                          {station.code && (
                            <div className="text-xs text-gray-400 font-normal font-mono">
                              {station.code}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceMatrix.stations.map((fromStation, i) => (
                      <tr key={fromStation.id || i}>
                        <td className="sticky left-0 bg-white py-3 px-4 text-sm font-medium text-gray-900 border-b z-10">
                          <div className="truncate max-w-[120px]" title={fromStation.name}>
                            {fromStation.name}
                          </div>
                          {fromStation.code && (
                            <div className="text-xs text-gray-400 font-mono">
                              {fromStation.code}
                            </div>
                          )}
                        </td>
                        {priceMatrix.stations.map((toStation, j) => {
                          // Find price for this pair
                          const price = priceMatrix.prices?.find(
                            p => (p.from === fromStation.name || p.from_id === fromStation.id) && 
                                 (p.to === toStation.name || p.to_id === toStation.id)
                          );

                          // Only show forward direction prices
                          if (i >= j) {
                            return (
                              <td key={toStation.id || j} className="text-center py-3 px-3 border-b bg-gray-50">
                                {i === j ? (
                                  <span className="text-sm text-gray-400">-</span>
                                ) : (
                                  <span className="text-sm text-gray-300">←</span>
                                )}
                              </td>
                            );
                          }

                          return (
                            <td key={toStation.id || j} className="text-center py-3 px-3 border-b bg-green-50/30">
                              {price ? (
                                <div>
                                  <div className="text-sm font-semibold text-green-700">
                                    {formatCurrency(price.fare)}
                                  </div>
                                  {price.distance && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {price.distance} km
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">N/A</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Statistics */}
              {priceMatrix.prices && priceMatrix.prices.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Fare Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total Pairs:</span>
                      <span className="font-medium ml-2">{priceMatrix.prices.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Minimum Fare:</span>
                      <span className="font-medium ml-2 text-green-600">
                        {formatCurrency(Math.min(...priceMatrix.prices.map(p => p.fare || 0)))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Maximum Fare:</span>
                      <span className="font-medium ml-2 text-blue-600">
                        {formatCurrency(Math.max(...priceMatrix.prices.map(p => p.fare || 0)))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Average Fare:</span>
                      <span className="font-medium ml-2 text-purple-600">
                        {formatCurrency(
                          Math.round(
                            priceMatrix.prices.reduce((sum, p) => sum + (p.fare || 0), 0) /
                            (priceMatrix.prices.length || 1)
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : !loading && trains.length > 0 ? (
            <div className="text-center py-12">
              <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Price Data Available</h3>
              <p className="text-gray-600">
                Generate fee rules first to see the price matrix for this train.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceMatrixModal;