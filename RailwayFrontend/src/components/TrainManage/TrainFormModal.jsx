// src/components/TrainManage/TrainFormModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Loader } from 'lucide-react';
import Button from '@/components/ui/Button';

const TrainFormModal = ({ isOpen, onClose, onSubmit, train, routes }) => {
  const [formData, setFormData] = useState({
    train_no: '',
    train_name: '',
    train_type: '',
    route_id: '',
    total_coaches: 0,
    capacity: 0,
    speed: '',  // 🆕 Speed field
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
        total_coaches: train.total_coaches || 0,
        capacity: train.capacity || 0,
        speed: train.speed || '',  // 🆕
        status: train.status || 'ACTIVE',
      });
    } else {
      setFormData({
        train_no: '',
        train_name: '',
        train_type: '',
        route_id: '',
        total_coaches: 0,
        capacity: 0,
        speed: '',  // 🆕
        status: 'ACTIVE',
      });
    }
    setErrors({});
  }, [train, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Handle numeric fields
    if (name === 'total_coaches' || name === 'capacity') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else if (name === 'speed') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : '' }));
    } else if (name === 'route_id') {
      setFormData(prev => ({ ...prev, [name]: value ? parseInt(value) : '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.train_no.trim()) {
      newErrors.train_no = 'Train number is required';
    }
    if (!formData.train_name.trim()) {
      newErrors.train_name = 'Train name is required';
    }
    if (!formData.route_id) {
      newErrors.route_id = 'Route is required';
    }
    if (formData.speed && (isNaN(formData.speed) || formData.speed <= 0)) {
      newErrors.speed = 'Speed must be a positive number';
    }
    if (formData.speed && formData.speed > 500) {
      newErrors.speed = 'Speed cannot exceed 500 km/h';
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
        total_coaches: parseInt(formData.total_coaches) || 0,
        capacity: parseInt(formData.capacity) || 0,
        speed: formData.speed ? parseFloat(formData.speed) : null,  // 🆕
      };

      await onSubmit(submitData);
      onClose();
    } catch (error) {
      setErrors({ submit: error.detail || error.message || 'An error occurred' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-200 rounded-t-2xl z-10">
          <h2 className="text-xl font-bold text-gray-900">
            {train ? 'Edit Train' : 'Add New Train'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {typeof errors.submit === 'string' ? errors.submit : JSON.stringify(errors.submit)}
            </div>
          )}

          {/* Train Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Train Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="train_no"
              value={formData.train_no}
              onChange={handleChange}
              placeholder="e.g., EX-001"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.train_no ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.train_no && (
              <p className="mt-1 text-sm text-red-600">{errors.train_no}</p>
            )}
          </div>

          {/* Train Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Train Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="train_name"
              value={formData.train_name}
              onChange={handleChange}
              placeholder="e.g., Yangon - Mandalay Express"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.train_name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.train_name && (
              <p className="mt-1 text-sm text-red-600">{errors.train_name}</p>
            )}
          </div>

          {/* Train Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Train Type
            </label>
            <select
            name="train_type"
            value={formData.train_type}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">အမျိုးအစား ရွေးပါ</option>
            <option value="EXPRESS">DEMUရထား</option>
            <option value="LOCAL">အမြန်ရထား</option>
            <option value="MAIL">စာပို့ရထား</option>
            <option value="SPECIAL">အထူးရထား</option>
            <option value="CARGO">ကုန်စည်ရထား</option>
          </select>
          </div>

          {/* Route Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Route <span className="text-red-500">*</span>
            </label>
            <select
              name="route_id"
              value={formData.route_id}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.route_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select Route</option>
              {routes.map(route => (
                <option key={route.id} value={route.id}>
                  {route.name || `${route.origin} - ${route.destination}`}
                  {route.distance ? ` (${route.distance} km)` : ''}
                </option>
              ))}
            </select>
            {errors.route_id && (
              <p className="mt-1 text-sm text-red-600">{errors.route_id}</p>
            )}
          </div>

          {/* Train Details - 2 Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 🆕 Speed (km/h) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Speed (km/h)
              </label>
              <input
                type="number"
                name="speed"
                value={formData.speed}
                onChange={handleChange}
                placeholder="e.g., 80"
                min="1"
                max="500"
                step="1"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.speed ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.speed && (
                <p className="mt-1 text-sm text-red-600">{errors.speed}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Average speed in km/h (optional)
              </p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ACTIVE">သွားလာနေ</option>
                <option value="INACTIVE">ရပ်နား</option>
                <option value="MAINTENANCE">ပြင်ဆင်နေ</option>
              </select>
            </div>
          </div>

          {/* Preview Info */}
          {formData.train_no && formData.train_name && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Preview</h3>
              <div className="space-y-1 text-sm text-blue-700">
                <p>Train: {formData.train_no} - {formData.train_name}</p>
                {formData.train_type && <p>Type: {formData.train_type}</p>}
                {formData.speed && (
                  <p>
                    Speed: {formData.speed} km/h
                    {routes.find(r => r.id === formData.route_id)?.distance && (
                      <span className="text-blue-500 ml-1">
                        (Est. travel time: {Math.round(routes.find(r => r.id === formData.route_id).distance / formData.speed)}h {Math.round((routes.find(r => r.id === formData.route_id).distance / formData.speed * 60) % 60)}m)
                      </span>
                    )}
                  </p>
                )}
                {formData.total_coaches > 0 && <p>Coaches: {formData.total_coaches}</p>}
                {formData.capacity > 0 && <p>Capacity: {formData.capacity} seats</p>}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : train ? (
                'Update Train'
              ) : (
                'Create Train'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainFormModal;