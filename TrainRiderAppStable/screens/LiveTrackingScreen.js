import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Geolocation from '@react-native-community/geolocation';

import schedulesApi from '../api/schedules';
import locationTrackingApi from '../api/locationTracking';
import TrainTrackerMap from '../components/TrainTrackerMap';
import { requestLocationPermission } from '../utils/locationPermission';
import { formatRailwayTime } from '../utils/railwayDateTime';
import { colors, radii, shadow } from '../theme/mobileTheme';

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 3000,
  distanceFilter: 8,
  // Native GPS may still emit small stationary "jitter" updates. The JS layer
  // below decides whether a server sync is actually needed.
  interval: 4000,
  fastestInterval: 2000,
};

const MOVEMENT_SEND_THRESHOLD_METERS = 15;
const STATIONARY_HEARTBEAT_MS = 30000;
const MIN_SEND_INTERVAL_MS = 2500;

const distanceBetweenMeters = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = value => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const LiveTrackingScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { currentAssignment, staffInfo } = route.params || {};

  const [gpsData, setGpsData] = useState({
    latitude: null,
    longitude: null,
    speed: null,
    accuracy: null,
    lastUpdate: null,
  });
  const [currentLocation, setCurrentLocation] = useState(null);
  const [arrivalAlert, setArrivalAlert] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [currentStation, setCurrentStation] = useState(null);
  const [nextStation, setNextStation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [journeyCompleted, setJourneyCompleted] = useState(false);
  const [loadingStops, setLoadingStops] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [distanceToStation, setDistanceToStation] = useState(null);
  const [lastServerSync, setLastServerSync] = useState(null);
  const [syncMode, setSyncMode] = useState('စတင်နေသည်');

  const watchIdRef = useRef(null);
  const journeyCompletedRef = useRef(false);
  const sendingLocationRef = useRef(false);
  const lastSentLocationRef = useRef(null);
  const lastMapLocationRef = useRef(null);
  const lastSendAttemptAtRef = useRef(0);
  const lastAutoEventRef = useRef({ station: null, time: null, type: null });

  const showNotification = (title, description, type = 'success') => {
    setNotification({ title, description, type });
    setTimeout(() => setNotification(null), 4500);
  };

  useEffect(() => {
    journeyCompletedRef.current = journeyCompleted;
    if (journeyCompleted) {
      stopGPSTracking();
    }
  }, [journeyCompleted]);

  useEffect(() => {
    let disposed = false;

    const initializeTracking = async () => {
      if (!currentAssignment?.schedule_id) {
        setLoadingStops(false);
        setGpsError('ဤတည်နေရာခြေရာခံမျက်နှာပြင်နှင့် ချိတ်ဆက်ထားသော ခရီးစဉ် မရှိပါ။');
        return;
      }

      const routeData = await fetchRouteStops();
      if (disposed) return;

      const status = routeData?.schedule_status || currentAssignment?.status;
      if (status === 'COMPLETED') {
        setJourneyCompleted(true);
        return;
      }

      if (status !== 'ACTIVE') {
        setGpsError(
          'ခရီးစဉ် မစတင်ရသေးပါ။ ရထားခရီးစဉ် မူလမျက်နှာပြင်မှ ထွက်ခွာမည်ကို အရင်နှိပ်ပါ။',
        );
        return;
      }

      await startGPSTracking();
    };

    initializeTracking();

    return () => {
      disposed = true;
      stopGPSTracking();
    };
  }, [currentAssignment?.schedule_id, staffInfo?.staff_id]);

  useEffect(() => {
    if (routeStops.length > 0) {
      const current = routeStops.find(stop => stop.status === 'ARRIVED');
      const next = routeStops.find(stop => stop.status === 'SCHEDULED');
      setCurrentStation(current?.station_name || null);
      setNextStation(next?.station_name || null);
    }
  }, [routeStops]);

  const fetchRouteStops = async () => {
    if (!currentAssignment?.schedule_id) return null;

    setLoadingStops(true);
    try {
      const response = await schedulesApi.getRouteStops(
        currentAssignment.schedule_id,
      );
      const stops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
        train_stop_id: stop.train_stop_id || null,
      }));
      setRouteStops(stops);

      if (response.schedule_status === 'COMPLETED') {
        setJourneyCompleted(true);
      }

      return response;
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
      const message = err?.detail || 'လမ်းကြောင်းဘူတာများ ရယူ၍ မရပါ';
      showNotification('လမ်းကြောင်း အမှား', message, 'error');
      return null;
    } finally {
      setLoadingStops(false);
    }
  };

  const stopGPSTracking = () => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    sendingLocationRef.current = false;
    lastSentLocationRef.current = null;
    lastMapLocationRef.current = null;
    lastSendAttemptAtRef.current = 0;
    setIsTracking(false);
  };

  const startGPSTracking = async () => {
    if (!staffInfo?.staff_id) {
      setGpsError('ရထားဝန်ထမ်းအမှတ် မတွေ့ပါ။ ထပ်မံဝင်ရောက်ပါ။');
      return;
    }

    const granted = await requestLocationPermission();
    if (!granted) {
      setGpsError(
        'တည်နေရာအသုံးပြုခွင့် ပိတ်ထားပါသည်။ တိုက်ရိုက်ရထားခြေရာခံရန် တိကျသောတည်နေရာအသုံးပြုခွင့် ပေးပါ။',
      );
      return;
    }

    stopGPSTracking();
    setGpsError(null);
    setIsTracking(true);

    // Send one fresh fix immediately; do not wait for watchPosition.
    Geolocation.getCurrentPosition(handlePosition, handleGPSError, GPS_OPTIONS);

    watchIdRef.current = Geolocation.watchPosition(
      handlePosition,
      handleGPSError,
      GPS_OPTIONS,
    );
  };

  const handlePosition = async position => {
    if (journeyCompletedRef.current) return;

    const { latitude, longitude, speed, accuracy } = position.coords;
    const speedMps = speed != null && Number.isFinite(Number(speed)) ? Math.max(0, Number(speed)) : 0;
    const speedMph = Math.max(0, Math.round(speedMps * 2.2369362920544));
    const accuracyMeters = accuracy != null ? Math.round(accuracy) : null;
    const now = Date.now();
    const rawPoint = { latitude: Number(latitude), longitude: Number(longitude) };

    const location = {
      latitude: rawPoint.latitude,
      longitude: rawPoint.longitude,
      speed: speedMph,
      accuracy: accuracyMeters,
      lastUpdate: new Date(now),
    };

    // Always refresh the local GPS readout. Server syncing is filtered below so
    // stationary GPS jitter does not generate a POST every few seconds.
    setGpsData(location);
    setGpsError(null);

    const previous = lastSentLocationRef.current;
    const movedMeters = previous ? distanceBetweenMeters(previous, rawPoint) : Infinity;
    const elapsedSinceSuccess = previous?.sentAt ? now - previous.sentAt : Infinity;
    const elapsedSinceAttempt = now - lastSendAttemptAtRef.current;
    const appearsMoving = speedMps >= 0.8 || movedMeters >= MOVEMENT_SEND_THRESHOLD_METERS;
    const heartbeatDue = elapsedSinceSuccess >= STATIONARY_HEARTBEAT_MS;
    const shouldSend = !previous || appearsMoving || heartbeatDue;

    const mapMovedMeters = lastMapLocationRef.current
      ? distanceBetweenMeters(lastMapLocationRef.current, rawPoint)
      : Infinity;
    if (!lastMapLocationRef.current || speedMps >= 0.8 || mapMovedMeters >= MOVEMENT_SEND_THRESHOLD_METERS) {
      // Keep the map stable while the train is stationary; tiny GPS drift does
      // not make the marker/camera jump around or trigger extra map tile work.
      lastMapLocationRef.current = rawPoint;
      setCurrentLocation([rawPoint.latitude, rawPoint.longitude]);
    }

    if (!shouldSend) {
      setSyncMode('ရပ်နေ — GPS အပြောင်းအလဲစောင့်နေ');
      return;
    }

    if (elapsedSinceAttempt < MIN_SEND_INTERVAL_MS || sendingLocationRef.current || !staffInfo?.staff_id) {
      return;
    }

    lastSendAttemptAtRef.current = now;
    sendingLocationRef.current = true;
    setSyncMode(appearsMoving ? 'ရွေ့လျားနေ — တိုက်ရိုက်ပို့နေ' : 'ရပ်နေ — အချိန်မှန်အပ်ဒိတ်');

    try {
      const response = await locationTrackingApi.updateLocation({
        device_id: staffInfo.staff_id,
        latitude: rawPoint.latitude,
        longitude: rawPoint.longitude,
        speed: speedMph,
        accuracy: accuracyMeters,
      });
      lastSentLocationRef.current = { ...rawPoint, sentAt: Date.now() };
      setLastServerSync(new Date());
      lastMapLocationRef.current = rawPoint;
      setCurrentLocation([rawPoint.latitude, rawPoint.longitude]);
      handleTrackingResponse(response);
    } catch (err) {
      console.error('Failed to send location:', err);
      const detail = err?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || 'လက်ရှိတည်နေရာကို နောက်ခံဆာဗာသို့ ပို့၍ မရပါ။';
      setGpsError(message);
      setSyncMode('ဆာဗာသို့ ပို့မရ');
    } finally {
      sendingLocationRef.current = false;
    }
  };

  const handleGPSError = error => {
    console.error('GPS Error:', error);
    const messages = {
      1: 'တည်နေရာအသုံးပြုခွင့် ပိတ်ထားပါသည်။ ဖုန်းဆက်တင်တွင် တည်နေရာအသုံးပြုခွင့် ဖွင့်ပါ။',
      2: 'လက်ရှိ GPS တည်နေရာ မရနိုင်ပါ။ ဖုန်း၏ တည်နေရာစနစ် ဖွင့်ထားကြောင်း စစ်ဆေးပါ။',
      3: 'GPS ရယူချိန် ကျော်လွန်သွားပါသည်။ အချက်ပြကောင်းသောနေရာသို့ ရွှေ့ပြီး ထပ်မံကြိုးစားပါ။',
    };
    setGpsError(messages[error.code] || error.message || 'GPS တည်နေရာကို ဖတ်၍ မရပါ။');
    setIsTracking(false);
  };

  const handleTrackingResponse = data => {
    if (!data) return;

    if (data.distance_to_station_m != null) {
      setDistanceToStation({
        meters: data.distance_to_station_m,
        station: data.proximity_station_name || null,
      });
    }

    if (data.arrival_detected) {
      const stationName = data.station_name;
      const now = Date.now();
      const isNewArrival =
        lastAutoEventRef.current.station !== stationName ||
        lastAutoEventRef.current.type !== 'arrival' ||
        now - lastAutoEventRef.current.time > 10000;

      if (isNewArrival) {
        lastAutoEventRef.current = {
          station: stationName,
          time: now,
          type: 'arrival',
        };

        if (data.is_last_station) {
          journeyCompletedRef.current = true;
          setJourneyCompleted(true);
          setArrivalAlert(null);
          setCurrentStation(stationName);
          setNextStation(null);
          setDistanceToStation(null);
          showNotification(
            '🎉 ခရီးစဉ် ပြီးစီးပါပြီ',
            `ခရီးဆုံးဘူတာ ${stationName} သို့ ရောက်ရှိပါပြီ`,
          );
        } else {
          setArrivalAlert(data);
          setCurrentStation(stationName);
          setNextStation(data.next_station?.name || null);
          showNotification('📍 အလိုအလျောက် ရောက်ရှိမှတ်တမ်းတင်ပြီး', `${stationName} သို့ ရောက်ရှိပါပြီ`);
        }
      }

      fetchRouteStops();
    }

    if (data.auto_departed) {
      const now = Date.now();
      const isNewDeparture =
        lastAutoEventRef.current.type !== 'departure' ||
        now - lastAutoEventRef.current.time > 10000;

      if (isNewDeparture) {
        lastAutoEventRef.current = {
          station: data.station_name || null,
          time: now,
          type: 'departure',
        };
        showNotification(
          '🚂 အလိုအလျောက် ထွက်ခွာမှတ်တမ်းတင်ပြီး',
          `ရထားသည် ${data.station_name || 'ဘူတာ'} မှ ထွက်ခွာသွားပါပြီ။`,
        );
      }

      setArrivalAlert(null);
      setCurrentStation(null);
      fetchRouteStops();
    }
  };

  const handleStationArrival = async (routeStationId, trainStopId) => {
    if (!routeStationId || !staffInfo?.staff_id) {
      showNotification('အချက်အလက်မပြည့်စုံပါ', 'ရထားဝန်ထမ်း သို့မဟုတ် ဘူတာအချက်အလက် မပြည့်စုံပါ', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      const payload = {
        route_station_id: routeStationId,
        train_stop_id: trainStopId || null,
      };

      if (gpsData.latitude != null && gpsData.longitude != null) {
        payload.latitude = gpsData.latitude;
        payload.longitude = gpsData.longitude;
      }

      const response = await locationTrackingApi.manualArrival(
        staffInfo.staff_id,
        payload,
      );

      if (response.is_last_station) {
        journeyCompletedRef.current = true;
        setJourneyCompleted(true);
        setArrivalAlert(null);
        setCurrentStation(response.station_name || null);
        setNextStation(null);
        showNotification(
          '🎉 ခရီးစဉ် ပြီးစီးပါပြီ',
          'ရထားသည် ခရီးဆုံးဘူတာသို့ ရောက်ရှိပါပြီ။',
        );
      } else {
        setArrivalAlert(response);
        setCurrentStation(response.station_name || null);
        setNextStation(response.next_station?.name || null);
        showNotification(
          'Manual ရောက်ရှိမှု မှတ်တမ်းတင်ပြီး',
          `${response.station_name} သို့ ရောက်ရှိမှု မှတ်တမ်းတင်ပြီးပါပြီ။`,
        );
      }

      await fetchRouteStops();
    } catch (err) {
      console.error('Manual arrival failed:', err);
      const detail = err?.detail;
      showNotification(
        'Manual ရောက်ရှိမှု မှတ်တမ်းတင်၍ မရပါ',
        typeof detail === 'string' ? detail : detail?.message || 'ရောက်ရှိမှုကို မှတ်တမ်းတင်၍ မရပါ',
        'error',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStationDeparture = async (routeStationId, trainStopId) => {
    if (!staffInfo?.staff_id || !trainStopId) {
      showNotification('အချက်အလက်မပြည့်စုံပါ', 'ရထားဝန်ထမ်း သို့မဟုတ် ဘူတာရပ်နားမှုအချက်အလက် မပြည့်စုံပါ', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      await locationTrackingApi.logDeparture(staffInfo.staff_id, trainStopId, {
        manual_departure: true,
        route_station_id: routeStationId,
      });
      setArrivalAlert(null);
      setCurrentStation(null);
      showNotification('Manual ထွက်ခွာမှု မှတ်တမ်းတင်ပြီး', 'ရထားထွက်ခွာမှုကို မှတ်တမ်းတင်ပြီးပါပြီ။');
      await fetchRouteStops();
    } catch (err) {
      console.error('Manual departure failed:', err);
      const detail = err?.detail;
      showNotification(
        'Manual ထွက်ခွာမှု မှတ်တမ်းတင်၍ မရပါ',
        typeof detail === 'string' ? detail : detail?.message || 'ထွက်ခွာမှုကို မှတ်တမ်းတင်၍ မရပါ',
        'error',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'ARRIVED':
        return <Icon name="map-marker" size={16} color="#10b981" />;
      case 'DEPARTED':
        return <Icon name="check-circle" size={16} color="#3b82f6" />;
      default:
        return <Icon name="clock-outline" size={16} color="#9ca3af" />;
    }
  };

  const getStatusBg = status => {
    switch (status) {
      case 'ARRIVED':
        return { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' };
      case 'DEPARTED':
        return { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' };
      default:
        return { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' };
    }
  };

  const formatTime = timeString => formatRailwayTime(timeString);

  const departedCount = routeStops.filter(stop => stop.status === 'DEPARTED').length;
  const finalArrivedCompleted =
    journeyCompleted && routeStops[routeStops.length - 1]?.status === 'ARRIVED' ? 1 : 0;
  const completedCount = departedCount + finalArrivedCompleted;
  const progressPercent =
    routeStops.length > 0
      ? Math.min(100, (completedCount / routeStops.length) * 100)
      : 0;

  const nextManualStop = routeStops.find(stop => stop.status === 'SCHEDULED');
  const arrivedManualStop = routeStops.find(stop => stop.status === 'ARRIVED');

  const notificationColor = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.liveTopBar}>
          <TouchableOpacity style={styles.inlineBackButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={colors.primaryDark} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveEyebrow}>LIVE TRAIN TRACKING</Text>
            <Text style={styles.liveTitle}>{currentAssignment?.train_name || 'ရထား တိုက်ရိုက်ခြေရာခံမှု'}</Text>
            <Text style={styles.liveSubtitle}>{currentAssignment?.train_no || '—'} · {currentAssignment?.schedule_id ? `ခရီးစဉ် #${currentAssignment.schedule_id}` : 'ခရီးစဉ်'}</Text>
          </View>
          <View style={[styles.livePill, !isTracking && styles.livePillPaused]}>
            <View style={[styles.liveDot, !isTracking && styles.liveDotPaused]} />
            <Text style={[styles.livePillText, !isTracking && styles.livePillTextPaused]}>
              {journeyCompleted ? 'ပြီးစီး' : isTracking ? 'LIVE' : 'စောင့်နေ'}
            </Text>
          </View>
        </View>

        {notification && (
          <View
            style={[
              styles.notification,
              { borderLeftColor: notificationColor[notification.type] || '#3b82f6' },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              {notification.description && (
                <Text style={styles.notificationDesc}>{notification.description}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setNotification(null)}>
              <Icon name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        )}

        {journeyCompleted && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedEmoji}>🎉</Text>
            <Text style={styles.completedTitle}>ခရီးစဉ် ပြီးစီးပါပြီ</Text>
            <Text style={styles.completedText}>
              ခရီးဆုံးဘူတာသို့ ရောက်ရှိပြီး ခရီးစဉ်ဇယား၊ တာဝန်နှင့် တည်နေရာခြေရာခံမှုအားလုံး ပြီးစီးပါပြီ။
            </Text>
          </View>
        )}

        <View style={styles.mapSectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>လမ်းကြောင်း</Text>
            <Text style={styles.sectionTitle}>ရထား တိုက်ရိုက်တည်နေရာ</Text>
          </View>
          <View style={styles.gpsAccuracyChip}>
            <Icon name="crosshairs-gps" size={13} color={colors.primaryDark} />
            <Text style={styles.gpsAccuracyText}>{gpsData.accuracy != null ? `±${gpsData.accuracy} မီတာ` : 'GPS စောင့်နေ'}</Text>
          </View>
        </View>

        <TrainTrackerMap
          routeStops={routeStops}
          currentLocation={currentLocation}
          currentStation={currentStation}
          nextStation={nextStation}
        />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon
              name="satellite-variant"
              size={18}
              color={isTracking && !journeyCompleted ? '#10b981' : '#9ca3af'}
            />
            <Text style={styles.statLabel}>GPS အခြေအနေ</Text>
            <Text style={styles.statValue}>
              {journeyCompleted ? 'ပြီးစီး' : isTracking ? 'လုပ်ဆောင်နေ' : 'ရပ်ထား'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="speedometer" size={18} color="#dc2626" />
            <Text style={styles.statLabel}>အမြန်နှုန်း</Text>
            <Text style={styles.statValue}>{journeyCompleted ? '0' : gpsData.speed || 0} မိုင်/နာရီ</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="map-marker" size={18} color="#10b981" />
            <Text style={styles.statLabel}>လက်ရှိဘူတာ</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {journeyCompleted ? currentStation || 'ခရီးဆုံး' : currentStation || 'ခရီးလမ်းပေါ်'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="navigation" size={18} color="#3b82f6" />
            <Text style={styles.statLabel}>နောက်ဘူတာ</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {journeyCompleted ? '--' : nextStation || '--'}
            </Text>
          </View>
        </View>

        {!journeyCompleted ? (
          <View style={styles.syncCard}>
            <View style={styles.syncIcon}>
              <Icon name="cloud-upload-outline" size={19} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncTitle}>တည်နေရာ ပို့ဆောင်မှု</Text>
              <Text style={styles.syncText}>{syncMode}</Text>
              <Text style={styles.syncHint}>ရထားမရွေ့ပါက GPS အနည်းငယ်လှုပ်ရှားမှုကို မပို့ဘဲ ၃၀ စက္ကန့်တစ်ကြိမ်သာ အခြေအနေအတည်ပြုမည်။</Text>
            </View>
            <View style={styles.syncTimeBox}>
              <Text style={styles.syncTimeLabel}>နောက်ဆုံးပို့</Text>
              <Text style={styles.syncTimeValue}>{lastServerSync ? lastServerSync.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}</Text>
            </View>
          </View>
        ) : null}

        {gpsError && !journeyCompleted && (
          <View style={styles.trackingErrorCard}>
            <Icon name="alert-circle" size={20} color="#dc2626" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.trackingErrorTitle}>GPS / တည်နေရာခြေရာခံမှု ပြဿနာ</Text>
              <Text style={styles.trackingErrorText}>{gpsError}</Text>
            </View>
          </View>
        )}

        {distanceToStation && !journeyCompleted && (
          <Text style={styles.distanceText}>
            {distanceToStation.station ? `${distanceToStation.station}: ` : ''}
            {distanceToStation.meters} မီတာအကွာတွင် ဘူတာအလိုအလျောက်မှတ်တမ်းတင်မှတ် ရှိသည်
          </Text>
        )}

        {arrivalAlert && !journeyCompleted && (
          <View style={styles.arrivalCard}>
            <View style={styles.arrivalHeader}>
              <Icon name="map-marker" size={24} color={colors.primaryDark} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.arrivalTitle}>ဘူတာသို့ ရောက်ရှိပါပြီ</Text>
                <Text style={styles.arrivalStation}>{arrivalAlert.station_name}</Text>
              </View>
            </View>
            {arrivalAlert.next_station && (
              <View style={styles.nextStationBox}>
                <Text style={styles.nextStationText}>
                  နောက်ဘူတာ - {arrivalAlert.next_station.name}
                </Text>
              </View>
            )}
            {manualMode ? (
              <TouchableOpacity
                style={styles.departButton}
                onPress={() =>
                  handleStationDeparture(
                    arrivalAlert.route_station_id,
                    arrivalAlert.train_stop_id,
                  )
                }
                disabled={isUpdating}
              >
                <Text style={styles.departButtonText}>
                  {isUpdating ? 'မှတ်တမ်းတင်နေသည်…' : 'ယခု Manualထွက်ခွာမှတ်တမ်းတင်မည်'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.automaticDepartureText}>
                ရထားသည် ဤဘူတာမှ မီတာ ၅၀ ကျော် ရွှေ့သွားပါက ထွက်ခွာမှုကို အလိုအလျောက် မှတ်တမ်းတင်မည်။
              </Text>
            )}
          </View>
        )}

        {!journeyCompleted && routeStops.length > 0 && (
          <View style={styles.manualCard}>
            <View style={styles.manualHeader}>
              <View style={styles.manualInfo}>
                <Text style={styles.manualTitle}>Manual ဘူတာမှတ်တမ်းတင်မှု</Text>
                <Text style={styles.manualText}>
                  GPS အလိုအလျောက်မှတ်တမ်းတင်မှုကို အဓိကအသုံးပြုပါ။ ရောက်ရှိ/ထွက်ခွာမှုကို ကိုယ်တိုင် ကူညီမှတ်တမ်းတင်ရန်သာ ဤစနစ်ကို ဖွင့်ပါ။
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.manualToggle,
                  manualMode && styles.manualToggleActive,
                ]}
                onPress={() => setManualMode(value => !value)}
                disabled={isUpdating}
              >
                <Text
                  style={[
                    styles.manualToggleText,
                    manualMode && styles.manualToggleTextActive,
                  ]}
                >
                  {manualMode ? 'ပိတ်မည်' : 'ဖွင့်မည်'}
                </Text>
              </TouchableOpacity>
            </View>

            {manualMode && arrivedManualStop && (
              <TouchableOpacity
                style={[styles.manualAction, styles.manualDepartAction]}
                onPress={() =>
                  handleStationDeparture(
                    arrivedManualStop.route_station_id,
                    arrivedManualStop.train_stop_id,
                  )
                }
                disabled={isUpdating || !arrivedManualStop.train_stop_id}
              >
                <Icon name="logout" size={17} color={colors.primaryDark} />
                <Text style={styles.manualActionText}>
                  Manual ထွက်ခွာမှတ်တမ်းတင် — {arrivedManualStop.station_name}
                </Text>
              </TouchableOpacity>
            )}

            {manualMode && !arrivedManualStop && nextManualStop && (
              <TouchableOpacity
                style={styles.manualAction}
                onPress={() =>
                  handleStationArrival(
                    nextManualStop.route_station_id,
                    nextManualStop.train_stop_id,
                  )
                }
                disabled={isUpdating || !nextManualStop.train_stop_id}
              >
                <Icon name="map-marker-check" size={17} color={colors.primaryDark} />
                <Text style={styles.manualActionText}>
                  Manual ရောက်ရှိမှတ်တမ်းတင် — {nextManualStop.station_name}
                </Text>
              </TouchableOpacity>
            )}

            {manualMode && !arrivedManualStop && !nextManualStop && (
              <Text style={styles.manualHint}>Manual မှတ်တမ်းတင်နိုင်သော ဘူတာလုပ်ဆောင်ချက် မရှိပါ။</Text>
            )}
          </View>
        )}

        {loadingStops ? (
          <ActivityIndicator
            size="small"
            color="#3b82f6"
            style={{ marginVertical: 20 }}
          />
        ) : routeStops.length > 0 ? (
          <View style={styles.stationsCard}>
            <View style={styles.stationsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="train" size={18} color="#1d4ed8" />
                <Text style={styles.stationsTitle}>လမ်းကြောင်းဘူတာများ</Text>
              </View>
              <Text style={styles.stationsCount}>
                {completedCount}/{routeStops.length} ပြီးစီး
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>

            {routeStops.map((stop, index) => (
              <View
                key={stop.route_station_id || index}
                style={[styles.stopItem, getStatusBg(stop.status)]}
              >
                <View style={styles.stopIconContainer}>{getStatusIcon(stop.status)}</View>
                <View style={styles.stopInfo}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Text style={styles.stopName}>{stop.station_name}</Text>
                    {index === 0 && <Text style={styles.badge}>စတင်</Text>}
                    {index === routeStops.length - 1 && (
                      <Text
                        style={[
                          styles.badge,
                          { backgroundColor: '#ede9fe', color: '#6d28d9' },
                        ]}
                      >
                        အဆုံး
                      </Text>
                    )}
                    {manualMode &&
                      nextManualStop?.route_station_id === stop.route_station_id && (
                        <Text style={styles.nextStopText}>နောက်ဘူတာ</Text>
                      )}
                  </View>
                  <View style={styles.stopTimes}>
                    {stop.expected_arrival && (
                      <Text style={styles.timeText}>🕐 ခန့်မှန်းရောက်ချိန် - {formatTime(stop.expected_arrival)}</Text>
                    )}
                    {stop.expected_departure && (
                      <Text style={styles.timeText}>🚂 ခန့်မှန်းထွက်ချိန် - {formatTime(stop.expected_departure)}</Text>
                    )}
                    {stop.actual_arrival && (
                      <Text style={styles.timeActual}>
                        ✅ ရောက်ချိန် - {formatTime(stop.actual_arrival)}
                      </Text>
                    )}
                    {stop.actual_departure && (
                      <Text style={styles.timeActual}>
                        🚂 ထွက်ချိန် - {formatTime(stop.actual_departure)}
                      </Text>
                    )}
                    {stop.delay_minutes > 0 && (
                      <Text style={styles.delayText}>⚠️ {stop.delay_minutes} မိနစ် နောက်ကျ</Text>
                    )}
                  </View>
                </View>
                {stop.status === 'DEPARTED' && (
                  <Text style={styles.doneText}>✓</Text>
                )}
                {journeyCompleted &&
                  index === routeStops.length - 1 &&
                  stop.status === 'ARRIVED' && <Text style={styles.doneText}>🏁</Text>}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.coordsCard}>
          <View style={styles.coordsHeader}>
            <Icon name="satellite-variant" size={16} color="#6b7280" />
            <Text style={styles.coordsTitle}>GPS ကိုဩဒိနိတ်</Text>
            {gpsData.lastUpdate && (
              <Text style={styles.coordsUpdated}>
                နောက်ဆုံးရယူချိန် - {gpsData.lastUpdate.toLocaleTimeString('my-MM')}
              </Text>
            )}
          </View>
          <View style={styles.coordsRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>လတ္တီတွဒ်</Text>
              <Text style={styles.coordValue}>
                {gpsData.latitude?.toFixed(6) || '--'}
              </Text>
            </View>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>လောင်ဂျီတွဒ်</Text>
              <Text style={styles.coordValue}>
                {gpsData.longitude?.toFixed(6) || '--'}
              </Text>
            </View>
          </View>
          {gpsData.accuracy != null && (
            <Text style={styles.accuracyText}>
              GPS တိကျမှု - ±{gpsData.accuracy} မီတာ
            </Text>
          )}
        </View>
      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 14, paddingTop: 16, paddingBottom: 48 },
  liveTopBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  inlineBackButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow },
  liveEyebrow: { color: colors.primaryStrong, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.9 },
  liveTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 1 },
  liveSubtitle: { color: colors.muted, fontSize: 9.5, marginTop: 2, fontWeight: '700' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  livePillPaused: { backgroundColor: colors.surfaceSoft },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveDotPaused: { backgroundColor: colors.muted },
  livePillText: { color: colors.success, fontSize: 9, fontWeight: '900' },
  livePillTextPaused: { color: colors.textSoft },
  mapSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.primaryStrong, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 1 },
  gpsAccuracyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  gpsAccuracyText: { color: colors.primaryDark, fontSize: 8.5, fontWeight: '800' },
  syncCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, marginBottom: 14, ...shadow },
  syncIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  syncTitle: { color: colors.text, fontSize: 11.5, fontWeight: '900' },
  syncText: { color: colors.primaryDark, fontSize: 10, fontWeight: '800', marginTop: 2 },
  syncHint: { color: colors.muted, fontSize: 8.8, lineHeight: 13, marginTop: 3 },
  syncTimeBox: { alignItems: 'flex-end', paddingLeft: 4 },
  syncTimeLabel: { color: colors.muted, fontSize: 8 },
  syncTimeValue: { color: colors.textSoft, fontSize: 9.5, fontWeight: '900', marginTop: 2 },
  notification: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderLeftWidth: 4, borderRadius: radii.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border, ...shadow },
  notificationTitle: { fontWeight: '900', fontSize: 13, color: colors.text },
  notificationDesc: { fontSize: 11, color: colors.textSoft, marginTop: 2, lineHeight: 16 },
  completedBanner: { backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.xl, padding: 20, alignItems: 'center', marginBottom: 14 },
  completedEmoji: { fontSize: 30 },
  completedTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginTop: 7 },
  completedText: { color: colors.textSoft, textAlign: 'center', marginTop: 4, fontSize: 12, lineHeight: 18 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statCard: { width: '48%', flexGrow: 1, minHeight: 84, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 11, alignItems: 'flex-start', justifyContent: 'center', ...shadow },
  statLabel: { fontSize: 9, color: colors.muted, marginTop: 6, fontWeight: '700' },
  statValue: { fontSize: 12.5, fontWeight: '900', color: colors.text, marginTop: 2 },
  arrivalCard: { backgroundColor: colors.surfaceBlue, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.xl, padding: 15, marginBottom: 14 },
  arrivalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  arrivalTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  arrivalStation: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  nextStationBox: { backgroundColor: colors.surface, borderRadius: 10, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  nextStationText: { color: colors.textSoft, fontSize: 11.5 },
  departButton: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  departButtonText: { color: colors.primaryDark, fontWeight: '900' },
  stationsCard: { backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: 15, marginTop: 14, ...shadow },
  stationsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stationsTitle: { fontSize: 15, fontWeight: '900', marginLeft: 7, color: colors.text },
  stationsCount: { fontSize: 10.5, color: colors.muted, fontWeight: '700' },
  progressBarBg: { height: 7, backgroundColor: colors.surfaceBlue, borderRadius: 999, marginBottom: 12, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primaryStrong },
  stopItem: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.md, padding: 10, marginBottom: 8, borderColor: colors.border },
  stopIconContainer: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  stopInfo: { flex: 1 },
  stopName: { fontWeight: '800', fontSize: 12.5, color: colors.text, marginRight: 4 },
  badge: { backgroundColor: colors.warningSoft, color: colors.warning, fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginLeft: 4, overflow: 'hidden' },
  stopTimes: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  timeText: { fontSize: 9.5, color: colors.muted, marginRight: 8 },
  timeActual: { fontSize: 9.5, color: colors.success, marginRight: 8, fontWeight: '700' },
  delayText: { fontSize: 9.5, color: colors.danger, fontWeight: '800' },
  actionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 8, borderWidth: 1, borderColor: colors.borderStrong },
  actionButtonText: { color: colors.primaryDark, fontSize: 10, marginLeft: 4, fontWeight: '900' },
  doneText: { fontSize: 15, marginLeft: 8 },
  coordsCard: { backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: 15, marginTop: 14, ...shadow },
  coordsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  coordsTitle: { fontSize: 13, fontWeight: '900', marginLeft: 6, color: colors.text },
  coordsUpdated: { fontSize: 9, color: colors.muted, marginLeft: 'auto' },
  coordsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  coordItem: { flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 11, padding: 9 },
  coordLabel: { fontSize: 9.5, color: colors.muted },
  coordValue: { fontFamily: 'monospace', fontWeight: '900', fontSize: 12.5, marginTop: 2, color: colors.text },
  accuracyText: { fontSize: 9.5, color: colors.muted, marginTop: 8 },
  trackingErrorCard: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F6CDD2', borderRadius: radii.md, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' },
  trackingErrorTitle: { color: colors.danger, fontWeight: '900', fontSize: 12.5 },
  trackingErrorText: { color: colors.danger, fontSize: 10.5, marginTop: 2 },
  distanceText: { textAlign: 'center', color: colors.textSoft, fontSize: 10.5, marginBottom: 10, fontWeight: '700' },
  automaticDepartureText: { color: colors.textSoft, fontSize: 10.5, marginTop: 4, textAlign: 'center' },
  manualCard: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#F5DEB9', borderRadius: radii.lg, padding: 13, marginTop: 14 },
  manualHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manualInfo: { flex: 1, paddingRight: 12 },
  manualTitle: { color: colors.text, fontWeight: '900', fontSize: 12.5 },
  manualText: { color: '#8B662A', fontSize: 10, marginTop: 3, lineHeight: 15 },
  manualToggle: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface },
  manualToggleActive: { backgroundColor: colors.primary },
  manualToggleText: { color: colors.primaryDark, fontWeight: '800', fontSize: 10.5 },
  manualToggleTextActive: { color: colors.primaryDark },
  manualAction: { marginTop: 11, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  manualDepartAction: { backgroundColor: colors.surfaceBlue },
  manualActionText: { color: colors.primaryDark, fontWeight: '900', marginLeft: 6, fontSize: 11.5 },
  manualHint: { marginTop: 10, color: '#8B662A', fontSize: 10 },
  nextStopText: { color: colors.warning, fontSize: 9, fontWeight: '900', marginLeft: 8 },
});

export default LiveTrackingScreen;