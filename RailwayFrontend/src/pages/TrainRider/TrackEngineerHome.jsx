import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import trackIssuesApi from '@/api/trackIssues';

const STATUS_META = {
  OPEN: ['Open', 'bg-red-50 text-red-700 border-red-200'],
  ACKNOWLEDGED: ['Acknowledged', 'bg-blue-50 text-blue-700 border-blue-200'],
  INSPECTING: ['Inspecting', 'bg-cyan-50 text-cyan-700 border-cyan-200'],
  REPAIRING: ['Repairing', 'bg-amber-50 text-amber-800 border-amber-200'],
  VERIFYING: ['Verifying', 'bg-purple-50 text-purple-700 border-purple-200'],
  RESOLVED: ['Resolved', 'bg-green-50 text-green-700 border-green-200'],
  BLOCKED: ['Blocked', 'bg-gray-100 text-gray-700 border-gray-300'],
  REOPENED: ['Reopened', 'bg-orange-50 text-orange-700 border-orange-200'],
};

const priorityClass = (priority) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('urgent') || value.includes('critical')) return 'text-red-700 bg-red-50';
  if (value.includes('priority') || value.includes('high')) return 'text-amber-800 bg-amber-50';
  if (value.includes('monitor') || value.includes('medium')) return 'text-blue-700 bg-blue-50';
  return 'text-gray-600 bg-gray-50';
};

const IssueCard = ({ issue, nearby = false, onOpen, onClaim }) => {
  const [statusLabel, statusClass] = STATUS_META[issue.status] || [issue.status, 'bg-gray-50 text-gray-700'];

  return (
    <Card padding="p-4" hover={false} className="border border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClass}`}>
              {statusLabel}
            </span>
            {issue.ai_priority && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityClass(issue.ai_priority)}`}>
                AI: {String(issue.ai_priority).replaceAll('_', ' ')}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-base font-bold text-gray-900">{issue.defect_type}</h3>
          <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            {issue.rail_side && <span>Rail: {issue.rail_side}</span>}
            {issue.confidence != null && <span>Confidence: {(issue.confidence * 100).toFixed(1)}%</span>}
            {issue.distance_from_start_miles != null && (
              <span>Inspection position: {Number(issue.distance_from_start_miles).toFixed(2)} mi</span>
            )}
          </div>
        </div>
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      </div>

      {nearby && issue.distance_to_engineer_miles != null && (
        <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
          <MapPin className="w-4 h-4" />
          {Number(issue.distance_to_engineer_miles).toFixed(2)} mi from your current location
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => onOpen(issue.id)}>
          Open issue
        </Button>
        {nearby && !issue.assigned_staff_id && (
          <Button size="sm" variant="outline" onClick={() => onClaim(issue.id)}>
            Claim
          </Button>
        )}
      </div>
    </Card>
  );
};

const TrackEngineerHome = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [nearbyIssues, setNearbyIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadIssues = async () => {
    try {
      setError('');
      const data = await trackIssuesApi.getMine(false);
      setIssues(data || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load assigned track issues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((issue) =>
      [issue.defect_type, issue.ai_priority, issue.status, issue.run_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [issues, search]);

  const counts = useMemo(() => ({
    assigned: issues.length,
    repairing: issues.filter((item) => item.status === 'REPAIRING').length,
    verifying: issues.filter((item) => item.status === 'VERIFYING').length,
    onSiteVerified: issues.filter((item) => item.location_verified_at).length,
  }), [issues]);

  const findNearby = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setNearbyLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const data = await trackIssuesApi.getNearby({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            radiusMiles: 5,
          });
          setNearbyIssues(data || []);
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to search nearby issues.');
        } finally {
          setNearbyLoading(false);
        }
      },
      (geoError) => {
        setError(`Could not read current location: ${geoError.message}`);
        setNearbyLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const claim = async (issueId) => {
    try {
      await trackIssuesApi.claim(issueId);
      await loadIssues();
      setNearbyIssues((previous) => previous.filter((item) => item.id !== issueId));
      navigate(`/train-rider/issues/${issueId}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not claim this issue.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
            <Wrench className="w-4 h-4" /> Track Engineering
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Maintenance Issues</h1>
          <p className="text-sm text-gray-500 mt-1">
            Verify AI findings on site, repair defects, and record progress for operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadIssues} icon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button onClick={findNearby} disabled={nearbyLoading} icon={<Crosshair className="w-4 h-4" />}>
            {nearbyLoading ? 'Locating…' : 'Find nearby issues'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Assigned', counts.assigned, AlertTriangle],
          ['Repairing', counts.repairing, Wrench],
          ['Verifying', counts.verifying, ShieldCheck],
          ['Location verified', counts.onSiteVerified, CheckCircle2],
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
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search defect, priority, status or inspection run…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <section>
        <h2 className="font-bold text-gray-900 mb-3">My assigned issues</h2>
        {loading ? (
          <div className="py-10 text-center text-gray-500">Loading issues…</div>
        ) : filtered.length === 0 ? (
          <Card padding="p-8" hover={false} className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="font-semibold text-gray-800 mt-3">No active assigned issues</p>
            <p className="text-sm text-gray-500 mt-1">Use “Find nearby issues” to discover unassigned AI findings around you.</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onOpen={(id) => navigate(`/train-rider/issues/${id}`)} />
            ))}
          </div>
        )}
      </section>

      {nearbyIssues.length > 0 && (
        <section>
          <h2 className="font-bold text-gray-900 mb-3">Nearby open findings</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nearbyIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                nearby
                onOpen={(id) => navigate(`/train-rider/issues/${id}`)}
                onClaim={claim}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default TrackEngineerHome;
