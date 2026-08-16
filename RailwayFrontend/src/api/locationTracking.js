// api/locationTracking.js
import api from './axios';

const locationTrackingApi = {
  // Update device location
  updateLocation: async (locationData) => {
    try {
      console.log('📍 Sending location update:', locationData);
      const response = await api.post('/tracking/update-location', locationData);
      console.log('✅ Location update response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Location update error:', error);
      console.error('Error details:', error.response?.data);
      throw error.response?.data || { detail: error.message };
    }
  },

  // Log departure from station
  logDeparture: async (deviceId, trainStopId, departureData = {}) => {
    try {
      console.log('🚂 Logging departure:', { deviceId, trainStopId, departureData });
      const response = await api.post(
        `/tracking/log-departure/${deviceId}/${trainStopId}`,
        departureData
      );
      console.log('✅ Departure log response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Departure log error:', error);
      console.error('Error details:', error.response?.data);
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get device status
  getDeviceStatus: async (deviceId) => {
    try {
      const response = await api.get(`/tracking/device-status/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting device status:', error);
      throw error.response?.data || { detail: error.message };
    }
  }
};

export default locationTrackingApi;