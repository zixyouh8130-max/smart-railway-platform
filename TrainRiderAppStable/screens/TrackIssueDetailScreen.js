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
import { requestLocationPermission } from '../utils/locationPermission';

const CASE_COLORS = {
  OPEN: '#dc2626', ACKNOWLEDGED: '#2563eb', IN_PROGRESS: '#0891b2', VERIFYING: '#7c3aed',
  COMPLETED: '#059669', BLOCKED: '#4b5563', REOPENED: '#ea580c',
};

const CASE_TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'BLOCKED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['COMPLETED', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['ACKNOWLEDGED', 'IN_PROGRESS'],
  REOPENED: ['IN_PROGRESS', 'BLOCKED'],
  COMPLETED: [],
};

const VERIFICATION_OPTIONS = [
  ['CONFIRMED', 'Confirmed'],
  ['PARTIALLY_CONFIRMED', 'Partially confirmed'],
  ['NOT_CONFIRMED', 'Not confirmed / false positive'],
  ['UNABLE_TO_VERIFY', 'Unable to verify'],
];

const MAINTENANCE_OPTIONS = [
  ['NO_ACTION_REQUIRED', 'No action required'],
  ['REPAIR_REQUIRED', 'Repair required'],
  ['REPAIR_IN_PROGRESS', 'Repair in progress'],
  ['REPAIR_COMPLETED', 'Repair completed'],
  ['FOLLOW_UP_REQUIRED', 'Follow-up required'],
];

const label = (value) => String(value || '—').replace(/_/g, ' ');
const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

