// src/components/admin/TrainManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Edit, Trash2, Train, Search, AlertCircle, Loader, Clock, Settings, 
  MapPin, ChevronDown, ArrowUpDown, Users, Calendar, Filter, X, 
  TrendingUp, Shield, Zap, MoreVertical, Building2, Navigation
} from 'lucide-react';
import CoachConfiguration from '@/components/admin/CoachConfiguration';
import TrainFormModal from '@/components/TrainManage/TrainFormModal';
import TrainScheduleModal from '@/components/TrainManage/TrainScheduleModal'; 
import FeeConfigurationModal from '@/components/RouteManage/FeeConfigurationModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import Button from '@/components/ui/button';
import trainsApi from '@/api/trains';
import routesApi from '@/api/routes';

const TrainManagement = () => {
  const [trains, setTrains] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('origin'); // 'origin', 'train_no', 'name', 'status'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [collapsedCities, setCollapsedCities] = useState({});

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showCoachConfig, setShowCoachConfig] = useState(false);
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const [showFeeConfig, setShowFeeConfig] = useState(false);

  // Selected items
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [feeConfigTrainId, setFeeConfigTrainId] = useState(null);
  const [feeConfigRouteId, setFeeConfigRouteId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [trainsResponse, routesResponse] = await Promise.all([
        trainsApi.getAll(),
        routesApi.getAll()
      ]);

      let trainsData = [];
      if (trainsResponse) {
        if (Array.isArray(trainsResponse)) trainsData = trainsResponse;
        else if (trainsResponse.trains) trainsData = trainsResponse.trains;
        else if (trainsResponse.data?.trains) trainsData = trainsResponse.data.trains;
        else if (Array.isArray(trainsResponse.data)) trainsData = trainsResponse.data;
      }

      let routesData = [];
      if (routesResponse) {
        if (Array.isArray(routesResponse)) routesData = routesResponse;
        else if (routesResponse.routes) routesData = routesResponse.routes;
        else if (routesResponse.data?.routes) routesData = routesResponse.data.routes;
        else if (Array.isArray(routesResponse.data)) routesData = routesResponse.data;
      }

      // Enrich train data with route station info
      const enrichedTrains = trainsData.map(train => {
        const trainRoute = routesData.find(r => r.id === train.route_id);
        return {
          ...train,
          route: trainRoute || train.route
        };
      });

      setTrains(enrichedTrains);
      setRoutes(routesData);
    } catch (err) {
      setError(err.detail || err.message || 'ဒေတာများ ရယူ၍မရပါ။');
      setTrains([]);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  // Sorting and filtering logic - MUST be defined first
  const filteredAndSortedTrains = useMemo(() => {
    if (!Array.isArray(trains)) return [];
    
    let result = [...trains];
    
    // Filter by search term
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(train =>
        train?.train_no?.toLowerCase().includes(searchLower) ||
        train?.train_name?.toLowerCase().includes(searchLower) ||
        train?.route?.origin?.toLowerCase().includes(searchLower) ||
        train?.route?.destination?.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by status
    if (statusFilter !== 'ALL') {
      result = result.filter(train => train?.status === statusFilter);
    }
    
    // Sort
    result.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'origin':
          aValue = a?.route?.origin || '';
          bValue = b?.route?.origin || '';
          break;
        case 'train_no':
          aValue = a?.train_no || '';
          bValue = b?.train_no || '';
          break;
        case 'name':
          aValue = a?.train_name || '';
          bValue = b?.train_name || '';
          break;
        case 'status':
          aValue = a?.status || '';
          bValue = b?.status || '';
          break;
        default:
          aValue = a?.route?.origin || '';
          bValue = b?.route?.origin || '';
      }
      
      const comparison = aValue.localeCompare(bValue);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [trains, searchTerm, sortBy, sortOrder, statusFilter]);

  // Group trains by origin city - NOW defined AFTER filteredAndSortedTrains
  const groupedTrainsByOrigin = useMemo(() => {
    if (!Array.isArray(filteredAndSortedTrains)) return {};
    
    const grouped = {};
    filteredAndSortedTrains.forEach(train => {
      const origin = train?.route?.origin || 'အမည်မသိ';
      if (!grouped[origin]) {
        grouped[origin] = [];
      }
      grouped[origin].push(train);
    });
    
    // Sort city names alphabetically
    const sortedGrouped = {};
    Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .forEach(key => {
        sortedGrouped[key] = grouped[key];
      });
    
    return sortedGrouped;
  }, [filteredAndSortedTrains]);

  const handleCreate = async (formData) => {
    setActionLoading(true);
    try { await trainsApi.create(formData); await fetchData(); setError(null); }
    catch (err) { setError(err.detail || 'ရထား ထည့်သွင်း၍မရပါ'); throw err; }
    finally { setActionLoading(false); }
  };

  const handleUpdate = async (formData) => {
    if (!selectedTrain) return;
    setActionLoading(true);
    try { await trainsApi.update(selectedTrain.id, formData); await fetchData(); setError(null); }
    catch (err) { setError(err.detail || 'ရထား ပြင်ဆင်၍မရပါ'); throw err; }
    finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(true);
    try {
      await trainsApi.delete(deleteId);
      setTrains(prev => prev.filter(train => train.id !== deleteId));
      setIsDeleteDialogOpen(false); setDeleteId(null); setError(null);
    } catch (err) {
      setError(err.detail || 'ဖျက်သိမ်း၍မရပါ။');
      setIsDeleteDialogOpen(false); setDeleteId(null);
    } finally { setActionLoading(false); }
  };

  const handleEditClick = (train) => { setSelectedTrain(train); setIsFormOpen(true); };
  const handleDeleteClick = (id, e) => { e?.stopPropagation(); setDeleteId(id); setIsDeleteDialogOpen(true); };
  const handleAddClick = () => { setSelectedTrain(null); setIsFormOpen(true); };
  const handleCloseForm = () => { setIsFormOpen(false); setSelectedTrain(null); };
  
  const handleFormSubmit = async (formData) => {
    try { selectedTrain ? await handleUpdate(formData) : await handleCreate(formData); }
    catch (err) { throw err; }
  };

  const handleCoachConfigClick = (train) => { setSelectedTrain(train); setShowCoachConfig(true); };
  const handleScheduleClick = (train) => { setSelectedTrain(train); setShowScheduleConfig(true); };

  const handleFeeConfigClick = (train, e) => {
    e?.stopPropagation();
    setSelectedTrain(train);
    setFeeConfigTrainId(train.id);
    setFeeConfigRouteId(train.route_id);
    setShowFeeConfig(true);
  };

  const handleCoachSave = async () => {
    setActionLoading(true);
    try {
      await fetchData();
      setShowCoachConfig(false); setSelectedTrain(null); setError(null);
    } catch (err) {
      setError('ဒေတာများ ပြန်လည်ရယူ၍မရပါ');
      setShowCoachConfig(false); setSelectedTrain(null);
    } finally { setActionLoading(false); }
  };

  const handleFeeConfigClose = () => {
    setShowFeeConfig(false);
    setSelectedTrain(null);
    setFeeConfigTrainId(null);
    setFeeConfigRouteId(null);
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const toggleCityCollapse = (cityName) => {
    setCollapsedCities(prev => ({
      ...prev,
      [cityName]: !prev[cityName]
    }));
  };

  const getStatusBadge = (status) => {
    const config = {
      ACTIVE: { class: 'bg-green-50 text-green-700 ring-1 ring-green-600/20', dot: 'bg-green-500', text: 'သွားလာနေ' },
      INACTIVE: { class: 'bg-red-50 text-red-700 ring-1 ring-red-600/20', dot: 'bg-red-500', text: 'ရပ်နား' },
      MAINTENANCE: { class: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20', dot: 'bg-yellow-500', text: 'ပြင်ဆင်နေ' }
    }[status] || { class: 'bg-gray-50 text-gray-700 ring-1 ring-gray-600/20', dot: 'bg-gray-500', text: status || 'မသိ' };
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.class}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`}></span>
        {config.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="relative">
            <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse"></div>
          </div>
          <p className="text-gray-600 font-medium">ဒေတာများ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl  p-3 ">
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-gray-500">ရထားများ၊ တွဲများ၊ အချိန်ဇယားများနှင့် အခကြေးငွေများအား စီမံခန့်ခွဲပါ</p>
          <Button 
            onClick={handleAddClick} 
            className="bg-blue-400 text-white-600 hover:bg-blue-50 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="w-5 h-5" /> ရထားအသစ်ထည့်မည်
          </Button>
        </div>
      </div>

      {/* Error Alert with animation */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 animate-slideDown">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="ရထားနံပါတ်၊ အမည် သို့မဟုတ် လမ်းကြောင်းဖြင့် ရှာဖွေပါ..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>စစ်ထုတ်မည်</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
        
        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 animate-slideDown">
            <div className="flex flex-wrap gap-3">
              {/* Status Filter */}
              <div className="flex gap-2">
                {['ALL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === status 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {status === 'ALL' ? 'အားလုံး' : 
                     status === 'ACTIVE' ? 'သွားလာနေ' :
                     status === 'INACTIVE' ? 'ရပ်နား' : 'ပြင်ဆင်နေ'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
        <span className="font-medium">စီရန်:</span>
        <button
          onClick={() => toggleSort('origin')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
            sortBy === 'origin' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>ထွက်ခွာမြို့</span>
          {sortBy === 'origin' && <ArrowUpDown className="w-3 h-3" />}
        </button>
        
      </div>

      {/* Train Cards Grouped by City */}
      {filteredAndSortedTrains.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Train className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'ALL' ? 'ရထားများ မတွေ့ရှိပါ' : 'ရထားများ မရှိသေးပါ'}
          </h3>
          {!searchTerm && statusFilter === 'ALL' && (
            <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> ရထားအသစ်ထည့်မည်
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTrainsByOrigin).map(([cityName, cityTrains]) => (
            <div key={cityName} className="space-y-4">
              {/* City Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{cityName}</h2>
                    <p className="text-sm text-gray-500">
                      ရထား{cityTrains.length > 1 ? 'များ' : ''} ( {cityTrains.length} )စီး
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleCityCollapse(cityName)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
                    collapsedCities[cityName] ? '' : 'rotate-180'
                  }`} />
                </button>
              </div>

              {/* City Trains Grid - 2 columns */}
              {!collapsedCities[cityName] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slideDown">
                  {cityTrains.map((train) => (
                    <div 
                      key={train.id} 
                      className="group bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                      onClick={() => handleEditClick(train)}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                            <Train className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                              {train.train_name || 'အမည်မသိ'}
                            </h3>
                            <p className="text-sm text-gray-500">နံပါတ်: {train.train_no || 'မသိ'}</p>
                          </div>
                        </div>
                        {getStatusBadge(train.status)}
                      </div>

                      {/* Route Info */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-3 mb-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Navigation className="w-4 h-4 text-blue-500" />
                          <span className="font-medium">{train.route?.origin || '...'}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-medium">{train.route?.destination || '...'}</span>
                        </div>
                        {train.route?.stations && (
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            ဘူတာ {train.route.stations.length} ခု
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCoachConfigClick(train); }}
                          className="flex items-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm transition-all hover:scale-105"
                        >
                          <Train className="w-4 h-4" /><span>တွဲများ</span>
                        </button>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleScheduleClick(train); }}
                          className="flex items-center space-x-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 text-sm transition-all hover:scale-105"
                          title="အချိန်ဇယား ပြင်ဆင်မည်"
                        >
                          <Clock className="w-4 h-4" /><span>အချိန်ဇယား</span>
                        </button>

                        {train.route_id && (
                          <button 
                            onClick={(e) => handleFeeConfigClick(train, e)}
                            className="flex items-center space-x-2 px-3 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 text-sm transition-all hover:scale-105"
                            title="အခကြေးငွေ ပြင်ဆင်မည်"
                          >
                            <Settings className="w-4 h-4" /><span>နှုန်းထားများ</span>
                          </button>
                        )}
                        
                        <div className="flex ml-auto gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEditClick(train); }}
                            className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-all hover:scale-105"
                            title="ရထားပြင်ဆင်မည်"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          <button 
                            onClick={(e) => handleDeleteClick(train.id, e)}
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all hover:scale-105"
                            title="ဖျက်သိမ်းမည်"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {train.total_coaches > 0 && (
                            <span className="flex items-center gap-1">
                              <Train className="w-3 h-3" /> {train.total_coaches} တွဲ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-yellow-500" />
                          <span>ID: {train.id}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {/* Total Count */}
          <div className="text-sm text-gray-600 text-center bg-white rounded-xl py-3 shadow-sm">
            စုစုပေါင်း <span className="font-bold text-blue-600">{filteredAndSortedTrains.length}</span> ခု
          </div>
        </div>
      )}

      {/* Modals */}
      <TrainFormModal 
        isOpen={isFormOpen} 
        onClose={handleCloseForm} 
        onSubmit={handleFormSubmit} 
        train={selectedTrain} 
        routes={routes} 
      />
      
      <ConfirmDialog 
        isOpen={isDeleteDialogOpen} 
        onClose={() => { setIsDeleteDialogOpen(false); setDeleteId(null); }}
        onConfirm={handleDelete} 
        title="ရထားဖျက်သိမ်းမည်"
        message="ဤရထားအား ဖျက်သိမ်းလိုသည်မှာ သေချာပါသလား?" 
      />

      {/* Coach Configuration Modal */}
      {showCoachConfig && selectedTrain && (
        <CoachConfiguration 
          train={selectedTrain}
          onClose={() => { setShowCoachConfig(false); setSelectedTrain(null); }}
          onSave={handleCoachSave} 
        />
      )}

      {/* Schedule Modal */}
      {showScheduleConfig && selectedTrain && (
        <TrainScheduleModal 
          train={selectedTrain}
          onClose={() => { setShowScheduleConfig(false); setSelectedTrain(null); }}
          onSave={async () => { await fetchData(); setShowScheduleConfig(false); setSelectedTrain(null); }} 
        />
      )}

      {/* Fee Configuration Modal */}
      {showFeeConfig && feeConfigRouteId && (
        <FeeConfigurationModal
          isOpen={showFeeConfig}
          onClose={handleFeeConfigClose}
          routeId={feeConfigRouteId}
        />
      )}

      {/* Loading Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[60] backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 shadow-xl animate-scaleIn">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-700">လုပ်ဆောင်နေသည်...</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Add custom animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .animate-slideDown {
    animation: slideDown 0.3s ease-out;
  }
  
  .animate-scaleIn {
    animation: scaleIn 0.3s ease-out;
  }
`;
document.head.appendChild(style);

export default TrainManagement;