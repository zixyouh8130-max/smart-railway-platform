import api from './axios';

const trackIssuesApi = {
  list: async (params = {}) => {
    const response = await api.get('/track-issues', { params });
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get('/track-issues/statistics');
    return response.data;
  },

  getEngineers: async () => {
    const response = await api.get('/track-issues/engineers');
    return response.data;
  },

  syncInspection: async (inspectionId) => {
    const response = await api.post(`/track-issues/sync-inspection/${inspectionId}`);
    return response.data;
  },

  getMine: async (includeResolved = false) => {
    const response = await api.get('/track-issues/mine', {
      params: { include_resolved: includeResolved },
    });
    return response.data;
  },

  getNearby: async ({ latitude, longitude, radiusMiles = 5, includeAssignedToMe = true }) => {
    const response = await api.get('/track-issues/nearby', {
      params: {
        latitude,
        longitude,
        radius_miles: radiusMiles,
        include_assigned_to_me: includeAssignedToMe,
      },
    });
    return response.data;
  },

  getById: async (issueId) => {
    const response = await api.get(`/track-issues/${issueId}`);
    return response.data;
  },

  claim: async (issueId) => {
    const response = await api.post(`/track-issues/${issueId}/claim`);
    return response.data;
  },

  assign: async (issueId, staffId, note = null) => {
    const response = await api.patch(`/track-issues/${issueId}/assign`, {
      staff_id: staffId || null,
      note: note || null,
    });
    return response.data;
  },

  checkLocation: async (issueId, { latitude, longitude, accuracyMeters = null }) => {
    const response = await api.post(`/track-issues/${issueId}/location-check`, {
      latitude,
      longitude,
      accuracy_meters: accuracyMeters,
    });
    return response.data;
  },

  updateFieldVerification: async (issueId, verificationStatus, note) => {
    const response = await api.patch(`/track-issues/${issueId}/field-verification`, {
      verification_status: verificationStatus,
      note,
    });
    return response.data;
  },

  updateStatus: async (issueId, status, note = null) => {
    const response = await api.patch(`/track-issues/${issueId}/status`, {
      status,
      note: note || null,
    });
    return response.data;
  },

  addComment: async (issueId, message, messageKind = 'COMMENT', parentActivityId = null) => {
    const response = await api.post(`/track-issues/${issueId}/comments`, {
      message,
      message_kind: messageKind,
      parent_activity_id: parentActivityId,
    });
    return response.data;
  },
};

export default trackIssuesApi;
