import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Radio,
  RefreshCw,
  Search,
  TicketCheck,
  TrainFront,
} from 'lucide-react';

import bookingsApi from '@/api/bookings';
import { loadTicketRuntime } from '@/utils/ticketRuntime';
import TicketJourneyMap from '@/components/tickets/TicketJourneyMap';
import InAppStatusToast from '@/components/notifications/InAppStatusToast';
import { formatRailwayDate, formatRailwayTime } from '@/utils/railwayDateTime';
import {
  requestRailwayNotificationPermission,
  showRailwaySystemNotification,
} from '@/utils/browserNotifications';

const WATCH_KEY = 'railway_ticket_watch_v2';
const LAST_NOTIFICATION_KEY = 'railway_ticket_watch_last_notification_v2';

const normalize = (value) => String(value || '').trim();
const sameId = (left, right) => left != null && right != null && String(left) === String(right);

const STATUS_LABELS = {
  RESERVED: 'ကြိုတင်ထားသည်',
  CONFIRMED: 'အတည်ပြုပြီး',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
  SCHEDULED: 'စီစဉ်ထားသည်',
  DELAYED: 'နှောင့်နှေးနေသည်',
  ACTIVE: 'ပြေးဆွဲနေသည်',
  COMPLETED: 'ခရီးစဉ်ပြီးဆုံးသည်',
  ARRIVED: 'ဆိုက်ရောက်ပြီး',
  DEPARTED: 'ထွက်ခွာပြီး',
  SKIPPED: 'မရပ်နားဘဲ ကျော်သွားသည်',
};

const statusLabel = (value) => STATUS_LABELS[String(value || '').toUpperCase()] || value || '--';

const readStoredWatch = () => {
  try {
    return JSON.parse(localStorage.getItem(WATCH_KEY) || 'null');
  } catch {
    return null;
  }
};

const passengerErrorMessage = (error) => {
  const detail = typeof error?.detail === 'string'
    ? error.detail
    : typeof error?.message === 'string'
      ? error.message
      : '';
  const lower = detail.toLowerCase();

  if (lower.includes('ticket not found')) return 'လက်မှတ်ကို ရှာမတွေ့ပါ။';
  if (lower.includes('ticket and train do not match')) return 'လက်မှတ်နှင့် ရထားအချက်အလက် မကိုက်ညီပါ။';
  if (lower.includes('not linked to a schedule')) return 'ဤလက်မှတ်တွင် ခရီးစဉ်အချိန်ဇယား ချိတ်ဆက်ထားခြင်း မရှိသေးပါ။';
  if (detail && /[\u1000-\u109F]/.test(detail)) return detail;
  return 'လက်မှတ်နှင့် ရထားအချက်အလက်ကို စစ်ဆေး၍ မရပါ။ ထပ်မံကြိုးစားပါ။';
};

const getDestinationId = (status) => (
  status?.stops?.find((stop) => stop.is_destination_station)?.route_station_id ?? null
);

