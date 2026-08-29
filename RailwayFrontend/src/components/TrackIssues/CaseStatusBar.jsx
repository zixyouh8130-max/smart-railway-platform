import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  CircleSlash2,
} from 'lucide-react';
import { caseStatusLabel } from './kanbanUtils';

const PRIMARY_STEPS = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'VERIFYING',
  'COMPLETED',
];

const CaseStatusBar = ({ status }) => {
  const current = String(status || 'OPEN').toUpperCase();
  const normalized = current === 'REOPENED' ? 'OPEN' : current;
  const currentIndex = PRIMARY_STEPS.indexOf(normalized);
  const blocked = current === 'BLOCKED';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {blocked && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          <CircleSlash2 className="h-4 w-4" />
          ဤCaseကို လောလောဆယ် ရပ်တန့်ထားပါသည်။
        </div>
      )}

      <div className="flex min-w-[780px] items-center">
        {PRIMARY_STEPS.map((step, index) => {
          const done = !blocked && currentIndex > index;
          const active = !blocked && currentIndex === index;

          return (
            <React.Fragment key={step}>
              <div className="flex flex-1 items-center gap-2">
                <div
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                    done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : active
                        ? 'border-slate-700 bg-slate-700 text-white'
                        : 'border-slate-200 bg-white text-slate-400',
                  ].join(' ')}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <CircleDot className="h-4 w-4" />
                  )}
                </div>

                <span
                  className={[
                    'whitespace-nowrap text-sm font-medium',
                    active
                      ? 'text-slate-900'
                      : done
                        ? 'text-emerald-700'
                        : 'text-slate-400',
                  ].join(' ')}
                >
                  {caseStatusLabel(step)}
                </span>
              </div>

              {index < PRIMARY_STEPS.length - 1 && (
                <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-slate-300" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default CaseStatusBar;
