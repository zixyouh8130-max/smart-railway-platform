// api/inspectionApi.js

import api from './axios';

export const inspectionApi = {
  // ----------------------------------------------------------
  // Inspections
  // ----------------------------------------------------------

  // Get all inspections with pagination
  getInspections: async (limit = 20, skip = 0) => {
    const response = await api.get('/inspection/inspections', {
      params: {
        limit,
        skip,
      },
    });

    return response.data;
  },

  // Get detailed inspection with all events
  getInspectionDetail: async (inspectionId) => {
    const response = await api.get(
      `/inspection/inspections/${inspectionId}`
    );

    return response.data;
  },

  // Get events for a specific inspection
  getInspectionEvents: async (
    inspectionId,
    defectType = null
  ) => {
    const params = {};

    if (defectType) {
      params.defect_type = defectType;
    }

    const response = await api.get(
      `/inspection/inspections/${inspectionId}/events`,
      {
        params,
      }
    );

    return response.data;
  },

  // ----------------------------------------------------------
  // AI Maintenance Review
  // ----------------------------------------------------------

  /**
   * Generate a Myanmar-language AI maintenance review.
   *
   * Normal case:
   *   force = false
   *
   * Retry a previously failed review:
   *   force = true
   *
   * Gemini/Groq credentials remain entirely in FastAPI.
   */
  generateAiReview: async (
    inspectionId,
    force = false
  ) => {
    const response = await api.post(
      `/inspection/inspections/${inspectionId}/ai-review`,
      null,
      {
        params: {
          force,
        },
      }
    );

    return response.data;
  },

  // ----------------------------------------------------------
  // Statistics
  // ----------------------------------------------------------

  // Get defect statistics
  getDefectStatistics: async (
    startDate = null,
    endDate = null
  ) => {
    const params = {};

    if (startDate) {
      params.start_date = startDate;
    }

    if (endDate) {
      params.end_date = endDate;
    }

    const response = await api.get(
      '/inspection/statistics/defects',
      {
        params,
      }
    );

    return response.data;
  },

  // Get overview statistics
  getOverviewStatistics: async () => {
    const response = await api.get(
      '/inspection/statistics/overview'
    );

    return response.data;
  },

  // ----------------------------------------------------------
  // Search
  // ----------------------------------------------------------

  searchInspections: async (query) => {
    const response = await api.get(
      '/inspection/inspections/search',
      {
        params: {
          query,
        },
      }
    );

    return response.data;
  },
};