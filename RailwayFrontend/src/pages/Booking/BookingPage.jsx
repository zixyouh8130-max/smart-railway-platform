import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  ReceiptText,
  Armchair,
  TicketCheck,
  TrainFront,
  UserRound,
} from 'lucide-react';

import schedulesApi from '@/api/schedules';
import routesApi from '@/api/routes';
import seatsApi from '@/api/seats';
import bookingsApi from '@/api/bookings';
import feesApi from '@/api/fees';
import { formatRailwayDate, formatRailwayTime } from '@/utils/railwayDateTime';

const PASSENGER_COACH_TYPES = new Set(['UPPER_CLASS', 'ECONOMY_CLASS', 'SLEEPER']);

const COACH_LABELS = {
  UPPER_CLASS: 'အထက်တန်း',
  ECONOMY_CLASS: 'ရိုးရိုးတန်း',
  SLEEPER: 'အိပ်စင်',
};

const BOOKING_LABELS = {
  RESERVED: 'ကြိုတင်ထားသည်',
  CONFIRMED: 'အတည်ပြုပြီး',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
};

const feeClassForCoach = (coachType) => {
  const normalized = String(coachType || '').toUpperCase();
  return PASSENGER_COACH_TYPES.has(normalized) ? normalized : null;
};

const resolveRouteStation = (stations, stationLike, fallbackIndex) => {
  const canonicalId = stationLike?.stationId ?? stationLike?.id ?? null;
  if (canonicalId !== null) {
    const match = stations.find((item) => Number(item.station_id) === Number(canonicalId));
    if (match) return match;
  }

  const name = stationLike?.name;
  if (name) {
    const normalized = String(name).trim().toLowerCase();
    const match = stations.find((item) => String(item.station_name || '').trim().toLowerCase() === normalized);
    if (match) return match;
  }

  return stations[fallbackIndex] || null;
};

const inputClass = 'mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50';

