import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Video,
  Clock,
  MapPin,
  X,
  BarChart3,
  Layers,
  Bot,
  Wrench,
  Info,
  Activity,
  CheckCircle2,
  PlayCircle,
  FileVideo2,
  ExternalLink,
  Calendar,
  Train,
  Route,
  ChevronRight,
  Shield
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { inspectionApi } from '@/api/inspectionAPI';

// -----------------------------------------------------------------------------
// Leaflet setup
// -----------------------------------------------------------------------------

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// -----------------------------------------------------------------------------
// Current YOLO classes
// -----------------------------------------------------------------------------

const DEFECT_META = {
  Corrosion: {
    color: '#B45309',
    icon: '🟤',
    label: 'သံချေးတက်',
  },
  'Fishplate Damage': {
    color: '#E11D48',
    icon: '🔧',
    label: 'သံလမ်းဆစ်ပျက်စီး',
  },
  'Missing Fastener': {
    color: '#F59E0B',
    icon: '🔶',
    label: 'ချိတ်ဆက်ကိရိယာပျက်',
  },
  'Missing Fishplate Bolt': {
    color: '#7C3AED',
    icon: '🔩',
    label: 'သံလမ်းဆစ်ကျောက်ဆွဲပျက်',
  },
  'Rail Break': {
    color: '#DC2626',
    icon: '💥',
    label: 'သံလမ်းကျိုး',
  },
  'Railway Joint Defect': {
    color: '#4F46E5',
    icon: '⚠️',
    label: 'သံလမ်းဆစ်ချို့ယွင်း',
  },
};

const FALLBACK_DEFECT_META = {
  color: '#64748B',
  icon: '⚠️',
  label: 'ချို့ယွင်းချက်',
};

const PRIORITY_META = {
  routine: {
    label: 'ပုံမှန်',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  monitor: {
    label: 'စောင့်ကြည့်ရန်',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  priority_inspection: {
    label: 'ဦးစားပေးစစ်ဆေး',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  urgent_manual_review: {
    label: 'အရေးပေါ်ပြန်လည်စစ်ဆေး',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
};

const getDefectMeta = (type) => DEFECT_META[type] || FALLBACK_DEFECT_META;

const getPriorityMeta = (priority) =>
  PRIORITY_META[priority] || {
    label: priority ? String(priority).replaceAll('_', ' ') : 'သတ်မှတ်မထား',
    classes: 'bg-gray-50 text-gray-600 border-gray-200',
  };

// -----------------------------------------------------------------------------
// General helpers
// -----------------------------------------------------------------------------

const asNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIdString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid);
    if (value.id) return toIdString(value.id);
    if (value._id) return toIdString(value._id);
  }
  return String(value);
};

const getInspectionId = (inspection) =>
  toIdString(
    inspection?.id ??
      inspection?._id ??
      inspection?.inspection?.id ??
      inspection?.inspection?._id
  );

const getEventId = (event, index = 0) => {
  const direct = toIdString(event?.id ?? event?._id);
  if (direct) return direct;
  return [
    event?.rail_side || 'rail',
    event?.defect_type || 'defect',
    event?.representative_frame ?? 'frame',
    event?.start_timestamp ?? index,
  ].join('-');
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString('my-MM');
};

const formatDuration = (seconds) => {
  const totalSeconds = asNumber(seconds, 0);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return mins > 0 ? `${mins}မိနစ် ${secs}စက္ကန့်` : `${secs}စက္ကန့်`;
};

const formatDistance = (value, digits = 2) => {
  const n = asNumber(value);
  return n === null ? 'N/A' : `${n.toFixed(digits)} မီတာ`;
};

const formatConfidence = (value) => {
  const n = asNumber(value);
  return n === null ? 'N/A' : `${(n * 100).toFixed(1)}%`;
};

const getInspectionName = (inspection) =>
  inspection?.gpx_name ||
  inspection?.video_name ||
  inspection?.inspection?.gpx_name ||
  inspection?.inspection?.video_name ||
  inspection?.run_id ||
  inspection?.inspection?.run_id ||
  inspection?.name ||
  'စစ်ဆေးမှု';

const getInspectionDuration = (inspection) =>
  inspection?.duration_seconds ??
  inspection?.route?.duration_seconds ??
  inspection?.inspection?.duration_seconds ??
  inspection?.inspection?.route?.duration_seconds ??
  0;

const getInspectionDistance = (inspection) =>
  inspection?.route?.distance_m ??
  inspection?.inspection?.route?.distance_m ??
  null;

const getInspectionPointCount = (inspection) =>
  inspection?.route?.point_count ??
  inspection?.inspection?.route?.point_count ??
  null;

const getInspectionCreatedAt = (inspection) =>
  inspection?.created_at ??
  inspection?.inspection?.created_at ??
  inspection?.generated_at ??
  inspection?.inspection?.generated_at ??
  null;

const getRoute = (inspection) =>
  inspection?.route ?? inspection?.inspection?.route ?? null;

const getInspectionEvents = (payload) =>
  payload?.events ??
  payload?.inspection?.events ??
  payload?.inspection?.inspection?.events ??
  [];

const getInspectionDefectCount = (inspection) => {
  const numeric =
    inspection?.inspection_events ??
    inspection?.inspection?.inspection_events ??
    inspection?.defect_count ??
    inspection?.inspection?.defect_count;

  if (typeof numeric === 'number') return numeric;

  const events = getInspectionEvents(inspection);
  return Array.isArray(events) ? events.length : 0;
};

const getAiAdvisory = (inspection) =>
  inspection?.ai_advisory ??
  inspection?.inspection?.ai_advisory ??
  null;

const getAiStatus = (inspection) =>
  inspection?.ai_advisory_status ??
  inspection?.inspection?.ai_advisory_status ??
  inspection?.ai_review_status ??
  inspection?.inspection?.ai_review_status ??
  null;

const getAiModel = (inspection) =>
  inspection?.ai_model ??
  inspection?.inspection?.ai_model ??
  null;

const getAiGeneratedAt = (inspection) =>
  inspection?.ai_advisory_generated_at ??
  inspection?.inspection?.ai_advisory_generated_at ??
  inspection?.ai_reviewed_at ??
  inspection?.inspection?.ai_reviewed_at ??
  null;

const getAiSpatialSummary = (inspection) =>
  inspection?.ai_spatial_summary ??
  inspection?.inspection?.ai_spatial_summary ??
  null;

const isBrowserAccessibleMedia = (value) => {
  if (!value || typeof value !== 'string') return false;
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/') ||
    value.startsWith('/media/') ||
    value.startsWith('blob:')
  );
};

