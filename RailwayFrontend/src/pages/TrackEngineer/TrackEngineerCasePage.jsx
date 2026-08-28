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
  getCaseProgress,
  getCompletedIssueCount,
  humanize,
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

const TrackEngineerCasePage = () => {
  const navigate = useNavigate();
  const params = useParams();

  // New clean route uses :caseId. Legacy /train-rider/issues/:issueId can
  // point to this same page during migration.
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
      setError('No case ID was provided.');
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
          'Could not load this inspection case.',
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

  const runMutation = async (operation) => {
    setMutating(true);
    setError('');

    try {
      await operation();
      await loadCase(true);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'The workflow update failed.',
      );
      throw err;
    } finally {
      setMutating(false);
    }
  };

  const transitionCase = async (status) => {
    const note = transitionNote.trim();

    if (status === 'COMPLETED' && !note) {
      setError('Enter a completion summary before completing the case.');
      return;
    }

    if (status === 'BLOCKED' && !note) {
      setError('Enter a block reason before blocking the case.');
      return;
    }

    if (status === 'VERIFYING' && !allComplete) {
      setError('Every finding must be complete before the case enters Verifying.');
      return;
    }

    await runMutation(() =>
      workflowApi.updateCaseStatus(resolvedCaseId, {
        status,
        note: note || null,
      }),
    );

    setTransitionNote('');
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-slate-500" />
          <p className="mt-3 text-sm text-slate-500">Loading inspection case…</p>
        </div>
      </div>
    );
  }

  if (!inspectionCase) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          {error || 'Inspection case not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1900px] space-y-5">
        <button
          type="button"
          onClick={() => navigate('/track-engineer/cases')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          My cases
        </button>

        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Inspection maintenance case
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Case #{shortId(inspectionCase.id)}
              </h1>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                <span>Status: <strong className="text-slate-700">{humanize(inspectionCase.status)}</strong></span>
                <span>{issues.length} findings</span>
                <span>{completedCount} completed</span>
                <span>{progress}% progress</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowCaseAI(true)}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
              >
                🤖 Case AI review
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
                Refresh
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
              placeholder="Case transition note / completion summary / block reason"
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
                  {nextStatus === 'ACKNOWLEDGED'
                    ? 'Acknowledge'
                    : nextStatus === 'IN_PROGRESS'
                      ? 'Start work'
                      : nextStatus === 'VERIFYING'
                        ? 'Start verification'
                        : nextStatus === 'COMPLETED'
                          ? 'Complete case'
                          : humanize(nextStatus)}
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
                  Block case
                </button>
              )}
            </div>
          </div>

          {!allComplete && nextStatus === 'VERIFYING' && (
            <p className="mt-2 text-xs text-amber-700">
              Verifying remains locked until every checklist item has a final field result and final maintenance result.
            </p>
          )}
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Defects
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Finding Kanban
            </h2>
          </div>

          <DefectKanban
            issues={issues}
            onOpenIssue={(issue) => setSelectedIssueId(issue.id)}
            onOpenAI={setAiIssue}
          />
        </section>

        <Chatter
          activities={Array.isArray(inspectionCase.activities) ? inspectionCase.activities : []}
          issueId={selectedIssueId}
          onSendMessage={async ({ issueId, ...payload }) => {
            await runMutation(() =>
              issueId
                ? workflowApi.addIssueComment(resolvedCaseId, issueId, payload)
                : workflowApi.addCaseComment(resolvedCaseId, payload),
            );
          }}
        />
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
