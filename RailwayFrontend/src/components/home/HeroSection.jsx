import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, Shield, Clock, Train, Calendar, AlertCircle, ChevronDown, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/button';
import StationSearchInput from '@/components/home/StationSearchInput';
import PassengerCounter from '@/components/home/PassengerCounter';
import demuTrainImage from '@/assets/images/demu-train.jpg';
import trainsApi from '@/api/trains';
import schedulesApi from '@/api/schedules';
import { addMonthsToISODate, formatRailwayDate, formatRailwayTime, getRailwayTodayISO } from '@/utils/railwayDateTime';
import stationsApi from '@/api/stations';

const HeroSection = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('booking');
  const [scrollY, setScrollY] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    fromStation: null,
    toStation: null,
    dateFrom: '',
    dateTo: '',
    adults: 1,
    children: 0
  });

  // Loading states
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResultsLoading, setSearchResultsLoading] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // Search results
  const [searchResults, setSearchResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [fromStationName, setFromStationName] = useState('');
  const [toStationName, setToStationName] = useState('');

  // Live stats
  const [activeTrainsCount, setActiveTrainsCount] = useState(null);

  // Fetch live trains count
  useEffect(() => {
    fetchActiveTrainsCount();
  }, []);

  // Scroll handler for parallax
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Get active trains count
  const fetchActiveTrainsCount = async () => {
    try {
      const response = await trainsApi.getAll({
        status: 'active',
        limit: 1
      });
      setActiveTrainsCount(response.total || 0);
    } catch (err) {
      console.error('Failed to get active trains count:', err);
    }
  };

  // Handle form input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'fromStation' ? { toStation: null } : {})
    }));
    setError(null);
    // Clear results when form changes
    if (field === 'fromStation' || field === 'toStation') {
      setSearchResults(null);
      setShowResults(false);
    }
  };

  // Validate form
  const validateForm = () => {
    if (!formData.fromStation || !formData.fromStation.stationId) {
      throw new Error('ကျေးဇူးပြု၍ ထွက်ခွာမည့်ဘူတာကို ရွေးချယ်ပါ');
    }
    if (!formData.toStation || !formData.toStation.stationId) {
      throw new Error('ကျေးဇူးပြု၍ ဆိုက်ရောက်မည့်ဘူတာကို ရွေးချယ်ပါ');
    }
    if (formData.fromStation.stationId === formData.toStation.stationId) {
      throw new Error('ထွက်ခွာမည့်ဘူတာနှင့် ဆိုက်ရောက်မည့်ဘူတာ မတူညီရပါ');
    }
    if (!formData.dateFrom) {
      throw new Error('ကျေးဇူးပြု၍ စတင်မည့်ရက်စွဲကို ရွေးချယ်ပါ');
    }
    if (!formData.dateTo) {
      throw new Error('ကျေးဇူးပြု၍ ပြီးဆုံးမည့်ရက်စွဲကို ရွေးချယ်ပါ');
    }

    const fromDate = new Date(formData.dateFrom);
    const toDate = new Date(formData.dateTo);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fromDate < today) {
      throw new Error('အတိတ်ရက်စွဲကို ရွေးချယ်၍ မရပါ');
    }
    if (toDate < fromDate) {
      throw new Error('ပြီးဆုံးမည့်ရက်သည် စတင်မည့်ရက်ထက် စော၍မရပါ');
    }

    const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 30) {
      throw new Error('ရက်ပေါင်း ၃၀ ထက် ပို၍ မရှာဖွေနိုင်ပါ');
    }

    if (formData.adults < 1) {
      throw new Error('အနည်းဆုံး လူကြီး ၁ ဦး လိုအပ်ပါသည်');
    }
  };

  // Handle train search - now fetches and displays results on the same page
  const handleSearch = async () => {
    try {
      setSearchLoading(true);
      setError(null);
      setSearchResults(null);
      setShowResults(false);

      console.log('Starting search with formData:', formData);
      validateForm();

      // Find common route IDs between from and to stations
      const fromRouteIds = formData.fromStation.routeIds || [];
      const toRouteIds = formData.toStation.routeIds || [];
      const commonRouteIds = fromRouteIds.filter(id => toRouteIds.includes(id));

      console.log('From route IDs:', fromRouteIds);
      console.log('To route IDs:', toRouteIds);
      console.log('Common route IDs:', commonRouteIds);

      // Get route IDs to use
      let routeIdsToUse;
      if (commonRouteIds.length > 0) {
        routeIdsToUse = commonRouteIds;
      } else {
        // Use all available route IDs
        routeIdsToUse = [...new Set([...fromRouteIds, ...toRouteIds])];
      }

      if (routeIdsToUse.length === 0) {
        throw new Error('ဤဘူတာနှစ်ခုကြား တိုက်ရိုက်ရထားလမ်းကြောင်း မရှိပါ');
      }

      // Get station names for display
      try {
        const fromStation = await stationsApi.getById(formData.fromStation.stationId);
        const toStation = await stationsApi.getById(formData.toStation.stationId);
        setFromStationName(fromStation.name || '');
        setToStationName(toStation.name || '');
      } catch (err) {
        console.error('Failed to fetch station names:', err);
      }

      // Search schedules
      setSearchResultsLoading(true);
      const params = {
        from_station_id: formData.fromStation.stationId,
        to_station_id: formData.toStation.stationId,
        route_ids: routeIdsToUse.join(','),
        date_from: formData.dateFrom,
        date_to: formData.dateTo
      };

      console.log('Searching schedules with params:', params);
      const results = await schedulesApi.search(params);
      console.log('Search results:', results);

      setSearchResults(results || []);
      setShowResults(true);

      // Scroll to results
      setTimeout(() => {
        document.getElementById('search-results')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);

    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || err.detail || 'ရှာဖွေမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ');
      setShowResults(false);
    } finally {
      setSearchLoading(false);
      setSearchResultsLoading(false);
    }
  };

  // Handle booking a specific schedule
  const handleBookNow = (schedule) => {
    navigate(`/booking/${schedule.schedule_id}`, {
      state: {
        schedule,
        fromStation: {
          id: formData.fromStation.stationId,
          name: fromStationName
        },
        toStation: {
          id: formData.toStation.stationId,
          name: toStationName
        },
        dateFrom: formData.dateFrom,
        dateTo: formData.dateTo,
        adults: formData.adults,
        children: formData.children
      }
    });
  };

  // Handle schedule view
  const handleViewSchedule = () => {
    navigate('/schedules');
  };

  // Scroll to the embedded homepage ticket tracker.
  // Keep /pnr-status as a fallback if this component is reused elsewhere.
  const handlePNRCheck = () => {
    const tracker = document.getElementById('ticket-tracker');
    if (tracker) {
      tracker.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate('/pnr-status');
  };

  // Railway timetable values are Myanmar-local clock values.
  const formatDate = (value) =>
    value ? formatRailwayDate(value, 'my-MM', { weekday: 'long' }) : 'N/A';

  const formatTime = (value) =>
    value ? formatRailwayTime(value, 'my-MM', { hour12: true }) : 'N/A';

  const getTodayDate = () => getRailwayTodayISO();

  const getMaxDate = () => addMonthsToISODate(getRailwayTodayISO(), 3);

  // When dateFrom changes, update dateTo min value
  const getMinDateTo = () => {
    return formData.dateFrom || getTodayDate();
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image with Parallax */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${demuTrainImage})`,
          transform: `translateY(${scrollY * 0.5}px)`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-sky-900/90 via-blue-900/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-sky-900/60" />
      </div>

      {/* Animated Pattern Overlay */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Live Stats Widgets */}
      <div className="absolute top-20 right-10 hidden lg:block">
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/20" style={{ animation: 'float 3s ease-in-out infinite' }}>
          <div className="flex items-center space-x-3">
            <Train className="w-5 h-5 text-blue-300" />
            <div>
              <p className="text-white text-sm font-medium">ပြေးဆွဲနေသော ရထားများ</p>
              <p className="text-sky-400 text-sm font-bold">
                {activeTrainsCount !== null ? activeTrainsCount.toLocaleString() : '...'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-32 left-10 hidden lg:block">
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/20" style={{ animation: 'float 3s ease-in-out infinite' }}>
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-400 rounded-full" style={{ animation: 'pulseSoft 2s ease-in-out infinite' }} />
            <p className="text-white text-sm">အချိန်မှန်ပြေးဆွဲမှု ၉၈.၅%</p>
          </div>
        </div>
      </div>

      <div className="absolute top-40 right-1/4 hidden lg:block">
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-white/20" style={{ animation: 'float 3s ease-in-out infinite' }}>
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-yellow-400" />
            <p className="text-white text-xs">256-bit SSL လုံခြုံရေး</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        {/* Trust Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 mb-8" style={{ animation: 'float 3s ease-in-out infinite' }}>
            <div className="w-2 h-2 bg-green-400 rounded-full" style={{ animation: 'pulseSoft 2s ease-in-out infinite' }} />
            <span className="text-sm text-white font-medium">
              မြန်မာ့ရထားလမ်းပိုင်း ဝန်ဆောင်မှု
            </span>
          </div>
        </div>

        {/* Main Heading */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-white" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>
              သင့်ခရီးစဉ်
            </span>
            <br />
            <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
              လွယ်ကူစွာသွားလာပါ
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/95 mx-auto leading-relaxed font-medium" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>
            ရထားလက်မှတ်များ အလွယ်တကူ ဝယ်ယူနိုင်ပြီး
            <span className="text-sky-300 font-bold"> အချိန်နှင့်တပြေးညီ သတင်းအချက်အလက်များ </span>
            ရယူနိုင်ပါသည်
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-5xl mx-auto mb-4" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <div className="bg-red-500/20 backdrop-blur-sm border border-red-500/50 rounded-lg p-4 text-white">
              <p className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </p>
            </div>
          </div>
        )}

        {/* Search/Booking Card */}
        <div className="max-w-5xl mx-auto relative z-10">
            <div className="bg-white/15 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-2xl border border-white/30">
            {/* Tabs */}
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-8 bg-white/10 rounded-xl p-1.5 backdrop-blur-sm">
              {[
                { id: 'booking', label: 'လက်မှတ်ဝယ်ရန်', icon: <Train className="w-4 h-4" /> },
                { id: 'schedule', label: 'အချိန်ဇယား', icon: <Clock className="w-4 h-4" /> },
                { id: 'pnr', label: 'ခရီးစဉ်စစ်ရန်', icon: <Search className="w-4 h-4" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError(null);
                    if (tab.id !== 'booking') {
                      setShowResults(false);
                    }
                  }}
                  className={`flex-1 flex items-center justify-center space-x-2 py-3.5 px-6 rounded-lg text-sm font-medium transition-all duration-300 ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-lg transform scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Booking Form */}
            {activeTab === 'booking' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                  {/* From Station */}
                  <div className="lg:col-span-1">
                    <StationSearchInput
                      value={formData.fromStation?.stationId || ''}
                      onChange={(stationData) => handleInputChange('fromStation', stationData)}
                      placeholder="ထွက်ခွာမည့်ဘူတာ ရွေးပါ..."
                      label="ထွက်ခွာမည့်ဘူတာ"
                    />
                  </div>

                  {/* To Station */}
                  <div className="lg:col-span-1">
                    <StationSearchInput
                      value={formData.toStation?.stationId || ''}
                      onChange={(stationData) => handleInputChange('toStation', stationData)}
                      placeholder="ဆိုက်ရောက်မည့်ဘူတာ ရွေးပါ..."
                      excludeStation={formData.fromStation?.stationId}
                      connectedToStation={formData.fromStation?.stationId}
                      label="ဆိုက်ရောက်မည့်ဘူတာ"
                    />
                  </div>

                    {/* Date From */}
                    <div className="lg:col-span-1">
                      <label className="block text-sm font-medium text-white/90 mb-1.5">
                        စတင်မည့်ရက်
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-sky-300 pointer-events-none" />
                        <input
                          type="date"
                          value={formData.dateFrom}
                          onChange={(e) => {
                            handleInputChange('dateFrom', e.target.value);
                            if (formData.dateTo && e.target.value > formData.dateTo) {
                              handleInputChange('dateTo', '');
                            }
                          }}
                          min={getTodayDate()}
                          max={getMaxDate()}
                          className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:bg-white/20 focus:border-sky-400 focus:outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Date To */}
                    <div className="lg:col-span-1">
                      <label className="block text-sm font-medium text-white/90 mb-1.5">
                        ပြီးဆုံးမည့်ရက်
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-sky-300 pointer-events-none" />
                        <input
                          type="date"
                          value={formData.dateTo}
                          onChange={(e) => handleInputChange('dateTo', e.target.value)}
                          min={getMinDateTo()}
                          max={getMaxDate()}
                          disabled={!formData.dateFrom}
                          className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:bg-white/20 focus:border-sky-400 focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>

                  {/* Passenger Counter */}
                  <div className="lg:col-span-1">
                    <PassengerCounter
                      adults={formData.adults}
                      children={formData.children}
                      onAdultsChange={(value) => handleInputChange('adults', value)}
                      onChildrenChange={(value) => handleInputChange('children', value)}
                      childAgeLimit={12}
                    />
                  </div>
                </div>

                {/* Search Button */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                      variant="highlight"
                      size="lg"
                      className="w-fit mx-auto px-6 bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleSearch}
                      disabled={searchLoading || searchResultsLoading}
                    >
                      {searchLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          ရှာဖွေနေသည်...
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <Search className="w-5 h-5 mr-2" />
                          ရထားရှာဖွေမည်
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </div>
                      )}
                    </Button>

                </div>
              </>
            )}

            {/* Schedule Tab */}
            {activeTab === 'schedule' && (
              <div className="text-center text-white py-8">
                <Clock className="w-16 h-16 mx-auto mb-4 text-sky-300" />
                <h3 className="text-2xl font-bold mb-2">ရထားခရီးစဉ် အချိန်ဇယားများ</h3>
                <p className="text-white/80 mb-6">
                  ရထားခရီးစဉ်အားလုံး၏ အချိန်ဇယားများကို ကြည့်ရှုနိုင်ပါသည်
                </p>
                <Button
                  variant="secondary"
                  onClick={handleViewSchedule}
                  className="bg-sky-500 hover:bg-sky-600 text-white"
                >
                  <Clock className="w-5 h-5 mr-2" />
                  အချိန်ဇယားများ ကြည့်မည်
                </Button>
              </div>
            )}

            {/* PNR Status Tab */}
            {activeTab === 'pnr' && (
              <div className="text-center text-white py-8">
                <Search className="w-16 h-16 mx-auto mb-4 text-sky-300" />
                <h3 className="text-2xl font-bold mb-2">ခရီးစဉ် စစ်ဆေးရန်</h3>
                <p className="text-white/80 mb-6">
                  သင့် PNR နံပါတ်ဖြင့် ခရီးစဉ်အခြေအနေကို စစ်ဆေးနိုင်ပါသည်
                </p>
                <Button
                  variant="secondary"
                  onClick={handlePNRCheck}
                  className="bg-sky-500 hover:bg-sky-600 text-white"
                >
                  <Search className="w-5 h-5 mr-2" />
                  PNR စစ်ဆေးမည်
                </Button>
              </div>
            )}
          </div>

          {/* Search Results Section */}
          {showResults && (
            <div id="search-results" className="mt-8">
              {searchResultsLoading ? (
                <div className="bg-white/15 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-300 mx-auto mb-4"></div>
                  <p className="text-white/80">ရထားခရီးစဉ်များ ရှာဖွေနေသည်...</p>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="bg-white/15 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-2xl border border-white/30">
                  {/* Results Header */}
                  <div className="mb-6 pb-4 border-b border-white/10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-3 text-white mb-1">
                          <MapPin className="w-5 h-5 text-sky-300" />
                          <span className="font-medium">{fromStationName}</span>
                          <ArrowRight className="w-4 h-4 text-sky-300" />
                          <MapPin className="w-5 h-5 text-green-400" />
                          <span className="font-medium">{toStationName}</span>
                        </div>
                        <p className="text-white/60 text-sm">
                          {formData.dateFrom} မှ {formData.dateTo} အတွင်း •
                          ရှာဖွေတွေ့ရှိမှု {searchResults.length} ခု
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Results List */}
                  <div className="space-y-4">
                    {searchResults.map((schedule) => (
                      <div
                        key={schedule.schedule_id}
                        className="bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl p-5 transition-all"
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
                            </div>
                          </div>

                          {/* Time Info */}
                          <div className="flex items-center space-x-4">
                            <div className="text-center">
                              <p className="text-white/60 text-xs mb-1">ထွက်ခွာချိန်</p>
                              <p className="text-white font-bold text-lg">
                                {formatTime(schedule.departure_time)}
                              </p>
                              <p className="text-white/60 text-xs">
                                {formatDate(schedule.departure_time)}
                              </p>
                            </div>

                            <div className="flex flex-col items-center">
                              <ArrowRight className="w-5 h-5 text-sky-300" />
                            </div>

                            <div className="text-center">
                              <p className="text-white/60 text-xs mb-1">ရောက်ရှိချိန်</p>
                              <p className="text-white font-bold text-lg">
                                {formatTime(schedule.arrival_time)}
                              </p>
                              <p className="text-white/60 text-xs">
                                {formatDate(schedule.arrival_time)}
                              </p>
                            </div>
                          </div>

                          {/* Action */}
                          <div className="flex items-center space-x-3">
                            <Button
                              onClick={() => handleBookNow(schedule)}
                              disabled={schedule.status !== 'SCHEDULED'}
                              className="bg-sky-500 hover:bg-sky-600 text-white whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {schedule.status === 'SCHEDULED' ? 'လက်မှတ်ဝယ်မည်' : schedule.status}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white/15 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 text-center">
                  <Search className="w-16 h-16 mx-auto mb-4 text-white/40" />
                  <h3 className="text-xl font-bold text-white mb-2">ရထားခရီးစဉ် မတွေ့ရှိပါ</h3>
                  <p className="text-white/60">
                    ဤရက်အတွင်း ရထားခရီးစဉ်များ မရှိသေးပါ။ အခြားရက်များကို ပြန်လည်ရှာဖွေကြည့်ပါ။
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scroll Indicator - Only show when no results */}
        {!showResults && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 hidden md:block" style={{ animation: 'float 3s ease-in-out infinite' }}>
            <div className="flex flex-col items-center space-y-2">
              <span className="text-white/70 text-xs">အောက်သို့ဆွဲပါ</span>
              <div className="w-6 h-10 border-2 border-white/40 rounded-full flex justify-center">
                <div className="w-1.5 h-3 bg-white/60 rounded-full mt-2" style={{ animation: 'bounce 1s infinite' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Animated Track Lines at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500" />
      <div className="absolute bottom-1 left-0 right-0 h-0.5 bg-white/30" />
    </div>
  );
};

export default HeroSection;