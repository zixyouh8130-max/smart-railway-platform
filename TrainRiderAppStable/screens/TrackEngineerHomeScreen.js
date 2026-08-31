import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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

const label = value => String(value || '—').replace(/_/g, ' ');
const shortId = value => (value ? String(value).slice(0, 8) : '—');

const caseTitle = item =>
  item.case_name ||
  item.run_id ||
  `Inspection ${String(item.inspection_id || '').slice(0, 14)}` ||
  'Inspection maintenance case';

const CaseCard = ({ item, nearby = false, onOpen, onClaim }) => {
  const color = STATUS_COLORS[item.status] || '#64748b';
  const remaining = Math.max(
    0,
    Number(item.total_findings || 0) - Number(item.completed_findings || 0),
  );

  return (
    <View style={styles.caseCard}>
      <View style={styles.caseHeader}>
        <View style={[styles.statusBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.statusText, { color }]}>{label(item.status)}</Text>
        </View>
        <Text style={styles.priorityText}>AI {label(item.ai_overall_priority || 'UNASSESSED')}</Text>
      </View>

      <Text style={styles.caseTitle}>{caseTitle(item)}</Text>
      <Text style={styles.caseMeta}>Case #{shortId(item.id)} · Inspection {item.inspection_id || '—'}</Text>
      <Text style={styles.caseMeta}>
        {item.completed_findings || 0}/{item.total_findings || 0} ပြီးစီး · {remaining} ကျန်
      </Text>
      <Text style={styles.caseMeta}>
        မစစ်ရသေး {Math.max(0, Number(item.total_findings || 0) - Number(item.checked_findings || 0))}
        {' · '}Follow-up {item.follow_up_count || 0}
      </Text>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Number(item.progress_percent || 0))}%` },
          ]}
        />
      </View>

      {nearby && item.distance_to_engineer_miles != null ? (
        <View style={styles.nearbyRow}>
          <Icon name="map-marker-distance" size={16} color="#2563eb" />
          <Text style={styles.nearbyText}>
            အနီးဆုံးချို့ယွင်းချက် {Number(item.distance_to_engineer_miles).toFixed(2)} mi
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onOpen(item.id)}>
          <Icon name="clipboard-text-search" size={17} color="#fff" />
          <Text style={styles.primaryButtonText}>Case ဖွင့်ရန်</Text>
        </TouchableOpacity>
        {nearby && !item.assigned_staff_id ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onClaim(item.id)}>
            <Icon name="hand-extended" size={17} color="#0f766e" />
            <Text style={styles.secondaryButtonText}>တာဝန်ယူရန်</Text>
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
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      try {
        const [me, mine] = await Promise.all([
          api.get('/auth/me'),
          trackIssuesApi.getMine(includeCompleted),
        ]);

        if (me.data?.staff?.role !== 'TRACK_ENGINEER') {
          navigation.replace('TrainRiderHome');
          return;
        }

        setStaffInfo(me.data.staff);
        setCases(Array.isArray(mine) ? mine : mine?.cases || mine?.items || []);
      } catch (error) {
        Alert.alert(
          'Case များ မရနိုင်ပါ',
          error.response?.data?.detail || error.message || 'ထပ်မံကြိုးစားပါ။',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [includeCompleted, navigation],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load(true));
    return unsubscribe;
  }, [load, navigation]);

  const counts = useMemo(
    () => ({
      assigned: cases.length,
      active: cases.filter(item =>
        ['ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFYING', 'REOPENED'].includes(item.status),
      ).length,
      unchecked: cases.reduce(
        (sum, item) =>
          sum +
          Math.max(
            0,
            Number(item.total_findings || 0) - Number(item.checked_findings || 0),
          ),
        0,
      ),
    }),
    [cases],
  );

  const findNearby = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert('တည်နေရာလိုအပ်သည်', 'အနီးရှိ Case များရှာရန် Location permission လိုအပ်ပါသည်။');
      return;
    }

    setLocating(true);
    Geolocation.getCurrentPosition(
      async position => {
        try {
          const result = await trackIssuesApi.getNearby(
            position.coords.latitude,
            position.coords.longitude,
            5,
          );
          setNearby(Array.isArray(result) ? result : []);
        } catch (error) {
          Alert.alert(
            'အနီးရှိ Case များ မရနိုင်ပါ',
            error.response?.data?.detail || 'ထပ်မံကြိုးစားပါ။',
          );
        } finally {
          setLocating(false);
        }
      },
      error => {
        setLocating(false);
        Alert.alert('Location error', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const claim = async caseId => {
    try {
      await trackIssuesApi.claim(caseId);
      setNearby(items => items.filter(item => item.id !== caseId));
      await load(true);
      navigation.navigate('TrackIssueDetail', { caseId });
    } catch (error) {
      Alert.alert(
        'Case ကို တာဝန်မယူနိုင်ပါ',
        error.response?.data?.detail || 'အခြားအင်ဂျင်နီယာက တာဝန်ယူထားပြီး ဖြစ်နိုင်ပါသည်။',
      );
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'staffInfo']);
    navigation.reset({ index: 0, routes: [{ name: 'StaffLogin' }] });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>စစ်ဆေးမှု Case များ ရယူနေသည်…</Text>
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
        <View style={styles.headerIdentity}>
          <View style={styles.logoBox}>
            <Icon name="hard-hat" size={26} color="#fff" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>TRACK ENGINEER</Text>
            <Text style={styles.title}>စစ်ဆေးမှုလုပ်ငန်းခွင်</Text>
            <Text style={styles.subtitle}>
              {staffInfo?.staff_id || '—'}{staffInfo?.user?.full_name ? ` · ${staffInfo.user.full_name}` : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={logout}>
          <Icon name="logout" size={21} color="#dc2626" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{counts.assigned}</Text>
          <Text style={styles.statLabel}>တာဝန်ပေး Case</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{counts.active}</Text>
          <Text style={styles.statLabel}>လုပ်ဆောင်နေ</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{counts.unchecked}</Text>
          <Text style={styles.statLabel}>မစစ်ရသေး</Text>
        </View>
      </View>

      <View style={styles.toolbarCard}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toolbarTitle}>ပြီးစီးထားသော Case များ</Text>
            <Text style={styles.toolbarHint}>History ကိုလည်း အတူပြရန်</Text>
          </View>
          <Switch value={includeCompleted} onValueChange={setIncludeCompleted} />
        </View>

        <TouchableOpacity style={styles.nearbyButton} onPress={findNearby} disabled={locating}>
          {locating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Icon name="map-search" size={19} color="#fff" />
          )}
          <Text style={styles.nearbyButtonText}>
            {locating ? 'GPS ဖြင့်ရှာနေသည်…' : '၅ မိုင်အတွင်းရှိ Case များရှာရန်'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ကျွန်ုပ်၏ Case များ</Text>
        <Text style={styles.sectionCount}>{cases.length}</Text>
      </View>

      {cases.length ? (
        cases.map(item => (
          <CaseCard
            key={item.id}
            item={item}
            onOpen={caseId => navigation.navigate('TrackIssueDetail', { caseId })}
          />
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Icon name="clipboard-check-outline" size={38} color="#94a3b8" />
          <Text style={styles.emptyTitle}>တာဝန်ပေးထားသော Case မရှိသေးပါ</Text>
          <Text style={styles.emptyText}>Refresh လုပ်ပါ သို့မဟုတ် Nearby Cases ကို စစ်ဆေးပါ။</Text>
        </View>
      )}

      {nearby.length ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>အနီးရှိ Case များ</Text>
            <Text style={styles.sectionCount}>{nearby.length}</Text>
          </View>
          {nearby.map(item => (
            <CaseCard
              key={`nearby-${item.id}`}
              item={item}
              nearby
              onOpen={caseId => navigation.navigate('TrackIssueDetail', { caseId })}
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
  content: { padding: 16, paddingBottom: 48 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: { marginTop: 10, color: '#64748b' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerCopy: { flex: 1 },
  logoBox: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { color: '#0f766e', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#0f172a', fontSize: 21, fontWeight: '900', marginTop: 2 },
  subtitle: { color: '#64748b', fontSize: 11, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textAlign: 'center' },
  toolbarCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolbarTitle: { color: '#1e293b', fontWeight: '800', fontSize: 13 },
  toolbarHint: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  nearbyButton: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    borderRadius: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nearbyButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    marginBottom: 9,
  },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b' },
  sectionCount: {
    minWidth: 28,
    textAlign: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  caseCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  caseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 9, fontWeight: '900' },
  priorityText: { color: '#92400e', fontSize: 10, fontWeight: '800', flexShrink: 1 },
  caseTitle: { color: '#0f172a', fontSize: 15, fontWeight: '900', marginTop: 10 },
  caseMeta: { color: '#64748b', fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  progressTrack: {
    height: 7,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { height: 7, backgroundColor: '#10b981' },
  nearbyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  nearbyText: { color: '#2563eb', fontSize: 10.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 1,
    minHeight: 41,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    minHeight: 41,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: { color: '#0f766e', fontSize: 11, fontWeight: '900' },
  emptyCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    alignItems: 'center',
    padding: 24,
    marginBottom: 14,
  },
  emptyTitle: { color: '#334155', fontSize: 14, fontWeight: '800', marginTop: 8 },
  emptyText: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 4 },
});

export default TrackEngineerHomeScreen;
