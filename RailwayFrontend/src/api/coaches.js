// src/api/coaches.js
import api from './axios';

const coachesApi = {
  // Get all coaches
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/coaches', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get single coach
  getById: async (id) => {
    try {
      const response = await api.get(`/coaches/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get coaches for a specific train
  getByTrainId: async (trainId) => {
    try {
      const response = await api.get(`/coaches/train/${trainId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Create new coach
  create: async (coachData) => {
    try {
      const response = await api.post('/coaches', coachData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update coach
  update: async (id, coachData) => {
    try {
      const response = await api.put(`/coaches/${id}`, coachData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Delete coach
  delete: async (id) => {
    try {
      const response = await api.delete(`/coaches/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Bulk update coaches for a train
  bulkUpdate: async (trainId, coaches) => {
    try {
      const response = await api.put(`/coaches/train/${trainId}/bulk`, coaches);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default coachesApi;