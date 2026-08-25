import api from './axios';

const trackIssuesApi = {
  getMine: async (includeResolved = false) => {
    const response = await api.get('/track-issues/mine', {
      params: { include_resolved: includeResolved },
    });
    return response.data;
  },

  getNearby: async (latitude, longitude, radiusMiles = 5) => {
    const response = await api.get('/track-issues/nearby', {
      params: {
        latitude,
        longitude,
        radius_miles: radiusMiles,
        include_assigned_to_me: true,
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

  checkLocation: async (issueId, latitude, longitude, accuracyMeters = null) => {
    const response = await api.post(`/track-issues/${issueId}/location-check`, {
      latitude,
      longitude,
      accuracy_meters: accuracyMeters,
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

  addComment: async (issueId, message, messageKind = 'UPDATE') => {
    const response = await api.post(`/track-issues/${issueId}/comments`, {
      message,
      message_kind: messageKind,
      parent_activity_id: null,
    });
    return response.data;
  },
};

export default trackIssuesApi;
