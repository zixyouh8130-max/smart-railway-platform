// pages/TrainSearchResults.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Train, Clock, MapPin, ArrowRight, Search, AlertCircle, ChevronLeft } from 'lucide-react';
import Button from '@/components/ui/button';
import schedulesApi from '@/api/schedules';
import stationsApi from '@/api/stations';

const TrainSearchResults = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);

  useEffect(() => {
    fetchSearchResults();
    fetchStationDetails();
  }, [searchParams]);

  const fetchStationDetails = async () => {
    try {
      const fromId = searchParams.get('fromStationId');
      const toId = searchParams.get('toStationId');

      if (fromId) {
        const station = await stationsApi.getById(fromId);
        setFromStation(station);
      }
      if (toId) {
        const station = await stationsApi.getById(toId);
        setToStation(station);
      }
    } catch (err) {
      console.error('Failed to fetch station details:', err);
    }
  };

  const fetchSearchResults = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        from_station_id: searchParams.get('fromStationId'),
        to_station_id: searchParams.get('toStationId'),
        route_ids: searchParams.get('routeIds'),
        date_from: searchParams.get('dateFrom'),
        date_to: searchParams.get('dateTo')
      };

      console.log('Searching schedules with params:', params);
      const results = await schedulesApi.search(params);
      console.log('Search results:', results);

      setSchedules(results || []);
    } catch (err) {
      console.error('Search failed:', err);
      setError(
        err.detail ||
        err.message ||
        'ရှာဖွေမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ'
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return 'N/A';
    const date = new Date(dateTimeStr);
    return date.toLocaleString('my-MM', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateTimeStr) => {
    if (!dateTimeStr) return 'N/A';
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('my-MM', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  const formatTime = (dateTimeStr) => {
    if (!dateTimeStr) return 'N/A';
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('my-MM', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleBackToSearch = () => {
    navigate('/');
  };

  const handleBookNow = (schedule) => {
    // Navigate to booking page
    navigate(`/booking/${schedule.schedule_id}`, {
      state: {
        schedule,
        fromStation,
        toStation,
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
        adults: searchParams.get('adults'),
        children: searchParams.get('children')
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-sky-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBackToSearch}
            className="flex items-center text-white/80 hover:text-white mb-4 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            ပြန်ရှာဖွေမည်
          </button>

          <div className="flex items-center space-x-4 text-white">
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-sky-300" />
              <span className="text-lg font-medium">{fromStation?.name || '...'}</span>
            </div>
            <ArrowRight className="w-5 h-5 text-sky-300" />
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-green-400" />
              <span className="text-lg font-medium">{toStation?.name || '...'}</span>
            </div>
          </div>

          <p className="text-white/60 mt-2">
            {searchParams.get('dateFrom')} မှ {searchParams.get('dateTo')} အတွင်း
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 backdrop-blur-sm border border-red-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-center text-white">
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-300 mx-auto mb-4"></div>
            <p className="text-white/80">ရထားခရီးစဉ်များ ရှာဖွေနေသည်...</p>
          </div>
        )}

        {/* Results */}
        {!loading && !error && (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">
                ရှာဖွေတွေ့ရှိမှု ({schedules.length} ခု)
              </h2>
            </div>

            {schedules.length === 0 ? (
              <div className="text-center py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
                <Search className="w-16 h-16 mx-auto mb-4 text-white/40" />
                <h3 className="text-xl font-bold text-white mb-2">ရထားခရီးစဉ် မတွေ့ရှိပါ</h3>
                <p className="text-white/60 mb-6">
                  ဤရက်အတွင်း ရထားခရီးစဉ်များ မရှိသေးပါ
                </p>
                <Button onClick={handleBackToSearch} variant="secondary">
                  ပြန်လည်ရှာဖွေမည်
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.schedule_id}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 hover:bg-white/15 transition-all"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      {/* Train Info */}
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-sky-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Train className="w-6 h-6 text-sky-300" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">
                            {schedule.train_name || `ရထားအမှတ် ${schedule.train_id || schedule.schedule_id}`}
                          </h3>
                          <p className="text-white/60 text-sm">
                            {schedule.route_name}
                          </p>
                          {schedule.days_of_week && (
                            <p className="text-sky-300 text-sm mt-1">
                              🕐 {schedule.days_of_week}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Time Info */}
                      <div className="flex items-center space-x-6">
                        <div className="text-center">
                          <p className="text-white/60 text-sm">ထွက်ခွာချိန်</p>
                          <p className="text-white font-bold text-lg">
                            {formatTime(schedule.departure_time)}
                          </p>
                          <p className="text-white/60 text-xs">
                            {formatDate(schedule.departure_time)}
                          </p>
                        </div>

                        <ArrowRight className="w-5 h-5 text-sky-300" />

                        <div className="text-center">
                          <p className="text-white/60 text-sm">ရောက်ရှိချိန်</p>
                          <p className="text-white font-bold text-lg">
                            {formatTime(schedule.arrival_time)}
                          </p>
                          <p className="text-white/60 text-xs">
                            {formatDate(schedule.arrival_time)}
                          </p>
                        </div>
                      </div>

                      {/* Status & Booking */}
                      <div className="flex items-center space-x-4">
                        <div>
                          <span className={`px-3 py-1 rounded-full text-sm ${
                            schedule.status === 'active'
                              ? 'bg-green-500/20 text-green-300'
                              : 'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {schedule.status === 'active' ? 'ပြေးဆွဲနေသည်' : schedule.status}
                          </span>
                          {schedule.available_seats !== null && schedule.available_seats !== undefined && (
                            <p className="text-white/60 text-xs mt-1">
                              လက်မှတ် {schedule.available_seats} စောင်ကျန်
                            </p>
                          )}
                        </div>

                        <Button
                          onClick={() => handleBookNow(schedule)}
                          className="bg-sky-500 hover:bg-sky-600 text-white"
                        >
                          လက်မှတ်ဝယ်မည်
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TrainSearchResults;