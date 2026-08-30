export const CASE_COLUMNS = [
  { key: 'OPEN', label: 'ဖွင့်ထား' },
  { key: 'ACKNOWLEDGED', label: 'လက်ခံပြီး' },
  { key: 'IN_PROGRESS', label: 'လုပ်ဆောင်နေ' },
  { key: 'VERIFYING', label: 'အပြီးသတ်သုံးသပ်နေ' },
  { key: 'BLOCKED', label: 'ရပ်တန့်ထား' },
  { key: 'COMPLETED', label: 'ပြီးစီး' },
];

export const DEFECT_COLUMNS = [
  { key: 'FIELD_CHECK', label: 'ကွင်းဆင်းစစ်ဆေးရန်', icon: 'search' },
  { key: 'VERIFIED', label: 'အတည်ပြုပြီး', icon: 'eye' },
  { key: 'REPAIR_REQUIRED', label: 'ပြုပြင်ရန်လို', icon: 'wrench' },
  { key: 'REPAIR_IN_PROGRESS', label: 'ပြုပြင်နေ', icon: 'hammer' },
  { key: 'FOLLOW_UP', label: 'ထပ်မံစစ်ဆေးရန်', icon: 'clock' },
  { key: 'FALSE_POSITIVE', label: 'AI မှားယွင်းတွေ့ရှိမှု', icon: 'x' },
  { key: 'DONE', label: 'ပြီးစီး', icon: 'check' },
];

export const FIELD_VERIFICATION_OPTIONS = [
  ['NOT_CHECKED', 'မစစ်ဆေးရသေး'],
  ['CONFIRMED', 'တွေ့ရှိချက်ကို အတည်ပြုသည်'],
  ['PARTIALLY_CONFIRMED', 'တစ်စိတ်တစ်ပိုင်း အတည်ပြုသည်'],
  ['NOT_CONFIRMED', 'မတွေ့ရှိပါ (AI မှားယွင်းတွေ့ရှိမှု)'],
  ['UNABLE_TO_VERIFY', 'စစ်ဆေးအတည်ပြု၍ မရပါ'],
];

export const MAINTENANCE_OPTIONS = [
  ['PENDING', 'စောင့်ဆိုင်းနေ'],
  ['NO_ACTION_REQUIRED', 'ပြုပြင်ရန် မလိုပါ'],
  ['REPAIR_REQUIRED', 'ပြုပြင်ရန် လိုအပ်သည်'],
  ['REPAIR_IN_PROGRESS', 'ပြုပြင်နေသည်'],
  ['REPAIR_COMPLETED', 'ပြုပြင်ပြီးစီးသည်'],
  ['FOLLOW_UP_REQUIRED', 'ထပ်မံစစ်ဆေးရန် လိုအပ်သည်'],
];

const CASE_STATUS_LABELS = Object.fromEntries(
  CASE_COLUMNS.map(({ key, label }) => [key, label]),
);

const FIELD_LABELS = Object.fromEntries(FIELD_VERIFICATION_OPTIONS);
const MAINTENANCE_LABELS = Object.fromEntries(MAINTENANCE_OPTIONS);

const PRIORITY_LABELS = {
  ROUTINE: 'ပုံမှန်',
  LOW: 'အနိမ့်',
  MEDIUM: 'အလယ်အလတ်',
  MONITOR: 'စောင့်ကြည့်ရန်',
  PRIORITY: 'ဦးစားပေး',
  PRIORITY_INSPECTION: 'ဦးစားပေး စစ်ဆေးရန်',
  HIGH: 'မြင့်',
  URGENT: 'အရေးပေါ်',
  CRITICAL: 'အလွန်အရေးကြီး',
};

const RAIL_SIDE_LABELS = {
  LEFT: 'ဘယ်ဘက် ရထားလမ်း',
  RIGHT: 'ညာဘက် ရထားလမ်း',
  BOTH: 'ရထားလမ်း နှစ်ဘက်လုံး',
  CENTER: 'အလယ်ပိုင်း',
  UNKNOWN: 'မသတ်မှတ်ရသေး',
};

const PROXIMITY_LABELS = {
  ON_SITE: 'သတ်မှတ်နေရာသို့ ရောက်ရှိ',
  NEARBY: 'အနီးတွင် ရှိနေ',
  APPROACHING: 'နေရာသို့ နီးကပ်လာနေ',
  FAR: 'နေရာမှ အဝေးတွင် ရှိနေ',
  GPS_UNCERTAIN: 'GPS တိကျမှု မသေချာ',
};

const DEFECT_TYPE_LABELS = {
  MISSING_FASTENER: 'Fastener ပျောက်ဆုံးမှု',
  DAMAGED_FASTENER: 'Fastener ပျက်စီးမှု',
  MISSING_FISHPLATE: 'Fishplate ပျောက်ဆုံးမှု',
  DAMAGED_FISHPLATE: 'Fishplate ပျက်စီးမှု',
  DAMAGED_SLEEPER: 'Sleeper ပျက်စီးမှု',
  BROKEN_SLEEPER: 'Sleeper ကျိုးပဲ့မှု',
  CRACK: 'အက်ကွဲမှု',
  RAIL_CRACK: 'ရထားသံလမ်း အက်ကွဲမှု',
  VEGETATION: 'အပင်ပေါက်မှု',
  VEGETATION_OVERGROWTH: 'အပင်အလွန်ထူထပ်စွာ ပေါက်မှု',
  TRACK_OBSTRUCTION: 'ရထားလမ်း ပိတ်ဆို့မှု',
};

const STAFF_ROLE_LABELS = {
  TRACK_ENGINEER: 'လမ်းကြောင်းအင်ဂျင်နီယာ',
  TRAIN_DRIVER: 'ရထားမောင်းသူ',
  ASSISTANT_DRIVER: 'အကူရထားမောင်းသူ',
  TRAIN_GUARD: 'ရထားစောင့်ကြည့်ဝန်ထမ်း',
  TICKET_CHECKER: 'လက်မှတ်စစ်ဝန်ထမ်း',
  ADMIN: 'စီမံခန့်ခွဲသူ',
  SUPER_ADMIN: 'အဓိက စီမံခန့်ခွဲသူ',
};

const ACTIVITY_TYPE_LABELS = {
  COMMENT: 'မှတ်ချက်',
  MESSAGE: 'စာတို',
  QUESTION: 'မေးခွန်း',
  SUGGESTION: 'အကြံပြုချက်',
  LOCATION_CHECK: 'တည်နေရာ စစ်ဆေးမှု',
  FIELD_VERIFICATION: 'ကွင်းဆင်း အတည်ပြုမှု',
  MAINTENANCE_UPDATE: 'ပြုပြင်ထိန်းသိမ်းမှု အပ်ဒိတ်',
  STATUS_CHANGE: 'အခြေအနေ ပြောင်းလဲမှု',
  CASE_CREATED: 'Case ဖန်တီးမှု',
  ISSUE_CREATED: 'တွေ့ရှိချက် ဖန်တီးမှု',
  AI_REVIEW: 'AI သုံးသပ်ချက်',
};

const FINAL_FIELD_STATES = new Set([
  'CONFIRMED',
  'PARTIALLY_CONFIRMED',
  'NOT_CONFIRMED',
]);

const FINAL_MAINTENANCE_STATES = new Set([
  'NO_ACTION_REQUIRED',
  'REPAIR_COMPLETED',
]);

const normalizedKey = (value) =>
  String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();

export function normalizeCaseStatus(status) {
  const value = normalizedKey(status || 'OPEN');
  if (value === 'REOPENED') return 'OPEN';

  return CASE_COLUMNS.some((column) => column.key === value)
    ? value
    : 'OPEN';
}

export function deriveDefectKanbanStatus(issue = {}) {
  const field = normalizedKey(
    issue.field_verification_status || 'NOT_CHECKED',
  );
  const maintenance = normalizedKey(
    issue.maintenance_status || 'PENDING',
  );

  if (field === 'NOT_CONFIRMED') return 'FALSE_POSITIVE';

  if (
    field === 'UNABLE_TO_VERIFY' ||
    maintenance === 'FOLLOW_UP_REQUIRED'
  ) {
    return 'FOLLOW_UP';
  }

  if (maintenance === 'REPAIR_IN_PROGRESS') return 'REPAIR_IN_PROGRESS';
  if (maintenance === 'REPAIR_REQUIRED') return 'REPAIR_REQUIRED';

  if (
    ['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(field) &&
    maintenance === 'PENDING'
  ) {
    return 'VERIFIED';
  }

  if (field === 'NOT_CHECKED') return 'FIELD_CHECK';
  if (FINAL_MAINTENANCE_STATES.has(maintenance)) return 'DONE';
  if (field !== 'NOT_CHECKED') return 'VERIFIED';

  return 'FIELD_CHECK';
}

export function isIssueComplete(issue = {}) {
  const field = normalizedKey(issue.field_verification_status);
  const maintenance = normalizedKey(issue.maintenance_status);

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

export function caseStatusLabel(value) {
  const key = normalizedKey(value);
  if (key === 'REOPENED') return 'ပြန်လည်ဖွင့်ထား';
  return CASE_STATUS_LABELS[key] || humanize(value);
}

export function fieldVerificationLabel(value) {
  return FIELD_LABELS[normalizedKey(value)] || humanize(value);
}

export function maintenanceStatusLabel(value) {
  return MAINTENANCE_LABELS[normalizedKey(value)] || humanize(value);
}

export function priorityLabel(value) {
  const key = normalizedKey(value || 'ROUTINE');
  return PRIORITY_LABELS[key] || humanize(value || 'ROUTINE');
}

export function railSideLabel(value) {
  const key = normalizedKey(value);
  return RAIL_SIDE_LABELS[key] || humanize(value);
}

export function proximityLabel(value) {
  return PROXIMITY_LABELS[normalizedKey(value)] || humanize(value);
}

export function defectTypeLabel(value) {
  return value ? String(value) : 'Unknown defect';
}

export function caseDisplayName(caseItem = {}) {
  const customName = String(caseItem.case_name || '').trim();
  if (customName) return customName;

  const runId = String(caseItem.run_id || '').trim();
  if (runId) return runId;

  return `စစ်ဆေးမှုCase #${shortId(caseItem.id)}`;
}

export function staffRoleLabel(value) {
  return STAFF_ROLE_LABELS[normalizedKey(value)] || humanize(value);
}

export function activityTypeLabel(value) {
  const key = normalizedKey(value);
  return ACTIVITY_TYPE_LABELS[key] || humanize(value || 'ACTIVITY');
}

export function formatDistanceFromStart(miles) {
  const numeric = Number(miles);
  if (!Number.isFinite(numeric)) return null;

  const meters = numeric * 1609.344;

  if (meters < 1000) {
    return `အစမှ ${meters.toFixed(meters < 100 ? 1 : 0)} မီတာ`;
  }

  return `အစမှ ${(meters / 1000).toFixed(2)} ကီလိုမီတာ`;
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

  try {
    return date.toLocaleString('my-MM', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
