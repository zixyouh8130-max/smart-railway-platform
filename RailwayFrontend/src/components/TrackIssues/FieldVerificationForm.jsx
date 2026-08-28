import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  FIELD_VERIFICATION_OPTIONS,
} from './kanbanUtils';

const FieldVerificationForm = ({ issue, onSave, saving }) => {
  const [status, setStatus] = useState(
    issue?.field_verification_status || 'NOT_CHECKED',
  );
  const [note, setNote] = useState(issue?.field_verification_note || '');

  useEffect(() => {
    setStatus(issue?.field_verification_status || 'NOT_CHECKED');
    setNote(issue?.field_verification_note || '');
  }, [issue?.id, issue?.field_verification_status, issue?.field_verification_note]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave?.({
          field_verification_status: status,
          field_verification_note: note.trim() || null,
        });
      }}
      className="rounded-xl border border-slate-200 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-slate-600" />
        <h4 className="font-semibold text-slate-900">Field verification</h4>
      </div>

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
      >
        {FIELD_VERIFICATION_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="What did you physically observe?"
        className="mt-3 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
      />

      <button
        type="submit"
        disabled={saving}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save verification
      </button>
    </form>
  );
};

export default FieldVerificationForm;
