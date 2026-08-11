// services/locationTrackingService.js
import api from '../api/axios';

const LocationTrackingService = {
  // Update device location
  updateLocation: async (deviceId, latitude, longitude, speed = null, accuracy = null) => {
    try {
      const response = await api.post('/tracking/update-location', {
        device_id: deviceId,
        latitude,
        longitude,
        speed,
        accuracy
      });
      return response.data;
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  },

  // Log departure from station
  logDeparture: async (deviceId, trainStopId) => {
    try {
      const response = await api.post(`/tracking/log-departure/${deviceId}/${trainStopId}`);
      return response.data;
    } catch (error) {
      console.error('Error logging departure:', error);
      throw error;
    }
  },

  // Get device status
  getDeviceStatus: async (deviceId) => {
    try {
      const response = await api.get(`/tracking/device-status/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting device status:', error);
      throw error;
    }
  },

  // Get train stops for a train
  getTrainStops: async (trainId) => {
    try {
      const response = await api.get(`/train-stops/train/${trainId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting train stops:', error);
      throw error;
    }
  },

  // Get route stations
  getRouteStations: async (routeId) => {
    try {
      const response = await api.get(`/routes/${routeId}/stations`);
      return response.data;
    } catch (error) {
      console.error('Error getting route stations:', error);
      throw error;
    }
  }
};

export default LocationTrackingService;