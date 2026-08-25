import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Trash2, GripVertical, Search, Loader, MapPin, 
  Train, Route, Clock, DollarSign, CheckCircle, AlertCircle,
  ArrowRight, Layers, Star, Info
} from 'lucide-react';
import Button from '@/components/ui/button';
import stationsApi from '@/api/stations';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Error extraction helper
const extractError = (error) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) {
    return error.map(e => {
      const field = e.loc?.join('.') || '';
      const msg = e.msg || '';
      return field ? `${field}: ${msg}` : msg;
    }).join('; ');
  }
  if (error.detail) {
    if (Array.isArray(error.detail)) return extractError(error.detail);
    if (typeof error.detail === 'string') return error.detail;
    return JSON.stringify(error.detail);
  }
  if (error.message) return error.message;
  return 'An error occurred';
};

// SortableStation Component
const SortableStation = ({
  station,
  index,
  totalStations,
  onRemove,
  onChange,
  onSearch,
  errors,
  stationDropdowns,
  getFilteredStations,
  handleStationSelect,
  stationSearchTerms,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `station-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isFirstStation = index === 0;
  const isLastStation = index === totalStations - 1;
  const isMiddleStation = !isFirstStation && !isLastStation;

  const getStationBadge = () => {
    if (isFirstStation) {
      return {
        label: 'စတင်ရာ',
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        icon: '🟢',
        border: 'border-emerald-200'
      };
    }
    if (isLastStation) {
      return {
        label: 'အဆုံးသတ်',
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: '🔴',
        border: 'border-red-200'
      };
    }
    return {
      label: 'ရပ်နားရာ',
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      icon: '🔵',
      border: 'border-blue-200'
    };
  };

  const badge = getStationBadge();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-xl border-2 p-4 transition-all duration-200 ${
        isDragging 
          ? 'border-blue-400 shadow-lg shadow-blue-100 scale-[1.02]' 
          : isFirstStation 
          ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/50' 
          : isLastStation 
          ? 'border-red-200 bg-red-50/30 hover:bg-red-50/50' 
          : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle & Index */}
        <div className="flex flex-col items-center pt-1">
          <div
            {...attributes}
            {...listeners}
            className={`cursor-grab active:cursor-grabbing p-1.5 rounded-lg transition-colors ${
              isDragging ? 'bg-blue-100' : 'hover:bg-gray-100'
            }`}
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          <span className="mt-1 text-xs font-bold text-gray-500 w-6 text-center">
            #{index + 1}
          </span>
        </div>

        <div className="flex-1 space-y-3">
          {/* Station Badge & Name Input */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text} border ${badge.border}`}>
              {badge.icon} {badge.label}
            </span>
            
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={isFirstStation ? "စတင်ရာ ဘူတာ ရှာပါ..." : isLastStation ? "အဆုံးသတ် ဘူတာ ရှာပါ..." : "ဘူတာအမည် ရှာပါ..."}
                value={station.station_name}
                onChange={(e) => {
                  onChange(index, 'station_name', e.target.value);
                  onSearch(index, e.target.value);
                }}
                onFocus={() => {
                  if (station.station_name) onSearch(index, station.station_name);
                }}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  errors?.stationDetails?.[index]?.station_name 
                    ? 'border-red-300 focus:ring-red-400' 
                    : 'border-gray-200 focus:border-blue-400'
                }`}
              />
              
              {stationDropdowns[index] && (
                <div className="absolute z-20 w-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {getFilteredStations(index).length > 0 ? (
                    getFilteredStations(index).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleStationSelect(index, s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">{s.name}</span>
                          {s.code && <span className="text-xs text-gray-500 font-mono">{s.code}</span>}
                        </div>
                        {s.city && <p className="text-xs text-gray-400 mt-0.5">{s.city}</p>}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      {stationSearchTerms[index]
                        ? 'ဘူတာ မတွေ့ပါ။ ဆက်ရိုက်ပြီး ကိုယ်တိုင်ထည့်ပါ။'
                        : 'ဘူတာ ရှာရန် စတင်ရိုက်ပါ...'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Station Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                ဘူတာကုဒ်
              </label>
              <input
                type="text"
                placeholder="ဥပမာ - YGN"
                value={station.station_code || ''}
                onChange={(e) => onChange(index, 'station_code', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                အကွာအဝေး (မိုင်)
              </label>
              <input
                type="number"
                placeholder="0.0"
                value={station.distance_from_origin || ''}
                onChange={(e) => onChange(index, 'distance_from_origin', parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Major Stop Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id={`major-stop-${index}`}
              checked={station.is_major_stop || false}
              onChange={(e) => onChange(index, 'is_major_stop', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 focus:ring-2 border-gray-300"
            />
            <label htmlFor={`major-stop-${index}`} className="text-sm text-gray-600 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              အဓိက ရပ်နားရာ
            </label>
          </div>

          {errors?.stationDetails?.[index]?.station_name && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.stationDetails[index].station_name}
            </p>
          )}
        </div>

        {/* Remove Button */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className={`p-2 rounded-xl transition-all duration-200 ${
            (isFirstStation || isLastStation) 
              ? 'text-gray-300 cursor-not-allowed' 
              : 'text-red-400 hover:bg-red-50 hover:text-red-600 hover:scale-110'
          }`}
          disabled={isFirstStation || isLastStation}
          title={isFirstStation ? 'စတင်ရာဘူတာကို မဖယ်ရှားနိုင်ပါ' : isLastStation ? 'အဆုံးသတ်ဘူတာကို မဖယ်ရှားနိုင်ပါ' : 'ဘူတာ ဖယ်ရှားရန်'}
        >
          <Trash2 className={`w-4 h-4 ${(isFirstStation || isLastStation) ? 'opacity-30' : ''}`} />
        </button>
      </div>
    </div>
  );
};

// Main RouteFormModal Component
const RouteFormModal = ({ isOpen, onClose, onSubmit, route }) => {
  const [formData, setFormData] = useState({
    name: '',
    origin: '',
    destination: '',
    distance: '',
    duration: '',
    base_price: '',
    status: 'ACTIVE',
    stations: [{
      station_id: null,
      station_name: '',
      station_code: '',
      order_number: 1,
      distance_from_origin: 0,
      is_major_stop: false,
    }],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [masterStations, setMasterStations] = useState([]);
  const [stationSearchTerms, setStationSearchTerms] = useState({});
  const [stationDropdowns, setStationDropdowns] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchMasterStations(); }, []);

  useEffect(() => {
    if (route) {
      setFormData({
        name: route.name || '',
        origin: route.origin || '',
        destination: route.destination || '',
        distance: route.distance || '',
        duration: route.duration || '',
        base_price: route.base_price || '',
        status: route.status || 'ACTIVE',
        stations: route.stations?.length > 0
          ? route.stations.map((s) => ({
              station_id: s.station_id || s.station?.id || null,
              station_name: s.station_name || s.station?.name || '',
              station_code: s.station_code || s.station?.code || '',
              order_number: s.order_number,
              distance_from_origin: s.distance_from_origin || 0,
              is_major_stop: s.is_major_stop || false,
            }))
          : [{
              station_id: null, station_name: '', station_code: '',
              order_number: 1, distance_from_origin: 0, is_major_stop: false,
            }],
      });
    } else {
      setFormData({
        name: '', origin: '', destination: '', distance: '', duration: '',
        base_price: '', status: 'ACTIVE',
        stations: [{
          station_id: null, station_name: '', station_code: '',
          order_number: 1, distance_from_origin: 0, is_major_stop: false,
        }],
      });
    }
    setErrors({});
    setStationSearchTerms({});
    setStationDropdowns({});
  }, [route, isOpen]);

  const fetchMasterStations = async () => {
    try {
      const response = await stationsApi.getAll({ limit: 200, is_active: true });
      setMasterStations(response.stations || []);
    } catch (err) {
      console.error('Error fetching stations:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleStationSearch = (index, searchTerm) => {
    setStationSearchTerms((prev) => ({ ...prev, [index]: searchTerm }));
    setStationDropdowns((prev) => ({ ...prev, [index]: searchTerm.length > 0 }));
  };

  const handleStationSelect = (index, station) => {
    const updatedStations = [...formData.stations];
    updatedStations[index] = {
      ...updatedStations[index],
      station_id: station.id,
      station_name: station.name,
      station_code: station.code || '',
      order_number: index + 1,
    };
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
    setStationSearchTerms((prev) => ({ ...prev, [index]: '' }));
    setStationDropdowns((prev) => ({ ...prev, [index]: false }));
  };

  const handleStationChange = (index, field, value) => {
    const updatedStations = [...formData.stations];
    updatedStations[index] = { ...updatedStations[index], [field]: value, order_number: index + 1 };
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const addStation = () => {
    setFormData((prev) => ({
      ...prev,
      stations: [
        ...prev.stations.slice(0, -1),
        { station_id: null, station_name: '', station_code: '', order_number: prev.stations.length,
          distance_from_origin: 0, is_major_stop: false },
        prev.stations[prev.stations.length - 1],
      ],
    }));
  };

  const removeStation = (index) => {
    if (index === 0 || index === formData.stations.length - 1) return;
    if (formData.stations.length <= 2) {
      setErrors((prev) => ({ ...prev, stations: 'အနည်းဆုံး ဘူတာ ၂ ခု လိုအပ်ပါသည်' }));
      return;
    }
    const updatedStations = formData.stations
      .filter((_, i) => i !== index)
      .map((station, i) => ({ ...station, order_number: i + 1 }));
    setFormData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const getFilteredStations = (index) => {
    const searchTerm = (stationSearchTerms[index] || '').toLowerCase();
    if (!searchTerm) return [];
    return masterStations
      .filter(s => s.name.toLowerCase().includes(searchTerm) ||
        (s.code && s.code.toLowerCase().includes(searchTerm)) ||
        (s.city && s.city.toLowerCase().includes(searchTerm)))
      .slice(0, 10);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = parseInt(active.id.split('-')[1]);
      const newIndex = parseInt(over.id.split('-')[1]);
      if (oldIndex === 0 || oldIndex === formData.stations.length - 1 ||
          newIndex === 0 || newIndex === formData.stations.length - 1) return;
      const newStations = arrayMove(formData.stations, oldIndex, newIndex);
      setFormData((prev) => ({
        ...prev,
        stations: newStations.map((station, i) => ({ ...station, order_number: i + 1 })),
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.origin.trim()) newErrors.origin = 'စတင်ရာမြို့ ထည့်သွင်းရန် လိုအပ်ပါသည်';
    if (!formData.destination.trim()) newErrors.destination = 'ဦးတည်ရာမြို့ ထည့်သွင်းရန် လိုအပ်ပါသည်';
    if (formData.origin.trim() && formData.destination.trim() &&
        formData.origin.trim().toLowerCase() === formData.destination.trim().toLowerCase()) {
      newErrors.destination = 'စတင်ရာနှင့် ဦးတည်ရာ မတူညီရပါ';
    }
    const stationErrors = [];
    formData.stations.forEach((station, index) => {
      if (!station.station_name.trim() && !station.station_id) {
        stationErrors[index] = { station_name: 'ဘူတာအမည် ထည့်သွင်းရန် လိုအပ်ပါသည်' };
      }
    });
    if (stationErrors.length > 0) newErrors.stationDetails = stationErrors;
    const stationIds = formData.stations.map((s) => s.station_id || s.station_name.toLowerCase()).filter(Boolean);
    if (new Set(stationIds).size !== stationIds.length) {
      newErrors.stations = 'ဘူတာတူများ ထည့်သွင်းခွင့်မရှိပါ';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const submitData = {
        name: formData.name || `${formData.origin} - ${formData.destination}`,
        origin: formData.origin,
        destination: formData.destination,
        distance: formData.distance ? parseFloat(formData.distance) : null,
        duration: formData.duration || null,
        base_price: formData.base_price ? parseFloat(formData.base_price) : null,
        status: formData.status,
        stations: formData.stations
          .filter((s) => s.station_name.trim() || s.station_id)
          .map((s) => ({
            station_id: s.station_id || null,
            station_name: s.station_name,
            station_code: s.station_code || null,
            order_number: s.order_number,
            distance_from_origin: s.distance_from_origin || 0,
            is_major_stop: s.is_major_stop || false,
          })),
      };
      await onSubmit(submitData);
      onClose();
    } catch (error) {
      const errorMsg = extractError(error) || 'An error occurred';
      setErrors({ submit: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200/50">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Route className="w-6 h-6 text-blue-600" />
              {route ? 'လမ်းကြောင်း ပြင်ဆင်ရန်' : 'လမ်းကြောင်းအသစ် ထည့်ရန်'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {route ? 'လမ်းကြောင်းအချက်အလက်များကို ပြင်ဆင်ပါ' : 'ခရီးစဉ်လမ်းကြောင်းအသစ် ဖန်တီးပါ'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:rotate-90"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error display */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{typeof errors.submit === 'string' ? errors.submit : extractError(errors.submit)}</p>
                <p className="text-xs text-red-600 mt-0.5">ကျေးဇူးပြု၍ ပြန်လည်ကြိုးစားပါ</p>
              </div>
            </div>
          )}

          {/* Basic Info */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  စတင်ရာမြို့ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" name="origin" value={formData.origin} onChange={handleChange}
                  placeholder="ဥပမာ - ရန်ကုန်"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                    errors.origin ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
                {errors.origin && <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.origin}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  ဦးတည်ရာမြို့ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" name="destination" value={formData.destination} onChange={handleChange}
                  placeholder="ဥပမာ - မန္တလေး"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                    errors.destination ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
                {errors.destination && <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.destination}</p>}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                လမ်းကြောင်းအမည်
              </label>
              <input
                type="text" name="name" value={formData.name} onChange={handleChange}
                placeholder="ဥပမာ - ရန်ကုန်-မန္တလေး အမြန်ရထား"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              />
              <p className="mt-1 text-xs text-gray-400">လွတ်ထားပါက စတင်ရာနှင့် ဦးတည်ရာမှ အလိုအလျောက် ဖန်တီးပေးမည်</p>
            </div>
          </div>

          {/* Route Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-500" />
                အကွာအဝေး (မိုင်)
              </label>
              <input type="number" name="distance" value={formData.distance} onChange={handleChange}
                placeholder="620" step="0.1" min="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                ကြာချိန်
              </label>
              <input type="text" name="duration" value={formData.duration} onChange={handleChange}
                placeholder="ဥပမာ - ၈ နာရီ"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-blue-500" />
                အခြေခံခရီးစဉ်စရိတ် (ကျပ်)
              </label>
              <input type="number" name="base_price" value={formData.base_price} onChange={handleChange}
                placeholder="15000" step="100" min="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white" />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">အခြေအနေ</label>
            <select name="status" value={formData.status} onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white">
              <option value="ACTIVE">🟢 အသက်ဝင်</option>
              <option value="INACTIVE">🔴 မသက်ဝင်</option>
            </select>
          </div>

          {/* Stations */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-lg font-semibold text-gray-900">
                  ဘူတာများ <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-500">
                  ရထားတစ်စီးချင်းအလိုက် အချိန်ဇယား သတ်မှတ်နိုင်သည်
                </p>
              </div>
              <Button type="button" onClick={addStation}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 shadow-md shadow-emerald-200">
                <Plus className="w-4 h-4 mr-1.5" />
                ရပ်နားရာ ထည့်မည်
              </Button>
            </div>

            <div className="text-xs text-gray-400 mb-3 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <GripVertical className="w-3 h-3" />
              ဆွဲယူ၍ ဘူတာများကို ပြန်လည်စီစဉ်နိုင်သည်။ စတင်ရာနှင့် အဆုံးသတ်ဘူတာများကို ရွှေ့၍မရပါ။
            </div>

            {errors.stations && (
              <p className="mb-3 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.stations}
              </p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={formData.stations.map((_, index) => `station-${index}`)}
                strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {formData.stations.map((station, index) => (
                    <SortableStation
                      key={`station-${index}`} station={station} index={index}
                      totalStations={formData.stations.length} onRemove={removeStation}
                      onChange={handleStationChange} onSearch={handleStationSearch}
                      errors={errors} stationDropdowns={stationDropdowns}
                      getFilteredStations={getFilteredStations}
                      handleStationSelect={handleStationSelect}
                      stationSearchTerms={stationSearchTerms}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-700 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                စတင်ရာနှင့် အဆုံးသတ်ဘူတာများအပြင် ကြားခံဘူတာများကို ထည့်သွင်းနိုင်သည်။
                အဓိကရပ်နားရာများကို အမှန်ခြစ်ပေးပါ။
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
            <Button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium">
              မလုပ်တော့ပါ
            </Button>
            <Button type="submit" disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-medium shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  သိမ်းဆည်းနေသည်...
                </span>
              ) : route ? (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  လမ်းကြောင်း ပြင်ဆင်မည်
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" />
                  လမ်းကြောင်းအသစ် ဖန်တီးမည်
                </span>
              )}
            </Button>
          </div>
        </form>
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

export default RouteFormModal;