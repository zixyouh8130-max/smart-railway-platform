// pages/TrainRider/ScheduleTab.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Train, Navigation, ChevronRight, CheckCircle, Circle } from 'lucide-react';
import Card from '@/components/ui/Card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import api from '@/api/axios';

const ScheduleTab = () => {
  const [routeStops, setRouteStops] = useState([]);
  const [currentStationIndex, setCurrentStationIndex] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScheduleData();
  }, []);

  const fetchScheduleData = async () => {
    try {
      // Get current assignment
      const userRes = await api.get('/auth/me');
      if (userRes.data.staff) {
        const staffId = userRes.data.staff.staff_id;
        const assignmentRes = await api.get(`/staff/assignments/current/${staffId}`);
        
        if (assignmentRes.data) {
          // Get route stops
          const dashboardRes = await api.get(`/dashboard/train/${assignmentRes.data.train_id}`);
          setRouteStops(dashboardRes.data.route_progress || []);
          
          // Find current station
          const currentIdx = dashboardRes.data.route_progress?.findIndex(
            stop => stop.status === 'ARRIVED'
          );
          setCurrentStationIndex(currentIdx >= 0 ? currentIdx : null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    return timeStr;
  };

  return (
    <div className="space-y-4 pb-20">
      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
        <Clock className="w-5 h-5 text-railway-red-500" />
        ခရီးစဉ် အချိန်ဇယား
      </h2>

      {routeStops.map((stop, idx) => {
        const isCompleted = stop.status === 'DEPARTED';
        const isCurrent = stop.status === 'ARRIVED';
        const isUpcoming = !isCompleted && !isCurrent;

        return (
          <div key={idx} className="flex items-start gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              {isCompleted ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : isCurrent ? (
                <div className="w-6 h-6 rounded-full bg-railway-red-500 border-2 border-railway-red-300 animate-pulse flex items-center justify-center">
                  <Train className="w-3 h-3 text-white" />
                </div>
              ) : (
                <Circle className="w-6 h-6 text-gray-300" />
              )}
              {idx < routeStops.length - 1 && (
                <div className={`w-0.5 h-10 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>

            {/* Station Info */}
            <Card padding="p-3" className={`flex-1 mb-2 ${
              isCurrent ? 'border-railway-red-300 bg-railway-red-50' : ''
            }`} hover={false}>
              <div className="flex justify-between items-start">
                <div>
                  <p className={`font-semibold ${isCurrent ? 'text-railway-red-700' : 'text-gray-800'}`}>
                    {stop.station_name}
                    {stop.station_code && (
                      <span className="text-xs text-gray-400 ml-2">({stop.station_code})</span>
                    )}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>🕐 Arr: {formatTime(stop.expected_arrival)}</span>
                    {stop.expected_departure && (
                      <span>🚂 Dep: {formatTime(stop.expected_departure)}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isCompleted ? 'bg-green-100 text-green-700' :
                  isCurrent ? 'bg-railway-red-100 text-railway-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {isCompleted ? 'ထွက်ခွာပြီး' : isCurrent ? 'ရောက်ရှိ' : 'လာမည်'}
                </span>
              </div>
              
              {stop.delay_minutes > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ {stop.delay_minutes} မိနစ် နှောင့်နှေး
                </p>
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
};

export default ScheduleTab;