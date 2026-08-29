// src/api/coaches.js
import api from './axios';

const coachesApi = {
  // Get all coaches
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/coaches/', { params });
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
      // Return empty data on 404 or any error
      if (error.response?.status === 404 || error.response?.status === 500) {
        return { coaches: [], total_coaches: 0, total_seats: 0 };
      }
      throw error.response?.data || { detail: error.message };
    }
  },

  // Create new coach
  create: async (coachData) => {
    try {
      const response = await api.post('/coaches/', coachData);
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
      // Send data in the exact format expected by the backend
      const response = await api.post('/coaches/bulk-update', {
        train_id: trainId,
        coaches: coaches.map(coach => ({
          train_id: trainId,
          coach_type: coach.coach_type,
          name: coach.name,
          rows: coach.rows,
          seats_per_row: coach.seats_per_row,
          total_seats: coach.total_seats,
          order_number: coach.order_number,
          is_active: coach.is_active !== undefined ? coach.is_active : true
        }))
      });
      return response.data;
    } catch (error) {
      // Handle validation errors
      if (error.response?.status === 422) {
        console.error('Validation error:', error.response.data);
        throw { detail: 'အချက်အလက် မှားယွင်းနေပါသည်' };
      }
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default coachesApi;