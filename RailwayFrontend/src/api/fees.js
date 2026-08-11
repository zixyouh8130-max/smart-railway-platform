// api/fees.js
import api from './axios';

const feesApi = {
  /**
   * Calculate fee between two stations for a specific train
   * @param {Object} data - Fee calculation request
   * @param {number} data.train_id - Train ID
   * @param {number} data.from_station_id - Departure station ID
   * @param {number} data.to_station_id - Arrival station ID
   * @param {string} data.class_type - Train class type (ORDINARY, UPPER, SLEEPER)
   * @param {string} data.seat_type - Seat type (optional)
   * @returns {Promise} Fee calculation result
   */
  calculateFee: async (data) => {
    try {
      const response = await api.post('/fees/calculate', {
        train_id: data.train_id,
        from_station_id: data.from_station_id,
        to_station_id: data.to_station_id,
        class_type: data.class_type || 'ORDINARY',
        seat_type: data.seat_type || null
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Get complete price matrix for a specific train
   * @param {number} trainId - Train ID
   * @param {string} classType - Train class type
   * @returns {Promise} Price matrix data with stations and prices
   */
  getPriceMatrix: async (trainId, classType = 'ORDINARY') => {
    try {
      const response = await api.get(`/fees/price-matrix/${trainId}`, {
        params: { class_type: classType }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Auto-generate fee rules for all station pairs for a train
   * @param {number} trainId - Train ID
   * @returns {Promise} Generation result with count of created rules
   */
  generateFeeRules: async (trainId) => {
    try {
      const response = await api.post(`/fees/generate-rules/${trainId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get all available train classes with their multipliers
   * @returns {Promise} List of train classes
   */
  getTrainClasses: async () => {
    try {
      const response = await api.get('/train-classes/');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Get fee rules for a specific train
   * @param {number} trainId - Train ID
   * @param {Object} filters - Optional filters (class_type, is_active)
   * @returns {Promise} List of fee rules
   */
  getFeeRules: async (trainId, filters = {}) => {
    try {
      const response = await api.get(`/fees/rules/train/${trainId}`, {
        params: filters
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { rules: [], total: 0 };
      }
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Create a new fee rule for a train
   * @param {Object} ruleData - Fee rule data
   * @param {number} ruleData.train_id - Train ID
   * @param {number} ruleData.route_id - Route ID
   * @param {number} ruleData.from_station_id - From station ID
   * @param {number} ruleData.to_station_id - To station ID
   * @param {number} ruleData.base_fare - Base fare amount
   * @param {number} ruleData.per_km_rate - Per kilometer rate (default 0)
   * @param {string} ruleData.class_type - Train class type
   * @param {string} ruleData.seat_type - Seat type (optional)
   * @param {number} ruleData.calculated_distance - Calculated distance (optional)
   * @param {number} ruleData.surcharge_percentage - Surcharge percentage (default 0)
   * @returns {Promise} Created fee rule
   */
  saveFeeRule: async (ruleData) => {
    try {
      const response = await api.post('/fees/rules', {
        train_id: ruleData.train_id,
        route_id: ruleData.route_id,
        from_station_id: ruleData.from_station_id,
        to_station_id: ruleData.to_station_id,
        base_fare: ruleData.base_fare,
        per_km_rate: ruleData.per_km_rate || 0,
        class_type: ruleData.class_type || 'ORDINARY',
        seat_type: ruleData.seat_type || null,
        calculated_distance: ruleData.calculated_distance || null,
        surcharge_percentage: ruleData.surcharge_percentage || 0,
        is_active: ruleData.is_active !== false
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Update an existing fee rule
   * @param {number} ruleId - Fee rule ID
   * @param {Object} ruleData - Updated fee rule data
   * @returns {Promise} Updated fee rule
   */
  updateFeeRule: async (ruleId, ruleData) => {
    try {
      const response = await api.put(`/fees/rules/${ruleId}`, ruleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Delete a fee rule
   * @param {number} ruleId - Fee rule ID
   * @returns {Promise} Deletion confirmation
   */
  deleteFeeRule: async (ruleId) => {
    try {
      const response = await api.delete(`/fees/rules/${ruleId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * 🆕 Bulk update fee rules for a train
   * @param {number} trainId - Train ID
   * @param {Object} data - Object with rules array
   * @param {Array} data.rules - Array of fee rule objects
   * @returns {Promise} Bulk update result
   */
  bulkUpdateFeeRules: async (trainId, data) => {
    try {
      // Try sending as array directly
      const response = await api.put(`/fees/rules/bulk/${trainId}`, data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // ===== LEGACY METHODS (for backward compatibility) =====
  // These methods keep the old API but internally adapt to new structure

  /**
   * @deprecated Use getFeeRules with trainId instead
   * Get fee rules for a specific route (legacy)
   */
  getRouteFeeRules: async (routeId, filters = {}) => {
    console.warn('getRouteFeeRules is deprecated. Use getFeeRules with trainId.');
    try {
      const response = await api.get(`/fees/rules/${routeId}`, {
        params: filters
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error.response?.data || error;
    }
  },

  /**
   * @deprecated Use generateFeeRules with trainId instead
   */
  generateRouteFeeRules: async (routeId) => {
    console.warn('generateRouteFeeRules is deprecated. Use generateFeeRules with trainId.');
    try {
      const response = await api.post(`/fees/generate-rules/${routeId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * @deprecated Use getPriceMatrix with trainId instead
   */
  getRoutePriceMatrix: async (routeId, classCode = 'ORDINARY') => {
    console.warn('getRoutePriceMatrix is deprecated. Use getPriceMatrix with trainId.');
    try {
      const response = await api.get(`/fees/price-matrix/${routeId}`, {
        params: { class_code: classCode }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Calculate distance between two coordinates
   * @param {number} lat1 - From latitude
   * @param {number} lon1 - From longitude
   * @param {number} lat2 - To latitude
   * @param {number} lon2 - To longitude
   * @returns {Promise} Distance in kilometers
   */
  calculateDistance: async (lat1, lon1, lat2, lon2) => {
    try {
      const response = await api.post('/fees/calculate-distance', {
        from_latitude: lat1,
        from_longitude: lon1,
        to_latitude: lat2,
        to_longitude: lon2
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export default feesApi;