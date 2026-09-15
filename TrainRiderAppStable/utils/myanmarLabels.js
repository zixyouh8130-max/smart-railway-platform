const normalize = value => String(value || '').trim().toUpperCase();

const CASE_STATUS = {
  OPEN: 'ဖွင့်ထား',
  ACKNOWLEDGED: 'လက်ခံပြီး',
  IN_PROGRESS: 'လုပ်ဆောင်နေ',
  VERIFYING: 'အပြီးသတ်စစ်ဆေးနေ',
  COMPLETED: 'ပြီးစီး',
  BLOCKED: 'ရပ်တန့်ထား',
  REOPENED: 'ပြန်လည်ဖွင့်ထား',
};

const FIELD_STATUS = {
  NOT_CHECKED: 'မစစ်ဆေးရသေး',
  CONFIRMED: 'အတည်ပြုတွေ့ရှိ',
  PARTIALLY_CONFIRMED: 'တစ်စိတ်တစ်ပိုင်း အတည်ပြု',
  NOT_CONFIRMED: 'ချို့ယွင်းချက် မတွေ့ရှိ',
  UNABLE_TO_VERIFY: 'အတည်မပြုနိုင်',
};

const MAINTENANCE_STATUS = {
  PENDING: 'မရွေးချယ်ရသေး',
  NO_ACTION_REQUIRED: 'ပြုပြင်ရန် မလိုအပ်',
  REPAIR_REQUIRED: 'ပြုပြင်ရန် လိုအပ်',
  REPAIR_IN_PROGRESS: 'ပြုပြင်နေဆဲ',
  REPAIR_COMPLETED: 'ပြုပြင်ပြီးစီး',
  FOLLOW_UP_REQUIRED: 'ထပ်မံစစ်ဆေးရန် လိုအပ်',
};

const PRIORITY = {
  CRITICAL: 'အရေးပေါ်',
  URGENT: 'အရေးကြီး',
  HIGH: 'ဦးစားပေးမြင့်',
  MEDIUM: 'အလယ်အလတ်',
  MONITOR: 'စောင့်ကြည့်ရန်',
  LOW: 'ဦးစားပေးနိမ့်',
  ROUTINE: 'ပုံမှန်',
  UNASSESSED: 'မသတ်မှတ်ရသေး',
};

const RAIL_SIDE = {
  LEFT: 'ဘယ်ဘက်သံလမ်း',
  RIGHT: 'ညာဘက်သံလမ်း',
  CENTER: 'အလယ်သံလမ်း',
  BOTH: 'သံလမ်းနှစ်ဘက်',
  UNKNOWN: 'သံလမ်းဘက် မသတ်မှတ်ရသေး',
};

const ACTIVITY_TYPE = {
  COMMENT: 'စာတို',
  CASE_STATUS_CHANGED: 'Case အခြေအနေပြောင်းလဲမှု',
  CASE_CREATED_FROM_AI: 'AI စစ်ဆေးမှုမှ Case ဖန်တီးခြင်း',
  FINDING_CREATED_FROM_AI: 'AI ချို့ယွင်းချက် ဖန်တီးခြင်း',
  FINDING_FIELD_VERIFIED: 'ကွင်းဆင်းအတည်ပြုမှု',
  FIELD_VERIFICATION_UPDATED: 'ကွင်းဆင်းအတည်ပြုမှု',
  MAINTENANCE_UPDATED: 'ပြုပြင်ထိန်းသိမ်းမှု အပ်ဒိတ်',
  LOCATION_CHECKED: 'တည်နေရာစစ်ဆေးမှု',
  CASE_ASSIGNED: 'Case တာဝန်ပေးမှု',
  CASE_CLAIMED: 'Case တာဝန်ယူမှု',
};

const DEFECTS = {
  'MISSING FASTENER': 'ဖက်စနာ ပျောက်ဆုံးမှု',
  'MISSING FASTENERS': 'ဖက်စနာ ပျောက်ဆုံးမှု',
  'LOOSE FASTENER': 'ဖက်စနာ လျော့ရဲမှု',
  'LOOSE FASTENERS': 'ဖက်စနာ လျော့ရဲမှု',
  'MISSING CLIP': 'ကလစ် ပျောက်ဆုံးမှု',
  'BROKEN CLIP': 'ကလစ် ပျက်စီးမှု',
  'DAMAGED SLEEPER': 'သံလမ်းအောက်ခံတုံး ပျက်စီးမှု',
  'BROKEN SLEEPER': 'သံလမ်းအောက်ခံတုံး ကျိုးပဲ့မှု',
  'SLEEPER CRACK': 'သံလမ်းအောက်ခံတုံး အက်ကွဲမှု',
  'RAIL CRACK': 'သံလမ်း အက်ကွဲမှု',
  'CRACK': 'အက်ကွဲမှု',
  'SURFACE DEFECT': 'သံလမ်းမျက်နှာပြင် ချို့ယွင်းမှု',
  'VEGETATION': 'အပင်များ ဖုံးလွှမ်းမှု',
  'VEGETATION OVERGROWTH': 'အပင်များ အလွန်ဖုံးလွှမ်းမှု',
  'OBSTRUCTION': 'သံလမ်းပေါ် အတားအဆီး',
  'MISALIGNMENT': 'သံလမ်းတန်း မညီမှု',
  'RAIL DAMAGE': 'သံလမ်း ပျက်စီးမှု',
};

export const caseStatusLabel = value => CASE_STATUS[normalize(value)] || String(value || '—').replace(/_/g, ' ');
export const fieldStatusLabel = value => FIELD_STATUS[normalize(value)] || String(value || '—').replace(/_/g, ' ');
export const maintenanceStatusLabel = value => MAINTENANCE_STATUS[normalize(value)] || String(value || '—').replace(/_/g, ' ');
export const priorityLabel = value => PRIORITY[normalize(value)] || String(value || 'မသတ်မှတ်ရသေး').replace(/_/g, ' ');
export const railSideLabel = value => RAIL_SIDE[normalize(value)] || String(value || '—').replace(/_/g, ' ');
export const activityTypeLabel = value => ACTIVITY_TYPE[normalize(value)] || String(value || 'စနစ်အပ်ဒိတ်').replace(/_/g, ' ');

export const defectTypeLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'မသတ်မှတ်ထားသော ချို့ယွင်းချက်';
  const normalized = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return DEFECTS[normalized] || raw;
};

export const yesNoLabel = value => (value ? 'ဟုတ်သည်' : 'မဟုတ်ပါ');
