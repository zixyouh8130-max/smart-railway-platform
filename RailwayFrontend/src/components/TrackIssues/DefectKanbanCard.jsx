import React from 'react';
import {
  Bot,
  MapPin,
} from 'lucide-react';
import {
  formatDistanceFromStart,
  humanize,
  priorityClasses,
} from './kanbanUtils';

const DefectKanbanCard = ({ issue, onOpen, onOpenAI }) => {
  const distance = formatDistanceFromStart(issue.distance_from_start_miles);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(issue)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(issue);
        }
      }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-5 text-slate-900">
          {issue.defect_type || 'Unnamed finding'}
        </h3>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenAI?.(issue);
          }}
          className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 p-1.5 text-violet-700 transition hover:bg-violet-100"
          title="Open AI finding review"
          aria-label="Open AI finding review"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityClasses(
            issue.ai_priority,
          )}`}
        >
          {humanize(issue.ai_priority || 'Routine')}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-slate-500">
        {issue.rail_side && (
          <p>
            Rail: <span className="font-medium text-slate-700">{humanize(issue.rail_side)}</span>
          </p>
        )}

        {distance && <p>{distance}</p>}

        <p>
          Field:{' '}
          <span className="font-medium text-slate-700">
            {humanize(issue.field_verification_status)}
          </span>
        </p>

        <p>
          Maintenance:{' '}
          <span className="font-medium text-slate-700">
            {humanize(issue.maintenance_status)}
          </span>
        </p>

        {issue.latitude != null && issue.longitude != null && (
          <p className="flex items-center gap-1 pt-1 text-emerald-700">
            <MapPin className="h-3.5 w-3.5" />
            GPS available
          </p>
        )}
      </div>
    </article>
  );
};

export default DefectKanbanCard;
