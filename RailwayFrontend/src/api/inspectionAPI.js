// api/inspectionApi.js
import api from './axios';

export const inspectionApi = {
  // Get all inspections with pagination
  getInspections: async (limit = 20, skip = 0) => {
    const response = await api.get('/inspection/inspections', {
      params: { limit, skip }
    });
    return response.data;
  },

  // Get detailed inspection with events
  getInspectionDetail: async (inspectionId) => {
    const response = await api.get(`/inspection/inspections/${inspectionId}`);
    return response.data;
  },

  // Get events for a specific inspection
  getInspectionEvents: async (inspectionId, defectType = null) => {
    const params = defectType ? { defect_type: defectType } : {};
    const response = await api.get(`/inspection/inspections/${inspectionId}/events`, {
      params
    });
    return response.data;
  },

  // Get defect statistics
  getDefectStatistics: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get('/inspection/statistics/defects', { params });
    return response.data;
  },

  // Get overview statistics
  getOverviewStatistics: async () => {
    const response = await api.get('/inspection/statistics/overview');
    return response.data;
  },

  // Search inspections
  searchInspections: async (query) => {
    const response = await api.get('/inspection/inspections/search', {
      params: { query }
    });
    return response.data;
  },
};