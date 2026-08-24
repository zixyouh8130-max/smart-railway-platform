// pages/Dashboard/TrainTrackingDashboard.jsx
import React, { useState, useEffect } from 'react';
import { 
  Train, MapPin, Clock, Users, Battery, AlertTriangle, Navigation, 
  Activity, Calendar, ChevronRight, Gauge, Wifi, WifiOff,
  Circle, CheckCircle2, Clock as ClockIcon, AlertCircle
} from 'lucide-react';
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
  const [selectedTrainId, setSelectedTrainId] = useState(null);

  useEffect(() => {
    fetchActiveTrains();
    const interval = setInterval(fetchActiveTrains, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveTrains = async () => {
    try {
      const response = await api.get('/dashboard/active-trains');
      setActiveTrains(response.data);
      setLoading(false);
    } catch (err) {
      setError('ဒေတာရယူရာတွင် မအောင်မြင်ပါ');
      setLoading(false);
    }
  };

  const fetchTrainDetails = async (trainId) => {
    try {
      const response = await api.get(`/dashboard/train/${trainId}`);
      setSelectedTrain(response.data);
      setSelectedTrainId(trainId);
    } catch (err) {
      console.error('Failed to fetch train details:', err);
    }
  };

  const getStatusStyles = (status) => {
    const styles = {
      'ACTIVE': { 
        bg: 'bg-emerald-50', 
        text: 'text-emerald-700', 
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        label: 'ပြေးဆွဲနေသည်'
      },
      'DELAYED': { 
        bg: 'bg-amber-50', 
        text: 'text-amber-700', 
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        label: 'နှောင့်နှေးနေသည်'
      },
      'STOPPED': { 
        bg: 'bg-red-50', 
        text: 'text-red-700', 
        border: 'border-red-200',
        dot: 'bg-red-500',
        label: 'ရပ်နားထား'
      },
      'ARRIVED': { 
        bg: 'bg-blue-50', 
        text: 'text-blue-700', 
        border: 'border-blue-200',
        dot: 'bg-blue-500',
        label: 'ဆိုက်ရောက်ပြီး'
      },
      'SCHEDULED': { 
        bg: 'bg-indigo-50', 
        text: 'text-indigo-700', 
        border: 'border-indigo-200',
        dot: 'bg-indigo-500',
        label: 'စီစဉ်ထား'
      }
    };
    return styles[status] || styles['ACTIVE'];
  };

  const getDelayBadge = (minutes) => {
    if (!minutes || minutes === 0) return null;
    if (minutes <= 5) {
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200">+{minutes} မိနစ်</Badge>;
    }
    return <Badge className="bg-red-50 text-red-700 border-red-200">+{minutes} မိနစ်</Badge>;
  };

  const getStatusDot = (status) => {
    const styles = getStatusStyles(status);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles.bg} ${styles.text} ${styles.border} border`}>
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} animate-pulse`}></span>
        {styles.label}
      </span>
    );
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return 'N/A';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('my-MM', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">ဒေတာများ ရယူနေသည်...</p>
          <p className="text-gray-400 text-sm mt-1">ရထားတည်နေရာများကို ဆောင်ယူနေပါသည်</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={fetchActiveTrains}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ပြန်လည်ကြိုးစားရန်
          </button>
        </div>
      </div>
    );
  }

  const stats = {
    total: activeTrains.length,
    onTime: activeTrains.filter(t => t.delay_minutes === 0).length,
    delayed: activeTrains.filter(t => t.delay_minutes > 0).length,
    staff: activeTrains.reduce((acc, train) => acc + (train.staff?.length || 0), 0)
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              ရထားစီမံခန့်ခွဲမှုစနစ်
            </p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Train className="w-8 h-8 text-blue-600" />
              ရထားခြေရာခံ ဒတ်ရှ်ဘုတ်
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              လက်ရှိပြေးဆွဲနေသော ရထားများ၏ တည်နေရာနှင့် အခြေအနေကို အချိန်နှင့်တပြေးညီ စောင့်ကြည့်ခြင်း
            </p>
          </div>
          <button
            onClick={fetchActiveTrains}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg"
          >
            <Activity className="w-4 h-4" />
            ဒေတာအသစ်ပြန်လည်ရယူရန်
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{stats.total}</p>
            <p className="text-xs text-blue-600">ပြေးဆွဲနေသော ရထားများ</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{stats.onTime}</p>
            <p className="text-xs text-emerald-600">အချိန်မှန်</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{stats.delayed}</p>
            <p className="text-xs text-amber-600">နှောင့်နှေးနေသည်</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{stats.staff}</p>
            <p className="text-xs text-purple-600">ဝန်ထမ်းများ</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Train List */}
        <div className="lg:col-span-2">
          <Card className="border-gray-100 shadow-sm">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Train className="w-5 h-5 text-blue-600" />
                ပြေးဆွဲနေသော ရထားများ
                <Badge variant="outline" className="ml-2 text-xs">
                  {activeTrains.length} စီး
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {activeTrains.length === 0 ? (
                <div className="text-center py-12">
                  <Train className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">ပြေးဆွဲနေသော ရထားမရှိပါ</p>
                  <p className="text-gray-400 text-sm mt-1">ဤအချိန်တွင် ရထားအားလုံး ရပ်နားထားပါသည်</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeTrains.map((train) => {
                    const statusStyle = getStatusStyles(train.status);
                    const isSelected = selectedTrainId === train.train_id;
                    
                    return (
                      <div
                        key={train.train_id}
                        className={`border rounded-xl p-4 transition-all duration-200 cursor-pointer hover:shadow-md ${
                          isSelected 
                            ? 'border-blue-400 bg-blue-50/30 shadow-md' 
                            : 'border-gray-200 hover:border-blue-200'
                        }`}
                        onClick={() => fetchTrainDetails(train.train_id)}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isSelected ? 'bg-blue-100' : 'bg-gray-100'
                            }`}>
                              <Train className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">{train.train_name}</h3>
                              <p className="text-sm text-gray-500">{train.train_no}</p>
                            </div>
                          </div>
                          {getStatusDot(train.status)}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-sm text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                              <Navigation className="w-3 h-3" />
                              လမ်းကြောင်းတိုးတက်မှု
                            </span>
                            <span className="font-medium text-gray-700">
                              {train.progress?.percentage || 0}%
                            </span>
                          </div>
                          <Progress 
                            value={train.progress?.percentage || 0} 
                            className="h-2 bg-gray-100"
                            indicatorClassName={`${
                              (train.progress?.percentage || 0) > 75 
                                ? 'bg-emerald-500' 
                                : (train.progress?.percentage || 0) > 40 
                                ? 'bg-blue-500' 
                                : 'bg-amber-500'
                            }`}
                          />
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              လက်ရှိဘူတာ
                            </p>
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {train.current_station || 'ခရီးဆက်နေ'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Navigation className="w-3 h-3" />
                              နောက်ဘူတာ
                            </p>
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {train.next_station || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Gauge className="w-3 h-3" />
                              အမြန်နှုန်း
                            </p>
                            <p className="font-medium text-gray-900 text-sm">
                              {train.current_location?.speed || 0} km/h
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getDelayBadge(train.delay_minutes)}
                            <div className="flex items-center gap-1">
                              {train.battery !== undefined && (
                                <>
                                  <Battery className={`w-4 h-4 ${train.battery > 20 ? 'text-emerald-500' : 'text-red-500'}`} />
                                  <span className="text-sm font-medium">{train.battery}%</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Staff Info */}
                        {train.staff && train.staff.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              လိုက်ပါလာသော ဝန်ထမ်းများ
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {train.staff.map((staff, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="outline" 
                                  className="text-xs bg-gray-50 border-gray-200"
                                >
                                  {staff.role}: {staff.staff_name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Connection Status */}
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          {train.current_location?.last_update ? (
                            <>
                              <Wifi className="w-3 h-3 text-emerald-500" />
                              <span className="text-gray-500">
                                နောက်ဆုံး အပ်ဒိတ်: {formatTime(train.current_location.last_update)}
                              </span>
                            </>
                          ) : (
                            <>
                              <WifiOff className="w-3 h-3 text-gray-400" />
                              <span className="text-gray-400">အချက်အလက်မရှိ</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Train Details Panel */}
        <div className="lg:col-span-1">
          <Card className="border-gray-100 shadow-sm sticky top-6">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="w-5 h-5 text-blue-600" />
                ရထားအသေးစိတ်
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {selectedTrain ? (
                <div className="space-y-4">
                  {/* Train Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Train className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">
                          {selectedTrain.train?.name || selectedTrain.train_name}
                        </h3>
                        <p className="text-sm text-gray-500">{selectedTrain.train?.train_no}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {getStatusDot(selectedTrain.schedule?.status || selectedTrain.status)}
                    </div>
                  </div>

                  {/* Schedule Info */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      အချိန်ဇယား
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">ထွက်ခွာရက်</span>
                        <span className="font-medium text-gray-900">
                          {formatDate(selectedTrain.schedule?.departure_date)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">ထွက်ခွာချိန်</span>
                        <span className="font-medium text-gray-900">
                          {selectedTrain.schedule?.departure_time || 'N/A'}
                        </span>
                      </div>
                      {selectedTrain.schedule?.arrival_time && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">ဆိုက်ရောက်ချိန်</span>
                          <span className="font-medium text-gray-900">
                            {selectedTrain.schedule.arrival_time}
                          </span>
                        </div>
                      )}
                      {selectedTrain.delay_minutes > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">နှောင့်နှေးမှု</span>
                          <span className="font-medium text-amber-600">
                            +{selectedTrain.delay_minutes} မိနစ်
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Route Progress */}
                  {selectedTrain.route_progress && selectedTrain.route_progress.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
                        <Navigation className="w-3 h-3" />
                        လမ်းကြောင်းရပ်နားမှုများ
                      </p>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {selectedTrain.route_progress.map((stop, idx) => {
                          const isCompleted = stop.status === 'ARRIVED' || stop.status === 'DEPARTED';
                          const isCurrent = stop.status === 'CURRENT';
                          
                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-xl border transition-all ${
                                isCompleted
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : isCurrent
                                  ? 'bg-blue-50 border-blue-200 shadow-sm'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  ) : isCurrent ? (
                                    <Circle className="w-4 h-4 text-blue-500 animate-pulse" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-gray-300" />
                                  )}
                                  <span className={`font-medium text-sm ${
                                    isCurrent ? 'text-blue-700' : 'text-gray-900'
                                  }`}>
                                    {stop.station_name}
                                  </span>
                                </div>
                                {stop.delay_minutes > 0 && getDelayBadge(stop.delay_minutes)}
                              </div>
                              <div className="flex justify-between text-xs text-gray-500 mt-1 ml-6">
                                <span>
                                  {stop.actual_arrival
                                    ? `ဆိုက်: ${formatTime(stop.actual_arrival)}`
                                    : `မျှော်မှန်း: ${stop.expected_arrival}`}
                                </span>
                                {stop.stop_duration && (
                                  <span>{stop.stop_duration} မိနစ် ရပ်နား</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Location Info */}
                  {selectedTrain.current_location && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
                        <MapPin className="w-3 h-3" />
                        လက်ရှိတည်နေရာ
                      </p>
                      <div className="space-y-2 text-sm">
                        {selectedTrain.current_location.latitude && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">လတ္တီတွဒ်</span>
                            <span className="font-medium text-gray-900">
                              {selectedTrain.current_location.latitude.toFixed(6)}
                            </span>
                          </div>
                        )}
                        {selectedTrain.current_location.longitude && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">လောင်ဂျီတွဒ်</span>
                            <span className="font-medium text-gray-900">
                              {selectedTrain.current_location.longitude.toFixed(6)}
                            </span>
                          </div>
                        )}
                        {selectedTrain.current_location.speed !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">အမြန်နှုန်း</span>
                            <span className="font-medium text-gray-900">
                              {selectedTrain.current_location.speed} km/h
                            </span>
                          </div>
                        )}
                        {selectedTrain.current_location.last_update && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">နောက်ဆုံးအပ်ဒိတ်</span>
                            <span className="font-medium text-gray-900">
                              {formatTime(selectedTrain.current_location.last_update)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Train className="w-10 h-10 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">ရထားတစ်စီးကို ရွေးချယ်ပါ</p>
                  <p className="text-gray-400 text-sm mt-1">အသေးစိတ်အချက်အလက်များ ကြည့်ရှုရန်</p>
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