const buildStationNotification = (event, status) => {
  if (!event || !status) return null;

  const trainLabel = status.train_no || status.train_name || 'သင့်ရထား';
  const boardingId = status.boarding?.route_station_id
    ?? status.stops?.find((stop) => stop.is_boarding_station)?.route_station_id;
  const destinationId = getDestinationId(status);

  if (event.type === 'ARRIVED' && sameId(event.route_station_id, boardingId)) {
    return {
      key: `boarding-arrived:${event.schedule_id}:${event.route_station_id}`,
      title: 'သင့်ရထား ရောက်ရှိပါပြီ',
      body: `${trainLabel} သည် သင်တက်ရမည့် ${event.station_name} ဘူတာသို့ ရောက်ရှိပါပြီ။ ရထားပေါ်တက်ရန် အသင့်ပြင်ပါ။`,
    };
  }

  if (event.type === 'DEPARTED' && sameId(event.next_route_station_id, boardingId)) {
    const boardingName = status.boarding_station || event.next_station_name || 'သင်တက်ရမည့်ဘူတာ';
    return {
      key: `ready-to-ride:${event.schedule_id}:${boardingId}`,
      title: 'စီးနင်းရန် အသင့်ပြင်ပါ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပြီး သင်တက်ရမည့် ${boardingName} ဘူတာသို့ လာနေပါပြီ။`,
    };
  }

  if (event.type === 'ARRIVED' && sameId(event.route_station_id, destinationId)) {
    return {
      key: `destination-arrived:${event.schedule_id}:${event.route_station_id}`,
      title: 'သင်ဆင်းရမည့် ဘူတာသို့ ရောက်ရှိပါပြီ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာသို့ ရောက်ရှိပါပြီ။`,
    };
  }

  if (event.type === 'ARRIVED') {
    return {
      key: `arrived:${event.schedule_id}:${event.route_station_id}`,
      title: 'ရထား ဘူတာသို့ ဆိုက်ရောက်ပါပြီ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာသို့ ဆိုက်ရောက်ပါပြီ။`,
    };
  }

  if (event.type === 'DEPARTED') {
    return {
      key: `departed:${event.schedule_id}:${event.route_station_id}`,
      title: 'ရထား ထွက်ခွာပါပြီ',
      body: event.next_station_name
        ? `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပြီး ${event.next_station_name} ဘူတာသို့ ဦးတည်နေပါသည်။`
        : `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပါပြီ။`,
    };
  }

  return null;
};

const buildScheduleNotification = (previous, next) => {
  if (!previous || !next || previous.schedule_id !== next.schedule_id) return null;
  if (previous.schedule_status === next.schedule_status) return null;

  const trainLabel = next.train_no || next.train_name || 'သင့်ရထား';
  const nextStatus = String(next.schedule_status || '').toUpperCase();

  if (nextStatus === 'ACTIVE') {
    return {
      key: `schedule-active:${next.schedule_id}`,
      title: 'ရထား စတင်ပြေးဆွဲပါပြီ',
      body: `${trainLabel} ၏ သင်ဘွတ်ကင်ထားသော ခရီးစဉ် စတင်ပြေးဆွဲနေပါပြီ။ Live status ကို ယခုကြည့်နိုင်ပါသည်။`,
    };
  }
  if (nextStatus === 'DELAYED') {
    return {
      key: `schedule-delayed:${next.schedule_id}`,
      title: 'ရထားခရီးစဉ် နှောင့်နှေးနေသည်',
      body: `${trainLabel} ၏ ခရီးစဉ်အခြေအနေကို DELAYED အဖြစ် ပြောင်းလဲထားပါသည်။`,
    };
  }
  if (nextStatus === 'CANCELLED') {
    return {
      key: `schedule-cancelled:${next.schedule_id}`,
      title: 'ရထားခရီးစဉ် ဖျက်သိမ်းထားသည်',
      body: `${trainLabel} ၏ သင်ဘွတ်ကင်ထားသော ခရီးစဉ်ကို ဖျက်သိမ်းထားပါသည်။`,
    };
  }
  if (nextStatus === 'COMPLETED') {
    return {
      key: `schedule-completed:${next.schedule_id}`,
      title: 'ရထားခရီးစဉ် ပြီးဆုံးပါပြီ',
      body: `${trainLabel} ၏ ခရီးစဉ် ပြီးဆုံးပါပြီ။`,
    };
  }

  return {
    key: `schedule:${next.schedule_id}:${nextStatus}`,
    title: 'ရထားအခြေအနေ ပြောင်းလဲထားသည်',
    body: `${trainLabel} ၏ ခရီးစဉ်အခြေအနေသည် ${statusLabel(nextStatus)} ဖြစ်ပါသည်။`,
  };
};

const TicketStatusPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ticketNo, setTicketNo] = useState(searchParams.get('ticket') || '');
  const [train, setTrain] = useState(searchParams.get('train') || '');
  const [activeLookup, setActiveLookup] = useState(null);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [notificationMode, setNotificationMode] = useState('off');
  const [notificationMessage, setNotificationMessage] = useState(null);
  const [inAppNotification, setInAppNotification] = useState(null);
  const [streamState, setStreamState] = useState('idle');

  const lookupMatchesStoredWatch = useCallback((lookup) => {
    const stored = readStoredWatch();
    if (!stored || !lookup) return false;
    return normalize(stored.ticket).toLowerCase() === normalize(lookup.ticket).toLowerCase()
      && normalize(stored.train).toLowerCase() === normalize(lookup.train).toLowerCase();
  }, []);

  const deliverNotification = useCallback(async (notification, lookup) => {
    if (!notification || !lookupMatchesStoredWatch(lookup)) return;

    const previousKey = localStorage.getItem(LAST_NOTIFICATION_KEY);
    if (previousKey === notification.key) return;

    localStorage.setItem(LAST_NOTIFICATION_KEY, notification.key);
    setInAppNotification(notification);

    const url = `/pnr-status?ticket=${encodeURIComponent(lookup.ticket)}&train=${encodeURIComponent(lookup.train)}`;
    await showRailwaySystemNotification({
      title: notification.title,
      body: notification.body,
      tag: `railway-${notification.key}`,
      url,
    });
  }, [lookupMatchesStoredWatch]);

  const loadStatus = useCallback(async (ticketValue, trainValue, { silent = false, notifyChanges = true } = {}) => {
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
      const lookup = { ticket: normalizedTicket, train: normalizedTrain };
      const previous = resultRef.current;

      setResult(data);
      resultRef.current = data;
      setActiveLookup(lookup);
      setSearchParams({ ticket: normalizedTicket, train: normalizedTrain });
      const watched = lookupMatchesStoredWatch(lookup);
      setWatchEnabled(watched);
      if (watched) {
        const systemGranted = typeof window !== 'undefined'
          && 'Notification' in window
          && Notification.permission === 'granted';
        setNotificationMode(systemGranted ? 'system' : 'in-app');
      }

      if (notifyChanges && previous?.ticket_no === data.ticket_no) {
        const change = buildScheduleNotification(previous, data);
        if (change) await deliverNotification(change, lookup);
      }

      return data;
    } catch (err) {
      if (!silent) {
        setResult(null);
        resultRef.current = null;
        setActiveLookup(null);
      }
      setError(passengerErrorMessage(err));
      return null;
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [deliverNotification, lookupMatchesStoredWatch, setSearchParams]);

  const search = () => loadStatus(ticketNo, train, { notifyChanges: false });

  useEffect(() => {
    const initialTicket = searchParams.get('ticket');
    const initialTrain = searchParams.get('train');
    if (initialTicket && initialTrain) {
      loadStatus(initialTicket, initialTrain, { notifyChanges: false });
    }
    // Initial query is intentionally resolved once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Low-frequency schedule sync is required because the current backend SSE
  // emits station transitions, not SCHEDULED -> ACTIVE schedule changes.
  useEffect(() => {
    if (!activeLookup || !result) return undefined;
    if (!['SCHEDULED', 'DELAYED', 'ACTIVE'].includes(result.schedule_status)) return undefined;

    const sync = () => loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });
    const timer = window.setInterval(sync, 30000);

    const handleResume = () => {
      if (document.visibilityState === 'visible') sync();
    };

    window.addEventListener('online', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [activeLookup?.ticket, activeLookup?.train, result?.schedule_status, loadStatus]);

  // During an ACTIVE run, station transitions arrive immediately via SSE.
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

    const handleStationStatus = async (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch (parseError) {
        console.warn('Invalid station event:', parseError);
        return;
      }

      const currentStatus = resultRef.current;
      const notification = buildStationNotification(event, currentStatus);
      if (notification) await deliverNotification(notification, activeLookup);

      const updated = await loadStatus(activeLookup.ticket, activeLookup.train, { silent: true, notifyChanges: false });
      const destinationId = getDestinationId(updated || currentStatus);

      if (event.type === 'ARRIVED' && (event.is_last_station || sameId(event.route_station_id, destinationId))) {
        intentionallyClosed = true;
        source.close();
        setStreamState('stopped');
      }
    };

    source.addEventListener('station-status', handleStationStatus);
    return () => {
      intentionallyClosed = true;
      source.removeEventListener('station-status', handleStationStatus);
      source.close();
    };
  }, [activeLookup?.ticket, activeLookup?.train, result?.schedule_id, result?.schedule_status, deliverNotification, loadStatus]);

  const enableNotifications = async () => {
    if (!activeLookup || !result) return;

    localStorage.setItem(WATCH_KEY, JSON.stringify({
      ticket: activeLookup.ticket,
      train: activeLookup.train,
      schedule_id: result.schedule_id,
      boarding_station: result.boarding_station,
    }));
    localStorage.removeItem(LAST_NOTIFICATION_KEY);
    setWatchEnabled(true);

    const permission = await requestRailwayNotificationPermission();
    setNotificationMode(permission.mode);
    setNotificationMessage(
      permission.granted
        ? 'စနစ်အသိပေးချက် ဖွင့်ထားပါပြီ။ Schedule status နှင့် station status ပြောင်းလဲမှုများကို အသိပေးပါမည်။'
        : `${permission.message} Ticket status စာမျက်နှာဖွင့်ထားစဉ် in-page alert ကို ဆက်လက်အသုံးပြုပါမည်။`,
    );
  };

  const disableNotifications = () => {
    localStorage.removeItem(WATCH_KEY);
    localStorage.removeItem(LAST_NOTIFICATION_KEY);
    setWatchEnabled(false);
    setNotificationMode('off');
    setNotificationMessage('ဤလက်မှတ်အတွက် status watch ကို ပိတ်ထားပါပြီ။');
  };

  const testNotifications = async () => {
    if (!activeLookup || !watchEnabled) return;
    await deliverNotification({
      key: `test:${Date.now()}`,
      title: 'ရထားအသိပေးချက် အလုပ်လုပ်နေသည်',
      body: 'ဤစမ်းသပ်အသိပေးချက်ကို မြင်ရပါက လက်ရှိ browser notification setup အလုပ်လုပ်နေပါသည်။',
    }, activeLookup);
  };

  const isRunning = result?.schedule_status === 'ACTIVE';
  const boarding = result?.boarding;
  const nextEta = result?.next_station?.estimated_arrival;

  const progress = useMemo(() => {
    if (!result?.stops?.length) return 0;
    const completed = result.stops.filter((stop) => stop.status === 'DEPARTED').length;
    return Math.round((completed / result.stops.length) * 100);
  }, [result]);

  const streamLabel = {
    connecting: 'တိုက်ရိုက်အပ်ဒိတ် ချိတ်ဆက်နေသည်…',
    connected: 'တိုက်ရိုက် station update ချိတ်ဆက်ထားသည်',
    reconnecting: 'တိုက်ရိုက်အပ်ဒိတ် ပြန်လည်ချိတ်ဆက်နေသည်…',
    stopped: 'တိုက်ရိုက်အပ်ဒိတ် ပြီးဆုံးထားသည်',
    idle: 'Schedule status ကို စောင့်ကြည့်နေသည်',
  }[streamState];

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-24">
      <InAppStatusToast notification={inAppNotification} onClose={() => setInAppNotification(null)} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="max-w-3xl text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
              <TicketCheck className="h-4 w-4" /> လက်မှတ်အခြေအနေ
            </span>
            <h1 className="mt-4 !mb-0 !text-3xl !font-bold !tracking-tight text-slate-950 sm:!text-4xl">သင့် Booking နှင့် ရထားကို စစ်ဆေးပါ</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">ရထားမပြေးဆွဲသေးပါက booking နှင့် schedule အချက်အလက်ကိုသာ ပြပါမည်။ ရထား ACTIVE ဖြစ်လာသည်နှင့် live journey view သို့ အလိုအလျောက် ပြောင်းပါမည်။</p>
          </div>

          <div className="mt-7 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label className="text-left">
                <span className="text-xs font-semibold text-slate-600">လက်မှတ်နံပါတ်</span>
                <input value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="လက်မှတ်နံပါတ်" className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50" />
              </label>
              <label className="text-left">
                <span className="text-xs font-semibold text-slate-600">ရထားနံပါတ် / အမည်</span>
                <input value={train} onChange={(e) => setTrain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="ရထားနံပါတ် သို့မဟုတ် ရထားအမည်" className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50" />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={search} disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 md:w-auto">
                  <Search className="h-4 w-4" /> {loading ? 'စစ်ဆေးနေသည်…' : 'အခြေအနေစစ်မည်'}
                </button>
              </div>
            </div>
            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">{error}</div>}
          </div>
        </div>
      </section>

      {result && (
        <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <TrainFront className="h-4 w-4" />
                  <span>ရထား {result.train_no} {result.train_name ? `· ${result.train_name}` : ''}</span>
                  <span>·</span>
                  <span>ခရီးစဉ် #{result.schedule_id}</span>
                </div>
                <h2 className="mt-2 !mb-0 !text-xl !font-bold text-slate-950 sm:!text-2xl">
                  {isRunning ? result.headline : 'သင့်လက်မှတ်ခရီးစဉ်ကို ဘွတ်ကင်ထားပါသည်'}
                </h2>
                <p className="mt-2 text-sm text-slate-500">{result.boarding_station} → {result.destination_station}</p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">Booking: {statusLabel(result.booking_status)}</span>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${isRunning ? 'bg-emerald-50 text-emerald-700' : result.schedule_status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>Train: {statusLabel(result.schedule_status)}</span>
              </div>
            </div>
          </section>

          {!isRunning ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">သင်ဘွတ်ကင်ထားသော ရထားအချိန်ဇယား</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">ရထားသည် လက်ရှိ ACTIVE မဖြစ်သေးသောကြောင့် live map/timeline ကို မပြသသေးပါ။</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">ခရီးသွားရက်</p><p className="mt-1 font-semibold text-slate-900">{formatRailwayDate(result.travel_date, 'my-MM')}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">စီစဉ်ထားသော ထွက်ခွာချိန်</p><p className="mt-1 font-semibold text-slate-900">{result.scheduled_departure || '--'}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">တက်ရမည့်ဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.boarding_station}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">ဆင်းရမည့်ဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.destination_station}</p></div>
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                  <div>
                    <p className="font-semibold text-slate-900">Booking status: {statusLabel(result.booking_status)}</p>
                    <p className="mt-1 text-sm text-slate-600">Train status: {statusLabel(result.schedule_status)}. Status watch ဖွင့်ထားပါက ACTIVE/DELAYED/CANCELLED ပြောင်းလဲမှုကို အသိပေးပါမည်။</p>
                  </div>
                </div>
                <button type="button" onClick={() => activeLookup && loadStatus(activeLookup.ticket, activeLookup.train, { silent: true })} disabled={refreshing} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> ယခုစစ်မည်</button>
              </div>
            </section>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Radio className={`h-4 w-4 ${streamState === 'connected' ? 'animate-pulse' : ''}`} /> {streamLabel}</div>
                    <h3 className="mt-2 text-lg font-bold text-slate-950">Live journey status</h3>
                  </div>
                  <button type="button" onClick={() => activeLookup && loadStatus(activeLookup.ticket, activeLookup.train, { silent: true })} disabled={refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
                </div>

                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">လက်ရှိ/နောက်ဆုံးဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.current_station?.station_name || result.last_reached?.station_name || 'မသတ်မှတ်ရသေးပါ'}</p>{result.last_reached?.arrival_time && <p className="mt-1 text-xs text-slate-500">ရောက် {formatRailwayTime(result.last_reached.arrival_time, 'my-MM')}</p>}</div>
                  <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-700">နောက်တစ်ဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.next_station?.station_name || '--'}</p>{nextEta && <p className="mt-1 text-xs text-slate-500">ခန့်မှန်း {formatRailwayTime(nextEta, 'my-MM')}</p>}</div>
                  <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-700">သင်တက်ရမည့်ဘူတာ</p><p className="mt-1 font-semibold text-slate-900">{result.boarding_station}</p><p className="mt-1 text-xs text-slate-500">{boarding?.actual_arrival ? `ရောက် ${formatRailwayTime(boarding.actual_arrival, 'my-MM')}` : boarding?.estimated_arrival ? `ခန့်မှန်း ${formatRailwayTime(boarding.estimated_arrival, 'my-MM')}` : boarding?.expected_arrival || '--'}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-600">လက်ရှိနောက်ကျချိန်</p><p className="mt-1 font-semibold text-slate-900">{result.live_delay_minutes || 0} မိနစ်</p></div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">တိုက်ရိုက် လမ်းကြောင်းနှင့် ဘူတာ status</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">သင့်လက်မှတ်ခရီးစဉ် segment နှင့် ရထား၏ လက်ရှိ route progress ကို ပြသပါသည်။</p>
                    <div className="mt-5 space-y-2">
                      {(result.stops || []).map((stop) => (
                        <div key={stop.route_station_id} className={`rounded-2xl border p-4 ${stop.in_passenger_segment ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{stop.station_name} {stop.is_boarding_station && <span className="text-xs text-amber-700">· တက်ရမည့်ဘူတာ</span>} {stop.is_destination_station && <span className="text-xs text-purple-700">· ဆင်းရမည့်ဘူတာ</span>}</p>
                              <p className="mt-1 text-xs text-slate-500">မျှော်မှန်းဆိုက်ရောက် {stop.expected_arrival || '--'}</p>
                            </div>
                            <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${stop.status === 'DEPARTED' ? 'bg-emerald-100 text-emerald-700' : stop.status === 'ARRIVED' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(stop.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-full max-w-[360px] justify-self-center lg:justify-self-end"><TicketJourneyMap journey={result} /></div>
                </div>
              </section>
            </>
          )}

          {['SCHEDULED', 'DELAYED', 'ACTIVE'].includes(result.schedule_status) && (
            <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-left shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">{watchEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</span>
                  <div>
                    <h3 className="font-bold text-slate-950">ရထား status notification</h3>
                    {/* <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Schedule status ပြောင်းလဲမှုကို 30 စက္ကန့်ခြား sync ဖြင့် စစ်ဆေးပြီး ACTIVE အချိန်တွင် station ARRIVED/DEPARTED events ကို SSE ဖြင့် ချက်ချင်းရယူပါသည်။ Android/desktop browser များတွင် service-worker system notification ကို အသုံးပြုပြီး မရနိုင်သော browser တွင် in-page alert အဖြစ် fallback လုပ်ပါသည်။</p> */}
                    {notificationMessage && <p className="mt-2 text-xs font-medium text-sky-800">{notificationMessage}</p>}
                    {/* {watchEnabled && <p className="mt-1 text-[11px] text-slate-500">Notification mode: {notificationMode === 'system' ? 'System + in-page' : 'In-page fallback'} · Browser/page ကို လုံးဝပိတ်ထားချိန် push ပို့ရန် backend Web Push subscription လိုအပ်ပါသည်။</p>} */}
                  </div>
                </div>
                {watchEnabled ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={testNotifications} className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800">စမ်းသပ်အသိပေးချက်</button>
                    <button type="button" onClick={disableNotifications} className="inline-flex h-11 items-center justify-center rounded-xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 hover:bg-sky-100">ပိတ်မည်</button>
                  </div>
                ) : (
                  <button type="button" onClick={enableNotifications} className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800">အသိပေးချက် ဖွင့်မည်</button>
                )}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
};

export default TicketStatusPage;
