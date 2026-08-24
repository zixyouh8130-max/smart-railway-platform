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
import { formatRailwayTime } from '../utils/railwayDateTime';

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

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const formatActualTime = (timeStr) => formatRailwayTime(timeStr);

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
            <Text style={styles.trainName}>{item.train_name || item.train?.train_name || 'Unknown Train'}</Text>
            <Text style={styles.trainNo}>{item.train_no || item.train?.train_no}</Text>
            <Text style={styles.date}>{formatDate(item.departure_date)}</Text>
          </View>
          <View style={styles.scheduleRight}>
            <Text style={styles.time}>{formatTime(item.departure_time)}</Text>
            <Text style={styles.timeTo}>to {formatTime(item.arrival_time)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={{ color: getStatusColor(item.status), fontSize: 10, fontWeight: 'bold' }}>{item.status}</Text>
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
                      {index === 0 && <Text style={styles.badge}>Start</Text>}
                      {index === stops.length - 1 && <Text style={[styles.badge, { backgroundColor: '#ede9fe', color: '#6d28d9' }]}>End</Text>}
                    </View>
                    <View style={styles.stopTimes}>
                      {stop.expected_arrival && <Text style={styles.timeText}>ETA: {stop.expected_arrival}</Text>}
                      {stop.expected_departure && <Text style={styles.timeText}>ETD: {stop.expected_departure}</Text>}
                      {stop.actual_arrival && <Text style={styles.actualTime}>Arr: {formatActualTime(stop.actual_arrival)}</Text>}
                      {stop.actual_departure && <Text style={styles.actualTime}>Dep: {formatActualTime(stop.actual_departure)}</Text>}
                      {stop.delay_minutes > 0 && <Text style={styles.delay}>+{stop.delay_minutes}m</Text>}
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noStops}>No station data available</Text>
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
        <Text style={styles.headerTitle}>This Week's Schedules</Text>
        <Text style={styles.count}>{weekSchedules.length}</Text>
      </View>
      <FlatList
        data={weekSchedules}
        renderItem={renderScheduleItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#1e40af',
    flex: 1,
  },
  count: {
    fontWeight: 'bold',
    color: '#1e40af',
  },
  listContent: {
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  trainIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: 10,
  },
  trainName: {
    fontWeight: 'bold',
    fontSize: 15,
  },
  trainNo: {
    fontSize: 12,
    color: '#6b7280',
  },
  date: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  scheduleRight: {
    alignItems: 'flex-end',
  },
  time: {
    fontWeight: '600',
    fontSize: 14,
  },
  timeTo: {
    fontSize: 11,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  stopsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  stopIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontWeight: '600',
    fontSize: 13,
  },
  badge: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  stopTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#6b7280',
    marginRight: 8,
  },
  actualTime: {
    fontSize: 11,
    color: '#059669',
    marginRight: 8,
  },
  delay: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: 'bold',
  },
  noStops: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 12,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#1f2937',
    borderRadius: 25,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});

export default ScheduleScreen;