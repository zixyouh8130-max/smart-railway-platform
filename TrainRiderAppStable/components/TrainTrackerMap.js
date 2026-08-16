import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

import {
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  PointAnnotation,
} from '@maplibre/maplibre-react-native';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Myanmar fallback position.
// MapLibre uses [longitude, latitude].
const DEFAULT_COORDINATE = [95.9560, 21.9162];

const TrainTrackerMap = ({
  routeStops = [],
  currentLocation,
  currentStation,
  nextStation,
}) => {
  /*
   * Your LiveTrackingScreen stores location as:
   *
   * currentLocation = [latitude, longitude]
   *
   * MapLibre expects:
   *
   * [longitude, latitude]
   */

  const trainCoordinate = useMemo(() => {
    if (
      !currentLocation ||
      currentLocation.length < 2 ||
      currentLocation[0] == null ||
      currentLocation[1] == null
    ) {
      return null;
    }

    const latitude = Number(currentLocation[0]);
    const longitude = Number(currentLocation[1]);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return [longitude, latitude];
  }, [currentLocation]);

  // Check whether a station contains valid GPS coordinates.
  const hasCoordinates = (stop) => {
    if (
      stop?.latitude == null ||
      stop?.longitude == null
    ) {
      return false;
    }

    const latitude = Number(stop.latitude);
    const longitude = Number(stop.longitude);

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    );
  };

  /*
   * Full railway route:
   * [
   *   [longitude, latitude],
   *   [longitude, latitude],
   *   ...
   * ]
   */
  const routePath = useMemo(() => {
    return routeStops
      .filter(hasCoordinates)
      .map((stop) => [
        Number(stop.longitude),
        Number(stop.latitude),
      ]);
  }, [routeStops]);

  /*
   * Already travelled section.
   *
   * ARRIVED and DEPARTED stations are considered
   * part of the completed path.
   */
  const completedPath = useMemo(() => {
    return routeStops
      .filter(
        (stop) =>
          (stop.status === 'DEPARTED' ||
            stop.status === 'ARRIVED') &&
          hasCoordinates(stop),
      )
      .map((stop) => [
        Number(stop.longitude),
        Number(stop.latitude),
      ]);
  }, [routeStops]);

  // GeoJSON for the whole route.
  const routeGeoJSON = useMemo(() => {
    if (routePath.length < 2) {
      return null;
    }

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routePath,
      },
    };
  }, [routePath]);

  // GeoJSON for already completed route.
  const completedGeoJSON = useMemo(() => {
    if (completedPath.length < 2) {
      return null;
    }

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: completedPath,
      },
    };
  }, [completedPath]);

  /*
   * Camera position priority:
   *
   * 1. Current train GPS
   * 2. First station
   * 3. Myanmar fallback position
   */
  const cameraCoordinate =
    trainCoordinate ||
    routePath[0] ||
    DEFAULT_COORDINATE;

  const getStationColor = (stop, index) => {
    // Starting station
    if (
      index === 0 &&
      stop.status !== 'DEPARTED'
    ) {
      return '#f59e0b';
    }

    // Final destination
    if (index === routeStops.length - 1) {
      return '#8b5cf6';
    }

    // Already completed
    if (stop.status === 'DEPARTED') {
      return '#10b981';
    }

    // Currently arrived
    if (stop.status === 'ARRIVED') {
      return '#3b82f6';
    }

    // Upcoming
    return '#9ca3af';
  };

  const getStationIcon = (stop, index) => {
    if (
      index === 0 &&
      stop.status !== 'DEPARTED'
    ) {
      return 'flag';
    }

    if (index === routeStops.length - 1) {
      return 'flag-checkered';
    }

    if (stop.status === 'DEPARTED') {
      return 'check-circle';
    }

    if (stop.status === 'ARRIVED') {
      return 'map-marker';
    }

    return 'clock-outline';
  };

  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE}
      >
        {/* Camera */}
        <Camera
          centerCoordinate={cameraCoordinate}
          zoomLevel={trainCoordinate ? 14 : 7}
          animationMode="easeTo"
          animationDuration={800}
        />

        {/* -------------------------------- */}
        {/* COMPLETE RAILWAY ROUTE           */}
        {/* -------------------------------- */}

        {routeGeoJSON && (
          <ShapeSource
            id="railway-route-source"
            shape={routeGeoJSON}
          >
            <LineLayer
              id="railway-route-line"
              style={{
                lineColor: '#6b7280',
                lineWidth: 3,
                lineOpacity: 0.8,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* -------------------------------- */}
        {/* COMPLETED/TRAVELLED ROUTE        */}
        {/* -------------------------------- */}

        {completedGeoJSON && (
          <ShapeSource
            id="completed-route-source"
            shape={completedGeoJSON}
          >
            <LineLayer
              id="completed-route-line"
              style={{
                lineColor: '#10b981',
                lineWidth: 5,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* -------------------------------- */}
        {/* STATION MARKERS                  */}
        {/* -------------------------------- */}

        {routeStops.map((stop, index) => {
          if (!hasCoordinates(stop)) {
            return null;
          }

          const coordinate = [
            Number(stop.longitude),
            Number(stop.latitude),
          ];

          const stationId = String(
            stop.route_station_id ||
              stop.train_stop_id ||
              `station-${index}`,
          );

          return (
            <PointAnnotation
              key={stationId}
              id={`station-${stationId}`}
              coordinate={coordinate}
            >
              <View
                style={[
                  styles.stationMarker,
                  {
                    backgroundColor:
                      getStationColor(stop, index),
                  },
                ]}
              >
                <Icon
                  name={getStationIcon(stop, index)}
                  size={14}
                  color="#fff"
                />
              </View>
            </PointAnnotation>
          );
        })}

        {/* -------------------------------- */}
        {/* LIVE TRAIN LOCATION              */}
        {/* -------------------------------- */}

        {trainCoordinate && (
          <PointAnnotation
            id="live-train-location"
            coordinate={trainCoordinate}
          >
            <View style={styles.trainHalo}>
              <View style={styles.trainMarker}>
                <Text style={styles.trainEmoji}>
                  🚂
                </Text>
              </View>
            </View>
          </PointAnnotation>
        )}
      </MapView>

      {/* -------------------------------- */}
      {/* CURRENT / NEXT STATION INFO      */}
      {/* -------------------------------- */}

      {(currentStation || nextStation) && (
        <View style={styles.stationInfo}>
          {currentStation && (
            <View style={styles.stationInfoRow}>
              <Icon
                name="map-marker"
                size={14}
                color="#10b981"
              />

              <Text
                style={styles.stationInfoText}
                numberOfLines={1}
              >
                Current: {currentStation}
              </Text>
            </View>
          )}

          {nextStation && (
            <View style={styles.stationInfoRow}>
              <Icon
                name="navigation"
                size={14}
                color="#3b82f6"
              />

              <Text
                style={styles.stationInfoText}
                numberOfLines={1}
              >
                Next: {nextStation}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* -------------------------------- */}
      {/* LEGEND                           */}
      {/* -------------------------------- */}

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>
          Legend
        </Text>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: '#dc2626' },
            ]}
          />

          <Text style={styles.legendText}>
            Train Location
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: '#3b82f6' },
            ]}
          />

          <Text style={styles.legendText}>
            Current Station
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: '#10b981' },
            ]}
          />

          <Text style={styles.legendText}>
            Completed Station
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: '#9ca3af' },
            ]}
          />

          <Text style={styles.legendText}>
            Upcoming Station
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: '#8b5cf6' },
            ]}
          />

          <Text style={styles.legendText}>
            Destination
          </Text>
        </View>
      </View>

      {/* Map attribution */}
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          OpenFreeMap © OpenMapTiles · © OpenStreetMap
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#e5e7eb',
  },

  map: {
    flex: 1,
  },

  // -----------------------------
  // Station marker
  // -----------------------------

  stationMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',

    borderWidth: 2,
    borderColor: '#fff',

    elevation: 4,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  // -----------------------------
  // Train marker
  // -----------------------------

  trainHalo: {
    width: 54,
    height: 54,
    borderRadius: 27,

    backgroundColor: 'rgba(220,38,38,0.18)',

    alignItems: 'center',
    justifyContent: 'center',
  },

  trainMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,

    backgroundColor: '#dc2626',

    alignItems: 'center',
    justifyContent: 'center',

    borderWidth: 3,
    borderColor: '#fff',

    elevation: 6,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  trainEmoji: {
    fontSize: 20,
  },

  // -----------------------------
  // Current / next station
  // -----------------------------

  stationInfo: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,

    backgroundColor: 'rgba(255,255,255,0.95)',

    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,

    elevation: 3,
  },

  stationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },

  stationInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#374151',
    marginLeft: 5,
    fontWeight: '500',
  },

  // -----------------------------
  // Legend
  // -----------------------------

  legend: {
    position: 'absolute',
    bottom: 22,
    left: 10,

    backgroundColor: 'rgba(255,255,255,0.95)',

    borderRadius: 8,
    padding: 10,

    minWidth: 150,

    elevation: 3,
  },

  legendTitle: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#111827',
    marginBottom: 6,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },

  legendText: {
    fontSize: 11,
    color: '#374151',
  },

  // -----------------------------
  // Attribution
  // -----------------------------

  attribution: {
    position: 'absolute',
    bottom: 3,
    right: 4,

    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 3,

    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  attributionText: {
    fontSize: 7,
    color: '#4b5563',
  },
});

export default TrainTrackerMap;