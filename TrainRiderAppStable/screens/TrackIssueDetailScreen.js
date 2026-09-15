import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import trackIssuesApi from '../api/trackIssues';
import SheetModal from '../components/SheetModal';
import AIReviewModal from '../components/AIReviewModal';
import DefectLocationMap from '../components/DefectLocationMap';
import { requestLocationPermission } from '../utils/locationPermission';
import { colors, radii, shadow } from '../theme/mobileTheme';
import {
  activityTypeLabel,
  caseStatusLabel,
  defectTypeLabel,
  fieldStatusLabel,
  maintenanceStatusLabel,
  priorityLabel,
  railSideLabel,
  yesNoLabel,
} from '../utils/myanmarLabels';

const CASE_TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'BLOCKED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['COMPLETED', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['ACKNOWLEDGED', 'IN_PROGRESS'],
  REOPENED: ['IN_PROGRESS', 'BLOCKED'],
  COMPLETED: [],
};

const MAINTENANCE_TRANSITIONS = {
  PENDING: ['NO_ACTION_REQUIRED', 'REPAIR_REQUIRED', 'FOLLOW_UP_REQUIRED'],
  REPAIR_REQUIRED: ['REPAIR_IN_PROGRESS', 'NO_ACTION_REQUIRED', 'FOLLOW_UP_REQUIRED'],
  REPAIR_IN_PROGRESS: ['REPAIR_COMPLETED', 'FOLLOW_UP_REQUIRED'],
  REPAIR_COMPLETED: ['FOLLOW_UP_REQUIRED'],
  NO_ACTION_REQUIRED: ['FOLLOW_UP_REQUIRED'],
  FOLLOW_UP_REQUIRED: ['REPAIR_REQUIRED', 'REPAIR_IN_PROGRESS', 'NO_ACTION_REQUIRED'],
};

const VERIFICATION_OPTIONS = [
  ['CONFIRMED', 'အတည်ပြုတွေ့ရှိ'],
  ['PARTIALLY_CONFIRMED', 'တစ်စိတ်တစ်ပိုင်း'],
  ['NOT_CONFIRMED', 'ချို့ယွင်းချက် မတွေ့ရှိ'],
  ['UNABLE_TO_VERIFY', 'အတည်မပြုနိုင်'],
];

const MAINTENANCE_LABELS = {
  PENDING: 'စောင့်ဆိုင်းနေ',
  NO_ACTION_REQUIRED: 'ပြုပြင်ရန်မလို',
  REPAIR_REQUIRED: 'ပြုပြင်ရန်လို',
  REPAIR_IN_PROGRESS: 'ပြုပြင်နေဆဲ',
  REPAIR_COMPLETED: 'ပြုပြင်ပြီးစီး',
  FOLLOW_UP_REQUIRED: 'ထပ်မံစစ်ဆေးရန် လို',
};

const CASE_ACTION_LABELS = {
  ACKNOWLEDGED: 'Caseကို လက်ခံရန်',
  IN_PROGRESS: 'လုပ်ငန်းစတင်ရန်',
  VERIFYING: 'အပြီးသတ်စစ်ဆေးရန်',
  COMPLETED: 'Case ပြီးစီးရန်',
  BLOCKED: 'Case ရပ်တန့်ရန်',
};

const DEFECT_COLUMNS = [
  ['FIELD_CHECK', 'ကွင်းဆင်းစစ်ရန်', 'magnify'],
  ['VERIFIED', 'အတည်ပြုပြီး', 'eye-check-outline'],
  ['REPAIR_REQUIRED', 'ပြုပြင်ရန်လို', 'wrench-outline'],
  ['REPAIR_IN_PROGRESS', 'ပြုပြင်နေ', 'hammer-wrench'],
  ['FOLLOW_UP', 'ထပ်မံစစ်ရန်', 'clock-outline'],
  ['FALSE_POSITIVE', 'AI မှားတွေ့', 'close-circle-outline'],
  ['DONE', 'ပြီးစီး', 'check-circle-outline'],
];

const humanize = value => String(value || '—').replace(/_/g, ' ');
const shortId = value => (value ? String(value).slice(0, 8) : '—');
const formatDate = value => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('my-MM');
};
const caseTitle = item => item?.case_name || item?.run_id || `စစ်ဆေးမှုCase #${shortId(item?.id)}`;

const isNetworkError = error => !error?.response && Boolean(error?.request || error?.message === 'Network Error');

const safeDetail = error => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) {
    const problems = Array.isArray(detail.problems) ? `\n• ${detail.problems.join('\n• ')}` : '';
    return `${detail.message}${problems}`;
  }
  if (isNetworkError(error)) {
    return 'ဆာဗာနှင့် ချိတ်ဆက်မှု ခဏပြတ်တောက်နေပါသည်။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ပြီး ထပ်မံကြိုးစားပါ။';
  }
  return error?.message || 'ထပ်မံကြိုးစားပါ။';
};

const isMessageActivity = activity => {
  const type = String(activity?.activity_type || '').toUpperCase();
  return Boolean(activity?.message) && (type.includes('MESSAGE') || type.includes('COMMENT'));
};

const messageKindLabel = value => ({
  COMMENT: 'မှတ်ချက်',
  QUESTION: 'မေးခွန်း',
  SUGGESTION: 'အကြံပြုချက်',
}[String(value || 'COMMENT').toUpperCase()] || 'စာတို');

