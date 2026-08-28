// api/locationTracking.js
import api from './axios';

const unwrapError = error => {
  const data = error.response?.data;
  if (data) return data;
  return { detail: error.message || 'Request failed' };
};

const locationTrackingApi = {
  // Send one live GPS fix. Backend performs automatic station proximity logic.
  updateLocation: async locationData => {
    try {
      console.log('📍 Sending location update:', locationData);
      const response = await api.post('/tracking/update-location', locationData);
      console.log('✅ Location update response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Location update error:', error.response?.data || error.message);
      throw unwrapError(error);
    }
  },

  // Optional fallback: backend allows arrival only at the next expected station.
  manualArrival: async (deviceId, arrivalData) => {
    try {
      const response = await api.post(
        `/tracking/manual-arrival/${deviceId}`,
        arrivalData,
      );
      return response.data;
    } catch (error) {
      console.error('❌ Manual arrival error:', error.response?.data || error.message);
      throw unwrapError(error);
    }
  },

  // Optional fallback: backend permits departure only from the current ARRIVED stop.
  logDeparture: async (deviceId, trainStopId, departureData = {}) => {
    try {
      console.log('🚂 Logging departure:', { deviceId, trainStopId, departureData });
      const response = await api.post(
        `/tracking/log-departure/${deviceId}/${trainStopId}`,
        departureData,
      );
      console.log('✅ Departure log response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Departure log error:', error.response?.data || error.message);
      throw unwrapError(error);
    }
  },

  getDeviceStatus: async deviceId => {
    try {
      const response = await api.get(`/tracking/device-status/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting device status:', error.response?.data || error.message);
      throw unwrapError(error);
    }
  },
};

export default locationTrackingApi;
