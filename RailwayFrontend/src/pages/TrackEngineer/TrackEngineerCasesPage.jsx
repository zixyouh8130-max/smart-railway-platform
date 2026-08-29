import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CaseKanban from '@/components/TrackIssues/CaseKanban';
import CaseAIReviewDialog from '@/components/TrackIssues/CaseAIReviewDialog';
import workflowApi from '@/api/trackEngineerWorkflowApi';

const TrackEngineerCasesPage = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [aiCase, setAiCase] = useState(null);

  const loadCases = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const result = await workflowApi.getMine(includeCompleted);
      setCases(result);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'သင့်အား တာဝန်ပေးထားသော စစ်ဆေးမှုကိစ္စများကို မရယူနိုင်ပါ။',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [includeCompleted]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6" lang="my">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">
                လမ်းကြောင်းအင်ဂျင်နီယာ
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                ကျွန်ုပ်၏ စစ်ဆေးမှုကိစ္စများ
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                AI စစ်ဆေးမှုတစ်ခုစီကို ကိစ္စတစ်ခုအဖြစ် ကိုင်တွယ်ပြီး၊ တွေ့ရှိချက်များကို လုပ်ငန်းစဉ်ဘုတ်မှတစ်ဆင့် ဆောင်ရွက်ပါ။
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadCases(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              ပြန်လည်တင်ရန်
            </button>
          </div>

          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(event) => setIncludeCompleted(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            ပြီးစီးထားသော ကိစ္စများကိုပါ ပြရန်
          </label>
        </header>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
              <p className="mt-3 text-sm text-slate-500">
                စစ်ဆေးမှုကိစ္စများကို ရယူနေပါသည်…
              </p>
            </div>
          </div>
        ) : (
          <CaseKanban
            cases={cases}
            onOpenCase={(caseItem) => {
              navigate(`/train-rider/issues/${caseItem.id}`);
            }}
            onOpenAI={setAiCase}
          />
        )}
      </div>

      <CaseAIReviewDialog
        inspectionCase={aiCase}
        open={Boolean(aiCase)}
        onClose={() => setAiCase(null)}
      />
    </div>
  );
};

export default TrackEngineerCasesPage;
