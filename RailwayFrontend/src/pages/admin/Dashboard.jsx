import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useNavigate } from 'react-router-dom';

import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  MapPin,
  RefreshCw,
  Route,
  Ticket,
  Train,
  Users,
  Wrench,
} from 'lucide-react';

import api from '@/api/axios';


/* ============================================================
   Helpers
============================================================ */

const MYANMAR_TIME_ZONE = 'Asia/Yangon';


const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};


const formatNumber = (value) =>
  numberValue(value).toLocaleString('en-US');


const extractArray = (value, key) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.[key])) {
    return value[key];
  }

  if (Array.isArray(value?.data?.[key])) {
    return value.data[key];
  }

  return [];
};


const getTotal = (value, list) => {
  const candidates = [
    value?.total,
    value?.count,
    value?.data?.total,
    value?.data?.count,
  ];

  const found = candidates.find(
    (item) =>
      item !== undefined &&
      item !== null &&
      Number.isFinite(Number(item))
  );

  return found !== undefined
    ? Number(found)
    : list.length;
};


const getMyanmarToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MYANMAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};


const getDateKey = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}/.test(value)
  ) {
    return value.substring(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MYANMAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = {};

  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};


const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MYANMAR_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};


const formatClock = (value) => {
  if (!value) {
    return '—';
  }

  const text = String(value);

  if (text.includes('T')) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: MYANMAR_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }

  return text.length >= 5
    ? text.substring(0, 5)
    : text;
};


const humanize = (value) =>
  String(value || '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );


const getTrainLabel = (schedule) => {
  const train = schedule?.train || {};

  const trainNo =
    train.train_no ||
    schedule?.train_no ||
    '';

  const trainName =
    train.train_name ||
    schedule?.train_name ||
    '';

  if (trainNo && trainName) {
    return `${trainNo} · ${trainName}`;
  }

  if (trainName) {
    return trainName;
  }

  if (trainNo) {
    return trainNo;
  }

  if (schedule?.train_id) {
    return `Train ${schedule.train_id}`;
  }

  return 'ရထားအမည်မရှိ';
};


const hasTrainGps = (train) => {
  const latitude =
    train?.device?.latitude ??
    train?.latitude ??
    train?.current_latitude;

  const longitude =
    train?.device?.longitude ??
    train?.longitude ??
    train?.current_longitude;

  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined
  );
};


/* ============================================================
   Status
============================================================ */

const STATUS_LABELS = {
  ACTIVE: 'ပြေးဆွဲနေ',
  SCHEDULED: 'စီစဉ်ထား',
  COMPLETED: 'ပြီးစီး',
  CANCELLED: 'ပယ်ဖျက်',
  RESERVED: 'ကြိုတင်ထား',
  CONFIRMED: 'အတည်ပြုပြီး',
  EXPIRED: 'သက်တမ်းကုန်',
  OPEN: 'မစတင်ရသေး',
  ACKNOWLEDGED: 'လက်ခံပြီး',
  IN_PROGRESS: 'ဆောင်ရွက်နေ',
  VERIFYING: 'စစ်ဆေးနေ',
  BLOCKED: 'ရပ်တန့်ထား',
  REOPENED: 'ပြန်ဖွင့်ထား',
};


const STATUS_CLASSES = {
  ACTIVE:
    'border-emerald-200 bg-emerald-50 text-emerald-700',

  SCHEDULED:
    'border-blue-200 bg-blue-50 text-blue-700',

  COMPLETED:
    'border-slate-200 bg-slate-100 text-slate-700',

  CANCELLED:
    'border-red-200 bg-red-50 text-red-700',

  RESERVED:
    'border-amber-200 bg-amber-50 text-amber-700',

  CONFIRMED:
    'border-emerald-200 bg-emerald-50 text-emerald-700',

  EXPIRED:
    'border-slate-200 bg-slate-100 text-slate-600',

  OPEN:
    'border-orange-200 bg-orange-50 text-orange-700',

  ACKNOWLEDGED:
    'border-blue-200 bg-blue-50 text-blue-700',

  IN_PROGRESS:
    'border-sky-200 bg-sky-50 text-sky-700',

  VERIFYING:
    'border-violet-200 bg-violet-50 text-violet-700',

  BLOCKED:
    'border-red-200 bg-red-50 text-red-700',

  REOPENED:
    'border-amber-200 bg-amber-50 text-amber-700',
};


const StatusBadge = ({ status }) => {
  if (!status) {
    return null;
  }

  const key =
    String(status).toUpperCase();

  const classes =
    STATUS_CLASSES[key] ||
    'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span
      className={`
        inline-flex items-center
        rounded-full border
        px-2.5 py-1
        text-[11px] font-semibold
        ${classes}
      `}
    >
      {STATUS_LABELS[key] || humanize(key)}
    </span>
  );
};


/* ============================================================
   Reusable UI
============================================================ */

const Panel = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => {
  return (
    <section
      className={`
        overflow-hidden
        rounded-2xl
        border border-slate-200
        bg-white
        shadow-sm
        ${className}
      `}
    >
      <div
        className="
          flex flex-col gap-3
          border-b border-slate-100
          px-4 py-4
          sm:flex-row
          sm:items-center
          sm:justify-between
          sm:px-5
        "
      >
        <div>
          <h2 className="font-bold text-slate-900">
            {title}
          </h2>

          {subtitle ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {subtitle}
            </p>
          ) : null}
        </div>

        {action || null}
      </div>

      <div className="p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
};


const MetricCard = ({
  icon: Icon,
  title,
  value,
  description,
  tone = 'blue',
  onClick,
}) => {
  const toneClasses = {
    blue:
      'bg-blue-50 text-blue-600 border-blue-100',

    sky:
      'bg-sky-50 text-sky-600 border-sky-100',

    green:
      'bg-emerald-50 text-emerald-600 border-emerald-100',

    amber:
      'bg-amber-50 text-amber-600 border-amber-100',

    red:
      'bg-red-50 text-red-600 border-red-100',

    violet:
      'bg-violet-50 text-violet-600 border-violet-100',
  };

  const iconClass =
    toneClasses[tone] ||
    toneClasses.blue;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`
            flex h-11 w-11
            items-center justify-center
            rounded-xl border
            ${iconClass}
          `}
        >
          <Icon className="h-5 w-5" />
        </div>

        {onClick ? (
          <span className="text-lg text-slate-300">
            ›
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-2xl font-black text-slate-950 sm:text-3xl">
        {value}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-700">
        {title}
      </p>

      <p className="mt-1 min-h-5 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="
          w-full rounded-2xl
          border border-slate-200
          bg-white p-4
          text-left shadow-sm
          transition
          hover:-translate-y-0.5
          hover:border-blue-200
          hover:shadow-md
          focus:outline-none
          focus:ring-2
          focus:ring-blue-200
        "
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="
        rounded-2xl
        border border-slate-200
        bg-white p-4
        shadow-sm
      "
    >
      {content}
    </div>
  );
};


const EmptyState = ({
  icon: Icon = CheckCircle,
  title,
  description,
}) => {
  return (
    <div
      className="
        flex min-h-36
        flex-col items-center
        justify-center
        rounded-xl
        border border-dashed
        border-slate-200
        bg-slate-50/60
        px-5 py-8
        text-center
      "
    >
      <div
        className="
          flex h-10 w-10
          items-center justify-center
          rounded-full
          bg-white
          text-slate-400
          shadow-sm
          ring-1 ring-slate-200
        "
      >
        <Icon className="h-5 w-5" />
      </div>

      <p className="mt-3 text-sm font-semibold text-slate-700">
        {title}
      </p>

      {description ? (
        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
          {description}
        </p>
      ) : null}
    </div>
  );
};


/* ============================================================
   Dashboard
============================================================ */

