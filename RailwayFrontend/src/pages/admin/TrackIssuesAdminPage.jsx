import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  LockKeyhole,
  MessageSquare,
  PencilLine,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UserCheck,
  UserRoundCog,
  Wrench,
  X,
} from 'lucide-react';

import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { inspectionApi } from '@/api/inspectionAPI';
import trackIssuesApi from '@/api/trackIssues';
import AIReviewPanel from '@/components/TrackIssues/AIReviewPanel';
import InspectionCaseAIReview from '@/components/TrackIssues/InspectionCaseAIReview';

const STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'VERIFYING',
  'BLOCKED',
  'REOPENED',
  'COMPLETED',
];

const STATUS_LABELS = {
  OPEN: 'မစတင်ရသေး',
  ACKNOWLEDGED: 'လက်ခံပြီး',
  IN_PROGRESS: 'ဆောင်ရွက်နေ',
  VERIFYING: 'အပြီးသတ်သုံးသပ်နေ',
  BLOCKED: 'ရပ်တန့်ထား',
  REOPENED: 'ပြန်ဖွင့်ထား',
  COMPLETED: 'ပြီးစီး',
};

const FIELD_LABELS = {
  NOT_CHECKED: 'မစစ်ဆေးရသေး',
  CONFIRMED: 'အတည်ပြုပြီး',
  PARTIALLY_CONFIRMED: 'တစ်စိတ်တစ်ပိုင်း အတည်ပြု',
  NOT_CONFIRMED: 'မအတည်ပြုနိုင်',
  UNABLE_TO_VERIFY: 'စစ်ဆေးအတည်မပြုနိုင်',
};

const MAINTENANCE_LABELS = {
  PENDING: 'စောင့်ဆိုင်းနေ',
  NO_ACTION_REQUIRED: 'ဆောင်ရွက်ရန်မလို',
  REPAIR_REQUIRED: 'ပြုပြင်ရန်လို',
  REPAIR_IN_PROGRESS: 'ပြုပြင်နေ',
  REPAIR_COMPLETED: 'ပြုပြင်ပြီး',
  FOLLOW_UP_REQUIRED: 'ထပ်မံစစ်ဆေးရန်လို',
};

const PRIORITY_LABELS = {
  CRITICAL: 'အရေးပေါ်',
  HIGH: 'မြင့်',
  MEDIUM: 'အလယ်အလတ်',
  LOW: 'နိမ့်',
  ROUTINE: 'ပုံမှန်',
  UNASSESSED: 'မသတ်မှတ်ရသေး',
  PRIORITY_INSPECTION: 'ဦးစားပေး စစ်ဆေးရန်',
};

const ACTIVITY_LABELS = {
  CASE_CREATED_FROM_AI: 'AI မှ Caseဖန်တီးခဲ့သည်',
  CASE_ASSIGNED: 'အင်ဂျင်နီယာ တာဝန်ပေးခဲ့သည်',
  CASE_UNASSIGNED: 'တာဝန်ပေးမှု ဖြုတ်ခဲ့သည်',
  CASE_CLAIMED: 'အင်ဂျင်နီယာက လက်ခံယူခဲ့သည်',
  CASE_STATUS: 'Caseအခြေအနေ ပြောင်းလဲခဲ့သည်',
  CASE_MESSAGE: 'Caseစာတို',
  CASE_RENAMED: 'Caseအမည် ပြောင်းခဲ့သည်',
  FINDING_MESSAGE: 'ချို့ယွင်းချက်စာတို',
  FIELD_VERIFICATION: 'ကွင်းဆင်းအတည်ပြုမှု',
  MAINTENANCE_STATUS: 'ပြုပြင်ထိန်းသိမ်းမှု အခြေအနေ',
  LOCATION_CHECK: 'တည်နေရာ စစ်ဆေးမှု',
  FINDING_CREATED_FROM_AI: 'AI တွေ့ရှိချက် ဖန်တီးခဲ့သည်',
};

const defectLabel = (value) => value || 'Unknown defect';

