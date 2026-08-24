// api/trains.js
import api from './axios';

const trainsApi = {
  // Get all trains
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/trains', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get single train with relationships
  getById: async (id) => {
    try {
      const response = await api.get(`/trains/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Create new train
  create: async (trainData) => {
    try {
      const response = await api.post('/trains', trainData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update train
  update: async (id, trainData) => {
    try {
      const response = await api.put(`/trains/${id}`, trainData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Delete train
  delete: async (id) => {
    try {
      const response = await api.delete(`/trains/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Get trains by route
  getByRoute: async (routeId, status = null) => {
    try {
      const params = {};
      if (status) params.status = status;
      const response = await api.get(`/trains/by-route/${routeId}`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Get train stops (schedule)
  getTrainStops: async (trainId) => {
    try {
      const response = await api.get(`/train-stops/train/${trainId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Create train stop
  createTrainStop: async (stopData) => {
    try {
      const response = await api.post('/train-stops', stopData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Update train stop
  updateTrainStop: async (stopId, stopData) => {
    try {
      const response = await api.put(`/train-stops/${stopId}`, stopData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Delete train stop
  deleteTrainStop: async (stopId) => {
    try {
      const response = await api.delete(`/train-stops/${stopId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Bulk create train stops
  bulkCreateTrainStops: async (trainId, stops) => {
    try {
      const response = await api.post(`/train-stops/bulk/${trainId}`, stops);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Calculate train schedule
  calculateSchedule: async (routeId, trainId, departureTime = null) => {
    try {
      const params = {};
      if (departureTime) params.departure_time = departureTime;
      const response = await api.post(
        `/routes/${routeId}/calculate-schedule/${trainId}`,
        null,
        { params }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // 🆕 Get train schedule
  getTrainSchedule: async (routeId, trainId) => {
    try {
      const response = await api.get(`/routes/${routeId}/schedule/${trainId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get all routes (for dropdown)
  getRoutes: async () => {
    try {
      const response = await api.get('/routes');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get coaches for a specific train
  getCoaches: async (trainId) => {
    try {
      const response = await api.get(`/coaches/train/${trainId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update coaches for a train
  updateCoaches: async (trainId, coachesData) => {
    try {
      const response = await api.post('/coaches/bulk-update', { train_id: trainId, coaches: coachesData });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default trainsApi;