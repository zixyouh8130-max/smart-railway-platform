// pages/TrainRider/ScheduleTab.jsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Calendar, Clock, Train, MapPin, CheckCircle,
  ChevronDown, ChevronUp, AlertCircle, Navigation, RefreshCw
} from 'lucide-react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import api from '@/api/axios';
import schedulesApi from '@/api/schedules';

const ScheduleTab = () => {
  const { user, staffInfo } = useOutletContext();
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSchedule, setExpandedSchedule] = useState(null);
  const [selectedScheduleStops, setSelectedScheduleStops] = useState({});
  const [loadingStops, setLoadingStops] = useState({});

  useEffect(() => {
    fetchWeekSchedules();
  }, [staffInfo]);

  const fetchWeekSchedules = async () => {
    if (!staffInfo?.staff_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log(`📅 Fetching weekly schedules for staff: ${staffInfo.staff_id}`);

      const response = await schedulesApi.getStaffWeeklySchedules(staffInfo.staff_id);

      console.log('📦 Full response:', response);

      if (response && response.schedules) {
        const schedules = response.schedules || [];

        // Sort by date (most recent first)
        schedules.sort((a, b) => new Date(b.departure_date) - new Date(a.departure_date));

        setWeekSchedules(schedules);
        console.log(`✅ Found ${schedules.length} schedules this week`);

        // Debug: Log train names
        schedules.forEach((s, i) => {
          console.log(`  Schedule ${i+1}: ${s.train_name} (ID: ${s.train_id})`);
        });
      } else {
        setWeekSchedules([]);
      }
    } catch (err) {
      console.error('❌ Failed to fetch week schedules:', err);

      // Fallback: Try fetching all schedules
      try {
        const allResponse = await schedulesApi.getAll();
        const schedules = (allResponse.schedules || []).filter(s => {
          const scheduleDate = new Date(s.departure_date);
          const today = new Date();
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          const endOfWeek = new Date(today);
          endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
          return scheduleDate >= startOfWeek && scheduleDate <= endOfWeek;
        });

        setWeekSchedules(schedules);
        console.log(`✅ Fallback: Found ${schedules.length} schedules`);
      } catch (fallbackErr) {
        setWeekSchedules([]);
      }
    } finally {
      setLoading(false);
    }
  };
  const formatDateStr = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchScheduleStops = async (scheduleId) => {
    if (selectedScheduleStops[scheduleId]) return; // Already loaded

    setLoadingStops(prev => ({ ...prev, [scheduleId]: true }));
    try {
      const response = await schedulesApi.getRouteStops(scheduleId);

      const mappedStops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
        train_stop_id: stop.train_stop_id || null,
      }));

      setSelectedScheduleStops(prev => ({
        ...prev,
        [scheduleId]: mappedStops
      }));

      console.log(`✅ Loaded ${mappedStops.length} stops for schedule ${scheduleId}`);
    } catch (err) {
      console.error(`Failed to fetch stops for schedule ${scheduleId}:`, err);
    } finally {
      setLoadingStops(prev => ({ ...prev, [scheduleId]: false }));
    }
  };

  const handleScheduleClick = async (scheduleId) => {
    if (expandedSchedule === scheduleId) {
      setExpandedSchedule(null);
    } else {
      setExpandedSchedule(scheduleId);
      fetchScheduleStops(scheduleId);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const formatActualTime = (timeString) => {
    if (!timeString) return null;
    try {
      let date;
      if (timeString.endsWith('Z') || timeString.includes('+')) {
        date = new Date(timeString);
      } else {
        date = new Date(timeString + 'Z');
      }
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Yangon'
      });
    } catch {
      return timeString;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ARRIVED': return <MapPin className="w-4 h-4 text-green-500" />;
      case 'DEPARTED': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'SCHEDULED': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'DELAYED': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ARRIVED': return 'bg-green-50 border-green-200';
      case 'DEPARTED': return 'bg-blue-50 border-blue-200';
      case 'DELAYED': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
          <p className="text-gray-500">Loading schedules...</p>
        </div>
      </div>
    );
  }

  if (weekSchedules.length === 0) {
    return (
      <Card padding="p-8" className="text-center">
        <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-600">No Schedules This Week</h3>
        <p className="text-gray-400">You haven't completed any schedules this week.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Week Summary */}
      <Card padding="p-3" className="bg-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-800">This Week's Schedules</span>
          </div>
          <span className="text-sm text-blue-600 font-bold">{weekSchedules.length}</span>
        </div>
      </Card>

      {/* Schedule List */}
      {weekSchedules.map((schedule) => (
        <Card key={schedule.id} padding="p-0" className="overflow-hidden">

          {/* Schedule Header */}
          <div
            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => handleScheduleClick(schedule.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Train className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 truncate">
                      {/* ✅ Try multiple fields for train name */}
                      {schedule.train_name || schedule.train?.train_name || 'Unknown Train'}
                    </h3>
                    {/* ✅ Try multiple fields for train number */}
                    {(schedule.train_no || schedule.train?.train_no) && (
                      <span className="text-xs text-gray-400 shrink-0">
                        {schedule.train_no || schedule.train?.train_no}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(schedule.departure_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">
                    {formatTime(schedule.departure_time)}
                  </p>
                  <p className="text-xs text-gray-400">
                    to {formatTime(schedule.arrival_time)}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  schedule.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-700'
                    : schedule.status === 'ACTIVE'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  {schedule.status}
                </span>
                <span className="text-gray-400">
                  {expandedSchedule === schedule.id ?
                    <ChevronUp className="w-4 h-4" /> :
                    <ChevronDown className="w-4 h-4" />
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Expanded Station List */}
          {expandedSchedule === schedule.id && (
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              {loadingStops[schedule.id] ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : selectedScheduleStops[schedule.id]?.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">
                    Route Stations ({selectedScheduleStops[schedule.id].length})
                  </h4>

                  {selectedScheduleStops[schedule.id].map((stop, index) => (
                    <div
                      key={stop.route_station_id || index}
                      className={`p-3 rounded-lg border ${getStatusColor(stop.status)} transition-all`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-gray-300">
                            {getStatusIcon(stop.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{stop.station_name}</p>
                              {index === 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Start</span>
                              )}
                              {index === selectedScheduleStops[schedule.id].length - 1 && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">End</span>
                              )}
                            </div>

                            {/* Timing Info */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                              {stop.expected_arrival && (
                                <span>🕐 ETA: {stop.expected_arrival}</span>
                              )}
                              {stop.expected_departure && (
                                <span>🚂 ETD: {stop.expected_departure}</span>
                              )}
                              {stop.actual_arrival && (
                                <span className="text-green-600">
                                  ✅ Arr: {formatActualTime(stop.actual_arrival)}
                                </span>
                              )}
                              {stop.actual_departure && (
                                <span className="text-blue-600">
                                  🚂 Dep: {formatActualTime(stop.actual_departure)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            stop.status === 'DEPARTED' ? 'bg-green-100 text-green-700' :
                            stop.status === 'ARRIVED' ? 'bg-blue-100 text-blue-700' :
                            stop.status === 'DELAYED' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {stop.status}
                          </span>
                          {stop.delay_minutes > 0 && (
                            <span className="text-xs text-red-500 font-medium">
                              +{stop.delay_minutes}m
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stop Duration */}
                      {/* {stop.stop_duration_minutes !== null && stop.stop_duration_minutes !== undefined && (
                        <div className="mt-1 ml-11 text-xs text-gray-400">
                          Stop duration: {stop.stop_duration_minutes} minutes
                        </div>
                      )} */}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No station data available for this schedule.
                </p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default ScheduleTab;