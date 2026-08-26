import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Crosshair,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import trackIssuesApi from '@/api/trackIssues';
import AIReviewPanel from '@/components/TrackIssues/AIReviewPanel';

const STATUS_LABELS = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  INSPECTING: 'Inspecting on site',
  REPAIRING: 'Repairing',
  VERIFYING: 'Verifying repair',
  RESOLVED: 'Resolved',
  BLOCKED: 'Blocked',
  REOPENED: 'Reopened',
};

const NEXT_ACTIONS = {
  OPEN: [
    ['ACKNOWLEDGED', 'Acknowledge'],
    ['BLOCKED', 'Mark blocked'],
  ],
  ACKNOWLEDGED: [
    ['INSPECTING', 'Start inspection'],
    ['BLOCKED', 'Mark blocked'],
  ],
  INSPECTING: [
    ['REPAIRING', 'Start repair'],
    ['VERIFYING', 'No repair needed → verify'],
    ['BLOCKED', 'Mark blocked'],
  ],
  REPAIRING: [
    ['VERIFYING', 'Repair complete → verify'],
    ['BLOCKED', 'Mark blocked'],
  ],
  VERIFYING: [
    ['RESOLVED', 'Resolve issue'],
    ['REPAIRING', 'Return to repair'],
    ['BLOCKED', 'Mark blocked'],
  ],
  BLOCKED: [
    ['ACKNOWLEDGED', 'Resume'],
    ['INSPECTING', 'Resume on-site inspection'],
  ],
  REOPENED: [
    ['ACKNOWLEDGED', 'Acknowledge reopened issue'],
    ['INSPECTING', 'Inspect reopened issue'],
    ['BLOCKED', 'Mark blocked'],
  ],
  RESOLVED: [],
};

const proximityMeta = {
  ON_SITE: ['On site', 'bg-green-50 text-green-700 border-green-200'],
  NEARBY: ['Nearby', 'bg-blue-50 text-blue-700 border-blue-200'],
  APPROACHING: ['Approaching', 'bg-amber-50 text-amber-800 border-amber-200'],
  FAR: ['Far from issue', 'bg-red-50 text-red-700 border-red-200'],
  GPS_UNCERTAIN: ['GPS accuracy too low', 'bg-gray-100 text-gray-700 border-gray-300'],
};

