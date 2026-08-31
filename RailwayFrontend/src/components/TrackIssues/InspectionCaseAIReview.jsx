import React, { useState } from 'react';
import { AlertTriangle, Bot, ChevronDown, ChevronUp, Info } from 'lucide-react';

const humanize = (value) => String(value || 'unassessed')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const priorityClass = (priority) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('priority') || value.includes('urgent') || value.includes('critical') || value.includes('high')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (value.includes('monitor') || value.includes('medium')) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const ListBlock = ({ title, items }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide font-semibold text-gray-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-700 list-disc pl-5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
        ))}
      </ul>
    </div>
  );
};

const InspectionCaseAIReview = ({ inspectionCase, compact = false }) => {
  const [expanded, setExpanded] = useState(!compact);
  const [raw, setRaw] = useState(false);
  const snapshot = inspectionCase?.ai_snapshot || {};
  const areas = snapshot.areas_of_attention || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-gray-900">inspection summary</h3>
        <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${priorityClass(inspectionCase?.ai_overall_priority)}`}>
          {humanize(inspectionCase?.ai_overall_priority)}
        </span>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>This is inspection-wide decision support. Each checklist finding below has its own priority and must be field-verified individually.</p>
      </div>

      {snapshot.executive_summary && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500">Executive summary</p>
          <p className="mt-2 text-sm text-gray-700 leading-6">{snapshot.executive_summary}</p>
        </div>
      )}

      {areas.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <p className="font-semibold text-amber-900">Areas of attention</p>
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {areas.map((area, index) => (
              <div key={index} className="bg-white rounded-lg border border-amber-100 p-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-1 rounded-full border ${priorityClass(area.priority)}`}>{humanize(area.priority)}</span>
                  {area.rail_side && <span className="px-2 py-1 rounded-full bg-gray-100">{humanize(area.rail_side)} rail</span>}
                  {area.start_distance_m != null && area.end_distance_m != null && <span>{area.start_distance_m}–{area.end_distance_m} m</span>}
                </div>
                {area.assessment && <p className="mt-2 text-sm text-gray-700">{area.assessment}</p>}
                {area.defect_counts && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(area.defect_counts).map(([name, count]) => (
                      <span key={name} className="text-xs border rounded px-2 py-1">{name} × {count}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        <span>{expanded ? 'Hide full inspection context' : 'Show full inspection context'}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-4">
          <ListBlock title="Key findings" items={snapshot.key_findings} />
          <ListBlock title="Recommended actions" items={snapshot.recommended_actions} />
          {snapshot.trend_assessment && (
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-gray-500">Trend assessment</p>
              <p className="mt-2 text-sm text-gray-700">{snapshot.trend_assessment}</p>
            </div>
          )}
          <ListBlock title="limitations" items={snapshot.limitations} />
        </div>
      )}

      <button type="button" onClick={() => setRaw((v) => !v)} className="text-xs text-gray-500 underline">
        {raw ? 'Hide technical inspection data' : 'Show technical inspection data'}
      </button>
      {raw && (
        <pre className="bg-slate-950 text-slate-100 rounded-xl p-3 text-[11px] whitespace-pre-wrap break-words max-h-80 overflow-auto">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default InspectionCaseAIReview;
