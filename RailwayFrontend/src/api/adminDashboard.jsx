// api/adminDashboard.js
import api from './axios';

const adminDashboardApi = {
  // Get all active trains with device locations
  getActiveTrains: async () => {
    try {
      const response = await api.get('/routes-and-stations/active-trains');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get all stations
  getAllStations: async () => {
    try {
      const response = await api.get('/routes-and-stations/all-stations');
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default adminDashboardApi;