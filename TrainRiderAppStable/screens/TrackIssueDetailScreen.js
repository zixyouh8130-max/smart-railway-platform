import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import trackIssuesApi from '../api/trackIssues';
import DefectLocationMap from '../components/DefectLocationMap';
import { requestLocationPermission } from '../utils/locationPermission';

const CASE_COLORS = {
  OPEN: '#dc2626',
  ACKNOWLEDGED: '#2563eb',
  IN_PROGRESS: '#0891b2',
  VERIFYING: '#7c3aed',
  COMPLETED: '#059669',
  BLOCKED: '#4b5563',
  REOPENED: '#ea580c',
};

// Mirrors backend CASE_ENGINEER_TRANSITIONS.
const CASE_TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'BLOCKED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['COMPLETED', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['ACKNOWLEDGED', 'IN_PROGRESS'],
  REOPENED: ['IN_PROGRESS', 'BLOCKED'],
  COMPLETED: [],
};

// Mirrors backend MAINTENANCE_TRANSITIONS.
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
  ['PARTIALLY_CONFIRMED', 'တစ်စိတ်တစ်ပိုင်း အတည်ပြု'],
  ['NOT_CONFIRMED', 'မတွေ့ရှိ / False positive'],
  ['UNABLE_TO_VERIFY', 'အတည်မပြုနိုင်'],
];

const MAINTENANCE_LABELS = {
  PENDING: 'မသတ်မှတ်ရသေး',
  NO_ACTION_REQUIRED: 'ပြုပြင်ရန်မလို',
  REPAIR_REQUIRED: 'ပြုပြင်ရန်လို',
  REPAIR_IN_PROGRESS: 'ပြုပြင်နေဆဲ',
  REPAIR_COMPLETED: 'ပြုပြင်ပြီးစီး',
  FOLLOW_UP_REQUIRED: 'နောက်ဆက်တွဲစစ်ဆေးရန်လို',
};

const CASE_ACTION_LABELS = {
  ACKNOWLEDGED: 'Case ကို လက်ခံရန်',
  IN_PROGRESS: 'လုပ်ငန်းစတင်ရန်',
  VERIFYING: 'အပြီးသတ်သုံးသပ်ရန်',
  COMPLETED: 'Case ပြီးစီးရန်',
  BLOCKED: 'Case ကို ရပ်တန့်ထားရန်',
};

const label = value => String(value || '—').replace(/_/g, ' ');
const shortId = value => (value ? String(value).slice(0, 8) : '—');

const formatDate = value => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

const priorityRank = value => {
  const text = String(value || '').toLowerCase();
  if (text.includes('critical') || text.includes('urgent')) return 0;
  if (text.includes('priority') || text.includes('high')) return 1;
  if (text.includes('monitor') || text.includes('medium')) return 2;
  return 3;
};

const safeDetail = error => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) {
    const problems = Array.isArray(detail.problems) ? `\n• ${detail.problems.join('\n• ')}` : '';
    return `${detail.message}${problems}`;
  }
  return error?.message || 'ထပ်မံကြိုးစားပါ။';
};

const TrackIssueDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const caseId = route.params?.caseId || route.params?.issueId;

  const [inspectionCase, setInspectionCase] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationResult, setLocationResult] = useState(null);
  const [engineerLocation, setEngineerLocation] = useState(null);
  const [caseNote, setCaseNote] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('CONFIRMED');
  const [verificationNote, setVerificationNote] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('PENDING');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [caseComment, setCaseComment] = useState('');
  const [findingComment, setFindingComment] = useState('');

  const load = useCallback(
    async (refresh = false) => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      try {
        const data = await trackIssuesApi.getById(caseId);
        setInspectionCase(data?.case || data);
        const issues = data?.case?.issues || data?.issues || [];
        setSelectedIssueId(previous => {
          if (previous && issues.some(item => String(item.id) === String(previous))) {
            return previous;
          }
          const next = issues.find(item => !item.checklist_complete);
          return next?.id || issues[0]?.id || null;
        });
      } catch (error) {
        Alert.alert('Case ကို မရယူနိုင်ပါ', safeDetail(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [caseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load(true));
    return unsubscribe;
  }, [load, navigation]);

  const issues = inspectionCase?.issues || [];
  const selectedIssue = useMemo(
    () => issues.find(item => String(item.id) === String(selectedIssueId)) || null,
    [issues, selectedIssueId],
  );

  useEffect(() => {
    if (!selectedIssue) return;
    setVerificationStatus(
      selectedIssue.field_verification_status === 'NOT_CHECKED'
        ? 'CONFIRMED'
        : selectedIssue.field_verification_status,
    );
    setVerificationNote(selectedIssue.field_verification_note || '');
    setMaintenanceStatus(selectedIssue.maintenance_status || 'PENDING');
    setMaintenanceNote(selectedIssue.maintenance_note || '');
    setLocationResult(null);
    setEngineerLocation(null);
  }, [selectedIssueId, selectedIssue?.updated_at]);

  const sortedIssues = useMemo(
    () =>
      [...issues].sort((a, b) => {
        if (a.checklist_complete !== b.checklist_complete) return a.checklist_complete ? 1 : -1;
        const rank = priorityRank(a.ai_priority) - priorityRank(b.ai_priority);
        if (rank !== 0) return rank;
        return Number(a.distance_from_start_miles ?? 99999) - Number(b.distance_from_start_miles ?? 99999);
      }),
    [issues],
  );

  const allFindingsComplete = issues.length > 0 && issues.every(item => item.checklist_complete);
  const assigned = Boolean(inspectionCase?.assigned_staff_id);
  const caseAi = inspectionCase?.ai_snapshot || {};
  const issueAi = selectedIssue?.ai_snapshot || {};
  const eventContext = issueAi.event_context || {};
  const remaining = Math.max(
    0,
    Number(inspectionCase?.total_findings || 0) - Number(inspectionCase?.completed_findings || 0),
  );

  const fieldStatus = String(selectedIssue?.field_verification_status || 'NOT_CHECKED').toUpperCase();
  const maintenanceEditable = ['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(fieldStatus);
  const availableMaintenanceStatuses = useMemo(() => {
    const current = selectedIssue?.maintenance_status || 'PENDING';
    return [current, ...(MAINTENANCE_TRANSITIONS[current] || [])].filter(
      (value, index, array) => array.indexOf(value) === index,
    );
  }, [selectedIssue?.maintenance_status]);

  const claim = async () => {
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.claim(caseId));
      Alert.alert('တာဝန်ယူပြီးပါပြီ', 'Inspection Case တစ်ခုလုံးကို သင့်ထံ တာဝန်ပေးလိုက်ပါပြီ။');
    } catch (error) {
      Alert.alert('Case ကို တာဝန်မယူနိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const changeCaseStatus = async nextStatus => {
    if (['BLOCKED', 'COMPLETED'].includes(nextStatus) && !caseNote.trim()) {
      Alert.alert(
        'မှတ်ချက်လိုအပ်သည်',
        nextStatus === 'COMPLETED'
          ? 'Case ပြီးစီးမှုအကျဉ်းချုပ်ကို ထည့်ပါ။'
          : 'Case ကို ရပ်တန့်ထားရသည့်အကြောင်းရင်းကို ထည့်ပါ။',
      );
      return;
    }
    if (nextStatus === 'VERIFYING' && !allFindingsComplete) {
      Alert.alert(
        'Checklist မပြီးသေးပါ',
        'တွေ့ရှိချက်အားလုံးကို ကွင်းဆင်းအတည်ပြုပြီး ပြုပြင်ထိန်းသိမ်းမှုရလဒ် အပြီးသတ်ထားမှ Final verification စတင်နိုင်ပါသည်။',
      );
      return;
    }

    setBusy(true);
    try {
      setInspectionCase(
        await trackIssuesApi.updateStatus(caseId, nextStatus, caseNote.trim() || null),
      );
      setCaseNote('');
    } catch (error) {
      Alert.alert('Case အခြေအနေ မပြောင်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const checkLocation = async () => {
    if (!selectedIssue) return;
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('တည်နေရာလိုအပ်သည်', 'ချို့ယွင်းချက်တည်နေရာနှင့် နှိုင်းယှဉ်ရန် Location permission လိုအပ်ပါသည်။');
      return;
    }

    setBusy(true);
    Geolocation.getCurrentPosition(
      async position => {
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
          if (result.gps_reliable === false) {
            Alert.alert(
              'GPS တိကျမှု မလုံလောက်ပါ',
              'Signal ကောင်းသည့်နေရာသို့ ရွှေ့ပြီး ထပ်စမ်းပါ။',
            );
          }
          await load(true);
        } catch (error) {
          Alert.alert('Location check မအောင်မြင်ပါ', safeDetail(error));
        } finally {
          setBusy(false);
        }
      },
      error => {
        setBusy(false);
        Alert.alert('Location error', error.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const previewLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) return;
    Geolocation.getCurrentPosition(
      position => {
        setEngineerLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      error => Alert.alert('Location error', error.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  };

  const openMap = async () => {
    if (selectedIssue?.latitude == null || selectedIssue?.longitude == null) return;
    const lat = Number(selectedIssue.latitude);
    const lon = Number(selectedIssue.longitude);
    try {
      await Linking.openURL(
        `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
      );
    } catch {
      Alert.alert('Map မဖွင့်နိုင်ပါ', 'ချို့ယွင်းချက်တည်နေရာကို OpenStreetMap တွင် မဖွင့်နိုင်ပါ။');
    }
  };

  const saveVerification = async () => {
    if (!selectedIssue) return;
    if (verificationNote.trim().length < 1) {
      Alert.alert('တွေ့ရှိချက်ရေးရန်လိုသည်', 'ကွင်းဆင်းစစ်ဆေးရာတွင် ဘာတွေ့ရှိခဲ့သည်ကို ရေးပါ။');
      return;
    }

    setBusy(true);
    try {
      setInspectionCase(
        await trackIssuesApi.verifyFinding(
          caseId,
          selectedIssue.id,
          verificationStatus,
          verificationNote.trim(),
        ),
      );
    } catch (error) {
      Alert.alert('ကွင်းဆင်းအတည်ပြုမှု မသိမ်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const saveMaintenance = async () => {
    if (!selectedIssue || !maintenanceEditable) return;
    if (
      ['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED', 'FOLLOW_UP_REQUIRED'].includes(
        maintenanceStatus,
      ) &&
      !maintenanceNote.trim()
    ) {
      Alert.alert('မှတ်ချက်လိုအပ်သည်', 'နောက်ဆုံး ပြုပြင်/Follow-up ရလဒ်ကို ရေးပါ။');
      return;
    }

    setBusy(true);
    try {
      setInspectionCase(
        await trackIssuesApi.updateMaintenance(
          caseId,
          selectedIssue.id,
          maintenanceStatus,
          maintenanceNote.trim() || null,
        ),
      );
    } catch (error) {
      Alert.alert('ပြုပြင်ထိန်းသိမ်းမှု မသိမ်းနိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const sendCaseComment = async () => {
    if (!caseComment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(
        await trackIssuesApi.addCaseComment(caseId, caseComment.trim(), 'COMMENT'),
      );
      setCaseComment('');
    } catch (error) {
      Alert.alert('Case update မပို့နိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const sendFindingComment = async () => {
    if (!selectedIssue || !findingComment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(
        await trackIssuesApi.addIssueComment(
          caseId,
          selectedIssue.id,
          findingComment.trim(),
          'COMMENT',
        ),
      );
      setFindingComment('');
    } catch (error) {
      Alert.alert('Finding note မပို့နိုင်ပါ', safeDetail(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.muted}>Inspection Case ကို ရယူနေသည်…</Text>
      </View>
    );
  }

  if (!inspectionCase) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="alert-circle-outline" size={44} color="#dc2626" />
        <Text style={styles.muted}>Case ကို မတွေ့ပါ။</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>နောက်သို့</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color="#334155" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>INSPECTION MAINTENANCE CASE</Text>
          <Text style={styles.title}>{inspectionCase.case_name || `${inspectionCase.total_findings} findings`}</Text>
          <Text style={styles.meta}>Case #{shortId(inspectionCase.id)} · {inspectionCase.inspection_id}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View
            style={[
              styles.badge,
              { backgroundColor: `${CASE_COLORS[inspectionCase.status] || '#6b7280'}18` },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: CASE_COLORS[inspectionCase.status] || '#6b7280' },
              ]}
            >
              {label(inspectionCase.status)}
            </Text>
          </View>
          <Text style={styles.priority}>AI {label(inspectionCase.ai_overall_priority)}</Text>
        </View>
        <Text style={styles.meta}>
          Assigned: {inspectionCase.assigned_staff_name || inspectionCase.assigned_staff_code || 'Unassigned'}
        </Text>
        <Text style={styles.meta}>
          Progress: {inspectionCase.completed_findings}/{inspectionCase.total_findings} ပြီးစီး · {remaining} ကျန်
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, Number(inspectionCase.progress_percent || 0))}%` },
            ]}
          />
        </View>
        {!assigned && inspectionCase.status !== 'COMPLETED' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={claim} disabled={busy}>
            <Icon name="hand-extended" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Case တစ်ခုလုံး တာဝန်ယူရန်</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>AI စစ်ဆေးမှုအကျဉ်းချုပ်</Text>
      <View style={styles.card}>
        <Text style={styles.subheading}>Executive summary</Text>
        <Text style={styles.bodyText}>
          {caseAi.executive_summary || 'Inspection-wide AI summary မရှိသေးပါ။'}
        </Text>
        {(caseAi.key_findings || []).slice(0, 4).map((item, index) => (
          <Text key={index} style={styles.checkText}>• {item}</Text>
        ))}
      </View>

      {assigned && inspectionCase.status !== 'COMPLETED' ? (
        <>
          <Text style={styles.sectionTitle}>Case လုပ်ငန်းစဉ်</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.noteInput}
              multiline
              placeholder="Case update / blocked reason / completion summary…"
              value={caseNote}
              onChangeText={setCaseNote}
            />
            <View style={styles.wrapRow}>
              {(CASE_TRANSITIONS[inspectionCase.status] || []).map(status => {
                const disabled = busy || (status === 'VERIFYING' && !allFindingsComplete);
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusButton,
                      status === 'BLOCKED' && styles.blockedButton,
                      disabled && styles.disabledButton,
                    ]}
                    onPress={() => changeCaseStatus(status)}
                    disabled={disabled}
                  >
                    <Text style={styles.statusButtonText}>
                      {CASE_ACTION_LABELS[status] || label(status)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!allFindingsComplete && inspectionCase.status === 'IN_PROGRESS' ? (
              <Text style={styles.warningText}>
                Final verification မစတင်မီ Finding အားလုံး၏ checklist ပြီးစီးရပါမည်။
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>ချို့ယွင်းချက် Checklist</Text>
      {sortedIssues.map((item, index) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.findingRow,
            String(selectedIssueId) === String(item.id) && styles.findingRowActive,
          ]}
          onPress={() => setSelectedIssueId(item.id)}
        >
          <View style={[styles.findingIndex, item.checklist_complete && styles.findingIndexDone]}>
            <Text style={styles.findingIndexText}>{item.checklist_complete ? '✓' : index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.findingTitle}>{item.defect_type}</Text>
            <Text style={styles.findingMeta}>
              {label(item.ai_priority)} · {label(item.field_verification_status)}
            </Text>
            <Text style={styles.findingMeta}>
              {MAINTENANCE_LABELS[item.maintenance_status] || label(item.maintenance_status)}
              {item.distance_from_start_miles != null
                ? ` · ${Number(item.distance_from_start_miles).toFixed(3)} mi`
                : ''}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#94a3b8" />
        </TouchableOpacity>
      ))}

      {selectedIssue ? (
        <>
          <Text style={styles.sectionTitle}>ရွေးထားသော Finding</Text>
          <View style={styles.card}>
            <Text style={styles.selectedTitle}>{selectedIssue.defect_type}</Text>
            <Text style={styles.meta}>
              {selectedIssue.rail_side ? `${selectedIssue.rail_side} rail · ` : ''}
              {selectedIssue.confidence != null
                ? `${(Number(selectedIssue.confidence) * 100).toFixed(1)}% confidence`
                : 'confidence unavailable'}
            </Text>
            <Text style={styles.meta}>AI priority: {label(selectedIssue.ai_priority)}</Text>
            {eventContext.priority_reason ? (
              <Text style={styles.bodyText}>{eventContext.priority_reason}</Text>
            ) : null}
            {(eventContext.recommended_checks || []).length > 0 ? (
              <>
                <Text style={styles.subheading}>Recommended field checks</Text>
                {eventContext.recommended_checks.map((item, index) => (
                  <Text key={index} style={styles.checkText}>• {item}</Text>
                ))}
              </>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>တည်နေရာအထောက်အထား</Text>
          <View style={styles.card}>
            <DefectLocationMap issue={selectedIssue} engineerLocation={engineerLocation} />
            <View style={styles.locationStats}>
              <Text style={styles.meta}>Last proximity: {label(selectedIssue.last_location_proximity)}</Text>
              <Text style={styles.meta}>
                Last distance: {selectedIssue.last_location_distance_miles != null
                  ? `${Number(selectedIssue.last_location_distance_miles).toFixed(3)} mi`
                  : '—'}
              </Text>
              <Text style={styles.meta}>
                On-site verified: {selectedIssue.location_verified_at ? 'Yes' : 'No'}
              </Text>
              {engineerLocation?.accuracy != null ? (
                <Text style={styles.meta}>Current GPS accuracy: ±{Math.round(engineerLocation.accuracy)} m</Text>
              ) : null}
            </View>

            <TouchableOpacity style={styles.outlineMapButton} onPress={previewLocation} disabled={busy}>
              <Icon name="crosshairs" size={18} color="#0f766e" />
              <Text style={styles.outlineMapButtonText}>မြေပုံပေါ် လက်ရှိတည်နေရာပြရန်</Text>
            </TouchableOpacity>

            {assigned ? (
              <TouchableOpacity style={styles.locationButton} onPress={checkLocation} disabled={busy}>
                <Icon name="crosshairs-gps" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>ကွင်းဆင်း Location Check မှတ်တမ်းတင်ရန်</Text>
              </TouchableOpacity>
            ) : null}

            {selectedIssue.latitude != null && selectedIssue.longitude != null ? (
              <TouchableOpacity style={styles.mapButton} onPress={openMap}>
                <Icon name="open-in-new" size={18} color="#0f766e" />
                <Text style={styles.mapButtonText}>OpenStreetMap တွင် ဖွင့်ရန်</Text>
              </TouchableOpacity>
            ) : null}

            {locationResult ? (
              <View
                style={[
                  styles.locationResult,
                  !locationResult.gps_reliable && styles.locationResultWarning,
                ]}
              >
                <Text style={styles.locationResultTitle}>{label(locationResult.proximity)}</Text>
                <Text style={styles.locationResultText}>
                  {Number(locationResult.distance_miles).toFixed(3)} mi · GPS {locationResult.gps_reliable ? 'reliable' : 'uncertain'}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>ကွင်းဆင်း အတည်ပြုမှု</Text>
          <View style={styles.card}>
            <Text style={styles.helper}>
              AI finding ကို လက်တွေ့ track အခြေအနေက အတည်ပြုနိုင်သလားဆိုသည်ကို မှတ်တမ်းတင်ပါ။
            </Text>
            <View style={styles.wrapRow}>
              {VERIFICATION_OPTIONS.map(([value, title]) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.choiceButton,
                    verificationStatus === value && styles.choiceButtonActive,
                  ]}
                  onPress={() => setVerificationStatus(value)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      verificationStatus === value && styles.choiceTextActive,
                    ]}
                  >
                    {title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.noteInput}
              multiline
              placeholder="လက်တွေ့ကွင်းဆင်းစစ်ဆေးရာတွင် ဘာတွေ့ရှိခဲ့ပါသလဲ?"
              value={verificationNote}
              onChangeText={setVerificationNote}
            />
            {assigned && inspectionCase.status !== 'COMPLETED' ? (
              <TouchableOpacity style={styles.primaryButton} onPress={saveVerification} disabled={busy}>
                <Icon name="shield-check" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>အတည်ပြုမှု သိမ်းဆည်းရန်</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>ပြုပြင်ထိန်းသိမ်းမှု ရလဒ်</Text>
          <View style={styles.card}>
            {!maintenanceEditable ? (
              <View style={styles.lockedBox}>
                <Icon name="lock-outline" size={18} color="#92400e" />
                <Text style={styles.lockedText}>
                  {fieldStatus === 'NOT_CHECKED'
                    ? 'Maintenance ကို မသတ်မှတ်မီ ကွင်းဆင်းအတည်ပြုမှုကို အရင်သိမ်းပါ။'
                    : fieldStatus === 'NOT_CONFIRMED'
                      ? 'Finding ကို မတွေ့ရှိကြောင်း အတည်ပြုထားသောကြောင့် Backend က NO_ACTION_REQUIRED ကို အလိုအလျောက် သတ်မှတ်ပေးပါမည်။'
                      : 'Finding ကို ယခုအကြိမ် အတည်မပြုနိုင်သဖြင့် Backend က FOLLOW_UP_REQUIRED ကို အလိုအလျောက် သတ်မှတ်ပေးပါမည်။'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.helper}>
                  လက်ရှိအခြေအနေမှ Backend က ခွင့်ပြုထားသော နောက်တစ်ဆင့်များကိုသာ ရွေးနိုင်ပါသည်။
                </Text>
                <View style={styles.wrapRow}>
                  {availableMaintenanceStatuses.map(value => (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.choiceButton,
                        maintenanceStatus === value && styles.choiceButtonActive,
                      ]}
                      onPress={() => setMaintenanceStatus(value)}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          maintenanceStatus === value && styles.choiceTextActive,
                        ]}
                      >
                        {MAINTENANCE_LABELS[value] || label(value)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.noteInput}
                  multiline
                  placeholder="ပြုပြင်ခြင်း / မပြုပြင်ရန် / Follow-up မှတ်ချက်…"
                  value={maintenanceNote}
                  onChangeText={setMaintenanceNote}
                />
                {assigned && inspectionCase.status !== 'COMPLETED' ? (
                  <TouchableOpacity style={styles.primaryButton} onPress={saveMaintenance} disabled={busy}>
                    <Icon name="wrench-check" size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>Maintenance ရလဒ် သိမ်းဆည်းရန်</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>

          {assigned && inspectionCase.status !== 'COMPLETED' ? (
            <View style={styles.card}>
              <Text style={styles.subheading}>Finding-specific note</Text>
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder="ဤ Finding အတွက် မှတ်ချက်ထည့်ပါ…"
                value={findingComment}
                onChangeText={setFindingComment}
              />
              <TouchableOpacity
                style={[styles.primaryButton, !findingComment.trim() && styles.disabledButton]}
                onPress={sendFindingComment}
                disabled={busy || !findingComment.trim()}
              >
                <Icon name="send" size={17} color="#fff" />
                <Text style={styles.primaryButtonText}>Finding note ပို့ရန်</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Case conversation & activity</Text>
      {assigned ? (
        <View style={styles.card}>
          <TextInput
            style={styles.noteInput}
            multiline
            placeholder="Admin နှင့် အဖွဲ့ကို Case update ပို့ရန်…"
            value={caseComment}
            onChangeText={setCaseComment}
          />
          <TouchableOpacity
            style={[styles.primaryButton, !caseComment.trim() && styles.disabledButton]}
            onPress={sendCaseComment}
            disabled={busy || !caseComment.trim()}
          >
            <Icon name="send" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Case update ပို့ရန်</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {[...(inspectionCase.activities || [])].reverse().map(activity => (
        <View key={activity.id} style={styles.activityCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.activityActor}>
              {activity.actor_name || activity.actor_staff_id || 'System'}
            </Text>
            <Text style={styles.activityTime}>{formatDate(activity.created_at)}</Text>
          </View>
          <Text style={styles.activityType}>
            {label(activity.activity_type)}
            {activity.issue_defect_type ? ` · ${activity.issue_defect_type}` : ''}
          </Text>
          {activity.message ? <Text style={styles.activityMessage}>{activity.message}</Text> : null}
          {activity.from_status && activity.to_status ? (
            <Text style={styles.activityStatus}>
              {label(activity.from_status)} → {label(activity.to_status)}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 50 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  muted: { color: '#64748b', marginTop: 10, textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#0f766e' },
  title: { fontSize: 21, fontWeight: '900', color: '#0f172a', marginTop: 3 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b', marginTop: 20, marginBottom: 9 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 15,
    marginBottom: 8,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  priority: { fontSize: 11, fontWeight: '800', color: '#92400e', flexShrink: 1 },
  meta: { color: '#64748b', fontSize: 11.5, marginTop: 6 },
  bodyText: { fontSize: 12, color: '#475569', lineHeight: 19, marginTop: 8 },
  helper: { color: '#64748b', fontSize: 11, lineHeight: 17, marginBottom: 9 },
  subheading: { fontSize: 13, fontWeight: '900', color: '#334155', marginTop: 4, marginBottom: 6 },
  selectedTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  checkText: { fontSize: 12, color: '#334155', lineHeight: 19, marginBottom: 4 },
  progressTrack: {
    height: 7,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 7, backgroundColor: '#10b981' },
  primaryButton: {
    marginTop: 12,
    minHeight: 44,
    backgroundColor: '#0f766e',
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  noteInput: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    color: '#0f172a',
    textAlignVertical: 'top',
    marginTop: 10,
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  statusButton: {
    backgroundColor: '#2563eb',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginTop: 6,
  },
  blockedButton: { backgroundColor: '#4b5563' },
  statusButtonText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  warningText: { color: '#b45309', fontSize: 10.5, lineHeight: 16, marginTop: 10 },
  findingRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 13,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  findingRowActive: { borderColor: '#14b8a6', backgroundColor: '#f0fdfa' },
  findingIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findingIndexDone: { backgroundColor: '#d1fae5' },
  findingIndexText: { fontWeight: '900', color: '#334155', fontSize: 11 },
  findingTitle: { fontWeight: '900', color: '#0f172a' },
  findingMeta: { color: '#64748b', fontSize: 10.5, marginTop: 3 },
  locationStats: { marginTop: 10 },
  locationButton: {
    marginTop: 9,
    backgroundColor: '#059669',
    borderRadius: 11,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  outlineMapButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    borderRadius: 11,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  outlineMapButtonText: { color: '#0f766e', fontWeight: '900', fontSize: 11 },
  mapButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#fff',
    borderRadius: 11,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  mapButtonText: { color: '#0f766e', fontWeight: '900', fontSize: 11 },
  locationResult: { backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10, marginTop: 10 },
  locationResultWarning: { backgroundColor: '#fffbeb' },
  locationResultTitle: { color: '#047857', fontWeight: '900' },
  locationResultText: { color: '#065f46', fontSize: 11, marginTop: 2 },
  choiceButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  choiceButtonActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  choiceText: { fontSize: 10, fontWeight: '800', color: '#475569' },
  choiceTextActive: { color: '#fff' },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 11,
  },
  lockedText: { flex: 1, color: '#92400e', fontSize: 11, lineHeight: 17 },
  activityCard: {
    backgroundColor: '#fff',
    borderLeftWidth: 3,
    borderLeftColor: '#94a3b8',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  activityActor: { color: '#0f172a', fontSize: 12, fontWeight: '900', flex: 1 },
  activityTime: { color: '#94a3b8', fontSize: 9 },
  activityType: { color: '#0f766e', fontSize: 10, fontWeight: '900', marginTop: 4 },
  activityStatus: { color: '#475569', fontSize: 11, marginTop: 5 },
  activityMessage: { color: '#334155', fontSize: 12, lineHeight: 19, marginTop: 6 },
});

export default TrackIssueDetailScreen;
