import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Bot,
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  ShieldAlert,
  X,
} from 'lucide-react';
import FieldVerificationForm from './FieldVerificationForm';
import MaintenanceForm from './MaintenanceForm';
import DefectLocationMap, {
  bearingLabel,
  calculateBearing,
  calculateDistanceMeters,
  formatMapDistance,
} from './DefectLocationMap';
import {
  defectTypeLabel,
  formatDistanceFromStart,
  priorityClasses,
  priorityLabel,
  proximityLabel,
  railSideLabel,
} from './kanbanUtils';

const permissionLabel = (state) => {
  if (state === 'granted') return 'ခွင့်ပြုပြီး';
  if (state === 'denied') return 'ပိတ်ထားသည်';
  if (state === 'prompt') return 'ခွင့်ပြုချက်တောင်းရန်';
  return 'မသိရသေး';
};

const geolocationErrorMessage = (geoError) => {
  if (!geoError) return 'လက်ရှိတည်နေရာကို မရယူနိုင်ပါ။';

  if (geoError.code === 1) {
    return 'တည်နေရာအသုံးပြုခွင့်ကို Browser တွင် ပိတ်ထားသည်။ Address bar ဘေးရှိ Site settings → Location ကို Allow ပြောင်းပြီး ထပ်စမ်းပါ။';
  }

  if (geoError.code === 2) {
    return 'GPS တည်နေရာကို ယခုအချိန်တွင် မရနိုင်ပါ။ GPS/Wi‑Fi ကို ဖွင့်ထားကြောင်း စစ်ဆေးပြီး အပြင်ဘက် သို့မဟုတ် signal ကောင်းသည့်နေရာတွင် ထပ်စမ်းပါ။';
  }

  if (geoError.code === 3) {
    return 'GPS တည်နေရာရယူရန် အချိန်ကျော်သွားသည်။ Signal ကောင်းသည့်နေရာသို့ ရွှေ့ပြီး ထပ်စမ်းပါ။';
  }

  return geoError.message || 'လက်ရှိတည်နေရာကို မရယူနိုင်ပါ။';
};

