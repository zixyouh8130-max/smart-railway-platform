import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
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
import AIReviewPanel from '@/components/TrackIssues/AIReviewPanel';
import InspectionCaseAIReview from '@/components/TrackIssues/InspectionCaseAIReview';

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFYING', 'BLOCKED', 'REOPENED', 'COMPLETED'];
const humanize = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const statusClass = (status) => ({
  OPEN: 'bg-red-50 text-red-700 border-red-200',
  ACKNOWLEDGED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  VERIFYING: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  BLOCKED: 'bg-gray-100 text-gray-700 border-gray-300',
  REOPENED: 'bg-orange-50 text-orange-700 border-orange-200',
}[status] || 'bg-gray-50 text-gray-700 border-gray-200');

const inspectionLabel = (inspection) => inspection?.run_id || inspection?.gpx_name || inspection?.video_name || inspection?.id || 'Inspection';

const TrackIssuesAdminPage = () => {
  const [cases, setCases] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedFindingId, setSelectedFindingId] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [engineerFilter, setEngineerFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState('COMMENT');
  const [adminStatusNote, setAdminStatusNote] = useState('');
  const [findingComment, setFindingComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setError('');
      const [caseData, engineerData, inspectionData, statData] = await Promise.all([
        trackIssuesApi.getCases(),
        trackIssuesApi.getEngineers(),
        inspectionApi.getInspections(50, 0),
        trackIssuesApi.getStatistics(),
      ]);
      setCases(caseData || []);
      setEngineers(engineerData || []);
      setInspections(inspectionData || []);
      setStats(statData || null);
      if (!selectedInspection && inspectionData?.length) setSelectedInspection(inspectionData[0].id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inspection maintenance cases.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCase = async (id) => {
    setBusy(true);
    try {
      const detail = await trackIssuesApi.getById(id);
      setSelectedCase(detail);
      setSelectedFindingId(detail.issues?.[0]?.id || null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inspection case.');
    } finally { setBusy(false); }
  };

  const syncInspection = async () => {
    if (!selectedInspection) return;
    setBusy(true);
    try {
      const result = await trackIssuesApi.syncInspection(selectedInspection);
      setSuccess(`Inspection case synced: ${result.issues_created} findings created, ${result.issues_updated} refreshed.`);
      await load();
      await openCase(result.case_id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail || 'Failed to sync inspection.'));
    } finally { setBusy(false); }
  };

  const assign = async (staffId) => {
    if (!selectedCase) return;
    setBusy(true);
    try {
      setSelectedCase(await trackIssuesApi.assign(selectedCase.id, staffId || null));
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update case assignment.');
    } finally { setBusy(false); }
  };

  const updateStatus = async (status) => {
    if (!selectedCase) return;
    if (['BLOCKED', 'REOPENED', 'COMPLETED'].includes(status) && !adminStatusNote.trim()) {
      setError('Add a reason / summary before applying this case status.');
      return;
    }
    setBusy(true);
    try {
      setSelectedCase(await trackIssuesApi.updateStatus(selectedCase.id, status, adminStatusNote.trim() || null));
      setAdminStatusNote('');
      await load();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail || 'Could not update case status.'));
    } finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!selectedCase || !comment.trim()) return;
    setBusy(true);
    try {
      setSelectedCase(await trackIssuesApi.addCaseComment(selectedCase.id, comment.trim(), commentKind));
      setComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not post case message.');
    } finally { setBusy(false); }
  };

  const addFindingComment = async () => {
    if (!selectedCase || !selectedFindingId || !findingComment.trim()) return;
    setBusy(true);
    try {
      setSelectedCase(await trackIssuesApi.addIssueComment(selectedCase.id, selectedFindingId, findingComment.trim(), 'QUESTION'));
      setFindingComment('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not post finding-specific question.');
    } finally { setBusy(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (engineerFilter === 'UNASSIGNED' && item.assigned_staff_id) return false;
      if (engineerFilter !== 'ALL' && engineerFilter !== 'UNASSIGNED' && item.assigned_staff_id !== engineerFilter) return false;
      if (!q) return true;
      return [item.inspection_id, item.run_id, item.status, item.ai_overall_priority, item.assigned_staff_name, item.assigned_staff_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [cases, statusFilter, engineerFilter, search]);

  const selectedFinding = selectedCase?.issues?.find((item) => item.id === selectedFindingId) || null;

  return (
    <div className="max-w-[1500px] mx-auto space-y-5 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Track Inspection Maintenance</h1>
          <p className="text-sm text-gray-500 mt-1">Assign one Track Engineer to a complete AI inspection case and monitor every defect checklist outcome.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          ['Cases', stats?.total_cases ?? 0, ClipboardCheck],
          ['Open work', stats?.open_cases ?? 0, Wrench],
          ['Unassigned', stats?.unassigned_cases ?? 0, UserRoundCog],
          ['Needs field check', stats?.needs_field_check ?? 0, AlertTriangle],
          ['Follow-up findings', stats?.follow_up_findings ?? 0, MessageSquare],
          ['Completed', stats?.completed_cases ?? 0, CheckCircle2],
        ].map(([label, value, Icon]) => (
          <Card key={label} padding="p-4" hover={false}><Icon className="w-5 h-5 text-emerald-600" /><p className="text-2xl font-bold mt-2">{value}</p><p className="text-xs text-gray-500">{label}</p></Card>
        ))}
      </div>

      <Card padding="p-4" hover={false}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-600">AI inspection</label>
            <select value={selectedInspection} onChange={(e) => setSelectedInspection(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2 bg-white text-sm">
              {inspections.map((inspection) => <option key={inspection.id} value={inspection.id}>{inspectionLabel(inspection)}</option>)}
            </select>
          </div>
          <Button onClick={syncInspection} disabled={busy || !selectedInspection}>Sync / create maintenance case</Button>
        </div>
      </Card>

      <div className="grid xl:grid-cols-[0.9fr_1.6fr] gap-5">
        <Card padding="p-4" hover={false}>
          <div className="grid md:grid-cols-3 xl:grid-cols-1 gap-2 mb-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cases…" className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="ALL">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <select value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="ALL">All engineers</option><option value="UNASSIGNED">Unassigned</option>{engineers.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.staff_id})</option>)}</select>
          </div>

          <div className="space-y-2 max-h-[760px] overflow-auto">
            {loading ? <p className="text-sm text-gray-500 py-8 text-center">Loading…</p> : filtered.map((item) => (
              <button type="button" key={item.id} onClick={() => openCase(item.id)} className={`w-full text-left border rounded-xl p-3 ${selectedCase?.id === item.id ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex flex-wrap gap-2"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusClass(item.status)}`}>{humanize(item.status)}</span><span className="text-[10px] text-gray-500">{humanize(item.ai_overall_priority)}</span></div>
                <p className="font-semibold text-gray-900 mt-2">Inspection case</p>
                <p className="text-xs text-gray-500 break-all">{item.inspection_id}</p>
                <p className="text-xs text-gray-600 mt-1">{item.completed_findings}/{item.total_findings} completed · {item.assigned_staff_name || 'Unassigned'}</p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${item.progress_percent || 0}%` }} /></div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          {!selectedCase ? (
            <Card padding="p-10" hover={false} className="text-center"><ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto" /><p className="mt-3 text-gray-600">Select an inspection case to review its engineer and defect checklist.</p></Card>
          ) : (
            <>
              <Card padding="p-5" hover={false}>
                <div className="flex flex-col lg:flex-row justify-between gap-4">
                  <div><span className={`px-2 py-1 rounded-full border text-xs ${statusClass(selectedCase.status)}`}>{humanize(selectedCase.status)}</span><h2 className="text-xl font-bold mt-2">Inspection Case</h2><p className="text-xs text-gray-500 break-all">{selectedCase.inspection_id}</p></div>
                  <div className="min-w-64"><label className="text-xs font-semibold text-gray-600">Assigned Track Engineer</label><select value={selectedCase.assigned_staff_id || ''} onChange={(e) => assign(e.target.value || null)} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"><option value="">Unassigned</option>{engineers.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.staff_id})</option>)}</select></div>
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">{[['Findings', selectedCase.total_findings], ['Checked', selectedCase.checked_findings], ['Completed', selectedCase.completed_findings], ['False positive', selectedCase.false_positive_count], ['Follow-up', selectedCase.follow_up_count]].map(([label, value]) => <div key={label} className="bg-gray-50 rounded-xl p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-gray-500">{label}</p></div>)}</div>
              </Card>

              <Card padding="p-5" hover={false}><InspectionCaseAIReview inspectionCase={selectedCase} /></Card>

              <Card padding="p-5" hover={false}>
                <h3 className="font-bold">Case administration</h3>
                <div className="mt-3 grid md:grid-cols-[200px_1fr_auto] gap-2">
                  <select value={selectedCase.status} onChange={(e) => updateStatus(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
                  <input value={adminStatusNote} onChange={(e) => setAdminStatusNote(e.target.value)} placeholder="Reason / override note / completion summary…" className="border rounded-xl px-3 py-2 text-sm" />
                  <span className="text-xs text-gray-400 self-center">Status changes are audited</span>
                </div>
              </Card>

              <Card padding="p-5" hover={false}>
                <h3 className="font-bold">Defect checklist</h3>
                <div className="mt-3 grid lg:grid-cols-[0.9fr_1.1fr] gap-4">
                  <div className="space-y-2 max-h-[600px] overflow-auto">
                    {(selectedCase.issues || []).map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedFindingId(item.id)} className={`w-full text-left rounded-xl border p-3 ${selectedFindingId === item.id ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200'}`}>
                        <div className="flex justify-between gap-2"><p className="font-semibold">{item.defect_type}</p><span>{item.checklist_complete ? '✓' : '•'}</span></div>
                        <p className="text-xs text-gray-500 mt-1">{humanize(item.ai_priority)} · {humanize(item.field_verification_status)} · {humanize(item.maintenance_status)}</p>
                      </button>
                    ))}
                  </div>
                  <div>{selectedFinding ? <><AIReviewPanel issue={selectedFinding} compact /><div className="mt-4 rounded-xl border p-3"><p className="font-semibold">Human outcome</p><p className="text-sm mt-2">Field: {humanize(selectedFinding.field_verification_status)}</p>{selectedFinding.field_verification_note && <p className="text-sm text-gray-600 mt-1">{selectedFinding.field_verification_note}</p>}<p className="text-sm mt-2">Maintenance: {humanize(selectedFinding.maintenance_status)}</p>{selectedFinding.maintenance_note && <p className="text-sm text-gray-600 mt-1">{selectedFinding.maintenance_note}</p>}</div><div className="mt-3 flex gap-2"><input value={findingComment} onChange={(e) => setFindingComment(e.target.value)} placeholder="Ask engineer about this finding…" className="flex-1 border rounded-xl px-3 py-2 text-sm" /><Button onClick={addFindingComment} disabled={!findingComment.trim() || busy}>Ask</Button></div></> : <p className="text-sm text-gray-500">Select a finding.</p>}</div>
                </div>
              </Card>

              <Card padding="p-5" hover={false}>
                <h3 className="font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4" />Case conversation & audit</h3>
                <div className="mt-3 space-y-3 max-h-80 overflow-auto">{[...(selectedCase.activities || [])].reverse().map((a) => <div key={a.id} className="border-l-2 pl-3"><div className="text-xs text-gray-500 flex flex-wrap gap-2"><strong className="text-gray-700">{a.actor_name || a.actor_staff_id || 'System'}</strong><span>{humanize(a.activity_type)}</span>{a.issue_defect_type && <span className="text-emerald-700">Finding: {a.issue_defect_type}</span>}<span>{new Date(a.created_at).toLocaleString()}</span></div>{a.message && <p className="text-sm mt-1 text-gray-700">{a.message}</p>}</div>)}</div>
                <div className="mt-4 grid sm:grid-cols-[150px_1fr_auto] gap-2"><select value={commentKind} onChange={(e) => setCommentKind(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="COMMENT">Comment</option><option value="QUESTION">Question</option><option value="SUGGESTION">Suggestion</option></select><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Message the assigned engineer about the whole case…" className="border rounded-xl px-3 py-2 text-sm" /><Button onClick={addComment} disabled={!comment.trim() || busy}>Send</Button></div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrackIssuesAdminPage;
