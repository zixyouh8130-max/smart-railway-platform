import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Camera,
  MapView,
  MarkerView,
  ShapeSource,
  LineLayer,
} from '@maplibre/maplibre-react-native';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { lineString, point } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import lineSlice from '@turf/line-slice';

import railwaysApi from '../api/railways';

import {
  colors,
  radii,
  shadow,
} from '../theme/mobileTheme';


const MAP_STYLE =
  'https://tiles.openfreemap.org/styles/liberty';


/**
 * Validate latitude / longitude.
 */
const validCoordinate = (
  latitude,
  longitude,
) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
};


/**
 * Calculate straight-line distance.
 *
 * Only used to choose an appropriate map zoom.
 * It is NOT used to draw the railway route.
 */
const distanceKm = (a, b) => {
  if (!a || !b) return 0;

  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const earthRadiusKm = 6371;

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const deltaLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const deltaLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value),
    )
  );
};


/**
 * Choose a reasonable zoom so that both the
 * engineer and defect can normally be seen.
 */
const zoomForDistance = km => {
  if (km <= 0.1) return 17;
  if (km <= 0.25) return 16.2;
  if (km <= 0.5) return 15.5;
  if (km <= 1) return 14.8;
  if (km <= 2) return 14;
  if (km <= 5) return 12.8;
  if (km <= 10) return 11.8;
  if (km <= 20) return 10.8;
  if (km <= 50) return 9.5;
  if (km <= 100) return 8.5;

  return 7.5;
};


const DefectMarker = () => (
  <View style={styles.defectMarkerHalo}>
    <View style={styles.defectMarkerPin}>
      <Icon
        name="alert"
        size={20}
        color={colors.white}
      />
    </View>

    <View style={styles.defectMarkerTip} />
  </View>
);


