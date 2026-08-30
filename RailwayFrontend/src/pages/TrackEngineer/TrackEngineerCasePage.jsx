import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import AIReviewDialog from '@/components/TrackIssues/AIReviewDialog';
import CaseAIReviewDialog from '@/components/TrackIssues/CaseAIReviewDialog';
import CaseStatusBar from '@/components/TrackIssues/CaseStatusBar';
import Chatter from '@/components/TrackIssues/Chatter';
import DefectDetailPanel from '@/components/TrackIssues/DefectDetailPanel';
import DefectKanban from '@/components/TrackIssues/DefectKanban';
import {
  caseDisplayName,
  caseStatusLabel,
  getCaseProgress,
  getCompletedIssueCount,
  isIssueComplete,
  shortId,
} from '@/components/TrackIssues/kanbanUtils';
import workflowApi from '@/api/trackEngineerWorkflowApi';

const nextPrimaryStatus = (status) => {
  const current = String(status || 'OPEN').toUpperCase();

  const transitions = {
    OPEN: 'ACKNOWLEDGED',
    REOPENED: 'ACKNOWLEDGED',
    ACKNOWLEDGED: 'IN_PROGRESS',
    IN_PROGRESS: 'VERIFYING',
    VERIFYING: 'COMPLETED',
    BLOCKED: 'ACKNOWLEDGED',
  };

  return transitions[current] || null;
};

const primaryActionLabel = (status) => {
  if (status === 'ACKNOWLEDGED') return 'လက်ခံအတည်ပြုရန်';
  if (status === 'IN_PROGRESS') return 'လုပ်ငန်းစတင်ရန်';
  if (status === 'VERIFYING') return 'အပြီးသတ်သုံးသပ်မှု စတင်ရန်';
  if (status === 'COMPLETED') return 'Caseပြီးစီးရန်';
  return caseStatusLabel(status);
};

