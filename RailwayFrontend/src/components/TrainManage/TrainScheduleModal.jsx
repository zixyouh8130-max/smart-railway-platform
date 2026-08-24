// src/components/TrainManage/TrainScheduleModal.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader, AlertCircle, Clock, Save, MapPin, Calculator, Gauge } from 'lucide-react';
import Button from '@/components/ui/button';
import ScrollableTimePicker from '@/components/ui/ScrollableTimePicker';
import trainsApi from '@/api/trains';
import routesApi from '@/api/routes';

const TrainScheduleModal = ({ train, onClose, onSave }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Route stations and train stops
  const [routeStations, setRouteStations] = useState([]);
  const [trainStops, setTrainStops] = useState([]);
  
  // 🆕 Train speed for calculations
  const [trainSpeed, setTrainSpeed] = useState(50); // Default 50 mph

  useEffect(() => {
    if (train) {
      fetchRouteAndStops();
      // Set train speed if available
      if (train.speed) {
        setTrainSpeed(train.speed);
      }
    }
  }, [train]);

  const fetchRouteAndStops = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch route with stations
      const routeResponse = await routesApi.getById(train.route_id);
      const routeData = routeResponse.data || routeResponse;
      
      // Sort stations by order
      const stations = (routeData.stations || []).sort(
        (a, b) => (a.order_number || 0) - (b.order_number || 0)
      );
      setRouteStations(stations);
      
      // Fetch existing train stops
      try {
        const stopsResponse = await trainsApi.getTrainStops(train.id);
        const stopsData = stopsResponse.stops || stopsResponse.data?.stops || [];
        
        const stopsMap = {};
        stopsData.forEach(stop => {
          stopsMap[stop.route_station_id] = stop;
        });
        
        const initializedStops = stations.map((station, index) => {
          const existingStop = stopsMap[station.id];
          const isFirst = index === 0;
          const isLast = index === stations.length - 1;
          
          return {
            id: existingStop?.id || null,
            train_id: train.id,
            route_station_id: station.id,
            station_name: station.station_name,
            station_code: station.station_code,
            order_number: station.order_number,
            distance_from_origin: station.distance_from_origin || 0,
            isFirst,
            isLast,
            
            expected_arrival_time: existingStop?.expected_arrival_time || '',
            expected_departure_time: existingStop?.expected_departure_time || '',
            arrival_buffer_minutes: existingStop?.arrival_buffer_minutes || 0,
            departure_buffer_minutes: existingStop?.departure_buffer_minutes || 0,
            stop_duration_minutes: existingStop?.stop_duration_minutes || (isFirst || isLast ? 0 : 2),
            is_timed_stop: existingStop?.is_timed_stop !== undefined ? existingStop.is_timed_stop : true,
            status: existingStop?.status || 'SCHEDULED',
          };
        });
        
        setTrainStops(initializedStops);
      } catch (err) {
        const initializedStops = stations.map((station, index) => {
          const isFirst = index === 0;
          const isLast = index === stations.length - 1;
          
          return {
            id: null,
            train_id: train.id,
            route_station_id: station.id,
            station_name: station.station_name,
            station_code: station.station_code,
            order_number: station.order_number,
            distance_from_origin: station.distance_from_origin || 0,
            isFirst,
            isLast,
            expected_arrival_time: '',
            expected_departure_time: '',
            arrival_buffer_minutes: 0,
            departure_buffer_minutes: 0,
            stop_duration_minutes: isFirst || isLast ? 0 : 2,
            is_timed_stop: true,
            status: 'SCHEDULED',
          };
        });
        setTrainStops(initializedStops);
      }
    } catch (err) {
      setError('Failed to fetch route data');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 🆕 Calculate travel time between two distances (in minutes)
  const calculateTravelTime = (fromDistance, toDistance, speed) => {
    if (!speed || speed <= 0) return 0;
    const distance = Math.abs(toDistance - fromDistance);
    return Math.round((distance / speed) * 60); // Convert hours to minutes
  };

  // 🆕 Add minutes to a time string (HH:MM)
  const addMinutesToTime = (timeStr, minutes) => {
    if (!timeStr || minutes <= 0) return timeStr;
    
    const [hours, mins] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
  };

  // 🆕 Auto-calculate all times based on first station departure time
  const handleAutoCalculate = () => {
    if (trainStops.length === 0) return;
    if (!trainSpeed || trainSpeed <= 0) {
      setError('Please set a valid train speed first');
      return;
    }

    const firstStop = trainStops[0];
    if (!firstStop.expected_departure_time) {
      setError('Please set the departure time for the origin station first');
      return;
    }

    const updatedStops = [...trainStops];
    let currentTime = firstStop.expected_departure_time;

    for (let i = 1; i < updatedStops.length; i++) {
      const prevStop = updatedStops[i - 1];
      const currentStop = updatedStops[i];
      
      // Calculate travel time from previous station
      const travelTime = calculateTravelTime(
        prevStop.distance_from_origin,
        currentStop.distance_from_origin,
        trainSpeed
      );
      
      // Add previous station's departure buffer
      const depBuffer = prevStop.departure_buffer_minutes || 0;
      
      // Calculate arrival time at current station
      const totalTravelTime = travelTime + depBuffer;
      const arrivalTime = addMinutesToTime(currentTime, totalTravelTime);
      
      // Set arrival time
      currentStop.expected_arrival_time = arrivalTime;
      
      // Add arrival buffer
      const arrBuffer = currentStop.arrival_buffer_minutes || 0;
      
      // Calculate departure time (arrival + arrival buffer + stop duration)
      if (!currentStop.isLast) {
        const stopDuration = currentStop.stop_duration_minutes || 0;
        const totalStopTime = arrBuffer + stopDuration;
        const departureTime = addMinutesToTime(arrivalTime, totalStopTime);
        currentStop.expected_departure_time = departureTime;
        currentTime = departureTime;
      } else {
        // Last station - add arrival buffer to arrival time
        currentStop.expected_arrival_time = addMinutesToTime(arrivalTime, arrBuffer);
      }
    }

    setTrainStops(updatedStops);
    setSuccess('Schedule auto-calculated successfully!');
  };

  // 🆕 Handle departure time change for origin station - auto-calculate all subsequent times
  const handleOriginDepartureChange = (index, timeStr) => {
    handleTimeChange(index, 'expected_departure_time', timeStr);
  };

  const handleStopChange = (index, field, value) => {
    setTrainStops(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleTimeChange = (index, field, timeStr) => {
    handleStopChange(index, field, timeStr || null);
  };

  // 🆕 Handle buffer/stop duration changes with auto-recalculation
  const handleBufferOrDurationChange = (index, field, value) => {
    handleStopChange(index, field, value);
    // Clear success message when manual changes are made
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const stopsToSave = trainStops.map(stop => ({
        train_id: stop.train_id,
        route_station_id: stop.route_station_id,
        expected_arrival_time: stop.expected_arrival_time || null,
        expected_departure_time: stop.expected_departure_time || null,
        arrival_buffer_minutes: stop.arrival_buffer_minutes || 0,
        departure_buffer_minutes: stop.departure_buffer_minutes || 0,
        stop_duration_minutes: stop.stop_duration_minutes || 0,
        is_timed_stop: stop.is_timed_stop,
        status: stop.status || 'SCHEDULED',
      }));
      
      await trainsApi.bulkCreateTrainStops(train.id, stopsToSave);
      setSuccess('Schedule saved successfully!');
      
      setTimeout(() => {
        onSave();
      }, 1000);
    } catch (err) {
      setError(err.detail || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    return timeStr.substring(0, 5);
  };

  if (!train) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Train Schedule Configuration</h2>
            <p className="text-sm text-gray-600 mt-1">
              {train.train_no} - {train.train_name} ({routeStations.length} stations)
              {trainSpeed > 0 && <span className="ml-2">• Speed: {trainSpeed} mph</span>}
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
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-700 text-sm flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">✕</button>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <Save className="w-5 h-5 text-green-600" />
              <p className="text-green-700 text-sm flex-1">{success}</p>
              <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">✕</button>
            </div>
          )}

          {/* 🆕 Auto-Calculate Section */}
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Auto-Calculate Schedule
                </h3>
                <p className="text-xs text-indigo-600 mt-1">
                  Set origin departure time and click calculate. Times are computed based on distance and train speed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-indigo-500" />
                  <input
                    type="number"
                    value={trainSpeed}
                    onChange={(e) => setTrainSpeed(parseInt(e.target.value) || 0)}
                    min="1"
                    max="500"
                    className="w-20 px-2 py-1.5 border border-indigo-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-indigo-600">mph</span>
                </div>
                <Button
                  onClick={handleAutoCalculate}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
                >
                  <Calculator className="w-4 h-4 mr-1" />
                  Calculate All Times
                </Button>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Schedule Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-3 px-3 text-left font-medium text-gray-600 rounded-tl-lg w-12">#</th>
                      <th className="py-3 px-3 text-left font-medium text-gray-600">Station</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-20">Dist</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-40">Arrival</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-40">Departure</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-20">Travel</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-20">Stop</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 w-28">Buffer</th>
                      <th className="py-3 px-3 text-center font-medium text-gray-600 rounded-tr-lg w-14">Timed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainStops.map((stop, index) => {
                      // Calculate travel time from previous station
                      let travelTime = 0;
                      if (index > 0) {
                        const prevStop = trainStops[index - 1];
                        travelTime = calculateTravelTime(
                          prevStop.distance_from_origin,
                          stop.distance_from_origin,
                          trainSpeed
                        );
                      }

                      return (
                        <tr key={index} className={`border-b ${
                          stop.isFirst ? 'bg-green-50' : 
                          stop.isLast ? 'bg-red-50' : 
                          'bg-white hover:bg-gray-50'
                        }`}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500 text-xs">{index + 1}</span>
                              {stop.isFirst && (
                                <span className="text-xs bg-green-200 text-green-700 px-1.5 py-0.5 rounded font-medium">Origin</span>
                              )}
                              {stop.isLast && (
                                <span className="text-xs bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-medium">Dest</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <div>
                                <span className="font-medium text-gray-900">{stop.station_name}</span>
                                {stop.station_code && (
                                  <span className="text-xs text-gray-500 ml-1">({stop.station_code})</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600 text-xs">
                            {stop.distance_from_origin || 0}
                          </td>
                          
                          {/* Arrival Time */}
                          <td className="py-3 px-3">
                            {stop.isFirst ? (
                              <div className="flex items-center justify-center">
                                <span className="text-xs text-gray-400 italic">- Start -</span>
                              </div>
                            ) : (
                              <ScrollableTimePicker
                                value={stop.expected_arrival_time || ''}
                                onChange={(time) => handleTimeChange(index, 'expected_arrival_time', time)}
                                minuteStep={1}
                              />
                            )}
                          </td>
                          
                          {/* Departure Time */}
                          <td className="py-3 px-3">
                            {stop.isLast ? (
                              <div className="flex items-center justify-center">
                                <span className="text-xs text-gray-400 italic">- End -</span>
                              </div>
                            ) : (
                              <ScrollableTimePicker
                                value={stop.expected_departure_time || ''}
                                onChange={(time) => handleTimeChange(index, 'expected_departure_time', time)}
                                minuteStep={1}
                              />
                            )}
                          </td>
                          
                          {/* 🆕 Travel Time */}
                          <td className="py-3 px-3 text-center">
                            {index > 0 ? (
                              <div className="text-xs">
                                <span className="text-gray-700 font-medium">{travelTime}</span>
                                <span className="text-gray-400"> min</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          {/* Stop Duration */}
                          <td className="py-3 px-3 text-center">
                            {(stop.isFirst || stop.isLast) ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              <input
                                type="number"
                                value={stop.stop_duration_minutes || 0}
                                onChange={(e) => handleBufferOrDurationChange(index, 'stop_duration_minutes', parseInt(e.target.value) || 0)}
                                min="0"
                                max="60"
                                className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            )}
                          </td>
                          
                          {/* Buffer Minutes */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {!stop.isFirst ? (
                                <div>
                                  <input
                                    type="number"
                                    value={stop.arrival_buffer_minutes || 0}
                                    onChange={(e) => handleBufferOrDurationChange(index, 'arrival_buffer_minutes', parseInt(e.target.value) || 0)}
                                    min="0"
                                    max="30"
                                    className="w-12 px-1 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    title="Arrival buffer"
                                  />
                                  <div className="text-xs text-gray-400">Arr</div>
                                </div>
                              ) : <div className="w-12"></div>}
                              {!stop.isLast ? (
                                <div>
                                  <input
                                    type="number"
                                    value={stop.departure_buffer_minutes || 0}
                                    onChange={(e) => handleBufferOrDurationChange(index, 'departure_buffer_minutes', parseInt(e.target.value) || 0)}
                                    min="0"
                                    max="30"
                                    className="w-12 px-1 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    title="Departure buffer"
                                  />
                                  <div className="text-xs text-gray-400">Dep</div>
                                </div>
                              ) : <div className="w-12"></div>}
                            </div>
                          </td>
                          
                          {/* Timed Stop */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={stop.is_timed_stop}
                              onChange={(e) => handleStopChange(index, 'is_timed_stop', e.target.checked)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Schedule Timeline */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Schedule Timeline
                </h4>
                <div className="relative pt-4">
                  <div className="absolute left-0 right-0 top-10 h-1.5 bg-blue-200 rounded-full"></div>
                  
                  <div className="relative flex justify-between">
                    {trainStops.map((stop, index) => (
                      <div key={index} className="flex flex-col items-center relative" style={{ width: `${100 / trainStops.length}%` }}>
                        <div className={`w-5 h-5 rounded-full z-10 border-2 border-white shadow ${
                          stop.isFirst ? 'bg-green-500' : 
                          stop.isLast ? 'bg-red-500' : 
                          'bg-blue-500'
                        }`}></div>
                        
                        <p className="text-xs text-gray-700 mt-2 text-center font-medium truncate max-w-[90px]" title={stop.station_name}>
                          {stop.station_name}
                        </p>
                        
                        <div className="text-xs text-gray-500 mt-1 text-center space-y-0.5">
                          {!stop.isFirst && (
                            <div className={stop.expected_arrival_time ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                              Arr: {formatTime(stop.expected_arrival_time)}
                            </div>
                          )}
                          {!stop.isLast && (
                            <div className={stop.expected_departure_time ? 'text-green-600 font-medium' : 'text-gray-400'}>
                              Dep: {formatTime(stop.expected_departure_time)}
                            </div>
                          )}
                          {stop.isFirst && (
                            <div className={stop.expected_departure_time ? 'text-green-600 font-medium' : 'text-gray-400'}>
                              Dep: {formatTime(stop.expected_departure_time)}
                            </div>
                          )}
                          {stop.isLast && (
                            <div className={stop.expected_arrival_time ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                              Arr: {formatTime(stop.expected_arrival_time)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <Loader className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save Schedule
            </Button>
            <Button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 text-gray-700 ml-auto">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainScheduleModal;