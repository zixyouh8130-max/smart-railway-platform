import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  TrainFront,
} from 'lucide-react';

import schedulesApi from '@/api/schedules';
import stationsApi from '@/api/stations';
import { formatRailwayDate, formatRailwayTime } from '@/utils/railwayDateTime';

const statusLabel = (value) => ({
  SCHEDULED: 'လက်မှတ်ဝယ်နိုင်သည်',
  ACTIVE: 'ပြေးဆွဲနေသည်',
  DELAYED: 'နှောင့်နှေးနေသည်',
  COMPLETED: 'ခရီးစဉ်ပြီးဆုံးသည်',
  CANCELLED: 'ဖျက်သိမ်းထားသည်',
}[String(value || '').toUpperCase()] || value || '--');

const TrainSearchResults = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const fromId = searchParams.get('fromStationId');
      const toId = searchParams.get('toStationId');

      try {
        const [results, from, to] = await Promise.all([
          schedulesApi.search({
            from_station_id: fromId,
            to_station_id: toId,
            route_ids: searchParams.get('routeIds'),
            date_from: searchParams.get('dateFrom'),
            date_to: searchParams.get('dateTo'),
          }),
          fromId ? stationsApi.getById(fromId) : Promise.resolve(null),
          toId ? stationsApi.getById(toId) : Promise.resolve(null),
        ]);
        setSchedules(results || []);
        setFromStation(from);
        setToStation(to);
      } catch (err) {
        setError(err.detail || err.message || 'ရထားခရီးစဉ်များကို ရှာ၍ မရပါ။');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [searchParams]);

  const handleBookNow = (schedule) => {
    navigate(`/booking/${schedule.schedule_id}`, {
      state: {
        schedule,
        fromStation,
        toStation,
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
        adults: searchParams.get('adults'),
        children: searchParams.get('children'),
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-24">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> ပြန်ရှာဖွေမည်
        </button>

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">ရထားခရီးစဉ် ရှာဖွေမှု</p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-950 sm:text-2xl">
                <span className="inline-flex items-center gap-2"><MapPin className="h-5 w-5 text-blue-700" /> {fromStation?.name || '...'}</span>
                <ArrowRight className="h-5 w-5 text-slate-400" />
                <span className="inline-flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600" /> {toStation?.name || '...'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{searchParams.get('dateFrom') || '--'} မှ {searchParams.get('dateTo') || '--'} အတွင်း</p>
            </div>
            {!loading && !error && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">{schedules.length} ခရီးစဉ်တွေ့ရှိ</span>}
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-6 text-left text-red-800">
            <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">ရှာဖွေမှု မအောင်မြင်ပါ</p><p className="mt-1 text-sm">{error}</p></div></div>
          </div>
        )}

        {loading ? (
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-3xl bg-white" />)}
          </div>
        ) : !error && schedules.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Search className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-4 !mb-0 !text-xl !font-bold text-slate-950">ရထားခရီးစဉ် မတွေ့ရှိပါ</h2>
            <p className="mt-2 text-sm text-slate-500">အခြားရက်စွဲ သို့မဟုတ် ဘူတာကို ပြန်ရွေးကြည့်ပါ။</p>
            <button type="button" onClick={() => navigate('/')} className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white">ပြန်လည်ရှာဖွေမည်</button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {schedules.map((schedule) => {
              const canBook = String(schedule.status || '').toUpperCase() === 'SCHEDULED';
              const travelDate = schedule.departure_date || searchParams.get('dateFrom');
              return (
                <article key={schedule.schedule_id} className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6">
                  <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><TrainFront className="h-6 w-6" /></span>
                      <div>
                        <h2 className="!m-0 !text-lg !font-bold text-slate-950">{schedule.train_name || `ရထား ${schedule.train_no || schedule.train_id || schedule.schedule_id}`}</h2>
                        <p className="mt-1 text-sm text-slate-500">{schedule.route_name || `ခရီးစဉ် #${schedule.schedule_id}`}</p>
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${canBook ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(schedule.status)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">ထွက်ခွာချိန်</p><p className="mt-1 font-bold text-slate-950">{schedule.departure_time ? formatRailwayTime(schedule.departure_time, 'my-MM') : '--'}</p>{travelDate && <p className="mt-1 text-xs text-slate-500"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{formatRailwayDate(travelDate, 'my-MM')}</p>}</div>
                      <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">ရောက်ရှိချိန်</p><p className="mt-1 font-bold text-slate-950">{schedule.arrival_time ? formatRailwayTime(schedule.arrival_time, 'my-MM') : '--'}</p><p className="mt-1 text-xs text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />အချိန်ဇယား</p></div>
                    </div>

                    <button type="button" onClick={() => handleBookNow(schedule)} disabled={!canBook} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                      {canBook ? 'လက်မှတ်ဝယ်မည်' : statusLabel(schedule.status)} {canBook && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainSearchResults;
