import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import {
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  PointAnnotation,
} from '@maplibre/maplibre-react-native';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { lineString, point } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import lineSlice from '@turf/line-slice';

import railwaysApi from '../api/railways';


const MAP_STYLE =
  'https://tiles.openfreemap.org/styles/liberty';

// Myanmar fallback.
// MapLibre uses [longitude, latitude].
const DEFAULT_COORDINATE = [95.9560, 21.9162];


const isValidCoordinate = coordinate => {
  if (
    !Array.isArray(coordinate) ||
    coordinate.length < 2
  ) {
    return false;
  }

  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
};


const TrainTrackerMap = ({
  routeStops = [],
  currentLocation,
  currentStation,
  nextStation,
}) => {
  const [
    railwayFeature,
    setRailwayFeature,
  ] = useState(null);

  const [
    railwayLoading,
    setRailwayLoading,
  ] = useState(true);

  const [
    railwayError,
    setRailwayError,
  ] = useState(null);


  /*
   * LiveTrackingScreen gives:
   *
   * currentLocation = [latitude, longitude]
   *
   * MapLibre/Turf requires:
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

    const latitude =
      Number(currentLocation[0]);

    const longitude =
      Number(currentLocation[1]);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return [longitude, latitude];
  }, [currentLocation]);


  /*
   * Load Yangon-Pyay railway geometry.
   *
   * railwaysApi caches this response, therefore
   * opening/re-rendering this map will not keep
   * downloading all 1,159 coordinates.
   */
  useEffect(() => {
    let active = true;

    const loadRailway = async () => {
      try {
        setRailwayLoading(true);
        setRailwayError(null);

        const data =
          await railwaysApi.getYangonPyayRailway();

        if (active) {
          setRailwayFeature(data);
        }
      } catch (error) {
        console.error(
          '[TrainTrackerMap] Railway loading failed:',
          error?.response?.data ||
            error?.message,
        );

        if (active) {
          setRailwayError(
            error?.response?.data?.detail ||
              error?.message ||
              'Railway route could not be loaded.',
          );
        }
      } finally {
        if (active) {
          setRailwayLoading(false);
        }
      }
    };

    loadRailway();

    return () => {
      active = false;
    };
  }, []);


  /*
   * Convert backend GeoJSON into a Turf LineString.
   */
  const railwayLine = useMemo(() => {
    const coordinates =
      railwayFeature?.geometry?.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      return null;
    }

    try {
      return lineString(
        coordinates,
        {
          name: 'Yangon-Pyay Railway',
        },
      );
    } catch (error) {
      console.error(
        '[TrainTrackerMap] Invalid railway geometry:',
        error,
      );

      return null;
    }
  }, [railwayFeature]);


  /*
   * Validate station GPS.
   */
  const hasCoordinates = stop => {
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
   * All scheduled stations that have GPS coordinates.
   */
  const validRouteStops = useMemo(
    () =>
      routeStops.filter(stop =>
        hasCoordinates(stop),
      ),
    [routeStops],
  );


  /*
   * First station.
   */
  const firstStationCoordinate =
    useMemo(() => {
      const first = validRouteStops[0];

      if (!first) {
        return null;
      }

      return [
        Number(first.longitude),
        Number(first.latitude),
      ];
    }, [validRouteStops]);


  /*
   * Final destination.
   */
  const lastStationCoordinate =
    useMemo(() => {
      if (!validRouteStops.length) {
        return null;
      }

      const last =
        validRouteStops[
          validRouteStops.length - 1
        ];

      return [
        Number(last.longitude),
        Number(last.latitude),
      ];
    }, [validRouteStops]);


  /*
   * Snap first station onto the actual railway.
   */
  const firstStationOnRailway =
    useMemo(() => {
      if (
        !railwayLine ||
        !firstStationCoordinate
      ) {
        return null;
      }

      try {
        return nearestPointOnLine(
          railwayLine,
          point(firstStationCoordinate),
          {
            units: 'kilometers',
          },
        );
      } catch (error) {
        console.error(
          '[TrainTrackerMap] Cannot snap first station:',
          error,
        );

        return null;
      }
    }, [
      railwayLine,
      firstStationCoordinate,
    ]);


  /*
   * Snap final destination onto railway.
   */
  const lastStationOnRailway =
    useMemo(() => {
      if (
        !railwayLine ||
        !lastStationCoordinate
      ) {
        return null;
      }

      try {
        return nearestPointOnLine(
          railwayLine,
          point(lastStationCoordinate),
          {
            units: 'kilometers',
          },
        );
      } catch (error) {
        console.error(
          '[TrainTrackerMap] Cannot snap final station:',
          error,
        );

        return null;
      }
    }, [
      railwayLine,
      lastStationCoordinate,
    ]);


  /*
   * COMPLETE SCHEDULED TRAIN ROUTE
   *
   * Instead of:
   *
   * Station A -------- Station B -------- Station C
   *
   * this extracts the actual railway geometry:
   *
   * Station A ~~~~~ railway ~~~~~ Station B ~~~~~ Station C
   */
  const routeGeoJSON = useMemo(() => {
    if (
      !railwayLine ||
      !firstStationOnRailway ||
      !lastStationOnRailway
    ) {
      return null;
    }

    try {
      return lineSlice(
        firstStationOnRailway,
        lastStationOnRailway,
        railwayLine,
      );
    } catch (error) {
      console.error(
        '[TrainTrackerMap] Cannot create train route:',
        error,
      );

      return null;
    }
  }, [
    railwayLine,
    firstStationOnRailway,
    lastStationOnRailway,
  ]);


  /*
   * Snap every station to the railway.
   *
   * We still display station markers using the
   * original database GPS below. These snapped
   * coordinates are useful only for railway progress.
   */
  const snappedStations = useMemo(() => {
    if (!railwayLine) {
      return [];
    }

    return validRouteStops
      .map(stop => {
        try {
          const coordinate = [
            Number(stop.longitude),
            Number(stop.latitude),
          ];

          const snapped =
            nearestPointOnLine(
              railwayLine,
              point(coordinate),
              {
                units: 'kilometers',
              },
            );

          return {
            stop,
            snapped,
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  }, [
    railwayLine,
    validRouteStops,
  ]);


  /*
   * Live train GPS snapped to railway.
   */
  const trainOnRailway = useMemo(() => {
    if (
      !railwayLine ||
      !trainCoordinate
    ) {
      return null;
    }

    try {
      return nearestPointOnLine(
        railwayLine,
        point(trainCoordinate),
        {
          units: 'kilometers',
        },
      );
    } catch (error) {
      console.error(
        '[TrainTrackerMap] Cannot snap train GPS:',
        error,
      );

      return null;
    }
  }, [
    railwayLine,
    trainCoordinate,
  ]);


  /*
   * Find the latest ARRIVED/DEPARTED station.
   *
   * Used as fallback if live GPS is unavailable.
   */
  const latestCompletedRailPoint =
    useMemo(() => {
      const completed =
        snappedStations.filter(
          item =>
            item.stop?.status ===
              'ARRIVED' ||
            item.stop?.status ===
              'DEPARTED',
        );

      if (!completed.length) {
        return null;
      }

      return completed[
        completed.length - 1
      ].snapped;
    }, [snappedStations]);


  /*
   * Where should the travelled section end?
   *
   * Priority:
   *
   * 1. live train GPS snapped to track
   * 2. latest ARRIVED/DEPARTED station
   */
  const progressEndPoint =
    trainOnRailway ||
    latestCompletedRailPoint;


  /*
   * TRAVELLED / COMPLETED ROUTE.
   *
   * Draw the real railway from the first station
   * up to the live train position.
   */
  const completedGeoJSON = useMemo(() => {
    if (
      !railwayLine ||
      !firstStationOnRailway ||
      !progressEndPoint
    ) {
      return null;
    }

    try {
      return lineSlice(
        firstStationOnRailway,
        progressEndPoint,
        railwayLine,
      );
    } catch (error) {
      console.error(
        '[TrainTrackerMap] Cannot create travelled route:',
        error,
      );

      return null;
    }
  }, [
    railwayLine,
    firstStationOnRailway,
    progressEndPoint,
  ]);


  /*
   * Camera:
   *
   * 1. live train GPS
   * 2. first station
   * 3. Myanmar fallback
   */
  const cameraCoordinate =
    trainCoordinate ||
    firstStationCoordinate ||
    DEFAULT_COORDINATE;


  const getStationColor = (
    stop,
    index,
  ) => {
    if (
      index === 0 &&
      stop.status !== 'DEPARTED'
    ) {
      return '#f59e0b';
    }

    if (
      index ===
      routeStops.length - 1
    ) {
      return '#8b5cf6';
    }

    if (stop.status === 'DEPARTED') {
      return '#10b981';
    }

    if (stop.status === 'ARRIVED') {
      return '#3b82f6';
    }

    return '#9ca3af';
  };


  const getStationIcon = (
    stop,
    index,
  ) => {
    if (
      index === 0 &&
      stop.status !== 'DEPARTED'
    ) {
      return 'flag';
    }

    if (
      index ===
      routeStops.length - 1
    ) {
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


  /*
   * Development information:
   * distance between actual train GPS and rail.
   */
  const trainRailDistanceMeters =
    trainOnRailway?.properties?.dist != null
      ? Number(
          trainOnRailway.properties.dist,
        ) * 1000
      : null;


  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
      >
        <Camera
          centerCoordinate={
            cameraCoordinate
          }
          zoomLevel={
            trainCoordinate ? 14 : 7
          }
          animationMode="easeTo"
          animationDuration={360}
        />


        {/*
          FULL SCHEDULED ROUTE.

          This now follows the actual
          Yangon-Pyay railway geometry.
        */}
        {routeGeoJSON && (
          <ShapeSource
            id="railway-route-source"
            shape={routeGeoJSON}
          >
            <LineLayer
              id="railway-route-outline"
              style={{
                lineColor: '#ffffff',
                lineWidth: 7,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />

            <LineLayer
              id="railway-route-line"
              style={{
                lineColor: '#7CC4F8',
                lineWidth: 4,
                lineOpacity: 0.95,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}


        {/*
          COMPLETED / TRAVELLED ROUTE.

          This also follows the actual rail
          from the starting station to the
          current train position.
        */}
        {completedGeoJSON && (
          <ShapeSource
            id="completed-route-source"
            shape={completedGeoJSON}
          >
            <LineLayer
              id="completed-route-outline"
              style={{
                lineColor: '#ffffff',
                lineWidth: 8,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />

            <LineLayer
              id="completed-route-line"
              style={{
                lineColor: '#3787C8',
                lineWidth: 5,
                lineOpacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}


        {/*
          STATION MARKERS.

          Keep the actual station GPS positions.
        */}
        {routeStops.map(
          (stop, index) => {
            if (
              !hasCoordinates(stop)
            ) {
              return null;
            }

            const coordinate = [
              Number(stop.longitude),
              Number(stop.latitude),
            ];

            const stationId =
              String(
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
                        getStationColor(
                          stop,
                          index,
                        ),
                    },
                  ]}
                >
                  <Icon
                    name={getStationIcon(
                      stop,
                      index,
                    )}
                    size={14}
                    color="#fff"
                  />
                </View>
              </PointAnnotation>
            );
          },
        )}


        {/*
          LIVE TRAIN LOCATION.

          Keep this at the REAL GPS location.
          We only snap the route calculation.
        */}
        {trainCoordinate && (
          <PointAnnotation
            id="live-train-location"
            coordinate={trainCoordinate}
          >
            <View
              style={styles.trainHalo}
            >
              <View
                style={
                  styles.trainMarker
                }
              >
                <Text
                  style={
                    styles.trainEmoji
                  }
                >
                  🚂
                </Text>
              </View>
            </View>
          </PointAnnotation>
        )}


        {/*
          Development-only indication of
          where the train GPS snaps to rail.
        */}
        {__DEV__ &&
        trainOnRailway && (
          <PointAnnotation
            id="train-snapped-location"
            coordinate={
              trainOnRailway.geometry
                .coordinates
            }
          >
            <View
              style={
                styles.snappedTrainPoint
              }
            />
          </PointAnnotation>
        )}
      </MapView>


      {railwayLoading && (
        <View
          style={styles.routeLoading}
          pointerEvents="none"
        >
          <ActivityIndicator
            size="small"
            color="#3787C8"
          />

          <Text
            style={
              styles.routeLoadingText
            }
          >
            မီးရထားလမ်း ရယူနေသည်…
          </Text>
        </View>
      )}


      {railwayError && (
        <View style={styles.routeError}>
          <Icon
            name="alert-circle-outline"
            size={15}
            color="#dc2626"
          />

          <Text
            style={styles.routeErrorText}
          >
            မီးရထားလမ်း အချက်အလက်
            ရယူ၍မရပါ
          </Text>
        </View>
      )}


      {(currentStation ||
        nextStation) && (
        <View style={styles.stationInfo}>
          {currentStation && (
            <View
              style={
                styles.stationInfoRow
              }
            >
              <Icon
                name="map-marker"
                size={14}
                color="#10b981"
              />

              <Text
                style={
                  styles.stationInfoText
                }
                numberOfLines={1}
              >
                လက်ရှိဘူတာ -{' '}
                {currentStation}
              </Text>
            </View>
          )}

          {nextStation && (
            <View
              style={
                styles.stationInfoRow
              }
            >
              <Icon
                name="navigation"
                size={14}
                color="#3b82f6"
              />

              <Text
                style={
                  styles.stationInfoText
                }
                numberOfLines={1}
              >
                နောက်ဘူတာ -{' '}
                {nextStation}
              </Text>
            </View>
          )}
        </View>
      )}


      <View style={styles.legend}>
        <Text style={styles.legendTitle}>
          မြေပုံအညွှန်း
        </Text>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor:
                  '#dc2626',
              },
            ]}
          />

          <Text style={styles.legendText}>
            ရထားတည်နေရာ
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor:
                  '#3b82f6',
              },
            ]}
          />

          <Text style={styles.legendText}>
            လက်ရှိဘူတာ
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor:
                  '#10b981',
              },
            ]}
          />

          <Text style={styles.legendText}>
            ကျော်လွန်ပြီးသောဘူတာ
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor:
                  '#9ca3af',
              },
            ]}
          />

          <Text style={styles.legendText}>
            လာမည့်ဘူတာ
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendDot,
              {
                backgroundColor:
                  '#8b5cf6',
              },
            ]}
          />

          <Text style={styles.legendText}>
            ခရီးဆုံး
          </Text>
        </View>

        <View style={styles.legendRow}>
          <View
            style={
              styles.routeLegendLine
            }
          />

          <Text style={styles.legendText}>
            မီးရထားလမ်း
          </Text>
        </View>
      </View>


      {__DEV__ &&
      trainRailDistanceMeters != null && (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>
            Train → rail:{' '}
            {trainRailDistanceMeters.toFixed(
              1,
            )}
            m
          </Text>
        </View>
      )}


      <View style={styles.attribution}>
        <Text
          style={styles.attributionText}
        >
          OpenFreeMap © OpenMapTiles · ©
          OpenStreetMap
        </Text>
      </View>
    </View>
  );
};


