import React, { useState } from 'react';
import { AlertTriangle, Bot, Info, ShieldCheck } from 'lucide-react';

const humanize = (value) => String(value || 'unassessed').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const priorityClass = (priority) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('priority') || value.includes('urgent') || value.includes('high')) return 'bg-red-50 text-red-700 border-red-200';
  if (value.includes('monitor') || value.includes('medium')) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const AIReviewPanel = ({ issue, compact = false }) => {
  const [showRaw, setShowRaw] = useState(false);
  const snapshot = issue?.ai_snapshot || {};
  const context = snapshot.event_context || {};
  const visual = snapshot.event_visual_review || {};
  const matchedArea = context.matched_area;
  const highPriorityEvent = context.matched_high_priority_event;
  const checks = context.recommended_checks || visual.recommended_checks || [];
  const reason = context.priority_reason || visual.assessment || visual.summary || visual.reason;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-gray-900">AI finding review</h3>
        <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${priorityClass(issue?.ai_priority)}`}>
          {humanize(issue?.ai_priority)}
        </span>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>This is event-specific AI evidence. The inspection-wide summary is shown once at case level. Field personnel must confirm the physical condition.</p>
      </div>

      <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This finding</p>
          <p className="font-semibold text-gray-900 mt-1">{issue?.defect_type}</p>
          <div className="mt-2 text-sm text-gray-600 space-y-1">
            <p>Confidence: {issue?.confidence != null ? `${(Number(issue.confidence) * 100).toFixed(1)}%` : '—'}</p>
            <p>Rail side: {issue?.rail_side || '—'}</p>
            <p>Inspection position: {issue?.distance_from_start_miles != null ? `${Number(issue.distance_from_start_miles).toFixed(3)} mi` : '—'}</p>
            {snapshot.event_representative_timestamp != null && <p>Video time: {Number(snapshot.event_representative_timestamp).toFixed(2)} s</p>}
            {snapshot.event_representative_frame != null && <p>Representative frame: {snapshot.event_representative_frame}</p>}
            {snapshot.event_detection_count != null && <p>Detection count: {snapshot.event_detection_count}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Why this priority</p>
          <p className="text-sm text-gray-700 mt-2">{reason || 'No event-specific priority explanation was provided.'}</p>
          <p className="text-[11px] text-gray-500 mt-2">Source: {humanize(context.priority_source)}</p>
        </div>
      </div>

      {visual && (visual.assessment || visual.summary) && (
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="font-semibold text-gray-900">Visual assessment</p>
          <p className="text-sm text-gray-700 mt-2">{visual.assessment || visual.summary}</p>
        </div>
      )}

      {checks.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-700" /><p className="font-semibold text-emerald-900">Recommended field checks</p></div>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {checks.map((item, index) => <li key={index}>• {item}</li>)}
          </ul>
        </div>
      )}

      {(matchedArea || highPriorityEvent) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-700" /><p className="font-semibold text-amber-900">AI context around this finding</p></div>
          {matchedArea && <>
            <p className="text-sm text-gray-700 mt-2">{matchedArea.assessment || 'This finding belongs to an AI-identified area of attention.'}</p>
            <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
              {matchedArea.start_distance_m != null && matchedArea.end_distance_m != null && <span>{matchedArea.start_distance_m}–{matchedArea.end_distance_m} m</span>}
              {matchedArea.rail_side && <span>{humanize(matchedArea.rail_side)} rail</span>}
              {matchedArea.event_count != null && <span>{matchedArea.event_count} events</span>}
            </div>
            {matchedArea.defect_counts && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(matchedArea.defect_counts).map(([name, count]) => <span key={name} className="px-2 py-1 rounded bg-white border border-amber-200 text-xs">{name} × {count}</span>)}</div>}
          </>}
          {highPriorityEvent && !matchedArea && <p className="text-sm text-gray-700 mt-2">{highPriorityEvent.assessment || 'The AI advisory identifies this as an individual high-priority event.'}</p>}
        </div>
      )}

      <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs text-gray-500 underline">
        {showRaw ? 'Hide technical event data' : 'Show technical event data'}
      </button>
      {showRaw && <pre className="bg-slate-950 text-slate-100 rounded-xl p-3 text-[11px] whitespace-pre-wrap break-words max-h-80 overflow-auto">{JSON.stringify(snapshot, null, 2)}</pre>}
    </div>
  );
};

export default AIReviewPanel;
