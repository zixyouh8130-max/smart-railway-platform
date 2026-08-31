import api from './axios';

const base = '/track-issues';

const trackIssuesApi = {
  getMine: async (includeCompleted = false) => {
    const response = await api.get(`${base}/mine`, {
      params: { include_completed: includeCompleted },
    });
    return response.data;
  },

  getNearby: async (latitude, longitude, radiusMiles = 5) => {
    const response = await api.get(`${base}/nearby`, {
      params: {
        latitude,
        longitude,
        radius_miles: radiusMiles,
      },
    });
    return response.data;
  },

  getById: async caseId => {
    const response = await api.get(`${base}/${caseId}`);
    return response.data;
  },

  claim: async caseId => {
    const response = await api.post(`${base}/${caseId}/claim`);
    return response.data;
  },

  checkLocation: async (caseId, issueId, payload) => {
    const response = await api.post(
      `${base}/${caseId}/issues/${issueId}/location-check`,
      payload,
    );
    return response.data;
  },

  verifyFinding: async (caseId, issueId, verificationStatus, note) => {
    const response = await api.patch(
      `${base}/${caseId}/issues/${issueId}/field-verification`,
      {
        verification_status: verificationStatus,
        note,
      },
    );
    return response.data;
  },

  updateMaintenance: async (caseId, issueId, maintenanceStatus, note = null) => {
    const response = await api.patch(
      `${base}/${caseId}/issues/${issueId}/maintenance`,
      {
        maintenance_status: maintenanceStatus,
        note,
      },
    );
    return response.data;
  },

  updateStatus: async (caseId, status, note = null) => {
    const response = await api.patch(`${base}/${caseId}/status`, {
      status,
      note,
    });
    return response.data;
  },

  addCaseComment: async (
    caseId,
    message,
    messageKind = 'COMMENT',
    parentActivityId = null,
  ) => {
    const response = await api.post(`${base}/${caseId}/comments`, {
      message,
      message_kind: messageKind,
      parent_activity_id: parentActivityId,
    });
    return response.data;
  },

  addIssueComment: async (
    caseId,
    issueId,
    message,
    messageKind = 'COMMENT',
    parentActivityId = null,
  ) => {
    const response = await api.post(
      `${base}/${caseId}/issues/${issueId}/comments`,
      {
        message,
        message_kind: messageKind,
        parent_activity_id: parentActivityId,
      },
    );
    return response.data;
  },
};

export default trackIssuesApi;
