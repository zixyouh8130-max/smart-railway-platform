import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
} from '@maplibre/maplibre-react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors, radii, shadow } from '../theme/mobileTheme';
import { defectTypeLabel, railSideLabel } from '../utils/myanmarLabels';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const numberOrNull = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const issueCoordinate = issue => {
  const latitude = numberOrNull(issue?.latitude);
  const longitude = numberOrNull(issue?.longitude);
  return latitude === null || longitude === null ? null : [longitude, latitude];
};

const getRouteCoordinates = inspectionCase => {
  const route = inspectionCase?.ai_snapshot?.route || inspectionCase?.route || null;
  if (Array.isArray(route?.points)) {
    const points = route.points
      .map(point => {
        const latitude = numberOrNull(point?.latitude ?? point?.lat);
        const longitude = numberOrNull(point?.longitude ?? point?.lng ?? point?.lon);
        return latitude === null || longitude === null ? null : [longitude, latitude];
      })
      .filter(Boolean);
    if (points.length >= 2) return points;
  }

  const startLatitude = numberOrNull(route?.start?.latitude ?? route?.start?.lat);
  const startLongitude = numberOrNull(route?.start?.longitude ?? route?.start?.lng ?? route?.start?.lon);
  const endLatitude = numberOrNull(route?.end?.latitude ?? route?.end?.lat);
  const endLongitude = numberOrNull(route?.end?.longitude ?? route?.end?.lng ?? route?.end?.lon);
  if ([startLatitude, startLongitude, endLatitude, endLongitude].every(value => value !== null)) {
    return [[startLongitude, startLatitude], [endLongitude, endLatitude]];
  }

  return [...(inspectionCase?.issues || [])]
    .sort((a, b) => Number(a?.distance_from_start_miles ?? 999999) - Number(b?.distance_from_start_miles ?? 999999))
    .map(issueCoordinate)
    .filter(Boolean);
};

const calculateView = coordinates => {
  if (!coordinates.length) return { center: [96.1735, 16.8409], zoom: 13 };
  const longitudes = coordinates.map(point => point[0]);
  const latitudes = coordinates.map(point => point[1]);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const span = Math.max(maxLon - minLon, maxLat - minLat);
  const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

  let zoom = 15.8;
  if (span > 0.18) zoom = 10;
  else if (span > 0.09) zoom = 11;
  else if (span > 0.045) zoom = 12;
  else if (span > 0.02) zoom = 13;
  else if (span > 0.009) zoom = 14;
  else if (span > 0.004) zoom = 15;

  return { center, zoom };
};

const DefectMarker = ({ selected }) => (
  <View style={[styles.markerHalo, selected && styles.markerHaloSelected]}>
    <View style={[styles.markerPin, selected && styles.markerPinSelected]}>
      <Icon name="alert" size={selected ? 20 : 14} color={colors.white} />
    </View>
    <View style={[styles.markerTip, selected && styles.markerTipSelected]} />
  </View>
);

const DefectListCard = ({ issue, selected, onPress, compact = false }) => (
  <TouchableOpacity
    activeOpacity={0.86}
    onPress={onPress}
    style={[styles.defectCard, compact && styles.defectCardCompact, selected && styles.defectCardSelected]}
  >
    <View style={styles.defectCardTop}>
      <View style={[styles.smallDefectDot, selected && styles.smallDefectDotSelected]}>
        <Icon name="alert" size={12} color={colors.white} />
      </View>
      <Text style={styles.defectCardDistance}>
        {issue?.distance_from_start_miles != null
          ? `${Number(issue.distance_from_start_miles).toFixed(2)} မိုင်`
          : 'အကွာအဝေး မရှိ'}
      </Text>
    </View>
    <Text style={styles.defectCardTitle} numberOfLines={2}>{defectTypeLabel(issue?.defect_type)}</Text>
    <View style={styles.defectCardMetaRow}>
      <Text style={styles.defectCardMeta}>{railSideLabel(issue?.rail_side)}</Text>
      <Text style={styles.confidenceBadge}>
        {issue?.confidence != null ? `${(Number(issue.confidence) * 100).toFixed(1)}%` : '—'}
      </Text>
    </View>
  </TouchableOpacity>
);