const DefectLocationMap = ({
  issue,
  engineerLocation = null,
}) => {
  const [mapReady, setMapReady] =
    useState(false);

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


  /**
   * Actual defect GPS.
   *
   * MapLibre / GeoJSON uses:
   * [longitude, latitude]
   */
  const defect = useMemo(() => {
    if (
      !validCoordinate(
        issue?.latitude,
        issue?.longitude,
      )
    ) {
      return null;
    }

    return [
      Number(issue.longitude),
      Number(issue.latitude),
    ];
  }, [
    issue?.latitude,
    issue?.longitude,
  ]);


  /**
   * Actual engineer GPS.
   */
  const engineer = useMemo(() => {
    if (
      !validCoordinate(
        engineerLocation?.latitude,
        engineerLocation?.longitude,
      )
    ) {
      return null;
    }

    return [
      Number(engineerLocation.longitude),
      Number(engineerLocation.latitude),
    ];
  }, [
    engineerLocation?.latitude,
    engineerLocation?.longitude,
  ]);


  /**
   * Reset map loading state when switching
   * from one defect to another.
   */
  useEffect(() => {
    setMapReady(false);
  }, [issue?.id]);


  /**
   * Get the Yangon-Pyay railway from Cloud Run.
   *
   * railwaysApi caches it, so subsequent defect
   * maps reuse the same railway geometry.
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
        if (!active) return;

        console.error(
          '[DefectLocationMap] Railway loading failed:',
          error?.response?.data ||
            error?.message,
        );

        setRailwayError(
          error?.response?.data?.detail ||
            error?.message ||
            'Yangon-Pyay railway could not be loaded.',
        );
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


  /**
   * Convert server GeoJSON into Turf LineString.
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
        '[DefectLocationMap] Invalid railway geometry:',
        error,
      );

      return null;
    }
  }, [railwayFeature]);


  /**
   * Snap the defect GPS to its nearest position
   * on the Yangon-Pyay railway.
   *
   * Important:
   * The original defect marker remains at the
   * actual recorded GPS position.
   */
  const defectOnRailway = useMemo(() => {
    if (!railwayLine || !defect) {
      return null;
    }

    try {
      return nearestPointOnLine(
        railwayLine,
        point(defect),
        {
          units: 'kilometers',
        },
      );
    } catch (error) {
      console.error(
        '[DefectLocationMap] Cannot snap defect to railway:',
        error,
      );

      return null;
    }
  }, [
    railwayLine,
    defect,
  ]);


  /**
   * Snap engineer location to nearest railway point.
   */
  const engineerOnRailway =
    useMemo(() => {
      if (!railwayLine || !engineer) {
        return null;
      }

      try {
        return nearestPointOnLine(
          railwayLine,
          point(engineer),
          {
            units: 'kilometers',
          },
        );
      } catch (error) {
        console.error(
          '[DefectLocationMap] Cannot snap engineer to railway:',
          error,
        );

        return null;
      }
    }, [
      railwayLine,
      engineer,
    ]);


  /**
   * Extract the real Yangon-Pyay railway track
   * between engineer and defect.
   *
   * THIS is what replaces:
   *
   * coordinates: [engineer, defect]
   *
   * from the old implementation.
   */
  const railwaySection = useMemo(() => {
    if (
      !railwayLine ||
      !engineerOnRailway ||
      !defectOnRailway
    ) {
      return null;
    }

    try {
      return lineSlice(
        engineerOnRailway,
        defectOnRailway,
        railwayLine,
      );
    } catch (error) {
      console.error(
        '[DefectLocationMap] Cannot create railway section:',
        error,
      );

      return null;
    }
  }, [
    railwayLine,
    engineerOnRailway,
    defectOnRailway,
  ]);


  /**
   * Center camera between engineer and defect.
   */
  const cameraCenter = useMemo(() => {
    if (!defect) {
      return null;
    }

    if (!engineer) {
      return defect;
    }

    return [
      (engineer[0] + defect[0]) / 2,
      (engineer[1] + defect[1]) / 2,
    ];
  }, [
    defect,
    engineer,
  ]);


  /**
   * Dynamically determine zoom.
   */
  const cameraZoom = useMemo(() => {
    if (!defect) {
      return 16.2;
    }

    if (!engineer) {
      return 16.2;
    }

    return zoomForDistance(
      distanceKm(
        engineer,
        defect,
      ),
    );
  }, [
    defect,
    engineer,
  ]);


  /**
   * Turf returns distance from GPS position
   * to railway in kilometers.
   */
  const defectRailDistanceMeters =
    defectOnRailway?.properties?.dist != null
      ? Number(
          defectOnRailway.properties.dist,
        ) * 1000
      : null;


  const engineerRailDistanceMeters =
    engineerOnRailway?.properties?.dist !=
    null
      ? Number(
          engineerOnRailway.properties.dist,
        ) * 1000
      : null;


  /**
   * Defect has no GPS.
   */
  if (!defect) {
    return (
      <View style={styles.fallback}>
        <View style={styles.fallbackIcon}>
          <Icon
            name="map-marker-off-outline"
            size={24}
            color={colors.primaryStrong}
          />
        </View>

        <Text style={styles.fallbackTitle}>
          GPS တည်နေရာ မရှိသေးပါ
        </Text>

        <Text style={styles.fallbackText}>
          ဤချို့ယွင်းချက်ကို မြေပုံပေါ်တွင်
          ပြသရန် latitude နှင့် longitude
          လိုအပ်ပါသည်။
        </Text>
      </View>
    );
  }


  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        compassEnabled
        attributionEnabled={false}
        onDidFinishLoadingMap={() =>
          setMapReady(true)
        }
      >
        <Camera
          centerCoordinate={cameraCenter}
          zoomLevel={cameraZoom}
          animationMode="easeTo"
          animationDuration={450}
        />


        {/*
          Entire Yangon-Pyay railway.

          Displayed lightly so the engineer can
          understand the surrounding railway.
        */}
        {railwayLine ? (
          <ShapeSource
            id="yangon-pyay-railway"
            shape={railwayLine}
          >
            <LineLayer
              id="yangon-pyay-railway-background"
              style={{
                lineColor: '#66727D',
                lineWidth: 2.5,
                lineOpacity: 0.4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}


        {/*
          Actual railway section between the
          engineer and defect.
        */}
        {railwaySection ? (
          <ShapeSource
            id={`engineer-to-defect-${
              issue?.id || 'selected'
            }`}
            shape={railwaySection}
          >
            {/*
              White outline makes the railway route
              visible over the OpenFreeMap tiles.
            */}
            <LineLayer
              id={`engineer-to-defect-outline-${
                issue?.id || 'selected'
              }`}
              style={{
                lineColor: colors.white,
                lineWidth: 8,
                lineOpacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />

            <LineLayer
              id={`engineer-to-defect-line-${
                issue?.id || 'selected'
              }`}
              style={{
                lineColor:
                  colors.primaryStrong,
                lineWidth: 5,
                lineOpacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}


        {/*
          Defect marker stays at the actual
          stored defect GPS.
        */}
        <MarkerView
          coordinate={defect}
          anchor={{
            x: 0.5,
            y: 0.82,
          }}
          allowOverlap
        >
          <DefectMarker />
        </MarkerView>


        {/*
          Engineer marker stays at their actual
          phone GPS position.
        */}
        {engineer ? (
          <MarkerView
            coordinate={engineer}
            anchor={{
              x: 0.5,
              y: 0.5,
            }}
            allowOverlap
          >
            <View style={styles.engineerHalo}>
              <View style={styles.engineerPin}>
                <Icon
                  name="crosshairs-gps"
                  size={15}
                  color={colors.white}
                />
              </View>
            </View>
          </MarkerView>
        ) : null}


        {/*
          Small point showing where the engineer
          was snapped onto the railway.
        */}
        {engineerOnRailway ? (
          <MarkerView
            coordinate={
              engineerOnRailway.geometry
                .coordinates
            }
            anchor={{
              x: 0.5,
              y: 0.5,
            }}
            allowOverlap
          >
            <View
              style={
                styles.engineerRailPoint
              }
            />
          </MarkerView>
        ) : null}


        {/*
          Small point showing the corresponding
          defect position on the railway.
        */}
        {defectOnRailway ? (
          <MarkerView
            coordinate={
              defectOnRailway.geometry
                .coordinates
            }
            anchor={{
              x: 0.5,
              y: 0.5,
            }}
            allowOverlap
          >
            <View
              style={styles.defectRailPoint}
            />
          </MarkerView>
        ) : null}
      </MapView>


      {/*
        Map tile loading overlay.
      */}
      {!mapReady ? (
        <View
          style={styles.mapLoading}
          pointerEvents="none"
        >
          <ActivityIndicator
            size="small"
            color={colors.primaryStrong}
          />

          <Text style={styles.mapLoadingText}>
            မြေပုံ ရယူနေသည်…
          </Text>
        </View>
      ) : null}


      {/*
        Railway loading status.
      */}
      {mapReady && railwayLoading ? (
        <View
          style={styles.routeStatus}
          pointerEvents="none"
        >
          <ActivityIndicator
            size="small"
            color={colors.primaryStrong}
          />

          <Text style={styles.routeStatusText}>
            မီးရထားလမ်း ရယူနေသည်…
          </Text>
        </View>
      ) : null}


      {/*
        Railway API failure.
      */}
      {railwayError ? (
        <View style={styles.routeError}>
          <Icon
            name="alert-circle-outline"
            size={15}
            color={colors.danger}
          />

          <Text style={styles.routeErrorText}>
            မီးရထားလမ်း အချက်အလက်
            ရယူ၍မရပါ
          </Text>
        </View>
      ) : null}


      <View style={styles.mapHint}>
        <Icon
          name="gesture-swipe"
          size={15}
          color={colors.textSoft}
        />

        <Text style={styles.mapHintText}>
          မြေပုံကို ရွှေ့၊ ချဲ့၊ ချုံ့နိုင်သည်
        </Text>
      </View>


      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={styles.defectLegendDot}
          >
            <Icon
              name="alert"
              size={9}
              color={colors.white}
            />
          </View>

          <Text style={styles.legendText}>
            ချို့ယွင်းချက်
          </Text>
        </View>


        {engineer ? (
          <View style={styles.legendItem}>
            <View
              style={
                styles.engineerLegendDot
              }
            />

            <Text style={styles.legendText}>
              သင့်တည်နေရာ
            </Text>
          </View>
        ) : null}


        {railwaySection ? (
          <View style={styles.legendItem}>
            <View
              style={
                styles.railwayLegendLine
              }
            />

            <Text style={styles.legendText}>
              သံလမ်းလမ်းကြောင်း
            </Text>
          </View>
        ) : null}
      </View>


      {/*
        Development-only debugging.

        This helps verify that defect GPS coordinates
        are actually close to the Yangon-Pyay railway.

        It disappears automatically in production.
      */}
      {__DEV__ &&
      defectRailDistanceMeters != null ? (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>
            Defect → rail:{' '}
            {defectRailDistanceMeters.toFixed(
              1,
            )}
            m
          </Text>

          {engineerRailDistanceMeters !=
          null ? (
            <Text style={styles.debugText}>
              Engineer → rail:{' '}
              {engineerRailDistanceMeters.toFixed(
                1,
              )}
              m
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};


const styles = StyleSheet.create({
  wrapper: {
    height: 260,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBlue,
  },

  map: {
    flex: 1,
  },

  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor:
      'rgba(246,251,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 20,
  },

  mapLoadingText: {
    color: colors.textSoft,
    fontSize: 10.5,
    fontWeight: '800',
  },

  routeStatus: {
    position: 'absolute',
    left: 9,
    top: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor:
      'rgba(255,255,255,0.94)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor:
      'rgba(216,234,246,0.9)',
    zIndex: 8,
  },

  routeStatusText: {
    color: colors.textSoft,
    fontSize: 9.5,
    fontWeight: '700',
  },

  routeError: {
    position: 'absolute',
    left: 9,
    top: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor:
      'rgba(255,245,245,0.96)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor:
      'rgba(217,48,69,0.25)',
    zIndex: 8,
  },

  routeErrorText: {
    color: colors.danger,
    fontSize: 9.5,
    fontWeight: '700',
  },

  fallback: {
    minHeight: 180,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  fallbackIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fallbackTitle: {
    color: colors.text,
    fontWeight: '800',
    marginTop: 10,
    fontSize: 14,
  },

  fallbackText: {
    color: colors.muted,
    marginTop: 5,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 17,
  },

  defectMarkerHalo: {
    width: 48,
    height: 54,
    borderRadius: 24,
    paddingTop: 5,
    alignItems: 'center',
    backgroundColor:
      'rgba(217,48,69,0.14)',
  },

  defectMarkerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D93045',
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...shadow,
  },

  defectMarkerTip: {
    position: 'absolute',
    top: 34,
    width: 13,
    height: 13,
    backgroundColor: '#D93045',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.white,
    transform: [
      {
        rotate: '45deg',
      },
    ],
  },

  engineerHalo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor:
      'rgba(55,135,200,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  engineerPin: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor:
      colors.primaryStrong,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  engineerRailPoint: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor:
      colors.primaryStrong,
    borderWidth: 2,
    borderColor: colors.white,
  },

  defectRailPoint: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#D93045',
    borderWidth: 2,
    borderColor: colors.white,
  },

  legend: {
    position: 'absolute',
    left: 9,
    bottom: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor:
      'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor:
      'rgba(216,234,246,0.9)',
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  defectLegendDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#D93045',
    alignItems: 'center',
    justifyContent: 'center',
  },

  engineerLegendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor:
      colors.primaryStrong,
  },

  railwayLegendLine: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor:
      colors.primaryStrong,
  },

  legendText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSoft,
  },

  mapHint: {
    position: 'absolute',
    right: 9,
    top: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor:
      'rgba(255,255,255,0.92)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },

  mapHintText: {
    color: colors.textSoft,
    fontSize: 9.5,
    fontWeight: '700',
  },

  debugInfo: {
    position: 'absolute',
    right: 9,
    bottom: 9,
    backgroundColor:
      'rgba(255,255,255,0.93)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },

  debugText: {
    color: colors.textSoft,
    fontSize: 8,
    fontWeight: '600',
  },
});


export default DefectLocationMap;