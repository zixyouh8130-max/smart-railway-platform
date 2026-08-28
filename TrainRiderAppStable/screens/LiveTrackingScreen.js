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

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 3000,
  distanceFilter: 5,
  // Android-specific cadence hints. iOS safely ignores unsupported fields.
  interval: 3000,
  fastestInterval: 1500,
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

  const watchIdRef = useRef(null);
  const journeyCompletedRef = useRef(false);
  const sendingLocationRef = useRef(false);
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
        setGpsError('No schedule is linked to this tracking screen.');
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
          'Journey has not started yet. Press Depart on the Train Rider home screen first.',
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
      const message = err?.detail || 'Failed to load route stations';
      showNotification('Route Error', message, 'error');
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
    setIsTracking(false);
  };

  const startGPSTracking = async () => {
    if (!staffInfo?.staff_id) {
      setGpsError('Rider staff ID is missing. Please sign in again.');
      return;
    }

    const granted = await requestLocationPermission();
    if (!granted) {
      setGpsError(
        'Location permission was denied. Allow precise location access for live train tracking.',
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
    const speedMph =
      speed != null ? Math.max(0, Math.round(speed * 2.2369362920544)) : null;
    const accuracyMeters = accuracy != null ? Math.round(accuracy) : null;

    const location = {
      latitude,
      longitude,
      speed: speedMph,
      accuracy: accuracyMeters,
      lastUpdate: new Date(),
    };

    setGpsData(location);
    setCurrentLocation([latitude, longitude]);
    setGpsError(null);

    if (sendingLocationRef.current || !staffInfo?.staff_id) return;
    sendingLocationRef.current = true;

    try {
      const response = await locationTrackingApi.updateLocation({
        device_id: staffInfo.staff_id,
        latitude,
        longitude,
        speed: speedMph,
        accuracy: accuracyMeters,
      });
      handleTrackingResponse(response);
    } catch (err) {
      console.error('Failed to send location:', err);
      const detail = err?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || 'Current location could not be sent to the backend.';
      setGpsError(message);
    } finally {
      sendingLocationRef.current = false;
    }
  };

  const handleGPSError = error => {
    console.error('GPS Error:', error);
    const messages = {
      1: 'Location permission was denied. Enable location permission in device settings.',
      2: 'Current GPS position is unavailable. Check that device Location is enabled.',
      3: 'GPS request timed out. Move to an area with a better GPS signal and try again.',
    };
    setGpsError(messages[error.code] || error.message || 'Unable to read GPS location.');
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
            '🎉 Journey Complete!',
            `Arrived at final destination: ${stationName}`,
          );
        } else {
          setArrivalAlert(data);
          setCurrentStation(stationName);
          setNextStation(data.next_station?.name || null);
          showNotification('📍 Auto-Arrived!', `Arrived at ${stationName}`);
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
          '🚂 Auto-Departed!',
          `Train has left ${data.station_name || 'the station'}.`,
        );
      }

      setArrivalAlert(null);
      setCurrentStation(null);
      fetchRouteStops();
    }
  };

  const handleStationArrival = async (routeStationId, trainStopId) => {
    if (!routeStationId || !staffInfo?.staff_id) {
      showNotification('Error', 'Missing rider or station information', 'error');
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
          '🎉 Journey Complete!',
          'Train has arrived at the final destination.',
        );
      } else {
        setArrivalAlert(response);
        setCurrentStation(response.station_name || null);
        setNextStation(response.next_station?.name || null);
        showNotification(
          'Manual Arrival Logged',
          `Arrived at ${response.station_name}.`,
        );
      }

      await fetchRouteStops();
    } catch (err) {
      console.error('Manual arrival failed:', err);
      const detail = err?.detail;
      showNotification(
        'Manual Arrival Failed',
        typeof detail === 'string' ? detail : detail?.message || 'Failed to log arrival',
        'error',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStationDeparture = async (routeStationId, trainStopId) => {
    if (!staffInfo?.staff_id || !trainStopId) {
      showNotification('Error', 'Missing rider or stop information', 'error');
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
      showNotification('Manual Departure Logged', 'Train departure has been logged.');
      await fetchRouteStops();
    } catch (err) {
      console.error('Manual departure failed:', err);
      const detail = err?.detail;
      showNotification(
        'Manual Departure Failed',
        typeof detail === 'string' ? detail : detail?.message || 'Failed to log departure',
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
            <Text style={styles.completedTitle}>Journey Completed!</Text>
            <Text style={styles.completedText}>
              Final destination reached. Schedule, assignments and tracking device are completed.
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon
              name="satellite-variant"
              size={18}
              color={isTracking && !journeyCompleted ? '#10b981' : '#9ca3af'}
            />
            <Text style={styles.statLabel}>GPS</Text>
            <Text style={styles.statValue}>
              {journeyCompleted ? 'Done' : isTracking ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="speedometer" size={18} color="#dc2626" />
            <Text style={styles.statLabel}>Speed</Text>
            <Text style={styles.statValue}>{journeyCompleted ? '0' : gpsData.speed || 0} mph</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="map-marker" size={18} color="#10b981" />
            <Text style={styles.statLabel}>Station</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {journeyCompleted ? currentStation || 'Destination' : currentStation || 'In Transit'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="navigation" size={18} color="#3b82f6" />
            <Text style={styles.statLabel}>Next</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {journeyCompleted ? '--' : nextStation || '--'}
            </Text>
          </View>
        </View>

        {gpsError && !journeyCompleted && (
          <View style={styles.trackingErrorCard}>
            <Icon name="alert-circle" size={20} color="#dc2626" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.trackingErrorTitle}>GPS / Tracking problem</Text>
              <Text style={styles.trackingErrorText}>{gpsError}</Text>
            </View>
          </View>
        )}

        {distanceToStation && !journeyCompleted && (
          <Text style={styles.distanceText}>
            {distanceToStation.station ? `${distanceToStation.station}: ` : ''}
            {distanceToStation.meters} m from station trigger point
          </Text>
        )}

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
                <Text style={styles.nextStationText}>
                  Next: {arrivalAlert.next_station.name}
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
                  {isUpdating ? 'Updating...' : 'Manual Depart Now'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.automaticDepartureText}>
                Departure is automatic after the train moves more than 50 m from this station.
              </Text>
            )}
          </View>
        )}

        <TrainTrackerMap
          routeStops={routeStops}
          currentLocation={currentLocation}
          currentStation={currentStation}
          nextStation={nextStation}
        />

        {!journeyCompleted && routeStops.length > 0 && (
          <View style={styles.manualCard}>
            <View style={styles.manualHeader}>
              <View style={styles.manualInfo}>
                <Text style={styles.manualTitle}>Manual station fallback</Text>
                <Text style={styles.manualText}>
                  GPS automation stays primary. Enable only when an arrival or departure needs manual help.
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
                  {manualMode ? 'Disable' : 'Enable'}
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
                <Icon name="logout" size={17} color="#fff" />
                <Text style={styles.manualActionText}>
                  Manual Depart — {arrivedManualStop.station_name}
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
                <Icon name="map-marker-check" size={17} color="#fff" />
                <Text style={styles.manualActionText}>
                  Manual Arrive — {nextManualStop.station_name}
                </Text>
              </TouchableOpacity>
            )}

            {manualMode && !arrivedManualStop && !nextManualStop && (
              <Text style={styles.manualHint}>No valid manual station action is available.</Text>
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
                <Text style={styles.stationsTitle}>Route Stations</Text>
              </View>
              <Text style={styles.stationsCount}>
                {completedCount}/{routeStops.length} completed
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
                    {index === 0 && <Text style={styles.badge}>Start</Text>}
                    {index === routeStops.length - 1 && (
                      <Text
                        style={[
                          styles.badge,
                          { backgroundColor: '#ede9fe', color: '#6d28d9' },
                        ]}
                      >
                        End
                      </Text>
                    )}
                    {manualMode &&
                      nextManualStop?.route_station_id === stop.route_station_id && (
                        <Text style={styles.nextStopText}>NEXT</Text>
                      )}
                  </View>
                  <View style={styles.stopTimes}>
                    {stop.expected_arrival && (
                      <Text style={styles.timeText}>🕐 ETA: {stop.expected_arrival}</Text>
                    )}
                    {stop.expected_departure && (
                      <Text style={styles.timeText}>🚂 ETD: {stop.expected_departure}</Text>
                    )}
                    {stop.actual_arrival && (
                      <Text style={styles.timeActual}>
                        ✅ Arr: {formatTime(stop.actual_arrival)}
                      </Text>
                    )}
                    {stop.actual_departure && (
                      <Text style={styles.timeActual}>
                        🚂 Dep: {formatTime(stop.actual_departure)}
                      </Text>
                    )}
                    {stop.delay_minutes > 0 && (
                      <Text style={styles.delayText}>⚠️ +{stop.delay_minutes}min</Text>
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
            <Text style={styles.coordsTitle}>GPS Coordinates</Text>
            {gpsData.lastUpdate && (
              <Text style={styles.coordsUpdated}>
                Updated: {gpsData.lastUpdate.toLocaleTimeString()}
              </Text>
            )}
          </View>
          <View style={styles.coordsRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Latitude</Text>
              <Text style={styles.coordValue}>
                {gpsData.latitude?.toFixed(6) || '--'}
              </Text>
            </View>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Longitude</Text>
              <Text style={styles.coordValue}>
                {gpsData.longitude?.toFixed(6) || '--'}
              </Text>
            </View>
          </View>
          {gpsData.accuracy != null && (
            <Text style={styles.accuracyText}>
              GPS Accuracy: ±{gpsData.accuracy} meters
            </Text>
          )}
        </View>
      </ScrollView>

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
  trackingErrorCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  trackingErrorTitle: {
    color: '#991b1b',
    fontWeight: 'bold',
    fontSize: 14,
  },
  trackingErrorText: {
    color: '#b91c1c',
    fontSize: 12,
    marginTop: 2,
  },
  distanceText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 12,
  },
  automaticDepartureText: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  manualCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  manualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualInfo: {
    flex: 1,
    paddingRight: 12,
  },
  manualTitle: {
    color: '#78350f',
    fontWeight: 'bold',
    fontSize: 14,
  },
  manualText: {
    color: '#92400e',
    fontSize: 11,
    marginTop: 3,
  },
  manualToggle: {
    borderWidth: 1,
    borderColor: '#d97706',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  manualToggleActive: {
    backgroundColor: '#d97706',
  },
  manualToggleText: {
    color: '#b45309',
    fontWeight: '600',
    fontSize: 12,
  },
  manualToggleTextActive: {
    color: '#fff',
  },
  manualAction: {
    marginTop: 12,
    backgroundColor: '#d97706',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  manualDepartAction: {
    backgroundColor: '#2563eb',
  },
  manualActionText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 13,
  },
  manualHint: {
    marginTop: 10,
    color: '#92400e',
    fontSize: 11,
  },
  nextStopText: {
    color: '#d97706',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 8,
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