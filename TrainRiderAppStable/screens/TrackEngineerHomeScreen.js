import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import api from '../api/axios';
import trackIssuesApi from '../api/trackIssues';
import { requestLocationPermission } from '../utils/locationPermission';

const STATUS_COLORS = {
  OPEN: '#dc2626',
  ACKNOWLEDGED: '#2563eb',
  IN_PROGRESS: '#0891b2',
  VERIFYING: '#7c3aed',
  COMPLETED: '#059669',
  BLOCKED: '#4b5563',
  REOPENED: '#ea580c',
};

const CaseCard = ({ item, nearby, onOpen, onClaim }) => {
  const remaining = Math.max(0, (item.total_findings || 0) - (item.completed_findings || 0));
  return (
    <View style={styles.caseCard}>
      <View style={styles.caseHeader}>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}18` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>{String(item.status).replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.priorityText}>AI {String(item.ai_overall_priority || 'unassessed').replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.caseTitle}>Inspection maintenance case</Text>
      <Text numberOfLines={1} style={styles.caseMeta}>{item.inspection_id}</Text>
      <Text style={styles.caseMeta}>{item.completed_findings || 0}/{item.total_findings || 0} findings completed · {remaining} remaining</Text>
      <Text style={styles.caseMeta}>Unchecked: {Math.max(0, (item.total_findings || 0) - (item.checked_findings || 0))} · Follow-up: {item.follow_up_count || 0}</Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, item.progress_percent || 0)}%` }]} />
      </View>

      {nearby && item.distance_to_engineer_miles != null ? (
        <View style={styles.nearbyRow}>
          <Icon name="map-marker-distance" size={16} color="#2563eb" />
          <Text style={styles.nearbyText}>Nearest finding {Number(item.distance_to_engineer_miles).toFixed(2)} mi away</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onOpen(item.id)}>
          <Text style={styles.primaryButtonText}>Open case</Text>
        </TouchableOpacity>
        {nearby && !item.assigned_staff_id ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onClaim(item.id)}>
            <Text style={styles.secondaryButtonText}>Claim case</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const TrackEngineerHomeScreen = () => {
  const navigation = useNavigation();
  const [staffInfo, setStaffInfo] = useState(null);
  const [cases, setCases] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [me, mine] = await Promise.all([api.get('/auth/me'), trackIssuesApi.getMine(false)]);
      if (me.data?.staff?.role !== 'TRACK_ENGINEER') {
        navigation.replace('TrainRiderHome');
        return;
      }
      setStaffInfo(me.data.staff);
      setCases(mine || []);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || 'Inspection cases could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [load, navigation]);

  const counts = useMemo(() => ({
    assigned: cases.length,
    active: cases.filter((item) => ['ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFYING', 'REOPENED'].includes(item.status)).length,
    unchecked: cases.reduce((sum, item) => sum + Math.max(0, (item.total_findings || 0) - (item.checked_findings || 0)), 0),
  }), [cases]);

  const findNearby = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Location required', 'Nearby inspection-case search needs location permission.');
      return;
    }
    setLocating(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          setNearby((await trackIssuesApi.getNearby(position.coords.latitude, position.coords.longitude, 5)) || []);
        } catch (error) {
          Alert.alert('Error', error.response?.data?.detail || 'Nearby inspection cases could not be loaded.');
        } finally { setLocating(false); }
      },
      (error) => { setLocating(false); Alert.alert('Location error', error.message); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const claim = async (caseId) => {
    try {
      await trackIssuesApi.claim(caseId);
      setNearby((items) => items.filter((item) => item.id !== caseId));
      await load();
      navigation.navigate('TrackIssueDetail', { caseId });
    } catch (error) {
      Alert.alert('Could not claim case', error.response?.data?.detail || 'Another engineer may already have claimed it.');
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'staffInfo']);
    navigation.reset({ index: 0, routes: [{ name: 'StaffLogin' }] });
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#059669" /><Text style={styles.loadingText}>Loading inspection cases…</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <View style={styles.topBar}>
        <View><Text style={styles.eyebrow}>TRACK ENGINEERING</Text><Text style={styles.title}>Inspection Cases</Text><Text style={styles.subtitle}>{staffInfo?.staff_id || 'Track Engineer'}</Text></View>
        <TouchableOpacity style={styles.iconButton} onPress={logout}><Icon name="logout" size={22} color="#dc2626" /></TouchableOpacity>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.assigned}</Text><Text style={styles.statLabel}>Assigned cases</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.active}</Text><Text style={styles.statLabel}>Active</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.unchecked}</Text><Text style={styles.statLabel}>Unchecked</Text></View>
      </View>

      <TouchableOpacity style={styles.locationButton} onPress={findNearby} disabled={locating}>
        {locating ? <ActivityIndicator color="#fff" /> : <Icon name="crosshairs-gps" size={20} color="#fff" />}
        <Text style={styles.locationButtonText}>{locating ? 'Checking location…' : 'Find nearby inspection cases'}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>My assigned cases</Text>
      {cases.length === 0 ? (
        <View style={styles.emptyCard}><Icon name="clipboard-check-outline" size={44} color="#10b981" /><Text style={styles.emptyTitle}>No active cases</Text><Text style={styles.emptyText}>Use nearby search to find an unassigned inspection case.</Text></View>
      ) : cases.map((item) => <CaseCard key={item.id} item={item} onOpen={(caseId) => navigation.navigate('TrackIssueDetail', { caseId })} />)}

      {nearby.length > 0 ? (
        <><Text style={styles.sectionTitle}>Nearby cases</Text>{nearby.map((item) => <CaseCard key={item.id} item={item} nearby onOpen={(caseId) => navigation.navigate('TrackIssueDetail', { caseId })} onClaim={claim} />)}</>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 10, color: '#64748b' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { fontSize: 11, color: '#059669', fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 26, color: '#0f172a', fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#64748b', marginTop: 3 },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  locationButton: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  locationButtonText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginTop: 22, marginBottom: 10 },
  caseCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  caseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },
  priorityText: { fontSize: 10, color: '#92400e', flexShrink: 1 },
  caseTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 10 },
  caseMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  progressTrack: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#10b981' },
  nearbyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eff6ff', borderRadius: 9, padding: 8, marginTop: 9 },
  nearbyText: { color: '#1d4ed8', fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: '#0f766e', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  secondaryButtonText: { color: '#0f766e', fontWeight: '700' },
  emptyCard: { alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 26 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginTop: 9 },
  emptyText: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 5, lineHeight: 18 },
});

export default TrackEngineerHomeScreen;