const priorityRank = (value) => {
  const text = String(value || '').toLowerCase();
  if (text.includes('critical') || text.includes('urgent')) return 0;
  if (text.includes('priority') || text.includes('high')) return 1;
  if (text.includes('monitor') || text.includes('medium')) return 2;
  return 3;
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
  const [caseNote, setCaseNote] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('CONFIRMED');
  const [verificationNote, setVerificationNote] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('PENDING');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [caseComment, setCaseComment] = useState('');
  const [findingComment, setFindingComment] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!caseId) return;
    if (refresh) setRefreshing(true);
    try {
      const data = await trackIssuesApi.getById(caseId);
      setInspectionCase(data);
      setSelectedIssueId((previous) => {
        if (previous && data.issues?.some((item) => item.id === previous)) return previous;
        const next = (data.issues || []).find((item) => !item.checklist_complete);
        return next?.id || data.issues?.[0]?.id || null;
      });
    } catch (error) {
      Alert.alert('Could not load case', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [load, navigation]);

  const selectedIssue = useMemo(
    () => inspectionCase?.issues?.find((item) => item.id === selectedIssueId) || null,
    [inspectionCase, selectedIssueId],
  );

  useEffect(() => {
    if (!selectedIssue) return;
    setVerificationStatus(selectedIssue.field_verification_status === 'NOT_CHECKED' ? 'CONFIRMED' : selectedIssue.field_verification_status);
    setVerificationNote(selectedIssue.field_verification_note || '');
    setMaintenanceStatus(selectedIssue.maintenance_status || 'PENDING');
    setMaintenanceNote(selectedIssue.maintenance_note || '');
    setLocationResult(null);
  }, [selectedIssueId, selectedIssue?.updated_at]);

  const sortedIssues = useMemo(() => [...(inspectionCase?.issues || [])].sort((a, b) => {
    if (a.checklist_complete !== b.checklist_complete) return a.checklist_complete ? 1 : -1;
    const rank = priorityRank(a.ai_priority) - priorityRank(b.ai_priority);
    if (rank !== 0) return rank;
    return Number(a.distance_from_start_miles ?? 99999) - Number(b.distance_from_start_miles ?? 99999);
  }), [inspectionCase?.issues]);

  const claim = async () => {
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.claim(caseId));
      Alert.alert('Case claimed', 'The complete inspection case is now assigned to you.');
    } catch (error) {
      Alert.alert('Could not claim case', error.response?.data?.detail || 'Another engineer may have claimed it.');
    } finally { setBusy(false); }
  };

  const changeCaseStatus = async (nextStatus) => {
    if (['BLOCKED', 'COMPLETED'].includes(nextStatus) && !caseNote.trim()) {
      Alert.alert('Note required', nextStatus === 'COMPLETED' ? 'Add a completion summary.' : 'Explain why this case is blocked.');
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.updateStatus(caseId, nextStatus, caseNote.trim() || null));
      setCaseNote('');
    } catch (error) {
      const detail = error.response?.data?.detail;
      Alert.alert('Could not update case', typeof detail === 'string' ? detail : detail?.message || 'The checklist may still have incomplete findings.');
    } finally { setBusy(false); }
  };

  const checkLocation = async () => {
    if (!selectedIssue) return;
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Location required', 'Location permission is needed to compare your position with this AI finding.');
      return;
    }
    setBusy(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await trackIssuesApi.checkLocation(
            caseId,
            selectedIssue.id,
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
          );
          setLocationResult(result);
          if (result.gps_reliable === false) Alert.alert('GPS accuracy too low', 'Move to an open area and retry before treating this as an on-site verification.');
          await load();
        } catch (error) {
          Alert.alert('Location check failed', error.response?.data?.detail || 'Please try again.');
        } finally { setBusy(false); }
      },
      (error) => { setBusy(false); Alert.alert('Location error', error.message); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const openMap = async () => {
    if (selectedIssue?.latitude == null || selectedIssue?.longitude == null) return;
    const lat = Number(selectedIssue.latitude);
    const lon = Number(selectedIssue.longitude);
    try {
      await Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`);
    } catch {
      Alert.alert('Map unavailable', 'Could not open the defect location.');
    }
  };

  const saveVerification = async () => {
    if (!selectedIssue) return;
    if (verificationNote.trim().length < 3) {
      Alert.alert('Observation required', 'Describe what you physically observed.');
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.verifyFinding(caseId, selectedIssue.id, verificationStatus, verificationNote.trim()));
    } catch (error) {
      Alert.alert('Could not save verification', error.response?.data?.detail || 'Please try again.');
    } finally { setBusy(false); }
  };

  const saveMaintenance = async (target = maintenanceStatus) => {
    if (!selectedIssue) return;
    if (['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED', 'FOLLOW_UP_REQUIRED'].includes(target) && !maintenanceNote.trim()) {
      Alert.alert('Note required', 'Describe the final maintenance/follow-up outcome.');
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.updateMaintenance(caseId, selectedIssue.id, target, maintenanceNote.trim() || null));
      setMaintenanceStatus(target);
    } catch (error) {
      Alert.alert('Could not update maintenance', error.response?.data?.detail || 'Check the field-verification result and workflow order.');
    } finally { setBusy(false); }
  };

  const sendCaseComment = async () => {
    if (!caseComment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.addCaseComment(caseId, caseComment.trim(), 'UPDATE'));
      setCaseComment('');
    } catch (error) {
      Alert.alert('Could not send update', error.response?.data?.detail || 'Please try again.');
    } finally { setBusy(false); }
  };

  const sendFindingComment = async () => {
    if (!selectedIssue || !findingComment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.addIssueComment(caseId, selectedIssue.id, findingComment.trim(), 'UPDATE'));
      setFindingComment('');
    } catch (error) {
      Alert.alert('Could not add finding note', error.response?.data?.detail || 'Please try again.');
    } finally { setBusy(false); }
  };

  if (loading || !inspectionCase) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#059669" /><Text style={styles.muted}>Loading inspection case…</Text></View>;
  }

  const assigned = Boolean(inspectionCase.assigned_staff_id);
  const caseAi = inspectionCase.ai_snapshot || {};
  const issueAi = selectedIssue?.ai_snapshot || {};
  const eventContext = issueAi.event_context || {};
  const remaining = Math.max(0, inspectionCase.total_findings - inspectionCase.completed_findings);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}><Icon name="arrow-left" size={22} color="#334155" /></TouchableOpacity>
        <View style={styles.headerText}><Text style={styles.eyebrow}>INSPECTION MAINTENANCE CASE</Text><Text style={styles.title}>{inspectionCase.total_findings} AI findings</Text><Text numberOfLines={1} style={styles.meta}>{inspectionCase.inspection_id}</Text></View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={[styles.badge, { backgroundColor: `${CASE_COLORS[inspectionCase.status] || '#6b7280'}18` }]}><Text style={[styles.badgeText, { color: CASE_COLORS[inspectionCase.status] || '#6b7280' }]}>{label(inspectionCase.status)}</Text></View>
          <Text style={styles.priority}>AI {label(inspectionCase.ai_overall_priority)}</Text>
        </View>
        <Text style={styles.meta}>Assigned: {inspectionCase.assigned_staff_name || inspectionCase.assigned_staff_code || 'Unassigned'}</Text>
        <Text style={styles.meta}>Progress: {inspectionCase.completed_findings}/{inspectionCase.total_findings} completed · {remaining} remaining</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, inspectionCase.progress_percent || 0)}%` }]} /></View>
        {!assigned && inspectionCase.status !== 'COMPLETED' ? <TouchableOpacity style={styles.primaryButton} onPress={claim} disabled={busy}><Text style={styles.primaryButtonText}>Claim complete case</Text></TouchableOpacity> : null}
      </View>

      <Text style={styles.sectionTitle}>AI inspection summary</Text>
      <View style={styles.card}>
        <Text style={styles.subheading}>Executive summary</Text>
        <Text style={styles.bodyText}>{caseAi.executive_summary || 'No inspection-wide summary available.'}</Text>
        {(caseAi.key_findings || []).slice(0, 4).map((item, index) => <Text key={index} style={styles.checkText}>• {item}</Text>)}
        {(caseAi.areas_of_attention || []).length > 0 ? <Text style={styles.helper}>{caseAi.areas_of_attention.length} AI area(s) of attention are represented in the checklist below.</Text> : null}
      </View>

      {assigned && inspectionCase.status !== 'COMPLETED' ? (
        <>
          <Text style={styles.sectionTitle}>Case workflow</Text>
          <View style={styles.card}>
            <TextInput style={styles.noteInput} multiline placeholder="Case update / blocked reason / completion summary…" value={caseNote} onChangeText={setCaseNote} />
            <View style={styles.wrapRow}>{(CASE_TRANSITIONS[inspectionCase.status] || []).map((status) => <TouchableOpacity key={status} style={[styles.statusButton, status === 'BLOCKED' && styles.blockedButton]} onPress={() => changeCaseStatus(status)} disabled={busy}><Text style={styles.statusButtonText}>{label(status)}</Text></TouchableOpacity>)}</View>
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Defect checklist</Text>
      {sortedIssues.map((item, index) => (
        <TouchableOpacity key={item.id} style={[styles.findingRow, selectedIssueId === item.id && styles.findingRowActive]} onPress={() => setSelectedIssueId(item.id)}>
          <View style={[styles.findingIndex, item.checklist_complete && styles.findingIndexDone]}><Text style={styles.findingIndexText}>{item.checklist_complete ? '✓' : index + 1}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.findingTitle}>{item.defect_type}</Text><Text style={styles.findingMeta}>{label(item.ai_priority)} · {label(item.field_verification_status)}</Text><Text style={styles.findingMeta}>{label(item.maintenance_status)}{item.distance_from_start_miles != null ? ` · ${Number(item.distance_from_start_miles).toFixed(3)} mi` : ''}</Text></View>
        </TouchableOpacity>
      ))}

      {selectedIssue ? (
        <>
          <Text style={styles.sectionTitle}>Selected finding</Text>
          <View style={styles.card}>
            <Text style={styles.selectedTitle}>{selectedIssue.defect_type}</Text>
            <Text style={styles.meta}>{selectedIssue.rail_side ? `${selectedIssue.rail_side} rail · ` : ''}{selectedIssue.confidence != null ? `${(selectedIssue.confidence * 100).toFixed(1)}% confidence` : 'confidence unavailable'}</Text>
            <Text style={styles.meta}>AI priority: {label(selectedIssue.ai_priority)}</Text>
            {eventContext.priority_reason ? <Text style={styles.bodyText}>{eventContext.priority_reason}</Text> : null}
            {(eventContext.recommended_checks || []).length > 0 ? <><Text style={styles.subheading}>Recommended field checks</Text>{eventContext.recommended_checks.map((item, index) => <Text key={index} style={styles.checkText}>• {item}</Text>)}</> : null}
            {eventContext.matched_area ? <View style={styles.clusterBox}><Text style={styles.clusterTitle}>Nearby defect cluster</Text><Text style={styles.bodyText}>{eventContext.matched_area.assessment || 'This finding belongs to an AI area of attention.'}</Text></View> : null}
          </View>

          <Text style={styles.sectionTitle}>Location evidence</Text>
          <View style={styles.card}>
            <Text style={styles.meta}>Last proximity: {label(selectedIssue.last_location_proximity)}</Text>
            <Text style={styles.meta}>Last distance: {selectedIssue.last_location_distance_miles != null ? `${Number(selectedIssue.last_location_distance_miles).toFixed(3)} mi` : '—'}</Text>
            <Text style={styles.meta}>On-site verified: {selectedIssue.location_verified_at ? 'Yes' : 'No'}</Text>
            {assigned ? <TouchableOpacity style={styles.locationButton} onPress={checkLocation} disabled={busy}><Icon name="crosshairs-gps" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Check my current location</Text></TouchableOpacity> : null}
            {selectedIssue.latitude != null && selectedIssue.longitude != null ? <TouchableOpacity style={styles.mapButton} onPress={openMap}><Icon name="map-marker-path" size={18} color="#0f766e" /><Text style={styles.mapButtonText}>Open defect in OpenStreetMap</Text></TouchableOpacity> : null}
            {locationResult ? <View style={styles.locationResult}><Text style={styles.locationResultTitle}>{label(locationResult.proximity)}</Text><Text style={styles.locationResultText}>{Number(locationResult.distance_miles).toFixed(3)} mi from AI location</Text></View> : null}
          </View>

          <Text style={styles.sectionTitle}>Field verification</Text>
          <View style={styles.card}>
            <Text style={styles.helper}>This answers whether the physical track condition confirms the AI finding. It is separate from the repair result.</Text>
            <View style={styles.wrapRow}>{VERIFICATION_OPTIONS.map(([value, title]) => <TouchableOpacity key={value} style={[styles.choiceButton, verificationStatus === value && styles.choiceButtonActive]} onPress={() => setVerificationStatus(value)}><Text style={[styles.choiceText, verificationStatus === value && styles.choiceTextActive]}>{title}</Text></TouchableOpacity>)}</View>
            <TextInput style={styles.noteInput} multiline placeholder="Describe what you physically observed…" value={verificationNote} onChangeText={setVerificationNote} />
            {assigned && inspectionCase.status !== 'COMPLETED' ? <TouchableOpacity style={styles.primaryButton} onPress={saveVerification} disabled={busy}><Text style={styles.primaryButtonText}>Save field verification</Text></TouchableOpacity> : null}
          </View>

          <Text style={styles.sectionTitle}>Maintenance outcome</Text>
          <View style={styles.card}>
            <Text style={styles.helper}>Confirmed findings need a final maintenance disposition before the case can be completed.</Text>
            <View style={styles.wrapRow}>{MAINTENANCE_OPTIONS.map(([value, title]) => <TouchableOpacity key={value} style={[styles.choiceButton, maintenanceStatus === value && styles.choiceButtonActive]} onPress={() => setMaintenanceStatus(value)}><Text style={[styles.choiceText, maintenanceStatus === value && styles.choiceTextActive]}>{title}</Text></TouchableOpacity>)}</View>
            <TextInput style={styles.noteInput} multiline placeholder="Repair, no-action, or follow-up note…" value={maintenanceNote} onChangeText={setMaintenanceNote} />
            {assigned && inspectionCase.status !== 'COMPLETED' ? <TouchableOpacity style={styles.primaryButton} onPress={() => saveMaintenance()} disabled={busy}><Text style={styles.primaryButtonText}>Save maintenance outcome</Text></TouchableOpacity> : null}
          </View>

          {assigned && inspectionCase.status !== 'COMPLETED' ? <View style={styles.card}><Text style={styles.subheading}>Finding-specific note</Text><TextInput style={styles.noteInput} multiline placeholder="Add a note or answer about this finding…" value={findingComment} onChangeText={setFindingComment} /><TouchableOpacity style={styles.primaryButton} onPress={sendFindingComment} disabled={busy || !findingComment.trim()}><Text style={styles.primaryButtonText}>Add finding note</Text></TouchableOpacity></View> : null}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Case conversation & activity</Text>
      {assigned ? <View style={styles.card}><TextInput style={styles.noteInput} multiline placeholder="Update admin about the whole inspection case…" value={caseComment} onChangeText={setCaseComment} /><TouchableOpacity style={styles.primaryButton} onPress={sendCaseComment} disabled={busy || !caseComment.trim()}><Icon name="send" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Send case update</Text></TouchableOpacity></View> : null}
      {[...(inspectionCase.activities || [])].reverse().map((activity) => <View key={activity.id} style={styles.activityCard}><View style={styles.rowBetween}><Text style={styles.activityActor}>{activity.actor_name || activity.actor_staff_id || 'System'}</Text><Text style={styles.activityTime}>{formatDate(activity.created_at)}</Text></View><Text style={styles.activityType}>{label(activity.activity_type)}{activity.issue_defect_type ? ` · ${activity.issue_defect_type}` : ''}</Text>{activity.message ? <Text style={styles.activityMessage}>{activity.message}</Text> : null}{activity.from_status && activity.to_status ? <Text style={styles.activityStatus}>{label(activity.from_status)} → {label(activity.to_status)}</Text> : null}</View>)}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 44 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  muted: { color: '#64748b', marginTop: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#059669' },
  title: { fontSize: 23, fontWeight: '800', color: '#0f172a', marginTop: 3 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginTop: 20, marginBottom: 9 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 15, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  priority: { fontSize: 11, fontWeight: '700', color: '#92400e', flexShrink: 1 },
  meta: { color: '#64748b', fontSize: 12, marginTop: 6 },
  bodyText: { fontSize: 12, color: '#475569', lineHeight: 18, marginTop: 8 },
  helper: { color: '#64748b', fontSize: 11, lineHeight: 17, marginBottom: 9 },
  subheading: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 4, marginBottom: 6 },
  selectedTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  checkText: { fontSize: 12, color: '#334155', lineHeight: 19, marginBottom: 4 },
  progressTrack: { height: 7, backgroundColor: '#e2e8f0', borderRadius: 999, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: '#10b981' },
  primaryButton: { marginTop: 12, backgroundColor: '#0f766e', borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  noteInput: { minHeight: 82, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, color: '#0f172a', textAlignVertical: 'top', marginTop: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  statusButton: { backgroundColor: '#2563eb', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, marginTop: 6 },
  blockedButton: { backgroundColor: '#4b5563' },
  statusButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  findingRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 13, padding: 11, marginBottom: 8, flexDirection: 'row', gap: 10 },
  findingRowActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  findingIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  findingIndexDone: { backgroundColor: '#d1fae5' },
  findingIndexText: { fontWeight: '800', color: '#334155', fontSize: 11 },
  findingTitle: { fontWeight: '800', color: '#0f172a' },
  findingMeta: { color: '#64748b', fontSize: 11, marginTop: 3 },
  clusterBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10, marginTop: 10 },
  clusterTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  locationButton: { marginTop: 12, backgroundColor: '#059669', borderRadius: 11, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  mapButton: { marginTop: 8, borderWidth: 1, borderColor: '#0f766e', backgroundColor: '#f0fdfa', borderRadius: 11, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  mapButtonText: { color: '#0f766e', fontWeight: '800' },
  locationResult: { backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10, marginTop: 10 },
  locationResultTitle: { color: '#047857', fontWeight: '800' },
  locationResultText: { color: '#065f46', fontSize: 12, marginTop: 2 },
  choiceButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10 },
  choiceButtonActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  choiceText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  choiceTextActive: { color: '#fff' },
  activityCard: { backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#94a3b8', borderRadius: 12, padding: 12, marginTop: 8 },
  activityActor: { color: '#0f172a', fontSize: 12, fontWeight: '800', flex: 1 },
  activityTime: { color: '#94a3b8', fontSize: 9 },
  activityType: { color: '#0f766e', fontSize: 10, fontWeight: '800', marginTop: 4 },
  activityStatus: { color: '#475569', fontSize: 11, marginTop: 5 },
  activityMessage: { color: '#334155', fontSize: 13, lineHeight: 19, marginTop: 6 },
});

export default TrackIssueDetailScreen;
