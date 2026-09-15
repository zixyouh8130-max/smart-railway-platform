import React, { useCallback, useEffect, useState } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import api from '../api/axios';
import ScheduleListModal from '../components/ScheduleListModal';
import { requestLocationPermission } from '../utils/locationPermission';
import {
  formatRailwayDate,
  formatRailwayTime,
  railwayDateTimeToInstant,
} from '../utils/railwayDateTime';
import { colors, radii, shadow } from '../theme/mobileTheme';

const ALERT_THRESHOLD = 15;

const roleLabel = role => ({
  TRAIN_DRIVER: 'ရထားမောင်းသူ',
  ASSISTANT_DRIVER: 'လက်ထောက်မောင်းသူ',
  TRAIN_GUARD: 'ရထားစောင့်',
  TICKET_CHECKER: 'လက်မှတ်စစ်',
}[String(role || '').toUpperCase()] || 'ရထားဝန်ထမ်း');

const statusLabel = value => ({
  ACTIVE: 'ခရီးစဉ်အတွင်း',
  COMPLETED: 'ပြီးစီး',
  SCHEDULED: 'စီစဉ်ထား',
}[String(value || '').toUpperCase()] || 'စီစဉ်ထား');

const TrainRiderHomeScreen = () => {
  const navigation = useNavigation();
  const [staffInfo, setStaffInfo] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingJourney, setStartingJourney] = useState(false);
  const [timeToDeparture, setTimeToDeparture] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [journeyActive, setJourneyActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const fetchScheduleData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    setConnectionError(false);

    try {
      const [userJson, staffJson] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('staffInfo'),
      ]);
      const cachedUser = userJson ? JSON.parse(userJson) : null;
      const cachedStaff = cachedUser?.staff || (staffJson ? JSON.parse(staffJson) : null);
      setStaffInfo(cachedStaff || null);

      if (!cachedStaff?.staff_id) {
        setTodaySchedule(null);
        setJourneyActive(false);
        return;
      }

      // No polling: one load on entry, then only a user-triggered refresh.
      const response = await api.get(`/staff/assignments/current/${cachedStaff.staff_id}`);
      const assignment = response.data || null;
      setTodaySchedule(assignment);
      setJourneyActive(assignment?.status === 'ACTIVE');
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduleData();
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, [fetchScheduleData]);

  useEffect(() => {
    if (!todaySchedule?.departure_time || !todaySchedule?.assignment_date) {
      setTimeToDeparture(null);
      setShowAlert(false);
      return;
    }

    try {
      const serviceDate = String(todaySchedule.assignment_date).slice(0, 10);
      const departureDateTime = railwayDateTimeToInstant(
        `${serviceDate}T${todaySchedule.departure_time}:00`,
      );
      if (!departureDateTime) throw new Error('Invalid railway departure datetime');

      const diffMinutes = Math.floor((departureDateTime.getTime() - Date.now()) / 60000);
      setTimeToDeparture(diffMinutes);
      setShowAlert(!journeyActive && diffMinutes <= ALERT_THRESHOLD);
    } catch (err) {
      console.error('Error calculating departure time:', err);
      setTimeToDeparture(null);
      setShowAlert(false);
    }
  }, [todaySchedule, currentTime, journeyActive]);

  const handleStartJourney = async () => {
    if (startingJourney) return;
    setStartingJourney(true);

    try {
      if (!staffInfo?.staff_id) {
        Alert.alert(
          'ဝန်ထမ်းအမှတ် မတွေ့ပါ',
          'တည်နေရာခြေရာခံစနစ်အတွက် ဝင်ရောက်ထားသော ဝန်ထမ်းအချက်အလက် လိုအပ်ပါသည်။',
        );
        return;
      }

      const locationGranted = await requestLocationPermission();
      if (!locationGranted) {
        Alert.alert(
          'တည်နေရာအသုံးပြုခွင့် လိုအပ်ပါသည်',
          'တိုက်ရိုက်ရထားခြေရာခံမှုအတွက် တည်နေရာအသုံးပြုခွင့် ပေးပါ။',
        );
        return;
      }

      const response = await api.post(
        `/staff/assignments/${todaySchedule.assignment_id}/start-journey`,
        { device_id: staffInfo.staff_id },
      );

      const activeAssignment = {
        ...todaySchedule,
        schedule_id: response.data?.schedule_id || todaySchedule.schedule_id,
        status: response.data?.status || 'ACTIVE',
        schedule_status: response.data?.schedule_status || 'ACTIVE',
        tracking_ready: true,
      };

      setTodaySchedule(activeAssignment);
      setJourneyActive(true);
      setShowAlert(false);
      navigation.navigate('LiveTracking', {
        currentAssignment: activeAssignment,
        staffInfo,
      });
    } catch (err) {
      console.error('Failed to start journey:', err.response?.data || err);
      const detail = err.response?.data?.detail;
      Alert.alert(
        'ခရီးစဉ် စတင်၍ မရပါ',
        typeof detail === 'string'
          ? detail
          : detail?.message || 'ခရီးစဉ် စတင်ရန် မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
      );
    } finally {
      setStartingJourney(false);
    }
  };

  const handleManualRefresh = () => fetchScheduleData(true);
  const formatTime = value => formatRailwayTime(value, 'my-MM', { hour12: false });
  const formatDate = value => value
    ? formatRailwayDate(value, 'my-MM', { weekday: 'long' })
    : '';

  const getTimeStatusText = () => {
    if (journeyActive) return 'ခရီးစဉ်အတွင်း';
    if (timeToDeparture === null) return 'တွက်ချက်နေသည်…';
    if (timeToDeparture > 60) return `${Math.floor(timeToDeparture / 60)} နာရီကျော်`;
    if (timeToDeparture > 0) return `${timeToDeparture} မိနစ်`;
    if (timeToDeparture === 0) return 'ယခုထွက်ခွာရန်';
    return 'ထွက်ခွာချိန် ကျော်လွန်';
  };

  const getTimeStatusColor = () => {
    if (journeyActive) return colors.success;
    if (timeToDeparture === null) return colors.muted;
    if (timeToDeparture <= 5 && timeToDeparture >= 0) return colors.danger;
    if (timeToDeparture <= 15) return colors.warning;
    return colors.primaryStrong;
  };

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Icon name="train-variant" size={24} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SMART RAILWAY</Text>
          <Text style={styles.pageTitle}>ရထားခရီးစဉ်</Text>
          <Text style={styles.roleText}>{roleLabel(staffInfo?.role)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.roundAction}
        onPress={handleManualRefresh}
        disabled={refreshing}
        activeOpacity={0.8}
      >
        {refreshing
          ? <ActivityIndicator size="small" color={colors.primaryDark} />
          : <Icon name="refresh" size={19} color={colors.primaryDark} />}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.loadingIcon}>
          <Icon name="train" size={28} color={colors.primaryDark} />
        </View>
        <ActivityIndicator size="small" color={colors.primaryStrong} />
        <Text style={styles.loadingText}>ယနေ့တာဝန်ကို ရယူနေသည်…</Text>
      </View>
    );
  }

  if (!todaySchedule) {
    return (
      <>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleManualRefresh} />}
        >
          {renderTopBar()}
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Icon name="calendar-check-outline" size={34} color={colors.primaryStrong} />
            </View>
            <Text style={styles.emptyTitle}>ယနေ့အတွက် တာဝန်မရှိသေးပါ</Text>
            <Text style={styles.emptyText}>
              လက်ရှိတာဝန်အသစ်ရှိမရှိ သိလိုပါက ပြန်လည်စစ်ဆေးနိုင်သည်။ ခရီးစဉ်ဇယားကိုလည်း အောက်ပါခလုတ်မှ ကြည့်နိုင်သည်။
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.primarySmallButton} onPress={handleManualRefresh} disabled={refreshing}>
                {refreshing
                  ? <ActivityIndicator size="small" color={colors.primaryDark} />
                  : <Icon name="refresh" size={18} color={colors.primaryDark} />}
                <Text style={styles.primarySmallButtonText}>ပြန်လည်စစ်ဆေးမည်</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondarySmallButton} onPress={() => setScheduleOpen(true)}>
                <Icon name="calendar-week-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.secondarySmallButtonText}>ခရီးစဉ်ဇယား</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        <ScheduleListModal
          visible={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          staffId={staffInfo?.staff_id}
        />
      </>
    );
  }

  const currentStatus = todaySchedule.schedule_status || todaySchedule.status;
  const canStart = journeyActive || timeToDeparture == null || timeToDeparture <= 15;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleManualRefresh} />}
      >
        {renderTopBar()}

        {showAlert && !journeyActive ? (
          <View style={styles.alertCard}>
            <View style={styles.alertIcon}>
              <Icon name="bell-ring-outline" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>ထွက်ခွာချိန် နီးလာပါပြီ</Text>
              <Text style={styles.alertText}>
                {timeToDeparture > 0
                  ? `နောက်ထပ် ${timeToDeparture} မိနစ်အတွင်း ထွက်ခွာရမည်`
                  : timeToDeparture === 0
                    ? 'ထွက်ခွာချိန် ရောက်ရှိပါပြီ'
                    : 'သတ်မှတ်ထွက်ခွာချိန် ကျော်လွန်နေပါသည်'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={[styles.statusPill, journeyActive && styles.statusPillActive]}>
              <View style={[styles.statusDot, journeyActive && styles.statusDotActive]} />
              <Text style={[styles.statusPillText, journeyActive && styles.statusPillTextActive]}>
                {statusLabel(currentStatus)}
              </Text>
            </View>
            <TouchableOpacity style={styles.scheduleChip} onPress={() => setScheduleOpen(true)}>
              <Icon name="calendar-week-outline" size={15} color={colors.primaryDark} />
              <Text style={styles.scheduleChipText}>ဇယား</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroLabel}>ယနေ့တာဝန်</Text>
          <View style={styles.trainRow}>
            <View style={styles.trainIconBox}>
              <Icon name="train" size={28} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trainName}>{todaySchedule.train_name || 'ရထား'}</Text>
              <Text style={styles.trainNo}>{todaySchedule.train_no || '—'}</Text>
            </View>
          </View>

          <View style={styles.timeJourney}>
            <View style={styles.timePoint}>
              <Text style={styles.timeCaption}>ထွက်ခွာ</Text>
              <Text style={styles.timeLarge}>{formatTime(todaySchedule.departure_time)}</Text>
              <Text style={styles.dateText}>{formatDate(todaySchedule.assignment_date)}</Text>
            </View>
            <View style={styles.routeConnector}>
              <View style={styles.routeDot} />
              <View style={styles.routeLine} />
              <Icon name="train" size={16} color={colors.primaryStrong} />
              <View style={styles.routeLine} />
              <View style={[styles.routeDot, styles.routeDotEnd]} />
            </View>
            <View style={[styles.timePoint, styles.timePointRight]}>
              <Text style={styles.timeCaption}>ရောက်ရှိ</Text>
              <Text style={styles.timeLarge}>{formatTime(todaySchedule.arrival_time)}</Text>
              <Text style={styles.dateText}>ခန့်မှန်းချိန်</Text>
            </View>
          </View>

          {!journeyActive && timeToDeparture !== null ? (
            <View style={styles.countdownCard}>
              <View>
                <Text style={styles.countdownLabel}>ထွက်ခွာရန် ကျန်ချိန်</Text>
                <Text style={[styles.countdownValue, { color: getTimeStatusColor() }]}>
                  {getTimeStatusText()}
                </Text>
              </View>
              <View style={styles.countdownIcon}>
                <Icon name="clock-outline" size={22} color={getTimeStatusColor()} />
              </View>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Icon name={connectionError ? 'wifi-off' : 'wifi'} size={13} color={connectionError ? colors.danger : colors.success} />
              <Text style={styles.metaText}>{connectionError ? 'ဆာဗာချိတ်ဆက်မှု မရှိ' : 'ဆာဗာချိတ်ဆက်ထား'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Icon name="update" size={13} color={colors.muted} />
              <Text style={styles.metaText}>{lastUpdated ? lastUpdated.toLocaleTimeString('my-MM') : 'မစစ်ရသေး'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickCard} onPress={() => setScheduleOpen(true)}>
            <View style={styles.quickIcon}>
              <Icon name="calendar-month-outline" size={20} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>ခရီးစဉ်ဇယား</Text>
              <Text style={styles.quickText}>ယခုအပတ်တာဝန်များကို ကြည့်ရန်</Text>
            </View>
            <Icon name="chevron-right" size={19} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={handleManualRefresh} disabled={refreshing}>
            <View style={styles.quickIcon}>
              {refreshing
                ? <ActivityIndicator size="small" color={colors.primaryDark} />
                : <Icon name="refresh" size={20} color={colors.primaryDark} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>တာဝန် ပြန်လည်စစ်ဆေးရန်</Text>
              <Text style={styles.quickText}>လိုအပ်မှသာ ဆာဗာမှ အချက်အလက်ရယူမည်</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (!canStart || startingJourney) && styles.buttonDisabled]}
          onPress={journeyActive
            ? () => navigation.navigate('LiveTracking', { currentAssignment: todaySchedule, staffInfo })
            : handleStartJourney}
          disabled={!journeyActive && (!canStart || startingJourney)}
          activeOpacity={0.84}
        >
          {startingJourney ? (
            <ActivityIndicator size="small" color={colors.primaryDark} />
          ) : (
            <Icon name={journeyActive ? 'map-marker-path' : 'play-circle-outline'} size={23} color={colors.primaryDark} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryButtonText}>
              {journeyActive
                ? 'တိုက်ရိုက်တည်နေရာ ကြည့်ရှုရန်'
                : timeToDeparture != null && timeToDeparture > 15
                  ? 'ထွက်ခွာချိန် စောင့်ဆိုင်းပါ'
                  : 'ခရီးစဉ် စတင်မည်'}
            </Text>
            <Text style={styles.primaryButtonSubtext}>
              {journeyActive ? 'GPS၊ ဘူတာနှင့် ခရီးလမ်းကြောင်းကို ကြည့်ရန်' : 'စတင်ပြီးနောက် GPS ခြေရာခံမှု ဖွင့်မည်'}
            </Text>
          </View>
          {!startingJourney ? <Icon name="arrow-right" size={20} color={colors.primaryDark} /> : null}
        </TouchableOpacity>
      </ScrollView>

      <ScheduleListModal
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        staffId={staffInfo?.staff_id}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { padding: 16, paddingTop: 18, paddingBottom: 42 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 10, padding: 24 },
  loadingIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  loadingText: { color: colors.textSoft, fontSize: 12.5, fontWeight: '700' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.primaryStrong, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.1 },
  pageTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 1 },
  roleText: { color: colors.muted, fontSize: 10.5, marginTop: 1, fontWeight: '700' },
  roundAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#F4DCB2', borderRadius: radii.lg, padding: 12, marginBottom: 12 },
  alertIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF1D3', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
  alertText: { color: '#8B662A', fontSize: 10.5, marginTop: 2, lineHeight: 15 },

  heroCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 26, padding: 16, ...shadow },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusPillActive: { backgroundColor: colors.successSoft },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryStrong },
  statusDotActive: { backgroundColor: colors.success },
  statusPillText: { color: colors.primaryDark, fontSize: 9.5, fontWeight: '900' },
  statusPillTextActive: { color: colors.success },
  scheduleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  scheduleChipText: { color: colors.primaryDark, fontSize: 9.5, fontWeight: '900' },
  heroLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 16 },
  trainRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  trainIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  trainName: { color: colors.text, fontSize: 20, fontWeight: '900' },
  trainNo: { color: colors.primaryDark, fontSize: 11, fontWeight: '800', marginTop: 2 },

  timeJourney: { flexDirection: 'row', alignItems: 'center', marginTop: 18, backgroundColor: colors.surfaceSoft, borderRadius: radii.lg, padding: 12, borderWidth: 1, borderColor: colors.border },
  timePoint: { width: 92 },
  timePointRight: { alignItems: 'flex-end' },
  timeCaption: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  timeLarge: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  dateText: { color: colors.muted, fontSize: 8.5, marginTop: 2 },
  routeConnector: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  routeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryStrong },
  routeDotEnd: { backgroundColor: colors.success },
  routeLine: { flex: 1, height: 2, backgroundColor: colors.borderStrong },

  countdownCard: { marginTop: 12, borderRadius: radii.lg, backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdownLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  countdownValue: { fontSize: 21, fontWeight: '900', marginTop: 2 },
  countdownIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  metaText: { color: colors.textSoft, fontSize: 8.8, fontWeight: '700' },

  quickActions: { gap: 9, marginTop: 12 },
  quickCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, ...shadow },
  quickIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  quickText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 2 },

  primaryButton: { marginTop: 13, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.lg, paddingHorizontal: 15, paddingVertical: 12, ...shadow },
  primaryButtonText: { color: colors.primaryText, fontSize: 13.5, fontWeight: '900' },
  primaryButtonSubtext: { color: colors.primaryDark, opacity: 0.78, fontSize: 9.5, marginTop: 2 },
  buttonDisabled: { opacity: 0.46 },

  emptyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 26, padding: 24, alignItems: 'center', ...shadow },
  emptyIcon: { width: 70, height: 70, borderRadius: 23, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  emptyText: { color: colors.textSoft, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  emptyActions: { width: '100%', gap: 8, marginTop: 18 },
  primarySmallButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  primarySmallButtonText: { color: colors.primaryDark, fontSize: 11.5, fontWeight: '900' },
  secondarySmallButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  secondarySmallButtonText: { color: colors.primaryDark, fontSize: 11.5, fontWeight: '900' },
});

export default TrainRiderHomeScreen;
