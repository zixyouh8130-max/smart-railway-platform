import React, { useEffect, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import {
  MAINTENANCE_OPTIONS,
} from './kanbanUtils';

const MaintenanceForm = ({ issue, onSave, saving }) => {
  const [status, setStatus] = useState(issue?.maintenance_status || 'PENDING');
  const [note, setNote] = useState(issue?.maintenance_note || '');

  useEffect(() => {
    setStatus(issue?.maintenance_status || 'PENDING');
    setNote(issue?.maintenance_note || '');
  }, [issue?.id, issue?.maintenance_status, issue?.maintenance_note]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave?.({
          maintenance_status: status,
          maintenance_note: note.trim() || null,
        });
      }}
      className="rounded-xl border border-slate-200 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-slate-600" />
        <h4 className="font-semibold text-slate-900">Maintenance</h4>
      </div>

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
      >
        {MAINTENANCE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="Repair / maintenance note"
        className="mt-3 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
      />

      <button
        type="submit"
        disabled={saving}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save maintenance
      </button>
    </form>
  );
};

export default MaintenanceForm;
