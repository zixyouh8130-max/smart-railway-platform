// src/components/admin/CoachConfiguration.jsx
import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Trash2, ChevronDown, ChevronUp, Loader, AlertCircle, 
  Copy, ArrowUp, ArrowDown, GripVertical, Armchair, Train, 
  LayoutGrid, Users, Settings, Save
} from 'lucide-react';
import Button from '@/components/ui/button';
import coachesApi from '@/api/coaches';
import SeatLayout from './SeatLayout';

const COACH_TYPES = {
  UPPER_CLASS: {
    name: 'အထက်တန်း',
    subtitle: 'Premium / Highest Class',
    color: 'amber',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: '⭐',
    defaultRows: 5,
    defaultSeatsPerRow: 4
  },
  ECONOMY_CLASS: {
    name: 'သာမန်တန်း',
    subtitle: 'Economy Class',
    color: 'blue',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: '💺',
    defaultRows: 10,
    defaultSeatsPerRow: 6
  },
  SLEEPER: {
    name: 'အိပ်စင်တွဲ',
    subtitle: 'Sleeper / Bed',
    color: 'purple',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    icon: '🛏️',
    defaultRows: 8,
    defaultSeatsPerRow: 4
  },
  DINING: {
    name: 'စားသောက်တွဲ',
    subtitle: 'Dining Coach',
    color: 'green',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: '🍽️',
    defaultRows: 5,
    defaultSeatsPerRow: 4
  },
  BAGGAGE: {
    name: 'ပစ္စည်း/ကုန်တွဲ',
    subtitle: 'Baggage / Goods',
    color: 'gray',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-700',
    icon: '📦',
    defaultRows: 1,
    defaultSeatsPerRow: 0
  }
};

