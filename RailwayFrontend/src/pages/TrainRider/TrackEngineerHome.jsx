import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  MapPin,
  RefreshCw,
  Search,
  Wrench,
} from 'lucide-react';

import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import trackIssuesApi from '@/api/trackIssues';

const STATUS_META = {
  OPEN: ['Open', 'bg-red-50 text-red-700 border-red-200'],
  ACKNOWLEDGED: ['Acknowledged', 'bg-blue-50 text-blue-700 border-blue-200'],
  IN_PROGRESS: ['In progress', 'bg-cyan-50 text-cyan-700 border-cyan-200'],
  VERIFYING: ['Verifying', 'bg-purple-50 text-purple-700 border-purple-200'],
  COMPLETED: ['Completed', 'bg-green-50 text-green-700 border-green-200'],
  BLOCKED: ['Blocked', 'bg-gray-100 text-gray-700 border-gray-300'],
  REOPENED: ['Reopened', 'bg-orange-50 text-orange-700 border-orange-200'],
};

const priorityClass = (priority) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('priority') || value.includes('urgent') || value.includes('critical') || value.includes('high')) return 'text-red-700 bg-red-50 border-red-200';
  if (value.includes('monitor') || value.includes('medium')) return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
};

const CaseCard = ({ item, nearby = false, onOpen, onClaim }) => {
  const [statusLabel, statusClass] = STATUS_META[item.status] || [item.status, 'bg-gray-50 text-gray-700 border-gray-200'];
  const remaining = Math.max(0, (item.total_findings || 0) - (item.completed_findings || 0));
  return (
    <Card padding="p-4" hover={false} className="border border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
            <span className={`px-2 py-1 rounded-full border text-xs font-medium ${priorityClass(item.ai_overall_priority)}`}>
              AI: {String(item.ai_overall_priority || 'unassessed').replaceAll('_', ' ')}
            </span>
          </div>
          <h3 className="mt-2 text-base font-bold text-gray-900">Inspection case</h3>
          <p className="text-xs text-gray-500 break-all">{item.inspection_id}</p>
          <div className="mt-2 text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
            <span>{item.total_findings || 0} findings</span>
            <span>{item.completed_findings || 0} completed</span>
            <span>{remaining} remaining</span>
            {item.false_positive_count > 0 && <span>{item.false_positive_count} not confirmed</span>}
          </div>
        </div>
        <ClipboardCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Checklist progress</span><span>{Number(item.progress_percent || 0).toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, item.progress_percent || 0)}%` }} />
        </div>
      </div>

      {nearby && item.distance_to_engineer_miles != null && (
        <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
          <MapPin className="w-4 h-4" />
          Nearest finding {Number(item.distance_to_engineer_miles).toFixed(2)} mi away
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => onOpen(item.id)}>Open case</Button>
        {nearby && !item.assigned_staff_id && (
          <Button size="sm" variant="outline" onClick={() => onClaim(item.id)}>Claim case</Button>
        )}
      </div>
    </Card>
  );
};

const TrackEngineerHome = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadCases = async () => {
    try {
      setError('');
      setCases((await trackIssuesApi.getMine(false)) || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load assigned inspection cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCases(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((item) => [item.inspection_id, item.run_id, item.status, item.ai_overall_priority]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [cases, search]);

  const counts = useMemo(() => ({
    assigned: cases.length,
    active: cases.filter((item) => ['ACKNOWLEDGED', 'IN_PROGRESS', 'VERIFYING', 'REOPENED'].includes(item.status)).length,
    needsFieldCheck: cases.reduce((sum, item) => sum + Math.max(0, (item.total_findings || 0) - (item.checked_findings || 0)), 0),
    blocked: cases.filter((item) => item.status === 'BLOCKED').length,
  }), [cases]);

  const findNearby = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          setNearby((await trackIssuesApi.getNearby({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radiusMiles: 5,
          })) || []);
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to search nearby inspection cases.');
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setError(`Could not read current location: ${geoError.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const claim = async (caseId) => {
    try {
      await trackIssuesApi.claim(caseId);
      await loadCases();
      setNearby((items) => items.filter((item) => item.id !== caseId));
      navigate(`/train-rider/issues/${caseId}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not claim this inspection case.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm"><Wrench className="w-4 h-4" /> Track Engineering</div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Inspection Maintenance Cases</h1>
          <p className="text-sm text-gray-500 mt-1">One assigned inspection case contains the complete AI-defect checklist for that track section.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCases} icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
          <Button onClick={findNearby} disabled={locating} icon={<Crosshair className="w-4 h-4" />}>
            {locating ? 'Locating…' : 'Find nearby cases'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Assigned cases', counts.assigned, ClipboardCheck],
          ['Active', counts.active, Wrench],
          ['Unchecked findings', counts.needsFieldCheck, AlertTriangle],
          ['Blocked cases', counts.blocked, CheckCircle2],
        ].map(([label, value, Icon]) => (
          <Card key={label} padding="p-4" hover={false}>
            <Icon className="w-5 h-5 text-emerald-600" />
            <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inspection, run, status or AI priority…" className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <section>
        <h2 className="font-bold text-gray-900 mb-3">My assigned cases</h2>
        {loading ? <div className="py-10 text-center text-gray-500">Loading cases…</div> : filtered.length === 0 ? (
          <Card padding="p-8" hover={false} className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="font-semibold text-gray-800 mt-3">No active inspection cases</p>
            <p className="text-sm text-gray-500 mt-1">Use nearby search to discover an unassigned AI inspection case around you.</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((item) => <CaseCard key={item.id} item={item} onOpen={(id) => navigate(`/train-rider/issues/${id}`)} />)}
          </div>
        )}
      </section>

      {nearby.length > 0 && (
        <section>
          <h2 className="font-bold text-gray-900 mb-3">Nearby inspection cases</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nearby.map((item) => <CaseCard key={item.id} item={item} nearby onOpen={(id) => navigate(`/train-rider/issues/${id}`)} onClaim={claim} />)}
          </div>
        </section>
      )}
    </div>
  );
};

export default TrackEngineerHome;