const getInspectionVideoSources = (inspection) => {
  const media = inspection?.media ?? inspection?.inspection?.media ?? {};
  const mediaUrls = inspection?.media_urls ?? inspection?.inspection?.media_urls ?? {};

  const leftUrl =
    mediaUrls?.left ??
    media?.left_video_url ??
    media?.left_rail_video_url ??
    media?.left_rail_inspection_url ??
    media?.left_annotated_video_url ??
    inspection?.left_video_url ??
    inspection?.left_rail_video_url ??
    null;

  const rightUrl =
    mediaUrls?.right ??
    media?.right_video_url ??
    media?.right_rail_video_url ??
    media?.right_rail_inspection_url ??
    media?.right_annotated_video_url ??
    inspection?.right_video_url ??
    inspection?.right_rail_video_url ??
    null;

  const leftPath =
    media?.left_video_path ??
    media?.left_rail_video_path ??
    media?.left_rail_inspection_path ??
    media?.left_annotated_video_path ??
    media?.left_video ??
    inspection?.left_video_path ??
    inspection?.left_rail_video_path ??
    null;

  const rightPath =
    media?.right_video_path ??
    media?.right_rail_video_path ??
    media?.right_rail_inspection_path ??
    media?.right_annotated_video_path ??
    media?.right_video ??
    inspection?.right_video_path ??
    inspection?.right_rail_video_path ??
    null;

  return {
    left: {
      url: isBrowserAccessibleMedia(leftUrl) ? leftUrl : isBrowserAccessibleMedia(leftPath) ? leftPath : null,
      storedPath: leftPath || leftUrl || null,
    },
    right: {
      url: isBrowserAccessibleMedia(rightUrl) ? rightUrl : isBrowserAccessibleMedia(rightPath) ? rightPath : null,
      storedPath: rightPath || rightUrl || null,
    },
  };
};

// -----------------------------------------------------------------------------
// GPS / route helpers
// -----------------------------------------------------------------------------

const getEventCoordinates = (event) => {
  const lat = event?.gps?.latitude ?? event?.gps?.lat ?? event?.latitude ?? event?.lat;
  const lng = event?.gps?.longitude ?? event?.gps?.lng ?? event?.longitude ?? event?.lng;

  if (lat != null && lng != null) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  if (Array.isArray(event?.gps?.coordinates) && event.gps.coordinates.length >= 2) {
    const longitude = Number(event.gps.coordinates[0]);
    const latitude = Number(event.gps.coordinates[1]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  if (Array.isArray(event?.coordinates) && event.coordinates.length >= 2) {
    const longitude = Number(event.coordinates[0]);
    const latitude = Number(event.coordinates[1]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
};

const getEventRouteDistance = (event) =>
  event?.gps?.distance_from_start_m ?? event?.distance_from_start_m ?? null;

const getRoutePolyline = (route) => {
  if (!route) return [];

  if (Array.isArray(route.points)) {
    const points = route.points
      .map((point) => {
        const latitude = asNumber(point?.latitude ?? point?.lat);
        const longitude = asNumber(point?.longitude ?? point?.lng);
        if (latitude === null || longitude === null) return null;
        return [latitude, longitude];
      })
      .filter(Boolean);
    if (points.length >= 2) return points;
  }

  const startLat = asNumber(route?.start?.latitude);
  const startLng = asNumber(route?.start?.longitude);
  const endLat = asNumber(route?.end?.latitude);
  const endLng = asNumber(route?.end?.longitude);

  if (startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
    return [
      [startLat, startLng],
      [endLat, endLng],
    ];
  }

  return [];
};

const getSupplementaryFindings = (event) => {
  const review = event?.supplementary_visual_review;
  if (!review || review?.performed !== true) return [];

  const results = [];

  if (Array.isArray(review.findings)) {
    review.findings.forEach((finding) => {
      if (!finding?.description) return;
      results.push({
        type: finding.type || 'supplementary_finding',
        confidence: finding.confidence || null,
        description: finding.description,
      });
    });
  }

  const severity = review?.rail_break_visual_severity;
  if (severity?.description && severity?.confidence === 'high') {
    results.push({
      type: 'rail_break_visual_severity',
      confidence: severity.confidence,
      level: severity.level,
      description: severity.description,
    });
  }

  return results;
};

// -----------------------------------------------------------------------------
// Leaflet components
// -----------------------------------------------------------------------------

function FitBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!positions?.length) return;
    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 18,
      });
    }
  }, [map, positions]);

  return null;
}

const createDefectIcon = (defectType, isSelected = false) => {
  const meta = getDefectMeta(defectType);
  const size = isSelected ? 34 : 28;

  return L.divIcon({
    className: 'custom-defect-marker',
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${meta.color};
        border:3px solid white;
        box-shadow:0 4px 12px rgba(15,23,42,.28);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:${Math.round(size * 0.48)}px;
        transform:${isSelected ? 'scale(1.12)' : 'scale(1)'};
      ">
        ${meta.icon}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
};

function DefectMap({ events, selectedEventId, onMarkerClick, route }) {
  const validEvents = useMemo(
    () => events.filter((event) => getEventCoordinates(event)),
    [events]
  );

  const routePolyline = useMemo(() => getRoutePolyline(route), [route]);

  const allPositions = useMemo(() => {
    const positions = validEvents
      .map((event) => {
        const coords = getEventCoordinates(event);
        return coords ? [coords.latitude, coords.longitude] : null;
      })
      .filter(Boolean);
    routePolyline.forEach((point) => positions.push(point));
    return positions;
  }, [validEvents, routePolyline]);

  const center = useMemo(() => {
    if (!allPositions.length) return [16.8409, 96.1735];
    const latitude = allPositions.reduce((sum, point) => sum + point[0], 0) / allPositions.length;
    const longitude = allPositions.reduce((sum, point) => sum + point[1], 0) / allPositions.length;
    return [latitude, longitude];
  }, [allPositions]);

  const defectTypes = useMemo(() => {
    return validEvents.reduce((acc, event) => {
      const type = event?.defect_type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }, [validEvents]);

  if (!allPositions.length) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl bg-slate-50">
        <MapPin className="mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium text-slate-600">GPS ဒေတာ မရှိပါ</p>
        <p className="mt-1 text-sm text-slate-400">
          ချို့ယွင်းချက်များကို မြေပုံပေါ်တွင် ပြသရန် တည်နေရာ လိုအပ်ပါသည်။
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routePolyline.length >= 2 && (
          <Polyline
            positions={routePolyline}
            pathOptions={{
              color: '#2563EB',
              weight: 4,
              opacity: 0.8,
            }}
          />
        )}

        {route?.start?.latitude != null && route?.start?.longitude != null && (
          <CircleMarker
            center={[Number(route.start.latitude), Number(route.start.longitude)]}
            radius={7}
            pathOptions={{
              color: '#059669',
              fillColor: '#10B981',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <strong>စတင်ရာ</strong>
            </Popup>
          </CircleMarker>
        )}

        {route?.end?.latitude != null && route?.end?.longitude != null && (
          <CircleMarker
            center={[Number(route.end.latitude), Number(route.end.longitude)]}
            radius={7}
            pathOptions={{
              color: '#B91C1C',
              fillColor: '#EF4444',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <strong>အဆုံးသတ်</strong>
            </Popup>
          </CircleMarker>
        )}

        {validEvents.map((event, index) => {
          const coords = getEventCoordinates(event);
          const eventId = getEventId(event, index);
          const isSelected = eventId === selectedEventId;

          return (
            <Marker
              key={eventId}
              position={[coords.latitude, coords.longitude]}
              icon={createDefectIcon(event.defect_type, isSelected)}
              eventHandlers={{
                click: () => onMarkerClick(eventId),
              }}
            >
              <Popup>
                <div className="min-w-[220px] p-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-lg">{getDefectMeta(event.defect_type).icon}</span>
                    <strong>{event.defect_type}</strong>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-gray-500">သံလမ်း: </span>
                      <span className="font-medium">
                        {event?.rail_side?.toUpperCase?.() || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">အတည်ပြုနှုန်း: </span>
                      <span className="font-medium">
                        {formatConfidence(event?.confidence)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">အကွာအဝေး: </span>
                      <span className="font-medium">
                        {formatDistance(getEventRouteDistance(event))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">အချိန်: </span>
                      <span className="font-medium">
                        {asNumber(event?.start_timestamp, 0).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <FitBounds positions={allPositions} />
      </MapContainer>

      <div className="absolute bottom-4 right-4 z-[1000] max-w-[220px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ချို့ယွင်းချက်များ
        </p>
        <div className="space-y-1.5">
          {Object.entries(defectTypes).map(([type, count]) => {
            const meta = getDefectMeta(type);
            return (
              <div key={type} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="flex-1 truncate text-slate-700">{type}</span>
                <span className="font-medium text-slate-500">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small UI components
// -----------------------------------------------------------------------------

function StatCard({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {helper && <p className="mt-1 truncate text-xs text-slate-400">{helper}</p>}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority, compact = false }) {
  const meta = getPriorityMeta(priority);

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${meta.classes} ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <Info className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="font-medium text-slate-700">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{description}</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// AI advisory panel
// -----------------------------------------------------------------------------

function AiAdvisoryPanel({ inspection }) {
  const advisory = getAiAdvisory(inspection);
  const status = getAiStatus(inspection);
  const model = getAiModel(inspection);
  const generatedAt = getAiGeneratedAt(inspection);
  const spatial = getAiSpatialSummary(inspection);

  if (!advisory) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
            <Bot className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">AI ထိန်းသိမ်းမှု အကြံပြုချက်</h4>
            <p className="text-sm text-slate-500">
              စစ်ဆေးမှုရလဒ်များအတွက် ဉာဏ်ရည်တုအခြေပြု ပြုပြင်ထိန်းသိမ်းမှု အကြံပြုချက်
            </p>
          </div>
        </div>

        <EmptyState
          title={status === 'failed' ? 'AI အကြံပြုချက် မအောင်မြင်ပါ' : 'AI အကြံပြုချက် မရှိသေးပါ'}
          description={
            status === 'failed'
              ? 'စစ်ဆေးမှုဒေတာ ရှိနေသော်လည်း AI အကြံပြုချက် ထုတ်ပေးခြင်း မပြီးမြောက်ပါ။'
              : 'ဤစစ်ဆေးမှုတွင် AI အကြံပြုချက် မပါဝင်သေးပါ။'
          }
        />
      </section>
    );
  }

  const areas = advisory?.areas_of_attention || [];
  const highPriority = advisory?.individual_high_priority_events || [];
  const typeAssessments = advisory?.defect_type_assessments || [];
  const factors = advisory?.possible_contributing_factors || [];
  const actions = advisory?.recommended_actions || [];
  const keyFindings = advisory?.key_findings || [];
  const limitations = advisory?.limitations || [];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
              <Bot className="h-6 w-6 text-violet-700" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-lg font-semibold text-slate-900">
                  AI ရထားလမ်း ထိန်းသိမ်းမှု အကြံပြုချက်
                </h4>
                <PriorityBadge priority={advisory?.overall_priority} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                ချို့ယွင်းချက်အမျိုးအစား၊ တည်နေရာ၊ ပြုပြင်ထိန်းသိမ်းမှု အရေးပါမှုတို့ကို ခွဲခြမ်းစိတ်ဖြာထားသည်။
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                {model && <span>မော်ဒယ်: {model}</span>}
                {generatedAt && <span>ထုတ်ပေးချိန်: {formatDate(generatedAt)}</span>}
                {status && <span>အခြေအနေ: {status}</span>}
              </div>
            </div>
          </div>

          {spatial?.reviewed_event_count != null && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-500">ခွဲခြမ်းစိတ်ဖြာထားသော အဖြစ်အပျက်များ</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {spatial.reviewed_event_count}
              </p>
            </div>
          )}
        </div>

        {advisory?.executive_summary && (
          <div className="mt-5 rounded-xl border border-violet-100 bg-white/80 p-4">
            <p className="text-sm leading-6 text-slate-700">{advisory.executive_summary}</p>
          </div>
        )}
      </div>

      <div className="space-y-7 p-6">
        {keyFindings.length > 0 && (
          <div>
            <h5 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Activity className="h-4 w-4 text-blue-600" />
              အဓိက တွေ့ရှိချက်များ
            </h5>
            <div className="grid gap-2 md:grid-cols-2">
              {keyFindings.map((finding, index) => (
                <div
                  key={`${finding}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700"
                >
                  {finding}
                </div>
              ))}
            </div>
          </div>
        )}

        {areas.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h5 className="flex items-center gap-2 font-semibold text-slate-900">
                <Layers className="h-4 w-4 text-amber-600" />
                အာရုံစိုက်ရန် နေရာများ
              </h5>
              <span className="text-xs text-slate-400">
                {areas.length} နေရာ
              </span>
            </div>

            <div className="space-y-3">
              {areas.map((area, index) => (
                <div
                  key={`${area?.rail_side}-${area?.start_distance_m}-${index}`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {(area?.rail_side || 'Unknown').toUpperCase()} သံလမ်း ·{' '}
                        {formatDistance(area?.start_distance_m)} →{' '}
                        {formatDistance(area?.end_distance_m)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {area?.event_count ?? 0} အဖြစ်အပျက်
                        {(area?.event_count ?? 0) === 1 ? '' : 'များ'} ·{' '}
                        {Object.entries(area?.defect_counts || {})
                          .map(([type, count]) => `${type}: ${count}`)
                          .join(' · ') || 'ချို့ယွင်းချက် အမျိုးအစား မရှိပါ'}
                      </p>
                    </div>
                    <PriorityBadge priority={area?.priority} />
                  </div>

                  {area?.assessment && (
                    <p className="mt-3 text-sm leading-6 text-slate-700">{area.assessment}</p>
                  )}

                  {Array.isArray(area?.recommended_checks) &&
                    area.recommended_checks.length > 0 && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          စစ်ဆေးရန် အကြံပြုချက်များ
                        </p>
                        <ul className="space-y-1.5 text-sm text-slate-700">
                          {area.recommended_checks.map((check, checkIndex) => (
                            <li
                              key={`${check}-${checkIndex}`}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              <span>{check}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}

        {highPriority.length > 0 && (
          <div>
            <h5 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              အရေးပေါ် စစ်ဆေးရန် အဖြစ်အပျက်များ
            </h5>

            <div className="space-y-3">
              {highPriority.map((event, index) => (
                <div
                  key={`${event?.defect_type}-${event?.route_distance_m}-${index}`}
                  className="rounded-xl border border-red-100 bg-red-50/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {event?.defect_type || 'ချို့ယွင်းချက်'}
                    </span>
                    <span className="text-sm text-slate-500">
                      {(event?.rail_side || 'Unknown').toUpperCase()} သံလမ်း ·{' '}
                      {formatDistance(event?.route_distance_m)}
                    </span>
                    <PriorityBadge priority={event?.priority} compact />
                  </div>

                  {event?.assessment && (
                    <p className="mt-2 text-sm leading-6 text-slate-700">{event.assessment}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {typeAssessments.length > 0 && (
          <div>
            <h5 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              ချို့ယွင်းချက်အမျိုးအစား အကဲဖြတ်ချက်
            </h5>

            <div className="grid gap-3 lg:grid-cols-2">
              {typeAssessments.map((item, index) => {
                const meta = getDefectMeta(item?.defect_type);
                return (
                  <div
                    key={`${item?.defect_type}-${index}`}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span>{meta.icon}</span>
                      <p className="font-semibold text-slate-900">
                        {item?.defect_type || 'ချို့ယွင်းချက်'}
                      </p>
                      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {item?.event_count ?? 0} အဖြစ်အပျက်
                      </span>
                    </div>

                    {item?.maintenance_significance && (
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {item.maintenance_significance}
                      </p>
                    )}

                    {item?.recommended_response && (
                      <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                        <span className="font-semibold">အကြံပြုဆောင်ရွက်ချက်: </span>
                        {item.recommended_response}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {factors.length > 0 && (
          <div>
            <h5 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Info className="h-4 w-4 text-slate-500" />
              ဖြစ်နိုင်ခြေရှိသော အထောက်အကူပြုအချက်များ
            </h5>

            <p className="mb-3 text-xs text-slate-400">
              ၎င်းတို့သည် အတည်ပြုထားသော အကြောင်းရင်းများ မဟုတ်ဘဲ ဖြစ်နိုင်ခြေရှိသော အထောက်အကူပြုအချက်များဖြစ်သည်။
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {factors.map((item, index) => (
                <div
                  key={`${item?.defect_type}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="font-semibold text-slate-900">
                    {item?.defect_type || 'ချို့ယွင်းချက်'}
                  </p>

                  {Array.isArray(item?.factors) && item.factors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.factors.map((factor, factorIndex) => (
                        <span
                          key={`${factor}-${factorIndex}`}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                        >
                          {factor}
                        </span>
                      ))}
                    </div>
                  )}

                  {item?.context && (
                    <p className="mt-3 text-sm leading-5 text-slate-600">{item.context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {actions.length > 0 && (
          <div>
            <h5 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Wrench className="h-4 w-4 text-emerald-600" />
              အကြံပြုဆောင်ရွက်ချက်များ
            </h5>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <ol className="space-y-2 text-sm text-slate-700">
                {actions.map((action, index) => (
                  <li key={`${action}-${index}`} className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {advisory?.trend_assessment && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              လမ်းကြောင်းသဘောထား အကဲဖြတ်ချက်
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{advisory.trend_assessment}</p>
          </div>
        )}

        {limitations.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ကန့်သတ်ချက်များ
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              {limitations.map((limitation, index) => (
                <li key={`${limitation}-${index}`}>• {limitation}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">
          AI မှ ထုတ်ပေးသော ထိန်းသိမ်းမှုအကြံပြုချက်။ နောက်ဆုံးပြုပြင်ထိန်းသိမ်းမှု ဆုံးဖြတ်ချက်များကို
          အရည်အချင်းပြည့်မီသော ရထားလမ်းဝန်ထမ်းများနှင့် သက်ဆိုင်ရာ ရထားလမ်းထိန်းသိမ်းမှုစံနှုန်းများဖြင့်
          အတည်ပြုသင့်သည်။
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Inspection event card
// -----------------------------------------------------------------------------

function EventCard({ event, index, selected, onSelect }) {
  const eventId = getEventId(event, index);
  const meta = getDefectMeta(event?.defect_type);
  const coords = getEventCoordinates(event);
  const findings = getSupplementaryFindings(event);

  return (
    <button
      id={`event-${eventId}`}
      type="button"
      onClick={() => onSelect(eventId)}
      className={`w-full rounded-xl border p-4 text-left transition-all duration-200 hover:shadow-md ${
        selected
          ? 'border-blue-300 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
            style={{ backgroundColor: `${meta.color}15` }}
          >
            {meta.icon}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">
                {event?.defect_type || 'အမျိုးအစားမသိ'}
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600">
                {event?.rail_side || 'rail'} သံလမ်း
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>အတည်ပြုနှုန်း {formatConfidence(event?.confidence)}</span>
              <span>အကွာအဝေး {formatDistance(getEventRouteDistance(event))}</span>
              <span>အချိန် {asNumber(event?.start_timestamp, 0).toFixed(1)}s</span>
              <span>{event?.detection_count ?? 0} တွေ့ရှိချက်</span>
            </div>
          </div>
        </div>

        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
      </div>

      {coords && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="h-3.5 w-3.5" />
          {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
        </div>
      )}

      {findings.length > 0 && (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            AI မှ ထပ်ဆောင်း လေ့လာတွေ့ရှိချက်
          </p>

          {findings.map((finding, findingIndex) => (
            <div
              key={`${finding.type}-${findingIndex}`}
              className="text-sm leading-5 text-violet-900"
            >
              {finding.level && (
                <span className="mr-1 font-semibold capitalize">{finding.level}:</span>
              )}
              {finding.description}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------

const InspectionDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [inspections, setInspections] = useState([]);
  const [overviewStats, setOverviewStats] = useState(null);
  const [defectStats, setDefectStats] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogData, setAiDialogData] = useState(null);
  const [aiDialogLoading, setAiDialogLoading] = useState(false);

  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoDialogData, setVideoDialogData] = useState(null);
  const [videoDialogLoading, setVideoDialogLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [stats, defectStatsData, inspectionsData] = await Promise.all([
        inspectionApi.getOverviewStatistics(),
        inspectionApi.getDefectStatistics(),
        inspectionApi.getInspections(20, 0),
      ]);

      setOverviewStats(stats || {});
      setDefectStats(Array.isArray(defectStatsData) ? defectStatsData : []);
      setInspections(Array.isArray(inspectionsData) ? inspectionsData : []);
    } catch (err) {
      console.error(err);
      setError('စစ်ဆေးမှုဒေတာများ ရယူရာတွင် မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await fetchDashboardData();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await inspectionApi.searchInspections(searchQuery.trim());
      setInspections(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error(err);
      setError('စစ်ဆေးမှုရှာဖွေမှု မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (inspectionId) => {
    if (!inspectionId) return;

    setDetailLoading(true);
    setDetailDialogOpen(true);
    setDetailData(null);
    setSelectedEventId(null);
    setError(null);

    try {
      const data = await inspectionApi.getInspectionDetail(inspectionId);
      setDetailData(data);
    } catch (err) {
      console.error(err);
      setError('စစ်ဆေးမှုအသေးစိတ် ရယူရာတွင် မအောင်မြင်ပါ။');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewAiResponse = async (inspectionId) => {
    if (!inspectionId) return;

    setAiDialogOpen(true);
    setAiDialogLoading(true);
    setAiDialogData(null);
    setError(null);

    try {
      const data = await inspectionApi.getInspectionDetail(inspectionId);
      setAiDialogData(data);
    } catch (err) {
      console.error(err);
      setError('AI အကြံပြုချက် ရယူရာတွင် မအောင်မြင်ပါ။');
    } finally {
      setAiDialogLoading(false);
    }
  };

  const handleViewVideos = async (inspectionId) => {
    if (!inspectionId) return;

    setVideoDialogOpen(true);
    setVideoDialogLoading(true);
    setVideoDialogData(null);
    setError(null);

    try {
      const data = await inspectionApi.getInspectionDetail(inspectionId);
      setVideoDialogData(data);
    } catch (err) {
      console.error(err);
      setError('ဗီဒီယိုအချက်အလက် ရယူရာတွင် မအောင်မြင်ပါ။');
    } finally {
      setVideoDialogLoading(false);
    }
  };

  const handleEventSelect = (eventId) => {
    if (!eventId) return;
    setSelectedEventId(eventId);
    window.setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 50);
  };

  const defectChartData = useMemo(
    () =>
      defectStats.map((item) => ({
        name: item?.defect_type || 'Unknown',
        value: asNumber(item?.count, 0),
        confidence: asNumber(item?.avg_confidence, 0),
      })),
    [defectStats]
  );

  const timelineData = useMemo(
    () =>
      [...inspections]
        .reverse()
        .map((inspection) => ({
          date: formatDate(getInspectionCreatedAt(inspection)),
          defects: getInspectionDefectCount(inspection),
          inspection: getInspectionName(inspection),
        })),
    [inspections]
  );

  const completedAiCount = useMemo(
    () => inspections.filter((inspection) => getAiStatus(inspection) === 'completed').length,
    [inspections]
  );

  if (loading && inspections.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6  min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="mt-1 text-sm text-slate-500">
              ချို့ယွင်းချက်ရှာဖွေတွေ့ရှိမှုများ၊ လမ်းကြောင်းတည်နေရာများနှင့် AI ထိန်းသိမ်းမှု အကြံပြုချက်များ
            </p>
          </div>

          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60 shadow-md hover:shadow-lg"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            ဒေတာအသစ်ပြန်လည်ရယူရန်
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mt-6 pt-6 border-t border-gray-100">
          <StatCard
            label="စုစုပေါင်း စစ်ဆေးမှုများ"
            value={overviewStats?.total_inspections ?? inspections.length}
            helper="သိမ်းဆည်းထားသော စစ်ဆေးမှုများ"
            icon={Video}
            tone="blue"
          />

          <StatCard
            label="စုစုပေါင်း ချို့ယွင်းချက်များ"
            value={overviewStats?.total_defects ?? overviewStats?.total_events ?? 0}
            helper="စုစည်းထားသော ချို့ယွင်းချက်များ"
            icon={AlertTriangle}
            tone="red"
          />

          <StatCard
            label="ပျမ်းမျှ အတည်ပြုနှုန်း"
            value={
              defectStats.length
                ? `${(
                    (defectStats.reduce(
                      (sum, item) => sum + asNumber(item?.avg_confidence, 0),
                      0
                    ) /
                      defectStats.length) *
                    100
                  ).toFixed(1)}%`
                : 'N/A'
            }
            helper="ချို့ယွင်းချက်အမျိုးအစားများအလိုက်"
            icon={TrendingUp}
            tone="green"
          />

          <StatCard
            label="AI အကြံပြုချက်များ"
            value={completedAiCount}
            helper={`ဒေတာ ${inspections.length} ခုအနက်`}
            icon={Bot}
            tone="violet"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl px-6">
        <nav className="flex gap-7">
          {[
            { id: 'overview', label: 'ခြုံငုံသုံးသပ်ချက်' },
            { id: 'inspections', label: 'စစ်ဆေးမှုများ' },
            { id: 'analytics', label: 'အချက်အလက်ခွဲခြမ်းစိတ်ဖြာချက်' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900">ချို့ယွင်းချက် ဖြန့်ကျက်မှု</h3>
              <p className="mt-1 text-sm text-slate-500">
                ချို့ယွင်းချက်အမျိုးအစားအလိုက် စုစည်းထားသော အရေအတွက်။
              </p>
            </div>

            {defectChartData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={defectChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {defectChartData.map((entry) => (
                      <Cell key={entry.name} fill={getDefectMeta(entry.name).color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="ချို့ယွင်းချက်အချက်အလက် မရှိပါ" />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900">ပျမ်းမျှ အတည်ပြုနှုန်း</h3>
              <p className="mt-1 text-sm text-slate-500">
                ချို့ယွင်းချက်အမျိုးအစားအလိုက် မော်ဒယ်၏ အတည်ပြုနှုန်း။
              </p>
            </div>

            {defectChartData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={defectChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  />
                  <Tooltip
                    formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                  />
                  <Bar dataKey="confidence" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="အတည်ပြုနှုန်းအချက်အလက် မရှိပါ" />
            )}
          </div>

          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">မကြာသေးမီက စစ်ဆေးမှုများ</h3>
                <p className="mt-1 text-sm text-slate-500">
                  စစ်ဆေးမှုတစ်ခုကို ဖွင့်ရန် ၎င်း၏ အသေးစိတ်နှင့် AI အကြံပြုချက်ကို ကြည့်ရှုပါ။
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('inspections')}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                အားလုံးကြည့်ရန် <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {inspections.slice(0, 6).map((inspection) => {
                const inspectionId = getInspectionId(inspection);
                const advisory = getAiAdvisory(inspection);

                return (
                  <button
                    key={inspectionId}
                    type="button"
                    onClick={() => handleViewDetail(inspectionId)}
                    className="flex w-full items-center gap-4 py-4 text-left hover:bg-slate-50 transition-colors rounded-lg px-2"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                      <Video className="h-5 w-5 text-blue-600" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {getInspectionName(inspection)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(getInspectionCreatedAt(inspection))}
                      </p>
                    </div>

                    <div className="hidden text-right sm:block">
                      <p className="text-sm font-semibold text-red-600">
                        {getInspectionDefectCount(inspection)} ချို့ယွင်းချက်
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDistance(getInspectionDistance(inspection))}
                      </p>
                    </div>

                    {advisory?.overall_priority ? (
                      <PriorityBadge priority={advisory.overall_priority} compact />
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                        အကြံပြုချက်မရှိ
                      </span>
                    )}
                  </button>
                );
              })}

              {inspections.length === 0 && (
                <EmptyState title="စစ်ဆေးမှုများ မတွေ့ရှိပါ" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspections */}
      {activeTab === 'inspections' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                placeholder="စစ်ဆေးမှု၊ GPX ဖိုင် သို့မဟုတ် ချို့ယွင်းချက်အမျိုးအစားဖြင့် ရှာဖွေပါ..."
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSearch();
                }}
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleSearch}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition shadow-sm"
            >
              ရှာဖွေရန်
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      စစ်ဆေးမှု
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      အကွာအဝေး
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ကြာချိန်
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ချို့ယွင်းချက်များ
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      AI အကြံပြုချက်
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ဖန်တီးချိန်
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      ဆောင်ရွက်ချက်
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {inspections.map((inspection) => {
                    const inspectionId = getInspectionId(inspection);
                    const advisory = getAiAdvisory(inspection);
                    const status = getAiStatus(inspection);

                    return (
                      <tr key={inspectionId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-4">
                          <p className="max-w-[280px] truncate text-sm font-medium text-slate-900">
                            {getInspectionName(inspection)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            ID: {inspectionId || 'N/A'}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-center text-sm text-slate-600">
                          {formatDistance(getInspectionDistance(inspection))}
                        </td>

                        <td className="px-4 py-4 text-center text-sm text-slate-600">
                          {formatDuration(getInspectionDuration(inspection))}
                        </td>

                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            {getInspectionDefectCount(inspection)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-center">
                          {advisory?.overall_priority ? (
                            <PriorityBadge priority={advisory.overall_priority} compact />
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                status === 'failed'
                                  ? 'bg-red-50 text-red-700'
                                  : status === 'processing'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {status || 'မထုတ်ပေးရသေး'}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-center text-xs text-slate-500">
                          {formatDate(getInspectionCreatedAt(inspection))}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleViewDetail(inspectionId)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                            >
                              အသေးစိတ်
                            </button>

                            <button
                              type="button"
                              onClick={() => handleViewAiResponse(inspectionId)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                            >
                              <Bot className="h-3.5 w-3.5" />
                              AI အကြံပြုချက်
                            </button>

                            <button
                              type="button"
                              onClick={() => handleViewVideos(inspectionId)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <PlayCircle className="h-3.5 w-3.5" />
                              ဗီဒီယိုများ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {inspections.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-500">
                        စစ်ဆေးမှုများ မတွေ့ရှိပါ။
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">စစ်ဆေးမှု ချို့ယွင်းချက် အချိန်ဇယား</h3>
            <p className="mt-1 text-sm text-slate-500">
              မကြာသေးမီက ရယူထားသော စစ်ဆေးမှုများတွင် ချို့ယွင်းချက်အရေအတွက်။
            </p>

            <div className="mt-4">
              {timelineData.length ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="defects"
                      stroke="#DC2626"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="အချိန်ဇယားဒေတာ မရှိပါ" />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">ချို့ယွင်းချက် အမျိုးအစားများ</h3>
            <p className="mt-1 text-sm text-slate-500">
              လက်ရှိရှာဖွေတွေ့ရှိမှုစနစ်၏ အမျိုးအစားများ။
            </p>

            <div className="mt-5 space-y-3">
              {Object.entries(DEFECT_META).map(([type, meta]) => {
                const stat = defectStats.find((item) => item?.defect_type === type);

                return (
                  <div
                    key={type}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${meta.color}15` }}
                    >
                      {meta.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {type}
                      </p>
                      <p className="text-xs text-slate-400">
                        {stat?.count ?? 0} အဖြစ်အပျက်
                      </p>
                    </div>

                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {detailDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-start justify-center px-3 py-6 sm:px-6">
            <button
              type="button"
              aria-label="Close inspection details"
              className="fixed inset-0 cursor-default bg-slate-950/55"
              onClick={() => setDetailDialogOpen(false)}
            />

            <div className="relative z-10 w-full max-w-7xl overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">စစ်ဆေးမှု အသေးစိတ်</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ချို့ယွင်းချက်အထောက်အထား၊ လမ်းကြောင်းတည်နေရာနှင့် ထိန်းသိမ်းမှု အကြံပြုချက်
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailDialogOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[88vh] overflow-y-auto p-4 sm:p-6">
                {detailLoading ? (
                  <div className="flex min-h-[420px] items-center justify-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                  </div>
                ) : detailData ? (
                  (() => {
                    const inspection = detailData?.inspection || detailData || {};
                    const events = getInspectionEvents(detailData);
                    const route = getRoute(inspection);
                    const advisory = getAiAdvisory(inspection);
                    const spatial = getAiSpatialSummary(inspection);
                    const inspectionId = getInspectionId(inspection);
                    const gpsCount = events.filter((event) =>
                      getEventCoordinates(event)
                    ).length;

                    return (
                      <div className="space-y-6">
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">စစ်ဆေးမှု</p>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                              {getInspectionName(inspection)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">အကွာအဝေး</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {formatDistance(getInspectionDistance(inspection))}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">ကြာချိန်</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {formatDuration(getInspectionDuration(inspection))}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">ချို့ယွင်းချက်များ</p>
                            <p className="mt-1 text-sm font-semibold text-red-600">
                              {events.length}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">GPS ပါသော</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {gpsCount}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs text-slate-500">AI ဦးစားပေး</p>
                            <div className="mt-1">
                              {advisory?.overall_priority ? (
                                <PriorityBadge priority={advisory.overall_priority} compact />
                              ) : (
                                <span className="text-sm font-medium text-slate-400">N/A</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Route */}
                        {route && (
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-blue-600" />
                              <h4 className="text-sm font-semibold text-slate-900">
                                လမ်းကြောင်းအချက်အလက်
                              </h4>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">
                              <div>
                                <p className="text-xs text-slate-500">အကွာအဝေး</p>
                                <p className="mt-1 font-medium text-slate-800">
                                  {formatDistance(route?.distance_m)}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">အမှတ်များ</p>
                                <p className="mt-1 font-medium text-slate-800">
                                  {route?.point_count ?? getInspectionPointCount(inspection) ?? 'N/A'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">စတင်ရာ</p>
                                <p className="mt-1 text-xs font-medium text-slate-800">
                                  {route?.start?.latitude != null &&
                                  route?.start?.longitude != null
                                    ? `${Number(route.start.latitude).toFixed(
                                        6
                                      )}, ${Number(route.start.longitude).toFixed(
                                        6
                                      )}`
                                    : 'N/A'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">အဆုံးသတ်</p>
                                <p className="mt-1 text-xs font-medium text-slate-800">
                                  {route?.end?.latitude != null &&
                                  route?.end?.longitude != null
                                    ? `${Number(route.end.latitude).toFixed(
                                        6
                                      )}, ${Number(route.end.longitude).toFixed(
                                        6
                                      )}`
                                    : 'N/A'}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">စစ်ဆေးမှု ID</p>
                                <p className="mt-1 truncate text-xs font-medium text-slate-800">
                                  {inspectionId || 'N/A'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* AI advisory */}
                        <AiAdvisoryPanel inspection={inspection} />

                        {/* Map + spatial summary */}
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="h-[470px]">
                              <DefectMap
                                events={events}
                                selectedEventId={selectedEventId}
                                onMarkerClick={handleEventSelect}
                                route={route}
                              />
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold text-slate-900">
                                  တည်နေရာအလိုက် အကျဉ်းချုပ်
                                </h4>
                                <p className="mt-1 text-xs text-slate-500">
                                  လမ်းကြောင်းအကွာအဝေးများအလိုက် စုစည်းထားမှု
                                </p>
                              </div>
                              <Layers className="h-5 w-5 text-slate-400" />
                            </div>

                            {spatial ? (
                              <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-xs text-slate-500">
                                      အဖြစ်အပျက် / ၁၀ မီတာ
                                    </p>
                                    <p className="mt-1 text-lg font-bold text-slate-900">
                                      {spatial?.events_per_10m ?? 'N/A'}
                                    </p>
                                  </div>

                                  <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-xs text-slate-500">
                                      အစုအဝေးများ
                                    </p>
                                    <p className="mt-1 text-lg font-bold text-slate-900">
                                      {spatial?.clusters?.length ?? 0}
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {(spatial?.clusters || []).map(
                                    (cluster, index) => (
                                      <div
                                        key={`${cluster?.rail_side}-${cluster?.start_distance_m}-${index}`}
                                        className="rounded-xl border border-slate-200 p-3"
                                      >
                                        <p className="text-sm font-semibold text-slate-800">
                                          {(cluster?.rail_side || 'Unknown').toUpperCase()}{' '}
                                          သံလမ်း
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {formatDistance(cluster?.start_distance_m)} →{' '}
                                          {formatDistance(cluster?.end_distance_m)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                          {cluster?.event_count ?? 0} အဖြစ်အပျက် ·{' '}
                                          {Object.entries(cluster?.defect_counts || {})
                                            .map(([type, count]) => `${type}: ${count}`)
                                            .join(' · ')}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>

                                {spatial?.important_note && (
                                  <p className="text-xs leading-5 text-slate-400">
                                    {spatial.important_note}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-4">
                                <EmptyState
                                  title="တည်နေရာအလိုက် အကျဉ်းချုပ် မရှိပါ"
                                  description="စစ်ဆေးမှုအသေးစိတ်တွင် ai_spatial_summary မပါဝင်ပါ။"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Events */}
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                တွေ့ရှိထားသော ချို့ယွင်းချက်များ
                              </h4>
                              <p className="mt-1 text-sm text-slate-500">
                                အဖြစ်အပျက်တစ်ခုကို ရွေးချယ်ရန် ၎င်း၏ မြေပုံပေါ်ရှိ အမှတ်အသားကို
                                မီးမောင်းထိုးပြသည်။
                              </p>
                            </div>

                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              {events.length} အဖြစ်အပျက်
                            </span>
                          </div>

                          {events.length ? (
                            <div className="grid gap-3 lg:grid-cols-2">
                              {events.map((event, index) => {
                                const eventId = getEventId(event, index);

                                return (
                                  <EventCard
                                    key={eventId}
                                    event={event}
                                    index={index}
                                    selected={selectedEventId === eventId}
                                    onSelect={handleEventSelect}
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            <EmptyState
                              title="ချို့ယွင်းချက်များ မတွေ့ရှိပါ"
                              description="ဤစစ်ဆေးမှုတွင် ချို့ယွင်းချက်အဖြစ်အပျက်များ မပါဝင်ပါ။"
                            />
                          )}
                        </section>
                      </div>
                    );
                  })()
                ) : (
                  <EmptyState
                    title="စစ်ဆေးမှုအသေးစိတ် မရှိပါ"
                    description="စစ်ဆေးမှုအသေးစိတ်တောင်းဆိုမှုမှ ဒေတာမပြန်လာပါ။"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Focused AI Response dialog */}
      {aiDialogOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex min-h-screen items-start justify-center px-3 py-6 sm:px-6">
            <button
              type="button"
              aria-label="Close AI response"
              className="fixed inset-0 cursor-default bg-slate-950/55"
              onClick={() => setAiDialogOpen(false)}
            />

            <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                    <Bot className="h-5 w-5 text-violet-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">AI ထိန်းသိမ်းမှု တုံ့ပြန်ချက်</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      ဤစစ်ဆေးမှုအတွက် သိမ်းဆည်းထားသော Qwen ထိန်းသိမ်းမှု အကြံပြုချက်
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAiDialogOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[86vh] overflow-y-auto p-4 sm:p-6">
                {aiDialogLoading ? (
                  <div className="flex min-h-[340px] items-center justify-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-violet-600" />
                  </div>
                ) : aiDialogData ? (
                  <AiAdvisoryPanel inspection={aiDialogData?.inspection || aiDialogData} />
                ) : (
                  <EmptyState
                    title="AI အကြံပြုချက် မရှိပါ"
                    description="စစ်ဆေးမှုအသေးစိတ်မှ အကြံပြုချက် မပြန်လာပါ။"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspected output videos dialog */}
      {videoDialogOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex min-h-screen items-start justify-center px-3 py-6 sm:px-6">
            <button
              type="button"
              aria-label="Close videos"
              className="fixed inset-0 cursor-default bg-slate-950/55"
              onClick={() => setVideoDialogOpen(false)}
            />

            <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                    <FileVideo2 className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">စစ်ဆေးမှု ဗီဒီယိုများ</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      ဘယ်ဘက်နှင့် ညာဘက် သံလမ်းစစ်ဆေးမှု ဗီဒီယိုများ
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setVideoDialogOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[86vh] overflow-y-auto p-4 sm:p-6">
                {videoDialogLoading ? (
                  <div className="flex min-h-[340px] items-center justify-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                  </div>
                ) : videoDialogData ? (
                  (() => {
                    const inspection = videoDialogData?.inspection || videoDialogData || {};
                    const videos = getInspectionVideoSources(inspection);

                    const videoItems = [
                      { key: 'left', title: 'ဘယ်ဘက် သံလမ်း', data: videos.left },
                      { key: 'right', title: 'ညာဘက် သံလမ်း', data: videos.right },
                    ];

                    return (
                      <div className="space-y-5">
                        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {getInspectionName(inspection)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>
                              စစ်ဆေးမှု ID: {getInspectionId(inspection) || 'N/A'}
                            </span>
                            <span>
                              အကွာအဝေး: {formatDistance(getInspectionDistance(inspection))}
                            </span>
                            <span>
                              ဖန်တီးချိန်: {formatDate(getInspectionCreatedAt(inspection))}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-5 lg:grid-cols-2">
                          {videoItems.map((item) => (
                            <div
                              key={item.key}
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                            >
                              <div className="border-b border-slate-100 px-4 py-3">
                                <h4 className="font-semibold text-slate-900">
                                  {item.title}
                                </h4>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  စစ်ဆေးမှုရလဒ် ဗီဒီယို
                                </p>
                              </div>

                              <div className="p-4">
                                {item.data?.url ? (
                                  <>
                                    <video
                                      controls
                                      preload="metadata"
                                      className="aspect-video w-full rounded-xl bg-black"
                                      src={item.data.url}
                                    >
                                      သင့်ဘရောင်ဇာသည် HTML ဗီဒီယိုကို မပံ့ပိုးပါ။
                                    </video>

                                    <a
                                      href={item.data.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
                                    >
                                      ဗီဒီယိုဖွင့်ရန်
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </>
                                ) : (
                                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
                                    <FileVideo2 className="mb-3 h-8 w-8 text-slate-300" />
                                    <p className="text-sm font-semibold text-slate-700">
                                      ကြည့်ရှုနိုင်သော URL မရှိပါ
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      ဤစစ်ဆေးမှုသည် ဆာဗာပေါ်တွင် ဖိုင်လမ်းကြောင်းကိုသာ သိမ်းဆည်းထားနိုင်သည်။
                                      ဗီဒီယိုကိုကြည့်ရန် ဆာဗာမှ HTTP မီဒီယာ endpoint သို့မဟုတ်
                                      cloud-storage URL မှတစ်ဆင့် ထုတ်ပေးရန် လိုအပ်သည်။
                                    </p>

                                    {item.data?.storedPath && (
                                      <div className="mt-3 rounded-lg bg-white p-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                          သိမ်းဆည်းထားသော မီဒီယာလမ်းကြောင်း
                                        </p>
                                        <p className="mt-1 break-all font-mono text-xs text-slate-600">
                                          {item.data.storedPath}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <EmptyState
                    title="ဗီဒီယိုအချက်အလက် မရှိပါ"
                    description="စစ်ဆေးမှုအသေးစိတ်မှ မီဒီယာအချက်အလက် မပြန်လာပါ။"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionDashboard;