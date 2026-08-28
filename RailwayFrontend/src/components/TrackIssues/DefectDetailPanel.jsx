import React, { useState } from 'react';
import {
  Bot,
  Loader2,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';
import FieldVerificationForm from './FieldVerificationForm';
import MaintenanceForm from './MaintenanceForm';
import {
  formatDistanceFromStart,
  humanize,
  priorityClasses,
} from './kanbanUtils';

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
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open || !issue) return null;

  const distance = formatDistanceFromStart(issue.distance_from_start_miles);

  const runLocationCheck = () => {
    setError('');

    if (!navigator.geolocation) {
      setError('This browser does not support geolocation.');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await onCheckLocation?.({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_meters: position.coords.accuracy,
          });
        } catch (err) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Location check failed.',
          );
        } finally {
          setLocationLoading(false);
        }
      },
      (geoError) => {
        setError(geoError.message || 'Unable to read current location.');
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/35"
        aria-label="Close finding panel"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="pr-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Finding
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {issue.defect_type || 'Finding'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
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
                {humanize(issue.ai_priority || 'Routine')}
              </span>

              {issue.rail_side && (
                <span className="text-sm text-slate-600">
                  {humanize(issue.rail_side)} rail
                </span>
              )}
            </div>

            {distance && (
              <p className="mt-3 text-sm text-slate-600">{distance}</p>
            )}

            {issue.latitude != null && issue.longitude != null && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-emerald-600" />
                AI finding has GPS coordinates
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenAI?.(issue)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <Bot className="h-4 w-4" />
            Open AI finding review
          </button>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Navigation className="h-4 w-4 text-slate-600" />
              <h4 className="font-semibold text-slate-900">Location</h4>
            </div>

            <button
              type="button"
              onClick={runLocationCheck}
              disabled={locationLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {locationLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Check my current location
            </button>

            {issue.last_location_proximity && (
              <p className="mt-3 text-sm text-slate-600">
                Last result:{' '}
                <span className="font-semibold text-slate-800">
                  {humanize(issue.last_location_proximity)}
                </span>
              </p>
            )}
          </div>

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
                    'Could not save field verification.',
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
                    'Could not save maintenance result.',
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
