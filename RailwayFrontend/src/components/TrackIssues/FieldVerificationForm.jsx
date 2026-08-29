import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import {
  FIELD_VERIFICATION_OPTIONS,
} from './kanbanUtils';

const FieldVerificationForm = ({
  issue,
  onSave,
  saving,
}) => {
  const [status, setStatus] = useState(
    issue?.field_verification_status ||
      'NOT_CHECKED',
  );

  const [note, setNote] = useState(
    issue?.field_verification_note || '',
  );

  const [formError, setFormError] =
    useState('');

  useEffect(() => {
    setStatus(
      issue?.field_verification_status ||
        'NOT_CHECKED',
    );

    setNote(
      issue?.field_verification_note ||
        '',
    );

    setFormError('');
  }, [
    issue?.id,
    issue?.field_verification_status,
    issue?.field_verification_note,
  ]);

  /**
   * Field verification is only valid when:
   *
   * 1. Engineer chooses an actual result.
   * 2. Engineer writes what was physically observed.
   * 3. Request is not already being saved.
   */
  const canSubmit =
    status !== 'NOT_CHECKED' &&
    note.trim().length > 0 &&
    !saving;

  const handleSubmit = (event) => {
    event.preventDefault();

    const cleanNote = note.trim();

    setFormError('');

    if (status === 'NOT_CHECKED') {
      setFormError(
        'ကွင်းဆင်းစစ်ဆေးမှု ရလဒ်တစ်ခုကို ရွေးချယ်ပါ။',
      );
      return;
    }

    if (!cleanNote) {
      setFormError(
        'လက်တွေ့ကွင်းဆင်းစစ်ဆေးရာတွင် တွေ့ရှိခဲ့သည့် အခြေအနေကို ရေးသားပါ။',
      );
      return;
    }

    onSave?.({
      field_verification_status: status,
      field_verification_note: cleanNote,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-slate-600" />

        <h4 className="font-semibold text-slate-900">
          ကွင်းဆင်း အတည်ပြုမှု
        </h4>
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-500">
        စစ်ဆေးမှု ရလဒ်
      </label>

      <select
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setFormError('');
        }}
        disabled={saving}
        className="
          w-full rounded-lg
          border border-slate-300
          bg-white
          px-3 py-2
          text-sm
          outline-none
          focus:border-slate-500
          disabled:cursor-not-allowed
          disabled:bg-slate-100
        "
      >
        {FIELD_VERIFICATION_OPTIONS.map(
          ([value, label]) => (
            <option
              key={value}
              value={value}
            >
              {label}
            </option>
          ),
        )}
      </select>

      <label className="mb-1 mt-3 block text-xs font-medium text-slate-500">
        ကွင်းဆင်းတွေ့ရှိချက်
      </label>

      <textarea
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setFormError('');
        }}
        disabled={saving}
        rows={3}
        placeholder="လက်တွေ့ကွင်းဆင်းစစ်ဆေးရာတွင် ဘာတွေ့ရှိခဲ့ပါသလဲ?"
        className="
          w-full resize-y rounded-lg
          border border-slate-300
          px-3 py-2
          text-sm
          outline-none
          focus:border-slate-500
          disabled:cursor-not-allowed
          disabled:bg-slate-100
        "
      />

      {formError && (
        <div
          className="
            mt-3 flex items-start gap-2
            rounded-lg
            border border-amber-200
            bg-amber-50
            p-3
            text-sm text-amber-800
          "
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <span>
            {formError}
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="
          mt-3 inline-flex items-center gap-2
          rounded-lg
          bg-slate-800
          px-4 py-2
          text-sm font-medium text-white
          transition
          hover:bg-slate-900
          disabled:cursor-not-allowed
          disabled:opacity-40
        "
      >
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}

        အတည်ပြုမှု သိမ်းဆည်းရန်
      </button>

      {status === 'NOT_CHECKED' && (
        <p className="mt-2 text-xs text-slate-500">
          အတည်ပြုမှု သိမ်းဆည်းရန်
          စစ်ဆေးမှုရလဒ်ကို အရင်ရွေးချယ်ပါ။
        </p>
      )}

      {status !== 'NOT_CHECKED' &&
        !note.trim() && (
          <p className="mt-2 text-xs text-slate-500">
            လက်တွေ့တွေ့ရှိချက်ကို
            ရေးသားပြီးမှ သိမ်းဆည်းနိုင်ပါမည်။
          </p>
        )}
    </form>
  );
};

export default FieldVerificationForm;