const statusLabel = (value) => STATUS_LABELS[String(value || '').toUpperCase()] || value || '—';
const fieldLabel = (value) => FIELD_LABELS[String(value || '').toUpperCase()] || value || '—';
const maintenanceLabel = (value) => MAINTENANCE_LABELS[String(value || '').toUpperCase()] || value || '—';
const priorityLabel = (value) => PRIORITY_LABELS[String(value || '').toUpperCase()] || value || '—';
const activityLabel = (value) => ACTIVITY_LABELS[String(value || '').toUpperCase()] || String(value || '—').replaceAll('_', ' ');

const statusClass = (status) => ({
  OPEN: 'bg-red-50 text-red-700 border-red-200',
  ACKNOWLEDGED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  VERIFYING: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  BLOCKED: 'bg-gray-100 text-gray-700 border-gray-300',
  REOPENED: 'bg-orange-50 text-orange-700 border-orange-200',
}[status] || 'bg-gray-50 text-gray-700 border-gray-200');

const inspectionLabel = (inspection) => (
  inspection?.run_id ||
  inspection?.gpx_name ||
  inspection?.video_name ||
  inspection?.id ||
  'စစ်ဆေးမှု'
);

const shortId = (value) => String(value || '').slice(0, 8);

const caseDisplayName = (item) => (
  item?.case_name?.trim() ||
  item?.run_id?.trim() ||
  `စစ်ဆေးမှုCase #${shortId(item?.id)}`
);

const apiErrorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join(' • ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || JSON.stringify(detail);
  }
  return err?.message || fallback;
};

const adminStatusPolicy = (inspectionCase) => {
  if (!inspectionCase) {
    return { editable: false, options: [], reason: '' };
  }

  const current = String(inspectionCase.status || '').toUpperCase();

  if (current === 'COMPLETED') {
    return {
      editable: true,
      options: ['REOPENED'],
      reason: 'ပြီးစီးထားသော Caseကို အကြောင်းပြချက်ဖြင့် Admin ကသာ ပြန်ဖွင့်နိုင်ပါသည်။',
    };
  }

  if (inspectionCase.acknowledged_at) {
    return {
      editable: false,
      options: [],
      reason: 'Track Engineer က Caseကို လက်ခံပြီးနောက် လုပ်ငန်းစဉ်အခြေအနေကို အင်ဂျင်နီယာကသာ ဆက်လက်ပြောင်းလဲရပါမည်။ Admin သည် စောင့်ကြည့်ခြင်း၊ တာဝန်ပြောင်းပေးခြင်း၊ မှတ်ချက်ပေးခြင်းနှင့် သုံးသပ်ချက်ကြည့်ခြင်းသာ ပြုလုပ်နိုင်ပါသည်။',
    };
  }

  if (current === 'OPEN') {
    return {
      editable: true,
      options: ['BLOCKED'],
      reason: 'အင်ဂျင်နီယာ မလက်ခံမီ Admin က လိုအပ်ပါက Caseကို ရပ်တန့်ထားနိုင်ပါသည်။',
    };
  }

  if (current === 'BLOCKED') {
    return {
      editable: true,
      options: ['OPEN'],
      reason: 'အင်ဂျင်နီယာ မလက်ခံရသေးသော ရပ်တန့်ထားသည့် Caseကို Admin က ပြန်ဖွင့်နိုင်ပါသည်။',
    };
  }

  return {
    editable: false,
    options: [],
    reason: 'ဤအခြေအနေကို Admin မှ ပြောင်းလဲခွင့် မရှိပါ။',
  };
};

const ReviewModal = ({ open, title, subtitle, onClose, children }) => {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-2 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl sm:max-h-[88vh]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-600" />
              <h2 className="font-bold text-slate-900">{title}</h2>
            </div>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="ပိတ်ရန်"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
};

const InlineOperationStatus = ({ status, compact = false }) => {
  if (!status?.message || status.state === 'idle') return null;

  const meta = {
    loading: {
      classes: 'border-blue-200 bg-blue-50/80 text-blue-700',
      icon: Loader2,
      iconClasses: 'animate-spin text-blue-600',
    },
    success: {
      classes: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
      icon: CheckCircle2,
      iconClasses: 'text-emerald-600',
    },
    error: {
      classes: 'border-red-200 bg-red-50/80 text-red-700',
      icon: AlertTriangle,
      iconClasses: 'text-red-600',
    },
  }[status.state] || {
    classes: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: Info,
    iconClasses: 'text-slate-500',
  };

  const Icon = meta.icon;

  return (
    <div
      aria-live="polite"
      className={`flex items-center gap-2 rounded-xl border ${meta.classes} ${
        compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${meta.iconClasses}`} />
      <span className="min-w-0 leading-5">{status.message}</span>
    </div>
  );
};

