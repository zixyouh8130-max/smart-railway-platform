import React, { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Loader2, Wrench } from 'lucide-react';
import {
  MAINTENANCE_OPTIONS,
  fieldVerificationLabel,
  maintenanceStatusLabel,
} from './kanbanUtils';

const MaintenanceForm = ({ issue, onSave, saving }) => {
  const [status, setStatus] = useState(issue?.maintenance_status || 'PENDING');
  const [note, setNote] = useState(issue?.maintenance_note || '');

  useEffect(() => {
    setStatus(issue?.maintenance_status || 'PENDING');
    setNote(issue?.maintenance_note || '');
  }, [issue?.id, issue?.maintenance_status, issue?.maintenance_note]);

  const fieldStatus = String(
    issue?.field_verification_status || 'NOT_CHECKED',
  ).toUpperCase();

  const canEdit = ['CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(fieldStatus);
  const automaticOutcome = ['NOT_CONFIRMED', 'UNABLE_TO_VERIFY'].includes(fieldStatus);

  const helper = useMemo(() => {
    if (fieldStatus === 'NOT_CHECKED') {
      return 'ပြုပြင်ထိန်းသိမ်းမှုအခြေအနေ မသတ်မှတ်မီ ကွင်းဆင်းအတည်ပြုမှုကို အရင်သိမ်းဆည်းပါ။';
    }

    if (fieldStatus === 'NOT_CONFIRMED') {
      return 'AI တွေ့ရှိချက်ကို မတွေ့ရှိကြောင်း အတည်ပြုထားသောကြောင့် ပြုပြင်ရန် မလိုပါ။ Backend က NO_ACTION_REQUIRED ကို အလိုအလျောက် သတ်မှတ်ပေးမည်။';
    }

    if (fieldStatus === 'UNABLE_TO_VERIFY') {
      return 'ယခုအကြိမ် စစ်ဆေးအတည်ပြု၍ မရသဖြင့် Backend က FOLLOW_UP_REQUIRED ကို အလိုအလျောက် သတ်မှတ်ပေးမည်။';
    }

    return null;
  }, [fieldStatus]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;

        onSave?.({
          maintenance_status: status,
          maintenance_note: note.trim() || null,
        });
      }}
      className="rounded-xl border border-slate-200 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-slate-600" />
        <h4 className="font-semibold text-slate-900">ပြုပြင်ထိန်းသိမ်းမှု</h4>
      </div>

      {!canEdit && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                ကွင်းဆင်းအတည်ပြုမှု: {fieldVerificationLabel(fieldStatus)}
              </p>
              {helper && <p className="mt-1 text-xs leading-5">{helper}</p>}
              {automaticOutcome && issue?.maintenance_status && (
                <p className="mt-2 text-xs font-medium">
                  လက်ရှိရလဒ်: {maintenanceStatusLabel(issue.maintenance_status)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        disabled={!canEdit}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
        disabled={!canEdit}
        placeholder="ပြုပြင်ခြင်း / ထိန်းသိမ်းခြင်းဆိုင်ရာ မှတ်ချက်"
        className="mt-3 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      />

      <button
        type="submit"
        disabled={saving || !canEdit}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        ပြုပြင်ထိန်းသိမ်းမှု ရလဒ် သိမ်းဆည်းရန်
      </button>
    </form>
  );
};

export default MaintenanceForm;
