import React, { useMemo } from 'react';
import CaseKanbanCard from './CaseKanbanCard';
import { CASE_COLUMNS, normalizeCaseStatus } from './kanbanUtils';

const CaseKanban = ({ cases = [], onOpenCase, onOpenAI }) => {
  const grouped = useMemo(() => {
    const result = Object.fromEntries(
      CASE_COLUMNS.map((column) => [column.key, []]),
    );

    cases.forEach((caseItem) => {
      const key = normalizeCaseStatus(caseItem.status);
      result[key].push(caseItem);
    });

    return result;
  }, [cases]);

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1750px] grid-cols-6 gap-4">
        {CASE_COLUMNS.map((column) => {
          const items = grouped[column.key] || [];

          return (
            <section
              key={column.key}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
            >
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-semibold text-slate-700">
                  {column.label}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 shadow-sm">
                  {items.length}
                </span>
              </header>

              <div className="space-y-3">
                {items.map((caseItem) => (
                  <CaseKanbanCard
                    key={caseItem.id}
                    caseItem={caseItem}
                    onOpen={onOpenCase}
                    onOpenAI={onOpenAI}
                  />
                ))}

                {!items.length && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-8 text-center text-xs text-slate-400">
                    Case မရှိသေးပါ
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default CaseKanban;
