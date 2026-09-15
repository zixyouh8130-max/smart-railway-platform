import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import schedulesApi from '../api/schedules';
import { formatRailwayDate, formatRailwayTime } from '../utils/railwayDateTime';
import { colors, radii, shadow } from '../theme/mobileTheme';

const ScheduleScreen = () => {
  const navigation = useNavigation();
  const [staffInfo, setStaffInfo] = useState(null);
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [stopsMap, setStopsMap] = useState({});
  const [loadingStops, setLoadingStops] = useState({});

  useEffect(() => {
    loadStaffAndSchedules();
  }, []);

  const loadStaffAndSchedules = async () => {
    setLoading(true);
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const staff = user.staff;
        setStaffInfo(staff);
        if (staff?.staff_id) {
          await fetchWeekSchedules(staff.staff_id);
        } else {
          setWeekSchedules([]);
        }
      } else {
        setWeekSchedules([]);
      }
    } catch (err) {
      console.error('Error loading staff or schedules:', err);
      setWeekSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeekSchedules = async (staffId) => {
    try {
      const response = await schedulesApi.getStaffWeeklySchedules(staffId);
      let schedules = response.schedules || [];
      schedules.sort((a, b) => new Date(b.departure_date) - new Date(a.departure_date));
      setWeekSchedules(schedules);
    } catch (err) {
      console.error('Failed to fetch weekly schedules:', err);
      setWeekSchedules([]);
    }
  };

  const fetchScheduleStops = async (scheduleId) => {
    if (stopsMap[scheduleId]) return;
    setLoadingStops(prev => ({ ...prev, [scheduleId]: true }));
    try {
      const response = await schedulesApi.getRouteStops(scheduleId);
      const stops = (response.stops || []).map(s => ({
        ...s,
        route_station_id: s.route_station_id || s.id,
      }));
      setStopsMap(prev => ({ ...prev, [scheduleId]: stops }));
    } catch (err) {
      console.error('Failed to fetch stops:', err);
    } finally {
      setLoadingStops(prev => ({ ...prev, [scheduleId]: false }));
    }
  };

  const toggleExpand = (scheduleId) => {
    if (expandedId === scheduleId) {
      setExpandedId(null);
    } else {
      setExpandedId(scheduleId);
      fetchScheduleStops(scheduleId);
    }
  };

  const formatDate = dateStr =>
    dateStr
      ? formatRailwayDate(dateStr, 'my-MM', { weekday: 'short' })
      : '';

  const formatTime = (timeStr) =>
    timeStr ? formatRailwayTime(timeStr, 'my-MM', { hour12: false }) : '--:--';

  const formatActualTime = (timeStr) => formatRailwayTime(timeStr, 'my-MM', { hour12: false });

  const scheduleStatusLabel = status => ({
    ACTIVE: 'လည်ပတ်နေ',
    COMPLETED: 'ပြီးစီး',
    SCHEDULED: 'စီစဉ်ထား',
    CANCELLED: 'ပယ်ဖျက်ထား',
  }[String(status || '').toUpperCase()] || 'စီစဉ်ထား');

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return '#10b981';
      case 'ACTIVE': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStopColor = (status) => {
    switch (status) {
      case 'ARRIVED': return '#10b981';
      case 'DEPARTED': return '#3b82f6';
      case 'DELAYED': return '#f59e0b';
      default: return '#9ca3af';
    }
  };

  const getStopIcon = (status) => {
    switch (status) {
      case 'ARRIVED': return 'map-marker';
      case 'DEPARTED': return 'check-circle';
      case 'DELAYED': return 'alert-circle';
      default: return 'clock-outline';
    }
  };

  const renderScheduleItem = ({ item }) => {
    const isExpanded = expandedId === item.id;
    const stops = stopsMap[item.id] || [];
    const isLoadingStops = loadingStops[item.id];

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.scheduleHeader} onPress={() => toggleExpand(item.id)} activeOpacity={0.7}>
          <View style={styles.trainIcon}>
            <Icon name="train" size={20} color="#3b82f6" />
          </View>
          <View style={styles.scheduleInfo}>
            <Text style={styles.trainName}>{item.train_name || item.train?.train_name || 'ရထားအမည် မရှိ'}</Text>
            <Text style={styles.trainNo}>{item.train_no || item.train?.train_no}</Text>
            <Text style={styles.date}>{formatDate(item.departure_date)}</Text>
          </View>
          <View style={styles.scheduleRight}>
            <Text style={styles.time}>{formatTime(item.departure_time)}</Text>
            <Text style={styles.timeTo}>မှ {formatTime(item.arrival_time)} အထိ</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={{ color: getStatusColor(item.status), fontSize: 10, fontWeight: 'bold' }}>{scheduleStatusLabel(item.status)}</Text>
            </View>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#9ca3af" />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.stopsContainer}>
            {isLoadingStops ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : stops.length > 0 ? (
              stops.map((stop, index) => (
                <View key={stop.route_station_id || index} style={styles.stopItem}>
                  <View style={[styles.stopIcon, { backgroundColor: getStopColor(stop.status) + '20' }]}>
                    <Icon name={getStopIcon(stop.status)} size={14} color={getStopColor(stop.status)} />
                  </View>
                  <View style={styles.stopInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.stopName}>{stop.station_name}</Text>
                      {index === 0 && <Text style={styles.badge}>စတင်</Text>}
                      {index === stops.length - 1 && <Text style={[styles.badge, { backgroundColor: '#ede9fe', color: '#6d28d9' }]}>အဆုံး</Text>}
                    </View>
                    <View style={styles.stopTimes}>
                      {stop.expected_arrival && <Text style={styles.timeText}>ခန့်မှန်းရောက်ချိန် - {formatTime(stop.expected_arrival)}</Text>}
                      {stop.expected_departure && <Text style={styles.timeText}>ခန့်မှန်းထွက်ချိန် - {formatTime(stop.expected_departure)}</Text>}
                      {stop.actual_arrival && <Text style={styles.actualTime}>ရောက်ချိန် - {formatActualTime(stop.actual_arrival)}</Text>}
                      {stop.actual_departure && <Text style={styles.actualTime}>ထွက်ချိန် - {formatActualTime(stop.actual_departure)}</Text>}
                      {stop.delay_minutes > 0 && <Text style={styles.delay}>{stop.delay_minutes} မိနစ် နောက်ကျ</Text>}
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noStops}>ဘူတာအချက်အလက် မရှိသေးပါ</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="calendar-week" size={20} color="#3b82f6" />
        <Text style={styles.headerTitle}>ယခုအပတ် ခရီးစဉ်ဇယား</Text>
        <Text style={styles.count}>{weekSchedules.length}</Text>
      </View>
      <FlatList
        data={weekSchedules}
        renderItem={renderScheduleItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-left" size={24} color={colors.primaryDark} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 14, paddingTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12, ...shadow },
  headerTitle: { fontWeight: '900', marginLeft: 8, color: colors.text, flex: 1, fontSize: 15 },
  count: { minWidth: 30, height: 30, borderRadius: 15, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900', color: colors.primaryDark, backgroundColor: colors.surfaceBlue, overflow: 'hidden' },
  listContent: { paddingBottom: 90 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', padding: 13 },
  trainIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  scheduleInfo: { flex: 1, marginLeft: 10 },
  trainName: { fontWeight: '900', fontSize: 13.5, color: colors.text },
  trainNo: { fontSize: 10.5, color: colors.muted, marginTop: 1 },
  date: { fontSize: 10, color: colors.muted, marginTop: 3 },
  scheduleRight: { alignItems: 'flex-end' },
  time: { fontWeight: '900', fontSize: 12.5, color: colors.text },
  timeTo: { fontSize: 9.5, color: colors.muted },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, marginTop: 4 },
  stopsContainer: { borderTopWidth: 1, borderTopColor: colors.border, padding: 11, backgroundColor: colors.surfaceSoft },
  stopItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 9, marginBottom: 6 },
  stopIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stopInfo: { flex: 1 },
  stopName: { fontWeight: '800', fontSize: 11.5, color: colors.text },
  badge: { backgroundColor: colors.warningSoft, color: colors.warning, fontSize: 8.5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999, marginLeft: 4, overflow: 'hidden' },
  stopTimes: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  timeText: { fontSize: 9.5, color: colors.muted, marginRight: 8 },
  actualTime: { fontSize: 9.5, color: colors.success, marginRight: 8, fontWeight: '700' },
  delay: { fontSize: 9.5, color: colors.danger, fontWeight: '900' },
  noStops: { textAlign: 'center', color: colors.muted, paddingVertical: 12, fontSize: 10.5 },
  backButton: { position: 'absolute', top: 16, left: 16, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 15, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', zIndex: 10, ...shadow },
});

export default ScheduleScreen;