const pretty = (value) => {
  if (value == null) return 'No AI review data';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const TrackEngineerIssuePage = () => {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState('UPDATE');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('CONFIRMED');
  const [verificationNote, setVerificationNote] = useState('');

  const load = async () => {
    try {
      setError('');
      const data = await trackIssuesApi.getById(issueId);
      setIssue(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load track issue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [issueId]);

  const checkLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
        setCurrentLocation(location);

        try {
          const result = await trackIssuesApi.checkLocation(issueId, location);
          if (result.gps_reliable === false) {
            setError('GPS accuracy is too low for an on-site verification. Move to an open area and retry.');
          } else {
            setError('');
          }
          setIssue((previous) => ({
            ...previous,
            last_location_checked_at: result.checked_at,
            last_location_distance_miles: result.distance_miles,
            last_location_proximity: result.proximity,
            location_verified_at: result.on_site ? result.checked_at : previous.location_verified_at,
          }));
          await load();
        } catch (err) {
          setError(err.response?.data?.detail || 'Location verification failed.');
        } finally {
          setBusy(false);
        }
      },
      (geoError) => {
        setError(`Could not read current location: ${geoError.message}`);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const claimIssue = async () => {
    setBusy(true);
    try {
      const data = await trackIssuesApi.claim(issueId);
      setIssue(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not claim this issue.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    if (['BLOCKED', 'RESOLVED'].includes(status) && !progressNote.trim()) {
      setError(status === 'BLOCKED'
        ? 'Add the reason before marking this issue blocked.'
        : 'Add a resolution note before resolving this issue.');
      return;
    }

    setBusy(true);
    try {
      const data = await trackIssuesApi.updateStatus(issueId, status, progressNote.trim() || null);
      setIssue(data);
      setProgressNote('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update issue status.');
    } finally {
      setBusy(false);
    }
  };

  const saveFieldVerification = async () => {
    if (!verificationNote.trim()) {
      setError('Describe what you physically observed before saving field verification.');
      return;
    }
    setBusy(true);
    try {
      const data = await trackIssuesApi.updateFieldVerification(
        issueId,
        verificationStatus,
        verificationNote.trim()
      );
      setIssue(data);
      setVerificationNote('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save field verification.');
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      const data = await trackIssuesApi.addComment(issueId, comment.trim(), commentKind);
      setIssue(data);
      setComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not add progress update.');
    } finally {
      setBusy(false);
    }
  };

  const mapPoints = useMemo(() => {
    const result = [];
    if (issue?.latitude != null && issue?.longitude != null) {
      result.push([Number(issue.latitude), Number(issue.longitude)]);
    }
    if (currentLocation) {
      result.push([currentLocation.latitude, currentLocation.longitude]);
    }
    return result;
  }, [issue, currentLocation]);

  if (loading) {
    return <div className="py-16 text-center text-gray-500">Loading maintenance issue…</div>;
  }

  if (!issue) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card padding="p-8" hover={false} className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="font-semibold mt-3">{error || 'Issue not found'}</p>
        </Card>
      </div>
    );
  }

  const [proximityLabel, proximityClass] = proximityMeta[issue.last_location_proximity] || ['Not checked', 'bg-gray-50 text-gray-600 border-gray-200'];

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate('/train-rider/issues')} icon={<ArrowLeft className="w-4 h-4" />}>
          Back to issues
        </Button>
        <Button variant="outline" onClick={load} icon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card padding="p-5" hover={false}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Track maintenance work item</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{issue.defect_type}</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
              <span>Status: <strong className="text-gray-800">{STATUS_LABELS[issue.status] || issue.status}</strong></span>
              {issue.rail_side && <span>Rail: {issue.rail_side}</span>}
              {issue.confidence != null && <span>AI confidence: {(issue.confidence * 100).toFixed(1)}%</span>}
              {issue.ai_priority && <span>Priority: {String(issue.ai_priority).replaceAll('_', ' ')}</span>}
            </div>
          </div>
          <div className={`px-3 py-2 rounded-xl border text-sm font-semibold ${proximityClass}`}>
            <div className="flex items-center gap-2"><Crosshair className="w-4 h-4" /> {proximityLabel}</div>
            {issue.last_location_distance_miles != null && (
              <div className="text-xs font-normal mt-1">{Number(issue.last_location_distance_miles).toFixed(3)} mi from defect</div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card padding="p-0" hover={false} className="overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Location verification</h2>
                <p className="text-xs text-gray-500 mt-1">Compare your device GPS with the AI defect coordinate.</p>
              </div>
              <Button onClick={checkLocation} disabled={busy} icon={<Crosshair className="w-4 h-4" />}>
                Check my location
              </Button>
            </div>

            {issue.latitude != null && issue.longitude != null ? (
              <div className="h-[340px]">
                <MapContainer
                  center={[Number(issue.latitude), Number(issue.longitude)]}
                  zoom={currentLocation ? 16 : 15}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <CircleMarker center={[Number(issue.latitude), Number(issue.longitude)]} radius={10} pathOptions={{ color: '#dc2626' }}>
                    <Popup>AI defect: {issue.defect_type}</Popup>
                  </CircleMarker>
                  {currentLocation && (
                    <CircleMarker center={[currentLocation.latitude, currentLocation.longitude]} radius={9} pathOptions={{ color: '#2563eb' }}>
                      <Popup>Your current location</Popup>
                    </CircleMarker>
                  )}
                  {mapPoints.length === 2 && <Polyline positions={mapPoints} pathOptions={{ dashArray: '6 6' }} />}
                </MapContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">This AI finding does not contain GPS coordinates.</div>
            )}

            <div className="p-4 bg-gray-50 grid sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500">Defect coordinate</span><br /><strong>{issue.latitude?.toFixed?.(6) ?? issue.latitude}, {issue.longitude?.toFixed?.(6) ?? issue.longitude}</strong></div>
              <div><span className="text-gray-500">Inspection position</span><br /><strong>{issue.distance_from_start_miles != null ? `${Number(issue.distance_from_start_miles).toFixed(2)} mi` : '—'}</strong></div>
              <div><span className="text-gray-500">Last verified on site</span><br /><strong>{formatDate(issue.location_verified_at)}</strong></div>
            </div>
          </Card>

          <Card padding="p-5" hover={false}>
            <AIReviewPanel issue={issue} />
          </Card>

          <Card padding="p-5" hover={false}>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-900">Progress & admin conversation</h2>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
              {(issue.activities || []).length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                [...issue.activities].reverse().map((activity) => (
                  <div key={activity.id} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-800">{activity.actor_name || 'System'}</span>
                        {activity.actor_role && <span className="text-xs text-gray-500">{activity.actor_role}</span>}
                        {activity.message_kind && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{activity.message_kind}</span>}
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(activity.created_at)}</span>
                    </div>
                    {activity.from_status && activity.to_status && (
                      <p className="text-xs text-gray-500 mt-2">{activity.from_status} → <strong>{activity.to_status}</strong></p>
                    )}
                    {activity.message && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{activity.message}</p>}
                    {activity.proximity && (
                      <p className="text-xs text-gray-500 mt-2">Location check: {activity.proximity} · {Number(activity.distance_to_issue_miles || 0).toFixed(3)} mi</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {issue.assigned_staff_id && (
              <div className="mt-4 grid sm:grid-cols-[150px_1fr_auto] gap-2">
                <select value={commentKind} onChange={(event) => setCommentKind(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 bg-white text-sm">
                  <option value="UPDATE">Progress update</option>
                  <option value="COMMENT">Comment</option>
                  <option value="QUESTION">Question</option>
                </select>
                <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Reply to admin or record field notes…" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <Button onClick={addComment} disabled={busy || !comment.trim()}>Send</Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {!issue.assigned_staff_id && issue.status !== 'RESOLVED' && (
            <Card padding="p-5" hover={false} className="border border-emerald-200 bg-emerald-50/40">
              <h2 className="font-bold text-gray-900">Unassigned finding</h2>
              <p className="text-sm text-gray-600 mt-2">You can review the AI evidence and location before taking ownership. Claim the issue before recording repair progress or comments.</p>
              <Button className="w-full mt-4" disabled={busy} onClick={claimIssue}>Claim this issue</Button>
            </Card>
          )}

          {issue.assigned_staff_id && (
            <Card padding="p-5" hover={false}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-gray-900">Field verification</h2>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase text-gray-500">AI finding result</p>
                <p className="font-semibold mt-1">{String(issue.field_verification_status || 'NOT_CHECKED').replaceAll('_', ' ')}</p>
                {issue.field_verification_note && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{issue.field_verification_note}</p>}
                {issue.field_verified_at && <p className="text-xs text-gray-400 mt-2">Recorded {formatDate(issue.field_verified_at)}</p>}
              </div>
              {['INSPECTING', 'REPAIRING', 'VERIFYING', 'BLOCKED'].includes(issue.status) && issue.status !== 'RESOLVED' && (
                <div className="mt-3 space-y-2">
                  <select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white text-sm">
                    <option value="CONFIRMED">Confirmed — AI finding is present</option>
                    <option value="PARTIALLY_CONFIRMED">Partially confirmed</option>
                    <option value="NOT_CONFIRMED">Not confirmed / false positive</option>
                    <option value="UNABLE_TO_VERIFY">Unable to verify</option>
                  </select>
                  <textarea value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} rows={3} placeholder="Describe what you physically observed and any nearby component condition." className="w-full border border-gray-200 rounded-xl p-2 text-sm" />
                  <Button className="w-full" disabled={busy || !verificationNote.trim()} onClick={saveFieldVerification}>Save verification</Button>
                </div>
              )}
              {(issue.field_verification_status || 'NOT_CHECKED') === 'NOT_CHECKED' && <p className="text-xs text-amber-700 mt-2">Required before final resolution.</p>}
            </Card>
          )}

          <Card padding="p-5" hover={false}>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-gray-900">Handling stage</h2>
            </div>
            <div className="space-y-2 text-sm">
              {['ACKNOWLEDGED', 'INSPECTING', 'REPAIRING', 'VERIFYING', 'RESOLVED'].map((step, index) => {
                const order = ['OPEN', 'ACKNOWLEDGED', 'INSPECTING', 'REPAIRING', 'VERIFYING', 'RESOLVED'];
                const reached = order.indexOf(issue.status) >= order.indexOf(step) && !['BLOCKED', 'REOPENED'].includes(issue.status);
                return (
                  <div key={step} className="flex items-center gap-2">
                    {reached ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <span className="w-4 h-4 rounded-full border border-gray-300" />}
                    <span className={reached ? 'font-medium text-gray-900' : 'text-gray-500'}>{index + 1}. {STATUS_LABELS[step]}</span>
                  </div>
                );
              })}
            </div>

            {issue.assigned_staff_id && issue.status !== 'RESOLVED' && (
              <>
                <textarea
                  value={progressNote}
                  onChange={(event) => setProgressNote(event.target.value)}
                  rows={4}
                  placeholder="What did you check/fix? Add a note; resolution requires one."
                  className="mt-4 w-full border border-gray-200 rounded-xl p-3 text-sm resize-none"
                />
                <div className="mt-3 space-y-2">
                  {(NEXT_ACTIONS[issue.status] || []).map(([status, label]) => (
                    <Button
                      key={status}
                      className="w-full"
                      variant={status === 'BLOCKED' ? 'outline' : 'primary'}
                      disabled={busy || (status === 'RESOLVED' && ['NOT_CHECKED', 'UNABLE_TO_VERIFY'].includes(issue.field_verification_status || 'NOT_CHECKED'))}
                      onClick={() => changeStatus(status)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {issue.status === 'VERIFYING' && ['NOT_CHECKED', 'UNABLE_TO_VERIFY'].includes(issue.field_verification_status || 'NOT_CHECKED') && (
                  <p className="text-xs text-amber-700 mt-2">Resolve becomes available after a usable field-verification result is recorded.</p>
                )}
              </>
            )}

            {issue.status === 'RESOLVED' && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="flex items-center gap-2 font-semibold text-green-700"><ShieldCheck className="w-4 h-4" /> Resolved</div>
                <p className="text-sm text-green-800 mt-2 whitespace-pre-wrap">{issue.resolution_summary}</p>
              </div>
            )}
          </Card>

          <Card padding="p-5" hover={false}>
            <h2 className="font-bold text-gray-900 mb-3">Source</h2>
            <dl className="text-sm space-y-2">
              <div><dt className="text-gray-500">Inspection</dt><dd className="font-mono text-xs break-all">{issue.inspection_id}</dd></div>
              <div><dt className="text-gray-500">AI event</dt><dd className="font-mono text-xs break-all">{issue.inspection_event_id}</dd></div>
              <div><dt className="text-gray-500">Run</dt><dd>{issue.run_id || '—'}</dd></div>
              <div><dt className="text-gray-500">Assigned engineer</dt><dd>{issue.assigned_staff_name || issue.assigned_staff_code || 'Unassigned'}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TrackEngineerIssuePage;