const deriveDefectStatus = issue => {
  const field = String(issue?.field_verification_status || 'NOT_CHECKED').toUpperCase();
  const maintenance = String(issue?.maintenance_status || 'PENDING').toUpperCase();
  if (field === 'NOT_CONFIRMED') return 'FALSE_POSITIVE';
  if (field === 'UNABLE_TO_VERIFY' || maintenance === 'FOLLOW_UP_REQUIRED') return 'FOLLOW_UP';
  if (maintenance === 'REPAIR_IN_PROGRESS') return 'REPAIR_IN_PROGRESS';
  if (maintenance === 'REPAIR_REQUIRED') return 'REPAIR_REQUIRED';
  if (['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(field) && maintenance === 'PENDING') return 'VERIFIED';
  if (field === 'NOT_CHECKED') return 'FIELD_CHECK';
  if (['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED'].includes(maintenance)) return 'DONE';
  return 'VERIFIED';
};

const isIssueComplete = issue => {
  const field = String(issue?.field_verification_status || '').toUpperCase();
  const maintenance = String(issue?.maintenance_status || '').toUpperCase();
  return ['CONFIRMED', 'PARTIALLY_CONFIRMED', 'NOT_CONFIRMED'].includes(field) && ['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED'].includes(maintenance);
};

const priorityPalette = value => {
  const text = String(value || '').toLowerCase();
  if (/critical|urgent|high|priority/.test(text)) return [colors.dangerSoft, colors.danger];
  if (/monitor|medium/.test(text)) return [colors.warningSoft, colors.warning];
  return [colors.surfaceSoft, colors.textSoft];
};

const Pill = ({ text, backgroundColor = colors.surfaceSoft, color = colors.textSoft, icon }) => (
  <View style={[styles.pill, { backgroundColor }]}>
    {icon ? <Icon name={icon} size={13} color={color} /> : null}
    <Text style={[styles.pillText, { color }]}>{text}</Text>
  </View>
);

const LightButton = ({ title, loadingTitle = 'လုပ်ဆောင်နေသည်…', icon, onPress, disabled, loading = false, compact = false, danger = false }) => (
  <TouchableOpacity
    style={[
      styles.lightButton,
      compact && styles.lightButtonCompact,
      danger && styles.dangerButton,
      (disabled || loading) && styles.disabledButton,
    ]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.82}
  >
    {loading ? (
      <ActivityIndicator size="small" color={danger ? colors.danger : colors.primaryDark} />
    ) : icon ? (
      <Icon name={icon} size={compact ? 16 : 18} color={danger ? colors.danger : colors.primaryDark} />
    ) : null}
    <Text style={[styles.lightButtonText, danger && { color: colors.danger }]}>{loading ? loadingTitle : title}</Text>
  </TouchableOpacity>
);

const TrackIssueDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(320, Math.max(272, width - 56));
  const caseId = route.params?.caseId || route.params?.issueId;

  const [inspectionCase, setInspectionCase] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [locationResult, setLocationResult] = useState(null);
  const [engineerLocation, setEngineerLocation] = useState(null);
  const [caseNote, setCaseNote] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('CONFIRMED');
  const [verificationNote, setVerificationNote] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('PENDING');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [caseComment, setCaseComment] = useState('');
  const [findingComment, setFindingComment] = useState('');
  const [defectModalOpen, setDefectModalOpen] = useState(false);
  const [caseWorkflowOpen, setCaseWorkflowOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showCaseAI, setShowCaseAI] = useState(false);
  const [aiIssue, setAiIssue] = useState(null);

  const load = useCallback(async (refresh = false) => {
    if (!caseId) { setLoading(false); return; }
    if (refresh) setRefreshing(true);
    try {
      const data = await trackIssuesApi.getById(caseId);
      const nextCase = data?.case || data;
      setInspectionCase(nextCase);
      const nextIssues = nextCase?.issues || data?.issues || [];
      setSelectedIssueId(previous => previous && nextIssues.some(item => String(item.id) === String(previous)) ? previous : null);
    } catch (error) {
      Alert.alert('စစ်ဆေးမှုCaseကို မရယူနိုင်ပါ', safeDetail(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation.addListener('focus', () => load(true)), [load, navigation]);

  const issues = inspectionCase?.issues || [];
  const selectedIssue = useMemo(() => issues.find(item => String(item.id) === String(selectedIssueId)) || null, [issues, selectedIssueId]);
  const busy = Boolean(busyAction);

  const applyCasePayload = useCallback(payload => {
    const nextCase = payload?.case || payload;
    if (!nextCase?.id) return null;
    setInspectionCase(nextCase);
    const nextIssues = nextCase?.issues || [];
    setSelectedIssueId(previous => previous && nextIssues.some(item => String(item.id) === String(previous)) ? previous : previous);
    return nextCase;
  }, []);

  useEffect(() => {
    if (!selectedIssue) return;
    setVerificationStatus(selectedIssue.field_verification_status === 'NOT_CHECKED' ? 'CONFIRMED' : selectedIssue.field_verification_status || 'CONFIRMED');
    setVerificationNote('');
    setMaintenanceStatus(selectedIssue.maintenance_status || 'PENDING');
    setMaintenanceNote('');
    setLocationResult(null);
    setEngineerLocation(null);
    setFindingComment('');
  }, [selectedIssueId, selectedIssue?.updated_at]);

  const groupedIssues = useMemo(() => {
    const result = Object.fromEntries(DEFECT_COLUMNS.map(([key]) => [key, []]));
    issues.forEach(issue => result[deriveDefectStatus(issue)].push(issue));
    return result;
  }, [issues]);

  const allFindingsComplete = issues.length > 0 && issues.every(isIssueComplete);
  const assigned = Boolean(inspectionCase?.assigned_staff_id);
  const completedCount = issues.filter(isIssueComplete).length;
  const totalCount = Number(inspectionCase?.total_findings || issues.length || 0);
  const progress = Number.isFinite(Number(inspectionCase?.progress_percent))
    ? Math.max(0, Math.min(100, Number(inspectionCase.progress_percent)))
    : totalCount ? (completedCount / totalCount) * 100 : 0;

  const fieldStatus = String(selectedIssue?.field_verification_status || 'NOT_CHECKED').toUpperCase();
  const maintenanceEditable = ['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(fieldStatus);
  const verificationLocked = String(selectedIssue?.maintenance_status || 'PENDING').toUpperCase() !== 'PENDING';
  const verificationEditable = assigned && inspectionCase?.status !== 'COMPLETED' && !verificationLocked;
  const availableMaintenanceStatuses = useMemo(() => {
    const current = selectedIssue?.maintenance_status || 'PENDING';
    return [current, ...(MAINTENANCE_TRANSITIONS[current] || [])].filter((value, index, array) => array.indexOf(value) === index);
  }, [selectedIssue?.maintenance_status]);

  const claim = async () => {
    setBusyAction('claim');
    try {
      const updated = await trackIssuesApi.claim(caseId);
      applyCasePayload(updated);
      Alert.alert('တာဝန်ယူပြီးပါပြီ', 'စစ်ဆေးမှုCase တစ်ခုလုံးကို သင့်ထံ တာဝန်ပေးလိုက်ပါပြီ။');
    } catch (error) {
      Alert.alert('စစ်ဆေးမှုCaseကို တာဝန်မယူနိုင်ပါ', safeDetail(error));
    } finally {
      setBusyAction(null);
    }
  };

  const changeCaseStatus = async nextStatus => {
    if (['BLOCKED', 'COMPLETED'].includes(nextStatus) && !caseNote.trim()) {
      Alert.alert('မှတ်ချက်လိုအပ်သည်', nextStatus === 'COMPLETED' ? 'Case ပြီးစီးမှုအကျဉ်းချုပ်ကို ထည့်ပါ။' : 'Case ရပ်တန့်ရသည့်အကြောင်းရင်းကို ထည့်ပါ။');
      return;
    }
    if (nextStatus === 'VERIFYING' && !allFindingsComplete) {
      Alert.alert('စစ်ဆေးမှု မပြီးသေးပါ', 'ချို့ယွင်းချက်အားလုံး၏ ကွင်းဆင်းအတည်ပြုမှုနှင့် ပြုပြင်ထိန်းသိမ်းမှုရလဒ် ပြီးစီးမှသာ အပြီးသတ်စစ်ဆေးမှု စတင်နိုင်ပါသည်။');
      return;
    }
    setBusyAction(`case-status-${nextStatus}`);
    try {
      const updated = await trackIssuesApi.updateStatus(caseId, nextStatus, caseNote.trim() || null);
      applyCasePayload(updated);
      setCaseNote('');
      setCaseWorkflowOpen(false);
    } catch (error) {
      Alert.alert('Caseအခြေအနေ မပြောင်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusyAction(null);
    }
  };

  const checkLocation = async () => {
    if (!selectedIssue) return;
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('တည်နေရာလိုအပ်သည်', 'ချို့ယွင်းချက်တည်နေရာနှင့် နှိုင်းယှဉ်ရန် တည်နေရာအသုံးပြုခွင့် လိုအပ်ပါသည်။');
      return;
    }
    setBusyAction('location-check');
    Geolocation.getCurrentPosition(async position => {
      const current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setEngineerLocation(current);
      try {
        const result = await trackIssuesApi.checkLocation(caseId, selectedIssue.id, {
          latitude: current.latitude,
          longitude: current.longitude,
          accuracy_meters: current.accuracy,
        });
        setLocationResult(result);
        await load(true);
        if (result.gps_reliable === false) {
          Alert.alert('GPS တိကျမှု မလုံလောက်ပါ', 'အချက်ပြကောင်းသည့်နေရာသို့ ရွှေ့ပြီး ထပ်မံစစ်ဆေးပါ။');
        }
      } catch (error) {
        Alert.alert('တည်နေရာစစ်ဆေးမှု မအောင်မြင်ပါ', safeDetail(error));
      } finally {
        setBusyAction(null);
      }
    }, error => {
      setBusyAction(null);
      Alert.alert('တည်နေရာ မရနိုင်ပါ', error.message);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const previewLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) return;
    setBusyAction('gps-preview');
    Geolocation.getCurrentPosition(position => {
      setEngineerLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setBusyAction(null);
    }, error => {
      setBusyAction(null);
      Alert.alert('တည်နေရာ မရနိုင်ပါ', error.message);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 });
  };

  const saveVerification = async () => {
    if (!selectedIssue || verificationLocked) return;
    if (!verificationNote.trim()) {
      Alert.alert('တွေ့ရှိချက်ရေးရန်လိုသည်', 'ကွင်းဆင်းစစ်ဆေးရာတွင် ဘာတွေ့ရှိခဲ့သည်ကို ရေးပါ။');
      return;
    }

    const submittedIssueId = selectedIssue.id;
    const submittedStatus = verificationStatus;
    const submittedNote = verificationNote.trim();
    setBusyAction('verification');

    try {
      // This endpoint already returns the updated full case. Reusing that response
      // avoids an unnecessary GET immediately after a successful save.
      const updated = await trackIssuesApi.verifyFinding(caseId, submittedIssueId, submittedStatus, submittedNote);
      applyCasePayload(updated);
      setVerificationNote('');
    } catch (error) {
      if (isNetworkError(error)) {
        // A mobile connection can drop after Cloud Run commits the PATCH but
        // before Android receives the response. Check the server state before
        // telling the engineer to submit again, preventing duplicate activities.
        try {
          setBusyAction('verification-check');
          const latestPayload = await trackIssuesApi.getById(caseId);
          const latestCase = latestPayload?.case || latestPayload;
          applyCasePayload(latestCase);
          const latestIssue = (latestCase?.issues || []).find(item => String(item.id) === String(submittedIssueId));
          const saved = String(latestIssue?.field_verification_status || '').toUpperCase() === String(submittedStatus).toUpperCase()
            && String(latestIssue?.field_verification_note || '').trim() === submittedNote;
          if (saved) {
            setVerificationNote('');
            Alert.alert('သိမ်းဆည်းပြီးပါပြီ', 'ချိတ်ဆက်မှု ခဏပြတ်ခဲ့သော်လည်း ကွင်းဆင်းအတည်ပြုမှုကို ဆာဗာတွင် သိမ်းဆည်းပြီးဖြစ်သည်။');
            return;
          }
        } catch (_) {
          // Fall through to the normal network message while preserving the text.
        }
      }
      Alert.alert('ကွင်းဆင်းအတည်ပြုမှု မသိမ်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusyAction(null);
    }
  };

  const saveMaintenance = async () => {
    if (!selectedIssue || !maintenanceEditable) return;
    if (['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED', 'FOLLOW_UP_REQUIRED'].includes(maintenanceStatus) && !maintenanceNote.trim()) {
      Alert.alert('မှတ်ချက်လိုအပ်သည်', 'နောက်ဆုံး ပြုပြင်မှု သို့မဟုတ် ထပ်မံစစ်ဆေးရမည့် အကြောင်းအရာကို ရေးပါ။');
      return;
    }

    const submittedIssueId = selectedIssue.id;
    const submittedStatus = maintenanceStatus;
    const submittedNote = maintenanceNote.trim();
    setBusyAction('maintenance');
    try {
      const updated = await trackIssuesApi.updateMaintenance(caseId, submittedIssueId, submittedStatus, submittedNote || null);
      applyCasePayload(updated);
      setMaintenanceNote('');
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          setBusyAction('maintenance-check');
          const latestPayload = await trackIssuesApi.getById(caseId);
          const latestCase = latestPayload?.case || latestPayload;
          applyCasePayload(latestCase);
          const latestIssue = (latestCase?.issues || []).find(item => String(item.id) === String(submittedIssueId));
          if (String(latestIssue?.maintenance_status || '').toUpperCase() === String(submittedStatus).toUpperCase()) {
            setMaintenanceNote('');
            Alert.alert('သိမ်းဆည်းပြီးပါပြီ', 'ချိတ်ဆက်မှု ခဏပြတ်ခဲ့သော်လည်း ပြုပြင်ထိန်းသိမ်းမှုအခြေအနေကို ဆာဗာတွင် သိမ်းဆည်းပြီးဖြစ်သည်။');
            return;
          }
        } catch (_) {
          // Keep the user's note so they can retry safely.
        }
      }
      Alert.alert('ပြုပြင်ထိန်းသိမ်းမှု မသိမ်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusyAction(null);
    }
  };

  const refreshConversation = async () => {
    if (!caseId || chatLoading) return;
    setChatLoading(true);
    setChatError('');
    try {
      const latestPayload = await trackIssuesApi.getById(caseId);
      applyCasePayload(latestPayload);
    } catch (error) {
      setChatError(safeDetail(error));
    } finally {
      setChatLoading(false);
    }
  };

  const openConversation = () => {
    setChatOpen(true);
    refreshConversation();
  };

  const sendCaseComment = async () => {
    const submittedMessage = caseComment.trim();
    if (!submittedMessage) return;
    setBusyAction('case-comment');
    setChatError('');
    try {
      const updated = await trackIssuesApi.addCaseComment(caseId, submittedMessage, 'COMMENT');
      applyCasePayload(updated);
      setCaseComment('');
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          const latestPayload = await trackIssuesApi.getById(caseId);
          const latestCase = latestPayload?.case || latestPayload;
          applyCasePayload(latestCase);
          const saved = (latestCase?.activities || []).some(activity =>
            isMessageActivity(activity)
            && !activity.issue_id
            && String(activity.message || '').trim() === submittedMessage
          );
          if (saved) {
            setCaseComment('');
            setChatError('');
            return;
          }
        } catch (_) {
          // Preserve the draft if the follow-up read is also unavailable.
        }
      }
      const detail = safeDetail(error);
      setChatError(detail);
      Alert.alert('စာတို မပို့နိုင်ပါ', detail);
    } finally {
      setBusyAction(null);
    }
  };


  const sendFindingComment = async () => {
    const submittedMessage = findingComment.trim();
    if (!selectedIssue || !submittedMessage) return;
    const submittedIssueId = selectedIssue.id;
    setBusyAction('finding-comment');
    try {
      const updated = await trackIssuesApi.addIssueComment(caseId, submittedIssueId, submittedMessage, 'COMMENT');
      applyCasePayload(updated);
      setFindingComment('');
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          const latestPayload = await trackIssuesApi.getById(caseId);
          const latestCase = latestPayload?.case || latestPayload;
          applyCasePayload(latestCase);
          const saved = (latestCase?.activities || []).some(activity =>
            isMessageActivity(activity)
            && String(activity.issue_id || '') === String(submittedIssueId)
            && String(activity.message || '').trim() === submittedMessage
          );
          if (saved) {
            setFindingComment('');
            return;
          }
        } catch (_) {
          // Preserve the draft if the follow-up read is unavailable.
        }
      }
      Alert.alert('ချို့ယွင်းချက် မှတ်ချက် မပို့နိုင်ပါ', safeDetail(error));
    } finally {
      setBusyAction(null);
    }
  };


  const openDefect = issue => {
    setSelectedIssueId(issue.id);
    setDefectModalOpen(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primaryStrong} />
        <Text style={styles.muted}>စစ်ဆေးမှုCaseကို ရယူနေသည်…</Text>
      </View>
    );
  }

  if (!inspectionCase) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="alert-circle-outline" size={44} color={colors.danger} />
        <Text style={styles.muted}>စစ်ဆေးမှုCaseကို မတွေ့ပါ။</Text>
        <LightButton title="နောက်သို့" icon="arrow-left" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const statusPalette = inspectionCase.status === 'COMPLETED'
    ? [colors.successSoft, colors.success]
    : inspectionCase.status === 'BLOCKED'
      ? ['#F1F5F9', '#64748B']
      : [colors.surfaceBlue, colors.primaryDark];

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primaryStrong} />}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={colors.textSoft} />
          </TouchableOpacity>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.eyebrow}>စစ်ဆေးမှု CASE</Text>
            <Text style={styles.topBarTitle} numberOfLines={1}>{caseTitle(inspectionCase)}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => load(true)} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={colors.primaryStrong} />
              : <Icon name="refresh" size={20} color={colors.textSoft} />}
          </TouchableOpacity>
        </View>

        <View style={styles.caseHero}>
          <View style={styles.rowBetween}>
            <View style={[styles.caseStatus, { backgroundColor: statusPalette[0] }]}>
              <View style={[styles.caseStatusDot, { backgroundColor: statusPalette[1] }]} />
              <Text style={[styles.caseStatusText, { color: statusPalette[1] }]}>{caseStatusLabel(inspectionCase.status)}</Text>
            </View>
            <Text style={styles.caseId}>#{shortId(inspectionCase.id)}</Text>
          </View>

          <Text style={styles.caseHeroTitle}>{caseTitle(inspectionCase)}</Text>
          <Text style={styles.caseHeroMeta}>စစ်ဆေးမှု {inspectionCase.inspection_id || '—'} · ချို့ယွင်းချက် {totalCount} ခု</Text>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{completedCount}/{totalCount} လုပ်ငန်းစဉ် ပြီးစီး</Text>
            <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

          <View style={styles.heroActions}>
            <LightButton compact title="LLM သုံးသပ်ချက်" icon="robot-outline" onPress={() => setShowCaseAI(true)} />
            <LightButton compact title="Case အခြေအနေ" icon="tune-variant" onPress={() => setCaseWorkflowOpen(true)} disabled={!assigned || inspectionCase.status === 'COMPLETED'} />
            {!assigned && inspectionCase.status !== 'COMPLETED' ? (
              <LightButton compact title="တာဝန်ယူရန်" loadingTitle="တာဝန်ယူနေသည်…" icon="hand-extended-outline" onPress={claim} loading={busyAction === 'claim'} disabled={busy && busyAction !== 'claim'} />
            ) : null}
          </View>
        </View>

        <View style={styles.boardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>ချို့ယွင်းချက် လုပ်ငန်းစဉ်</Text>
            <Text style={styles.sectionHint}>ချို့ယွင်းချက်ကတ်ကို နှိပ်၍ ကွင်းဆင်းဖောင်များကို ဖွင့်နိုင်ပြီး ဘုတ်ကို အလျားလိုက် ဆွဲကြည့်နိုင်ပါသည်။</Text>
          </View>
          <View style={styles.boardCount}><Text style={styles.boardCountText}>{issues.length}</Text></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardScroller} decelerationRate="fast">
          {DEFECT_COLUMNS.map(([key, title, icon]) => {
            const items = groupedIssues[key] || [];
            return (
              <View key={key} style={[styles.kanbanColumn, { width: columnWidth }]}>
                <View style={styles.columnHeader}>
                  <View style={styles.columnTitleRow}>
                    <View style={styles.columnIcon}><Icon name={icon} size={16} color={colors.primaryDark} /></View>
                    <Text style={styles.columnTitle}>{title}</Text>
                  </View>
                  <View style={styles.countBubble}><Text style={styles.countBubbleText}>{items.length}</Text></View>
                </View>

                {items.length ? items.map(issue => {
                  const p = priorityPalette(issue.ai_priority);
                  const complete = isIssueComplete(issue);
                  return (
                    <TouchableOpacity key={issue.id} activeOpacity={0.88} style={styles.defectCard} onPress={() => openDefect(issue)}>
                      <View style={styles.defectCardHeader}>
                        <View style={[styles.defectIconBox, complete && { backgroundColor: colors.successSoft }]}>
                          <Icon name={complete ? 'check' : 'alert-decagram-outline'} size={18} color={complete ? colors.success : colors.primaryStrong} />
                        </View>
                        <TouchableOpacity
                          style={styles.aiMiniButton}
                          onPress={event => {
                            event.stopPropagation?.();
                            setAiIssue(issue);
                          }}
                        >
                          <Icon name="robot-outline" size={17} color={colors.violet} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.defectTitle}>{defectTypeLabel(issue.defect_type)}</Text>
                      <View style={styles.defectMetaRow}>
                        <Pill text={priorityLabel(issue.ai_priority || 'ROUTINE')} backgroundColor={p[0]} color={p[1]} />
                        {issue.rail_side ? <Pill text={railSideLabel(issue.rail_side)} icon="railroad-light" /> : null}
                      </View>
                      <View style={styles.defectFacts}>
                        <View style={styles.factRow}><Icon name="shield-check-outline" size={14} color={colors.muted} /><Text style={styles.factText}>{fieldStatusLabel(issue.field_verification_status || 'NOT_CHECKED')}</Text></View>
                        <View style={styles.factRow}><Icon name="wrench-outline" size={14} color={colors.muted} /><Text style={styles.factText}>{maintenanceStatusLabel(issue.maintenance_status)}</Text></View>
                        {issue.distance_from_start_miles != null ? <View style={styles.factRow}><Icon name="map-marker-distance" size={14} color={colors.muted} /><Text style={styles.factText}>စတင်ရာမှ {Number(issue.distance_from_start_miles).toFixed(3)} မိုင်</Text></View> : null}
                      </View>
                      <View style={styles.cardOpenRow}><Text style={styles.cardOpenText}>ကွင်းဆင်းလုပ်ငန်းစဉ် ဖွင့်ရန်</Text><Icon name="arrow-right" size={16} color={colors.primaryDark} /></View>
                    </TouchableOpacity>
                  );
                }) : (
                  <View style={styles.emptyColumn}><Icon name="tray" size={24} color={colors.borderStrong} /><Text style={styles.emptyText}>ချို့ယွင်းချက် မရှိပါ</Text></View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {!allFindingsComplete && inspectionCase.status === 'IN_PROGRESS' ? (
          <View style={styles.infoNotice}>
            <Icon name="information-outline" size={19} color={colors.primaryStrong} />
            <Text style={styles.infoNoticeText}>ချို့ယွင်းချက်အားလုံး၏ ကွင်းဆင်းအတည်ပြုမှုနှင့် ပြုပြင်ထိန်းသိမ်းမှုရလဒ် ပြီးစီးမှသာ အပြီးသတ်စစ်ဆေးမှုကို ဖွင့်ပေးပါမည်။</Text>
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity style={styles.chatFab} onPress={openConversation} activeOpacity={0.86}>
        <Icon name="message-text-outline" size={23} color={colors.primaryDark} />
        <View style={styles.chatBadge}><Text style={styles.chatBadgeText}>{inspectionCase.activities?.filter(isMessageActivity).length || 0}</Text></View>
      </TouchableOpacity>

      <SheetModal
        visible={defectModalOpen && Boolean(selectedIssue)}
        onClose={() => setDefectModalOpen(false)}
        title={defectTypeLabel(selectedIssue?.defect_type)}
        subtitle={`ချို့ယွင်းချက် #${shortId(selectedIssue?.id)} · ${priorityLabel(selectedIssue?.ai_priority || 'ROUTINE')}`}
        icon="clipboard-text-search-outline"
        fullHeight
      >
        {selectedIssue ? (
          <>
            <View style={styles.modalActionRow}>
              <LightButton compact title="LLM သုံးသပ်ချက်" icon="robot-outline" onPress={() => setAiIssue(selectedIssue)} />
              <LightButton compact title="GPS ပြန်ရယူရန်" loadingTitle="GPS ရယူနေသည်…" icon="crosshairs" onPress={previewLocation} loading={busyAction === 'gps-preview'} disabled={busy && busyAction !== 'gps-preview'} />
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.cardLabel}>ချို့ယွင်းချက် အချက်အလက်</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailCell}><Text style={styles.detailLabel}>AI ယုံကြည်မှု</Text><Text style={styles.detailValue}>{selectedIssue.confidence != null ? `${(Number(selectedIssue.confidence) * 100).toFixed(1)}%` : '—'}</Text></View>
                <View style={styles.detailCell}><Text style={styles.detailLabel}>သံလမ်းဘက်</Text><Text style={styles.detailValue}>{railSideLabel(selectedIssue.rail_side)}</Text></View>
              </View>
              <View style={styles.detailGrid}>
                <View style={styles.detailCell}><Text style={styles.detailLabel}>ကွင်းဆင်းအတည်ပြုမှု</Text><Text style={styles.detailValue}>{fieldStatusLabel(selectedIssue.field_verification_status)}</Text></View>
                <View style={styles.detailCell}><Text style={styles.detailLabel}>ပြုပြင်ထိန်းသိမ်းမှု</Text><Text style={styles.detailValue}>{maintenanceStatusLabel(selectedIssue.maintenance_status)}</Text></View>
              </View>
              {selectedIssue.field_verification_note ? (
                <View style={styles.savedNoteBox}>
                  <Text style={styles.savedNoteLabel}>နောက်ဆုံး ကွင်းဆင်းမှတ်ချက်</Text>
                  <Text style={styles.savedNoteText}>{selectedIssue.field_verification_note}</Text>
                </View>
              ) : null}
              {selectedIssue.maintenance_note ? (
                <View style={styles.savedNoteBox}>
                  <Text style={styles.savedNoteLabel}>နောက်ဆုံး ပြုပြင်ထိန်းသိမ်းမှုမှတ်ချက်</Text>
                  <Text style={styles.savedNoteText}>{selectedIssue.maintenance_note}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.modalSectionTitle}>ချို့ယွင်းချက် တည်နေရာ</Text>
            {defectModalOpen ? (
              <DefectLocationMap issue={selectedIssue} engineerLocation={engineerLocation} />
            ) : null}

            <Text style={styles.modalSectionTitle}>တည်နေရာ မှတ်တမ်း</Text>
            <View style={styles.locationMetaCard}>
              <View style={styles.locationMetaRow}><Text style={styles.locationMetaLabel}>နောက်ဆုံးအနီးအဝေး</Text><Text style={styles.locationMetaValue}>{selectedIssue.last_location_proximity || '—'}</Text></View>
              <View style={styles.locationMetaRow}><Text style={styles.locationMetaLabel}>နောက်ဆုံးအကွာအဝေး</Text><Text style={styles.locationMetaValue}>{selectedIssue.last_location_distance_miles != null ? `${Number(selectedIssue.last_location_distance_miles).toFixed(3)} မိုင်` : '—'}</Text></View>
              <View style={styles.locationMetaRow}><Text style={styles.locationMetaLabel}>နေရာရောက်ရှိမှု အတည်ပြုပြီး</Text><Text style={styles.locationMetaValue}>{yesNoLabel(Boolean(selectedIssue.location_verified_at))}</Text></View>
            </View>
            <View style={styles.modalActionRow}>
              {assigned ? <LightButton compact title="တည်နေရာ မှတ်တမ်းတင်ရန်" loadingTitle="တည်နေရာစစ်နေသည်…" icon="crosshairs-gps" onPress={checkLocation} loading={busyAction === 'location-check'} disabled={busy && busyAction !== 'location-check'} /> : null}
            </View>
            {locationResult ? (
              <View style={[styles.resultBox, locationResult.gps_reliable === false && styles.warningResult]}>
                <Icon name={locationResult.gps_reliable === false ? 'alert-outline' : 'check-circle-outline'} size={18} color={locationResult.gps_reliable === false ? colors.warning : colors.success} />
                <Text style={styles.resultText}>{locationResult.proximity || '—'} · {Number(locationResult.distance_miles || 0).toFixed(3)} မိုင်</Text>
              </View>
            ) : null}

            <Text style={styles.modalSectionTitle}>ကွင်းဆင်းအတည်ပြုမှု</Text>
            <View style={styles.formCard}>
              {verificationLocked ? (
                <View style={styles.lockedNotice}>
                  <Icon name="lock-outline" size={18} color={colors.warning} />
                  <Text style={styles.lockedText}>ပြုပြင်ထိန်းသိမ်းမှုအခြေအနေကို ရွေးချယ်ပြီးဖြစ်သဖြင့် ကွင်းဆင်းအတည်ပြုမှုကို ထပ်မံပြောင်းလဲ၍ မရတော့ပါ။</Text>
                </View>
              ) : !assigned ? (
                <View style={styles.lockedNotice}>
                  <Icon name="lock-outline" size={18} color={colors.warning} />
                  <Text style={styles.lockedText}>ဤ Case ကို သင့်ထံ တာဝန်ပေးပြီးမှ ကွင်းဆင်းအတည်ပြုမှုကို မှတ်တမ်းတင်နိုင်ပါသည်။</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.formHint}>သံလမ်းပေါ်တွင် လက်တွေ့မြင်တွေ့ရသည့်အခြေအနေကို ရွေးချယ်ပြီး မှတ်ချက်ရေးပါ။</Text>
                  <View style={styles.choiceWrap}>
                    {VERIFICATION_OPTIONS.map(([value, title]) => (
                      <TouchableOpacity
                        key={value}
                        disabled={!verificationEditable || busyAction === 'verification'}
                        style={[styles.choice, verificationStatus === value && styles.choiceActive, (!verificationEditable || busyAction === 'verification') && styles.choiceDisabled]}
                        onPress={() => setVerificationStatus(value)}
                      >
                        <Text style={[styles.choiceText, verificationStatus === value && styles.choiceTextActive]}>{title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.textArea, busyAction === 'verification' && styles.inputDisabled]}
                    multiline
                    editable={verificationEditable && busyAction !== 'verification'}
                    placeholder="လက်တွေ့ကွင်းဆင်းစစ်ဆေးရာတွင် ဘာတွေ့ရှိခဲ့ပါသလဲ?"
                    placeholderTextColor={colors.muted}
                    value={verificationNote}
                    onChangeText={setVerificationNote}
                  />
                  <LightButton
                    title="ကွင်းဆင်းအတည်ပြုမှု သိမ်းရန်"
                    loadingTitle="သိမ်းဆည်းနေသည်…"
                    icon="shield-check-outline"
                    onPress={saveVerification}
                    loading={busyAction === 'verification'}
                    disabled={!verificationEditable || (busy && busyAction !== 'verification')}
                  />
                </>
              )}
            </View>

            <Text style={styles.modalSectionTitle}>ပြုပြင်ထိန်းသိမ်းမှု ရလဒ်</Text>
            <View style={styles.formCard}>
              {!maintenanceEditable ? (
                <View style={styles.lockedNotice}>
                  <Icon name="lock-outline" size={18} color={colors.warning} />
                  <Text style={styles.lockedText}>
                    {fieldStatus === 'NOT_CHECKED'
                      ? 'ကွင်းဆင်းအတည်ပြုမှုကို အရင်သိမ်းပါ။ ချို့ယွင်းချက်ကို အတည်ပြုပြီးမှ ပြုပြင်ထိန်းသိမ်းမှု ရွေးချယ်စရာများ ဖွင့်ပေးပါမည်။'
                      : fieldStatus === 'NOT_CONFIRMED'
                        ? 'ချို့ယွင်းချက် မတွေ့ရှိဟု အတည်ပြုထားသောကြောင့် ပြုပြင်ရန်မလိုအပ်သည့်အဖြစ် စနစ်က သတ်မှတ်ပေးပါမည်။'
                        : 'အတည်မပြုနိုင်သော ချို့ယွင်းချက်ကို ထပ်မံစစ်ဆေးရန် လုပ်ငန်းစဉ်သို့ ပို့ထားပါမည်။'}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.formHint}>လက်ရှိအခြေအနေမှ ပြောင်းလဲနိုင်သည့် မှန်ကန်သော နောက်အဆင့်များသာ ပြသထားပါသည်။</Text>
                  <View style={styles.choiceWrap}>
                    {availableMaintenanceStatuses.map(value => (
                      <TouchableOpacity
                        key={value}
                        disabled={!assigned || inspectionCase.status === 'COMPLETED' || busyAction === 'maintenance'}
                        style={[styles.choice, maintenanceStatus === value && styles.choiceActive, (!assigned || inspectionCase.status === 'COMPLETED' || busyAction === 'maintenance') && styles.choiceDisabled]}
                        onPress={() => setMaintenanceStatus(value)}
                      >
                        <Text style={[styles.choiceText, maintenanceStatus === value && styles.choiceTextActive]}>{maintenanceStatusLabel(value)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.textArea, busyAction === 'maintenance' && styles.inputDisabled]}
                    multiline
                    editable={assigned && inspectionCase.status !== 'COMPLETED' && busyAction !== 'maintenance'}
                    placeholder="ပြုပြင်မှုရလဒ်၊ ပြုပြင်ရန်မလိုသည့်အကြောင်းရင်း သို့မဟုတ် ထပ်မံစစ်ဆေးရန် မှတ်ချက်…"
                    placeholderTextColor={colors.muted}
                    value={maintenanceNote}
                    onChangeText={setMaintenanceNote}
                  />
                  {assigned && inspectionCase.status !== 'COMPLETED' ? (
                    <LightButton
                      title="ပြုပြင်ထိန်းသိမ်းမှု ရလဒ် သိမ်းရန်"
                      loadingTitle="သိမ်းဆည်းနေသည်…"
                      icon="wrench-check-outline"
                      onPress={saveMaintenance}
                      loading={busyAction === 'maintenance'}
                      disabled={busy && busyAction !== 'maintenance'}
                    />
                  ) : null}
                </>
              )}
            </View>

            {assigned && inspectionCase.status !== 'COMPLETED' ? (
              <>
                <Text style={styles.modalSectionTitle}>ချို့ယွင်းချက် မှတ်ချက်</Text>
                <View style={styles.formCard}>
                  <TextInput
                    style={[styles.textArea, busyAction === 'finding-comment' && styles.inputDisabled]}
                    multiline
                    editable={busyAction !== 'finding-comment'}
                    placeholder="ဤချို့ယွင်းချက်အတွက် မှတ်ချက်ရေးပါ…"
                    placeholderTextColor={colors.muted}
                    value={findingComment}
                    onChangeText={setFindingComment}
                  />
                  <LightButton
                    title="မှတ်ချက် ပို့ရန်"
                    loadingTitle="ပို့နေသည်…"
                    icon="send-outline"
                    onPress={sendFindingComment}
                    loading={busyAction === 'finding-comment'}
                    disabled={!findingComment.trim() || (busy && busyAction !== 'finding-comment')}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </SheetModal>

      <SheetModal
        visible={caseWorkflowOpen}
        onClose={() => setCaseWorkflowOpen(false)}
        title="Case လုပ်ငန်းစဉ်"
        subtitle={`${caseStatusLabel(inspectionCase.status)} · ${completedCount}/${totalCount} ချို့ယွင်းချက် ပြီးစီး`}
        icon="tune-variant"
      >
        <View style={styles.formCard}>
          <Text style={styles.formHint}>Case ရပ်တန့်ခြင်း သို့မဟုတ် ပြီးစီးခြင်းအတွက် မှတ်ချက်လိုအပ်ပြီး အခြားအဆင့်များအတွက် လိုအပ်ပါက လုပ်ငန်းတိုးတက်မှုမှတ်ချက် ထည့်နိုင်ပါသည်။</Text>
          <TextInput
            style={styles.textArea}
            multiline
            editable={!busyAction?.startsWith('case-status-')}
            placeholder="Caseအပ်ဒိတ်၊ ရပ်တန့်ရသည့်အကြောင်းရင်း သို့မဟုတ် ပြီးစီးမှုအကျဉ်းချုပ်…"
            placeholderTextColor={colors.muted}
            value={caseNote}
            onChangeText={setCaseNote}
          />
          <View style={styles.workflowButtons}>
            {(CASE_TRANSITIONS[inspectionCase.status] || []).map(status => {
              const loadingStatus = busyAction === `case-status-${status}`;
              const disabled = (busy && !loadingStatus) || (status === 'VERIFYING' && !allFindingsComplete);
              return (
                <LightButton
                  key={status}
                  title={CASE_ACTION_LABELS[status] || caseStatusLabel(status)}
                  loadingTitle="အခြေအနေ ပြောင်းနေသည်…"
                  icon={status === 'BLOCKED' ? 'pause-circle-outline' : status === 'COMPLETED' ? 'check-circle-outline' : 'arrow-right-circle-outline'}
                  danger={status === 'BLOCKED'}
                  onPress={() => changeCaseStatus(status)}
                  loading={loadingStatus}
                  disabled={disabled}
                />
              );
            })}
          </View>
          {!allFindingsComplete && inspectionCase.status === 'IN_PROGRESS' ? <Text style={styles.workflowWarning}>ချို့ယွင်းချက်လုပ်ငန်းစဉ်အားလုံး ပြီးစီးမှသာ အပြီးသတ်စစ်ဆေးမှုကို စတင်နိုင်ပါသည်။</Text> : null}
        </View>
      </SheetModal>

      <SheetModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        title="Case စကားဝိုင်း"
        subtitle="အင်ဂျင်နီယာ၊ စီမံခန့်ခွဲသူနှင့် စနစ်အပ်ဒိတ်များ"
        icon="message-text-outline"
        fullHeight
        footer={assigned ? (
          <View style={styles.chatInputBar}>
            <TextInput
              style={[styles.chatInput, busyAction === 'case-comment' && styles.inputDisabled]}
              multiline
              editable={busyAction !== 'case-comment'}
              placeholder="စာတိုရေးပါ…"
              placeholderTextColor={colors.muted}
              value={caseComment}
              onChangeText={setCaseComment}
            />
            <TouchableOpacity
              style={[styles.chatSendButton, (!caseComment.trim() || (busy && busyAction !== 'case-comment')) && styles.chatSendDisabled]}
              onPress={sendCaseComment}
              disabled={!caseComment.trim() || busy}
            >
              {busyAction === 'case-comment'
                ? <ActivityIndicator size="small" color={colors.primaryDark} />
                : <Icon name="send" size={19} color={colors.primaryDark} />}
            </TouchableOpacity>
          </View>
        ) : null}
      >
        <View style={styles.chatHeaderHint}>
          <Icon name="information-outline" size={16} color={colors.primaryStrong} />
          <Text style={styles.chatHeaderHintText}>အင်ဂျင်နီယာနှင့် အက်ဒမင်စာတိုများကို နှစ်ဖက်စကားဝိုင်းပုံစံဖြင့် ပြသထားသည်။ လုပ်ငန်းစဉ်အပ်ဒိတ်များကို အလယ်တွင် သီးခြားပြသပါသည်။</Text>
          <TouchableOpacity style={styles.chatRefreshButton} onPress={refreshConversation} disabled={chatLoading}>
            {chatLoading ? <ActivityIndicator size="small" color={colors.primaryDark} /> : <Icon name="refresh" size={17} color={colors.primaryDark} />}
          </TouchableOpacity>
        </View>
        {chatError ? <View style={styles.chatErrorBox}><Icon name="wifi-alert" size={15} color={colors.danger} /><Text style={styles.chatErrorText}>{chatError}</Text></View> : null}
        {chatLoading && !(inspectionCase.activities || []).length ? (
          <View style={styles.emptyChat}><ActivityIndicator size="small" color={colors.primaryStrong} /><Text style={styles.emptyText}>စကားဝိုင်း ရယူနေသည်…</Text></View>
        ) : null}

        {[...(inspectionCase.activities || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(activity => {
          const isChatMessage = isMessageActivity(activity);
          const isEngineer = String(activity.actor_role || '').toUpperCase() === 'TRACK_ENGINEER';
          if (isChatMessage) {
            return (
              <View key={activity.id} style={[styles.chatMessageRow, isEngineer ? styles.chatMessageRowRight : styles.chatMessageRowLeft]}>
                <View style={[styles.chatBubble, isEngineer ? styles.chatBubbleMine : styles.chatBubbleOther]}>
                  <View style={styles.chatBubbleHeader}>
                    <Text style={styles.chatActor}>{activity.actor_name || activity.actor_staff_id || (isEngineer ? 'ကွင်းဆင်းအင်ဂျင်နီယာ' : 'စီမံခန့်ခွဲသူ')}</Text>
                    <Text style={styles.chatTime}>{formatDate(activity.created_at)}</Text>
                  </View>
                  <View style={styles.chatTagRow}>
                    <Text style={styles.chatKindTag}>{messageKindLabel(activity.message_kind)}</Text>
                    {activity.issue_defect_type ? <Text style={styles.chatIssueTag}>{defectTypeLabel(activity.issue_defect_type)}</Text> : null}
                  </View>
                  <Text style={styles.chatMessageText}>{activity.message}</Text>
                </View>
              </View>
            );
          }

          return (
            <View key={activity.id} style={styles.systemEventWrap}>
              <View style={styles.systemEventCard}>
                <Icon name="history" size={14} color={colors.primaryStrong} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.systemEventTitle}>{activityTypeLabel(activity.activity_type)}</Text>
                  {activity.issue_defect_type ? <Text style={styles.systemEventMeta}>{defectTypeLabel(activity.issue_defect_type)}</Text> : null}
                  {activity.from_status && activity.to_status ? (
                    <Text style={styles.systemEventMeta}>{caseStatusLabel(activity.from_status)} → {caseStatusLabel(activity.to_status)}</Text>
                  ) : null}
                  {activity.message ? <Text style={styles.systemEventMessage}>{activity.message}</Text> : null}
                  <Text style={styles.systemEventTime}>{formatDate(activity.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        })}
        {!chatLoading && !inspectionCase.activities?.length ? <View style={styles.emptyChat}><Icon name="message-outline" size={25} color={colors.borderStrong} /><Text style={styles.emptyText}>စကားဝိုင်း မရှိသေးပါ</Text></View> : null}
      </SheetModal>

      <AIReviewModal visible={showCaseAI} inspectionCase={inspectionCase} onClose={() => setShowCaseAI(false)} />
      <AIReviewModal visible={Boolean(aiIssue)} issue={aiIssue} onClose={() => setAiIssue(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, paddingTop: 16, paddingBottom: 96 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12, padding: 24 },
  muted: { color: colors.muted, fontSize: 13 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  topBarTitleWrap: { flex: 1 },
  eyebrow: { color: colors.primaryStrong, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  topBarTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 2 },
  caseHero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: 16, ...shadow },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  caseStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 6 },
  caseStatusDot: { width: 7, height: 7, borderRadius: 4 },
  caseStatusText: { fontSize: 10, fontWeight: '900' },
  caseId: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  caseHeroTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: '900', marginTop: 13 },
  caseHeroMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  progressLabel: { color: colors.textSoft, fontSize: 10.5 },
  progressValue: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: colors.surfaceBlue, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: colors.primaryStrong, borderRadius: 999 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 },
  lightButton: { minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  lightButtonCompact: { minHeight: 38, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  lightButtonText: { color: colors.primaryText, fontSize: 11.5, fontWeight: '900' },
  dangerButton: { backgroundColor: colors.dangerSoft, borderColor: '#F6C9CE' },
  disabledButton: { opacity: 0.42 },
  boardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 10.5, marginTop: 3, lineHeight: 15 },
  boardCount: { minWidth: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  boardCountText: { color: colors.primaryDark, fontWeight: '900', fontSize: 11 },
  boardScroller: { gap: 10, paddingRight: 14, paddingBottom: 8 },
  kanbanColumn: { backgroundColor: '#F0F8FD', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 10, minHeight: 255 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 1 },
  columnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  columnIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  columnTitle: { color: colors.textSoft, fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  countBubble: { minWidth: 27, height: 27, paddingHorizontal: 7, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  countBubbleText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '800' },
  defectCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginBottom: 9, ...shadow },
  defectCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  defectIconBox: { width: 35, height: 35, borderRadius: 11, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  aiMiniButton: { width: 33, height: 33, borderRadius: 10, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#DDD3F7', alignItems: 'center', justifyContent: 'center' },
  defectTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900', marginTop: 10, lineHeight: 20 },
  defectMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
  pillText: { fontSize: 9, fontWeight: '800' },
  defectFacts: { gap: 5, marginTop: 10 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: colors.muted, fontSize: 10.5, flex: 1 },
  cardOpenRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardOpenText: { color: colors.primaryDark, fontSize: 10.5, fontWeight: '900' },
  emptyColumn: { minHeight: 115, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyText: { color: colors.muted, fontSize: 10.5 },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginTop: 10 },
  infoNoticeText: { flex: 1, color: colors.textSoft, fontSize: 11.5, lineHeight: 18 },
  chatFab: { position: 'absolute', right: 18, bottom: 22, width: 56, height: 56, borderRadius: 19, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', ...shadow },
  chatBadge: { position: 'absolute', right: -4, top: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  chatBadgeText: { color: colors.white, fontSize: 8.5, fontWeight: '900' },
  modalActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 11 },
  detailCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginBottom: 14 },
  cardLabel: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 9 },
  detailGrid: { flexDirection: 'row', gap: 9, marginBottom: 8 },
  detailCell: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: radii.md, padding: 10 },
  detailLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  detailValue: { color: colors.text, fontSize: 11.5, fontWeight: '800', marginTop: 4 },
  modalSectionTitle: { color: colors.text, fontSize: 13.5, fontWeight: '900', marginTop: 5, marginBottom: 8 },
  locationMetaCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginTop: 10, padding: 11 },
  locationMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  locationMetaLabel: { color: colors.muted, fontSize: 10.5 },
  locationMetaValue: { color: colors.textSoft, fontSize: 10.5, fontWeight: '800' },
  resultBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.successSoft, borderRadius: radii.md, padding: 10, marginBottom: 10 },
  warningResult: { backgroundColor: colors.warningSoft },
  resultText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '700' },
  formCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, marginBottom: 14 },
  formHint: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginBottom: 9 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  choice: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 7 },
  choiceActive: { backgroundColor: colors.surfaceBlue, borderColor: colors.primaryStrong },
  choiceText: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
  choiceTextActive: { color: colors.primaryDark, fontWeight: '900' },
  choiceDisabled: { opacity: 0.48 },
  textArea: { minHeight: 88, backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 12, lineHeight: 18, textAlignVertical: 'top', marginBottom: 10 },
  inputDisabled: { opacity: 0.58, backgroundColor: colors.surfaceSoft },
  savedNoteBox: { backgroundColor: '#F8FCFF', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 10, marginTop: 4 },
  savedNoteLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '800' },
  savedNoteText: { color: colors.textSoft, fontSize: 11.5, lineHeight: 18, marginTop: 4 },
  lockedNotice: { flexDirection: 'row', gap: 8, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#F5DFB9', borderRadius: radii.md, padding: 11 },
  lockedText: { flex: 1, color: '#8B662A', fontSize: 10.5, lineHeight: 17 },
  workflowButtons: { gap: 8 },
  workflowWarning: { color: colors.warning, fontSize: 10.5, lineHeight: 16, marginTop: 9 },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: colors.surface },
  chatInput: { flex: 1, maxHeight: 110, minHeight: 44, backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, color: colors.text, fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
  chatSendButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  chatSendDisabled: { opacity: 0.4 },
  chatHeaderHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.surfaceBlue, borderRadius: radii.md, padding: 10, marginBottom: 14 },
  chatHeaderHintText: { flex: 1, color: colors.textSoft, fontSize: 10.5, lineHeight: 16 },
  chatRefreshButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  chatErrorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F6CDD2', borderRadius: radii.md, padding: 9, marginBottom: 10 },
  chatErrorText: { flex: 1, color: colors.danger, fontSize: 10, lineHeight: 15 },
  chatMessageRow: { width: '100%', marginBottom: 9, flexDirection: 'row' },
  chatMessageRowLeft: { justifyContent: 'flex-start' },
  chatMessageRowRight: { justifyContent: 'flex-end' },
  chatBubble: { maxWidth: '84%', borderRadius: 17, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1 },
  chatBubbleMine: { backgroundColor: colors.surfaceBlue, borderColor: colors.borderStrong, borderBottomRightRadius: 5 },
  chatBubbleOther: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 5 },
  chatBubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  chatActor: { color: colors.primaryDark, fontSize: 9.5, fontWeight: '900', flexShrink: 1 },
  chatTime: { color: colors.muted, fontSize: 8 },
  chatTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  chatKindTag: { alignSelf: 'flex-start', color: colors.primaryDark, backgroundColor: colors.surfaceSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 8.5, fontWeight: '800' },
  chatIssueTag: { alignSelf: 'flex-start', color: colors.violet, backgroundColor: colors.violetSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 8.5, fontWeight: '800' },
  chatMessageText: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 5 },
  systemEventWrap: { alignItems: 'center', marginVertical: 5 },
  systemEventCard: { maxWidth: '92%', minWidth: '62%', flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#F4F8FB', borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8 },
  systemEventTitle: { color: colors.textSoft, fontSize: 10, fontWeight: '900' },
  systemEventMeta: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 2 },
  systemEventMessage: { color: colors.textSoft, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  systemEventTime: { color: colors.muted, fontSize: 8, marginTop: 3 },
  emptyChat: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radii.lg },
});

export default TrackIssueDetailScreen;
