import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  MapPin,
  MessageSquare,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import trackIssuesApi from '@/api/trackIssues';
import AIReviewPanel from '@/components/TrackIssues/AIReviewPanel';
import InspectionCaseAIReview from '@/components/TrackIssues/InspectionCaseAIReview';

const humanize = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const priorityRank = (priority) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('critical') || value.includes('urgent')) return 0;
  if (value.includes('priority') || value.includes('high')) return 1;
  if (value.includes('monitor') || value.includes('medium')) return 2;
  return 3;
};

const priorityClass = (priority) => {
  const rank = priorityRank(priority);
  if (rank <= 1) return 'bg-red-50 text-red-700 border-red-200';
  if (rank === 2) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const fieldClass = (value) => {
  if (value === 'CONFIRMED') return 'bg-green-50 text-green-700 border-green-200';
  if (value === 'PARTIALLY_CONFIRMED') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (value === 'NOT_CONFIRMED') return 'bg-gray-100 text-gray-700 border-gray-300';
  if (value === 'UNABLE_TO_VERIFY') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const maintenanceClass = (value) => {
  if (['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED'].includes(value)) return 'bg-green-50 text-green-700 border-green-200';
  if (value === 'REPAIR_IN_PROGRESS') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (['REPAIR_REQUIRED', 'FOLLOW_UP_REQUIRED'].includes(value)) return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const caseStatusClass = (value) => {
  if (value === 'COMPLETED') return 'bg-green-50 text-green-700 border-green-200';
  if (value === 'BLOCKED') return 'bg-red-50 text-red-700 border-red-200';
  if (value === 'VERIFYING') return 'bg-purple-50 text-purple-700 border-purple-200';
  if (['IN_PROGRESS', 'ACKNOWLEDGED'].includes(value)) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const haversineMiles = (aLat, aLon, bLat, bLon) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const r = 3958.7613;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const nextCaseStatuses = (status) => ({
  OPEN: ['ACKNOWLEDGED', 'BLOCKED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['COMPLETED', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['ACKNOWLEDGED', 'IN_PROGRESS'],
  REOPENED: ['IN_PROGRESS', 'BLOCKED'],
}[status] || []);

const TrackEngineerIssuePage = () => {
  const { issueId: caseId } = useParams();
  const navigate = useNavigate();
  const [inspectionCase, setInspectionCase] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sortMode, setSortMode] = useState('recommended');
  const [myLocation, setMyLocation] = useState(null);

  const [verificationStatus, setVerificationStatus] = useState('CONFIRMED');
  const [verificationNote, setVerificationNote] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('PENDING');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [caseStatusNote, setCaseStatusNote] = useState('');
  const [commentKind, setCommentKind] = useState('UPDATE');
  const [comment, setComment] = useState('');
  const [findingComment, setFindingComment] = useState('');

  const load = async () => {
    try {
      setError('');
      const data = await trackIssuesApi.getById(caseId);
      setInspectionCase(data);
      setSelectedIssueId((previous) => {
        if (previous && data.issues?.some((item) => item.id === previous)) return previous;
        const incomplete = (data.issues || []).find((item) => !item.checklist_complete);
        return incomplete?.id || data.issues?.[0]?.id || null;
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load inspection maintenance case.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [caseId]);

  const selectedIssue = useMemo(
    () => inspectionCase?.issues?.find((item) => item.id === selectedIssueId) || null,
    [inspectionCase, selectedIssueId],
  );

  useEffect(() => {
    if (!selectedIssue) return;
    setVerificationStatus(selectedIssue.field_verification_status === 'NOT_CHECKED' ? 'CONFIRMED' : selectedIssue.field_verification_status);
    setVerificationNote(selectedIssue.field_verification_note || '');
    setMaintenanceStatus(selectedIssue.maintenance_status || 'PENDING');
    setMaintenanceNote(selectedIssue.maintenance_note || '');
    setFindingComment('');
  }, [selectedIssueId, selectedIssue?.updated_at]);

  const sortedIssues = useMemo(() => {
    const items = [...(inspectionCase?.issues || [])];
    if (sortMode === 'nearest' && myLocation) {
      return items.sort((a, b) => {
        const da = a.latitude != null && a.longitude != null ? haversineMiles(myLocation.latitude, myLocation.longitude, a.latitude, a.longitude) : Number.POSITIVE_INFINITY;
        const db = b.latitude != null && b.longitude != null ? haversineMiles(myLocation.latitude, myLocation.longitude, b.latitude, b.longitude) : Number.POSITIVE_INFINITY;
        return da - db;
      });
    }
    return items.sort((a, b) => {
      if (a.checklist_complete !== b.checklist_complete) return a.checklist_complete ? 1 : -1;
      const p = priorityRank(a.ai_priority) - priorityRank(b.ai_priority);
      if (p !== 0) return p;
      return Number(a.distance_from_start_miles ?? 99999) - Number(b.distance_from_start_miles ?? 99999);
    });
  }, [inspectionCase?.issues, sortMode, myLocation]);

  const readBrowserLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error('Geolocation is not supported by this browser.'));
    else navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  });

  const locateForSorting = async () => {
    try {
      const loc = await readBrowserLocation();
      setMyLocation(loc);
      setSortMode('nearest');
    } catch (err) {
      setError(`Could not read current location: ${err.message}`);
    }
  };

  const claimCase = async () => {
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.claim(caseId));
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not claim this inspection case.');
    } finally { setBusy(false); }
  };

  const changeCaseStatus = async (status) => {
    const noteRequired = ['BLOCKED', 'COMPLETED'].includes(status);
    if (noteRequired && !caseStatusNote.trim()) {
      setError(`A note is required to mark the case ${humanize(status).toLowerCase()}.`);
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.updateStatus(caseId, status, caseStatusNote.trim() || null));
      setCaseStatusNote('');
      setError('');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail || 'Could not update case status.'));
    } finally { setBusy(false); }
  };

  const checkLocation = async () => {
    if (!selectedIssue) return;
    setBusy(true);
    try {
      const loc = await readBrowserLocation();
      setMyLocation(loc);
      const result = await trackIssuesApi.checkLocation(caseId, selectedIssue.id, loc);
      if (result.gps_reliable === false) setError('GPS accuracy is too low for on-site verification. Move to an open area and retry.');
      else setError('');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Could not check current location.');
    } finally { setBusy(false); }
  };

  const saveVerification = async () => {
    if (!selectedIssue || verificationNote.trim().length < 3) {
      setError('Describe what you physically observed before saving field verification.');
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.verifyFinding(caseId, selectedIssue.id, verificationStatus, verificationNote.trim()));
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save field verification.');
    } finally { setBusy(false); }
  };

  const saveMaintenance = async () => {
    if (!selectedIssue) return;
    if (['NO_ACTION_REQUIRED', 'REPAIR_COMPLETED', 'FOLLOW_UP_REQUIRED'].includes(maintenanceStatus) && !maintenanceNote.trim()) {
      setError('This maintenance outcome requires a note.');
      return;
    }
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.updateMaintenance(caseId, selectedIssue.id, maintenanceStatus, maintenanceNote.trim() || null));
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update maintenance outcome.');
    } finally { setBusy(false); }
  };

  const addCaseComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.addCaseComment(caseId, comment.trim(), commentKind));
      setComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not add case update.');
    } finally { setBusy(false); }
  };

  const addFindingComment = async () => {
    if (!selectedIssue || !findingComment.trim()) return;
    setBusy(true);
    try {
      setInspectionCase(await trackIssuesApi.addIssueComment(caseId, selectedIssue.id, findingComment.trim(), 'UPDATE'));
      setFindingComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not add finding note.');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="max-w-7xl mx-auto py-20 text-center text-gray-500">Loading inspection case…</div>;
  if (!inspectionCase) return <div className="max-w-4xl mx-auto py-20 text-center text-red-600">{typeof error === 'string' ? error : JSON.stringify(error)}</div>;

  const assigned = Boolean(inspectionCase.assigned_staff_id);
  const remaining = Math.max(0, inspectionCase.total_findings - inspectionCase.completed_findings);

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/train-rider/issues')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to cases
        </button>
        <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

      <Card padding="p-5" hover={false}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${caseStatusClass(inspectionCase.status)}`}>{humanize(inspectionCase.status)}</span>
              <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${priorityClass(inspectionCase.ai_overall_priority)}`}>AI: {humanize(inspectionCase.ai_overall_priority)}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Inspection Maintenance Case</h1>
            <p className="text-xs text-gray-500 break-all mt-1">Inspection: {inspectionCase.inspection_id}</p>
            {inspectionCase.run_id && <p className="text-sm text-gray-500 mt-1">Run: {inspectionCase.run_id}</p>}
            <p className="text-sm text-gray-600 mt-2">Assigned: {inspectionCase.assigned_staff_name || inspectionCase.assigned_staff_code || 'Unassigned'}</p>
          </div>
          {!assigned && inspectionCase.status !== 'COMPLETED' && <Button onClick={claimCase} disabled={busy}>Claim complete case</Button>}
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Findings', inspectionCase.total_findings],
            ['Checked', inspectionCase.checked_findings],
            ['Completed', inspectionCase.completed_findings],
            ['Remaining', remaining],
            ['Follow-up', inspectionCase.follow_up_count],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-gray-500">{label}</p></div>)}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Case completion</span><span>{Number(inspectionCase.progress_percent || 0).toFixed(0)}%</span></div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${inspectionCase.progress_percent || 0}%` }} /></div>
        </div>
      </Card>

      <div className="grid xl:grid-cols-[1.1fr_1.9fr] gap-5">
        <div className="space-y-5">
          <Card padding="p-5" hover={false}>
            <InspectionCaseAIReview inspectionCase={inspectionCase} compact />
          </Card>

          {assigned && inspectionCase.status !== 'COMPLETED' && (
            <Card padding="p-5" hover={false}>
              <h2 className="font-bold text-gray-900">Case workflow</h2>
              <p className="text-sm text-gray-500 mt-1">The case lifecycle describes the whole field job; checklist findings have their own verification and maintenance outcomes.</p>
              <textarea value={caseStatusNote} onChange={(e) => setCaseStatusNote(e.target.value)} placeholder="Case note / blocked reason / completion summary…" className="w-full mt-3 border rounded-xl p-3 text-sm min-h-24" />
              <div className="mt-3 flex flex-wrap gap-2">
                {nextCaseStatuses(inspectionCase.status).map((status) => (
                  <Button key={status} size="sm" variant={status === 'BLOCKED' ? 'outline' : undefined} onClick={() => changeCaseStatus(status)} disabled={busy}>
                    {humanize(status)}
                  </Button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card padding="p-5" hover={false}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Defect checklist</h2>
                <p className="text-sm text-gray-500">Work through every finding under this one assigned inspection case.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={sortMode === 'recommended' ? undefined : 'outline'} onClick={() => setSortMode('recommended')}>Recommended order</Button>
                <Button size="sm" variant={sortMode === 'nearest' ? undefined : 'outline'} onClick={locateForSorting}><Navigation className="w-4 h-4 mr-1" />Nearest first</Button>
              </div>
            </div>

            <div className="mt-4 space-y-2 max-h-[560px] overflow-auto pr-1">
              {sortedIssues.map((item, index) => {
                const distance = myLocation && item.latitude != null && item.longitude != null
                  ? haversineMiles(myLocation.latitude, myLocation.longitude, item.latitude, item.longitude)
                  : null;
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedIssueId(item.id)} className={`w-full text-left rounded-xl border p-3 transition ${selectedIssueId === item.id ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${item.checklist_complete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {item.checklist_complete ? '✓' : index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${priorityClass(item.ai_priority)}`}>{humanize(item.ai_priority)}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] ${fieldClass(item.field_verification_status)}`}>{humanize(item.field_verification_status)}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] ${maintenanceClass(item.maintenance_status)}`}>{humanize(item.maintenance_status)}</span>
                        </div>
                        <p className="font-semibold text-gray-900 mt-1">{item.defect_type}</p>
                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                          {item.rail_side && <span>{humanize(item.rail_side)} rail</span>}
                          {item.distance_from_start_miles != null && <span>{Number(item.distance_from_start_miles).toFixed(3)} mi from inspection start</span>}
                          {distance != null && <span>{distance.toFixed(2)} mi from you</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selectedIssue && (
            <Card padding="p-5" hover={false}>
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Selected checklist finding</p>
                  <h2 className="text-xl font-bold text-gray-900 mt-1">{selectedIssue.defect_type}</h2>
                </div>
                {selectedIssue.latitude != null && selectedIssue.longitude != null && (
                  <button type="button" onClick={() => window.open(`https://www.openstreetmap.org/?mlat=${selectedIssue.latitude}&mlon=${selectedIssue.longitude}#map=18/${selectedIssue.latitude}/${selectedIssue.longitude}`, '_blank')} className="text-sm text-blue-700 flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> Open defect in map
                  </button>
                )}
              </div>

              <div className="mt-4"><AIReviewPanel issue={selectedIssue} /></div>

              <div className="mt-5 grid lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2"><Crosshair className="w-4 h-4 text-blue-600" /><h3 className="font-bold">Location evidence</h3></div>
                  <div className="mt-2 text-sm text-gray-600 space-y-1">
                    <p>Last proximity: {humanize(selectedIssue.last_location_proximity)}</p>
                    <p>Last distance: {selectedIssue.last_location_distance_miles != null ? `${Number(selectedIssue.last_location_distance_miles).toFixed(3)} mi` : '—'}</p>
                    <p>On-site verified: {selectedIssue.location_verified_at ? 'Yes' : 'No'}</p>
                  </div>
                  {assigned && <Button className="mt-3" size="sm" onClick={checkLocation} disabled={busy}>Check my current location</Button>}
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /><h3 className="font-bold">Field verification</h3></div>
                  <p className="text-sm text-gray-500 mt-1">Record whether the physical defect confirms the finding.</p>
                  {assigned && inspectionCase.status !== 'COMPLETED' ? (
                    <>
                      <select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} className="w-full mt-3 border rounded-xl px-3 py-2 text-sm">
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="PARTIALLY_CONFIRMED">Partially confirmed</option>
                        <option value="NOT_CONFIRMED">Not confirmed / false positive</option>
                        <option value="UNABLE_TO_VERIFY">Unable to verify</option>
                      </select>
                      <textarea value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="What did you physically observe?" className="w-full mt-2 border rounded-xl p-3 text-sm min-h-24" />
                      <Button size="sm" className="mt-2" onClick={saveVerification} disabled={busy}>Save field verification</Button>
                    </>
                  ) : <p className="mt-3 text-sm">{selectedIssue.field_verification_note || 'Not checked yet.'}</p>}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-600" /><h3 className="font-bold">Maintenance outcome</h3></div>
                <p className="text-sm text-gray-500 mt-1">After field verification, decide whether repair is needed and record the final result.</p>
                {assigned && inspectionCase.status !== 'COMPLETED' && (
                  <div className="grid md:grid-cols-[220px_1fr_auto] gap-2 mt-3">
                    <select value={maintenanceStatus} onChange={(e) => setMaintenanceStatus(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
                      <option value="PENDING">Pending decision</option>
                      <option value="NO_ACTION_REQUIRED">No action required</option>
                      <option value="REPAIR_REQUIRED">Repair required</option>
                      <option value="REPAIR_IN_PROGRESS">Repair in progress</option>
                      <option value="REPAIR_COMPLETED">Repair completed</option>
                      <option value="FOLLOW_UP_REQUIRED">Follow-up required</option>
                    </select>
                    <input value={maintenanceNote} onChange={(e) => setMaintenanceNote(e.target.value)} placeholder="Repair / no-action / follow-up note…" className="border rounded-xl px-3 py-2 text-sm" />
                    <Button onClick={saveMaintenance} disabled={busy}>Save</Button>
                  </div>
                )}
              </div>

              {assigned && inspectionCase.status !== 'COMPLETED' && (
                <div className="mt-4 rounded-xl border border-gray-200 p-4">
                  <h3 className="font-bold">Finding-specific note</h3>
                  <div className="mt-2 flex gap-2">
                    <input value={findingComment} onChange={(e) => setFindingComment(e.target.value)} placeholder="Record a note/question about this particular finding…" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
                    <Button onClick={addFindingComment} disabled={busy || !findingComment.trim()}>Add</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Card padding="p-5" hover={false}>
        <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-600" /><h2 className="font-bold text-gray-900">Case activity & admin conversation</h2></div>
        <div className="mt-4 space-y-3 max-h-96 overflow-auto">
          {(inspectionCase.activities || []).length === 0 ? <p className="text-sm text-gray-500">No case activity yet.</p> : [...inspectionCase.activities].reverse().map((activity) => (
            <div key={activity.id} className="border-l-2 border-gray-200 pl-3 py-1">
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{activity.actor_name || activity.actor_staff_id || 'System'}</span>
                <span>{humanize(activity.activity_type)}</span>
                {activity.issue_defect_type && <span className="text-emerald-700">Finding: {activity.issue_defect_type}</span>}
                <span>{new Date(activity.created_at).toLocaleString()}</span>
              </div>
              {activity.message && <p className="text-sm text-gray-700 mt-1">{activity.message}</p>}
              {activity.from_status && activity.to_status && <p className="text-xs text-gray-500 mt-1">{humanize(activity.from_status)} → {humanize(activity.to_status)}</p>}
            </div>
          ))}
        </div>
        {assigned && (
          <div className="mt-4 grid sm:grid-cols-[160px_1fr_auto] gap-2">
            <select value={commentKind} onChange={(e) => setCommentKind(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="UPDATE">Progress update</option>
              <option value="COMMENT">Comment</option>
              <option value="QUESTION">Question</option>
            </select>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Update admin about the overall inspection case…" className="border rounded-xl px-3 py-2 text-sm" />
            <Button onClick={addCaseComment} disabled={busy || !comment.trim()}>Send</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default TrackEngineerIssuePage;
