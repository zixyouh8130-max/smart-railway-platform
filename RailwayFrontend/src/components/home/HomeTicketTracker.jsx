import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Clock3,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  TrainFront,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import bookingsApi from '@/api/bookings';
import { loadTicketRuntime } from '@/utils/ticketRuntime';
import Button from '@/components/ui/button';
import TicketJourneyMap from '@/components/tickets/TicketJourneyMap';
import {
  formatRailwayDate,
  formatRailwayTime,
} from '@/utils/railwayDateTime';

const normalize = (value) => String(value || '').trim();

const STATUS_LABELS = {
  SCHEDULED: 'စီစဉ်ထားသည်',
  DELAYED: 'နှောင့်နှေးနေသည်',
  ACTIVE: 'ပြေးဆွဲနေသည်',
  COMPLETED: 'ခရီးစဉ်ပြီးဆုံးသည်',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
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

  const loadStatus = useCallback(async (
    ticketValue,
    trainValue,
    { silent = false } = {},
  ) => {
    const normalizedTicket = normalize(ticketValue);
    const normalizedTrain = normalize(trainValue);

    if (!normalizedTicket || !normalizedTrain) {
      if (!silent) {
        setError('လက်မှတ်နံပါတ်နှင့် ရထားနံပါတ် သို့မဟုတ် ရထားအမည်ကို ဖြည့်ပါ။');
      }
      return null;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);
    if (!silent) setError(null);

    try {
      const ticketData = await bookingsApi.getJourneyStatus(
        normalizedTicket,
        normalizedTrain,
      );
      const data = await loadTicketRuntime(ticketData);

      setResult(data);
      setActiveLookup({
        ticket: normalizedTicket,
        train: normalizedTrain,
      });
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

  // One long-lived server event stream replaces repeated 15-second polling.
  useEffect(() => {
    if (!activeLookup || !result?.schedule_id) return undefined;
    if (!['SCHEDULED', 'DELAYED', 'ACTIVE'].includes(result.schedule_status)) {
      setStreamState('stopped');
      return undefined;
    }

    let intentionallyClosed = false;
    setStreamState('connecting');

    const source = new EventSource(
      bookingsApi.getJourneyEventUrl(activeLookup.ticket, activeLookup.train),
    );

    source.onopen = () => setStreamState('connected');
    source.onerror = () => {
      if (!intentionallyClosed) setStreamState('reconnecting');
    };

    const handleStationStatus = async (message) => {
      try {
        const event = JSON.parse(message.data);
        await loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });

        if (event?.is_last_station) {
          intentionallyClosed = true;
          source.close();
          setStreamState('stopped');
        }
      } catch (eventError) {
        console.warn('Station event could not be applied:', eventError);
      }
    };

    source.addEventListener('station-status', handleStationStatus);

    return () => {
      intentionallyClosed = true;
      source.removeEventListener('station-status', handleStationStatus);
      source.close();
    };
  }, [
    activeLookup?.ticket,
    activeLookup?.train,
    result?.schedule_id,
    result?.schedule_status,
    loadStatus,
  ]);

  const progress = useMemo(() => {
    if (!result?.stops?.length) return 0;

    const completed = result.stops.filter(
      (stop) => stop.status === 'DEPARTED' || stop.status === 'ARRIVED',
    ).length;

    return Math.round((completed / result.stops.length) * 100);
  }, [result]);

  const detailedStatusUrl = activeLookup
    ? `/pnr-status?ticket=${encodeURIComponent(activeLookup.ticket)}&train=${encodeURIComponent(activeLookup.train)}`
    : '/pnr-status';

  const streamLabel = {
    connecting: 'တိုက်ရိုက်အပ်ဒိတ် ချိတ်ဆက်နေသည်…',
    connected: 'တိုက်ရိုက်အပ်ဒိတ် ချိတ်ဆက်ထားသည်',
    reconnecting: 'တိုက်ရိုက်အပ်ဒိတ် ပြန်လည်ချိတ်ဆက်နေသည်…',
    stopped: 'တိုက်ရိုက်အပ်ဒိတ် ပြီးဆုံးထားသည်',
    idle: 'တိုက်ရိုက်အပ်ဒိတ် မစတင်ရသေးပါ',
  }[streamState];

  return (
    <section id="ticket-tracker" className="bg-slate-50 py-12 md:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-7 text-center">
          <p className="text-sm font-semibold text-sky-700 tracking-[0.12em]">
            တိုက်ရိုက် ခရီးစဉ်အခြေအနေ
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
            လက်မှတ်ဖြင့် သင့်ရထားကို ခြေရာခံပါ
          </h2>
          <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
            ခရီးသည်အကောင့် မလိုအပ်ပါ။ လက်မှတ်နံပါတ်နှင့် ရထားအချက်အလက်ကို ထည့်ပြီး နောက်ဆုံးရောက်ရှိသည့်ဘူတာ၊ နောက်တစ်ဘူတာနှင့် ခန့်မှန်းရောက်ချိန်ကို ကြည့်နိုင်ပါသည်။
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 md:p-7">
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">လက်မှတ်နံပါတ်</span>
              <input
                value={ticketNo}
                onChange={(event) => setTicketNo(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && search()}
                placeholder="ဥပမာ DEMO-STATUS-001"
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">ရထား</span>
              <input
                value={train}
                onChange={(event) => setTrain(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && search()}
                placeholder="ရထားနံပါတ် သို့မဟုတ် ရထားအမည်အတိအကျ"
                className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <div className="flex items-end">
              <Button
                onClick={search}
                disabled={loading}
                className="w-full md:w-auto min-h-12 px-6"
              >
                <Search className="w-4 h-4 mr-2" />
                {loading ? 'စစ်ဆေးနေသည်…' : 'ရထားအခြေအနေ စစ်မည်'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-7 border-t border-gray-100 pt-7">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <TrainFront className="w-4 h-4" />
                          ရထား {result.train_no}
                          {result.train_name ? ` · ${result.train_name}` : ''}
                        </span>
                        <span>•</span>
                        <span>{formatRailwayDate(result.travel_date, 'my-MM')}</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 mt-2">
                        {result.headline}
                      </h3>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                        result.schedule_status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : result.schedule_status === 'CANCELLED'
                            ? 'bg-red-100 text-red-700'
                            : result.schedule_status === 'COMPLETED'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-blue-100 text-blue-700'
                      }`}>
                        {statusLabel(result.schedule_status)}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[11px] ${
                        streamState === 'connected' ? 'text-emerald-600' : 'text-gray-400'
                      }`}>
                        <Radio className="w-3 h-3" />
                        {streamLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 mt-5">
                    <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
                      <p className="text-xs font-medium text-green-700">နောက်ဆုံး ရောက်ရှိခဲ့သည့် ဘူတာ</p>
                      <p className="font-semibold text-gray-900 mt-1">
                        {result.last_reached?.station_name || 'မထွက်ခွာသေးပါ'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {result.last_reached?.arrival_time
                          ? `အမှန်တကယ်ရောက်ချိန် ${formatRailwayTime(result.last_reached.arrival_time, 'my-MM')}`
                          : 'ထွက်ခွာရန် စောင့်ဆိုင်းနေသည်'}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                      <p className="text-xs font-medium text-blue-700">နောက်တစ်ဘူတာ</p>
                      <p className="font-semibold text-gray-900 mt-1">
                        {result.next_station?.station_name || '--'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {result.next_station?.estimated_arrival
                          ? `ခန့်မှန်းရောက်ချိန် ${formatRailwayTime(result.next_station.estimated_arrival, 'my-MM')}`
                          : result.next_station?.expected_arrival
                            ? `မျှော်မှန်းရောက်ချိန် ${result.next_station.expected_arrival}`
                            : '--'}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                      <p className="text-xs font-medium text-amber-700">သင်တက်ရမည့် ဘူတာ</p>
                      <p className="font-semibold text-gray-900 mt-1">
                        {result.boarding_station}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {result.boarding?.actual_arrival
                          ? `အမှန်တကယ်ရောက်ချိန် ${formatRailwayTime(result.boarding.actual_arrival, 'my-MM')}`
                          : result.boarding?.estimated_arrival
                            ? `ခန့်မှန်းရောက်ချိန် ${formatRailwayTime(result.boarding.estimated_arrival, 'my-MM')}`
                            : result.boarding?.expected_arrival
                              ? `မျှော်မှန်းရောက်ချိန် ${result.boarding.expected_arrival}`
                              : '--'}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
                    <div className="flex items-start gap-2 rounded-xl border border-gray-200 p-3">
                      <MapPin className="w-4 h-4 text-sky-600 mt-0.5" />
                      <div>
                        <p className="text-gray-500">သင့်ခရီးစဉ်</p>
                        <p className="font-medium text-gray-900">
                          {result.boarding_station} → {result.destination_station}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-xl border border-gray-200 p-3">
                      <Clock3 className="w-4 h-4 text-sky-600 mt-0.5" />
                      <div>
                        <p className="text-gray-500">လက်ရှိ နောက်ကျချိန်</p>
                        <p className="font-medium text-gray-900">
                          {result.live_delay_minutes || 0} မိနစ်
                        </p>
                      </div>
                    </div>
                  </div>

                  {result.notification_recommended && (
                    <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-sky-50 border border-sky-100 p-4">
                      <div className="flex gap-3">
                        <Bell className="w-5 h-5 text-sky-700 mt-0.5" />
                        <div>
                          <p className="font-semibold text-gray-900">ဘရောက်ဇာအသိပေးချက် ရယူလိုပါသလား?</p>
                          <p className="text-sm text-gray-600">
                            ဘူတာဆိုက်ရောက်/ထွက်ခွာချိန်နှင့် သင်တက်ရမည့်ဘူတာ နောက်တစ်ဘူတာဖြစ်လာချိန်တွင် အသိပေးရန် အပြည့်အစုံစာမျက်နှာတွင် ဖွင့်နိုင်ပါသည်။
                          </p>
                        </div>
                      </div>
                      <Link
                        to={detailedStatusUrl}
                        className="shrink-0 inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        အသိပေးချက် ဖွင့်မည်
                      </Link>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      to={detailedStatusUrl}
                      className="text-sm font-semibold text-sky-700 hover:text-sky-800"
                    >
                      ဘူတာဆိုက်ရောက်/ထွက်ခွာ မှတ်တမ်းအပြည့်အစုံ ကြည့်ရန် →
                    </Link>
                    <button
                      type="button"
                      onClick={() => activeLookup && loadStatus(
                        activeLookup.ticket,
                        activeLookup.train,
                        { silent: true },
                      )}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      {refreshing ? 'ပြန်လည်ရယူနေသည်…' : 'ယခု ပြန်လည်ရယူမည်'}
                    </button>
                  </div>
                </div>

                <div className="w-full max-w-[340px] mx-auto lg:mx-0">
                  <TicketJourneyMap journey={result} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HomeTicketTracker;
