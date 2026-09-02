import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Radio, RefreshCw, Search, TicketCheck, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';

import bookingsApi from '@/api/bookings';
import { loadTicketRuntime } from '@/utils/ticketRuntime';
import { formatRailwayDate } from '@/utils/railwayDateTime';

const normalize = (value) => String(value || '').trim();

const STATUS_LABELS = {
  RESERVED: 'လက်မှတ် ကြိုတင်ထားသည်',
  CONFIRMED: 'လက်မှတ် အတည်ပြုပြီး',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
  SCHEDULED: 'အချိန်ဇယားအတိုင်း စောင့်ဆိုင်းနေသည်',
  DELAYED: 'နှောင့်နှေးနေသည်',
  ACTIVE: 'ပြေးဆွဲနေသည်',
  COMPLETED: 'ခရီးစဉ်ပြီးဆုံးသည်',
};

const statusLabel = (value) => STATUS_LABELS[String(value || '').toUpperCase()] || value || '--';

const passengerErrorMessage = (error) => {
  const detail = typeof error?.detail === 'string'
    ? error.detail
    : typeof error?.message === 'string'
      ? error.message
      : '';
  const lower = detail.toLowerCase();
  if (lower.includes('ticket not found')) return 'လက်မှတ်ကို ရှာမတွေ့ပါ။';
  if (lower.includes('ticket and train do not match')) return 'လက်မှတ်နှင့် ရထားအချက်အလက် မကိုက်ညီပါ။';
  if (detail && /[\u1000-\u109F]/.test(detail)) return detail;
  return 'လက်မှတ်နှင့် ရထားအချက်အလက်ကို စစ်ဆေး၍ မရပါ။';
};

