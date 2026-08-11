// src/components/admin/TrainManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Train, Search, AlertCircle, Loader, Clock, Settings } from 'lucide-react';
import CoachConfiguration from '@/components/admin/CoachConfiguration';
import TrainFormModal from '@/components/TrainManage/TrainFormModal';
import TrainScheduleModal from '@/components/TrainManage/TrainScheduleModal'; 
import FeeConfigurationModal from '@/components/RouteManage/FeeConfigurationModal';
import ConfirmDialog from '@/components/ScheduleManage/ConfirmDialog';
import Button from '@/components/ui/Button';
import trainsApi from '@/api/trains';
import routesApi from '@/api/routes';

const TrainManagement = () => {
  const [trains, setTrains] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

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

      // 🔧 Enrich train data with route station info
      const enrichedTrains = trainsData.map(train => {
        const trainRoute = routesData.find(r => r.id === train.route_id);
        return {
          ...train,
          route: trainRoute || train.route // Use route from routes data if available
        };
      });

      console.log('Enriched trains:', enrichedTrains);
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

  const filteredTrains = useMemo(() => {
    if (!Array.isArray(trains)) return [];
    if (!searchTerm.trim()) return trains;
    const searchLower = searchTerm.toLowerCase();
    return trains.filter(train =>
      train?.train_no?.toLowerCase().includes(searchLower) ||
      train?.train_name?.toLowerCase().includes(searchLower) ||
      train?.route?.origin?.toLowerCase().includes(searchLower) ||
      train?.route?.destination?.toLowerCase().includes(searchLower)
    );
  }, [trains, searchTerm]);

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

  const getStatusBadge = (status) => {
    const config = {
      ACTIVE: { class: 'bg-green-100 text-green-700', text: 'သွားလာနေ' },
      INACTIVE: { class: 'bg-red-100 text-red-700', text: 'ရပ်နား' },
      MAINTENANCE: { class: 'bg-yellow-100 text-yellow-700', text: 'ပြင်ဆင်နေ' }
    }[status] || { class: 'bg-gray-100 text-gray-700', text: status || 'မသိ' };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.class}`}>{config.text}</span>;
  };

  // 🔧 Updated: Check if train has a route_id (stations will be loaded in the modal)
  const canConfigureFees = (train) => {
    // Just check if train has a route assigned
    return train?.route_id && train?.route?.stations?.length >= 2;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">ဒေတာများ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ရထားများ စီမံခန့်ခွဲခြင်း</h1>
          <p className="text-gray-600 mt-1">ရထားများ၊ တွဲများ၊ အချိန်ဇယားများနှင့် အခကြေးငွေများအား စီမံခန့်ခွဲပါ</p>
        </div>
        <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">
          <Plus className="w-4 h-4" /> ရထားအသစ်ထည့်မည်
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="ရထားနံပါတ်၊ အမည် သို့မဟုတ် လမ်းကြောင်းဖြင့် ရှာဖွေပါ..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* Train Cards */}
      {filteredTrains.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <Train className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{searchTerm ? 'ရထားများ မတွေ့ရှိပါ' : 'ရထားများ မရှိသေးပါ'}</h3>
          {!searchTerm && (
            <Button onClick={handleAddClick} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> ရထားအသစ်ထည့်မည်
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTrains.map((train) => (
              <div key={train.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Train className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{train.train_name || 'အမည်မသိ'}</h3>
                      <p className="text-sm text-gray-500">နံပါတ်: {train.train_no || 'မသိ'}</p>
                    </div>
                  </div>
                  {getStatusBadge(train.status)}
                </div>

                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-sm text-gray-600">
                    လမ်းကြောင်း: {train.route?.origin || '...'} - {train.route?.destination || '...'}
                  </p>
                  {train.route?.stations && (
                    <p className="text-xs text-gray-500 mt-1">
                      ဘူတာ {train.route.stations.length} ခု
                    </p>
                  )}
                  {train.route_id && !train.route?.stations && (
                    <p className="text-xs text-blue-500 mt-1">
                      💡 နှုန်းထားသတ်မှတ်ရန် အသင့်ဖြစ်ပါပြီ
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {/* Coach Configuration */}
                  <button onClick={() => handleCoachConfigClick(train)}
                    className="flex items-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm transition-colors">
                    <Train className="w-4 h-4" /><span>တွဲများ</span>
                  </button>
                  
                  {/* Schedule */}
                  <button onClick={() => handleScheduleClick(train)}
                    className="flex items-center space-x-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 text-sm transition-colors"
                    title="အချိန်ဇယား ပြင်ဆင်မည်">
                    <Clock className="w-4 h-4" /><span>အချိန်ဇယား</span>
                  </button>

                  {/* 🆕 Fee Configuration - Show if train has route_id */}
                  {train.route_id && (
                    <button onClick={(e) => handleFeeConfigClick(train, e)}
                      className="flex items-center space-x-2 px-3 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 text-sm transition-colors"
                      title="အခကြေးငွေ ပြင်ဆင်မည်">
                      <Settings className="w-4 h-4" /><span>နှုန်းထားများ</span>
                    </button>
                  )}
                  
                  {/* Edit Train */}
                  <button onClick={() => handleEditClick(train)}
                    className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    title="ရထားပြင်ဆင်မည်">
                    <Edit className="w-4 h-4" />
                  </button>
                  
                  {/* Delete Train */}
                  <button onClick={(e) => handleDeleteClick(train.id, e)}
                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors ml-auto"
                    title="ဖျက်သိမ်းမည်">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Train Footer Info */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  {train.total_coaches > 0 && (
                    <>
                      <span>🚃 {train.total_coaches} တွဲ</span>
                      <span>💺 {train.total_seats || 0} ခုံ</span>
                    </>
                  )}
                  {/* {train.route_id && !train.total_coaches && (
                    <span className="text-purple-500">နှုန်းထားသတ်မှတ်နိုင်ပါပြီ</span>
                  )} */}
                </div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-600 text-center">စုစုပေါင်း {filteredTrains.length} ခု</div>
        </>
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

      {/* 🆕 Fee Configuration Modal */}
      {showFeeConfig && feeConfigRouteId && (
        <FeeConfigurationModal
          isOpen={showFeeConfig}
          onClose={handleFeeConfigClose}
          routeId={feeConfigRouteId}
        />
      )}

      {/* Loading Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 shadow-xl">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-700">လုပ်ဆောင်နေသည်...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainManagement;