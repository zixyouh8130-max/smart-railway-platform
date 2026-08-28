import React, { useEffect, useMemo, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { formatRailwayTime } from '@/utils/railwayDateTime';

const DEFAULT_CENTER = [21.9162, 95.9560];

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const sameId = (left, right) => (
  left != null && right != null && Number(left) === Number(right)
);

const getPoint = (value) => {
  const latitude = numberOrNull(value?.latitude);
  const longitude = numberOrNull(value?.longitude);
  return latitude === null || longitude === null
    ? null
    : [latitude, longitude];
};

const samePoint = (a, b) => (
  Array.isArray(a)
  && Array.isArray(b)
  && Math.abs(a[0] - b[0]) < 0.000001
  && Math.abs(a[1] - b[1]) < 0.000001
);

/**
 * Focus the first map load on the passenger's boarding context instead of
 * always zooming to the entire route. After that initial focus, polling
 * updates should not keep stealing the user's map position.
 */
const FocusJourneyMap = ({
  focusKey,
  boardingPoint,
  trainPoint,
  nextPoint,
  routePoints,
}) => {
  const map = useMap();
  const focusedKeyRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (focusedKeyRef.current === focusKey) return;
      focusedKeyRef.current = focusKey;

      // Best passenger experience: show boarding station and live train
      // together when both locations are known.
      if (boardingPoint && trainPoint && !samePoint(boardingPoint, trainPoint)) {
        map.fitBounds([boardingPoint, trainPoint], {
          padding: [34, 34],
          maxZoom: 12,
        });
        return;
      }

      if (boardingPoint) {
        map.setView(boardingPoint, 13);
        return;
      }

      if (trainPoint && nextPoint && !samePoint(trainPoint, nextPoint)) {
        map.fitBounds([trainPoint, nextPoint], {
          padding: [34, 34],
          maxZoom: 12,
        });
        return;
      }

      if (trainPoint) {
        map.setView(trainPoint, 12);
        return;
      }

      if (routePoints.length === 1) {
        map.setView(routePoints[0], 12);
      } else if (routePoints.length > 1) {
        map.fitBounds(routePoints, {
          padding: [24, 24],
          maxZoom: 11,
        });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [
    map,
    focusKey,
    boardingPoint,
    trainPoint,
    nextPoint,
    routePoints,
  ]);

  return null;
};

const TicketJourneyMap = ({ journey, className = '' }) => {
  const stops = journey?.stops || [];

  const plottedStops = useMemo(
    () => stops
      .map((stop) => ({ ...stop, point: getPoint(stop) }))
      .filter((stop) => stop.point),
    [stops],
  );

  const routePoints = useMemo(
    () => plottedStops.map((stop) => stop.point),
    [plottedStops],
  );

  const boardingStop = useMemo(
    () => stops.find((stop) => stop.is_boarding_station) || null,
    [stops],
  );

  const boardingPlottedStop = useMemo(
    () => plottedStops.find(
      (stop) => sameId(stop.route_station_id, boardingStop?.route_station_id),
    ) || null,
    [boardingStop, plottedStops],
  );

  const boardingPoint = boardingPlottedStop?.point || null;
  const trainPoint = useMemo(
    () => getPoint(journey?.train_location),
    [journey?.train_location],
  );

  const nextPlottedStop = useMemo(
    () => plottedStops.find(
      (stop) => sameId(
        stop.route_station_id,
        journey?.next_station?.route_station_id,
      ),
    ) || null,
    [journey?.next_station?.route_station_id, plottedStops],
  );
  const nextPoint = nextPlottedStop?.point || null;

  const currentStationId = journey?.schedule_status === 'COMPLETED'
    ? null
    : journey?.current_station?.route_station_id;

  const progressOrder = (
    journey?.current_station?.order_number
    ?? journey?.last_reached?.order_number
    ?? 0
  );

  const completedPoints = useMemo(
    () => plottedStops
      .filter((stop) => Number(stop.order_number) <= Number(progressOrder))
      .map((stop) => stop.point),
    [plottedStops, progressOrder],
  );

  const activeSegment = useMemo(() => {
    if (journey?.schedule_status !== 'ACTIVE' || !nextPoint) return [];

    // Prefer the exact live train GPS. Fall back to the current/last station
    // coordinates when a device has not sent a location yet.
    if (trainPoint) return [trainPoint, nextPoint];

    const fromId = (
      journey?.current_station?.route_station_id
      ?? journey?.last_reached?.route_station_id
    );
    const from = plottedStops.find(
      (stop) => sameId(stop.route_station_id, fromId),
    );

    return from?.point ? [from.point, nextPoint] : [];
  }, [journey, nextPoint, plottedStops, trainPoint]);

  const statusKind = (stop) => {
    if (
      currentStationId
      && sameId(stop.route_station_id, currentStationId)
    ) {
      return 'current';
    }

    if (
      stop.status === 'DEPARTED'
      || (
        journey?.schedule_status === 'COMPLETED'
        && stop.status === 'ARRIVED'
      )
    ) {
      return 'arrived';
    }

    if (stop.status === 'ARRIVED') return 'current';
    return 'upcoming';
  };

  const markerStyle = (kind) => {
    switch (kind) {
      case 'arrived':
        return { color: '#15803d', fillColor: '#22c55e', radius: 7 };
      case 'current':
        return { color: '#1d4ed8', fillColor: '#3b82f6', radius: 10 };
      default:
        return { color: '#64748b', fillColor: '#cbd5e1', radius: 7 };
    }
  };

  const mapCenter = boardingPoint || trainPoint || routePoints[0] || DEFAULT_CENTER;
  const canRenderMap = Boolean(trainPoint || routePoints.length);
  const boardingCoordinatesMissing = Boolean(boardingStop && !boardingPoint);

  if (!canRenderMap) {
    return (
      <div
        className={`aspect-square w-full rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center p-5 text-center ${className}`}
      >
        <div>
          <p className="font-semibold text-gray-700">လမ်းကြောင်းမြေပုံ မပြနိုင်သေးပါ</p>
          <p className="text-xs text-gray-500 mt-1">
            {boardingStop
              ? `${boardingStop.station_name} ဘူတာ၏ လတ္တီကျု/လောင်ဂျီကျု တည်နေရာကို သတ်မှတ်ပါ။ အခြားလမ်းကြောင်းဘူတာများ၏ တည်နေရာကိုလည်း သတ်မှတ်ထားပါက မြေပုံပိုမိုပြည့်စုံပါမည်။`
              : 'တိုက်ရိုက်ခရီးစဉ်မြေပုံ ပြရန် လမ်းကြောင်းပေါ်ရှိ ဘူတာများ၏ လတ္တီကျု/လောင်ဂျီကျု တည်နေရာကို သတ်မှတ်ပါ။'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <MapContainer
        center={mapCenter}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FocusJourneyMap
          focusKey={`${journey?.schedule_id || 'schedule'}:${boardingStop?.route_station_id || 'no-boarding'}:${boardingPoint ? 'boarding-coords' : 'no-boarding-coords'}`}
          boardingPoint={boardingPoint}
          trainPoint={trainPoint}
          nextPoint={nextPoint}
          routePoints={routePoints}
        />

        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: '#94a3b8',
              weight: 4,
              opacity: 0.75,
              dashArray: '8 8',
            }}
          />
        )}

        {completedPoints.length > 1 && (
          <Polyline
            positions={completedPoints}
            pathOptions={{
              color: '#16a34a',
              weight: 5,
              opacity: 0.9,
            }}
          />
        )}

        {activeSegment.length > 1 && (
          <Polyline
            positions={activeSegment}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              opacity: 0.9,
            }}
          />
        )}

        {plottedStops.map((stop) => {
          const kind = statusKind(stop);
          const style = markerStyle(kind);
          const isNext = sameId(
            journey?.next_station?.route_station_id,
            stop.route_station_id,
          );
          const isBoarding = Boolean(stop.is_boarding_station);

          return (
            <CircleMarker
              key={stop.route_station_id}
              center={stop.point}
              pathOptions={{
                color: isBoarding ? '#d97706' : style.color,
                fillColor: style.fillColor,
                fillOpacity: 1,
                weight: isBoarding ? 5 : isNext ? 4 : 2,
              }}
              radius={style.radius + (isBoarding ? 4 : isNext ? 2 : 0)}
            >
              {isBoarding && (
                <Tooltip permanent direction="top" offset={[0, -8]}>
                  တက်ရမည့်ဘူတာ: {stop.station_name}
                </Tooltip>
              )}
              <Popup>
                <div className="min-w-[180px] text-sm">
                  <p className="font-semibold">{stop.station_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isBoarding
                      ? 'သင်တက်ရမည့် ဘူတာ'
                      : kind === 'current'
                        ? 'လက်ရှိ ဘူတာ'
                        : kind === 'arrived'
                          ? 'ရောက်ရှိ / ဖြတ်သန်းပြီး'
                          : isNext
                            ? 'နောက်တစ်ဘူတာ'
                            : 'မရောက်သေးသော ဘူတာ'}
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    {stop.expected_arrival && (
                      <p>မျှော်မှန်းရောက်ချိန်: {stop.expected_arrival}</p>
                    )}
                    {stop.actual_arrival && (
                      <p>အမှန်တကယ်ရောက်ချိန်: {formatRailwayTime(stop.actual_arrival, 'my-MM')}</p>
                    )}
                    {isNext && journey?.next_station?.estimated_arrival && (
                      <p className="font-medium text-blue-700">
                        ခန့်မှန်းရောက်ချိန်: {formatRailwayTime(journey.next_station.estimated_arrival, 'my-MM')}
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {trainPoint && (
          <CircleMarker
            center={trainPoint}
            pathOptions={{
              color: '#991b1b',
              fillColor: '#ef4444',
              fillOpacity: 1,
              weight: 3,
            }}
            radius={9}
          >
            <Popup>
              <div className="min-w-[170px] text-sm">
                <p className="font-semibold">ရထား၏ လက်ရှိတည်နေရာ</p>
                {journey?.next_station?.station_name && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {journey.next_station.station_name} ဘူတာသို့ ဦးတည်နေသည်
                  </p>
                )}
                <div className="mt-2 text-xs space-y-1">
                  {journey?.train_location?.speed_mph != null && (
                    <p>အမြန်နှုန်း: {Number(journey.train_location.speed_mph).toFixed(1)} မိုင်/နာရီ</p>
                  )}
                  {journey?.train_location?.updated_at && (
                    <p>နောက်ဆုံးအပ်ဒိတ်: {formatRailwayTime(journey.train_location.updated_at, 'my-MM')}</p>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {boardingCoordinatesMissing && (
        <div className="absolute top-3 left-3 right-3 z-[500] rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] text-amber-900 shadow-sm">
          တက်ရမည့် <strong>{boardingStop.station_name}</strong> ဘူတာ၏ လတ္တီကျု/လောင်ဂျီကျု တည်နေရာ မသတ်မှတ်ရသေးပါ။ လက်ရှိတွင် ရထားနှင့် တည်နေရာရှိသော အခြားဘူတာများကိုသာ ပြထားပါသည်။
        </div>
      )}

      <div className="absolute left-3 bottom-3 z-[500] rounded-xl bg-white/95 px-3 py-2 shadow-sm border border-gray-200 text-[11px] text-gray-700">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> ရထား
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> ရောက်ရှိပြီး
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> လက်ရှိဘူတာ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-500" /> မရောက်သေး
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-100 border-2 border-amber-600" /> တက်ရမည့်ဘူတာ
          </span>
        </div>
      </div>
    </div>
  );
};

export default TicketJourneyMap;
