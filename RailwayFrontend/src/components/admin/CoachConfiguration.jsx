// src/components/admin/CoachConfiguration.jsx
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Loader, AlertCircle, Copy, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import Button from '@/components/ui/button';
import coachesApi from '@/api/coaches';
import SeatLayout from './SeatLayout';

const COACH_TYPES = {
  UPPER_CLASS: {
    name: 'အထက်တန်း',
    subtitle: 'Premium / Highest Class',
    color: 'bg-amber-100 border-amber-500',
    defaultRows: 5,
    defaultSeatsPerRow: 4
  },
  ECONOMY_CLASS: {
    name: 'သာမန်တန်း',
    subtitle: 'Economy Class',
    color: 'bg-blue-100 border-blue-500',
    defaultRows: 10,
    defaultSeatsPerRow: 6
  },
  SLEEPER: {
    name: 'အိပ်စင်တွဲ',
    subtitle: 'Sleeper / Bed',
    color: 'bg-purple-100 border-purple-500',
    defaultRows: 8,
    defaultSeatsPerRow: 4
  },
  DINING: {
    name: 'စားသောက်တွဲ',
    subtitle: 'Dining Coach',
    color: 'bg-green-100 border-green-500',
    defaultRows: 5,
    defaultSeatsPerRow: 4
  },
  BAGGAGE: {
    name: 'ပစ္စည်း/ကုန်တွဲ',
    subtitle: 'Baggage / Goods',
    color: 'bg-gray-100 border-gray-500',
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

  // Fetch existing coaches when component mounts
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

        // Handle different response formats
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
            // Map backend field names to frontend field names
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
      // Reorder remaining coaches
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
      
      // Check bounds
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newCoaches = [...prev];
      const [movedCoach] = newCoaches.splice(currentIndex, 1);
      newCoaches.splice(newIndex, 0, movedCoach);

      // Update order numbers
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

        // Auto-update total seats when rows or seatsPerRow change
        if (field === 'rows' || field === 'seatsPerRow') {
          const rows = field === 'rows' ? value : (coach.rows || 0);
          const seatsPerRow = field === 'seatsPerRow' ? value : (coach.seatsPerRow || 0);
          updatedCoach.totalSeats = rows * seatsPerRow;
        }

        // Update name when type changes
        if (field === 'type') {
          const typeConfig = COACH_TYPES[value];
          if (typeConfig) {
            updatedCoach.name = typeConfig.name;
            // Set default rows and seats for new coaches
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
    // Validate coaches
    if (!coaches || coaches.length === 0) {
      setError('အနည်းဆုံး တွဲတစ်ခု ထည့်သွင်းရန် လိုအပ်ပါသည်');
      return;
    }

    // Validate each coach
    const invalidCoaches = coaches.filter(coach => {
      // For BAGGAGE type, rows and seats can be 0
      if (coach.type === 'BAGGAGE') {
        return !coach.name || !coach.type;
      }
      return !coach.name || !coach.type || (coach.rows || 0) <= 0 || (coach.totalSeats || 0) <= 0;
    });

    if (invalidCoaches.length > 0) {
      setError('တွဲအချက်အလက်များ မပြည့်စုံပါ။ ကျေးဇူးပြု၍ ပြန်လည်ဖြည့်သွင်းပါ');
      return;
    }

    // Prepare coaches data for API
    // Note: Don't include train_id in each coach object as it's sent separately
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
      // Call bulkUpdate with train_id and coaches array
      const response = await coachesApi.bulkUpdate(train.id, coachesData);
      
      // Show success message with seat count
      const successMessage = `တွဲ ${response.coaches_count} ခုနှင့် ထိုင်ခုံ ${response.seats_count} ခုံ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ`;
      
      // Call onSave with the response data
      onSave({
        ...response,
        message: successMessage
      });
      
    } catch (err) {
      const errorMessage = err.detail || err.message || 'တွဲများ သိမ်းဆည်း၍မရပါ';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getCoachColor = (type) => {
    const typeConfig = COACH_TYPES[type];
    return typeConfig ? typeConfig.color : 'bg-gray-100 border-gray-300';
  };

  const getTotalSeats = () => {
    if (!coaches || !Array.isArray(coaches)) return 0;
    return coaches.reduce((sum, coach) => sum + (coach.totalSeats || 0), 0);
  };

  const getTotalCoaches = () => {
    return coaches ? coaches.length : 0;
  };

  // Loading state while fetching existing coaches
  if (fetchLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">တွဲများ ရယူနေသည်...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">တွဲများ ပြင်ဆင်ခြင်း</h2>
            <p className="text-sm text-gray-600 mt-1">
              {train?.train_name || train?.trainName || 'ရထား'} - {train?.train_no || train?.trainNo || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
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
          <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl">
            <div>
              <p className="text-sm text-blue-900">
                စုစုပေါင်း တွဲ: <span className="font-bold">{getTotalCoaches()}</span> တွဲ
              </p>
              <p className="text-sm text-blue-900">
                စုစုပေါင်း ထိုင်ခုံ: <span className="font-bold">{getTotalSeats().toLocaleString()}</span> ခုံ
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* Reorder Toggle Button */}
              <Button
                onClick={() => setIsReorderMode(!isReorderMode)}
                className={`text-sm ${
                  isReorderMode 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title={isReorderMode ? 'အစဉ်လိုက်ပြင်ဆင်ခြင်း ပိတ်မည်' : 'အစဉ်လိုက်ပြင်ဆင်မည်'}
              >
                <GripVertical className="w-4 h-4" />
                {isReorderMode ? 'ပြီးပြီ' : 'အစဉ်ပြောင်းမည်'}
              </Button>
              <Button
                onClick={addCoach}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                <Plus className="w-4 h-4" />
                တွဲထည့်မည်
              </Button>
            </div>
          </div>

          {/* Coaches List */}
          {(!coaches || coaches.length === 0) ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg">တွဲများ မရှိသေးပါ</p>
              <p className="text-sm mt-1">"တွဲထည့်မည်" ခလုတ်ကို နှိပ်၍ တွဲများ ထည့်သွင်းပါ</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(coaches || []).map((coach, index) => (
                <div
                  key={coach.id}
                  className={`border-2 rounded-xl ${getCoachColor(coach.type)} ${
                    isReorderMode ? 'shadow-lg' : ''
                  }`}
                >
                  {/* Coach Header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-3 flex-1">
                      {/* Reorder Controls */}
                      {isReorderMode && (
                        <div className="flex flex-col space-y-1 mr-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCoach(coach.id, 'up');
                            }}
                            disabled={index === 0}
                            className="p-1 hover:bg-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                            className="p-1 hover:bg-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="အောက်သို့ရွှေ့မည်"
                          >
                            <ArrowDown className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      )}
                      
                      {/* Coach Number */}
                      <div 
                        className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                        onClick={() => !isReorderMode && setExpandedCoach(expandedCoach === coach.id ? null : coach.id)}
                      >
                        {index + 1}
                      </div>
                      
                      {/* Coach Info */}
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => !isReorderMode && setExpandedCoach(expandedCoach === coach.id ? null : coach.id)}
                      >
                        <h3 className="font-semibold text-gray-900">
                          {coach.name || 'တွဲအသစ်'}
                          {coach.isNew && (
                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              အသစ်
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-600">
                          {coach.type && COACH_TYPES[coach.type]?.name} | {' '}
                          {coach.rows || 0} တန်း × {coach.seatsPerRow || coach.seats_per_row || 0} ခုံ = {' '}
                          {coach.totalSeats || coach.total_seats || 0} ခုံ
                        </p>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2">
                      {/* Duplicate Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateCoach(coach.id);
                        }}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="မိတ္တူကူးမည်"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      
                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCoach(coach.id);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="ဖယ်ရှားမည်"
                        disabled={isReorderMode}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      {/* Expand/Collapse Toggle */}
                      {!isReorderMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCoach(expandedCoach === coach.id ? null : coach.id);
                          }}
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                          {expandedCoach === coach.id ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Coach Details (Expanded) - Only show when not in reorder mode */}
                  {expandedCoach === coach.id && !isReorderMode && (
                    <div className="p-4 border-t border-gray-200 bg-white bg-opacity-50 rounded-b-xl">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Coach Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            တွဲအမျိုးအစား
                          </label>
                          <select
                            value={coach.type || 'ECONOMY_CLASS'}
                            onChange={(e) => updateCoach(coach.id, 'type', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {Object.entries(COACH_TYPES).map(([value, config]) => (
                              <option key={value} value={value}>
                                {config.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Coach Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            တွဲအမည်
                          </label>
                          <input
                            type="text"
                            value={coach.name || ''}
                            onChange={(e) => updateCoach(coach.id, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>

                        {/* Rows */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            တန်းအရေအတွက်
                          </label>
                          <input
                            type="number"
                            value={coach.rows || 0}
                            onChange={(e) => updateCoach(coach.id, 'rows', parseInt(e.target.value) || 0)}
                            min="0"
                            max="20"
                            disabled={coach.type === 'BAGGAGE'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100"
                          />
                        </div>

                        {/* Seats per Row */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            တစ်တန်းလျှင် ခုံအရေအတွက်
                          </label>
                          <input
                            type="number"
                            value={coach.seatsPerRow || coach.seats_per_row || 0}
                            onChange={(e) => updateCoach(coach.id, 'seatsPerRow', parseInt(e.target.value) || 0)}
                            min="0"
                            max="10"
                            disabled={coach.type === 'BAGGAGE'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100"
                          />
                        </div>

                        {/* Total Seats (Read-only) */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            စုစုပေါင်း ထိုင်ခုံ
                          </label>
                          <input
                            type="number"
                            value={coach.totalSeats || coach.total_seats || 0}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
                          />
                        </div>
                      </div>
                      <div className="mt-6">
                        {/* Seat Preview */}
                        <SeatLayout
                          rows={coach.rows || 0}
                          seatsPerRow={coach.seatsPerRow || coach.seats_per_row || 0}
                          coachType={coach.type}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
          <div className="flex space-x-3">
            <Button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              မလုပ်တော့ပါ
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || isReorderMode}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                  သိမ်းဆည်းနေသည်...
                </span>
              ) : (
                'သိမ်းဆည်းမည်'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachConfiguration;