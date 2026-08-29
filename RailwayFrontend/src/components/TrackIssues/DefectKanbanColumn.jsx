import React from 'react';
import {
  CheckCircle2,
  Clock3,
  Eye,
  Hammer,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react';
import DefectKanbanCard from './DefectKanbanCard';

const icons = {
  search: Search,
  eye: Eye,
  wrench: Wrench,
  hammer: Hammer,
  clock: Clock3,
  x: XCircle,
  check: CheckCircle2,
};

const DefectKanbanColumn = ({
  column,
  issues,
  onOpenIssue,
  onOpenAI,
}) => {
  const Icon = icons[column.icon] || Search;

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-700">
            {column.label}
          </h3>
        </div>

        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 shadow-sm">
          {issues.length}
        </span>
      </header>

      <div className="space-y-3">
        {issues.map((issue) => (
          <DefectKanbanCard
            key={issue.id}
            issue={issue}
            onOpen={onOpenIssue}
            onOpenAI={onOpenAI}
          />
        ))}

        {!issues.length && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-7 text-center text-xs text-slate-400">
            တွေ့ရှိချက် မရှိပါ
          </div>
        )}
      </div>
    </section>
  );
};

export default DefectKanbanColumn;
