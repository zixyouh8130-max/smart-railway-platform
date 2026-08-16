import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../api/axios';
import { requestLocationPermission } from '../utils/locationPermission';

const ALERT_THRESHOLD = 15;   // minutes

const TrainRiderHomeScreen = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeToDeparture, setTimeToDeparture] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [journeyActive, setJourneyActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  const clockIntervalRef = useRef(null);

  const fetchScheduleData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    setConnectionError(false);
    try {
      const userResponse = await api.get('/auth/me');
      setUser(userResponse.data);
      if (userResponse.data.staff) {
        setStaffInfo(userResponse.data.staff);
        const staffId = userResponse.data.staff.staff_id;
        const assignmentResponse = await api.get(`/staff/assignments/current/${staffId}`);
        if (assignmentResponse.data) {
          const newSchedule = assignmentResponse.data;
          setTodaySchedule(newSchedule);
          setLastUpdated(new Date());
          setJourneyActive(newSchedule.status === 'ACTIVE');
        } else {
          setTodaySchedule(null);
          setJourneyActive(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch schedule only ONCE when Home page first opens.
    fetchScheduleData();

    // This only updates the countdown clock.
    // It does NOT call the backend.
    clockIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    };
  }, [fetchScheduleData]);

  useEffect(() => {
    if (todaySchedule?.departure_time && todaySchedule?.assignment_date) {
      calculateTimeToDeparture();
    }
  }, [todaySchedule, currentTime]);

  const calculateTimeToDeparture = () => {
    try {
      const timeParts = todaySchedule.departure_time.split(':');
      const departureDateTime = new Date(todaySchedule.assignment_date);
      departureDateTime.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      const diffMs = departureDateTime.getTime() - new Date().getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      setTimeToDeparture(diffMinutes);
      if (diffMinutes <= ALERT_THRESHOLD && diffMinutes > 0 && !journeyActive) {
        setShowAlert(true);
      } else if (diffMinutes <= 0 && !journeyActive) {
        setShowAlert(true);
      } else {
        setShowAlert(false);
      }
    } catch (err) {
      console.error('Error calculating departure time:', err);
      setTimeToDeparture(null);
    }
  };

  const handleStartJourney = async () => {
    try {
      // 1. Ask for location permission first
      const locationGranted = await requestLocationPermission();

      if (!locationGranted) {
        Alert.alert(
          'Location Permission Required',
          'Live train tracking အတွက် တည်နေရာအသုံးပြုခွင့် လိုအပ်ပါသည်။',
        );
        return;
      }

      // 2. Only start the journey after permission is granted
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';

      const response = await api.post(
        `/staff/assignments/${todaySchedule.assignment_id}/start-journey`,
        {
          device_id: deviceId,
        },
      );

      // 3. Update local state
      setJourneyActive(true);
      setShowAlert(false);

      // 4. Open live tracking
      navigation.navigate('LiveTracking', {
        currentAssignment: todaySchedule,
        staffInfo: staffInfo,
      });

    } catch (err) {
      console.error('Failed to start journey:', err);

      Alert.alert(
        'Error',
        'ခရီးစဉ် စတင်ရန် မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
      );
    }
  };

  const handleManualRefresh = () => {
    fetchScheduleData(true);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('my-MM', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getTimeStatusText = () => {
    if (journeyActive) return 'ခရီးစဉ်အတွင်း';
    if (timeToDeparture === null) return 'တွက်ချက်နေသည်...';
    if (timeToDeparture > 60) return `${Math.floor(timeToDeparture / 60)} နာရီကျော်`;
    if (timeToDeparture > 0) return `${timeToDeparture} မိနစ်`;
    if (timeToDeparture === 0) return 'ယခုထွက်ခွာရန်';
    return 'ထွက်ခွာပြီး';
  };

  const getTimeStatusColor = () => {
    if (journeyActive) return '#059669';
    if (timeToDeparture === null) return '#6b7280';
    if (timeToDeparture <= 5 && timeToDeparture >= 0) return '#dc2626';
    if (timeToDeparture <= 15) return '#d97706';
    return '#2563eb';
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>အချက်အလက်များ ရယူနေသည်...</Text>
      </View>
    );
  }

  if (!todaySchedule) {
    return (
      <ScrollView contentContainerStyle={styles.noScheduleContainer}>
        <View style={styles.noScheduleCard}>
          <Icon name="calendar-blank" size={60} color="#d1d5db" />
          <Text style={styles.noScheduleTitle}>ယနေ့အတွက် တာဝန်မရှိပါ</Text>
          <Text style={styles.noScheduleText}>
            {staffInfo ? 'ယနေ့ တာဝန်ချထားခြင်း မရှိသေးပါ။' : 'ကျေးဇူးပြု၍ အက်ဒမင်ထံ ဆက်သွယ်ပါ။'}
          </Text>
          <TouchableOpacity style={styles.outlineButton} onPress={handleManualRefresh} disabled={refreshing}>
            <Icon name="refresh" size={18} color="#4b5563" />
            <Text style={styles.outlineButtonText}>ပြန်လည်စစ်ဆေးမည်</Text>
          </TouchableOpacity>
          {/* Schedule Button */}
          <TouchableOpacity style={styles.outlineButton} onPress={() => navigation.navigate('Schedule')}>
            <Icon name="calendar-week" size={18} color="#dc2626" />
            <Text style={styles.scheduleBtnText}>This Week Schedules</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleManualRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoSmall}>
          <Icon name="train" size={30} color="#fff" />
        </View>
        <Text style={styles.title}>Train Rider</Text>
        {staffInfo && (
          <Text style={styles.roleText}>
            {staffInfo.role === 'TRAIN_DRIVER' ? 'ရထားမောင်းသူ' :
             staffInfo.role === 'ASSISTANT_DRIVER' ? 'လက်ထောက်မောင်းသူ' :
             staffInfo.role === 'TRAIN_GUARD' ? 'ရထားစောင့်' : 'လက်မှတ်စစ်'}
          </Text>
        )}

        {/* Connection status */}
        <View style={styles.statusRow}>
          {connectionError ? (
            <View style={styles.statusItem}>
              <Icon name="wifi-off" size={14} color="#ef4444" />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          ) : (
            <View style={styles.statusItem}>
              <Icon name="wifi" size={14} color="#10b981" />
              <Text style={styles.onlineText}>Connected</Text>
            </View>
          )}
          {lastUpdated && (
            <Text style={styles.updatedText}>
              Updated: {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
          <TouchableOpacity onPress={handleManualRefresh} style={styles.refreshIcon}>
            <Icon name="refresh" size={14} color="#dc2626" />
          </TouchableOpacity>
        </View>

        {/* Schedule Button */}
        <TouchableOpacity style={styles.scheduleBtn} onPress={() => navigation.navigate('Schedule')}>
          <Icon name="calendar-week" size={18} color="#dc2626" />
          <Text style={styles.scheduleBtnText}>Schedule</Text>
        </TouchableOpacity>
      </View>

      {/* Alert */}
      {showAlert && !journeyActive && (
        <View style={styles.alertCard}>
          <View style={styles.alertIcon}>
            <Icon name="bell-ring" size={20} color="#d97706" />
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>ထွက်ခွာချိန် နီးပါပြီ!</Text>
            <Text style={styles.alertText}>
              {timeToDeparture > 0
                ? `နောက်ထပ် ${timeToDeparture} မိနစ်အတွင်း ထွက်ခွာရမည်`
                : timeToDeparture === 0
                  ? 'ထွက်ခွာချိန် ရောက်ရှိပါပြီ'
                  : 'ထွက်ခွာချိန် ကျော်လွန်သွားပါပြီ'}
            </Text>
          </View>
        </View>
      )}

      {/* Today's Schedule Card */}
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleTitleRow}>
            <Icon name="calendar" size={20} color="#dc2626" />
            <Text style={styles.scheduleTitle}>ယနေ့ ခရီးစဉ်</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {journeyActive ? 'ခရီးစဉ်အတွင်း' :
               timeToDeparture <= 0 ? 'ထွက်ခွာရန်' : 'စောင့်ဆိုင်းဆဲ'}
            </Text>
          </View>
        </View>

        {/* Train Info */}
        <View style={styles.trainInfo}>
          <Icon name="train" size={30} color="#dc2626" />
          <View>
            <Text style={styles.trainName}>{todaySchedule.train_name}</Text>
            <Text style={styles.trainNo}>{todaySchedule.train_no}</Text>
          </View>
        </View>

        {/* Times */}
        <View style={styles.timesRow}>
          <View style={styles.timeBoxDeparture}>
            <Text style={styles.timeLabel}>ထွက်ခွာချိန်</Text>
            <Text style={styles.timeValue}>{formatTime(todaySchedule.departure_time)}</Text>
            <Text style={styles.dateText}>{formatDate(todaySchedule.assignment_date)}</Text>
          </View>
          <View style={styles.timeBoxArrival}>
            <Text style={styles.timeLabel}>ရောက်ရှိမည့်အချိန်</Text>
            <Text style={styles.timeValue}>{formatTime(todaySchedule.arrival_time)}</Text>
          </View>
        </View>

        {/* Countdown Timer */}
        {!journeyActive && timeToDeparture !== null && (
          <View style={[styles.countdownBox,
            { backgroundColor: timeToDeparture <= 0 ? '#fef2f2' : timeToDeparture <= 15 ? '#fffbeb' : '#f9fafb' }]}>
            <Text style={styles.countdownLabel}>ထွက်ခွာရန် ကျန်ချိန်</Text>
            <Text style={[styles.countdownValue, { color: getTimeStatusColor() }]}>
              {getTimeStatusText()}
            </Text>
            {timeToDeparture > 0 && (
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, ((ALERT_THRESHOLD - timeToDeparture) / ALERT_THRESHOLD) * 100))}%`,
                      backgroundColor: timeToDeparture <= 15 ? '#f59e0b' : '#3b82f6',
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}

        {/* Schedule Status */}
        <View style={styles.scheduleStatusRow}>
          <Text style={styles.scheduleStatusText}>
            Status: {todaySchedule.status} | Last checked: {lastUpdated?.toLocaleTimeString() || 'Never'}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {!journeyActive ? (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              timeToDeparture > 15 && styles.buttonDisabled,
            ]}
            onPress={handleStartJourney}
            disabled={timeToDeparture > 15}
          >
            <Icon name="play" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {timeToDeparture <= 0 ? 'ထွက်ခွာမည်' :
               timeToDeparture <= 15 ? 'စောစီးစွာ ထွက်ခွာမည်' :
               'ထွက်ခွာချိန် စောင့်ဆိုင်းပါ'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: '#059669' }]}
            onPress={() =>
              navigation.navigate('LiveTracking', {
                currentAssignment: todaySchedule,
                staffInfo: staffInfo,
              })
            }
          >
            <Icon name="map" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>Live Tracking ကြည့်ရှုရန်</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.ghostButton} onPress={handleManualRefresh} disabled={refreshing}>
          <Icon name="refresh" size={16} color="#9ca3af" />
          <Text style={styles.ghostButtonText}>အချက်အလက်များ ပြန်လည်စစ်ဆေးမည်</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 16,
  },
  noScheduleContainer: {
    flexGrow: 1,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  noScheduleCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  noScheduleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
  },
  noScheduleText: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  outlineButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoSmall: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  roleText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  onlineText: {
    fontSize: 12,
    color: '#10b981',
    marginLeft: 4,
  },
  offlineText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 4,
  },
  updatedText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  refreshIcon: {
    marginLeft: 8,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 20,
  },
  scheduleBtnText: {
    marginLeft: 6,
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertContent: {
    flex: 1,
    marginLeft: 12,
  },
  alertTitle: {
    fontWeight: 'bold',
    color: '#92400e',
    fontSize: 14,
  },
  alertText: {
    color: '#b45309',
    fontSize: 13,
    marginTop: 2,
  },
  scheduleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  badge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  trainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  trainName: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
  },
  trainNo: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 12,
  },
  timesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeBoxDeparture: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginRight: 5,
  },
  timeBoxArrival: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginLeft: 5,
  },
  timeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  countdownBox: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  countdownLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  countdownValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scheduleStatusRow: {
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleStatusText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actionButtons: {
    marginTop: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  ghostButtonText: {
    color: '#9ca3af',
    fontSize: 14,
    marginLeft: 6,
  },
});

export default TrainRiderHomeScreen;