const BookingPage = () => {
  const { scheduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(location.state?.schedule || null);
  const [route, setRoute] = useState(null);
  const [seatMap, setSeatMap] = useState(null);
  const [fromRouteStation, setFromRouteStation] = useState(null);
  const [toRouteStation, setToRouteStation] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [fare, setFare] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    customer_name: '',
    nrc: '',
    phone: '',
    email: '',
    passenger_count: 1,
    passenger_names: '',
    notes: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        let scheduleData;
        try {
          const fetchedSchedule = await schedulesApi.getById(Number(scheduleId));
          scheduleData = { ...(schedule || {}), ...fetchedSchedule };
        } catch (scheduleError) {
          if (!schedule) throw scheduleError;
          scheduleData = schedule;
        }
        setSchedule(scheduleData);

        if (String(scheduleData.status || '').toUpperCase() !== 'SCHEDULED') {
          throw new Error('ဤခရီးစဉ်အတွက် လက်မှတ်အသစ် မဝယ်နိုင်တော့ပါ။');
        }

        const [routeData, seatsData] = await Promise.all([
          routesApi.getById(scheduleData.route_id),
          seatsApi.getScheduleSeatMap(Number(scheduleId)),
        ]);

        setRoute(routeData);
        setSeatMap(seatsData);

        const routeStations = [...(routeData.stations || [])].sort((a, b) => a.order_number - b.order_number);
        setFromRouteStation(resolveRouteStation(routeStations, location.state?.fromStation, 0));
        setToRouteStation(resolveRouteStation(routeStations, location.state?.toStation, Math.max(routeStations.length - 1, 0)));

        const firstCoach = seatsData.coaches?.find((coach) => (
          PASSENGER_COACH_TYPES.has(String(coach.coach_type || '').toUpperCase())
          && coach.seats?.some((seat) => seat.available)
        ));

        if (firstCoach) {
          setSelectedCoachId(String(firstCoach.id));
          const firstSeat = firstCoach.seats.find((seat) => seat.available);
          if (firstSeat) setSelectedSeatId(String(firstSeat.id));
        }
      } catch (err) {
        setError(err.detail || err.message || 'Booking အချက်အလက်ကို ရယူ၍ မရပါ။');
      } finally {
        setLoading(false);
      }
    };

    load();
    // Initial navigation state is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const passengerCoaches = useMemo(() => (
    (seatMap?.coaches || []).filter((coach) => (
      PASSENGER_COACH_TYPES.has(String(coach.coach_type || '').toUpperCase())
      && coach.seats?.some((seat) => seat.available)
    ))
  ), [seatMap]);

  const selectedCoach = useMemo(() => (
    passengerCoaches.find((coach) => Number(coach.id) === Number(selectedCoachId)) || null
  ), [passengerCoaches, selectedCoachId]);

  const selectedSeat = useMemo(() => (
    selectedCoach?.seats?.find((seat) => Number(seat.id) === Number(selectedSeatId)) || null
  ), [selectedCoach, selectedSeatId]);

  const availableSeats = useMemo(() => (
    selectedCoach?.seats?.filter((seat) => seat.available) || []
  ), [selectedCoach]);

  useEffect(() => {
    const loadFare = async () => {
      if (!schedule || !fromRouteStation || !toRouteStation || !selectedCoach || !selectedSeat) {
        setFare(null);
        return;
      }
      if (fromRouteStation.order_number >= toRouteStation.order_number) {
        setFare(null);
        return;
      }

      try {
        const result = await feesApi.calculateFee({
          train_id: schedule.train_id,
          from_station_id: fromRouteStation.id,
          to_station_id: toRouteStation.id,
          route_id: schedule.route_id,
          class_type: feeClassForCoach(selectedCoach.coach_type),
          seat_type: selectedSeat.seat_type,
        });
        setFare(result);
        setError(null);
      } catch (err) {
        setFare(null);
        setError(err.detail || 'ဤခရီးစဉ်/ထိုင်ခုံအမျိုးအစားအတွက် လက်မှတ်ခ မသတ်မှတ်ရသေးပါ။');
      }
    };

    loadFare();
  }, [schedule, fromRouteStation, toRouteStation, selectedCoach, selectedSeat]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!fromRouteStation || !toRouteStation || !selectedSeat || !fare) {
      setError('ခရီးစဉ်နှင့် ရရှိနိုင်သော ထိုင်ခုံကို ရွေးချယ်ပါ။');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await bookingsApi.reserve({
        schedule_id: Number(scheduleId),
        seat_id: Number(selectedSeat.id),
        from_route_station_id: Number(fromRouteStation.id),
        to_route_station_id: Number(toRouteStation.id),
        customer_name: form.customer_name,
        nrc: form.nrc,
        phone: form.phone || null,
        email: form.email || null,
        passenger_count: 1,
        passenger_names: form.passenger_names || null,
        notes: form.notes || null,
      });
      setBooking(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.detail || err.message || 'Reservation မအောင်မြင်ပါ။');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDemoPayment = async () => {
    if (!booking) return;
    setSubmitting(true);
    setError(null);
    try {
      setBooking(await bookingsApi.confirm(booking.id, booking.total_cost));
    } catch (err) {
      setError(err.detail || err.message || 'Payment confirmation မအောင်မြင်ပါ။');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async () => {
    if (!booking || booking.booking_status === 'CANCELLED') return;
    setSubmitting(true);
    setError(null);
    try {
      setBooking(await bookingsApi.cancel(booking.id, 'Cancelled by passenger from booking page'));
    } catch (err) {
      setError(err.detail || err.message || 'Reservation ကို ဖျက်သိမ်း၍ မရပါ။');
    } finally {
      setSubmitting(false);
    }
  };

  const trainLookup = schedule?.train?.train_no
    || schedule?.train_no
    || schedule?.train?.train_name
    || schedule?.train_name
    || '';

  const trainName = schedule?.train?.train_name || schedule?.train_name || `ရထား ${schedule?.train_id || ''}`;
  const trainNo = schedule?.train?.train_no || schedule?.train_no || '--';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl animate-pulse space-y-4">
          <div className="h-36 rounded-3xl bg-white" />
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.7fr]"><div className="h-[520px] rounded-3xl bg-white" /><div className="h-80 rounded-3xl bg-white" /></div>
        </div>
      </div>
    );
  }

  if (!schedule || !route) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 text-left text-red-800">
          <p className="font-bold">Booking ကို ဖွင့်၍ မရပါ</p>
          <p className="mt-2 text-sm">{error || 'Schedule ကို ရှာမတွေ့ပါ။'}</p>
          <button type="button" onClick={() => navigate('/')} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> ပင်မစာမျက်နှာသို့ ပြန်မည်</button>
        </div>
      </div>
    );
  }

  if (booking) {
    const statusUrl = trainLookup
      ? `/pnr-status?ticket=${encodeURIComponent(booking.ticket_no)}&train=${encodeURIComponent(trainLookup)}`
      : `/pnr-status?ticket=${encodeURIComponent(booking.ticket_no)}`;

    return (
      <div className="min-h-screen bg-slate-50 pb-16 pt-24">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-blue-800 to-sky-700 p-6 text-left text-white sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><CheckCircle2 className="h-6 w-6" /></span>
              <h1 className="mt-5 !mb-0 !text-3xl !font-bold text-white">လက်မှတ် Reservation ပြုလုပ်ပြီးပါပြီ</h1>
              <p className="mt-2 text-sm leading-6 text-blue-100">လက်မှတ်နံပါတ်ကို သိမ်းထားပါ။ ရထားအခြေအနေစစ်ရန် လက်မှတ်နံပါတ်နှင့် ရထားနံပါတ်/အမည်ကို အသုံးပြုပါမည်။</p>
            </div>

            <div className="p-5 sm:p-8">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-xs text-slate-500">လက်မှတ်နံပါတ်</p><p className="mt-1 break-all font-bold text-slate-950">{booking.ticket_no}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-xs text-slate-500">Booking status</p><p className="mt-1 font-bold text-slate-950">{BOOKING_LABELS[booking.booking_status] || booking.booking_status}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-xs text-slate-500">ရထား</p><p className="mt-1 font-bold text-slate-950">{trainNo} · {trainName}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-xs text-slate-500">စုစုပေါင်း</p><p className="mt-1 font-bold text-slate-950">{Number(booking.total_cost || 0).toLocaleString()} Ks</p></div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 p-5 text-left">
                <div className="flex items-center gap-3"><TrainFront className="h-5 w-5 text-blue-700" /><p className="font-semibold text-slate-950">{fromRouteStation?.station_name} → {toRouteStation?.station_name}</p></div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatRailwayDate(schedule.departure_date, 'my-MM')}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> {formatRailwayTime(schedule.departure_time, 'my-MM')}</span>
                  <span className="inline-flex items-center gap-1.5"><Armchair className="h-4 w-4" /> {selectedCoach?.name} · {selectedSeat?.seat_number}</span>
                </div>
              </div>

              {booking.booking_status === 'RESERVED' && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
                  <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-amber-700" /><div><p className="font-semibold text-slate-950">Demo payment အတည်ပြုရန် ကျန်ရှိနေသည်</p><p className="mt-1 text-sm text-slate-600">Payment confirmation လုပ်ပြီးလျှင် booking status သည် CONFIRMED ဖြစ်ပါမည်။</p></div></div>
                </div>
              )}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {booking.booking_status === 'RESERVED' && (
                  <button type="button" onClick={confirmDemoPayment} disabled={submitting} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"><CreditCard className="h-4 w-4" /> {submitting ? 'လုပ်ဆောင်နေသည်…' : 'Demo payment အတည်ပြုမည်'}</button>
                )}
                <button type="button" onClick={() => navigate(statusUrl)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-semibold text-blue-700 hover:bg-blue-100"><TicketCheck className="h-4 w-4" /> လက်မှတ်အခြေအနေ စစ်မည်</button>
                {booking.booking_status !== 'CANCELLED' && (
                  <button type="button" onClick={cancelReservation} disabled={submitting} className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Reservation ဖျက်မည်</button>
                )}
              </div>
              {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-24">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <button type="button" onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> ရထားရွေးချယ်မှုသို့ ပြန်မည်</button>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white"><TrainFront className="h-6 w-6" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">လက်မှတ် Booking</p>
                <h1 className="mt-1 !mb-0 !text-2xl !font-bold text-slate-950 sm:!text-3xl">{trainName}</h1>
                <p className="mt-1 text-sm text-slate-500">ရထားနံပါတ် {trainNo} · ခရီးစဉ် #{scheduleId}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2"><CalendarDays className="h-4 w-4 text-blue-700" /> {formatRailwayDate(schedule.departure_date, 'my-MM')}</span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2"><Clock3 className="h-4 w-4 text-blue-700" /> {formatRailwayTime(schedule.departure_time, 'my-MM')}</span>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.65fr)] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">1</span><div><h2 className="!m-0 !text-lg !font-bold text-slate-950">ခရီးစဉ်နှင့် ထိုင်ခုံရွေးပါ</h2><p className="mt-1 text-sm text-slate-500">ဘူတာအစနှင့် အဆုံး၊ coach နှင့် seat ကို စစ်ဆေးရွေးချယ်ပါ။</p></div></div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label><span className="text-xs font-semibold text-slate-600">စတင်မည့်ဘူတာ</span><select value={fromRouteStation?.id || ''} onChange={(e) => setFromRouteStation(route.stations.find((item) => Number(item.id) === Number(e.target.value)) || null)} className={inputClass}>{(route.stations || []).filter((item) => !toRouteStation || item.order_number < toRouteStation.order_number).map((item) => <option key={item.id} value={item.id}>{item.station_name}</option>)}</select></label>
                <label><span className="text-xs font-semibold text-slate-600">ဆင်းမည့်ဘူတာ</span><select value={toRouteStation?.id || ''} onChange={(e) => setToRouteStation(route.stations.find((item) => Number(item.id) === Number(e.target.value)) || null)} className={inputClass}>{(route.stations || []).filter((item) => !fromRouteStation || item.order_number > fromRouteStation.order_number).map((item) => <option key={item.id} value={item.id}>{item.station_name}</option>)}</select></label>
                <label><span className="text-xs font-semibold text-slate-600">Coach</span><select value={selectedCoachId} onChange={(e) => { const id = e.target.value; setSelectedCoachId(id); const coach = passengerCoaches.find((item) => Number(item.id) === Number(id)); const seat = coach?.seats?.find((item) => item.available); setSelectedSeatId(seat ? String(seat.id) : ''); }} className={inputClass}>{passengerCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name} · {COACH_LABELS[String(coach.coach_type || '').toUpperCase()] || coach.coach_type}</option>)}</select></label>
                <label><span className="text-xs font-semibold text-slate-600">ထိုင်ခုံ</span><select value={selectedSeatId} onChange={(e) => setSelectedSeatId(e.target.value)} className={inputClass}>{availableSeats.map((seat) => <option key={seat.id} value={seat.id}>{seat.seat_number} · {seat.seat_type}</option>)}</select></label>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">2</span><div><h2 className="!m-0 !text-lg !font-bold text-slate-950">ခရီးသည်အချက်အလက်</h2><p className="mt-1 text-sm text-slate-500">လက်မှတ်ပေါ်တွင် အသုံးပြုမည့် အချက်အလက်များဖြစ်ပါသည်။</p></div></div>

              <form id="booking-form" onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label><span className="text-xs font-semibold text-slate-600">အမည် *</span><input required value={form.customer_name} onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))} placeholder="ခရီးသည်အမည်" className={inputClass} /></label>
                <label><span className="text-xs font-semibold text-slate-600">NRC *</span><input required value={form.nrc} onChange={(e) => setForm((prev) => ({ ...prev, nrc: e.target.value }))} placeholder="NRC နံပါတ်" className={inputClass} /></label>
                <label><span className="text-xs font-semibold text-slate-600">ဖုန်းနံပါတ်</span><input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="09..." className={inputClass} /></label>
                <label><span className="text-xs font-semibold text-slate-600">Email</span><input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@example.com" className={inputClass} /></label>
              </form>
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left text-sm text-red-700">{error}</div>}
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-blue-700" /><h2 className="!m-0 !text-lg !font-bold text-slate-950">Booking အနှစ်ချုပ်</h2></div>

              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><div><p className="text-xs text-slate-500">ခရီးစဉ်</p><p className="mt-0.5 font-semibold text-slate-900">{fromRouteStation?.station_name || '--'} → {toRouteStation?.station_name || '--'}</p></div></div>
                <div className="flex items-start gap-3"><Armchair className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><div><p className="text-xs text-slate-500">ထိုင်ခုံ</p><p className="mt-0.5 font-semibold text-slate-900">{selectedCoach?.name || '--'} · {selectedSeat?.seat_number || '--'}</p></div></div>
                <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><div><p className="text-xs text-slate-500">ခရီးသည်</p><p className="mt-0.5 font-semibold text-slate-900">1 ဦး</p></div></div>
              </div>

              <div className="my-5 border-t border-dashed border-slate-200" />

              {fare ? (
                <div>
                  <div className="flex items-end justify-between gap-3"><div><p className="text-xs text-slate-500">လက်မှတ်ခ</p><p className="mt-1 text-xs text-slate-500">{fare.calculation_method}{fare.distance !== null && fare.distance !== undefined ? ` · ${fare.distance} mi` : ''}</p></div><p className="text-2xl font-bold text-slate-950">{Number(fare.total_fare || 0).toLocaleString()} <span className="text-sm font-semibold">Ks</span></p></div>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">လက်မှတ်ခ မရရှိသေးပါ။ Admin fare configuration ကို စစ်ဆေးပါ။</div>
              )}

              <button form="booking-form" type="submit" disabled={submitting || !fare || !selectedSeat} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Reservation လုပ်နေသည်…' : 'လက်မှတ် ကြိုတင်မည်'} <ChevronRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">Payment သည် demo state ဖြစ်ပြီး reservation ပြီးနောက် အတည်ပြုနိုင်ပါသည်။</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
