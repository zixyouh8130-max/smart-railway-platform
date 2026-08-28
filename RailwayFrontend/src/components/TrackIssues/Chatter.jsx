import React, { useMemo, useState } from 'react';
import {
  Loader2,
  MessageCircle,
  Send,
} from 'lucide-react';
import ChatterMessage from './ChatterMessage';

const FILTERS = [
  ['ALL', 'All'],
  ['CASE', 'Case'],
  ['ISSUE', 'This Defect'],
];

const MESSAGE_KINDS = [
  ['COMMENT', 'Comment'],
  ['QUESTION', 'Question'],
  ['SUGGESTION', 'Suggestion'],
];

const Chatter = ({
  activities = [],
  issueId = null,
  onSendMessage,
}) => {
  const [filter, setFilter] = useState('ALL');
  const [messageKind, setMessageKind] = useState('COMMENT');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const visibleActivities = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    );

    if (filter === 'CASE') {
      return sorted.filter((activity) => !activity.issue_id);
    }

    if (filter === 'ISSUE') {
      if (!issueId) return [];
      return sorted.filter(
        (activity) => String(activity.issue_id) === String(issueId),
      );
    }

    return sorted;
  }, [activities, filter, issueId]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError('');

    try {
      await onSendMessage?.({
        issueId: filter === 'ISSUE' ? issueId : null,
        message_kind: messageKind,
        message: trimmed,
      });
      setMessage('');
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not send the message.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Chatter</h2>
          </div>

          <div className="flex rounded-lg bg-slate-100 p-1">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={value === 'ISSUE' && !issueId}
                onClick={() => setFilter(value)}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  filter === value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                  value === 'ISSUE' && !issueId
                    ? 'cursor-not-allowed opacity-40'
                    : '',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-5">
        {visibleActivities.map((activity) => (
          <ChatterMessage key={activity.id} activity={activity} />
        ))}

        {!visibleActivities.length && (
          <div className="py-10 text-center text-sm text-slate-400">
            No chatter in this view yet.
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-slate-200 p-4">
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder={
            filter === 'ISSUE' && issueId
              ? 'Write a message about this defect...'
              : 'Write a case message...'
          }
          className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <select
            value={messageKind}
            onChange={(event) => setMessageKind(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {MESSAGE_KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={!message.trim() || sending}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
        </div>
      </form>
    </section>
  );
};

export default Chatter;
