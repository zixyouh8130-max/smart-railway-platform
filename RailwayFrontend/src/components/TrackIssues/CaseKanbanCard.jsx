import React from 'react';
import {
  Bot,
  ChevronRight,
  ClipboardList,
  UserRound,
} from 'lucide-react';
import {
  caseDisplayName,
  getCaseIssueCount,
  getCaseProgress,
  priorityClasses,
  priorityLabel,
  shortId,
} from './kanbanUtils';

const CaseKanbanCard = ({ caseItem, onOpen, onOpenAI }) => {
  const progress = getCaseProgress(caseItem);
  const count = getCaseIssueCount(caseItem);

  const engineer =
    caseItem.assigned_staff_name ||
    caseItem.assigned_engineer_name ||
    caseItem.assigned_staff_code ||
    'လမ်းကြောင်းအင်ဂျင်နီယာ';

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(caseItem)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(caseItem);
        }
      }}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">
            စစ်ဆေးမှု ကိစ္စ
          </p>

          <h3 className="mt-1 break-words font-semibold leading-5 text-slate-900">
            {caseDisplayName(caseItem)}
          </h3>

          <p className="mt-1 text-[11px] text-slate-400">
            ID #{shortId(caseItem.id)}
          </p>
        </div>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>

      <div className="mt-3">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${priorityClasses(
            caseItem.ai_overall_priority,
          )}`}
        >
          {priorityLabel(caseItem.ai_overall_priority || 'ROUTINE')}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        <ClipboardList className="h-4 w-4 text-slate-400" />
        <span>တွေ့ရှိချက် {count} ခု</span>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-500">တိုးတက်မှု</span>
          <span className="font-semibold text-slate-700">{progress}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-700 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <UserRound className="h-4 w-4" />
        <span className="truncate">{engineer}</span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenAI?.(caseItem);
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
      >
        <Bot className="h-4 w-4" />
        AI ကိစ္စသုံးသပ်ချက်
      </button>
    </article>
  );
};

export default CaseKanbanCard;
