import { Activity, Clock3, Gauge, MapPin, Navigation, RefreshCw, TrainFront } from 'lucide-react';

import Button from '@/components/ui/button';
import useActiveTrains from '@/hooks/useActiveTrains';
import { formatRailwayTime } from '@/utils/railwayDateTime';
import { stationStatusLabel } from '@/utils/trainRuntimeView';

const formatClock = (value) => {
  if (!value) return '--';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return formatRailwayTime(value, 'my-MM');
  } catch {
    return value;
  }
};

const RunningTrainsPage = () => {
  const {
    trains,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  } = useActiveTrains({ refreshMs: 20000 });

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-24">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                တိုက်ရိုက်ပြေးဆွဲမှု
              </div>
              <h1 className="mt-4 !mb-0 !text-3xl !font-bold !tracking-tight text-slate-950 sm:!text-4xl">
                လက်ရှိပြေးဆွဲနေသော ရထားများ
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                ပြေးဆွဲနေသော ခရီးစဉ်တိုင်း၏ လက်ရှိဘူတာ၊ နောက်တစ်ဘူတာ၊ နောက်ကျချိန်နှင့် လမ်းကြောင်းတိုးတက်မှုကို တစ်နေရာတည်းတွင် ကြည့်နိုင်ပါသည်။
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-slate-500">
                  နောက်ဆုံးအပ်ဒိတ် {lastUpdated.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh({ silent: true })}
                disabled={refreshing}
                className="!scale-100"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                ပြန်လည်ရယူမည်
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-700" />
            <p className="mt-3 text-slate-600">လက်ရှိရထားအခြေအနေများကို ရယူနေသည်…</p>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-left">
            <p className="font-semibold text-red-800">ဒေတာကို ရယူ၍ မရပါ။</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        ) : trains.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <TrainFront className="h-8 w-8" />
            </div>
            <h2 className="mt-5 !mb-0 !text-2xl !font-bold text-slate-950">ယခုအချိန်တွင် ပြေးဆွဲနေသော ရထား မရှိပါ</h2>
            <p className="mx-auto mt-2 max-w-xl text-slate-600">ခရီးစဉ်တစ်ခု ACTIVE ဖြစ်လာသောအခါ ဤနေရာတွင် အလိုအလျောက် ပေါ်လာပါမည်။</p>
          </div>
        ) : (
          <div className="space-y-5">
            {trains.map((train) => (
              <article key={train.schedule_id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <Activity className="h-3.5 w-3.5" />
                          ပြေးဆွဲနေသည်
                        </span>
                        <span className="text-xs text-slate-400">ခရီးစဉ် #{train.schedule_id}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                          <TrainFront className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="!m-0 !text-xl !font-bold text-slate-950 sm:!text-2xl">
                            {train.train_name || `ရထား ${train.train_no}`}
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">ရထားနံပါတ် {train.train_no || '--'}</p>
                        </div>
                      </div>
                      <p className="mt-4 text-base font-semibold text-slate-800">{train.headline}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[480px]">
                      <div className="rounded-2xl bg-slate-50 p-3 text-left">
                        <p className="text-xs text-slate-500">ထွက်ခွာချိန်</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatClock(train.departure_time)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3 text-left">
                        <p className="text-xs text-slate-500">နောက်ကျချိန်</p>
                        <p className={`mt-1 font-semibold ${train.delayMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {train.delayMinutes} မိနစ်
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3 text-left">
                        <p className="text-xs text-slate-500">မြန်နှုန်း</p>
                        <p className="mt-1 font-semibold text-slate-900">{train.device?.speed ?? 0} mph</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3 text-left">
                        <p className="text-xs text-slate-500">ဘူတာတိုးတက်မှု</p>
                        <p className="mt-1 font-semibold text-slate-900">{train.completedStations}/{train.totalStations}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                      <span>ခရီးစဉ်တိုးတက်မှု</span>
                      <span>{Math.round(train.progressPercent)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-600 transition-all" style={{ width: `${train.progressPercent}%` }} />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="text-xs text-slate-500">လက်ရှိ / နောက်ဆုံးဘူတာ</p>
                        <p className="mt-1 font-semibold text-slate-900">{train.currentStation?.station_name || train.lastDeparted?.station_name || 'မသတ်မှတ်ရသေးပါ'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left">
                      <Navigation className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="text-xs text-slate-500">နောက်တစ်ဘူတာ</p>
                        <p className="mt-1 font-semibold text-slate-900">{train.nextStation?.station_name || 'နောက်ဆုံးဘူတာ ရောက်ရှိနေသည်'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left sm:col-span-2 lg:col-span-1">
                      <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="text-xs text-slate-500">GPS နောက်ဆုံးအပ်ဒိတ်</p>
                        <p className="mt-1 font-semibold text-slate-900">{train.device?.last_update ? formatClock(train.device.last_update) : 'GPS မရရှိသေးပါ'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <details className="group border-t border-slate-200 bg-slate-50/70">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-slate-800 sm:px-6">
                    <span>ဘူတာအခြေအနေ အားလုံးကြည့်ရန်</span>
                    <span className="text-xs font-normal text-slate-500">{train.totalStations} ဘူတာ</span>
                  </summary>
                  <div className="grid gap-2 px-5 pb-5 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                    {train.stations.map((station) => (
                      <div key={station.route_station_id} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{station.station_name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">အစဉ် {station.order_number}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            station.status === 'ARRIVED'
                              ? 'bg-blue-50 text-blue-700'
                              : station.status === 'DEPARTED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {stationStatusLabel(station.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>မျှော်မှန်း {station.expected_arrival || '--'}</span>
                          {station.arrival_time && <span>· ရောက် {formatClock(station.arrival_time)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default RunningTrainsPage;