const CoachConfiguration = ({ train, onClose, onSave }) => {
  const [coaches, setCoaches] = useState([]);
  const [expandedCoach, setExpandedCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReorderMode, setIsReorderMode] = useState(false);

  useEffect(() => {
    const fetchCoaches = async () => {
      if (!train || !train.id) {
        setFetchLoading(false);
        return;
      }

      setFetchLoading(true);
      setError(null);

      try {
        const response = await coachesApi.getByTrainId(train.id);

        let coachesData = [];
        if (response && response.coaches && Array.isArray(response.coaches)) {
          coachesData = response.coaches;
        } else if (response && response.data && response.data.coaches && Array.isArray(response.data.coaches)) {
          coachesData = response.data.coaches;
        } else if (response && Array.isArray(response.data)) {
          coachesData = response.data;
        } else if (Array.isArray(response)) {
          coachesData = response;
        }

        if (coachesData.length > 0) {
          setCoaches(coachesData.map(coach => ({
            ...coach,
            type: coach.coach_type || coach.type || 'ECONOMY_CLASS',
            seatsPerRow: coach.seats_per_row || coach.seatsPerRow || 6,
            totalSeats: coach.total_seats || coach.totalSeats || 0,
            orderNumber: coach.order_number || coach.orderNumber || 0,
            isNew: false
          })));
        }
      } catch (err) {
        console.error('Error fetching coaches:', err);
        if (err.status !== 404) {
          setError('တွဲများ ရယူ၍မရပါ');
        }
        setCoaches([]);
      } finally {
        setFetchLoading(false);
      }
    };

    fetchCoaches();
  }, [train]);

  const addCoach = () => {
    const newCoach = {
      id: Date.now(),
      type: 'ECONOMY_CLASS',
      name: 'သာမန်တန်း',
      rows: 10,
      seatsPerRow: 6,
      totalSeats: 60,
      orderNumber: (coaches.length || 0) + 1,
      isNew: true
    };
    setCoaches(prev => [...(prev || []), newCoach]);
    setExpandedCoach(newCoach.id);
  };

  const duplicateCoach = (coachId) => {
    const coachToDuplicate = coaches.find(coach => coach.id === coachId);
    if (!coachToDuplicate) return;

    const duplicatedCoach = {
      ...coachToDuplicate,
      id: Date.now(),
      name: `${coachToDuplicate.name} (မိတ္တူ)`,
      orderNumber: coaches.length + 1,
      isNew: true
    };

    setCoaches(prev => [...prev, duplicatedCoach]);
    setExpandedCoach(duplicatedCoach.id);
  };

  const removeCoach = (coachId) => {
    setCoaches(prev => {
      const filtered = (prev || []).filter(coach => coach.id !== coachId);
      return filtered.map((coach, index) => ({
        ...coach,
        orderNumber: index + 1
      }));
    });
    if (expandedCoach === coachId) {
      setExpandedCoach(null);
    }
  };

  const moveCoach = (coachId, direction) => {
    setCoaches(prev => {
      const currentIndex = prev.findIndex(coach => coach.id === coachId);
      if (currentIndex === -1) return prev;

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newCoaches = [...prev];
      const [movedCoach] = newCoaches.splice(currentIndex, 1);
      newCoaches.splice(newIndex, 0, movedCoach);

      return newCoaches.map((coach, index) => ({
        ...coach,
        orderNumber: index + 1
      }));
    });
  };

  const updateCoach = (coachId, field, value) => {
    setCoaches(prev => (prev || []).map(coach => {
      if (coach.id === coachId) {
        const updatedCoach = { ...coach, [field]: value };

        if (field === 'rows' || field === 'seatsPerRow') {
          const rows = field === 'rows' ? value : (coach.rows || 0);
          const seatsPerRow = field === 'seatsPerRow' ? value : (coach.seatsPerRow || 0);
          updatedCoach.totalSeats = rows * seatsPerRow;
        }

        if (field === 'type') {
          const typeConfig = COACH_TYPES[value];
          if (typeConfig) {
            updatedCoach.name = typeConfig.name;
            if (coach.isNew) {
              updatedCoach.rows = typeConfig.defaultRows;
              updatedCoach.seatsPerRow = typeConfig.defaultSeatsPerRow;
              updatedCoach.totalSeats = typeConfig.defaultRows * typeConfig.defaultSeatsPerRow;
            }
          }
        }

        return updatedCoach;
      }
      return coach;
    }));
  };

  const handleSave = async () => {
    if (!coaches || coaches.length === 0) {
      setError('အနည်းဆုံး တွဲတစ်ခု ထည့်သွင်းရန် လိုအပ်ပါသည်');
      return;
    }

    const invalidCoaches = coaches.filter(coach => {
      if (coach.type === 'BAGGAGE') {
        return !coach.name || !coach.type;
      }
      return !coach.name || !coach.type || (coach.rows || 0) <= 0 || (coach.totalSeats || 0) <= 0;
    });

    if (invalidCoaches.length > 0) {
      setError('တွဲအချက်အလက်များ မပြည့်စုံပါ။ ကျေးဇူးပြု၍ ပြန်လည်ဖြည့်သွင်းပါ');
      return;
    }

    const coachesData = coaches.map((coach, index) => ({
      coach_type: coach.type,
      name: coach.name,
      rows: coach.rows || 0,
      seats_per_row: coach.seatsPerRow || coach.seats_per_row || 0,
      total_seats: coach.totalSeats || coach.total_seats || 0,
      order_number: index + 1,
      is_active: true
    }));

    setLoading(true);
    setError(null);

    try {
      const response = await coachesApi.bulkUpdate(train.id, coachesData);
      onSave({
        ...response,
        message: `တွဲ ${response.coaches_count} ခုနှင့် ထိုင်ခုံ ${response.seats_count} ခုံ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ`
      });
    } catch (err) {
      const errorMessage = err.detail || err.message || 'တွဲများ သိမ်းဆည်း၍မရပါ';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getCoachColor = (type) => {
    const config = COACH_TYPES[type];
    return config || COACH_TYPES.ECONOMY_CLASS;
  };

  const getTotalSeats = () => {
    if (!coaches || !Array.isArray(coaches)) return 0;
    return coaches.reduce((sum, coach) => sum + (coach.totalSeats || 0), 0);
  };

  const getTotalCoaches = () => {
    return coaches ? coaches.length : 0;
  };

  if (fetchLoading) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <Loader className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">တွဲများ ရယူနေသည်...</p>
          <p className="text-gray-400 text-sm mt-1">ကျေးဇူးပြု၍ စောင့်ပါ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200/50">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Train className="w-6 h-6 text-blue-600" />
              တွဲများ ပြင်ဆင်ခြင်း
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {train?.train_name || train?.trainName || 'ရထား'} - {train?.train_no || train?.trainNo || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:rotate-90"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800 transition-colors"
              >
                ✕
              </button>
            </div>
          )}

          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">စုစုပေါင်း တွဲ</p>
                  <p className="text-2xl font-bold text-blue-900">{getTotalCoaches()}</p>
                </div>
                <div className="w-px h-10 bg-blue-200"></div>
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">စုစုပေါင်း ထိုင်ခုံ</p>
                  <p className="text-2xl font-bold text-blue-900">{getTotalSeats().toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 w-full md:w-auto">
                <Button
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  className={`text-sm px-4 py-2 rounded-xl transition-all ${
                    isReorderMode 
                      ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-200' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                  title={isReorderMode ? 'အစဉ်လိုက်ပြင်ဆင်ခြင်း ပိတ်မည်' : 'အစဉ်လိုက်ပြင်ဆင်မည်'}
                >
                  <GripVertical className="w-4 h-4 inline mr-1.5" />
                  {isReorderMode ? 'အစဉ်ပြောင်းခြင်း ပိတ်မည်' : 'အစဉ်ပြောင်းမည်'}
                </Button>
                <Button
                  onClick={addCoach}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 px-4 py-2 rounded-xl"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  တွဲထည့်မည်
                </Button>
              </div>
            </div>
          </div>

          {/* Coaches List */}
          {(!coaches || coaches.length === 0) ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
              <Train className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-600">တွဲများ မရှိသေးပါ</p>
              <p className="text-sm text-gray-400 mt-1">"တွဲထည့်မည်" ခလုတ်ကို နှိပ်၍ တွဲများ ထည့်သွင်းပါ</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(coaches || []).map((coach, index) => {
                const colorConfig = getCoachColor(coach.type);
                const isExpanded = expandedCoach === coach.id;
                const isBaggage = coach.type === 'BAGGAGE';

                return (
                  <div
                    key={coach.id}
                    className={`border-2 rounded-2xl transition-all duration-300 ${
                      isExpanded ? 'shadow-lg' : 'shadow-sm'
                    } ${isReorderMode ? 'border-orange-300 bg-orange-50/30' : colorConfig.border} ${colorConfig.bg}`}
                  >
                    {/* Coach Header */}
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {/* Reorder Controls */}
                        {isReorderMode && (
                          <div className="flex flex-col space-y-1 mr-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveCoach(coach.id, 'up');
                              }}
                              disabled={index === 0}
                              className="p-1 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="အပေါ်သို့ရွှေ့မည်"
                            >
                              <ArrowUp className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveCoach(coach.id, 'down');
                              }}
                              disabled={index === coaches.length - 1}
                              className="p-1 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="အောက်သို့ရွှေ့မည်"
                            >
                              <ArrowDown className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        )}
                        
                        {/* Coach Number */}
                        <div 
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer transition-all hover:scale-105 ${
                            colorConfig.bg
                          } ${colorConfig.text} border ${colorConfig.border}`}
                          onClick={() => !isReorderMode && setExpandedCoach(isExpanded ? null : coach.id)}
                        >
                          {index + 1}
                        </div>
                        
                        {/* Coach Info */}
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => !isReorderMode && setExpandedCoach(isExpanded ? null : coach.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{colorConfig.icon}</span>
                            <h3 className="font-semibold text-gray-900 truncate">
                              {coach.name || 'တွဲအသစ်'}
                            </h3>
                            {coach.isNew && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                အသစ်
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {coach.type && COACH_TYPES[coach.type]?.name} · {COACH_TYPES[coach.type]?.subtitle}
                          </p>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateCoach(coach.id);
                          }}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all duration-200 hover:scale-110"
                          title="မိတ္တူကူးမည်"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCoach(coach.id);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 hover:scale-110"
                          title="ဖယ်ရှားမည်"
                          disabled={isReorderMode}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        {!isReorderMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCoach(isExpanded ? null : coach.id);
                            }}
                            className={`p-2 hover:bg-white rounded-xl transition-all duration-200 ${
                              isExpanded ? 'bg-white' : ''
                            }`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-500" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Coach Details (Expanded) */}
                    {isExpanded && !isReorderMode && (
                      <div className="p-4 border-t border-gray-200 bg-white/50 rounded-b-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Coach Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              တွဲအမျိုးအစား
                            </label>
                            <select
                              value={coach.type || 'ECONOMY_CLASS'}
                              onChange={(e) => updateCoach(coach.id, 'type', e.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                            >
                              {Object.entries(COACH_TYPES).map(([value, config]) => (
                                <option key={value} value={value}>
                                  {config.icon} {config.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Coach Name */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              တွဲအမည်
                            </label>
                            <input
                              type="text"
                              value={coach.name || ''}
                              onChange={(e) => updateCoach(coach.id, 'name', e.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                              placeholder="တွဲအမည် ထည့်ပါ"
                            />
                          </div>

                          {/* Rows */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              <LayoutGrid className="w-4 h-4 inline mr-1.5" />
                              တန်းအရေအတွက်
                            </label>
                            <input
                              type="number"
                              value={coach.rows || 0}
                              onChange={(e) => updateCoach(coach.id, 'rows', parseInt(e.target.value) || 0)}
                              min="0"
                              max="20"
                              disabled={isBaggage}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Seats per Row */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              <Armchair className="w-4 h-4 inline mr-1.5" />
                              တစ်တန်းလျှင် ခုံအရေအတွက်
                            </label>
                            <input
                              type="number"
                              value={coach.seatsPerRow || coach.seats_per_row || 0}
                              onChange={(e) => updateCoach(coach.id, 'seatsPerRow', parseInt(e.target.value) || 0)}
                              min="0"
                              max="10"
                              disabled={isBaggage}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Total Seats */}
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              <Users className="w-4 h-4 inline mr-1.5" />
                              စုစုပေါင်း ထိုင်ခုံ
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                value={coach.totalSeats || coach.total_seats || 0}
                                readOnly
                                className="flex-1 px-3 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm text-gray-700"
                              />
                              <span className="text-sm text-gray-400">(အလိုအလျောက် တွက်ချက်သည်)</span>
                            </div>
                          </div>
                        </div>

                        {/* Seat Preview */}
                        {!isBaggage && (coach.rows || 0) > 0 && (coach.seatsPerRow || 0) > 0 && (
                          <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                              <Settings className="w-4 h-4 text-gray-500" />
                              <p className="text-sm font-medium text-gray-700">ထိုင်ခုံ အစီအစဉ် အကြမ်းဖျင်း</p>
                            </div>
                            <div className="bg-white rounded-xl p-4 border border-gray-200">
                              <SeatLayout
                                rows={coach.rows || 0}
                                seatsPerRow={coach.seatsPerRow || coach.seats_per_row || 0}
                                coachType={coach.type}
                              />
                            </div>
                          </div>
                        )}

                        {isBaggage && (
                          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                            <p className="text-sm text-gray-500">📦 ပစ္စည်း/ကုန်တွဲ - ထိုင်ခုံများ မပါဝင်ပါ</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-6 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <Button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium"
            >
              မလုပ်တော့ပါ
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || isReorderMode}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-medium shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader className="w-5 h-5 animate-spin mr-2" />
                  သိမ်းဆည်းနေသည်...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <Save className="w-5 h-5 mr-2" />
                  တွဲများ သိမ်းဆည်းမည်
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      <style >{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default CoachConfiguration;