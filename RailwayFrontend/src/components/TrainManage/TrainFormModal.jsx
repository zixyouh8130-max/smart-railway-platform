// src/components/TrainManage/TrainFormModal.jsx
import React, { useState, useEffect } from 'react';
import { 
  X, Loader, Train, Hash, Tag, Route, Gauge, 
  Activity, CheckCircle, AlertCircle, ArrowRight, Plus
} from 'lucide-react';
import Button from '@/components/ui/button';

const TrainFormModal = ({ isOpen, onClose, onSubmit, train, routes }) => {
  const [formData, setFormData] = useState({
    train_no: '',
    train_name: '',
    train_type: '',
    route_id: '',
    speed: '',
    status: 'ACTIVE',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (train) {
      setFormData({
        train_no: train.train_no || '',
        train_name: train.train_name || '',
        train_type: train.train_type || '',
        route_id: train.route_id || '',
        speed: train.speed || '',
        status: train.status || 'ACTIVE',
      });
    } else {
      setFormData({
        train_no: '',
        train_name: '',
        train_type: '',
        route_id: '',
        speed: '',
        status: 'ACTIVE',
      });
    }
    setErrors({});
  }, [train, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'speed') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : '' }));
    } else if (name === 'route_id') {
      setFormData(prev => ({ ...prev, [name]: value ? parseInt(value) : '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.train_no.trim()) {
      newErrors.train_no = 'ရထားနံပါတ် ထည့်သွင်းရန် လိုအပ်ပါသည်';
    }
    if (!formData.train_name.trim()) {
      newErrors.train_name = 'ရထားအမည် ထည့်သွင်းရန် လိုအပ်ပါသည်';
    }
    if (!formData.route_id) {
      newErrors.route_id = 'လမ်းကြောင်း ရွေးချယ်ရန် လိုအပ်ပါသည်';
    }
    if (formData.speed && (isNaN(formData.speed) || formData.speed <= 0)) {
      newErrors.speed = 'အမြန်နှုန်းသည် အကောင်းကိန်း ဖြစ်ရပါမည်';
    }
    if (formData.speed && formData.speed > 500) {
      newErrors.speed = 'အမြန်နှုန်းသည် ၅၀၀ ထက် မပိုရပါ';
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
        ...formData,
        route_id: parseInt(formData.route_id),
        speed: formData.speed ? parseFloat(formData.speed) : null,
      };

      await onSubmit(submitData);
      onClose();
    } catch (error) {
      setErrors({ submit: error.detail || error.message || 'အမှားတစ်ခု ဖြစ်ပွားခဲ့သည်' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      'ACTIVE': 'သွားလာနေ',
      'INACTIVE': 'ရပ်နား',
      'MAINTENANCE': 'ပြင်ဆင်နေ'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'ACTIVE': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'INACTIVE': 'bg-gray-100 text-gray-700 border-gray-200',
      'MAINTENANCE': 'bg-amber-100 text-amber-700 border-amber-200'
    };
    return colors[status] || colors['INACTIVE'];
  };

  const selectedRoute = routes?.find(r => r.id === parseInt(formData.route_id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200/50">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Train className="w-6 h-6 text-blue-600" />
              {train ? 'ရထား ပြင်ဆင်ရန်' : 'ရထားအသစ် ထည့်ရန်'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {train ? 'ရထားအချက်အလက်များကို ပြင်ဆင်ပါ' : 'ရထားအသစ်၏ အချက်အလက်များကို ဖြည့်သွင်းပါ'}
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
          {/* Error Message */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {typeof errors.submit === 'string' ? errors.submit : JSON.stringify(errors.submit)}
                </p>
                <p className="text-xs text-red-600 mt-0.5">ကျေးဇူးပြု၍ ပြန်လည်ကြိုးစားပါ</p>
              </div>
            </div>
          )}

          {/* Basic Info - Gradient Section */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Train Number */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-blue-500" />
                  ရထားနံပါတ် <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="train_no"
                  value={formData.train_no}
                  onChange={handleChange}
                  placeholder="ဥပမာ - EX-001"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                    errors.train_no ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
                {errors.train_no && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.train_no}
                  </p>
                )}
              </div>

              {/* Train Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-500" />
                  ရထားအမည် <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="train_name"
                  value={formData.train_name}
                  onChange={handleChange}
                  placeholder="ဥပမာ - ရန်ကုန်-မန္တလေး အမြန်ရထား"
                  className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                    errors.train_name ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
                  }`}
                />
                {errors.train_name && (
                  <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.train_name}
                  </p>
                )}
              </div>
            </div>

            {/* Train Type */}
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Train className="w-4 h-4 text-blue-500" />
                ရထားအမျိုးအစား
              </label>
              <select
                name="train_type"
                value={formData.train_type}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">အမျိုးအစား ရွေးပါ</option>
                <option value="EXPRESS">DEMU ရထား</option>
                <option value="LOCAL">အမြန်ရထား</option>
                <option value="MAIL">စာပို့ရထား</option>
                <option value="SPECIAL">အထူးရထား</option>
                <option value="LOAD">ကုန်ပစ္စည်းတင်</option>
              </select>
            </div>
          </div>

          {/* Route Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Route className="w-4 h-4 text-blue-500" />
              လမ်းကြောင်း <span className="text-red-500">*</span>
            </label>
            <select
              name="route_id"
              value={formData.route_id}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                errors.route_id ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
              }`}
            >
              <option value="">လမ်းကြောင်း ရွေးပါ</option>
              {routes?.map(route => (
                <option key={route.id} value={route.id}>
                  {route.name || `${route.origin} → ${route.destination}`}
                  {route.distance ? ` (${route.distance} မိုင်)` : ''}
                </option>
              ))}
            </select>
            {errors.route_id && (
              <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.route_id}
              </p>
            )}
            {selectedRoute && (
              <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                {selectedRoute.origin} → {selectedRoute.destination}
                {selectedRoute.distance && ` · ${selectedRoute.distance} မိုင်`}
              </p>
            )}
          </div>

          {/* Train Details - 2 Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Speed */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-blue-500" />
                အမြန်နှုန်း (မိုင်/နာရီ)
              </label>
              <input
                type="number"
                name="speed"
                value={formData.speed}
                onChange={handleChange}
                placeholder="ဥပမာ - 80"
                min="1"
                max="500"
                step="1"
                className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white ${
                  errors.speed ? 'border-red-300 focus:ring-red-400' : 'border-gray-200'
                }`}
              />
              {errors.speed && (
                <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.speed}
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-500" />
                အခြေအနေ
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="ACTIVE">သွားလာနေ</option>
                <option value="INACTIVE">ရပ်နား</option>
                <option value="MAINTENANCE">ပြင်ဆင်နေ</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium transition-all"
            >
              မလုပ်တော့ပါ
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-medium shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  သိမ်းဆည်းနေသည်...
                </span>
              ) : train ? (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  ရထား ပြင်ဆင်မည်
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" />
                  ရထားအသစ် ဖန်တီးမည်
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainFormModal;