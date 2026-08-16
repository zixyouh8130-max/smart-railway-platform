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

  // Get single schedule
  getById: async (id) => {
    try {
      console.log('📅 Fetching schedule:', id);
      const response = await api.get(`/schedules/${id}`);
      console.log('✅ Schedule response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching schedule:', error);
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get route stops for a schedule (with status and coordinates)
  getRouteStops: async (scheduleId) => {
    try {
      console.log('🛤️ Fetching route stops for schedule:', scheduleId);
      const response = await api.get(`/schedules/${scheduleId}/route-stops`);
      console.log('✅ Route stops response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching route stops:', error);
      console.error('Error details:', error.response?.data);
      throw error.response?.data || { detail: error.message };
    }
  },

  // Other methods...
  search: async (params) => {
    try {
      const response = await api.get('/schedules/search', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  create: async (scheduleData) => {
    try {
      const response = await api.post('/schedules/', scheduleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  update: async (id, scheduleData) => {
    try {
      const response = await api.put(`/schedules/${id}`, scheduleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/schedules/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  getTrains: async () => {
    try {
      const response = await api.get('/trains/');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  updateStatus: async (id, status) => {
    try {
      const response = await api.patch(`/schedules/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  bulkCreate: async (schedulesData) => {
    try {
      const response = await api.post('/schedules/bulk', schedulesData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

    getStaffWeeklySchedules: async (staffId) => {
    try {
      const response = await api.get(`/staff/${staffId}/weekly-schedules`);
      return response.data;
    } catch (error) {
      console.error('Error fetching weekly schedules:', error);
      throw error.response?.data || { detail: error.message };
    }
  },

  getStaffScheduleHistory: async (staffId, limit = 10) => {
    try {
      const response = await api.get(`/staff/${staffId}/schedule-history`, {
        params: { limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching schedule history:', error);
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default schedulesApi;