import React, { useEffect, useMemo } from 'react';
import L from 'leaflet';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasCoordinates = (latitude, longitude) => {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  return (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

const defectIcon = L.divIcon({
  className: 'track-defect-location-marker',
  html: `
    <div
      class="track-defect-location-marker-inner"
      role="img"
      aria-label="Defect location"
    >
      🔻
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 33],
  popupAnchor: [0, -31],
});

export const calculateDistanceMeters = (from, to) => {
  if (
    !from ||
    !to ||
    !hasCoordinates(from.latitude, from.longitude) ||
    !hasCoordinates(to.latitude, to.longitude)
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const lat1 = toRadians(Number(from.latitude));
  const lat2 = toRadians(Number(to.latitude));
  const deltaLat = toRadians(Number(to.latitude) - Number(from.latitude));
  const deltaLng = toRadians(Number(to.longitude) - Number(from.longitude));

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

export const calculateBearing = (from, to) => {
  if (
    !from ||
    !to ||
    !hasCoordinates(from.latitude, from.longitude) ||
    !hasCoordinates(to.latitude, to.longitude)
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(Number(from.latitude));
  const lat2 = toRadians(Number(to.latitude));
  const deltaLng = toRadians(Number(to.longitude) - Number(from.longitude));

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};

export const bearingLabel = (bearing) => {
  if (!Number.isFinite(bearing)) return null;

  const directions = [
    'မြောက်ဘက်',
    'အရှေ့မြောက်ဘက်',
    'အရှေ့ဘက်',
    'အရှေ့တောင်ဘက်',
    'တောင်ဘက်',
    'အနောက်တောင်ဘက်',
    'အနောက်ဘက်',
    'အနောက်မြောက်ဘက်',
  ];

  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

export const formatMapDistance = (meters) => {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} မီတာ`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} ကီလိုမီတာ`;
};

const MapViewport = ({ defectPosition, engineerPosition }) => {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (engineerPosition) {
        map.fitBounds([defectPosition, engineerPosition], {
          padding: [36, 36],
          maxZoom: 18,
        });
      } else {
        map.setView(defectPosition, 17);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [defectPosition, engineerPosition, map]);

  return null;
};

const DefectLocationMap = ({ issue, engineerLocation }) => {
  const defectPosition = useMemo(() => {
    if (!hasCoordinates(issue?.latitude, issue?.longitude)) return null;
    return [Number(issue.latitude), Number(issue.longitude)];
  }, [issue?.latitude, issue?.longitude]);

  const engineerPosition = useMemo(() => {
    if (
      !engineerLocation ||
      !hasCoordinates(engineerLocation.latitude, engineerLocation.longitude)
    ) {
      return null;
    }

    return [
      Number(engineerLocation.latitude),
      Number(engineerLocation.longitude),
    ];
  }, [engineerLocation]);

  if (!defectPosition) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 px-5 text-center text-sm text-amber-800">
        ဤတွေ့ရှိချက်တွင် မှန်ကန်သော GPS တည်နေရာ မရှိသေးသဖြင့် မြေပုံပေါ်တွင် မပြနိုင်ပါ။
      </div>
    );
  }

  return (
    <>
      <style>{`
        .track-defect-location-marker {
          background: transparent !important;
          border: none !important;
        }

        .track-defect-location-marker-inner {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          line-height: 1;
          transform-origin: center bottom;
          user-select: none;
          pointer-events: auto;
          animation: track-defect-bounce 0.9s ease-in-out infinite;
          filter: drop-shadow(0 4px 5px rgba(153, 27, 27, 0.45));
        }

        @keyframes track-defect-bounce {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-10px) scale(1.05);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .track-defect-location-marker-inner {
            animation: none;
          }
        }
      `}</style>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div className="h-64 w-full sm:h-72">
          <MapContainer
            center={defectPosition}
            zoom={17}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <MapViewport
              defectPosition={defectPosition}
              engineerPosition={engineerPosition}
            />

            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Marker
              position={defectPosition}
              icon={defectIcon}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="text-sm">
                  <strong>တွေ့ရှိချက် တည်နေရာ</strong>
                  <div className="mt-1 text-xs">
                    {Number(issue.latitude).toFixed(6)}, {Number(issue.longitude).toFixed(6)}
                  </div>
                </div>
              </Popup>
            </Marker>

            {engineerPosition && (
              <>
                <Polyline
                  positions={[engineerPosition, defectPosition]}
                  pathOptions={{
                    color: '#2563eb',
                    weight: 4,
                    opacity: 0.75,
                    dashArray: '8, 8',
                  }}
                />

                {Number.isFinite(Number(engineerLocation?.accuracy)) && (
                  <Circle
                    center={engineerPosition}
                    radius={Math.max(Number(engineerLocation.accuracy), 1)}
                    pathOptions={{
                      color: '#2563eb',
                      fillColor: '#3b82f6',
                      fillOpacity: 0.08,
                      weight: 1,
                    }}
                  />
                )}

                <CircleMarker
                  center={engineerPosition}
                  radius={9}
                  pathOptions={{
                    color: '#1e3a8a',
                    fillColor: '#2563eb',
                    fillOpacity: 0.95,
                    weight: 3,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>အင်ဂျင်နီယာ၏ လက်ရှိတည်နေရာ</strong>
                      {Number.isFinite(Number(engineerLocation?.accuracy)) && (
                        <div className="mt-1 text-xs">
                          GPS တိကျမှု ±{Math.round(Number(engineerLocation.accuracy))} မီတာ
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              </>
            )}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-base leading-none">🔻</span>
            ချို့ယွင်းချက် တည်နေရာ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            သင့်တည်နေရာ
          </span>
          <span className="text-slate-400">မြေပုံကို ဆွဲရွှေ့/ချဲ့/ချုံ့နိုင်သည်</span>
        </div>
      </div>
    </>
  );
};

export default DefectLocationMap;