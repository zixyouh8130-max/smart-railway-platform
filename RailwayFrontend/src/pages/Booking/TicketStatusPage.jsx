import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Radio,
  RefreshCw,
} from 'lucide-react';

import bookingsApi from '@/api/bookings';
import { loadTicketRuntime } from '@/utils/ticketRuntime';
import Button from '@/components/ui/button';
import TicketJourneyMap from '@/components/tickets/TicketJourneyMap';
import {
  formatRailwayDate,
  formatRailwayTime,
} from '@/utils/railwayDateTime';

const WATCH_KEY = 'railway_ticket_watch_v1';
const LAST_EVENT_KEY = 'railway_ticket_watch_last_event_v1';

const normalize = (value) => String(value || '').trim();
const sameId = (left, right) => (
  left != null && right != null && String(left) === String(right)
);

const STATUS_LABELS = {
  SCHEDULED: 'စီစဉ်ထားသည်',
  DELAYED: 'နှောင့်နှေးနေသည်',
  ACTIVE: 'ပြေးဆွဲနေသည်',
  COMPLETED: 'ခရီးစဉ်ပြီးဆုံးသည်',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
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
      title: '🚉 သင့်ရထား ရောက်ရှိပါပြီ',
      body: `${trainLabel} သည် သင်တက်ရမည့် ${event.station_name} ဘူတာသို့ ရောက်ရှိပါပြီ။ ရထားပေါ်တက်ရန် အသင့်ပြင်ပါ။`,
    };
  }

  if (event.type === 'DEPARTED' && sameId(event.next_route_station_id, boardingId)) {
    const boardingName = status.boarding_station || event.next_station_name || 'သင်တက်ရမည့်ဘူတာ';
    return {
      key: `ready-to-ride:${event.schedule_id}:${boardingId}`,
      title: '🎫 စီးနင်းရန် အသင့်ပြင်ပါ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပြီး သင်တက်ရမည့် ${boardingName} ဘူတာသို့ လာနေပါပြီ။`,
    };
  }

  if (event.type === 'ARRIVED' && sameId(event.route_station_id, destinationId)) {
    return {
      key: `destination-arrived:${event.schedule_id}:${event.route_station_id}`,
      title: '🏁 သင်ဆင်းရမည့် ဘူတာသို့ ရောက်ရှိပါပြီ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာသို့ ရောက်ရှိပါပြီ။`,
    };
  }

  if (event.type === 'ARRIVED') {
    return {
      key: `arrived:${event.schedule_id}:${event.route_station_id}`,
      title: '🚉 ရထား ဘူတာသို့ ဆိုက်ရောက်ပါပြီ',
      body: `${trainLabel} သည် ${event.station_name} ဘူတာသို့ ဆိုက်ရောက်ပါပြီ။`,
    };
  }

  if (event.type === 'DEPARTED') {
    return {
      key: `departed:${event.schedule_id}:${event.route_station_id}`,
      title: '🚂 ရထား ထွက်ခွာပါပြီ',
      body: event.next_station_name
        ? `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပြီး ${event.next_station_name} ဘူတာသို့ ဦးတည်နေပါသည်။`
        : `${trainLabel} သည် ${event.station_name} ဘူတာမှ ထွက်ခွာပါပြီ။`,
    };
  }

  return null;
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
  const [notificationMessage, setNotificationMessage] = useState(null);
  const [streamState, setStreamState] = useState('idle');

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const lookupMatchesStoredWatch = useCallback((lookup) => {
    const stored = readStoredWatch();
    if (!stored || !lookup) return false;
    return (
      normalize(stored.ticket).toLowerCase() === normalize(lookup.ticket).toLowerCase()
      && normalize(stored.train).toLowerCase() === normalize(lookup.train).toLowerCase()
    );
  }, []);

  const notifyFromStationEvent = useCallback((event, status, lookup) => {
    if (
      typeof window === 'undefined'
      || !('Notification' in window)
      || Notification.permission !== 'granted'
      || !lookupMatchesStoredWatch(lookup)
    ) {
      return;
    }

    const notification = buildStationNotification(event, status);
    if (!notification) return;

    const previousKey = localStorage.getItem(LAST_EVENT_KEY);
    if (previousKey === notification.key) return;

    try {
      new Notification(notification.title, {
        body: notification.body,
        tag: `railway-${notification.key}`,
      });
      localStorage.setItem(LAST_EVENT_KEY, notification.key);
    } catch (notificationError) {
      console.warn('Browser notification failed:', notificationError);
    }
  }, [lookupMatchesStoredWatch]);

  const loadStatus = useCallback(async (
    ticketValue,
    trainValue,
    { silent = false } = {},
  ) => {
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
      const ticketData = await bookingsApi.getJourneyStatus(
        normalizedTicket,
        normalizedTrain,
      );
      const data = await loadTicketRuntime(ticketData);
      const lookup = { ticket: normalizedTicket, train: normalizedTrain };

      setResult(data);
      setActiveLookup(lookup);
      setSearchParams({ ticket: normalizedTicket, train: normalizedTrain });

      const granted = (
        typeof window !== 'undefined'
        && 'Notification' in window
        && Notification.permission === 'granted'
      );
      setWatchEnabled(lookupMatchesStoredWatch(lookup) && granted);
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
  }, [lookupMatchesStoredWatch, setSearchParams]);

  const search = () => loadStatus(ticketNo, train);

  useEffect(() => {
    const initialTicket = searchParams.get('ticket');
    const initialTrain = searchParams.get('train');
    if (initialTicket && initialTrain) {
      loadStatus(initialTicket, initialTrain);
    }
    // Only resolve the initial query string once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Event-driven live updates. There is deliberately NO setInterval polling.
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
      let event;
      try {
        event = JSON.parse(message.data);
      } catch (parseError) {
        console.warn('Invalid station event:', parseError);
        return;
      }

      const currentStatus = resultRef.current;
      notifyFromStationEvent(event, currentStatus, activeLookup);

      // Refresh the passenger view only because a real StationArrivalLog
      // transition occurred. No periodic passenger-side API requests.
      await loadStatus(activeLookup.ticket, activeLookup.train, { silent: true });

      const destinationId = getDestinationId(currentStatus);
      if (
        event.type === 'ARRIVED'
        && (
          event.is_last_station
          || sameId(event.route_station_id, destinationId)
        )
      ) {
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
  }, [
    activeLookup?.ticket,
    activeLookup?.train,
    result?.schedule_id,
    result?.schedule_status,
    loadStatus,
    notifyFromStationEvent,
  ]);

  const enableNotifications = async () => {
    if (!activeLookup || !result) return;

    if (!('Notification' in window)) {
      setNotificationMessage('ဤဘရောက်ဇာတွင် အသိပေးချက်စနစ် မပံ့ပိုးပါ။');
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setNotificationMessage('ဘရောက်ဇာအသိပေးချက်အတွက် HTTPS လိုအပ်ပါသည်။ ဖွံ့ဖြိုးရေးအတွက် localhost ကို အသုံးပြုနိုင်ပါသည်။');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotificationMessage('အသိပေးချက် ခွင့်ပြုချက် မရရှိပါ။');
        return;
      }

      localStorage.setItem(WATCH_KEY, JSON.stringify({
        ticket: activeLookup.ticket,
        train: activeLookup.train,
        schedule_id: result.schedule_id,
        boarding_station: result.boarding_station,
      }));
      localStorage.removeItem(LAST_EVENT_KEY);

      setWatchEnabled(true);
      setNotificationMessage(
        'အသိပေးချက် ဖွင့်ထားပါပြီ။ ဘူတာဆိုက်ရောက်/ထွက်ခွာ အခြေအနေ ပြောင်းလဲသည့်အချိန်တွင်သာ အသိပေးပါမည်။',
      );
    } catch (err) {
      setNotificationMessage('အသိပေးချက်ကို ဖွင့်၍ မရပါ။ ထပ်မံကြိုးစားပါ။');
    }
  };

  const disableNotifications = () => {
    localStorage.removeItem(WATCH_KEY);
    localStorage.removeItem(LAST_EVENT_KEY);
    setWatchEnabled(false);
    setNotificationMessage('ဤဘရောက်ဇာအတွက် ရထားအသိပေးချက်ကို ပိတ်ထားပါပြီ။');
  };

  const boarding = result?.boarding;
  const nextEta = result?.next_station?.estimated_arrival;

  const progress = useMemo(() => {
    if (!result?.stops?.length) return 0;
    const completed = result.stops.filter(
      (stop) => stop.status === 'DEPARTED' || stop.status === 'ARRIVED',
    ).length;
    return Math.round((completed / result.stops.length) * 100);
  }, [result]);

  const streamLabel = {
    connecting: 'တိုက်ရိုက်အပ်ဒိတ် ချိတ်ဆက်နေသည်…',
    connected: 'တိုက်ရိုက်အပ်ဒိတ် ချိတ်ဆက်ထားသည်',
    reconnecting: 'တိုက်ရိုက်အပ်ဒိတ် ပြန်လည်ချိတ်ဆက်နေသည်…',
    stopped: 'တိုက်ရိုက်အပ်ဒိတ် ပြီးဆုံးထားသည်',
    idle: 'တိုက်ရိုက်အပ်ဒိတ် မစတင်ရသေးပါ',
  }[streamState];

  return (
    <div className="min-h-screen pt-24 px-4 pb-12 bg-gradient-to-br from-blue-900 via-blue-800 to-sky-700">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">လက်မှတ်နှင့် ရထားအခြေအနေ</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            အကောင့်ဖွင့်ရန် မလိုပါ။ လက်မှတ်နံပါတ်နှင့် ရထားနံပါတ် သို့မဟုတ် ရထားအမည်အတိအကျကို ထည့်ပါ။
          </p>

          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
            <input
              value={ticketNo}
              onChange={(e) => setTicketNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="လက်မှတ်နံပါတ်"
              className="border rounded-xl px-3 py-2.5"
            />
            <input
              value={train}
              onChange={(e) => setTrain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="ရထားနံပါတ် သို့မဟုတ် ရထားအမည်"
              className="border rounded-xl px-3 py-2.5"
            />
            <Button onClick={search} disabled={loading}>
              {loading ? 'စစ်ဆေးနေသည်…' : 'အခြေအနေ စစ်မည်'}
            </Button>
          </div>

          {error && <p className="text-red-600 mt-3">{error}</p>}
        </div>

        {result && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    ရထား {result.train_no} {result.train_name ? `· ${result.train_name}` : ''}
                  </p>
                  <h2 className="text-xl font-bold mt-1">{result.headline}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatRailwayDate(result.travel_date, 'my-MM')} · ခရီးစဉ် #{result.schedule_id}
                  </p>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    result.schedule_status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : result.schedule_status === 'CANCELLED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                  }`}>
                    {statusLabel(result.schedule_status)}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${
                    streamState === 'connected' ? 'text-emerald-600' : 'text-gray-500'
                  }`}>
                    <Radio className={`w-3.5 h-3.5 ${streamState === 'connected' ? 'animate-pulse' : ''}`} />
                    {streamLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-sm">
                <div>
                  <p className="text-gray-500">နောက်ဆုံး ရောက်ရှိခဲ့သည့် ဘူတာ</p>
                  <p className="font-semibold">{result.last_reached?.station_name || 'မထွက်ခွာသေးပါ'}</p>
                  {result.last_reached?.arrival_time && (
                    <p className="text-gray-500">
                      ဆိုက်ရောက်ချိန် {formatRailwayTime(result.last_reached.arrival_time, 'my-MM')}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-gray-500">နောက်တစ်ဘူတာ</p>
                  <p className="font-semibold">{result.next_station?.station_name || '--'}</p>
                  {nextEta && (
                    <p className="text-gray-500">ခန့်မှန်းရောက်ချိန် {formatRailwayTime(nextEta, 'my-MM')}</p>
                  )}
                </div>
                <div>
                  <p className="text-gray-500">သင်တက်ရမည့် ဘူတာ</p>
                  <p className="font-semibold">{result.boarding_station}</p>
                  <p className="text-gray-500">
                    {boarding?.actual_arrival
                      ? `အမှန်တကယ်ရောက်ချိန် ${formatRailwayTime(boarding.actual_arrival, 'my-MM')}`
                      : boarding?.estimated_arrival
                        ? `ခန့်မှန်းရောက်ချိန် ${formatRailwayTime(boarding.estimated_arrival, 'my-MM')}`
                        : boarding?.expected_arrival
                          ? `မျှော်မှန်းရောက်ချိန် ${boarding.expected_arrival}`
                          : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">သင်ဆင်းရမည့် ဘူတာ</p>
                  <p className="font-semibold">{result.destination_station}</p>
                  <p className="text-gray-500">
                    လက်ရှိနောက်ကျချိန် {result.live_delay_minutes || 0} မိနစ်
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="grid md:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
                <div>
                  <h3 className="text-lg font-semibold">တိုက်ရိုက် လမ်းကြောင်းမြေပုံ</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    အစိမ်းရောင်သည် ရောက်ရှိ/ဖြတ်သန်းပြီးသော ဘူတာ၊ အပြာရောင်သည် လက်ရှိဘူတာ၊ မီးခိုးရောင်သည် မရောက်သေးသော ဘူတာများကို ပြထားပါသည်။
                  </p>
                  <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-gray-500">နောက်ဆုံး ရောက်ရှိခဲ့သည့် ဘူတာ</p>
                      <p className="font-semibold">{result.last_reached?.station_name || 'မထွက်ခွာသေးပါ'}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-gray-500">နောက်တစ်ဘူတာ</p>
                      <p className="font-semibold">{result.next_station?.station_name || '--'}</p>
                      {result.next_station?.estimated_arrival && (
                        <p className="text-gray-500 mt-1">
                          ခန့်မှန်းရောက်ချိန် {formatRailwayTime(result.next_station.estimated_arrival, 'my-MM')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-full max-w-[340px] mx-auto md:mx-0">
                  <TicketJourneyMap journey={result} />
                </div>
              </div>
            </div>

            {result.notification_recommended && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-xl p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex gap-3">
                    {watchEnabled
                      ? <Bell className="w-5 h-5 text-amber-700 mt-0.5" />
                      : <BellOff className="w-5 h-5 text-amber-700 mt-0.5" />}
                    <div>
                      <h3 className="font-semibold">ရထားအသိပေးချက်</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        ဘူတာသို့ ဆိုက်ရောက်ချိန်၊ ဘူတာမှ ထွက်ခွာချိန်နှင့် သင်တက်ရမည့် ဘူတာ နောက်တစ်ဘူတာဖြစ်လာချိန်တွင်သာ အသိပေးပါမည်။ ၁၅ စက္ကန့်တစ်ကြိမ် စစ်ဆေးခြင်း မရှိပါ။
                      </p>
                    </div>
                  </div>
                  {watchEnabled ? (
                    <Button onClick={disableNotifications}>အသိပေးချက် ပိတ်မည်</Button>
                  ) : (
                    <Button onClick={enableNotifications}>အသိပေးချက် ဖွင့်မည်</Button>
                  )}
                </div>
                {notificationMessage && (
                  <p className="text-xs text-gray-600 mt-3">{notificationMessage}</p>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold">ဘူတာဆိုက်ရောက်/ထွက်ခွာ မှတ်တမ်းအပြည့်အစုံ</h3>
                  <p className="text-sm text-gray-500">
                    အပြာရောင်အတန်းများသည် သင့်လက်မှတ်ခရီးစဉ်အပိုင်းအတွင်းရှိ ဘူတာများဖြစ်သည်။
                  </p>
                </div>
                <Button
                  onClick={() => activeLookup && loadStatus(
                    activeLookup.ticket,
                    activeLookup.train,
                    { silent: true },
                  )}
                  disabled={refreshing}
                  variant="outline"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'ပြန်လည်ရယူနေသည်…' : 'ယခု ပြန်လည်ရယူမည်'}
                </Button>
              </div>

              <div className="space-y-2">
                {(result.stops || []).map((stop) => (
                  <div
                    key={stop.route_station_id}
                    className={`border rounded-xl p-4 ${
                      stop.in_passenger_segment
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="grid md:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr] gap-3 items-center">
                      <div>
                        <p className="font-semibold">
                          {stop.station_name}
                          {stop.is_boarding_station && (
                            <span className="ml-2 text-xs text-amber-700">(တက်ရမည့်ဘူတာ)</span>
                          )}
                          {stop.is_destination_station && (
                            <span className="ml-2 text-xs text-purple-700">(ဆင်းရမည့်ဘူတာ)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">အစဉ် {stop.order_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">မျှော်မှန်းဆိုက်ရောက်ချိန်</p>
                        <p className="text-sm">{stop.expected_arrival || '--'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">အမှန်တကယ်ဆိုက်ရောက်ချိန်</p>
                        <p className="text-sm">
                          {stop.actual_arrival
                            ? formatRailwayTime(stop.actual_arrival, 'my-MM')
                            : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">အခြေအနေ</p>
                        <p className="font-medium">{statusLabel(stop.status)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketStatusPage;