const TrackEngineerCasePage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const resolvedCaseId = params.caseId || params.issueId;

  const [inspectionCase, setInspectionCase] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [aiIssue, setAiIssue] = useState(null);
  const [showCaseAI, setShowCaseAI] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [transitionNote, setTransitionNote] = useState('');
  const [error, setError] = useState('');

  const loadCase = useCallback(async (silent = false) => {
    if (!resolvedCaseId) {
      setError('Case ID မတွေ့ပါ။');
      setLoading(false);
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const result = await workflowApi.getCase(resolvedCaseId);
      setInspectionCase(result);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'ဤစစ်ဆေးမှုCaseကို မရယူနိုင်ပါ။',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedCaseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const issues = useMemo(
    () => (Array.isArray(inspectionCase?.issues) ? inspectionCase.issues : []),
    [inspectionCase],
  );

  const selectedIssue = useMemo(
    () => issues.find((issue) => String(issue.id) === String(selectedIssueId)) || null,
    [issues, selectedIssueId],
  );

  const allComplete = issues.length > 0 && issues.every(isIssueComplete);
  const completedCount = getCompletedIssueCount(inspectionCase || {});
  const progress = getCaseProgress(inspectionCase || {});
  const nextStatus = nextPrimaryStatus(inspectionCase?.status);

  const runMutation = async (operation, onSuccess = null) => {
    setMutating(true);
    setError('');

    try {
      const result = await operation();

      // Clear/update form state immediately after the API succeeds.
      // If the API fails, onSuccess is never called, so the engineer keeps
      // the text they typed.
      onSuccess?.(result);

      await loadCase(true);
      return result;
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'လုပ်ငန်းစဉ် အပ်ဒိတ် မအောင်မြင်ပါ။',
      );
      throw err;
    } finally {
      setMutating(false);
    }
  };

  const transitionCase = async (status) => {
    const note = transitionNote.trim();

    if (status === 'COMPLETED' && !note) {
      setError('Caseပြီးစီးမီ ပြီးစီးမှုအကျဉ်းချုပ်ကို ထည့်ပါ။');
      return;
    }

    if (status === 'BLOCKED' && !note) {
      setError('Caseကို ရပ်တန့်ထားမည့် အကြောင်းရင်းကို ထည့်ပါ။');
      return;
    }

    if (status === 'VERIFYING' && !allComplete) {
      setError('အပြီးသတ်သုံးသပ်မှု မစတင်မီ တွေ့ရှိချက်အားလုံးကို ကွင်းဆင်းအတည်ပြု၍ ပြုပြင်ထိန်းသိမ်းမှုရလဒ် အပြီးသတ်ထားရပါမည်။');
      return;
    }

    await runMutation(
      () =>
        workflowApi.updateCaseStatus(resolvedCaseId, {
          status,
          note: note || null,
        }),
      () => {
        setTransitionNote('');
      },
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50" lang="my">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-slate-500" />
          <p className="mt-3 text-sm text-slate-500">
            စစ်ဆေးမှုCaseကို ရယူနေပါသည်…
          </p>
        </div>
      </div>
    );
  }

  if (!inspectionCase) {
    return (
      <div className="min-h-screen bg-slate-50 p-6" lang="my">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          {error || 'စစ်ဆေးမှုCase မတွေ့ပါ။'}
        </div>
      </div>
    );
  }

  const activities = Array.isArray(inspectionCase.activities)
    ? inspectionCase.activities
    : [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6" lang="my">
      <div className="mx-auto max-w-[1900px]">
        <button
          type="button"
          onClick={() => navigate('/train-rider/issues')}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          ကျွန်ုပ်၏ Caseများ
        </button>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-5">
            <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">
                    လမ်းကြောင်းစစ်ဆေး ပြုပြင်ထိန်းသိမ်းမှု Case
                  </p>
                  <h1 className="mt-1 break-words text-2xl font-bold text-slate-900">
                    {caseDisplayName(inspectionCase)}
                  </h1>

                  <p className="mt-1 text-xs text-slate-400">
                    Case ID #{shortId(inspectionCase.id)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                    <span>
                      အခြေအနေ:{' '}
                      <strong className="text-slate-700">
                        {caseStatusLabel(inspectionCase.status)}
                      </strong>
                    </span>
                    <span>တွေ့ရှိချက် {issues.length} ခု</span>
                    <span>ပြီးစီး {completedCount} ခု</span>
                    <span>တိုးတက်မှု {progress}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCaseAI(true)}
                    className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
                  >
                    🤖 Caseသုံးသပ်ချက်
                  </button>

                  <button
                    type="button"
                    onClick={() => loadCase(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    ပြန်လည်တင်ရန်
                  </button>
                </div>
              </div>
            </header>

            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <CaseStatusBar status={inspectionCase.status} />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <textarea
                  value={transitionNote}
                  onChange={(event) => setTransitionNote(event.target.value)}
                  rows={2}
                  placeholder="အခြေအနေပြောင်းလဲမှု မှတ်ချက် / ပြီးစီးမှုအကျဉ်းချုပ် / ရပ်တန့်ရခြင်းအကြောင်း"
                  className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />

                <div className="flex flex-wrap items-center gap-2">
                  {nextStatus && (
                    <button
                      type="button"
                      onClick={() => transitionCase(nextStatus)}
                      disabled={
                        mutating ||
                        (nextStatus === 'VERIFYING' && !allComplete)
                      }
                      className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {primaryActionLabel(nextStatus)}
                    </button>
                  )}

                  {!['COMPLETED', 'BLOCKED'].includes(
                    String(inspectionCase.status || '').toUpperCase(),
                  ) && (
                    <button
                      type="button"
                      onClick={() => transitionCase('BLOCKED')}
                      disabled={mutating}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Caseကို ရပ်တန့်ထားရန်
                    </button>
                  )}
                </div>
              </div>

              {!allComplete && nextStatus === 'VERIFYING' && (
                <p className="mt-2 text-xs leading-5 text-amber-700">
                  တွေ့ရှိချက်တိုင်းတွင် အပြီးသတ် ကွင်းဆင်းအတည်ပြုမှုနှင့် အပြီးသတ် ပြုပြင်ထိန်းသိမ်းမှုရလဒ် ရှိမှသာ အပြီးသတ်သုံးသပ်မှုကို စတင်နိုင်ပါသည်။
                </p>
              )}
            </section>

            <section>
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-400">
                  ချို့ယွင်းချက်များ
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  တွေ့ရှိချက် လုပ်ငန်းစဉ်ဘုတ်
                </h2>
              </div>

              <DefectKanban
                issues={issues}
                onOpenIssue={(issue) => setSelectedIssueId(issue.id)}
                onOpenAI={setAiIssue}
              />
            </section>
          </main>

          <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            <Chatter
              activities={activities}
              issueId={selectedIssueId}
              onSendMessage={async ({ issueId, ...payload }) => {
                await runMutation(() =>
                  issueId
                    ? workflowApi.addIssueComment(resolvedCaseId, issueId, payload)
                    : workflowApi.addCaseComment(resolvedCaseId, payload),
                );
              }}
            />
          </aside>
        </div>
      </div>

      <DefectDetailPanel
        issue={selectedIssue}
        open={Boolean(selectedIssue)}
        onClose={() => setSelectedIssueId(null)}
        onOpenAI={setAiIssue}
        onCheckLocation={(payload) =>
          runMutation(() =>
            workflowApi.checkLocation(
              resolvedCaseId,
              selectedIssue.id,
              payload,
            ),
          )
        }
        onVerify={(payload) =>
          runMutation(() =>
            workflowApi.verifyFinding(
              resolvedCaseId,
              selectedIssue.id,
              payload,
            ),
          )
        }
        onUpdateMaintenance={(payload) =>
          runMutation(() =>
            workflowApi.updateMaintenance(
              resolvedCaseId,
              selectedIssue.id,
              payload,
            ),
          )
        }
      />

      <AIReviewDialog
        issue={aiIssue}
        open={Boolean(aiIssue)}
        onClose={() => setAiIssue(null)}
      />

      <CaseAIReviewDialog
        inspectionCase={inspectionCase}
        open={showCaseAI}
        onClose={() => setShowCaseAI(false)}
      />
    </div>
  );
};

export default TrackEngineerCasePage;
