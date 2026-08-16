// components/LiveUpdates.jsx
import React, { useState, useEffect } from 'react';
import { Train, Clock, MapPin, AlertTriangle, ChevronRight, RefreshCw, Navigation } from 'lucide-react';
import Card from '@/components/ui/card';
import adminDashboardApi from '@/api/adminDashboard';

const LiveUpdates = () => {
  const [activeTrains, setActiveTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchActiveTrains();
  }, []);

  const fetchActiveTrains = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminDashboardApi.getActiveTrains();
      setActiveTrains(response.trains || []);
    } catch (err) {
      console.error('Failed to fetch active trains:', err);
      setError('Failed to load train updates');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '--:--';
    try {
      const parts = timeString.split(':');
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch {
      return timeString;
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'ACTIVE':
        return { label: 'On Time', color: 'bg-green-100 text-green-700' };
      case 'DELAYED':
        return { label: 'Delayed', color: 'bg-red-100 text-red-700' };
      case 'COMPLETED':
        return { label: 'Completed', color: 'bg-blue-100 text-blue-700' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-600' };
    }
  };

  if (loading) {
    return (
      <section className="py-20 bg-white w-full">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <RefreshCw className="w-10 h-10 text-railway-red-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Loading live train updates...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-20 bg-white w-full">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-gray-500">{error}</p>
            <button
              onClick={fetchActiveTrains}
              className="mt-4 text-railway-red-500 hover:text-railway-red-600 font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-white w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Live Train Updates</h2>
            <p className="text-xl text-gray-600">
              {activeTrains.length > 0
                ? `${activeTrains.length} trains currently running`
                : 'No active trains at the moment'}
            </p>
          </div>
          <button
            onClick={fetchActiveTrains}
            className="hidden md:flex items-center text-railway-red-500 hover:text-railway-red-600 font-medium"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>

        {activeTrains.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {activeTrains.slice(0, 6).map((train) => {
              const statusInfo = getStatusInfo(train.status);
              const device = train.device;

              return (
                <Card key={train.train_id}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-railway-red-50 rounded-lg">
                        <Train className="w-6 h-6 text-railway-red-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{train.train_name}</h3>
                        <p className="text-sm text-gray-500">Train #{train.train_no}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Current Station Info */}
                    {train.current_station && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                        <span>Current: {train.current_station}</span>
                      </div>
                    )}

                    {/* Next Station Info */}
                    {train.next_station && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Navigation className="w-4 h-4 text-gray-400 mr-2" />
                        <span>Next: {train.next_station}</span>
                      </div>
                    )}

                    {/* Departure Time */}
                    {train.departure_time && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <span>Departure: {formatTime(train.departure_time)}</span>
                      </div>
                    )}

                    {/* Progress */}
                    {train.progress_percent !== undefined && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{Math.round(train.progress_percent)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full"
                            style={{ width: `${train.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Speed Info */}
                    {device?.speed !== null && device?.speed !== undefined && (
                      <div className="flex items-center text-sm text-gray-600">
                        <span>⚡ Speed: {device.speed || 0} km/h</span>
                      </div>
                    )}
                  </div>

                  {/* Track Live Location Button */}
                  <a
                    href={`/admin/train-monitoring?train=${train.train_id}`}
                    className="mt-4 w-full py-2 text-sm font-medium text-railway-red-500 hover:bg-railway-red-50 rounded-lg transition-colors text-center block"
                  >
                    Track Live Location
                  </a>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Train className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-600">No Active Trains</h3>
            <p className="text-gray-400">There are no trains currently running.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default LiveUpdates;