const HomeTicketTracker = () => {
  const [ticketNo, setTicketNo] = useState('');
  const [train, setTrain] = useState('');
  const [activeLookup, setActiveLookup] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [streamState, setStreamState] = useState('idle');

  const loadStatus = useCallback(async (ticketValue, trainValue, { silent = false } = {}) => {
    const normalizedTicket = normalize(ticketValue);
    const normalizedTrain = normalize(trainValue);

    if (!normalizedTicket || !normalizedTrain) {
      if (!silent) setError('လက်မှတ်နံပါတ်နှင့် ရထားနံပါတ် သို့မဟုတ် ရထားအမည်ကို ဖြည့်ပါ။');
      return null;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);
    if (!silent) setError(null);

    try {
      const ticketData = await bookingsApi.getJourneyStatus(normalizedTicket, normalizedTrain);
      const data = await loadTicketRuntime(ticketData);
      setResult(data);
      setActiveLookup({ ticket: normalizedTicket, train: normalizedTrain });
      return data;
    } catch (err) {
      if (!silent) {
        setResult(null);
        setActiveLookup(null);
      }
      setError(passengerErrorMessage(err));
      return null;
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const search = () => loadStatus(ticketNo, train);
  const isRunning = result?.schedule_status === 'ACTIVE';

  useEffect(() => {
    if (!activeLookup || !result) return undefined;
    if (!['SCHEDULED', 'DELAYED', 'ACTIVE'].includes(result.schedule_status)) return undefined;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });
      }
    }, 30000);

    const syncOnResume = () => {
      if (document.visibilityState === 'visible') {
        loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });
      }
    };

    document.addEventListener('visibilitychange', syncOnResume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncOnResume);
    };
  }, [activeLookup?.ticket, activeLookup?.train, result?.schedule_status, loadStatus]);

  useEffect(() => {
    if (!activeLookup || !result?.schedule_id || result.schedule_status !== 'ACTIVE') {
      setStreamState(result ? 'idle' : 'idle');
      return undefined;
    }

    let intentionallyClosed = false;
    setStreamState('connecting');
    const source = new EventSource(bookingsApi.getJourneyEventUrl(activeLookup.ticket, activeLookup.train));

    source.onopen = () => setStreamState('connected');
    source.onerror = () => {
      if (!intentionallyClosed) setStreamState('reconnecting');
    };

    const handleStationStatus = async () => {
      await loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });
    };

    source.addEventListener('station-status', handleStationStatus);
    return () => {
      intentionallyClosed = true;
      source.removeEventListener('station-status', handleStationStatus);
      source.close();
    };
  }, [activeLookup?.ticket, activeLookup?.train, result?.schedule_id, result?.schedule_status, loadStatus]);

  const progress = useMemo(() => {
    if (!result?.stops?.length) return 0;
    const completed = result.stops.filter((stop) => stop.status === 'DEPARTED').length;
    return Math.round((completed / result.stops.length) * 100);
  }, [result]);

  const detailedStatusUrl = activeLookup
    ? `/pnr-status?ticket=${encodeURIComponent(activeLookup.ticket)}&train=${encodeURIComponent(activeLookup.train)}`
    : '/pnr-status';

  return (
    <section id="ticket-tracker" className="bg-slate-50 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.5fr] lg:items-start">
          <div className="text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
              <TicketCheck className="h-4 w-4" />
              လက်မှတ်အမြန်စစ်ဆေးမှု
            </span>
            <h2 className="mt-4 !mb-0 !text-2xl !font-bold !tracking-tight text-slate-950 sm:!text-3xl">Booking နဲ့ ရထားအခြေအနေကို တစ်ခါတည်းစစ်ပါ</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              ရထားမစတင်သေးပါက သင်ဘွတ်ကင်ထားသော schedule နှင့် booking status ကိုသာ ရှင်းရှင်းလင်းလင်း ပြပါမည်။ ACTIVE ဖြစ်မှသာ live journey အချက်အလက်များ ပေါ်လာပါမည်။
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label>
                <span className="text-xs font-semibold text-slate-600">လက်မှတ်နံပါတ်</span>
                <input
                  value={ticketNo}
                  onChange={(event) => setTicketNo(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && search()}
                  placeholder="ဥပမာ DEMO-STATUS-001"
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">ရထားနံပါတ် / အမည်</span>
                <input
                  value={train}
                  onChange={(event) => setTrain(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && search()}
                  placeholder="ရထားနံပါတ် သို့မဟုတ် အမည်"
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={search}
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60 md:w-auto"
                >
                  <Search className="h-4 w-4" />
                  {loading ? 'စစ်ဆေးနေသည်…' : 'စစ်မည်'}
                </button>
              </div>
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            {result && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><TrainFront className="h-4 w-4" /> {result.train_no} {result.train_name ? `· ${result.train_name}` : ''}</span>
                      <span>·</span>
                      <span>{formatRailwayDate(result.travel_date, 'my-MM')}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-slate-950">
                      {isRunning ? result.headline : 'သင့်လက်မှတ်ခရီးစဉ်ကို ဘွတ်ကင်ထားပါသည်'}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{statusLabel(result.booking_status)}</span>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{statusLabel(result.schedule_status)}</span>
                  </div>
                </div>

                {!isRunning ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">ခရီးစဉ်</p><p className="mt-1 font-semibold text-slate-900">{result.boarding_station} → {result.destination_station}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">ခရီးသွားရက်</p><p className="mt-1 font-semibold text-slate-900">{formatRailwayDate(result.travel_date, 'my-MM')}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">စီစဉ်ထားသော ထွက်ခွာချိန်</p><p className="mt-1 font-semibold text-slate-900">{result.scheduled_departure || '--'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Booking status</p><p className="mt-1 font-semibold text-slate-900">{statusLabel(result.booking_status)}</p></div>
                  </div>
                ) : (
                  <>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-600" style={{ width: `${progress}%` }} /></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">လက်ရှိ/နောက်ဆုံးဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.current_station?.station_name || result.last_reached?.station_name || '--'}</p></div>
                      <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs text-blue-700">နောက်တစ်ဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.next_station?.station_name || '--'}</p></div>
                      <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs text-amber-700">နောက်ကျချိန်</p><p className="mt-1 font-semibold text-slate-900">{result.live_delay_minutes || 0} မိနစ်</p></div>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500"><Radio className={`h-3.5 w-3.5 ${streamState === 'connected' ? 'animate-pulse text-emerald-600' : ''}`} /> {streamState === 'connected' ? 'Live station updates ချိတ်ဆက်ထားသည်' : 'Live update ချိတ်ဆက်နေသည်'}</div>
                  </>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <Link to={detailedStatusUrl} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">အသေးစိတ်ကြည့်မည် <ArrowRight className="h-4 w-4" /></Link>
                  <button type="button" onClick={() => activeLookup && loadStatus(activeLookup.ticket, activeLookup.train, { silent: true })} disabled={refreshing} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> ယခုအပ်ဒိတ်လုပ်မည်</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeTicketTracker;
