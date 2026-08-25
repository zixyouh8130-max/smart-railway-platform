import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Search,
  UserRoundCog,
  Wrench,
} from 'lucide-react';

import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { inspectionApi } from '@/api/inspectionAPI';
import trackIssuesApi from '@/api/trackIssues';

const STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'INSPECTING',
  'REPAIRING',
  'VERIFYING',
  'BLOCKED',
  'REOPENED',
  'RESOLVED',
];

const statusClass = (status) => ({
  OPEN: 'bg-red-50 text-red-700 border-red-200',
  ACKNOWLEDGED: 'bg-blue-50 text-blue-700 border-blue-200',
  INSPECTING: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  REPAIRING: 'bg-amber-50 text-amber-800 border-amber-200',
  VERIFYING: 'bg-purple-50 text-purple-700 border-purple-200',
  RESOLVED: 'bg-green-50 text-green-700 border-green-200',
  BLOCKED: 'bg-gray-100 text-gray-700 border-gray-300',
  REOPENED: 'bg-orange-50 text-orange-700 border-orange-200',
}[status] || 'bg-gray-50 text-gray-700 border-gray-200');

const inspectionLabel = (inspection) =>
  inspection?.run_id || inspection?.gpx_name || inspection?.video_name || inspection?.id || 'Inspection';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const TrackIssuesAdminPage = () => {
  const [issues, setIssues] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [engineerFilter, setEngineerFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState('COMMENT');
  const [adminStatusNote, setAdminStatusNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setError('');
      const [issueData, engineerData, inspectionData, statData] = await Promise.all([
        trackIssuesApi.list(),
        trackIssuesApi.getEngineers(),
        inspectionApi.getInspections(50, 0),
        trackIssuesApi.getStatistics(),
      ]);
      setIssues(issueData || []);
      setEngineers(engineerData || []);
      setInspections(inspectionData || []);
      setStats(statData || null);
      if (!selectedInspection && inspectionData?.length) {
        setSelectedInspection(inspectionData[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load maintenance issues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openIssue = async (id) => {
    try {
      setBusy(true);
      setSelectedIssue(await trackIssuesApi.getById(id));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load issue details.');
    } finally {
      setBusy(false);
    }
  };

  const syncInspection = async () => {
    if (!selectedInspection) return;
    setBusy(true);
    try {
      const result = await trackIssuesApi.syncInspection(selectedInspection);
      setSuccess(`AI findings synced: ${result.created} created, ${result.updated} refreshed.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sync AI inspection findings.');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (staffId) => {
    if (!selectedIssue) return;
    try {
      setBusy(true);
      const detail = await trackIssuesApi.assign(selectedIssue.id, staffId || null);
      setSelectedIssue(detail);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update engineer assignment.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (status) => {
    if (!selectedIssue) return;
    if (['BLOCKED', 'REOPENED', 'RESOLVED'].includes(status) && !adminStatusNote.trim()) {
      setError(
        status === 'RESOLVED'
          ? 'A resolution note is required to resolve an issue.'
          : 'Add a reason before applying this status.'
      );
      return;
    }
    try {
      setBusy(true);
      const detail = await trackIssuesApi.updateStatus(selectedIssue.id, status, adminStatusNote.trim() || null);
      setSelectedIssue(detail);
      setAdminStatusNote('');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update status.');
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!selectedIssue || !comment.trim()) return;
    try {
      setBusy(true);
      const detail = await trackIssuesApi.addComment(selectedIssue.id, comment.trim(), commentKind);
      setSelectedIssue(detail);
      setComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not post comment.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((issue) => {
      if (statusFilter !== 'ALL' && issue.status !== statusFilter) return false;
      if (engineerFilter === 'UNASSIGNED' && issue.assigned_staff_id) return false;
      if (engineerFilter !== 'ALL' && engineerFilter !== 'UNASSIGNED' && issue.assigned_staff_id !== engineerFilter) return false;
      if (!q) return true;
      return [issue.defect_type, issue.run_id, issue.ai_priority, issue.assigned_staff_name, issue.assigned_staff_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [issues, statusFilter, engineerFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-emerald-700 flex items-center gap-2"><Wrench className="w-4 h-4" /> Maintenance Control</div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Track Issues</h1>
          <p className="text-sm text-gray-500 mt-1">Turn AI inspection findings into accountable engineering work and follow each repair to resolution.</p>
        </div>
        <Button variant="outline" onClick={load} icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{success}</div>}

      <Card padding="p-4" hover={false}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Import / refresh AI findings</label>
            <select value={selectedInspection} onChange={(event) => setSelectedInspection(event.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 bg-white">
              <option value="">Select inspection</option>
              {inspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>{inspectionLabel(inspection)} · {inspection.defect_count ?? inspection.inspection_events ?? 0} finding(s)</option>
              ))}
            </select>
          </div>
          <Button onClick={syncInspection} disabled={!selectedInspection || busy} icon={<Bot className="w-4 h-4" />}>Sync AI findings</Button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Syncing updates AI/GPS snapshots only. Existing engineer assignment, progress, comments and resolution state are preserved.</p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Total issues', stats?.total ?? issues.length, AlertTriangle],
          ['Open work', stats?.open_work ?? issues.filter((item) => item.status !== 'RESOLVED').length, Wrench],
          ['Repairing', stats?.by_status?.REPAIRING ?? 0, UserRoundCog],
          ['Resolved', stats?.resolved ?? 0, CheckCircle2],
        ].map(([label, value, Icon]) => (
          <Card key={label} padding="p-4" hover={false}>
            <Icon className="w-5 h-5 text-blue-600" />
            <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] gap-5 items-start">
        <Card padding="p-0" hover={false}>
          <div className="p-4 border-b border-gray-100 grid md:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues…" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="ALL">All stages</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={engineerFilter} onChange={(event) => setEngineerFilter(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="ALL">All engineers</option>
              <option value="UNASSIGNED">Unassigned</option>
              {engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.name} ({engineer.staff_id})</option>)}
            </select>
          </div>

          <div className="divide-y divide-gray-100 max-h-[720px] overflow-auto">
            {loading ? (
              <div className="p-10 text-center text-gray-500">Loading issues…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-gray-500">No maintenance issues match the filters.</div>
            ) : filtered.map((issue) => (
              <button key={issue.id} onClick={() => openIssue(issue.id)} className={`w-full text-left p-4 hover:bg-blue-50/50 transition ${selectedIssue?.id === issue.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${statusClass(issue.status)}`}>{issue.status}</span>
                      {issue.ai_priority && <span className="text-xs text-gray-500">AI {String(issue.ai_priority).replaceAll('_', ' ')}</span>}
                    </div>
                    <p className="font-semibold text-gray-900 mt-2">{issue.defect_type}</p>
                    <p className="text-xs text-gray-500 mt-1">{issue.assigned_staff_name || issue.assigned_staff_code || 'Unassigned'} · {issue.run_id || issue.inspection_id.slice(0, 10)}</p>
                  </div>
                  {issue.last_location_proximity && <span className="text-xs text-gray-500">{issue.last_location_proximity}</span>}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card padding="p-5" hover={false} className="lg:sticky lg:top-20">
          {!selectedIssue ? (
            <div className="py-16 text-center text-gray-500">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-3">Select an issue to review engineering progress.</p>
            </div>
          ) : (
            <div className="space-y-5 max-h-[78vh] overflow-auto pr-1">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClass(selectedIssue.status)}`}>{selectedIssue.status}</span>
                  <span className="text-xs text-gray-400">Updated {formatDate(selectedIssue.updated_at)}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mt-2">{selectedIssue.defect_type}</h2>
                <p className="text-sm text-gray-500 mt-1">Confidence {selectedIssue.confidence != null ? `${(selectedIssue.confidence * 100).toFixed(1)}%` : '—'} · {selectedIssue.rail_side || 'rail side unknown'}</p>
              </div>

              <div className="border border-gray-200 rounded-xl p-3">
                <label className="text-xs font-semibold text-gray-500 uppercase">Assigned Track Engineer</label>
                <select value={selectedIssue.assigned_staff_id || ''} onChange={(event) => assign(event.target.value)} disabled={busy} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm">
                  <option value="">Unassigned</option>
                  {engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.name} ({engineer.staff_id})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 rounded-xl p-3"><span className="text-xs text-gray-500">Location check</span><p className="font-semibold mt-1">{selectedIssue.last_location_proximity || 'Not checked'}</p></div>
                <div className="bg-gray-50 rounded-xl p-3"><span className="text-xs text-gray-500">Distance</span><p className="font-semibold mt-1">{selectedIssue.last_location_distance_miles != null ? `${Number(selectedIssue.last_location_distance_miles).toFixed(3)} mi` : '—'}</p></div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Admin stage override / reopen</label>
                <textarea value={adminStatusNote} onChange={(event) => setAdminStatusNote(event.target.value)} rows={2} placeholder="Reason / resolution note…" className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm" />
                <select value={selectedIssue.status} onChange={(event) => updateStatus(event.target.value)} disabled={busy} className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 bg-white text-sm">
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2"><Bot className="w-4 h-4 text-purple-600" /><h3 className="font-semibold">AI review available to engineer</h3></div>
                <pre className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs whitespace-pre-wrap break-words max-h-52 overflow-auto">{JSON.stringify(selectedIssue.ai_snapshot?.event_visual_review || selectedIssue.ai_snapshot?.inspection_advisory || {}, null, 2)}</pre>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2"><MessageSquare className="w-4 h-4 text-blue-600" /><h3 className="font-semibold">Progress conversation</h3></div>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {[...(selectedIssue.activities || [])].reverse().map((activity) => (
                    <div key={activity.id} className="border border-gray-200 rounded-lg p-2.5 text-sm">
                      <div className="flex justify-between gap-2"><strong>{activity.actor_name || 'System'}</strong><span className="text-xs text-gray-400">{formatDate(activity.created_at)}</span></div>
                      {activity.message_kind && <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">{activity.message_kind}</span>}
                      {activity.from_status && <p className="text-xs text-gray-500 mt-1">{activity.from_status} → {activity.to_status}</p>}
                      {activity.message && <p className="mt-1 whitespace-pre-wrap">{activity.message}</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[120px_1fr] gap-2">
                  <select value={commentKind} onChange={(event) => setCommentKind(event.target.value)} className="border border-gray-200 rounded-lg px-2 text-sm bg-white">
                    <option value="COMMENT">Comment</option>
                    <option value="QUESTION">Question</option>
                    <option value="SUGGESTION">Suggestion</option>
                  </select>
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} placeholder="Ask a question, suggest an action, or leave a note…" className="border border-gray-200 rounded-lg p-2 text-sm" />
                </div>
                <Button className="mt-2 w-full" disabled={busy || !comment.trim()} onClick={addComment}>Post to engineer</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default TrackIssuesAdminPage;
