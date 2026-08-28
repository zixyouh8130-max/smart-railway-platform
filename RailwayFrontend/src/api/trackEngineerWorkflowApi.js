/**
 * Track Engineer Kanban API adapter.
 *
 * This adapter maps the new Track Engineer Kanban UI
 * to the existing src/api/trackIssues.js API methods.
 *
 * DO NOT delete trackIssues.js.
 */

import trackIssuesApi from '@/api/trackIssues';

/**
 * getMine() may return:
 *
 * [
 *   {...},
 *   {...},
 * ]
 *
 * or:
 *
 * {
 *   cases: [...]
 * }
 *
 * or:
 *
 * {
 *   items: [...]
 * }
 *
 * Normalize all of them into one array.
 */
const normalizeCases = (result) => {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.cases)) {
    return result.cases;
  }

  if (Array.isArray(result?.items)) {
    return result.items;
  }

  return [];
};

const trackEngineerWorkflowApi = {
  /**
   * Get inspection cases assigned to the logged-in
   * Track Engineer.
   */
  async getMine(includeCompleted = false) {
    const result = await trackIssuesApi.getMine(
      includeCompleted,
    );

    return normalizeCases(result);
  },

  /**
   * Get one inspection case including issues,
   * activities, AI snapshot, engineer, etc.
   */
  async getCase(caseId) {
    const result = await trackIssuesApi.getById(
      caseId,
    );

    // Supports either:
    // { case: {...} }
    // or directly:
    // {...}
    return result?.case ?? result;
  },

  /**
   * Update inspection case workflow status.
   *
   * UI sends:
   *
   * {
   *   status: 'IN_PROGRESS',
   *   note: 'Starting inspection'
   * }
   *
   * Existing API expects:
   *
   * updateStatus(caseId, status, note)
   */
  async updateCaseStatus(caseId, payload) {
    return trackIssuesApi.updateStatus(
      caseId,
      payload?.status,
      payload?.note ?? null,
    );
  },

  /**
   * Check engineer GPS location against
   * a defect location.
   *
   * payload example:
   *
   * {
   *   latitude: 16.8409,
   *   longitude: 96.1735,
   *   accuracy_meters: 15
   * }
   */
  async checkLocation(
    caseId,
    issueId,
    payload,
  ) {
    return trackIssuesApi.checkLocation(
      caseId,
      issueId,
      payload,
    );
  },

  /**
   * Save physical field verification.
   *
   * UI sends:
   *
   * {
   *   field_verification_status: 'CONFIRMED',
   *   field_verification_note: 'Crack confirmed'
   * }
   *
   * Existing trackIssuesApi expects:
   *
   * verifyFinding(
   *   caseId,
   *   issueId,
   *   verificationStatus,
   *   note
   * )
   */
  async verifyFinding(
    caseId,
    issueId,
    payload,
  ) {
    return trackIssuesApi.verifyFinding(
      caseId,
      issueId,
      payload?.field_verification_status,
      payload?.field_verification_note ?? null,
    );
  },

  /**
   * Save maintenance result.
   *
   * UI sends:
   *
   * {
   *   maintenance_status: 'REPAIR_REQUIRED',
   *   maintenance_note: 'Needs sleeper replacement'
   * }
   */
  async updateMaintenance(
    caseId,
    issueId,
    payload,
  ) {
    return trackIssuesApi.updateMaintenance(
      caseId,
      issueId,
      payload?.maintenance_status,
      payload?.maintenance_note ?? null,
    );
  },

  /**
   * Add a chatter message to one defect.
   *
   * UI sends:
   *
   * {
   *   message: 'Repair team notified',
   *   message_kind: 'COMMENT',
   *   parent_activity_id: null
   * }
   */
  async addIssueComment(
    caseId,
    issueId,
    payload,
  ) {
    return trackIssuesApi.addIssueComment(
      caseId,
      issueId,
      payload?.message,
      payload?.message_kind ?? 'COMMENT',
      payload?.parent_activity_id ?? null,
    );
  },

  /**
   * Add a case-level chatter message.
   */
  async addCaseComment(
    caseId,
    payload,
  ) {
    return trackIssuesApi.addCaseComment(
      caseId,
      payload?.message,
      payload?.message_kind ?? 'COMMENT',
      payload?.parent_activity_id ?? null,
    );
  },
};

export default trackEngineerWorkflowApi;