const Dashboard = () => {
  const navigate = useNavigate();

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [failedSources, setFailedSources] =
    useState([]);

  const [data, setData] = useState({
    trains: null,
    routes: null,
    schedules: null,
    stations: null,
    liveTrains: null,
    users: null,
    bookings: null,
    inspection: null,
    maintenance: null,
    cases: null,
  });


  /* ========================================================
     Load real data

     IMPORTANT:
     Promise.allSettled is intentional.
     One unavailable module will not break the entire dashboard.
  ======================================================== */

  const loadDashboard = useCallback(
    async (manual = false) => {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const requests = [
        {
          key: 'trains',
          request: () =>
            api.get('/trains', {
              params: {
                skip: 0,
                limit: 100,
              },
            }),
        },

        {
          key: 'routes',
          request: () =>
            api.get('/routes', {
              params: {
                skip: 0,
                limit: 100,
              },
            }),
        },

        {
          key: 'schedules',
          request: () =>
            api.get('/schedules/', {
              params: {
                skip: 0,
                limit: 100,
              },
            }),
        },

        {
          key: 'stations',
          request: () =>
            api.get('/stations', {
              params: {
                skip: 0,
                limit: 100,
              },
            }),
        },

        {
          key: 'liveTrains',
          request: () =>
            api.get(
              '/routes-and-stations/active-trains'
            ),
        },

        {
          key: 'users',
          request: () =>
            api.get('/auth/admin/users'),
        },

        {
          key: 'bookings',
          request: () =>
            api.get('/bookings/', {
              params: {
                skip: 0,
                limit: 100,
              },
            }),
        },

        {
          key: 'inspection',
          request: () =>
            api.get(
              '/inspection/statistics/overview'
            ),
        },

        {
          key: 'maintenance',
          request: () =>
            api.get('/track-issues/statistics'),
        },

        {
          key: 'cases',
          request: () =>
            api.get('/track-issues'),
        },
      ];

      const results =
        await Promise.allSettled(
          requests.map((item) =>
            item.request()
          )
        );

      const failures = [];

      setData((previous) => {
        const next = {
          ...previous,
        };

        results.forEach(
          (result, index) => {
            const key =
              requests[index].key;

            if (
              result.status ===
              'fulfilled'
            ) {
              next[key] =
                result.value.data;
            } else {
              failures.push(key);

              console.error(
                `Dashboard source failed: ${key}`,
                result.reason
              );
            }
          }
        );

        return next;
      });

      setFailedSources(failures);
      setLastUpdated(new Date());

      setLoading(false);
      setRefreshing(false);
    },
    []
  );


  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);


  /* ========================================================
     Normalize backend responses
  ======================================================== */

  const dashboard = useMemo(() => {
    const trains =
      extractArray(
        data.trains,
        'trains'
      );

    const routes =
      extractArray(
        data.routes,
        'routes'
      );

    const schedules =
      extractArray(
        data.schedules,
        'schedules'
      );

    const stations =
      extractArray(
        data.stations,
        'stations'
      );

    const liveTrains =
      extractArray(
        data.liveTrains,
        'trains'
      );

    const users =
      extractArray(
        data.users,
        'users'
      );

    const bookings =
      extractArray(
        data.bookings,
        'bookings'
      );

    const cases =
      extractArray(
        data.cases,
        'cases'
      );

    const today =
      getMyanmarToday();

    const todaySchedules = schedules
      .filter(
        (schedule) =>
          getDateKey(
            schedule.departure_date
          ) === today
      )
      .sort((a, b) =>
        String(
          a.departure_time || ''
        ).localeCompare(
          String(
            b.departure_time || ''
          )
        )
      );

    const activeCatalogTrains =
      trains.filter(
        (train) =>
          String(
            train.status || ''
          ).toUpperCase() ===
          'ACTIVE'
      ).length;

    const activeRoutes =
      routes.filter(
        (route) =>
          String(
            route.status || ''
          ).toUpperCase() ===
          'ACTIVE'
      ).length;

    const activeUsers =
      users.filter(
        (user) =>
          user?.is_active !== false
      ).length;

    const activeSchedules =
      todaySchedules.filter(
        (schedule) =>
          String(
            schedule.status || ''
          ).toUpperCase() ===
          'ACTIVE'
      ).length;

    const gpsMissing =
      liveTrains.filter(
        (train) =>
          !hasTrainGps(train)
      ).length;

    const recentBookings =
      [...bookings]
        .sort(
          (a, b) =>
            new Date(
              b.created_at ||
                b.booking_date ||
                0
            ).getTime() -
            new Date(
              a.created_at ||
                a.booking_date ||
                0
            ).getTime()
        )
        .slice(0, 4);

    const recentCases =
      [...cases]
        .sort(
          (a, b) =>
            new Date(
              b.updated_at || 0
            ).getTime() -
            new Date(
              a.updated_at || 0
            ).getTime()
        )
        .slice(0, 5);

    const defectDistribution =
      Object.entries(
        data.inspection
          ?.defect_distribution ||
          {}
      )
        .map(
          ([name, count]) => ({
            name,
            count: numberValue(
              count
            ),
          })
        )
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 6);

    const maxDefectCount =
      Math.max(
        1,
        ...defectDistribution.map(
          (item) => item.count
        )
      );

    return {
      trains,
      routes,
      schedules,
      stations,
      liveTrains,
      users,
      bookings,
      cases,

      todaySchedules,
      activeSchedules,

      activeCatalogTrains,
      activeRoutes,
      activeUsers,

      gpsMissing,
      recentBookings,
      recentCases,

      defectDistribution,
      maxDefectCount,

      totalTrains:
        getTotal(
          data.trains,
          trains
        ),

      totalRoutes:
        getTotal(
          data.routes,
          routes
        ),

      totalStations:
        getTotal(
          data.stations,
          stations
        ),

      totalUsers:
        getTotal(
          data.users,
          users
        ),

      totalBookings:
        getTotal(
          data.bookings,
          bookings
        ),

      liveTrainCount:
        numberValue(
          data.liveTrains
            ?.active_count ??
            liveTrains.length
        ),
    };
  }, [data]);


  /* ========================================================
     Warnings
  ======================================================== */

  const warnings = useMemo(() => {
    const items = [];

    const maintenance =
      data.maintenance || {};

    if (
      numberValue(
        maintenance.blocked_cases
      ) > 0
    ) {
      items.push({
        id: 'blocked',
        title: `${formatNumber(
          maintenance.blocked_cases
        )} maintenance case ရပ်တန့်နေသည်`,
        text:
          'Track Engineer workflow ကို စစ်ဆေးရန်လိုအပ်ပါသည်။',
        path:
          '/admin/track-issues',
        color:
          'border-red-200 bg-red-50',
        iconColor:
          'text-red-600',
      });
    }

    if (
      numberValue(
        maintenance.unassigned_cases
      ) > 0
    ) {
      items.push({
        id: 'unassigned',
        title: `${formatNumber(
          maintenance.unassigned_cases
        )} case တွင် Engineer မသတ်မှတ်ရသေးပါ`,
        text:
          'ကွင်းဆင်းလုပ်ဆောင်ရန် Track Engineer တာဝန်ပေးပါ။',
        path:
          '/admin/track-issues',
        color:
          'border-amber-200 bg-amber-50',
        iconColor:
          'text-amber-600',
      });
    }

    if (
      numberValue(
        maintenance.needs_field_check
      ) > 0
    ) {
      items.push({
        id: 'field',
        title: `${formatNumber(
          maintenance.needs_field_check
        )} defect ကို ကွင်းဆင်းစစ်ဆေးရန်လိုသည်`,
        text:
          'AI finding များသည် Engineer verification ကို စောင့်ဆိုင်းနေပါသည်။',
        path:
          '/admin/track-issues',
        color:
          'border-blue-200 bg-blue-50',
        iconColor:
          'text-blue-600',
      });
    }

    if (
      dashboard.gpsMissing > 0
    ) {
      items.push({
        id: 'gps',
        title: `${formatNumber(
          dashboard.gpsMissing
        )} active train တွင် GPS data မရှိပါ`,
        text:
          'Train Rider device နှင့် location connection ကို စစ်ဆေးပါ။',
        path:
          '/admin/train-monitoring',
        color:
          'border-orange-200 bg-orange-50',
        iconColor:
          'text-orange-600',
      });
    }

    return items;
  }, [
    data.maintenance,
    dashboard.gpsMissing,
  ]);


  /* ========================================================
     Quick access
  ======================================================== */

  const quickActions = [
    {
      label:
        'ရထားတည်နေရာ',
      detail:
        'Live Train Tracking',
      icon: MapPin,
      path:
        '/admin/train-monitoring',
      iconClass:
        'bg-emerald-50 text-emerald-600',
    },

    {
      label:
        'AI လမ်းစစ်ဆေးမှု',
      detail:
        'Track Inspection',
      icon: Activity,
      path:
        '/admin/inspection',
      iconClass:
        'bg-blue-50 text-blue-600',
    },

    {
      label:
        'ပြုပြင်မှု Kanban',
      detail:
        'Maintenance',
      icon: Wrench,
      path:
        '/admin/track-issues',
      iconClass:
        'bg-amber-50 text-amber-600',
    },

    {
      label:
        'အချိန်ဇယား',
      detail:
        'Schedules',
      icon: Calendar,
      path:
        '/admin/schedules',
      iconClass:
        'bg-violet-50 text-violet-600',
    },

    {
      label:
        'ရထားများ',
      detail:
        'Train Management',
      icon: Train,
      path:
        '/admin/trains',
      iconClass:
        'bg-sky-50 text-sky-600',
    },

    {
      label:
        'လမ်းကြောင်းများ',
      detail:
        'Routes',
      icon: Route,
      path:
        '/admin/routes',
      iconClass:
        'bg-cyan-50 text-cyan-600',
    },

    {
      label:
        'ဘူတာများ',
      detail:
        'Stations',
      icon: MapPin,
      path:
        '/admin/stations',
      iconClass:
        'bg-slate-100 text-slate-600',
    },

    {
      label:
        'အသုံးပြုသူများ',
      detail:
        'Users & Staff',
      icon: Users,
      path:
        '/admin/users',
      iconClass:
        'bg-fuchsia-50 text-fuchsia-600',
    },
  ];


  /* ========================================================
     Loading
  ======================================================== */

  if (loading) {
    return (
      <div
        className="
          flex min-h-[60vh]
          items-center
          justify-center
        "
      >
        <div className="text-center">
          <div
            className="
              mx-auto
              flex h-14 w-14
              items-center
              justify-center
              rounded-2xl
              bg-blue-50
              text-blue-600
            "
          >
            <RefreshCw
              className="
                h-7 w-7
                animate-spin
              "
            />
          </div>

          <p className="mt-4 font-semibold text-slate-700">
            Dashboard data
            ရယူနေပါသည်…
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Railway services
            များကို ချိတ်ဆက်နေပါသည်
          </p>
        </div>
      </div>
    );
  }


  /* ========================================================
     Render
  ======================================================== */

  return (
    <div
      className="
        mx-auto
        w-full
        max-w-[1600px]
        space-y-5
        pb-8
      "
    >
      {/* ====================================================
          Header
      ==================================================== */}

      <section
        className="
          relative overflow-hidden
          rounded-3xl
          border border-blue-100
          bg-gradient-to-br
          from-white
          via-blue-50
          to-sky-100
          p-5
          shadow-sm
          sm:p-7
        "
      >
        <div
          className="
            absolute
            -right-20
            -top-20
            h-56 w-56
            rounded-full
            bg-blue-300/20
            blur-3xl
          "
        />

        <div
          className="
            relative
            flex flex-col gap-5
            lg:flex-row
            lg:items-end
            lg:justify-between
          "
        >
          <div>
            <div
              className="
                inline-flex
                items-center gap-2
                rounded-full
                bg-white
                px-3 py-1.5
                text-xs
                font-semibold
                text-blue-700
                shadow-sm
                ring-1 ring-blue-100
              "
            >
              <span
                className="
                  h-2 w-2
                  rounded-full
                  bg-emerald-500
                "
              />

              Smart Railway
              Operations
            </div>

            <h1
              className="
                mt-4
                text-2xl
                font-black
                tracking-tight
                text-slate-950
                sm:text-3xl
              "
            >
              ထိန်းချုပ်စင်တာ
            </h1>

            <p
              className="
                mt-2
                max-w-3xl
                text-sm
                leading-6
                text-slate-600
              "
            >
              ရထားပြေးဆွဲမှု၊ GPS
              တည်နေရာ၊ AI
              လမ်းစစ်ဆေးမှု၊
              ပြုပြင်ထိန်းသိမ်းရေးနှင့်
              passenger booking
              အခြေအနေများကို
              တစ်နေရာတည်းမှ
              ကြည့်ရှုနိုင်ပါသည်။
            </p>
          </div>

          <div
            className="
              flex flex-wrap
              items-center gap-2
            "
          >
            <div
              className="
                rounded-xl
                bg-white/80
                px-3 py-2
                text-xs
                text-slate-500
                shadow-sm
                ring-1
                ring-slate-200
              "
            >
              နောက်ဆုံးရယူမှု:{' '}

              <span className="font-semibold text-slate-700">
                {lastUpdated
                  ? formatDateTime(
                      lastUpdated
                    )
                  : '—'}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              className="
                inline-flex
                items-center gap-2
                rounded-xl
                bg-blue-600
                px-4 py-2.5
                text-sm
                font-semibold
                text-white
                shadow-sm
                transition
                hover:bg-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              <RefreshCw
                className={`
                  h-4 w-4
                  ${
                    refreshing
                      ? 'animate-spin'
                      : ''
                  }
                `}
              />

              {refreshing
                ? 'ရယူနေသည်…'
                : 'Refresh'}
            </button>
          </div>
        </div>
      </section>


      {/* ====================================================
          Partial API errors
      ==================================================== */}

      {failedSources.length > 0 ? (
        <div
          className="
            flex flex-col gap-3
            rounded-2xl
            border border-amber-200
            bg-amber-50
            p-4
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="
                mt-0.5
                h-5 w-5
                shrink-0
                text-amber-600
              "
            />

            <div>
              <p className="text-sm font-semibold text-amber-900">
                Dashboard data
                အချို့ မရရှိသေးပါ
              </p>

              <p className="mt-1 text-xs text-amber-700">
                မရရှိသော source:{' '}
                {failedSources.join(
                  ', '
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              loadDashboard(true)
            }
            className="
              rounded-lg
              bg-white
              px-3 py-2
              text-xs
              font-semibold
              text-amber-800
              ring-1
              ring-amber-200
            "
          >
            ပြန်လည်ရယူရန်
          </button>
        </div>
      ) : null}


      {/* ====================================================
          Main metrics
      ==================================================== */}

      <div
        className="
          grid
          grid-cols-2
          gap-3
          md:grid-cols-3
          xl:grid-cols-6
        "
      >
        <MetricCard
          icon={Train}
          title="Live ရထား"
          value={formatNumber(
            dashboard.liveTrainCount
          )}
          description="GPS ဖြင့် လက်ရှိပြေးဆွဲနေသော service"
          tone="green"
          onClick={() =>
            navigate(
              '/admin/train-monitoring'
            )
          }
        />

        <MetricCard
          icon={Calendar}
          title="ယနေ့အချိန်ဇယား"
          value={formatNumber(
            dashboard.todaySchedules
              .length
          )}
          description={`${formatNumber(
            dashboard.activeSchedules
          )} ခု လက်ရှိ ACTIVE`}
          tone="blue"
          onClick={() =>
            navigate(
              '/admin/schedules'
            )
          }
        />

        <MetricCard
          icon={Wrench}
          title="ဆောင်ရွက်ဆဲ Case"
          value={formatNumber(
            data.maintenance
              ?.open_cases
          )}
          description={`${formatNumber(
            data.maintenance
              ?.unassigned_cases
          )} ခု တာဝန်မပေးရသေး`}
          tone="amber"
          onClick={() =>
            navigate(
              '/admin/track-issues'
            )
          }
        />

        <MetricCard
          icon={Activity}
          title="AI Defect Findings"
          value={formatNumber(
            data.inspection
              ?.total_defects
          )}
          description={`${formatNumber(
            data.inspection
              ?.total_inspections
          )} inspections`}
          tone="violet"
          onClick={() =>
            navigate(
              '/admin/inspection'
            )
          }
        />

        <MetricCard
          icon={Ticket}
          title="Booking"
          value={formatNumber(
            dashboard.totalBookings
          )}
          description="PostgreSQL booking records"
          tone="sky"
        />

        <MetricCard
          icon={Users}
          title="အသုံးပြုသူများ"
          value={formatNumber(
            dashboard.totalUsers
          )}
          description={`${formatNumber(
            dashboard.activeUsers
          )} active accounts`}
          tone="blue"
          onClick={() =>
            navigate(
              '/admin/users'
            )
          }
        />
      </div>


      {/* ====================================================
          Quick actions
      ==================================================== */}

      <Panel
        title="အမြန်ဝင်ရောက်ရန်"
        subtitle="နေ့စဉ်အသုံးများသော railway workflow များ"
      >
        <div
          className="
            grid
            grid-cols-2
            gap-3
            sm:grid-cols-3
            lg:grid-cols-4
            xl:grid-cols-8
          "
        >
          {quickActions.map(
            (action) => {
              const Icon =
                action.icon;

              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() =>
                    navigate(
                      action.path
                    )
                  }
                  className="
                    group
                    rounded-2xl
                    border
                    border-slate-200
                    bg-slate-50/70
                    p-3
                    text-left
                    transition
                    hover:-translate-y-0.5
                    hover:border-blue-200
                    hover:bg-white
                    hover:shadow-md
                  "
                >
                  <div
                    className={`
                      flex h-10 w-10
                      items-center
                      justify-center
                      rounded-xl
                      ${action.iconClass}
                    `}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <p
                    className="
                      mt-3
                      text-sm
                      font-bold
                      text-slate-800
                    "
                  >
                    {action.label}
                  </p>

                  <p
                    className="
                      mt-1
                      text-[11px]
                      text-slate-400
                    "
                  >
                    {action.detail}
                  </p>
                </button>
              );
            }
          )}
        </div>
      </Panel>


      {/* ====================================================
          Live trains + alerts
      ==================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-5
          xl:grid-cols-5
        "
      >
        <Panel
          className="xl:col-span-3"
          title="Live Train Operations"
          subtitle="လက်ရှိ ACTIVE train နှင့် GPS အခြေအနေ"
          action={
            <button
              type="button"
              onClick={() =>
                navigate(
                  '/admin/train-monitoring'
                )
              }
              className="
                text-xs
                font-semibold
                text-blue-600
                hover:text-blue-800
              "
            >
              အားလုံးကြည့်ရန် →
            </button>
          }
        >
          {dashboard.liveTrains
            .length === 0 ? (
            <EmptyState
              icon={Train}
              title="လက်ရှိပြေးဆွဲနေသော ရထားမရှိပါ"
              description="ACTIVE journey စတင်သောအခါ live train များကို ဒီနေရာတွင် ပြပါမည်။"
            />
          ) : (
            <div className="space-y-3">
              {dashboard.liveTrains
                .slice(0, 5)
                .map((train) => {
                  const gps =
                    hasTrainGps(
                      train
                    );

                  const progress =
                    Math.max(
                      0,
                      Math.min(
                        100,
                        numberValue(
                          train.progress_percent
                        )
                      )
                    );

                  return (
                    <button
                      key={
                        train.schedule_id ||
                        train.id ||
                        train.train_id
                      }
                      type="button"
                      onClick={() =>
                        navigate(
                          '/admin/train-monitoring'
                        )
                      }
                      className="
                        w-full
                        rounded-2xl
                        border
                        border-slate-200
                        bg-slate-50/60
                        p-4
                        text-left
                        transition
                        hover:border-blue-200
                        hover:bg-white
                        hover:shadow-sm
                      "
                    >
                      <div
                        className="
                          flex flex-col
                          gap-4
                          sm:flex-row
                          sm:items-center
                          sm:justify-between
                        "
                      >
                        <div
                          className="
                            flex
                            min-w-0
                            items-center
                            gap-3
                          "
                        >
                          <div
                            className="
                              flex h-11 w-11
                              shrink-0
                              items-center
                              justify-center
                              rounded-xl
                              bg-blue-600
                              text-white
                            "
                          >
                            <Train className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <p
                              className="
                                truncate
                                text-sm
                                font-bold
                                text-slate-900
                              "
                            >
                              {train.train_no ||
                                '—'}{' '}
                              ·{' '}
                              {train.train_name ||
                                'Train'}
                            </p>

                            <div
                              className="
                                mt-1
                                flex
                                flex-wrap
                                items-center
                                gap-2
                              "
                            >
                              <StatusBadge
                                status={
                                  train.status ||
                                  'ACTIVE'
                                }
                              />

                              <span
                                className={
                                  gps
                                    ? 'text-xs text-emerald-600'
                                    : 'text-xs text-amber-600'
                                }
                              >
                                {gps
                                  ? '● GPS online'
                                  : '● GPS မရှိ'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-[150px]">
                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              justify-between
                              text-[11px]
                              text-slate-500
                            "
                          >
                            <span>
                              Route progress
                            </span>

                            <span className="font-semibold text-slate-700">
                              {progress.toFixed(
                                0
                              )}
                              %
                            </span>
                          </div>

                          <div
                            className="
                              h-2
                              overflow-hidden
                              rounded-full
                              bg-slate-200
                            "
                          >
                            <div
                              className="
                                h-full
                                rounded-full
                                bg-blue-500
                              "
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </Panel>


        <Panel
          className="xl:col-span-2"
          title="အာရုံစိုက်ရန်"
          subtitle="လက်ရှိ system state မှ warning များ"
        >
          {warnings.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="အရေးပေါ်ဆောင်ရွက်ရန် မရှိပါ"
              description="Blocked case, unassigned case နှင့် GPS warning မတွေ့ရှိပါ။"
            />
          ) : (
            <div className="space-y-3">
              {warnings.map(
                (warning) => (
                  <button
                    key={warning.id}
                    type="button"
                    onClick={() =>
                      navigate(
                        warning.path
                      )
                    }
                    className={`
                      flex w-full
                      items-start
                      gap-3
                      rounded-xl
                      border
                      p-3
                      text-left
                      transition
                      hover:shadow-sm
                      ${warning.color}
                    `}
                  >
                    <AlertCircle
                      className={`
                        mt-0.5
                        h-5 w-5
                        shrink-0
                        ${warning.iconColor}
                      `}
                    />

                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {
                          warning.title
                        }
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {warning.text}
                      </p>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </Panel>
      </div>


      {/* ====================================================
          Schedule + Railway Network
      ==================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-5
          xl:grid-cols-5
        "
      >
        <Panel
          className="xl:col-span-3"
          title="ယနေ့ ရထားပြေးဆွဲမှု"
          subtitle={`${getMyanmarToday()} · ${formatNumber(
            dashboard.todaySchedules
              .length
          )} schedules`}
          action={
            <button
              type="button"
              onClick={() =>
                navigate(
                  '/admin/schedules'
                )
              }
              className="
                text-xs
                font-semibold
                text-blue-600
              "
            >
              အချိန်ဇယားစီမံရန် →
            </button>
          }
        >
          {dashboard.todaySchedules
            .length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="ယနေ့အချိန်ဇယား မရှိပါ"
              description="Schedules Management တွင် ရထား service များ စီစဉ်နိုင်ပါသည်။"
            />
          ) : (
            <div
              className="
                overflow-hidden
                rounded-xl
                border
                border-slate-200
              "
            >
              <div
                className="
                  hidden
                  grid-cols-4
                  gap-3
                  bg-slate-50
                  px-4 py-2.5
                  text-xs
                  font-semibold
                  text-slate-400
                  sm:grid
                "
              >
                <span>အချိန်</span>
                <span>ရထား</span>
                <span>Status</span>
                <span className="text-right">
                  Schedule
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {dashboard.todaySchedules
                  .slice(0, 7)
                  .map(
                    (schedule) => (
                      <div
                        key={
                          schedule.id
                        }
                        className="
                          grid gap-2
                          px-4 py-3
                          sm:grid-cols-4
                          sm:items-center
                          sm:gap-3
                        "
                      >
                        <div
                          className="
                            flex
                            items-center
                            gap-2
                            text-sm
                            font-bold
                            text-slate-800
                          "
                        >
                          <Clock className="h-4 w-4 text-blue-500" />

                          {formatClock(
                            schedule.departure_time
                          )}
                        </div>

                        <p
                          className="
                            truncate
                            text-sm
                            font-semibold
                            text-slate-800
                          "
                        >
                          {getTrainLabel(
                            schedule
                          )}
                        </p>

                        <div>
                          <StatusBadge
                            status={
                              schedule.status
                            }
                          />
                        </div>

                        <p
                          className="
                            text-xs
                            text-slate-400
                            sm:text-right
                          "
                        >
                          #
                          {schedule.id}
                        </p>
                      </div>
                    )
                  )}
              </div>
            </div>
          )}
        </Panel>


        <Panel
          className="xl:col-span-2"
          title="Railway Network"
          subtitle="လက်ရှိ PostgreSQL system inventory"
        >
          <div
            className="
              grid
              grid-cols-2
              gap-3
            "
          >
            {[
              {
                label:
                  'ရထား',
                value:
                  dashboard.totalTrains,
                helper: `${formatNumber(
                  dashboard.activeCatalogTrains
                )} active`,
                icon: Train,
                path:
                  '/admin/trains',
              },

              {
                label:
                  'လမ်းကြောင်း',
                value:
                  dashboard.totalRoutes,
                helper: `${formatNumber(
                  dashboard.activeRoutes
                )} active`,
                icon: Route,
                path:
                  '/admin/routes',
              },

              {
                label:
                  'ဘူတာ',
                value:
                  dashboard.totalStations,
                helper:
                  'railway stations',
                icon: MapPin,
                path:
                  '/admin/stations',
              },

              {
                label:
                  'Maintenance Case',
                value:
                  data.maintenance
                    ?.total_cases,
                helper: `${formatNumber(
                  data.maintenance
                    ?.completed_cases
                )} completed`,
                icon: Wrench,
                path:
                  '/admin/track-issues',
              },
            ].map((item) => {
              const Icon =
                item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    navigate(
                      item.path
                    )
                  }
                  className="
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    p-3
                    text-left
                    transition
                    hover:border-blue-200
                    hover:bg-blue-50
                  "
                >
                  <Icon className="h-4 w-4 text-blue-500" />

                  <p className="mt-3 text-xl font-bold text-slate-900">
                    {formatNumber(
                      item.value
                    )}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    {item.label}
                  </p>

                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.helper}
                  </p>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>


      {/* ====================================================
          Inspection + Maintenance
      ==================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-5
          xl:grid-cols-2
        "
      >
        <Panel
          title="AI Track Inspection"
          subtitle="MongoDB inspection data မှ defect statistics"
          action={
            <button
              type="button"
              onClick={() =>
                navigate(
                  '/admin/inspection'
                )
              }
              className="
                text-xs
                font-semibold
                text-blue-600
              "
            >
              Inspection →
            </button>
          }
        >
          <div
            className="
              grid gap-5
              md:grid-cols-[160px_1fr]
            "
          >
            <div
              className="
                rounded-2xl
                bg-slate-900
                p-4
                text-white
              "
            >
              <Activity className="h-6 w-6 text-blue-300" />

              <p className="mt-5 text-3xl font-black">
                {formatNumber(
                  data.inspection
                    ?.total_defects
                )}
              </p>

              <p className="mt-1 text-xs text-slate-300">
                AI defect findings
              </p>

              <div
                className="
                  mt-5
                  border-t
                  border-white/10
                  pt-4
                "
              >
                <p className="text-lg font-bold">
                  {formatNumber(
                    data.inspection
                      ?.total_inspections
                  )}
                </p>

                <p className="text-[11px] text-slate-400">
                  inspections
                </p>
              </div>
            </div>


            <div className="space-y-3">
              {dashboard
                .defectDistribution
                .length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="Defect statistics မရှိသေးပါ"
                  description="Inspection data ရရှိလာသောအခါ defect class အလိုက် ပြပါမည်။"
                />
              ) : (
                dashboard
                  .defectDistribution
                  .map((item) => {
                    const width =
                      Math.max(
                        5,
                        (item.count /
                          dashboard.maxDefectCount) *
                          100
                      );

                    return (
                      <div
                        key={
                          item.name
                        }
                      >
                        <div
                          className="
                            mb-1.5
                            flex
                            items-center
                            justify-between
                            gap-3
                            text-xs
                          "
                        >
                          <span className="truncate font-semibold text-slate-700">
                            {
                              item.name
                            }
                          </span>

                          <span className="font-bold text-slate-900">
                            {formatNumber(
                              item.count
                            )}
                          </span>
                        </div>

                        <div
                          className="
                            h-2
                            overflow-hidden
                            rounded-full
                            bg-slate-100
                          "
                        >
                          <div
                            className="
                              h-full
                              rounded-full
                              bg-blue-500
                            "
                            style={{
                              width: `${width}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </Panel>


        <Panel
          title="Maintenance Workflow"
          subtitle="Track Engineer field verification နှင့် repair progress"
          action={
            <button
              type="button"
              onClick={() =>
                navigate(
                  '/admin/track-issues'
                )
              }
              className="
                text-xs
                font-semibold
                text-blue-600
              "
            >
              Kanban →
            </button>
          }
        >
          <div
            className="
              grid
              grid-cols-2
              gap-3
              sm:grid-cols-4
            "
          >
            {[
              {
                label:
                  'ဆောင်ရွက်ဆဲ',
                value:
                  data.maintenance
                    ?.open_cases,
                color:
                  'bg-blue-50 text-blue-700',
              },

              {
                label:
                  'ကွင်းဆင်းစစ်ရန်',
                value:
                  data.maintenance
                    ?.needs_field_check,
                color:
                  'bg-amber-50 text-amber-700',
              },

              {
                label:
                  'အတည်ပြုပြီး',
                value:
                  data.maintenance
                    ?.confirmed_findings,
                color:
                  'bg-emerald-50 text-emerald-700',
              },

              {
                label:
                  'ထပ်စစ်ရန်',
                value:
                  data.maintenance
                    ?.follow_up_findings,
                color:
                  'bg-violet-50 text-violet-700',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="
                  rounded-xl
                  border
                  border-slate-200
                  p-3
                "
              >
                <span
                  className={`
                    inline-flex
                    rounded-lg
                    px-2 py-1
                    text-[10px]
                    font-bold
                    ${item.color}
                  `}
                >
                  {item.label}
                </span>

                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {formatNumber(
                    item.value
                  )}
                </p>
              </div>
            ))}
          </div>


          <div className="mt-4 space-y-2.5">
            {dashboard.recentCases
              .length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Maintenance case မရှိသေးပါ"
                description="AI inspection ကို maintenance case အဖြစ် sync လုပ်သောအခါ ပြပါမည်။"
              />
            ) : (
              dashboard.recentCases.map(
                (item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      navigate(
                        '/admin/track-issues'
                      )
                    }
                    className="
                      flex w-full
                      items-center
                      gap-3
                      rounded-xl
                      border
                      border-slate-200
                      bg-slate-50/60
                      p-3
                      text-left
                      transition
                      hover:border-blue-200
                      hover:bg-white
                    "
                  >
                    <div
                      className="
                        flex h-9 w-9
                        shrink-0
                        items-center
                        justify-center
                        rounded-xl
                        bg-amber-50
                        text-amber-600
                      "
                    >
                      <Wrench className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {item.case_name ||
                          item.run_id ||
                          `Inspection Case ${String(
                            item.id
                          ).substring(
                            0,
                            8
                          )}`}
                      </p>

                      <p className="mt-1 truncate text-xs text-slate-500">
                        {formatNumber(
                          item.completed_findings
                        )}
                        /
                        {formatNumber(
                          item.total_findings
                        )}{' '}
                        findings complete
                      </p>
                    </div>

                    <StatusBadge
                      status={
                        item.status
                      }
                    />
                  </button>
                )
              )
            )}
          </div>
        </Panel>
      </div>


      {/* ====================================================
          Recent bookings
      ==================================================== */}

      <Panel
        title="လတ်တလော Booking"
        subtitle="နောက်ဆုံး booking records"
      >
        {dashboard.recentBookings
          .length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Booking record မရှိသေးပါ"
            description="Passenger booking ရှိလာသောအခါ နောက်ဆုံး records များကို ဒီနေရာတွင် ပြပါမည်။"
          />
        ) : (
          <div
            className="
              grid
              gap-3
              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            {dashboard.recentBookings.map(
              (booking) => (
                <div
                  key={booking.id}
                  className="
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50/60
                    p-4
                  "
                >
                  <div
                    className="
                      flex
                      items-start
                      justify-between
                      gap-3
                    "
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {booking.ticket_no ||
                          booking.booking_no ||
                          `Booking #${booking.id}`}
                      </p>

                      <p className="mt-1 truncate text-xs text-slate-500">
                        {booking.passenger_name ||
                          booking.full_name ||
                          booking.email ||
                          'Passenger'}
                      </p>
                    </div>

                    <Ticket className="h-5 w-5 shrink-0 text-blue-500" />
                  </div>

                  <div
                    className="
                      mt-4
                      flex
                      items-end
                      justify-between
                      gap-3
                    "
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {formatNumber(
                          booking.total_cost ??
                            booking.total_amount ??
                            booking.payment_amount
                        )}{' '}
                        Ks
                      </p>
                    </div>

                    <div className="text-right">
                      <StatusBadge
                        status={
                          booking.booking_status ||
                          booking.status
                        }
                      />

                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDateTime(
                          booking.created_at ||
                            booking.booking_date
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Panel>


      {/* ====================================================
          Footer info
      ==================================================== */}

      <div
        className="
          flex flex-col
          gap-2
          rounded-2xl
          border
          border-blue-100
          bg-blue-50/60
          px-4 py-3
          text-xs
          text-blue-700
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0" />

          <span>
            Dashboard သည်
            background polling
            မလုပ်ပါ။ Update
            လိုအပ်သောအခါ Refresh
            ကိုနှိပ်ပါ။
          </span>
        </div>

        <span className="font-semibold">
          {failedSources.length === 0
            ? '● All available data sources connected'
            : `● ${failedSources.length} source(s) unavailable`}
        </span>
      </div>
    </div>
  );
};


export default Dashboard;