const TrackIssuesAdminPage = () => {
  const [cases, setCases] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedFindingId, setSelectedFindingId] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [engineerFilter, setEngineerFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState('COMMENT');
  const [adminStatusNote, setAdminStatusNote] = useState('');
  const [adminTargetStatus, setAdminTargetStatus] = useState('');
  const [findingComment, setFindingComment] = useState('');
  const [caseNameDraft, setCaseNameDraft] = useState('');
  const [editingCaseName, setEditingCaseName] = useState(false);
  const [caseAIReviewOpen, setCaseAIReviewOpen] = useState(false);
  const [findingAIReview, setFindingAIReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [caseCreationStatus, setCaseCreationStatus] = useState({
    state: 'idle',
    message: '',
  });
  const [assignmentStatus, setAssignmentStatus] = useState({
    state: 'idle',
    message: '',
    caseId: null,
  });

  const load = async () => {
    setLoading(true);
    try {
      setError('');
      const [caseData, engineerData, inspectionData, statData] = await Promise.all([
        trackIssuesApi.getCases(),
        trackIssuesApi.getEngineers(),
        inspectionApi.getInspections(50, 0),
        trackIssuesApi.getStatistics(),
      ]);
      setCases(caseData || []);
      setEngineers(engineerData || []);
      setInspections(inspectionData || []);
      setStats(statData || null);
      if (!selectedInspection && inspectionData?.length) {
        setSelectedInspection(inspectionData[0].id);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'စစ်ဆေးမှု ပြုပြင်ထိန်းသိမ်းရေးCaseများကို မရယူနိုင်ပါ။'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCase = async (id) => {
    setBusy(true);
    setError('');
    try {
      const detail = await trackIssuesApi.getById(id);
      setSelectedCase(detail);
      setSelectedFindingId(detail.issues?.[0]?.id || null);
      setCaseNameDraft(detail.case_name || '');
      setEditingCaseName(false);
      setAdminStatusNote('');
      setAssignmentStatus((current) =>
        current.caseId === id
          ? current
          : { state: 'idle', message: '', caseId: id },
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'စစ်ဆေးမှုCaseကို မရယူနိုင်ပါ။'));
    } finally {
      setBusy(false);
    }
  };

  const statusPolicy = useMemo(
    () => adminStatusPolicy(selectedCase),
    [selectedCase],
  );

  useEffect(() => {
    setAdminTargetStatus(statusPolicy.options[0] || '');
  }, [selectedCase?.id, selectedCase?.status, selectedCase?.acknowledged_at]);

  const syncInspection = async () => {
    if (!selectedInspection) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setCaseCreationStatus({
      state: 'loading',
      message: 'စစ်ဆေးမှုဒေတာကို ချိတ်ဆက်ပြီး Case ဖန်တီးနေပါသည်…',
    });
    try {
      const result = await trackIssuesApi.syncInspection(selectedInspection);
      const successMessage = `Case ဖန်တီးပြီးပါပြီ။ အသစ် ${result.issues_created} ခု၊ ပြန်လည်တင်ထားမှု ${result.issues_updated} ခု။`;
      setSuccess(
        `စစ်ဆေးမှုကို ချိတ်ဆက်ပြီးပါပြီ။ အသစ် ${result.issues_created} ခု၊ ပြန်လည်တင်ထားမှု ${result.issues_updated} ခု။`,
      );
      setCaseCreationStatus({ state: 'success', message: successMessage });
      await load();
      await openCase(result.case_id);
    } catch (err) {
      const message = apiErrorMessage(err, 'AI စစ်ဆေးမှုကို ချိတ်ဆက်၍ Caseမဖန်တီးနိုင်ပါ။');
      setError(message);
      setCaseCreationStatus({ state: 'error', message });
    } finally {
      setBusy(false);
    }
  };

  const assign = async (staffId) => {
    if (!selectedCase) return;

    const caseId = selectedCase.id;
    const targetEngineer = engineers.find((engineer) => engineer.id === staffId);
    setBusy(true);
    setError('');
    setAssignmentStatus({
      state: 'loading',
      caseId,
      message: staffId
        ? `${targetEngineer?.name || 'Track Engineer'} ကို တာဝန်ပေးနေပါသည်…`
        : 'Track Engineer တာဝန်ပေးမှုကို ဖြုတ်နေပါသည်…',
    });

    try {
      const updated = await trackIssuesApi.assign(caseId, staffId || null);
      setSelectedCase(updated);
      setAssignmentStatus({
        state: 'success',
        caseId,
        message: staffId
          ? `${updated?.assigned_staff_name || targetEngineer?.name || 'Track Engineer'} ကို တာဝန်ပေးပြီးပါပြီ။`
          : 'Track Engineer တာဝန်ပေးမှုကို ဖြုတ်ပြီးပါပြီ။',
      });
      await load();
    } catch (err) {
      const message = apiErrorMessage(err, 'Track Engineer တာဝန်ပေးမှုကို မပြောင်းလဲနိုင်ပါ။');
      setError(message);
      setAssignmentStatus({ state: 'error', caseId, message });
    } finally {
      setBusy(false);
    }
  };

  const saveCaseName = async () => {
    if (!selectedCase) return;
    const name = caseNameDraft.trim();
    if (!name) {
      setError('Caseအမည်ကို ထည့်ပါ။');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const updated = await trackIssuesApi.rename(selectedCase.id, name);
      setSelectedCase(updated);
      setCaseNameDraft(updated.case_name || name);
      setEditingCaseName(false);
      setSuccess('Caseအမည်ကို ပြောင်းလဲပြီးပါပြီ။');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Caseအမည်ကို မပြောင်းလဲနိုင်ပါ။'));
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async () => {
    if (!selectedCase || !adminTargetStatus) return;

    if (!statusPolicy.options.includes(adminTargetStatus)) {
      setError('Admin အနေဖြင့် ဤအခြေအနေပြောင်းလဲမှုကို လုပ်ဆောင်ခွင့်မရှိပါ။');
      return;
    }

    const note = adminStatusNote.trim();
    if (['BLOCKED', 'REOPENED'].includes(adminTargetStatus) && !note) {
      setError('အခြေအနေပြောင်းလဲရသည့် အကြောင်းပြချက်ကို ထည့်ပါ။');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const updated = await trackIssuesApi.updateStatus(
        selectedCase.id,
        adminTargetStatus,
        note || null,
      );
      setSelectedCase(updated);
      setAdminStatusNote('');
      setSuccess('Caseအခြေအနေကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Caseအခြေအနေကို မပြောင်းလဲနိုင်ပါ။'));
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!selectedCase || !comment.trim()) return;
    setBusy(true);
    setError('');
    try {
      const updated = await trackIssuesApi.addCaseComment(
        selectedCase.id,
        comment.trim(),
        commentKind,
      );
      setSelectedCase(updated);
      setComment('');
      setCommentKind('COMMENT');
    } catch (err) {
      setError(apiErrorMessage(err, 'Caseစာတိုကို မပို့နိုင်ပါ။'));
    } finally {
      setBusy(false);
    }
  };

  const addFindingComment = async () => {
    if (!selectedCase || !selectedFindingId || !findingComment.trim()) return;
    setBusy(true);
    setError('');
    try {
      const updated = await trackIssuesApi.addIssueComment(
        selectedCase.id,
        selectedFindingId,
        findingComment.trim(),
        'QUESTION',
      );
      setSelectedCase(updated);
      setFindingComment('');
    } catch (err) {
      setError(apiErrorMessage(err, 'ချို့ယွင်းချက်ဆိုင်ရာ မေးခွန်းကို မပို့နိုင်ပါ။'));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (engineerFilter === 'UNASSIGNED' && item.assigned_staff_id) return false;
      if (
        engineerFilter !== 'ALL' &&
        engineerFilter !== 'UNASSIGNED' &&
        item.assigned_staff_id !== engineerFilter
      ) {
        return false;
      }
      if (!q) return true;
      return [
        item.case_name,
        item.inspection_id,
        item.run_id,
        item.status,
        item.ai_overall_priority,
        item.assigned_staff_name,
        item.assigned_staff_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [cases, statusFilter, engineerFilter, search]);

  const selectedFinding = selectedCase?.issues?.find(
    (item) => item.id === selectedFindingId,
  ) || null;

  const activities = Array.isArray(selectedCase?.activities)
    ? [...selectedCase.activities].reverse()
    : [];

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-5 px-3 pb-16 sm:px-4 lg:px-5 2xl:px-0" lang="my">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="mt-1 text-sm text-gray-500">
           စစ်ဆေးမှုCaseများကို Track Engineer များထံ တာဝန်ပေးပြီး ချို့ယွင်းချက်တိုင်း၏ ကွင်းဆင်းစစ်ဆေးမှုနှင့် ပြုပြင်မှုရလဒ်ကို စောင့်ကြည့်ပါ။
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading || busy}>
          <RefreshCw className="mr-2 h-4 w-4" />
          <p className="text-sm">Update ရယူရန်</p>
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3.5 text-sm text-red-700 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3.5 text-sm text-emerald-700 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Caseအားလုံး', stats?.total_cases ?? 0, ClipboardCheck, 'bg-slate-100 text-slate-700'],
          ['ဆောင်ရွက်ဆဲ', stats?.open_cases ?? 0, Wrench, 'bg-blue-50 text-blue-700'],
          ['တာဝန်မပေးရသေး', stats?.unassigned_cases ?? 0, UserRoundCog, 'bg-amber-50 text-amber-700'],
          ['ကွင်းဆင်းစစ်ရန်လို', stats?.needs_field_check ?? 0, AlertTriangle, 'bg-orange-50 text-orange-700'],
          ['ထပ်မံစစ်ဆေးရန်လို', stats?.follow_up_findings ?? 0, MessageSquare, 'bg-violet-50 text-violet-700'],
          ['ပြီးစီး', stats?.completed_cases ?? 0, CheckCircle2, 'bg-emerald-50 text-emerald-700'],
        ].map(([label, value, Icon, tone]) => (
          <Card
            key={label}
            padding="p-4"
            hover={false}
            className="border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tracking-tight text-slate-950">{value}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{label}</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card
        padding="p-0"
        hover={false}
        className="overflow-hidden border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-white to-violet-50/60 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-950">စစ်ဆေးမှုမှ Case ဖန်တီးရန်</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                စစ်ဆေးမှုတစ်ခုကို ရွေးပြီး ပြုပြင်ထိန်းသိမ်းရေး Case နှင့် တွေ့ရှိချက်များကို ချိတ်ဆက်ပါ။
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label className="text-xs font-semibold text-slate-600">စစ်ဆေးမှု</label>
              <select
                value={selectedInspection}
                onChange={(event) => {
                  setSelectedInspection(event.target.value);
                  setCaseCreationStatus({ state: 'idle', message: '' });
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                {inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspectionLabel(inspection)}
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={syncInspection}
              disabled={busy || !selectedInspection}
              className="min-h-11 w-full px-5 lg:w-auto"
            >
              {caseCreationStatus.state === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Case ဖန်တီးနေပါသည်…
                </>
              ) : (
                <>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  စစ်ဆေးမှုကို ချိတ်ဆက် / Case ဖန်တီးရန်
                </>
              )}
            </Button>
          </div>

          <InlineOperationStatus status={caseCreationStatus} />
        </div>
      </Card>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(0,3fr)]">
        <aside className="min-w-0 space-y-5">
          <Card padding="p-4" hover={false} className="border-slate-200 bg-white shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-950">Case စာရင်း</h3>
                <p className="mt-0.5 text-xs text-slate-500">{filtered.length} Case ပြသထားသည်</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {cases.length}
              </span>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Caseအမည်၊ ID၊ အင်ဂျင်နီယာဖြင့် ရှာရန်…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="ALL">အခြေအနေအားလုံး</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>

            <select
              value={engineerFilter}
              onChange={(event) => setEngineerFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="ALL">အင်ဂျင်နီယာအားလုံး</option>
              <option value="UNASSIGNED">တာဝန်မပေးရသေး</option>
              {engineers.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name} ({engineer.staff_id})
                </option>
              ))}
            </select>
          </div>

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1 xl:max-h-[620px]">
            {loading ? (
              <p className="py-8 text-center text-sm text-gray-500">ရယူနေပါသည်…</p>
            ) : filtered.length ? (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openCase(item.id)}
                  className={`group w-full rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                    selectedCase?.id === item.id
                      ? 'border-blue-300 bg-blue-50/60 shadow-sm ring-2 ring-blue-100'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      ဦးစားပေး: {priorityLabel(item.ai_overall_priority)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-base font-semibold leading-6 text-gray-900">
                    {caseDisplayName(item)}
                  </p>
                  <p className="break-all text-xs text-gray-500">
                    စစ်ဆေးမှု ID: {item.inspection_id}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    ပြီးစီး {item.completed_findings}/{item.total_findings} ·{' '}
                    {item.assigned_staff_name || 'တာဝန်မပေးရသေး'}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${item.progress_percent || 0}%` }}
                    />
                  </div>
                </button>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">
                သတ်မှတ်ထားသော စစ်ထုတ်မှုနှင့် ကိုက်ညီသည့် Caseမရှိပါ။
              </p>
            )}
            </div>
          </Card>

          <Card padding="p-4" hover={false} className="border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-950">Case ဆွေးနွေးမှုနှင့် မှတ်တမ်း</h3>
                <p className="mt-0.5 text-xs text-slate-500">Case activity နှင့် ဆက်သွယ်မှုများ</p>
              </div>
            </div>

              {!selectedCase ? (
                <p className="mt-4 text-sm text-gray-500">
                  ဆွေးနွေးမှုကို ကြည့်ရန် Caseတစ်ခုကို ရွေးပါ။
                </p>
              ) : (
                <>
                  <div className="mt-3 max-h-80 space-y-3 overflow-auto">
                    {activities.length ? activities.map((activity) => (
                      <div key={activity.id} className="relative rounded-xl border border-slate-100 bg-slate-50/70 p-3 pl-4">
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          <strong className="text-gray-700">
                            {activity.actor_name || activity.actor_staff_id || 'စနစ်'}
                          </strong>
                          <span>{activityLabel(activity.activity_type)}</span>
                          {activity.issue_defect_type && (
                            <span className="text-emerald-700">
                              ချို့ယွင်းချက်: {defectLabel(activity.issue_defect_type)}
                            </span>
                          )}
                          <span>
                            {new Date(activity.created_at).toLocaleString('my-MM')}
                          </span>
                        </div>
                        {activity.message && (
                          <p className="mt-1 text-sm text-gray-700">{activity.message}</p>
                        )}
                      </div>
                    )) : (
                      <p className="py-5 text-center text-sm text-gray-400">
                        ဆွေးနွေးမှု မရှိသေးပါ။
                      </p>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <select
                      value={commentKind}
                      onChange={(event) => setCommentKind(event.target.value)}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value="COMMENT">မှတ်ချက်</option>
                      <option value="QUESTION">မေးခွန်း</option>
                      <option value="SUGGESTION">အကြံပြုချက်</option>
                    </select>
                    <input
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="တာဝန်ပေးထားသော အင်ဂျင်နီယာထံ Caseအကြောင်း စာတိုရေးပါ…"
                      className="rounded-xl border px-3 py-2 text-sm"
                    />
                    <Button
                      onClick={addComment}
                      disabled={!comment.trim() || busy}
                      className="w-full"
                    >
                      ပို့ရန်
                    </Button>
                  </div>
                </>
              )}
          </Card>
        </aside>

        <div className="min-w-0 space-y-5">
          {!selectedCase ? (
            <Card padding="p-10" hover={false} className="border-slate-200 bg-gradient-to-br from-white to-slate-50 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                <ClipboardCheck className="h-8 w-8 text-slate-400" />
              </div>
              <p className="mt-3 text-gray-600">
                Track Engineer နှင့် ချို့ယွင်းချက်စာရင်းကို သုံးသပ်ရန် စစ်ဆေးမှုCaseတစ်ခုကို ရွေးပါ။
              </p>
            </Card>
          ) : (
            <>
              <Card padding="p-4 sm:p-5" hover={false} className="overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(selectedCase.status)}`}>
                          {statusLabel(selectedCase.status)}
                        </span>
                        <span className="text-xs text-gray-500 sm:text-sm">
                         ဦးစားပေး: {priorityLabel(selectedCase.ai_overall_priority)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCaseAIReviewOpen(true)}
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                          title="Caseသုံးသပ်ချက်"
                          aria-label="Caseသုံးသပ်ချက်"
                        >
                          <Bot className="h-4 w-4" />
                          Review
                        </button>
                      </div>
                    </div>

                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 xl:w-[390px] xl:shrink-0">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <UserCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            တာဝန်ပေးထားသော Track Engineer
                          </label>
                          <p className="text-[11px] text-slate-400">Engineer assignment</p>
                        </div>
                      </div>

                      <select
                        value={selectedCase.assigned_staff_id || ''}
                        onChange={(event) => assign(event.target.value || null)}
                        disabled={busy}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-base"
                      >
                        <option value="">တာဝန်မပေးရသေး</option>
                        {engineers.map((engineer) => (
                          <option key={engineer.id} value={engineer.id}>
                            {engineer.name} ({engineer.staff_id})
                          </option>
                        ))}
                      </select>

                      <div className="mt-2">
                        <InlineOperationStatus
                          compact
                          status={
                            assignmentStatus.caseId === selectedCase.id
                              ? assignmentStatus
                              : null
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500">
                      Caseအမည်
                    </p>

                    {editingCaseName ? (
                      <div className="mt-2 space-y-3">
                        <input
                          value={caseNameDraft}
                          onChange={(event) => setCaseNameDraft(event.target.value)}
                          maxLength={160}
                          autoFocus
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none focus:border-slate-600 sm:text-xl"
                          placeholder="Caseအမည်"
                        />

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={saveCaseName}
                            disabled={busy || !caseNameDraft.trim()}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Save className="h-4 w-4" />
                            သိမ်းရန်
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCaseNameDraft(selectedCase.case_name || '');
                              setEditingCaseName(false);
                            }}
                            className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            မလုပ်တော့ပါ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 flex min-w-0 items-start gap-2">
                        <h2 className="min-w-0 flex-1 break-words text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                          {caseDisplayName(selectedCase)}
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setCaseNameDraft(selectedCase.case_name || caseDisplayName(selectedCase));
                            setEditingCaseName(true);
                          }}
                          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                          title="Caseအမည်ပြောင်းရန်"
                          aria-label="Caseအမည်ပြောင်းရန်"
                        >
                          <PencilLine className="h-5 w-5" />
                        </button>
                      </div>
                    )}

                    <p className="mt-2 break-all text-xs leading-5 text-gray-500 sm:text-sm">
                      စစ်ဆေးမှု ID: {selectedCase.inspection_id}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    {[
                      ['တွေ့ရှိချက်', selectedCase.total_findings],
                      ['ကွင်းဆင်းစစ်ပြီး', selectedCase.checked_findings],
                      ['ပြီးစီး', selectedCase.completed_findings],
                      ['မှားယွင်းတွေ့ရှိ', selectedCase.false_positive_count],
                      ['ထပ်မံစစ်ရန်', selectedCase.follow_up_count],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-xl bg-gray-50 p-3 sm:p-4">
                        <p className="text-xl font-bold text-slate-950 sm:text-2xl">{value}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card padding="p-5" hover={false} className="border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <UserRoundCog className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-950">Case စီမံခန့်ခွဲမှု</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Admin အတွက် Case workflow controls</p>
                  </div>
                </div>

                {statusPolicy.editable ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      <div className="flex items-start gap-2">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{statusPolicy.reason}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                      <select
                        value={adminTargetStatus}
                        onChange={(event) => setAdminTargetStatus(event.target.value)}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        {statusPolicy.options.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={adminStatusNote}
                        onChange={(event) => setAdminStatusNote(event.target.value)}
                        placeholder="အခြေအနေပြောင်းလဲရသည့် အကြောင်းပြချက်…"
                        className="rounded-xl border px-3 py-2 text-sm"
                      />
                      <Button
                        onClick={updateStatus}
                        disabled={busy || !adminTargetStatus}
                      >
                        {adminTargetStatus === 'REOPENED' ? (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        ) : null}
                        အတည်ပြုရန်
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                      <div>
                        <p className="font-semibold text-amber-900">
                          Admin မှ အခြေအနေပြောင်းလဲမှု ပိတ်ထားသည်
                        </p>
                        <p className="mt-1 text-sm leading-6 text-amber-800">
                          {statusPolicy.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card padding="p-5" hover={false} className="border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">ချို့ယွင်းချက် စစ်ဆေးစာရင်း</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Robot အိုင်ကွန်ကို နှိပ်မှ သုံးသပ်ချက် popup ပေါ်လာပါမည်။
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
                  <div className="max-h-[520px] min-w-0 space-y-2 overflow-auto xl:max-h-[650px]">
                    {(selectedCase.issues || []).map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-stretch rounded-xl border ${
                          selectedFindingId === item.id
                            ? 'border-emerald-400 bg-emerald-50/40'
                            : 'border-gray-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedFindingId(item.id)}
                          className="min-w-0 flex-1 p-3 text-left"
                        >
                          <div className="flex justify-between gap-2">
                            <p className="break-words font-semibold text-slate-900">{defectLabel(item.defect_type)}</p>
                            <span>{item.checklist_complete ? '✓' : '•'}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {priorityLabel(item.ai_priority)} · {fieldLabel(item.field_verification_status)} · {maintenanceLabel(item.maintenance_status)}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFindingId(item.id);
                            setFindingAIReview(item);
                          }}
                          className="m-2 inline-flex w-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                          title="ချို့ယွင်းချက်သုံးသပ်ချက်"
                          aria-label={`သုံးသပ်ချက် - ${defectLabel(item.defect_type)}`}
                        >
                          <Bot className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div>
                    {selectedFinding ? (
                      <>
                        <div className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">
                                လူမှ စစ်ဆေးထားသော ရလဒ်
                              </p>
                              <p className="mt-1 text-sm font-medium text-slate-800">
                                {defectLabel(selectedFinding.defect_type)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFindingAIReview(selectedFinding)}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                              title="ချို့ယွင်းချက်သုံးသပ်ချက်"
                              aria-label="ချို့ယွင်းချက်သုံးသပ်ချက်"
                            >
                              <Bot className="h-4 w-4" />
                            </button>
                          </div>

                          <p className="mt-3 text-sm">
                            ကွင်းဆင်းအတည်ပြုမှု: <strong>{fieldLabel(selectedFinding.field_verification_status)}</strong>
                          </p>
                          {selectedFinding.field_verification_note && (
                            <p className="mt-1 text-sm text-gray-600">
                              {selectedFinding.field_verification_note}
                            </p>
                          )}
                          <p className="mt-3 text-sm">
                            ပြုပြင်ထိန်းသိမ်းမှု: <strong>{maintenanceLabel(selectedFinding.maintenance_status)}</strong>
                          </p>
                          {selectedFinding.maintenance_note && (
                            <p className="mt-1 text-sm text-gray-600">
                              {selectedFinding.maintenance_note}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            value={findingComment}
                            onChange={(event) => setFindingComment(event.target.value)}
                            placeholder="ဤချို့ယွင်းချက်အကြောင်း အင်ဂျင်နီယာကို မေးရန်…"
                            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
                          />
                          <Button
                            onClick={addFindingComment}
                            disabled={!findingComment.trim() || busy}
                          >
                            မေးရန်
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">
                        ချို့ယွင်းချက်တစ်ခုကို ရွေးပါ။
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <ReviewModal
        open={caseAIReviewOpen && Boolean(selectedCase)}
        onClose={() => setCaseAIReviewOpen(false)}
        title="Caseသုံးသပ်ချက်"
        subtitle={selectedCase ? caseDisplayName(selectedCase) : ''}
      >
        {selectedCase && (
          <InspectionCaseAIReview inspectionCase={selectedCase} />
        )}
      </ReviewModal>

      <ReviewModal
        open={Boolean(findingAIReview)}
        onClose={() => setFindingAIReview(null)}
        title="ချို့ယွင်းချက်သုံးသပ်ချက်"
        subtitle={findingAIReview ? defectLabel(findingAIReview.defect_type) : ''}
      >
        {findingAIReview && (
          <AIReviewPanel issue={findingAIReview} />
        )}
      </ReviewModal>
    </div>
  );
};

export default TrackIssuesAdminPage;