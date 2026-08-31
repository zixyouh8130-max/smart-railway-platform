import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  MapView,
  PointAnnotation,
  ShapeSource,
  LineLayer,
} from '@maplibre/maplibre-react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const validCoordinate = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon);
};

const DefectLocationMap = ({ issue, engineerLocation = null }) => {
  const defect = useMemo(() => {
    if (!validCoordinate(issue?.latitude, issue?.longitude)) return null;
    return [Number(issue.longitude), Number(issue.latitude)];
  }, [issue?.latitude, issue?.longitude]);

  const engineer = useMemo(() => {
    if (!validCoordinate(engineerLocation?.latitude, engineerLocation?.longitude)) {
      return null;
    }
    return [Number(engineerLocation.longitude), Number(engineerLocation.latitude)];
  }, [engineerLocation?.latitude, engineerLocation?.longitude]);

  const line = useMemo(() => {
    if (!defect || !engineer) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [engineer, defect] },
    };
  }, [defect, engineer]);

  if (!defect) {
    return (
      <View style={styles.fallback}>
        <Icon name="map-marker-off" size={24} color="#94a3b8" />
        <Text style={styles.fallbackText}>ဒီတွေ့ရှိချက်မှာ GPS တည်နေရာ မရှိပါ။</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <MapView style={styles.map} mapStyle={MAP_STYLE} logoEnabled={false}>
        <Camera
          centerCoordinate={engineer || defect}
          zoomLevel={engineer ? 14 : 16}
          animationDuration={350}
        />

        {line ? (
          <ShapeSource id="engineer-to-defect" shape={line}>
            <LineLayer
              id="engineer-to-defect-line"
              style={{ lineColor: '#0f766e', lineWidth: 3, lineDasharray: [2, 2] }}
            />
          </ShapeSource>
        ) : null}

        <PointAnnotation id={`defect-${issue.id}`} coordinate={defect}>
          <View style={styles.defectPin}>
            <Icon name="alert" size={17} color="#fff" />
          </View>
        </PointAnnotation>

        {engineer ? (
          <PointAnnotation id="engineer-current-position" coordinate={engineer}>
            <View style={styles.engineerPin}>
              <Icon name="crosshairs-gps" size={15} color="#fff" />
            </View>
          </PointAnnotation>
        ) : null}
      </MapView>

      <View style={styles.legend}>
        <Text style={styles.legendText}>● ချို့ယွင်းချက်</Text>
        <Text style={styles.legendText}>◎ သင့်တည်နေရာ</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: 230,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#e2e8f0',
  },
  map: { flex: 1 },
  fallback: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  fallbackText: { color: '#64748b', marginTop: 8, textAlign: 'center' },
  defectPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#dc2626',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engineerPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0f766e',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  legendText: { fontSize: 10, fontWeight: '700', color: '#334155' },
});

export default DefectLocationMap;
