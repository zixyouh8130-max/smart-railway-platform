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

const LOCATION_UPLOAD_INTERVAL = 30000; // 30 seconds

const LiveTrackingScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  // Params passed from TrainRiderHomeScreen
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

  const lastAutoEventRef = useRef({ station: null, time: null, type: null });

  const watchIdRef = useRef(null);

  // Controls POST every 15 seconds
  const locationUploadIntervalRef = useRef(null);

  // Always contains newest GPS position
  const latestLocationRef = useRef(null);

  // Allows first GPS position to be sent immediately
  const firstLocationSentRef = useRef(false);

  // Prevents overlapping backend requests
  const locationSendInFlightRef = useRef(false);

  // Gives timers/callbacks the latest completed state
  const journeyCompletedRef = useRef(false);

  // Show notification helper
  const showNotification = (title, description, type = 'success') => {
    setNotification({ title, description, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch route stops on mount
  useEffect(() => {
    if (currentAssignment) {
      fetchRouteStops();
      startGPSTracking();
    }
    return () => stopGPSTracking();
  }, []);

  useEffect(() => {
    if (routeStops.length > 0) {
      updateCurrentAndNextStation();

      const allCompleted = routeStops.every(
        stop => stop.status === 'DEPARTED',
      );

      const lastDeparted =
        routeStops[routeStops.length - 1]?.status === 'DEPARTED';

      if (allCompleted || lastDeparted) {
        journeyCompletedRef.current = true;

        setJourneyCompleted(true);

        stopGPSTracking();
      }
    }
  }, [routeStops]);

  useEffect(() => {
    journeyCompletedRef.current = journeyCompleted;
  }, [journeyCompleted]);

  const updateCurrentAndNextStation = () => {
    const current = routeStops.find(s => s.status === 'ARRIVED');
    setCurrentStation(current?.station_name || null);
    const next = routeStops.find(s => s.status === 'SCHEDULED');
    setNextStation(next?.station_name || null);
  };

  const fetchRouteStops = async () => {
    setLoadingStops(true);
    try {
      const response = await schedulesApi.getRouteStops(currentAssignment.schedule_id);
      const stops = (response.stops || []).map(stop => ({
        ...stop,
        route_station_id: stop.route_station_id || stop.id,
        train_stop_id: stop.train_stop_id || null,
      }));
      setRouteStops(stops);
    } catch (err) {
      console.error('Failed to fetch route stops:', err);
      showNotification('Error', 'Failed to load route stations', 'error');
    } finally {
      setLoadingStops(false);
    }
  };

  const handleTrackingResponse = (data) => {
    if (!data) {
      return;
    }

    // -----------------------------
    // Automatic station arrival
    // -----------------------------

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
          setCurrentStation(null);
          setNextStation(null);

          showNotification(
            '🎉 Journey Complete!',
            `Arrived at ${stationName}`,
          );

          stopGPSTracking();
        } else {
          showNotification(
            '📍 Auto-Arrived!',
            `Arrived at ${stationName}`,
          );

          setArrivalAlert(data);
          setCurrentStation(stationName);

          setNextStation(
            data.next_station?.name || null,
          );
        }
      }

      fetchRouteStops();
    }

    // -----------------------------
    // Automatic station departure
    // -----------------------------

    if (data.auto_departed) {
      const now = Date.now();

      const isNewDeparture =
        lastAutoEventRef.current.type !== 'departure' ||
        now - lastAutoEventRef.current.time > 10000;

      if (isNewDeparture) {
        lastAutoEventRef.current = {
          station: null,
          time: now,
          type: 'departure',
        };

        showNotification(
          '🚂 Auto-Departed!',
          'Train has left the station.',
        );
      }

      setArrivalAlert(null);
      setCurrentStation(null);

      fetchRouteStops();
    }
  };
  const sendLatestLocation = async () => {
    // Stop sending after journey completion
    if (journeyCompletedRef.current) {
      return;
    }

    const location = latestLocationRef.current;

    // GPS has not provided a position yet
    if (!location) {
      console.log(
        '⏳ Waiting for GPS before sending location...',
      );

      return;
    }

    // Don't allow overlapping API requests
    if (locationSendInFlightRef.current) {
      console.log(
        '⏭️ Previous location update is still sending',
      );

      return;
    }

    locationSendInFlightRef.current = true;

    try {
      const deviceId =
        staffInfo?.staff_id || 'TRAIN_RIDER_001';

      const payload = {
        device_id: deviceId,
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        accuracy: location.accuracy,
      };

      console.log(
        '📍 Sending scheduled location update:',
        payload,
      );

      const response =
        await locationTrackingApi.updateLocation(payload);

      console.log(
        '✅ Scheduled location response:',
        response,
      );

      handleTrackingResponse(response);

    } catch (err) {
      console.error(
        '❌ Failed scheduled location update:',
        err,
      );
    } finally {
      locationSendInFlightRef.current = false;
    }
  };

  const handleStationArrival = async (routeStationId, trainStopId) => {
    if (!routeStationId) {
      showNotification('Error', 'Missing station ID', 'error');
      return;
    }

    if (gpsData.latitude == null || gpsData.longitude == null) {
      showNotification(
        'GPS Required',
        'Wait for a valid GPS position before recording manual arrival.',
        'warning',
      );
      return;
    }

    setIsUpdating(true);
    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      const payload = {
        device_id: deviceId,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        speed: gpsData.speed,
        accuracy: gpsData.accuracy,
        manual_arrival: true,
        route_station_id: routeStationId,
        train_stop_id: trainStopId,
      };
      const response = await locationTrackingApi.updateLocation(payload);
      if (response.is_last_station) {
        journeyCompletedRef.current = true;
        setJourneyCompleted(true);
        setArrivalAlert(null);
        setCurrentStation(null);
        setNextStation(null);
        stopGPSTracking();
        showNotification('🎉 Journey Complete!', 'Final destination reached.');
      } else {
        showNotification('Station Arrived!', 'Arrival logged successfully.');
      }
      fetchRouteStops();
    } catch (err) {
      console.error(err);
      showNotification('Error', err.detail || 'Failed to log arrival', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStationDeparture = async (routeStationId, trainStopId) => {
    setIsUpdating(true);
    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      await locationTrackingApi.logDeparture(deviceId, trainStopId, {
        manual_departure: true,
        route_station_id: routeStationId,
      });
      showNotification('Station Departed', 'Departure logged successfully.');
      fetchRouteStops();
    } catch (err) {
      console.error(err);
      showNotification('Error', err.detail || 'Failed to log departure', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const startGPSTracking = async () => {
    try {
      // Home already asks for permission before Start Journey,
      // but check again here because the user might reopen an
      // already-active journey.
      const locationGranted =
        await requestLocationPermission();

      if (!locationGranted) {
        showNotification(
          'Permission Denied',
          'Location permission is required for live train tracking.',
          'error',
        );

        return;
      }

      // Prevent duplicate GPS watchers / timers
      if (
        watchIdRef.current !== null ||
        locationUploadIntervalRef.current !== null
      ) {
        console.log(
          '⚠️ GPS tracking is already running',
        );

        return;
      }

      console.log(
        '✅ Starting GPS tracking',
      );

      setIsTracking(true);

      // --------------------------------
      // GPS WATCHER
      // --------------------------------

      watchIdRef.current =
        Geolocation.watchPosition(
          handlePosition,

          handleGPSError,

          {
            enableHighAccuracy: true,

            timeout: 20000,

            maximumAge: 5000,

            // Update newest GPS location when
            // device moves approximately 10m.
            distanceFilter: 10,
          },
        );

      // --------------------------------
      // BACKEND UPDATE TIMER
      // --------------------------------

      locationUploadIntervalRef.current =
        setInterval(() => {
          sendLatestLocation();
        }, LOCATION_UPLOAD_INTERVAL);

      console.log(
        `⏱️ Location will be sent every ${
          LOCATION_UPLOAD_INTERVAL / 1000
        } seconds`,
      );

    } catch (error) {
      console.error(
        'Failed to start GPS tracking:',
        error,
      );

      showNotification(
        'GPS Error',
        'Failed to start GPS tracking.',
        'error',
      );
    }
  };

  const stopGPSTracking = () => {
    console.log(
      '🛑 Stopping GPS tracking',
    );

    // Stop native GPS watcher
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(
        watchIdRef.current,
      );

      watchIdRef.current = null;
    }

    // Stop 15-second API timer
    if (
      locationUploadIntervalRef.current !== null
    ) {
      clearInterval(
        locationUploadIntervalRef.current,
      );

      locationUploadIntervalRef.current = null;
    }

    latestLocationRef.current = null;

    firstLocationSentRef.current = false;

    locationSendInFlightRef.current = false;

    setIsTracking(false);
  };

  const handlePosition = (position) => {
    const {
      latitude,
      longitude,
      speed,
      accuracy,
    } = position.coords;

    const speedMph =
      speed != null
        ? Math.max(
            0,
            Math.round(speed * 2.2369362920544),
          )
        : null;

    const accuracyRounded =
      accuracy != null
        ? Math.round(accuracy)
        : null;

    const location = {
      latitude,
      longitude,
      speed: speedMph,
      accuracy: accuracyRounded,
    };

    // Save latest GPS position.
    // The 15-second timer will use this value.
    latestLocationRef.current = location;

    // Update visible GPS information
    setGpsData({
      ...location,
      lastUpdate: new Date(),
    });

    // Your map currently expects:
    // [latitude, longitude]
    setCurrentLocation([
      latitude,
      longitude,
    ]);

    console.log(
      '📡 GPS position received:',
      location,
    );

    // Send first GPS fix immediately.
    // After that the timer sends every 15 seconds.
    if (!firstLocationSentRef.current) {
      firstLocationSentRef.current = true;

      sendLatestLocation();
    }
  };

  const handleGPSError = (error) => {
    console.error('GPS Error:', error);
    showNotification('GPS Error', error.message, 'error');
  };

  const handleLogDeparture = async () => {
    if (!arrivalAlert?.train_stop_id) return;
    setIsUpdating(true);
    try {
      const deviceId = staffInfo?.staff_id || 'TRAIN_RIDER_001';
      await locationTrackingApi.logDeparture(deviceId, arrivalAlert.train_stop_id);
      setArrivalAlert(null);
      fetchRouteStops();
      showNotification('Departed Station', 'Train has departed.');
    } catch (err) {
      console.error(err);
      showNotification('Error', 'Failed to log departure', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ARRIVED': return <Icon name="map-marker" size={16} color="#10b981" />;
      case 'DEPARTED': return <Icon name="check-circle" size={16} color="#3b82f6" />;
      default: return <Icon name="clock-outline" size={16} color="#9ca3af" />;
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'ARRIVED': return { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' };
      case 'DEPARTED': return { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' };
      default: return { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' };
    }
  };

  const formatTime = (timeString) => formatRailwayTime(timeString);

  const completedCount = routeStops.filter(s => s.status === 'DEPARTED').length;
  const progressPercent = routeStops.length > 0 ? (completedCount / routeStops.length) * 100 : 0;

  const notificationColor = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Notification banner */}
        {notification && (
          <View style={[styles.notification, { borderLeftColor: notificationColor[notification.type] || '#3b82f6' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              {notification.description && <Text style={styles.notificationDesc}>{notification.description}</Text>}
            </View>
            <TouchableOpacity onPress={() => setNotification(null)}>
              <Icon name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Journey Completed Banner */}
        {journeyCompleted && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedEmoji}>🎉</Text>
            <Text style={styles.completedTitle}>Journey Completed!</Text>
            <Text style={styles.completedText}>All stations visited. Schedules and assignments updated.</Text>
          </View>
        )}

        {/* GPS Status Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon name="satellite-variant" size={18} color={isTracking && !journeyCompleted ? '#10b981' : '#9ca3af'} />
            <Text style={styles.statLabel}>GPS</Text>
            <Text style={styles.statValue}>{journeyCompleted ? 'Done' : isTracking ? 'Active' : 'Inactive'}</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="speedometer" size={18} color="#dc2626" />
            <Text style={styles.statLabel}>Speed</Text>
            <Text style={styles.statValue}>{journeyCompleted ? '0' : gpsData.speed || 0} mph</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="map-marker" size={18} color="#10b981" />
            <Text style={styles.statLabel}>Station</Text>
            <Text style={styles.statValue} numberOfLines={1}>{journeyCompleted ? 'Destination' : currentStation || 'In Transit'}</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="navigation" size={18} color="#3b82f6" />
            <Text style={styles.statLabel}>Next</Text>
            <Text style={styles.statValue} numberOfLines={1}>{journeyCompleted ? '--' : nextStation || '--'}</Text>
          </View>
        </View>

        {/* Arrival Alert */}
        {arrivalAlert && !journeyCompleted && (
          <View style={styles.arrivalCard}>
            <View style={styles.arrivalHeader}>
              <Icon name="map-marker" size={24} color="#fff" />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.arrivalTitle}>Station Arrived!</Text>
                <Text style={styles.arrivalStation}>{arrivalAlert.station_name}</Text>
              </View>
            </View>
            {arrivalAlert.next_station && (
              <View style={styles.nextStationBox}>
                <Text style={styles.nextStationText}>Next: {arrivalAlert.next_station.name}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.departButton} onPress={handleLogDeparture}>
              <Text style={styles.departButtonText}>Confirm Departure</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map */}
        <TrainTrackerMap
          routeStops={routeStops}
          currentLocation={currentLocation}
          currentStation={currentStation}
          nextStation={nextStation}
        />

        {/* Route Stations List */}
        {loadingStops ? (
          <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 20 }} />
        ) : routeStops.length > 0 ? (
          <View style={styles.stationsCard}>
            <View style={styles.stationsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="train" size={18} color="#1d4ed8" />
                <Text style={styles.stationsTitle}>Route Stations</Text>
              </View>
              <Text style={styles.stationsCount}>{completedCount}/{routeStops.length} completed</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>

            {routeStops.map((stop, index) => (
              <View key={stop.route_station_id || index} style={[styles.stopItem, getStatusBg(stop.status)]}>
                <View style={styles.stopIconContainer}>
                  {getStatusIcon(stop.status)}
                </View>
                <View style={styles.stopInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text style={styles.stopName}>{stop.station_name}</Text>
                    {index === 0 && <Text style={styles.badge}>Start</Text>}
                    {index === routeStops.length - 1 && <Text style={[styles.badge, { backgroundColor: '#ede9fe', color: '#6d28d9' }]}>End</Text>}
                  </View>
                  <View style={styles.stopTimes}>
                    {stop.expected_arrival && <Text style={styles.timeText}>🕐 ETA: {stop.expected_arrival}</Text>}
                    {stop.expected_departure && <Text style={styles.timeText}>🚂 ETD: {stop.expected_departure}</Text>}
                    {stop.actual_arrival && <Text style={styles.timeActual}>✅ Arr: {formatTime(stop.actual_arrival)}</Text>}
                    {stop.actual_departure && <Text style={styles.timeActual}>🚂 Dep: {formatTime(stop.actual_departure)}</Text>}
                    {stop.delay_minutes > 0 && <Text style={styles.delayText}>⚠️ +{stop.delay_minutes}min</Text>}
                  </View>
                </View>
                {stop.status === 'SCHEDULED' && !journeyCompleted && (
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleStationArrival(stop.route_station_id, stop.train_stop_id)} disabled={isUpdating}>
                    <Icon name="map-marker" size={14} color="#fff" />
                    <Text style={styles.actionButtonText}>Arrive</Text>
                  </TouchableOpacity>
                )}
                {stop.status === 'ARRIVED' && !journeyCompleted && (
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3b82f6' }]} onPress={() => handleStationDeparture(stop.route_station_id, stop.train_stop_id)} disabled={isUpdating}>
                    <Icon name="logout" size={14} color="#fff" />
                    <Text style={styles.actionButtonText}>Depart</Text>
                  </TouchableOpacity>
                )}
                {stop.status === 'DEPARTED' && (
                  <Text style={styles.doneText}>{index === routeStops.length - 1 ? '🏁' : '✓'}</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {/* GPS Coordinates */}
        <View style={styles.coordsCard}>
          <View style={styles.coordsHeader}>
            <Icon name="satellite-variant" size={16} color="#6b7280" />
            <Text style={styles.coordsTitle}>GPS Coordinates</Text>
            {gpsData.lastUpdate && <Text style={styles.coordsUpdated}>Updated: {gpsData.lastUpdate.toLocaleTimeString()}</Text>}
          </View>
          <View style={styles.coordsRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Latitude</Text>
              <Text style={styles.coordValue}>{gpsData.latitude?.toFixed(6) || '--'}</Text>
            </View>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Longitude</Text>
              <Text style={styles.coordValue}>{gpsData.longitude?.toFixed(6) || '--'}</Text>
            </View>
          </View>
          {gpsData.accuracy && <Text style={styles.accuracyText}>GPS Accuracy: ±{gpsData.accuracy} meters</Text>}
        </View>
      </ScrollView>

      {/* Floating Back Button */}
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
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  notification: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationTitle: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  notificationDesc: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 2,
  },
  completedBanner: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  completedEmoji: {
    fontSize: 32,
  },
  completedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  completedText: {
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 2,
  },
  arrivalCard: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  arrivalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  arrivalTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  arrivalStation: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 14,
  },
  nextStationBox: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  nextStationText: {
    color: '#fff',
    fontSize: 13,
  },
  departButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  departButtonText: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  stationsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  stationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stationsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  stationsCount: {
    fontSize: 13,
    color: '#6b7280',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  stopIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontWeight: '600',
    fontSize: 14,
    marginRight: 4,
  },
  badge: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
    fontSize: 10,
    paddingHorizontal: 6,
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
  timeActual: {
    fontSize: 11,
    color: '#059669',
    marginRight: 8,
  },
  delayText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: 'bold',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  doneText: {
    fontSize: 16,
    marginLeft: 8,
  },
  coordsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  coordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  coordsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  coordsUpdated: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coordItem: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  coordValue: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 14,
    marginTop: 2,
  },
  accuracyText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 8,
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

export default LiveTrackingScreen;