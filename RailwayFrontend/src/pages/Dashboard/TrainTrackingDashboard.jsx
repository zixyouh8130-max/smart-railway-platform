// pages/Dashboard/TrainTrackingDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Train, MapPin, Clock, Users, Battery, AlertTriangle, Navigation } from 'lucide-react';
import api from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TrainTrackingDashboard = () => {
  const [activeTrains, setActiveTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrain, setSelectedTrain] = useState(null);

  useEffect(() => {
    fetchActiveTrains();
    const interval = setInterval(fetchActiveTrains, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchActiveTrains = async () => {
    try {
      const response = await api.get('/dashboard/active-trains');
      setActiveTrains(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch train data');
      setLoading(false);
    }
  };

  const fetchTrainDetails = async (trainId) => {
    try {
      const response = await api.get(`/dashboard/train/${trainId}`);
      setSelectedTrain(response.data);
    } catch (err) {
      console.error('Failed to fetch train details:', err);
    }
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      'ACTIVE': 'bg-green-100 text-green-700',
      'DELAYED': 'bg-yellow-100 text-yellow-700',
      'STOPPED': 'bg-red-100 text-red-700',
      'ARRIVED': 'bg-blue-100 text-blue-700',
    };
    return statusStyles[status] || 'bg-gray-100 text-gray-700';
  };

  const getDelayBadge = (minutes) => {
    if (minutes === 0) return null;
    if (minutes <= 5) return <Badge className="bg-yellow-100 text-yellow-700">+{minutes} min</Badge>;
    return <Badge className="bg-red-100 text-red-700">+{minutes} min</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Train className="w-8 h-8 text-primary" />
          Train Tracking Dashboard
        </h1>
        <p className="text-gray-500 mt-2">Real-time monitoring of all active trains</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Trains</p>
                <p className="text-2xl font-bold">{activeTrains.length}</p>
              </div>
              <Train className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">On Time</p>
                <p className="text-2xl font-bold text-green-600">
                  {activeTrains.filter(t => t.delay_minutes === 0).length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Delayed</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {activeTrains.filter(t => t.delay_minutes > 0).length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Staff On Duty</p>
                <p className="text-2xl font-bold text-blue-600">
                  {activeTrains.reduce((acc, train) => acc + (train.staff?.length || 0), 0)}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Train List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Active Trains</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeTrains.map((train) => (
                  <div
                    key={train.train_id}
                    className="border rounded-lg p-4 hover:border-primary cursor-pointer transition-colors"
                    onClick={() => fetchTrainDetails(train.train_id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <Train className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{train.train_name}</h3>
                          <p className="text-sm text-gray-500">{train.train_no}</p>
                        </div>
                      </div>
                      <Badge className={getStatusBadge(train.status)}>
                        {train.status}
                      </Badge>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-sm text-gray-500 mb-1">
                        <span>Route Progress</span>
                        <span>{train.progress.percentage}%</span>
                      </div>
                      <Progress value={train.progress.percentage} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Current Station
                        </p>
                        <p className="font-medium text-gray-900">{train.current_station || 'In Transit'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Navigation className="w-3 h-3" /> Next Station
                        </p>
                        <p className="font-medium text-gray-900">{train.next_station || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Speed
                        </p>
                        <p className="font-medium text-gray-900">
                          {train.current_location.speed || 0} km/h
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getDelayBadge(train.delay_minutes)}
                        <div className="flex items-center gap-1">
                          <Battery className={`w-4 h-4 ${train.battery > 20 ? 'text-green-500' : 'text-red-500'}`} />
                          <span className="text-sm">{train.battery}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Staff Info */}
                    {train.staff && train.staff.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-500 mb-2">Staff On Board</p>
                        <div className="flex flex-wrap gap-2">
                          {train.staff.map((staff, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {staff.role}: {staff.staff_name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Train Details Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Train Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedTrain ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedTrain.train.name}</h3>
                    <p className="text-sm text-gray-500">{selectedTrain.train.train_no}</p>
                  </div>

                  {/* Schedule Info */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500 mb-2">Schedule</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Departure Date:</span>
                        <span className="font-medium">
                          {new Date(selectedTrain.schedule.departure_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Status:</span>
                        <Badge>{selectedTrain.schedule.status}</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Route Stops */}
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Route Stops</p>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {selectedTrain.route_progress.map((stop, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${
                            stop.status === 'ARRIVED' || stop.status === 'DEPARTED'
                              ? 'bg-green-50 border-green-200'
                              : stop.status === 'CURRENT'
                              ? 'bg-primary/5 border-primary/20'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{stop.station_name}</span>
                            {stop.delay_minutes > 0 && getDelayBadge(stop.delay_minutes)}
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>
                              {stop.actual_arrival
                                ? `Arr: ${new Date(stop.actual_arrival).toLocaleTimeString()}`
                                : `Exp: ${stop.expected_arrival}`}
                            </span>
                            {stop.stop_duration && (
                              <span>{stop.stop_duration} min stop</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Train className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select a train to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TrainTrackingDashboard;