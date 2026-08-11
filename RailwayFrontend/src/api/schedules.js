// api/schedules.js
import api from './axios';

const schedulesApi = {
  // Get all schedules
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/schedules/', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Search schedules between stations
  search: async (params) => {
    try {
      console.log('Searching schedules with params:', params);
      const response = await api.get('/schedules/search', { params });
      console.log('Search response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Schedule search error:', error);
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get single schedule
  getById: async (id) => {
    try {
      const response = await api.get(`/schedules/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Create new schedule
  create: async (scheduleData) => {
    try {
      const response = await api.post('/schedules/', scheduleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update schedule
  update: async (id, scheduleData) => {
    try {
      console.log('API Update - ID:', id);
      console.log('API Update - Data:', scheduleData);
      const response = await api.put(`/schedules/${id}`, scheduleData);
      console.log('API Update - Response:', response.data);
      return response.data;
    } catch (error) {
      console.error('API Update - Error:', error);
      console.error('API Update - Error Response:', error.response?.data);
      throw error.response?.data || { detail: error.message };
    }
  },

    // Delete schedule
    delete: async (id) => {
      try {
        const response = await api.delete(`/schedules/${id}`);
        return response.data;
      } catch (error) {
        throw error.response?.data || { detail: error.message };
      }
    },

  // Get all trains (for dropdown selection)
  getTrains: async () => {
    try {
      const response = await api.get('/trains/');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update schedule status only
  updateStatus: async (id, status) => {
    try {
      const response = await api.patch(`/schedules/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Bulk create schedules
  bulkCreate: async (schedulesData) => {
    try {
      const response = await api.post('/schedules/bulk', schedulesData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default schedulesApi;