const SideRail = ({ title, issues, selectedIssueId, onSelect, compact = false }) => (
  <View style={[styles.sideRail, compact && styles.mobileRail]}>
    <View style={styles.sideRailHeader}>
      <View style={styles.railTitleIcon}><Icon name="railroad-light" size={17} color={colors.primaryStrong} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sideRailTitle}>{title}</Text>
        <Text style={styles.sideRailHint}>ချို့ယွင်းချက် {issues.length} ခု</Text>
      </View>
      <View style={styles.railCount}><Text style={styles.railCountText}>{issues.length}</Text></View>
    </View>

    {compact ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileRailScroller}>
        {issues.map(issue => (
          <View key={issue.id} style={{ width: 196 }}>
            <DefectListCard issue={issue} compact selected={String(selectedIssueId) === String(issue.id)} onPress={() => onSelect(issue)} />
          </View>
        ))}
        {!issues.length ? <Text style={styles.emptyRailText}>ဤဘက်တွင် GPS ပါသော ချို့ယွင်းချက် မရှိပါ။</Text> : null}
      </ScrollView>
    ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.desktopRailScroller}>
        {issues.map(issue => (
          <DefectListCard key={issue.id} issue={issue} selected={String(selectedIssueId) === String(issue.id)} onPress={() => onSelect(issue)} />
        ))}
        {!issues.length ? <Text style={styles.emptyRailText}>ဤဘက်တွင် GPS ပါသော ချို့ယွင်းချက် မရှိပါ။</Text> : null}
      </ScrollView>
    )}
  </View>
);

const InspectionMapModal = ({ visible, onClose, inspectionCase, initialIssueId = null, onOpenIssue }) => {
  const { width, height } = useWindowDimensions();
  const wide = width >= 760;
  const issues = useMemo(
    () => (inspectionCase?.issues || []).filter(issue => issueCoordinate(issue)),
    [inspectionCase?.issues],
  );
  const routeCoordinates = useMemo(() => getRouteCoordinates(inspectionCase), [inspectionCase]);
  const routeView = useMemo(
    () => calculateView(routeCoordinates.length ? routeCoordinates : issues.map(issueCoordinate).filter(Boolean)),
    [issues, routeCoordinates],
  );
  const [selectedIssueId, setSelectedIssueId] = useState(initialIssueId || null);
  const [mapReady, setMapReady] = useState(false);
  const [overview, setOverview] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const preferred = initialIssueId && issues.some(issue => String(issue.id) === String(initialIssueId))
      ? initialIssueId
      : issues[0]?.id || null;
    setSelectedIssueId(preferred);
    setOverview(!initialIssueId);
    setMapReady(false);
  }, [visible, initialIssueId, issues]);

  const selectedIssue = useMemo(
    () => issues.find(issue => String(issue.id) === String(selectedIssueId)) || null,
    [issues, selectedIssueId],
  );
  const selectedCoordinate = issueCoordinate(selectedIssue);
  const cameraCenter = !overview && selectedCoordinate ? selectedCoordinate : routeView.center;
  const cameraZoom = !overview && selectedCoordinate ? 16.4 : routeView.zoom;

  const routeShape = useMemo(() => {
    if (routeCoordinates.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoordinates },
    };
  }, [routeCoordinates]);

  const leftIssues = useMemo(
    () => issues.filter(issue => String(issue?.rail_side || '').toUpperCase().includes('LEFT')),
    [issues],
  );
  const rightIssues = useMemo(
    () => issues.filter(issue => String(issue?.rail_side || '').toUpperCase().includes('RIGHT')),
    [issues],
  );
  const unknownIssues = useMemo(
    () => issues.filter(issue => !String(issue?.rail_side || '').toUpperCase().includes('LEFT') && !String(issue?.rail_side || '').toUpperCase().includes('RIGHT')),
    [issues],
  );
  const balancedLeft = leftIssues.length || rightIssues.length ? [...leftIssues, ...unknownIssues.filter((_, index) => index % 2 === 0)] : issues.filter((_, index) => index % 2 === 0);
  const balancedRight = leftIssues.length || rightIssues.length ? [...rightIssues, ...unknownIssues.filter((_, index) => index % 2 === 1)] : issues.filter((_, index) => index % 2 === 1);

  const selectIssue = issue => {
    setSelectedIssueId(issue.id);
    setOverview(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent={false}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose} accessibilityLabel="ပိတ်ရန်">
            <Icon name="arrow-left" size={21} color={colors.textSoft} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>စစ်ဆေးမှု မြေပုံ</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{inspectionCase?.case_name || inspectionCase?.run_id || 'သံလမ်းစစ်ဆေးမှု'}</Text>
          </View>
          <TouchableOpacity style={styles.overviewButton} onPress={() => setOverview(true)}>
            <Icon name="fit-to-page-outline" size={17} color={colors.primaryDark} />
            {wide ? <Text style={styles.overviewButtonText}>လမ်းကြောင်းတစ်ခုလုံး</Text> : null}
          </TouchableOpacity>
        </View>

        <View style={[styles.mapLayout, !wide && styles.mapLayoutMobile]}>
          {wide ? (
            <SideRail title="ဘယ်ဘက် သံလမ်း" issues={balancedLeft} selectedIssueId={selectedIssueId} onSelect={selectIssue} />
          ) : null}

          <View style={[styles.mapCard, !wide && { height: Math.max(350, Math.min(height * 0.53, 520)) }]}>
            {issues.length || routeCoordinates.length ? (
              <MapView
                style={styles.map}
                mapStyle={MAP_STYLE}
                logoEnabled={false}
                attributionEnabled={false}
                compassEnabled
                rotateEnabled
                onDidFinishLoadingMap={() => setMapReady(true)}
              >
                <Camera
                  centerCoordinate={cameraCenter}
                  zoomLevel={cameraZoom}
                  animationMode="easeTo"
                  animationDuration={550}
                />

                {routeShape ? (
                  <ShapeSource id="inspection-route-source" shape={routeShape}>
                    <LineLayer
                      id="inspection-route-line"
                      style={{
                        lineColor: '#2563EB',
                        lineWidth: 5,
                        lineOpacity: 0.82,
                        lineCap: 'round',
                        lineJoin: 'round',
                      }}
                    />
                  </ShapeSource>
                ) : null}

                {issues.map(issue => {
                  const coordinate = issueCoordinate(issue);
                  const selected = String(issue.id) === String(selectedIssueId);
                  return (
                    <MarkerView key={issue.id} coordinate={coordinate} anchor={{ x: 0.5, y: 0.8 }} allowOverlap>
                      <TouchableOpacity activeOpacity={0.82} onPress={() => selectIssue(issue)}>
                        <DefectMarker selected={selected} />
                      </TouchableOpacity>
                    </MarkerView>
                  );
                })}
              </MapView>
            ) : (
              <View style={styles.noMapData}>
                <Icon name="map-marker-off-outline" size={38} color={colors.borderStrong} />
                <Text style={styles.noMapTitle}>မြေပုံဒေတာ မရှိသေးပါ</Text>
                <Text style={styles.noMapText}>ဤစစ်ဆေးမှုတွင် လမ်းကြောင်း သို့မဟုတ် GPS ပါသော ချို့ယွင်းချက် မရှိသေးပါ။</Text>
              </View>
            )}

            {!mapReady && (issues.length || routeCoordinates.length) ? (
              <View style={styles.mapLoading} pointerEvents="none">
                <ActivityIndicator size="small" color={colors.primaryStrong} />
                <Text style={styles.mapLoadingText}>စစ်ဆေးမှု မြေပုံ ရယူနေသည်…</Text>
              </View>
            ) : null}

            <View style={styles.routeLegend}>
              <View style={styles.routeLineSample} />
              <Text style={styles.legendText}>စစ်ဆေးခဲ့သည့် သံလမ်းလမ်းကြောင်း</Text>
            </View>

            {selectedIssue ? (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.selectedOverlay}
                onPress={() => onOpenIssue?.(selectedIssue)}
              >
                <View style={styles.selectedOverlayIcon}>
                  <Icon name="alert" size={17} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedOverlayLabel}>ရွေးချယ်ထားသော ချို့ယွင်းချက်</Text>
                  <Text style={styles.selectedOverlayTitle} numberOfLines={1}>{defectTypeLabel(selectedIssue.defect_type)}</Text>
                  <Text style={styles.selectedOverlayMeta}>
                    {railSideLabel(selectedIssue.rail_side)} · {selectedIssue.distance_from_start_miles != null ? `${Number(selectedIssue.distance_from_start_miles).toFixed(2)} မိုင်` : 'အကွာအဝေး မရှိ'}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.primaryDark} />
              </TouchableOpacity>
            ) : null}
          </View>

          {wide ? (
            <SideRail title="ညာဘက် သံလမ်း" issues={balancedRight} selectedIssueId={selectedIssueId} onSelect={selectIssue} />
          ) : null}
        </View>

        {!wide ? (
          <ScrollView style={styles.mobileLists} contentContainerStyle={styles.mobileListsContent} showsVerticalScrollIndicator={false}>
            <SideRail compact title="ဘယ်ဘက် သံလမ်း" issues={balancedLeft} selectedIssueId={selectedIssueId} onSelect={selectIssue} />
            <SideRail compact title="ညာဘက် သံလမ်း" issues={balancedRight} selectedIssueId={selectedIssueId} onSelect={selectIssue} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: colors.primaryStrong, fontSize: 10, fontWeight: '900' },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 2 },
  overviewButton: { minHeight: 42, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 11 },
  overviewButtonText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  mapLayout: { flex: 1, flexDirection: 'row', gap: 10, padding: 10, minHeight: 0 },
  mapLayoutMobile: { flex: 0, paddingBottom: 6 },
  sideRail: { width: 230, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', ...shadow },
  mobileRail: { width: '100%', marginBottom: 10, shadowOpacity: 0, elevation: 0 },
  sideRailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  railTitleIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  sideRailTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
  sideRailHint: { color: colors.muted, fontSize: 9.5, marginTop: 2 },
  railCount: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 7, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  railCountText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '900' },
  desktopRailScroller: { padding: 9, paddingBottom: 14 },
  mobileRailScroller: { padding: 9, gap: 8 },
  defectCard: { backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 10, marginBottom: 8 },
  defectCardCompact: { marginBottom: 0, minHeight: 108 },
  defectCardSelected: { borderColor: '#F05252', borderWidth: 2, backgroundColor: '#FFF7F8' },
  defectCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  smallDefectDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F05252', alignItems: 'center', justifyContent: 'center' },
  smallDefectDotSelected: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#D93045' },
  defectCardDistance: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  defectCardTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '900', marginTop: 7 },
  defectCardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 7 },
  defectCardMeta: { color: colors.textSoft, fontSize: 9.5, flex: 1 },
  confidenceBadge: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '900' },
  emptyRailText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, padding: 10 },
  mapCard: { flex: 1, minWidth: 0, borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceBlue, ...shadow },
  map: { flex: 1 },
  mapLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(246,251,255,0.78)', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 8 },
  mapLoadingText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '800' },
  noMapData: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surfaceSoft },
  noMapTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 8 },
  noMapText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5, maxWidth: 300 },
  markerHalo: { width: 34, height: 40, alignItems: 'center', justifyContent: 'flex-start' },
  markerHaloSelected: { width: 46, height: 52, borderRadius: 25, backgroundColor: 'rgba(217,48,69,0.14)', paddingTop: 5 },
  markerPin: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#F05252', borderWidth: 2.5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 2, ...shadow },
  markerPinSelected: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#D93045', borderWidth: 3 },
  markerTip: { position: 'absolute', top: 23, width: 11, height: 11, backgroundColor: '#F05252', transform: [{ rotate: '45deg' }], borderBottomWidth: 2, borderRightWidth: 2, borderColor: colors.white },
  markerTipSelected: { top: 31, width: 13, height: 13, backgroundColor: '#D93045' },
  routeLegend: { position: 'absolute', right: 10, top: 10, flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  routeLineSample: { width: 25, height: 4, borderRadius: 2, backgroundColor: '#2563EB' },
  legendText: { color: colors.textSoft, fontSize: 9.5, fontWeight: '800' },
  selectedOverlay: { position: 'absolute', left: 10, bottom: 10, right: 10, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: radii.md, padding: 10, borderWidth: 1, borderColor: colors.borderStrong },
  selectedOverlayIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#D93045', alignItems: 'center', justifyContent: 'center' },
  selectedOverlayLabel: { color: colors.muted, fontSize: 8.5, fontWeight: '800' },
  selectedOverlayTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900', marginTop: 2 },
  selectedOverlayMeta: { color: colors.textSoft, fontSize: 9.5, marginTop: 2 },
  mobileLists: { flex: 1, paddingHorizontal: 10 },
  mobileListsContent: { paddingBottom: 16 },
});

export default InspectionMapModal;