const styles = StyleSheet.create({
  mapContainer: {
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#E7F4FF',
    borderWidth: 1,
    borderColor: '#B9DDF2',
    elevation: 2,
  },

  map: {
    flex: 1,
  },

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

  trainHalo: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor:
      'rgba(220,38,38,0.18)',
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

  snappedTrainPoint: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3787C8',
    borderWidth: 2,
    borderColor: '#fff',
  },

  routeLoading: {
    position: 'absolute',
    top: 67,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor:
      'rgba(255,255,255,0.95)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 3,
  },

  routeLoadingText: {
    fontSize: 9.5,
    color: '#4b5563',
    fontWeight: '600',
  },

  routeError: {
    position: 'absolute',
    top: 67,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor:
      'rgba(255,245,245,0.96)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 3,
  },

  routeErrorText: {
    fontSize: 9,
    color: '#dc2626',
    fontWeight: '600',
  },

  stationInfo: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor:
      'rgba(255,255,255,0.95)',
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

  legend: {
    position: 'absolute',
    bottom: 22,
    left: 10,
    backgroundColor:
      'rgba(255,255,255,0.95)',
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

  routeLegendLine: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7CC4F8',
    marginRight: 6,
  },

  legendText: {
    fontSize: 11,
    color: '#374151',
  },

  debugInfo: {
    position: 'absolute',
    right: 5,
    bottom: 18,
    backgroundColor:
      'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },

  debugText: {
    fontSize: 8,
    color: '#4b5563',
  },

  attribution: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    backgroundColor:
      'rgba(255,255,255,0.85)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  attributionText: {
    fontSize: 7,
    color: '#4b5563',
  },
});


export default React.memo(
  TrainTrackerMap,
);