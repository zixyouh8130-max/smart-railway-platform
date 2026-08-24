// api/routes.js
import api from './axios';  // Use your existing axios instance

const routesApi = {
  // Get all routes
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/routes', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Get single route
  getById: async (id) => {
    try {
      const response = await api.get(`/routes/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Create new route
  create: async (routeData) => {
    try {
      const response = await api.post('/routes', routeData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },


  // Update route
  update: async (id, routeData) => {
    try {
      console.log('API Update - ID:', id);
      console.log('API Update - Data:', routeData);
      const response = await api.put(`/routes/${id}`, routeData);  // 🔧 Fixed: /routes not /schedules
      return response.data;
    } catch (error) {
      console.error('API Update - Error:', error);
      console.error('API Update - Error Response:', error.response?.data);
      throw error.response?.data || error;
    }
  },

  // Delete route
  delete: async (id) => {
    try {
      const response = await api.delete(`/routes/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { detail: error.message };
    }
  },

  // Update route stations
  updateRouteStations: async (routeId, stations) => {
    try {
      const response = await api.put(`/routes/${routeId}/stations`, stations);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
  

  // The backend exposes GET /routes but no dedicated /routes/search route.
  search: async (query) => {
    const response = await routesApi.getAll();
    const routes = response?.routes || [];
    const term = String(query || '').trim().toLowerCase();

    if (!term) return response;

    return {
      ...response,
      routes: routes.filter((route) =>
        [route.name, route.origin, route.destination]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(term)
          )
      ),
    };
  }
};

export default routesApi;