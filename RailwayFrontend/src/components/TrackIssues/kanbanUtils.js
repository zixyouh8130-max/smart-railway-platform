export const CASE_COLUMNS = [
  { key: 'OPEN', label: 'Open' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'VERIFYING', label: 'Verifying' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'COMPLETED', label: 'Completed' },
];

export const DEFECT_COLUMNS = [
  { key: 'FIELD_CHECK', label: 'Field Check', icon: 'search' },
  { key: 'VERIFIED', label: 'Verified', icon: 'eye' },
  { key: 'REPAIR_REQUIRED', label: 'Repair Required', icon: 'wrench' },
  { key: 'REPAIR_IN_PROGRESS', label: 'Repair In Progress', icon: 'hammer' },
  { key: 'FOLLOW_UP', label: 'Follow-up', icon: 'clock' },
  { key: 'FALSE_POSITIVE', label: 'False Positive', icon: 'x' },
  { key: 'DONE', label: 'Done', icon: 'check' },
];

export const FIELD_VERIFICATION_OPTIONS = [
  ['NOT_CHECKED', 'Not checked'],
  ['CONFIRMED', 'Confirmed'],
  ['PARTIALLY_CONFIRMED', 'Partially confirmed'],
  ['NOT_CONFIRMED', 'Not confirmed / false positive'],
  ['UNABLE_TO_VERIFY', 'Unable to verify'],
];

export const MAINTENANCE_OPTIONS = [
  ['PENDING', 'Pending'],
  ['NO_ACTION_REQUIRED', 'No action required'],
  ['REPAIR_REQUIRED', 'Repair required'],
  ['REPAIR_IN_PROGRESS', 'Repair in progress'],
  ['REPAIR_COMPLETED', 'Repair completed'],
  ['FOLLOW_UP_REQUIRED', 'Follow-up required'],
];

const FINAL_FIELD_STATES = new Set([
  'CONFIRMED',
  'PARTIALLY_CONFIRMED',
  'NOT_CONFIRMED',
]);

const FINAL_MAINTENANCE_STATES = new Set([
  'NO_ACTION_REQUIRED',
  'REPAIR_COMPLETED',
]);

export function normalizeCaseStatus(status) {
  const value = String(status || 'OPEN').toUpperCase();

  // Reopened work remains visible in the active/open lane without adding a
  // second lifecycle just for presentation.
  if (value === 'REOPENED') return 'OPEN';

  return CASE_COLUMNS.some((column) => column.key === value)
    ? value
    : 'OPEN';
}

export function deriveDefectKanbanStatus(issue = {}) {
  const field = String(
    issue.field_verification_status || 'NOT_CHECKED',
  ).toUpperCase();

  const maintenance = String(
    issue.maintenance_status || 'PENDING',
  ).toUpperCase();

  // Keep false positives visually distinct even though the backend may
  // automatically set maintenance to NO_ACTION_REQUIRED.
  if (field === 'NOT_CONFIRMED') return 'FALSE_POSITIVE';

  if (
    field === 'UNABLE_TO_VERIFY' ||
    maintenance === 'FOLLOW_UP_REQUIRED'
  ) {
    return 'FOLLOW_UP';
  }

  if (maintenance === 'REPAIR_IN_PROGRESS') {
    return 'REPAIR_IN_PROGRESS';
  }

  if (maintenance === 'REPAIR_REQUIRED') {
    return 'REPAIR_REQUIRED';
  }

  if (
    ['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(field) &&
    maintenance === 'PENDING'
  ) {
    return 'VERIFIED';
  }

  if (field === 'NOT_CHECKED') {
    return 'FIELD_CHECK';
  }

  if (FINAL_MAINTENANCE_STATES.has(maintenance)) {
    return 'DONE';
  }

  // Safe fallback: a checked finding without a recognized final disposition
  // belongs in Verified rather than disappearing from the board.
  if (field !== 'NOT_CHECKED') return 'VERIFIED';

  return 'FIELD_CHECK';
}

export function isIssueComplete(issue = {}) {
  const field = String(issue.field_verification_status || '').toUpperCase();
  const maintenance = String(issue.maintenance_status || '').toUpperCase();

  return (
    FINAL_FIELD_STATES.has(field) &&
    FINAL_MAINTENANCE_STATES.has(maintenance)
  );
}

export function getCaseProgress(caseItem = {}) {
  const provided = Number(caseItem.progress_percent);

  if (Number.isFinite(provided)) {
    return Math.max(0, Math.min(100, Math.round(provided)));
  }

  const issues = Array.isArray(caseItem.issues) ? caseItem.issues : [];
  if (!issues.length) return 0;

  const complete = issues.filter(isIssueComplete).length;
  return Math.round((complete / issues.length) * 100);
}

export function getCaseIssueCount(caseItem = {}) {
  if (Number.isFinite(Number(caseItem.total_findings))) {
    return Number(caseItem.total_findings);
  }

  if (Number.isFinite(Number(caseItem.issues_count))) {
    return Number(caseItem.issues_count);
  }

  return Array.isArray(caseItem.issues) ? caseItem.issues.length : 0;
}

export function getCompletedIssueCount(caseItem = {}) {
  if (Number.isFinite(Number(caseItem.completed_findings))) {
    return Number(caseItem.completed_findings);
  }

  return Array.isArray(caseItem.issues)
    ? caseItem.issues.filter(isIssueComplete).length
    : 0;
}

export function shortId(value, length = 8) {
  if (!value) return '—';
  return String(value).slice(0, length);
}

export function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDistanceFromStart(miles) {
  const numeric = Number(miles);
  if (!Number.isFinite(numeric)) return null;

  const meters = numeric * 1609.344;

  if (meters < 1000) {
    return `${meters.toFixed(meters < 100 ? 1 : 0)} m from start`;
  }

  return `${numeric.toFixed(2)} mi from start`;
}

export function priorityClasses(priority) {
  const value = String(priority || '').toLowerCase();

  if (
    value.includes('urgent') ||
    value.includes('critical') ||
    value.includes('high')
  ) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }

  if (value.includes('priority')) {
    return 'bg-orange-50 text-orange-700 border-orange-200';
  }

  if (value.includes('monitor') || value.includes('medium')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export function dateTimeLabel(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
