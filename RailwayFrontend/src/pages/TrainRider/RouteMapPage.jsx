// pages/TrainRider/RouteMapPage.jsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MapPin, Train, Clock, Navigation } from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import api from '@/api/axios';

const RouteMapPage = () => {
  const { currentAssignment, staffInfo } = useOutletContext();
  const [routeStops, setRouteStops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentAssignment) {
      fetchRouteStops();
    }
  }, [currentAssignment]);

  const fetchRouteStops = async () => {
    try {
      const response = await api.get(`/dashboard/train/${currentAssignment.train_id}`);
      setRouteStops(response.data.route_progress || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
      setLoading(false);
    }
  };

  if (!currentAssignment) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card padding="p-8" className="text-center max-w-md">
          <Train className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Active Assignment</h3>
          <p className="text-gray-500">You don't have any active train assignment at the moment.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Route Overview */}
      <Card padding="p-6">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="w-6 h-6 text-railway-red-500" />
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Route Map</h2>
            <p className="text-sm text-gray-500">{currentAssignment.train_name} - {currentAssignment.train_no}</p>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* Route Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <Label className="text-xs text-gray-500">Total Stops</Label>
            <p className="text-2xl font-bold text-railway-red-500">{routeStops.length}</p>
          </div>
          <div className="text-center">
            <Label className="text-xs text-gray-500">Completed</Label>
            <p className="text-2xl font-bold text-green-500">
              {routeStops.filter(s => s.status === 'DEPARTED').length}
            </p>
          </div>
          <div className="text-center">
            <Label className="text-xs text-gray-500">Remaining</Label>
            <p className="text-2xl font-bold text-railway-orange-500">
              {routeStops.filter(s => s.status !== 'DEPARTED').length}
            </p>
          </div>
        </div>
      </Card>

      {/* Route Timeline */}
      <Card padding="p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-railway-orange-500" />
          Station Timeline
        </h3>
        
        <div className="space-y-0">
          {routeStops.map((stop, idx) => {
            const isCompleted = stop.status === 'DEPARTED';
            const isCurrent = stop.status === 'ARRIVED';
            const isUpcoming = !isCompleted && !isCurrent;
            
            return (
              <div key={idx} className="flex items-start">
                {/* Timeline indicator */}
                <div className="flex flex-col items-center mr-4">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    isCompleted ? 'bg-green-500 border-green-500' :
                    isCurrent ? 'bg-railway-red-500 border-railway-red-500 animate-pulse' :
                    'bg-white border-gray-300'
                  }`} />
                  {idx < routeStops.length - 1 && (
                    <div className={`w-0.5 h-12 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
                
                {/* Station info */}
                <div className={`flex-1 pb-6 -mt-1 ${
                  isCurrent ? 'bg-railway-red-50 rounded-xl p-3 -ml-3 border border-railway-red-200' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <h4 className={`font-semibold ${
                      isCurrent ? 'text-railway-red-700' : 'text-gray-800'
                    }`}>
                      {stop.station_name}
                      {stop.station_code && (
                        <span className="text-xs text-gray-500 ml-2">({stop.station_code})</span>
                      )}
                    </h4>
                    
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      isCompleted ? 'bg-green-100 text-green-700 border-green-200' :
                      isCurrent ? 'bg-railway-red-100 text-railway-red-700 border-railway-red-200' :
                      'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                      {isCompleted ? 'Departed' : isCurrent ? 'Arrived' : 'Upcoming'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-1 text-sm">
                    {stop.expected_arrival && (
                      <span className="text-gray-500">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Arr: {stop.expected_arrival}
                      </span>
                    )}
                    {stop.expected_departure && (
                      <span className="text-gray-500">
                        <Navigation className="w-3 h-3 inline mr-1" />
                        Dep: {stop.expected_departure}
                      </span>
                    )}
                  </div>
                  
                  {stop.actual_arrival && (
                    <div className="mt-1">
                      <span className="text-xs text-green-600">
                        Actual: {new Date(stop.actual_arrival).toLocaleTimeString()}
                      </span>
                      {stop.delay_minutes > 0 && (
                        <span className="text-xs text-red-500 ml-2">
                          (+{stop.delay_minutes} min delay)
                        </span>
                      )}
                    </div>
                  )}
                  
                  {stop.stop_duration && (
                    <p className="text-xs text-gray-500 mt-1">
                      Stop duration: {stop.stop_duration} minutes
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Map Placeholder */}
      <Card padding="p-6" className="text-center">
        <div className="py-8">
          <MapPin className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Interactive Map</h3>
          <p className="text-gray-500 mb-4">Real-time map tracking with GPS integration</p>
          <Button variant="outline" icon={<MapPin className="w-4 h-4" />}>
            Open Full Map
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default RouteMapPage;