import { useEffect } from 'react';
import { BellRing, X } from 'lucide-react';

const InAppStatusToast = ({ notification, onClose }) => {
  useEffect(() => {
    if (!notification) return undefined;
    const timer = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  return (
    <div className="fixed inset-x-3 top-20 z-[90] sm:inset-x-auto sm:right-5 sm:w-[390px]">
      <div className="rounded-2xl border border-sky-200 bg-white p-4 text-left shadow-2xl shadow-slate-900/15">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-950">{notification.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{notification.body}</p>
          </div>
          <button
            type="button"
            aria-label="အသိပေးချက်ပိတ်မည်"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InAppStatusToast;
