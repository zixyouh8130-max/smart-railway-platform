import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  MessageCircle,
  Send,
} from 'lucide-react';
import ChatterMessage from './ChatterMessage';

const FILTERS = [
  ['ALL', 'အားလုံး'],
  ['CASE', 'Case'],
  ['ISSUE', 'ဤချို့ယွင်းချက်'],
];

const MESSAGE_KINDS = [
  ['COMMENT', 'မှတ်ချက်'],
  ['QUESTION', 'မေးခွန်း'],
  ['SUGGESTION', 'အကြံပြုချက်'],
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
  const messagesEndRef = useRef(null);

  const visibleActivities = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [visibleActivities.length, filter, issueId]);

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

      // Only clear the composer when the API/update succeeds.
      // If it fails, keep the engineer's text so it can be retried.
      setMessage('');
      setMessageKind('COMMENT');
      setError('');
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'စာတိုကို မပို့နိုင်ပါ။',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex min-h-[580px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:h-[calc(100vh-2rem)] xl:max-h-[900px]">
      <div className="shrink-0 border-b border-slate-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-slate-600" />
          <div>
            <h2 className="font-semibold text-slate-900">ဆွေးနွေးချက်</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Caseနှင့် တွေ့ရှိချက်ဆိုင်ရာ စာတိုများ
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 rounded-lg bg-slate-100 p-1">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={value === 'ISSUE' && !issueId}
              onClick={() => setFilter(value)}
              className={[
                'rounded-md px-2 py-2 text-[11px] font-medium transition',
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

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-3 py-3">
        <div className="space-y-3">
          {visibleActivities.map((activity) => (
            <ChatterMessage key={activity.id} activity={activity} />
          ))}

          {!visibleActivities.length && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
              ဤနေရာတွင် ဆွေးနွေးချက် မရှိသေးပါ။
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        onSubmit={submit}
        className="w-full shrink-0 border-t border-slate-200 bg-white p-3"
      >
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
              ? 'ဤချို့ယွင်းချက်နှင့်ပတ်သက်သည့် စာတိုရေးပါ...'
              : 'ဤCaseနှင့်ပတ်သက်သည့် စာတိုရေးပါ...'
          }
          className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />

        <div className="mt-2 flex items-center gap-2">
          <select
            value={messageKind}
            onChange={(event) => setMessageKind(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
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
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            ပို့ရန်
          </button>
        </div>
      </form>
    </section>
  );
};

export default Chatter;