const DefectDetailPanel = ({
  issue,
  open,
  onClose,
  onOpenAI,
  onCheckLocation,
  onVerify,
  onUpdateMaintenance,
}) => {
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationRecording, setLocationRecording] = useState(false);
  const [engineerLocation, setEngineerLocation] = useState(null);
  const [permissionState, setPermissionState] = useState('unknown');
  const [locationError, setLocationError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [error, setError] = useState('');
  const autoRequestedIssueRef = useRef(null);

  const defectLocation = useMemo(() => {
    const latitude = Number(issue?.latitude);
    const longitude = Number(issue?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  }, [issue?.latitude, issue?.longitude]);

  const distanceToDefect = useMemo(
    () => calculateDistanceMeters(engineerLocation, defectLocation),
    [engineerLocation, defectLocation],
  );

  const bearingToDefect = useMemo(
    () => calculateBearing(engineerLocation, defectLocation),
    [engineerLocation, defectLocation],
  );

  const requestCurrentPosition = useCallback(
    ({ recordBackendCheck = false } = {}) => {
      setLocationError('');
      setLocationNotice('');

      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setLocationError(
          'Browser GPS ကို HTTPS (သို့) localhost တွင်သာ အသုံးပြုနိုင်သည်။ Deployment URL ကို HTTPS ဖြင့် ဖွင့်ပြီး ထပ်စမ်းပါ။',
        );
        return;
      }

      if (!navigator.geolocation) {
        setLocationError('ဤ Browser သည် တည်နေရာရယူခြင်းကို မပံ့ပိုးပါ။');
        return;
      }

      if (recordBackendCheck) setLocationRecording(true);
      else setLocationLoading(true);

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };

          setEngineerLocation(current);
          setPermissionState('granted');

          if (Number(position.coords.accuracy) > 100) {
            setLocationNotice(
              `GPS တိကျမှု ±${Math.round(
                position.coords.accuracy,
              )} မီတာ ဖြစ်သောကြောင့် On-site အဖြစ် အတည်ပြုရန် မလုံလောက်နိုင်ပါ။ ဖုန်း GPS သို့မဟုတ် အပြင်ဘက် signal ကောင်းသည့်နေရာကို အသုံးပြုပါ။`,
            );
          }

          if (recordBackendCheck) {
            try {
              await onCheckLocation?.({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy_meters: position.coords.accuracy,
              });
            } catch (err) {
              setLocationError(
                err?.response?.data?.detail ||
                  err?.message ||
                  'တည်နေရာ စစ်ဆေးမှုကို server သို့ မသိမ်းဆည်းနိုင်ပါ။',
              );
            }
          }

          setLocationLoading(false);
          setLocationRecording(false);
        },
        (geoError) => {
          if (geoError?.code === 1) setPermissionState('denied');
          setLocationError(geolocationErrorMessage(geoError));
          setLocationLoading(false);
          setLocationRecording(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    },
    [onCheckLocation],
  );

  useEffect(() => {
    if (!open || !issue?.id) return undefined;

    setLocationError('');
    setLocationNotice('');

    if (autoRequestedIssueRef.current === issue.id) return undefined;
    autoRequestedIssueRef.current = issue.id;

    let cancelled = false;
    let permissionStatus = null;

    const requestPermissionAndPosition = async () => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setLocationError(
          'Browser GPS ကို HTTPS (သို့) localhost တွင်သာ အသုံးပြုနိုင်သည်။ Deployment URL ကို HTTPS ဖြင့် ဖွင့်ပါ။',
        );
        return;
      }

      if (!navigator.geolocation) {
        setLocationError('ဤ Browser သည် တည်နေရာရယူခြင်းကို မပံ့ပိုးပါ။');
        return;
      }

      if (navigator.permissions?.query) {
        try {
          permissionStatus = await navigator.permissions.query({
            name: 'geolocation',
          });

          if (cancelled) return;
          setPermissionState(permissionStatus.state);

          permissionStatus.onchange = () => {
            if (!cancelled) setPermissionState(permissionStatus.state);
          };

          if (permissionStatus.state === 'denied') {
            setLocationError(
              'တည်နေရာအသုံးပြုခွင့်ကို Browser တွင် ပိတ်ထားသည်။ Site settings → Location → Allow ပြောင်းပြီး ထပ်စမ်းပါ။',
            );
            return;
          }
        } catch {
          // Some browsers expose geolocation but not the Permissions API.
        }
      }

      // Opening a finding requests location so the map can immediately show
      // the engineer relative to the AI defect. It does NOT write an audit
      // location check until the engineer presses the explicit check button.
      requestCurrentPosition({ recordBackendCheck: false });
    };

    requestPermissionAndPosition();

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [issue?.id, open, requestCurrentPosition]);

  useEffect(() => {
    if (!open) {
      autoRequestedIssueRef.current = null;
    }
  }, [open]);

  if (!open || !issue) return null;

  const distance = formatDistanceFromStart(issue.distance_from_start_miles);
  const formattedDistanceToDefect = formatMapDistance(distanceToDefect);
  const directionToDefect = bearingLabel(bearingToDefect);
  const gpsAccuracy = Number(engineerLocation?.accuracy);

  const osmHref = defectLocation
    ? `https://www.openstreetmap.org/?mlat=${defectLocation.latitude}&mlon=${defectLocation.longitude}#map=18/${defectLocation.latitude}/${defectLocation.longitude}`
    : null;

  return (
    <div className="fixed inset-0 z-[70]" lang="my">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/35"
        aria-label="တွေ့ရှိချက် အသေးစိတ်ပိတ်ရန်"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="pr-4">
            <p className="text-xs text-slate-400">တွေ့ရှိချက်</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {defectTypeLabel(issue.defect_type)}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="ပိတ်ရန်"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${priorityClasses(
                  issue.ai_priority,
                )}`}
              >
                {priorityLabel(issue.ai_priority || 'ROUTINE')}
              </span>

              {issue.rail_side && (
                <span className="text-sm text-slate-600">
                  {railSideLabel(issue.rail_side)}
                </span>
              )}
            </div>

            {distance && <p className="mt-3 text-sm text-slate-600">{distance}</p>}

            {defectLocation && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-emerald-600" />
                AI တွေ့ရှိချက်တွင် GPS တည်နေရာ ရှိသည်
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenAI?.(issue)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <Bot className="h-4 w-4" />
            AI တွေ့ရှိချက် သုံးသပ်ရန်
          </button>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-slate-600" />
                <h4 className="font-semibold text-slate-900">ချို့ယွင်းချက် တည်နေရာမြေပုံ</h4>
              </div>

              {osmHref && (
                <a
                  href={osmHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
                >
                  OpenStreetMap တွင်ဖွင့်ရန်
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <DefectLocationMap
              issue={issue}
              engineerLocation={engineerLocation}
            />

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">တည်နေရာခွင့်ပြုချက်</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {permissionLabel(permissionState)}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">GPS တိကျမှု</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {Number.isFinite(gpsAccuracy)
                    ? `±${Math.round(gpsAccuracy)} မီတာ`
                    : 'မရသေးပါ'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">ချို့ယွင်းချက်အထိ အကွာအဝေး</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {formattedDistanceToDefect || 'သင့်တည်နေရာကို စောင့်နေသည်'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">သွားရမည့် ဦးတည်ချက်</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {directionToDefect || 'သင့်တည်နေရာကို စောင့်နေသည်'}
                </p>
              </div>
            </div>

            {locationLoading && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                လက်ရှိ GPS တည်နေရာကို ရယူနေသည်…
              </div>
            )}

            {locationNotice && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{locationNotice}</span>
              </div>
            )}

            {locationError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{locationError}</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestCurrentPosition({ recordBackendCheck: false })}
                disabled={locationLoading || locationRecording}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {locationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
                မြေပုံပေါ် တည်နေရာပြန်ရှာရန်
              </button>

              <button
                type="button"
                onClick={() => requestCurrentPosition({ recordBackendCheck: true })}
                disabled={locationLoading || locationRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {locationRecording ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crosshair className="h-4 w-4" />
                )}
                ဒီတည်နေရာကို ကွင်းဆင်းစစ်ဆေးမှုအဖြစ် မှတ်တမ်းတင်ရန်
              </button>
            </div>

            {issue.last_location_proximity && (
              <p className="mt-3 text-sm text-slate-600">
                Server နောက်ဆုံးအနီးအဝေးရလဒ်:{' '}
                <span className="font-semibold text-slate-800">
                  {proximityLabel(issue.last_location_proximity)}
                </span>
              </p>
            )}
          </section>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <FieldVerificationForm
            issue={issue}
            saving={verificationSaving}
            onSave={async (payload) => {
              setVerificationSaving(true);
              setError('');
              try {
                await onVerify?.(payload);
              } catch (err) {
                setError(
                  err?.response?.data?.detail ||
                    err?.message ||
                    'ကွင်းဆင်းအတည်ပြုမှုကို မသိမ်းဆည်းနိုင်ပါ။',
                );
              } finally {
                setVerificationSaving(false);
              }
            }}
          />

          <MaintenanceForm
            issue={issue}
            saving={maintenanceSaving}
            onSave={async (payload) => {
              setMaintenanceSaving(true);
              setError('');
              try {
                await onUpdateMaintenance?.(payload);
              } catch (err) {
                setError(
                  err?.response?.data?.detail ||
                    err?.message ||
                    'ပြုပြင်ထိန်းသိမ်းမှုရလဒ်ကို မသိမ်းဆည်းနိုင်ပါ။',
                );
              } finally {
                setMaintenanceSaving(false);
              }
            }}
          />
        </div>
      </aside>
    </div>
  );
};

export default DefectDetailPanel;
