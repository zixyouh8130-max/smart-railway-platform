import { ArrowRight, Clock3, MapPin, Navigation, RefreshCw, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';

import useActiveTrains from '@/hooks/useActiveTrains';

const LiveUpdates = () => {
  const { trains, loading, refreshing, error, refresh } = useActiveTrains({ refreshMs: 30000 });

  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 text-left sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              တိုက်ရိုက်ပြေးဆွဲမှု
            </div>
            <h2 className="mt-4 !mb-0 !text-2xl !font-bold !tracking-tight text-slate-950 sm:!text-3xl">ယခု ပြေးဆွဲနေသော ရထားများ</h2>
            <p className="mt-2 text-slate-600">လက်ရှိ ACTIVE ခရီးစဉ်များကို backend status အတိုင်း ပြသပါသည်။</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh({ silent: true })}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              အပ်ဒိတ်
            </button>
            <Link to="/running-trains" className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
              အားလုံးကြည့်မည်
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-56 animate-pulse rounded-3xl bg-slate-100" />)}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-left text-sm text-red-700">{error}</div>
        ) : trains.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
            <TrainFront className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-3 font-semibold text-slate-800">ယခုအချိန်တွင် ပြေးဆွဲနေသော ရထား မရှိပါ</p>
            <p className="mt-1 text-sm text-slate-500">ACTIVE ခရီးစဉ်ရှိလာသောအခါ ဒီနေရာမှာ အလိုအလျောက် ပြပါမည်။</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {trains.slice(0, 3).map((train) => (
              <article key={train.schedule_id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 text-left transition-all hover:-translate-y-1 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white">
                      <TrainFront className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">{train.train_name || `ရထား ${train.train_no}`}</p>
                      <p className="mt-0.5 text-xs text-slate-500">ရထား #{train.train_no || '--'} · ခရီးစဉ် #{train.schedule_id}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">LIVE</span>
                </div>

                <p className="mt-4 min-h-12 text-sm font-semibold leading-6 text-slate-800">{train.headline}</p>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start gap-2 text-slate-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <span>လက်ရှိ: <strong className="text-slate-900">{train.currentStation?.station_name || train.lastDeparted?.station_name || 'မသတ်မှတ်ရသေးပါ'}</strong></span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600">
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <span>နောက်တစ်ဘူတာ: <strong className="text-slate-900">{train.nextStation?.station_name || '--'}</strong></span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <span>နောက်ကျချိန်: <strong className={train.delayMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'}>{train.delayMinutes} မိနစ်</strong></span>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>ခရီးစဉ်တိုးတက်မှု</span>
                    <span>{Math.round(train.progressPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-600" style={{ width: `${train.progressPercent}%` }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default LiveUpdates;
