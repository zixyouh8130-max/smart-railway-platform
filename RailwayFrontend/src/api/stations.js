import api from './axios';

const stationsApi = {
  /**
   * Get all stations with optional filters
   */
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/stations/', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Search stations for autocomplete
   */
  search: async (query, limit = 20) => {
    try {
      const response = await api.get('/stations/search', {
        params: { q: query, limit }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get a single station by ID
   */
  getById: async (id) => {
    try {
      const response = await api.get(`/stations/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

    /**
     * Get a station by its code
     */
    getByCode: async (code) => {
      try {
        const response = await api.get(`/stations/by-code/${code}`);
        return response.data;
      } catch (error) {
        throw error.response?.data || error;
      }
    },
    /**
     * Get stations connected to a given station via routes
     */
    getConnectedStations: async (stationId) => {
      try {
        console.log('Calling getConnectedStations for stationId:', stationId);
        const response = await api.get(`/stations/by-route/${stationId}`);
        console.log('getConnectedStations raw response:', response);
        console.log('getConnectedStations data:', response.data);

        // The endpoint returns List[StationResponse], so response.data should be an array
        return response.data;
      } catch (error) {
        console.error('Error in getConnectedStations:', error);
        throw error.response?.data || error;
      }
    },
    /**
     * Get a station with its route information
     */
    getWithRoutes: async (stationId) => {
      try {
        console.log('Calling getWithRoutes for stationId:', stationId);
        const response = await api.get(`/stations/${stationId}/with-routes`);
        console.log('getWithRoutes response:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error in getWithRoutes:', error);
        throw error.response?.data || error;
      }
    },
  /**
   * Create a new station
   */
  create: async (stationData) => {
    try {
      const response = await api.post('/stations/', stationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Update an existing station
   */
  update: async (id, stationData) => {
    try {
      const response = await api.put(`/stations/${id}`, stationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Delete a station
   */
  delete: async (id, force = false) => {
    try {
      const response = await api.delete(`/stations/${id}`, {
        params: { force }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Bulk create stations
   */
  bulkCreate: async (stations) => {
    try {
      const response = await api.post('/stations/bulk', stations);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Find nearby stations
   */
  findNearby: async (latitude, longitude, radiusKm = 50) => {
    try {
      const response = await api.get('/stations/nearby/coordinates', {
        params: { latitude, longitude, radius_km: radiusKm }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};

export default stationsApi;