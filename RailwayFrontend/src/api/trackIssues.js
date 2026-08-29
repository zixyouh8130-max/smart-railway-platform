import api from './axios';

const base = '/track-issues';

const trackIssuesApi = {
  getStatistics: async () => (await api.get(`${base}/statistics`)).data,

  syncInspection: async (inspectionId) => (
    await api.post(`${base}/sync-inspection/${inspectionId}`)
  ).data,

  getCases: async (params = {}) => (
    await api.get(base, { params })
  ).data,

  getEngineers: async () => (
    await api.get(`${base}/engineers`)
  ).data,

  getMine: async (includeCompleted = false) => (
    await api.get(`${base}/mine`, {
      params: { include_completed: includeCompleted },
    })
  ).data,

  getNearby: async ({ latitude, longitude, radiusMiles = 5 }) => (
    await api.get(`${base}/nearby`, {
      params: {
        latitude,
        longitude,
        radius_miles: radiusMiles,
      },
    })
  ).data,

  getById: async (caseId) => (
    await api.get(`${base}/${caseId}`)
  ).data,

  claim: async (caseId) => (
    await api.post(`${base}/${caseId}/claim`)
  ).data,

  assign: async (caseId, staffId, note = null) => (
    await api.patch(`${base}/${caseId}/assign`, {
      staff_id: staffId || null,
      note,
    })
  ).data,

  rename: async (caseId, name) => (
    await api.patch(`${base}/${caseId}/name`, {
      name,
    })
  ).data,

  updateStatus: async (caseId, status, note = null) => (
    await api.patch(`${base}/${caseId}/status`, {
      status,
      note,
    })
  ).data,

  checkLocation: async (caseId, issueId, payload) => (
    await api.post(
      `${base}/${caseId}/issues/${issueId}/location-check`,
      payload,
    )
  ).data,

  verifyFinding: async (
    caseId,
    issueId,
    verificationStatus,
    note,
  ) => (
    await api.patch(
      `${base}/${caseId}/issues/${issueId}/field-verification`,
      {
        verification_status: verificationStatus,
        note,
      },
    )
  ).data,

  updateMaintenance: async (
    caseId,
    issueId,
    maintenanceStatus,
    note = null,
  ) => (
    await api.patch(
      `${base}/${caseId}/issues/${issueId}/maintenance`,
      {
        maintenance_status: maintenanceStatus,
        note,
      },
    )
  ).data,

  addCaseComment: async (
    caseId,
    message,
    messageKind = 'COMMENT',
    parentActivityId = null,
  ) => (
    await api.post(`${base}/${caseId}/comments`, {
      message,
      message_kind: messageKind,
      parent_activity_id: parentActivityId,
    })
  ).data,

  addIssueComment: async (
    caseId,
    issueId,
    message,
    messageKind = 'COMMENT',
    parentActivityId = null,
  ) => (
    await api.post(`${base}/${caseId}/issues/${issueId}/comments`, {
      message,
      message_kind: messageKind,
      parent_activity_id: parentActivityId,
    })
  ).data,
};

export default trackIssuesApi;
