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

const STATUS_COLORS = {
  OPEN: '#dc2626',
  ACKNOWLEDGED: '#2563eb',
  INSPECTING: '#0891b2',
  REPAIRING: '#d97706',
  VERIFYING: '#7c3aed',
  RESOLVED: '#059669',
  BLOCKED: '#4b5563',
  REOPENED: '#ea580c',
};

const TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'BLOCKED'],
  ACKNOWLEDGED: ['INSPECTING', 'BLOCKED'],
  INSPECTING: ['REPAIRING', 'VERIFYING', 'BLOCKED'],
  REPAIRING: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['RESOLVED', 'REPAIRING', 'BLOCKED'],
  BLOCKED: ['ACKNOWLEDGED', 'INSPECTING'],
  REOPENED: ['ACKNOWLEDGED', 'INSPECTING', 'BLOCKED'],
  RESOLVED: [],
};

const statusLabel = (value) => String(value || '').replace(/_/g, ' ');

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

const safeText = (value) => {
  if (value == null) return 'Not available';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const TrackIssueDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const issueId = route.params?.issueId;

  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [locationResult, setLocationResult] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState('UPDATE');

  const load = useCallback(async (refresh = false) => {
    if (!issueId) return;
    if (refresh) setRefreshing(true);
    try {
      const data = await trackIssuesApi.getById(issueId);
      setIssue(data);
    } catch (error) {
      Alert.alert('Could not load issue', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [issueId]);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [load, navigation]);

  const nextStatuses = useMemo(
    () => TRANSITIONS[issue?.status] || [],
    [issue?.status],
  );

  const claim = async () => {
    setActionLoading(true);
    try {
      const updated = await trackIssuesApi.claim(issueId);
      setIssue(updated);
      Alert.alert('Claimed', 'This issue is now assigned to you.');
    } catch (error) {
      Alert.alert('Could not claim', error.response?.data?.detail || 'Another engineer may have claimed it.');
    } finally {
      setActionLoading(false);
    }
  };

  const openDefectMap = async () => {
    if (issue?.latitude == null || issue?.longitude == null) return;
    const lat = Number(issue.latitude);
    const lon = Number(issue.longitude);
    const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Map unavailable', 'Could not open the defect location in the map application.');
    }
  };

  const checkLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Location required', 'Location permission is needed to compare your position with the AI finding.');
      return;
    }

    setActionLoading(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await trackIssuesApi.checkLocation(
            issueId,
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
          );
          setLocationResult(result);
          if (result.gps_reliable === false) {
            Alert.alert('GPS accuracy too low', 'Move to an open area and retry before treating this as an on-site verification.');
          }
          await load();
        } catch (error) {
          Alert.alert('Location check failed', error.response?.data?.detail || 'Please try again.');
        } finally {
          setActionLoading(false);
        }
      },
      (error) => {
        setActionLoading(false);
        Alert.alert('Location error', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const claimIssue = async () => {
    setActionLoading(true);
    try {
      const detail = await trackIssuesApi.claim(issueId);
      setIssue(detail);
      Alert.alert('Claimed', 'This issue is now assigned to you.');
    } catch (error) {
      Alert.alert('Could not claim issue', error.response?.data?.detail || 'Another engineer may already have claimed it.');
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (nextStatus) => {
    if (['BLOCKED', 'RESOLVED'].includes(nextStatus) && !statusNote.trim()) {
      Alert.alert(
        nextStatus === 'BLOCKED' ? 'Block reason required' : 'Resolution note required',
        nextStatus === 'BLOCKED'
          ? 'Describe what is preventing the work from continuing.'
          : 'Describe what was fixed (or why no repair was required) and how it was verified.',
      );
      return;
    }

    setActionLoading(true);
    try {
      const updated = await trackIssuesApi.updateStatus(
        issueId,
        nextStatus,
        statusNote.trim() || null,
      );
      setIssue(updated);
      setStatusNote('');
    } catch (error) {
      Alert.alert('Status update failed', error.response?.data?.detail || 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    setActionLoading(true);
    try {
      const updated = await trackIssuesApi.addComment(
        issueId,
        comment.trim(),
        commentKind,
      );
      setIssue(updated);
      setComment('');
      setCommentKind('UPDATE');
    } catch (error) {
      Alert.alert('Could not send update', error.response?.data?.detail || 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !issue) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.muted}>Loading issue…</Text>
      </View>
    );
  }

  const aiSnapshot = issue.ai_snapshot || {};
  const visualReview = aiSnapshot.event_visual_review;
  const advisory = aiSnapshot.inspection_advisory;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>TRACK ISSUE</Text>
          <Text style={styles.title}>{issue.defect_type}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[issue.status] || '#64748b'}18` }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLORS[issue.status] || '#64748b' }]}>{statusLabel(issue.status)}</Text>
          </View>
          {issue.ai_priority ? <Text style={styles.priority}>AI: {statusLabel(issue.ai_priority)}</Text> : null}
        </View>
        <Text style={styles.meta}>Confidence: {issue.confidence != null ? `${(Number(issue.confidence) * 100).toFixed(1)}%` : '—'}</Text>
        <Text style={styles.meta}>Rail side: {issue.rail_side || '—'}</Text>
        <Text style={styles.meta}>Inspection position: {issue.distance_from_start_miles != null ? `${Number(issue.distance_from_start_miles).toFixed(2)} mi` : '—'}</Text>
        <Text style={styles.meta}>Assigned: {issue.assigned_staff_name || issue.assigned_staff_code || 'Unassigned'}</Text>

        {!issue.assigned_staff_id && issue.status !== 'RESOLVED' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={claim} disabled={actionLoading}>
            <Icon name="account-check" size={19} color="#fff" />
            <Text style={styles.primaryButtonText}>Claim this issue</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Field location verification</Text>
      <View style={styles.card}>
        {issue.latitude != null && issue.longitude != null ? (
          <>
            <Text style={styles.meta}>Issue GPS: {Number(issue.latitude).toFixed(6)}, {Number(issue.longitude).toFixed(6)}</Text>
            <Text style={styles.meta}>Last proximity: {statusLabel(issue.last_location_proximity || 'NOT CHECKED')}</Text>
            {issue.last_location_distance_miles != null ? (
              <Text style={styles.meta}>Last distance: {Number(issue.last_location_distance_miles).toFixed(3)} mi</Text>
            ) : null}
            {issue.location_verified_at ? <Text style={styles.goodText}>On-site verified: {formatDateTime(issue.location_verified_at)}</Text> : null}
            {locationResult ? (
              <View style={styles.locationResult}>
                <Text style={styles.locationResultTitle}>{statusLabel(locationResult.proximity)}</Text>
                <Text style={styles.locationResultText}>{Number(locationResult.distance_miles).toFixed(3)} mi from finding</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.locationButton} onPress={checkLocation} disabled={actionLoading}>
              <Icon name="crosshairs-gps" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Check my current location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapButton} onPress={openDefectMap}>
              <Icon name="map-marker-path" size={20} color="#0f766e" />
              <Text style={styles.mapButtonText}>Open defect in OpenStreetMap</Text>
            </TouchableOpacity>
            <Text style={styles.helper}>GPS proximity is recorded as field evidence; it does not block you from reading or updating the issue.</Text>
          </>
        ) : (
          <Text style={styles.warning}>This AI finding has no GPS coordinates. You can still review and progress the work manually.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>AI inspection review</Text>
      <View style={styles.card}>
        <Text style={styles.subheading}>Finding review</Text>
        {aiSnapshot.event_representative_frame != null ? <Text style={styles.meta}>Representative frame: {aiSnapshot.event_representative_frame}</Text> : null}
        {aiSnapshot.event_representative_timestamp != null ? <Text style={styles.meta}>Video time: {Number(aiSnapshot.event_representative_timestamp).toFixed(2)} s</Text> : null}
        {aiSnapshot.event_detection_count != null ? <Text style={styles.meta}>Detections: {aiSnapshot.event_detection_count}</Text> : null}
        <Text selectable style={styles.aiText}>{safeText(visualReview)}</Text>
        <Text style={styles.subheading}>Inspection advisory</Text>
        <Text selectable style={styles.aiText}>{safeText(advisory)}</Text>
        {aiSnapshot.inspection_spatial_summary ? (
          <>
            <Text style={styles.subheading}>Spatial summary</Text>
            <Text selectable style={styles.aiText}>{safeText(aiSnapshot.inspection_spatial_summary)}</Text>
          </>
        ) : null}
      </View>

      {!issue.assigned_staff_id && issue.status !== 'RESOLVED' ? (
        <>
          <Text style={styles.sectionTitle}>Take ownership</Text>
          <View style={styles.card}>
            <Text style={styles.helper}>Review the AI evidence and location first. Claim this issue before recording repair progress or discussion updates.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={claimIssue} disabled={actionLoading}>
              <Icon name="account-check" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Claim this issue</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {issue.assigned_staff_id && issue.status !== 'RESOLVED' ? (
        <>
          <Text style={styles.sectionTitle}>Progress work</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.noteInput}
              placeholder="Add progress / repair / verification note…"
              multiline
              value={statusNote}
              onChangeText={setStatusNote}
            />
            <View style={styles.wrapRow}>
              {nextStatuses.map((next) => (
                <TouchableOpacity
                  key={next}
                  style={[styles.statusButton, next === 'BLOCKED' && styles.blockedButton]}
                  onPress={() => updateStatus(next)}
                  disabled={actionLoading}
                >
                  <Text style={styles.statusButtonText}>{statusLabel(next)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {issue.resolution_summary ? (
        <>
          <Text style={styles.sectionTitle}>Resolution</Text>
          <View style={[styles.card, styles.resolutionCard]}>
            <Text style={styles.resolutionText}>{issue.resolution_summary}</Text>
            <Text style={styles.meta}>Resolved: {formatDateTime(issue.resolved_at)}</Text>
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Admin & engineer discussion</Text>
      {issue.assigned_staff_id ? (
        <View style={styles.card}>
          <View style={styles.wrapRow}>
            {['UPDATE', 'COMMENT', 'QUESTION'].map((kind) => (
              <TouchableOpacity
                key={kind}
                style={[styles.kindButton, commentKind === kind && styles.kindButtonActive]}
                onPress={() => setCommentKind(kind)}
              >
                <Text style={[styles.kindText, commentKind === kind && styles.kindTextActive]}>{kind}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.commentInput}
            placeholder="Write a progress update, answer, or question…"
            multiline
            value={comment}
            onChangeText={setComment}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={sendComment} disabled={actionLoading || !comment.trim()}>
            <Icon name="send" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {(issue.activities || []).slice().reverse().map((activity) => (
        <View key={activity.id} style={styles.activityCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.activityActor}>{activity.actor_name || activity.actor_staff_id || activity.actor_role || 'System'}</Text>
            <Text style={styles.activityTime}>{formatDateTime(activity.created_at)}</Text>
          </View>
          <Text style={styles.activityType}>{activity.message_kind || activity.activity_type}</Text>
          {activity.from_status || activity.to_status ? (
            <Text style={styles.activityStatus}>{statusLabel(activity.from_status)} → {statusLabel(activity.to_status)}</Text>
          ) : null}
          {activity.message ? <Text style={styles.activityMessage}>{activity.message}</Text> : null}
          {activity.proximity ? (
            <Text style={styles.activityLocation}>{statusLabel(activity.proximity)}{activity.distance_to_issue_miles != null ? ` · ${Number(activity.distance_to_issue_miles).toFixed(3)} mi` : ''}</Text>
          ) : null}
        </View>
      ))}

      <Text style={styles.sourceText}>Inspection: {issue.inspection_id}\nEvent: {issue.inspection_event_id}</Text>
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
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginTop: 3 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginTop: 20, marginBottom: 9 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 15 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  priority: { fontSize: 11, fontWeight: '700', color: '#92400e', flexShrink: 1 },
  meta: { color: '#64748b', fontSize: 12, marginTop: 6 },
  goodText: { color: '#047857', fontSize: 12, fontWeight: '700', marginTop: 7 },
  warning: { color: '#b45309', lineHeight: 19 },
  helper: { color: '#64748b', fontSize: 11, lineHeight: 17, marginTop: 9 },
  primaryButton: { marginTop: 12, backgroundColor: '#0f766e', borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  locationButton: { marginTop: 12, backgroundColor: '#059669', borderRadius: 11, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  mapButton: { marginTop: 8, borderWidth: 1, borderColor: '#0f766e', backgroundColor: '#f0fdfa', borderRadius: 11, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  mapButtonText: { color: '#0f766e', fontWeight: '800' },
  locationResult: { backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10, marginTop: 10 },
  locationResultTitle: { color: '#047857', fontWeight: '800' },
  locationResultText: { color: '#065f46', fontSize: 12, marginTop: 2 },
  subheading: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 4, marginBottom: 6 },
  aiText: { fontSize: 12, color: '#475569', lineHeight: 18, backgroundColor: '#f8fafc', borderRadius: 9, padding: 9, marginBottom: 12 },
  noteInput: { minHeight: 82, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, color: '#0f172a', textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statusButton: { backgroundColor: '#2563eb', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, marginTop: 10 },
  blockedButton: { backgroundColor: '#4b5563' },
  statusButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  resolutionCard: { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' },
  resolutionText: { color: '#065f46', lineHeight: 19, fontWeight: '600' },
  kindButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  kindButtonActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  kindText: { fontSize: 10, fontWeight: '800', color: '#475569' },
  kindTextActive: { color: '#fff' },
  commentInput: { minHeight: 82, marginTop: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, color: '#0f172a', textAlignVertical: 'top' },
  activityCard: { backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#94a3b8', borderRadius: 12, padding: 12, marginTop: 8 },
  activityActor: { color: '#0f172a', fontSize: 12, fontWeight: '800', flex: 1 },
  activityTime: { color: '#94a3b8', fontSize: 9 },
  activityType: { color: '#0f766e', fontSize: 10, fontWeight: '800', marginTop: 4 },
  activityStatus: { color: '#475569', fontSize: 11, marginTop: 5 },
  activityMessage: { color: '#334155', fontSize: 13, lineHeight: 19, marginTop: 6 },
  activityLocation: { color: '#2563eb', fontSize: 11, marginTop: 6 },
  sourceText: { color: '#94a3b8', fontSize: 9, marginTop: 18 },
});

export default TrackIssueDetailScreen;
