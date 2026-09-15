import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import schedulesApi from '../api/schedules';
import { formatRailwayDate, formatRailwayTime } from '../utils/railwayDateTime';
import { colors, radii, shadow } from '../theme/mobileTheme';
import SheetModal from './SheetModal';

const ScheduleListModal = ({ visible, onClose, staffId }) => {
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [stopsMap, setStopsMap] = useState({});
  const [loadingStops, setLoadingStops] = useState({});
  const loadedForStaffRef = useRef(null);

  const loadSchedules = async (manual = false) => {
    if (!staffId) {
      setError('ဝန်ထမ်းအမှတ် မတွေ့ပါ။ ထပ်မံဝင်ရောက်ပါ။');
      return;
    }

    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await schedulesApi.getStaffWeeklySchedules(staffId);
      const schedules = [...(response.schedules || [])].sort(
        (a, b) => new Date(b.departure_date || 0) - new Date(a.departure_date || 0),
      );
      setWeekSchedules(schedules);
      loadedForStaffRef.current = String(staffId);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'ခရီးစဉ်ဇယားကို ရယူ၍ မရပါ။',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!visible || !staffId) return;
    if (loadedForStaffRef.current === String(staffId)) return;
    loadSchedules(false);
  }, [visible, staffId]);

  useEffect(() => {
    setExpandedId(null);
    setStopsMap({});
    setLoadingStops({});
    if (loadedForStaffRef.current && String(staffId || '') !== loadedForStaffRef.current) {
      loadedForStaffRef.current = null;
      setWeekSchedules([]);
    }
  }, [staffId]);

  const fetchScheduleStops = async scheduleId => {
    if (stopsMap[scheduleId] || loadingStops[scheduleId]) return;
    setLoadingStops(prev => ({ ...prev, [scheduleId]: true }));
    try {
      const response = await schedulesApi.getRouteStops(scheduleId);
      const stops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
      }));
      setStopsMap(prev => ({ ...prev, [scheduleId]: stops }));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'ဘူတာအချက်အလက်ကို ရယူ၍ မရပါ။');
    } finally {
      setLoadingStops(prev => ({ ...prev, [scheduleId]: false }));
    }
  };

  const toggleExpand = scheduleId => {
    if (expandedId === scheduleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scheduleId);
    fetchScheduleStops(scheduleId);
  };

  const formatDate = dateStr =>
    dateStr ? formatRailwayDate(dateStr, 'my-MM', { weekday: 'short' }) : '';

  const formatTime = timeStr =>
    timeStr ? formatRailwayTime(timeStr, 'my-MM', { hour12: false }) : '--:--';

  const scheduleStatusLabel = status => ({
    ACTIVE: 'လည်ပတ်နေ',
    COMPLETED: 'ပြီးစီး',
    SCHEDULED: 'စီစဉ်ထား',
    CANCELLED: 'ပယ်ဖျက်ထား',
  }[String(status || '').toUpperCase()] || 'စီစဉ်ထား');

  const getStatusColor = status => {
    switch (String(status || '').toUpperCase()) {
      case 'COMPLETED': return colors.success;
      case 'ACTIVE': return colors.primaryStrong;
      case 'CANCELLED': return colors.danger;
      default: return colors.muted;
    }
  };

  const getStopColor = status => {
    switch (String(status || '').toUpperCase()) {
      case 'ARRIVED': return colors.success;
      case 'DEPARTED': return colors.primaryStrong;
      case 'DELAYED': return colors.warning;
      default: return colors.muted;
    }
  };

  const getStopIcon = status => {
    switch (String(status || '').toUpperCase()) {
      case 'ARRIVED': return 'map-marker';
      case 'DEPARTED': return 'check-circle';
      case 'DELAYED': return 'alert-circle';
      default: return 'clock-outline';
    }
  };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title="ယခုအပတ် ခရီးစဉ်ဇယား"
      subtitle="လိုအပ်သည့်အချိန်တွင်သာ ဆာဗာမှ အချက်အလက်ရယူပါသည်"
      icon="calendar-week"
      fullHeight
    >
      <View style={styles.toolbar}>
        <View style={styles.countWrap}>
          <Text style={styles.countLabel}>ခရီးစဉ်</Text>
          <Text style={styles.count}>{weekSchedules.length}</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, refreshing && styles.buttonDisabled]}
          onPress={() => loadSchedules(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primaryDark} />
          ) : (
            <Icon name="refresh" size={17} color={colors.primaryDark} />
          )}
          <Text style={styles.refreshText}>ပြန်လည်ရယူရန်</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="alert-circle-outline" size={17} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>ခရီးစဉ်ဇယား ရယူနေသည်…</Text>
        </View>
      ) : weekSchedules.length ? (
        weekSchedules.map(item => {
          const isExpanded = expandedId === item.id;
          const stops = stopsMap[item.id] || [];
          const isLoadingStops = Boolean(loadingStops[item.id]);
          const statusColor = getStatusColor(item.status);

          return (
            <View style={styles.card} key={item.id}>
              <TouchableOpacity style={styles.scheduleHeader} onPress={() => toggleExpand(item.id)} activeOpacity={0.78}>
                <View style={styles.trainIcon}>
                  <Icon name="train" size={20} color={colors.primaryStrong} />
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.trainName}>{item.train_name || item.train?.train_name || 'ရထားအမည် မရှိ'}</Text>
                  <Text style={styles.trainNo}>{item.train_no || item.train?.train_no || '—'}</Text>
                  <Text style={styles.date}>{formatDate(item.departure_date)}</Text>
                </View>
                <View style={styles.scheduleRight}>
                  <Text style={styles.time}>{formatTime(item.departure_time)}</Text>
                  <Text style={styles.timeTo}>မှ {formatTime(item.arrival_time)} အထိ</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{scheduleStatusLabel(item.status)}</Text>
                  </View>
                  <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.muted} />
                </View>
              </TouchableOpacity>

              {isExpanded ? (
                <View style={styles.stopsContainer}>
                  {isLoadingStops ? (
                    <View style={styles.inlineLoading}>
                      <ActivityIndicator size="small" color={colors.primaryStrong} />
                      <Text style={styles.loadingText}>ဘူတာများ ရယူနေသည်…</Text>
                    </View>
                  ) : stops.length ? (
                    stops.map((stop, index) => {
                      const stopColor = getStopColor(stop.status);
                      return (
                        <View key={stop.route_station_id || `${item.id}-${index}`} style={styles.stopItem}>
                          <View style={[styles.stopIcon, { backgroundColor: `${stopColor}18` }]}>
                            <Icon name={getStopIcon(stop.status)} size={14} color={stopColor} />
                          </View>
                          <View style={styles.stopInfo}>
                            <View style={styles.stopNameRow}>
                              <Text style={styles.stopName}>{stop.station_name}</Text>
                              {index === 0 ? <Text style={styles.badge}>စတင်</Text> : null}
                              {index === stops.length - 1 ? <Text style={[styles.badge, styles.endBadge]}>အဆုံး</Text> : null}
                            </View>
                            <View style={styles.stopTimes}>
                              {stop.expected_arrival ? <Text style={styles.timeText}>ခန့်မှန်းရောက် {formatTime(stop.expected_arrival)}</Text> : null}
                              {stop.expected_departure ? <Text style={styles.timeText}>ခန့်မှန်းထွက် {formatTime(stop.expected_departure)}</Text> : null}
                              {stop.actual_arrival ? <Text style={styles.actualTime}>ရောက် {formatTime(stop.actual_arrival)}</Text> : null}
                              {stop.actual_departure ? <Text style={styles.actualTime}>ထွက် {formatTime(stop.actual_departure)}</Text> : null}
                              {stop.delay_minutes > 0 ? <Text style={styles.delay}>{stop.delay_minutes} မိနစ် နောက်ကျ</Text> : null}
                            </View>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.noStops}>ဘူတာအချက်အလက် မရှိသေးပါ</Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <View style={styles.emptyBox}>
          <Icon name="calendar-blank-outline" size={32} color={colors.borderStrong} />
          <Text style={styles.emptyTitle}>ယခုအပတ် ခရီးစဉ် မရှိသေးပါ</Text>
          <Text style={styles.emptyText}>အသစ်ပြောင်းလဲမှုရှိမရှိ သိလိုပါက “ပြန်လည်ရယူရန်” ကို နှိပ်ပါ။</Text>
        </View>
      )}
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  countWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  countLabel: { color: colors.textSoft, fontSize: 11, fontWeight: '800' },
  count: { minWidth: 29, height: 29, borderRadius: 15, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.surfaceBlue, color: colors.primaryDark, fontSize: 10.5, fontWeight: '900', overflow: 'hidden' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 11 },
  refreshText: { color: colors.primaryDark, fontSize: 10.5, fontWeight: '900' },
  buttonDisabled: { opacity: 0.55 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F6CDD2', borderRadius: radii.md, padding: 10, marginBottom: 10 },
  errorText: { flex: 1, color: colors.danger, fontSize: 10.5, lineHeight: 16 },
  loadingBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  inlineLoading: { minHeight: 64, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  loadingText: { color: colors.muted, fontSize: 10.5 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  trainIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  scheduleInfo: { flex: 1, marginLeft: 10, minWidth: 0 },
  trainName: { fontWeight: '900', fontSize: 13, color: colors.text },
  trainNo: { fontSize: 10, color: colors.muted, marginTop: 1 },
  date: { fontSize: 9.5, color: colors.muted, marginTop: 3 },
  scheduleRight: { alignItems: 'flex-end', marginLeft: 8 },
  time: { fontWeight: '900', fontSize: 12, color: colors.text },
  timeTo: { fontSize: 9, color: colors.muted },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, marginTop: 4 },
  statusText: { fontSize: 9, fontWeight: '900' },
  stopsContainer: { borderTopWidth: 1, borderTopColor: colors.border, padding: 10, backgroundColor: colors.surfaceSoft },
  stopItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 9, marginBottom: 6 },
  stopIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stopInfo: { flex: 1 },
  stopNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  stopName: { fontWeight: '800', fontSize: 11, color: colors.text },
  badge: { backgroundColor: colors.warningSoft, color: colors.warning, fontSize: 8, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999, marginLeft: 4, overflow: 'hidden' },
  endBadge: { backgroundColor: colors.violetSoft, color: colors.violet },
  stopTimes: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  timeText: { fontSize: 9, color: colors.muted },
  actualTime: { fontSize: 9, color: colors.success, fontWeight: '700' },
  delay: { fontSize: 9, color: colors.danger, fontWeight: '900' },
  noStops: { textAlign: 'center', color: colors.muted, paddingVertical: 12, fontSize: 10 },
  emptyBox: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radii.lg, padding: 18 },
  emptyTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
});

export default ScheduleListModal;
