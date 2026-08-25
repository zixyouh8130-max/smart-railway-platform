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
  INSPECTING: '#0891b2',
  REPAIRING: '#d97706',
  VERIFYING: '#7c3aed',
  RESOLVED: '#059669',
  BLOCKED: '#4b5563',
  REOPENED: '#ea580c',
};

const IssueCard = ({ issue, nearby, onOpen, onClaim }) => (
  <View style={styles.issueCard}>
    <View style={styles.issueHeader}>
      <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[issue.status] || '#6b7280'}18` }]}>
        <Text style={[styles.statusText, { color: STATUS_COLORS[issue.status] || '#6b7280' }]}>{issue.status}</Text>
      </View>
      {issue.ai_priority ? <Text style={styles.priorityText}>AI {String(issue.ai_priority).replace(/_/g, ' ')}</Text> : null}
    </View>

    <Text style={styles.issueTitle}>{issue.defect_type}</Text>
    <Text style={styles.issueMeta}>
      {issue.rail_side ? `${issue.rail_side} rail · ` : ''}
      {issue.confidence != null ? `${(issue.confidence * 100).toFixed(1)}% confidence` : 'confidence unavailable'}
    </Text>
    {issue.distance_from_start_miles != null ? (
      <Text style={styles.issueMeta}>Inspection position: {Number(issue.distance_from_start_miles).toFixed(2)} mi</Text>
    ) : null}
    {nearby && issue.distance_to_engineer_miles != null ? (
      <View style={styles.nearbyRow}>
        <Icon name="map-marker-distance" size={16} color="#2563eb" />
        <Text style={styles.nearbyText}>{Number(issue.distance_to_engineer_miles).toFixed(2)} mi from you</Text>
      </View>
    ) : null}

    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.primaryButton} onPress={() => onOpen(issue.id)}>
        <Text style={styles.primaryButtonText}>Open</Text>
      </TouchableOpacity>
      {nearby && !issue.assigned_staff_id ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => onClaim(issue.id)}>
          <Text style={styles.secondaryButtonText}>Claim</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
);

const TrackEngineerHomeScreen = () => {
  const navigation = useNavigation();
  const [staffInfo, setStaffInfo] = useState(null);
  const [issues, setIssues] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [me, mine] = await Promise.all([
        api.get('/auth/me'),
        trackIssuesApi.getMine(false),
      ]);

      if (me.data?.staff?.role !== 'TRACK_ENGINEER') {
        navigation.replace('TrainRiderHome');
        return;
      }

      setStaffInfo(me.data.staff);
      setIssues(mine || []);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || 'Track issues could not be loaded.');
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
    assigned: issues.length,
    repairing: issues.filter((item) => item.status === 'REPAIRING').length,
    verifying: issues.filter((item) => item.status === 'VERIFYING').length,
  }), [issues]);

  const findNearby = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('Location required', 'Nearby issue search needs location permission.');
      return;
    }

    setLocating(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          const results = await trackIssuesApi.getNearby(
            position.coords.latitude,
            position.coords.longitude,
            5,
          );
          setNearby(results || []);
        } catch (error) {
          Alert.alert('Error', error.response?.data?.detail || 'Nearby issues could not be loaded.');
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        Alert.alert('Location error', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const claim = async (issueId) => {
    try {
      await trackIssuesApi.claim(issueId);
      setNearby((previous) => previous.filter((item) => item.id !== issueId));
      await load();
      navigation.navigate('TrackIssueDetail', { issueId });
    } catch (error) {
      Alert.alert('Could not claim issue', error.response?.data?.detail || 'Another engineer may already have claimed it.');
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'staffInfo']);
    navigation.reset({ index: 0, routes: [{ name: 'StaffLogin' }] });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading engineering work…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>TRACK ENGINEERING</Text>
          <Text style={styles.title}>Maintenance Issues</Text>
          <Text style={styles.subtitle}>{staffInfo?.staff_id || 'Track Engineer'}</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={logout}>
          <Icon name="logout" size={22} color="#dc2626" />
        </TouchableOpacity>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.assigned}</Text><Text style={styles.statLabel}>Assigned</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.repairing}</Text><Text style={styles.statLabel}>Repairing</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{counts.verifying}</Text><Text style={styles.statLabel}>Verifying</Text></View>
      </View>

      <TouchableOpacity style={styles.locationButton} onPress={findNearby} disabled={locating}>
        {locating ? <ActivityIndicator color="#fff" /> : <Icon name="crosshairs-gps" size={20} color="#fff" />}
        <Text style={styles.locationButtonText}>{locating ? 'Checking location…' : 'Find nearby AI findings'}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>My assigned issues</Text>
      {issues.length === 0 ? (
        <View style={styles.emptyCard}>
          <Icon name="check-circle-outline" size={44} color="#10b981" />
          <Text style={styles.emptyTitle}>No active assigned issues</Text>
          <Text style={styles.emptyText}>Use nearby search to find unassigned inspection findings around you.</Text>
        </View>
      ) : issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onOpen={(issueId) => navigation.navigate('TrackIssueDetail', { issueId })} />
      ))}

      {nearby.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Nearby findings</Text>
          {nearby.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              nearby
              onOpen={(issueId) => navigation.navigate('TrackIssueDetail', { issueId })}
              onClaim={claim}
            />
          ))}
        </>
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
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  locationButton: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  locationButtonText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginTop: 22, marginBottom: 10 },
  issueCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  issueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },
  priorityText: { fontSize: 10, color: '#92400e', flexShrink: 1 },
  issueTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 10 },
  issueMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
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
