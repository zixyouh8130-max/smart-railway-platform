import adminDashboardApi from '@/api/adminDashboard';

const STATION_CACHE_MS = 5 * 60 * 1000;
let stationCache = null;
let stationCacheAt = 0;

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const sameId = (left, right) => (
  left != null && right != null && Number(left) === Number(right)
);

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const statusValue = (value) => {
  const raw = String(value?.value ?? value ?? 'SCHEDULED').toUpperCase();
  return raw.includes('.') ? raw.split('.').pop() : raw;
};

const addMinutes = (isoValue, minutes) => {
  if (!isoValue) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  return date.toISOString();
};

const getAllStationsCached = async () => {
  const now = Date.now();
  if (stationCache && now - stationCacheAt < STATION_CACHE_MS) {
    return stationCache;
  }

  const payload = await adminDashboardApi.getAllStations();
  stationCache = payload;
  stationCacheAt = now;
  return payload;
};

const findStationRecord = (stop, allStations) => {
  const stations = allStations?.stations || [];

  if (stop?.station_id != null) {
    const byId = stations.find((station) => sameId(station.id, stop.station_id));
    if (byId) return byId;
  }

  const code = normalize(stop?.station_code);
  if (code) {
    const byCode = stations.find((station) => normalize(station.code) === code);
    if (byCode) return byCode;
  }

  const name = normalize(stop?.station_name);
  if (name) {
    return stations.find((station) => normalize(station.name) === name) || null;
  }

  return null;
};

const overlayStationCoordinates = (ticketStops, allStations) => (
  (ticketStops || []).map((stop) => {
    const station = findStationRecord(stop, allStations);
    const latitude = numberOrNull(station?.latitude ?? stop?.latitude);
    const longitude = numberOrNull(station?.longitude ?? stop?.longitude);

    return {
      ...stop,
      latitude,
      longitude,
      coordinate_source: station && latitude != null && longitude != null
        ? 'all-stations'
        : stop?.coordinate_source,
    };
  })
);

const findActiveRun = (ticket, activePayload) => {
  const trains = activePayload?.trains || [];

  // Exact dated run is authoritative.
  const exact = trains.find((row) => sameId(row.schedule_id, ticket?.schedule_id));
  if (exact) return exact;

  // Defensive fallback for older data where schedule_id is absent in the UI
  // response. Only use this when the train identity is unambiguous.
  const trainMatches = trains.filter((row) => (
    sameId(row.train_id, ticket?.train_id)
    || normalize(row.train_no) === normalize(ticket?.train_no)
  ));

  return trainMatches.length === 1 ? trainMatches[0] : null;
};

const overlayRuntimeStops = (ticketStops, activeRun, allStations) => {
  const runtimeStops = [...(activeRun?.stations || [])]
    .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0));

  return overlayStationCoordinates(ticketStops, allStations).map((stop) => {
    const runtime = runtimeStops.find(
      (row) => sameId(row.route_station_id, stop.route_station_id),
    );

    if (!runtime) return stop;

    return {
      ...stop,
      status: statusValue(runtime.status),
      actual_arrival: runtime.arrival_time ?? stop.actual_arrival ?? null,
      actual_departure: runtime.departure_time ?? stop.actual_departure ?? null,
      expected_arrival: runtime.expected_arrival ?? stop.expected_arrival ?? null,
      expected_departure: runtime.expected_departure ?? stop.expected_departure ?? null,
      arrival_delay_minutes: Number(
        runtime.delay_minutes ?? stop.arrival_delay_minutes ?? 0,
      ),
    };
  });
};

const deriveRuntimePosition = (activeRun, mergedStops) => {
  const runtimeStops = [...(activeRun?.stations || [])]
    .map((row) => ({ ...row, status: statusValue(row.status) }))
    .sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0));

  if (!runtimeStops.length) {
    return { lastReached: null, currentStation: null, nextStation: null };
  }

  // ARRIVED means the train is physically stopped there. Previous stations
  // should have been transitioned to DEPARTED by the tracking workflow.
  const currentRuntime = [...runtimeStops]
    .reverse()
    .find((row) => row.status === 'ARRIVED') || null;

  const departedRuntime = [...runtimeStops]
    .reverse()
    .find((row) => row.status === 'DEPARTED') || null;

  const anchor = currentRuntime || departedRuntime;
  let nextRuntime = null;

  if (anchor) {
    const anchorIndex = runtimeStops.findIndex(
      (row) => sameId(row.route_station_id, anchor.route_station_id),
    );
    nextRuntime = runtimeStops
      .slice(anchorIndex + 1)
      .find((row) => row.status !== 'DEPARTED') || null;
  } else if (statusValue(activeRun?.status) === 'ACTIVE') {
    nextRuntime = runtimeStops[0] || null;
  }

  const mergedById = new Map(
    (mergedStops || []).map((stop) => [Number(stop.route_station_id), stop]),
  );

  const payloadFor = (row) => {
    if (!row) return null;
    const stop = mergedById.get(Number(row.route_station_id)) || {};
    return {
      ...stop,
      route_station_id: row.route_station_id,
      station_name: row.station_name ?? stop.station_name,
      station_code: row.station_code ?? stop.station_code,
      order_number: row.order_number ?? stop.order_number,
      status: statusValue(row.status),
      arrival_time: row.arrival_time ?? stop.actual_arrival ?? null,
      departure_time: row.departure_time ?? stop.actual_departure ?? null,
      expected_arrival: row.expected_arrival ?? stop.expected_arrival ?? null,
      expected_departure: row.expected_departure ?? stop.expected_departure ?? null,
      arrival_delay_minutes: Number(
        row.delay_minutes ?? stop.arrival_delay_minutes ?? 0,
      ),
    };
  };

  return {
    lastReached: payloadFor(anchor),
    currentStation: payloadFor(currentRuntime),
    nextStation: payloadFor(nextRuntime),
  };
};

const buildTrainLocation = (activeRun, fallback) => {
  const latitude = numberOrNull(activeRun?.device?.latitude);
  const longitude = numberOrNull(activeRun?.device?.longitude);

  if (latitude == null || longitude == null) return fallback || null;

  return {
    latitude,
    longitude,
    speed_mph: activeRun?.device?.speed ?? fallback?.speed_mph ?? null,
    updated_at: activeRun?.device?.last_update ?? fallback?.updated_at ?? null,
    device_status: 'ACTIVE',
    source: 'active-trains',
  };
};

export const mergeTicketRuntime = (ticket, activePayload, allStations) => {
  if (!ticket) return ticket;

  const activeRun = findActiveRun(ticket, activePayload);
  const mergedStops = overlayRuntimeStops(ticket.stops || [], activeRun, allStations);

  if (!activeRun) {
    // Even before departure, use the proven /all-stations feed to put the
    // passenger boarding station on the map.
    return {
      ...ticket,
      stops: mergedStops,
      runtime_source: 'ticket-only',
    };
  }

  const { lastReached, currentStation, nextStation } = deriveRuntimePosition(
    activeRun,
    mergedStops,
  );

  const liveDelay = Number(
    lastReached?.arrival_delay_minutes
    ?? ticket.live_delay_minutes
    ?? 0,
  );

  let resolvedNext = nextStation;
  if (resolvedNext) {
    const stop = mergedStops.find(
      (row) => sameId(row.route_station_id, resolvedNext.route_station_id),
    );

    resolvedNext = {
      ...resolvedNext,
      estimated_arrival: (
        stop?.expected_arrival_at
          ? addMinutes(stop.expected_arrival_at, liveDelay)
          : ticket.next_station?.route_station_id != null
            && sameId(ticket.next_station.route_station_id, resolvedNext.route_station_id)
            ? ticket.next_station.estimated_arrival
            : null
      ),
    };
  }

  const boardingStop = mergedStops.find((stop) => stop.is_boarding_station) || null;
  const boarding = boardingStop
    ? {
      ...(ticket.boarding || {}),
      ...boardingStop,
      estimated_arrival: (
        boardingStop.actual_arrival
        || !boardingStop.expected_arrival_at
          ? ticket.boarding?.estimated_arrival ?? null
          : addMinutes(boardingStop.expected_arrival_at, liveDelay)
      ),
      is_next: Boolean(
        resolvedNext
        && sameId(resolvedNext.route_station_id, boardingStop.route_station_id)
      ),
      already_departed: boardingStop.status === 'DEPARTED',
    }
    : ticket.boarding;

  let headline = ticket.headline;
  if (currentStation?.station_name) {
    headline = `ရထားသည် ${currentStation.station_name} ဘူတာတွင် ရပ်နားနေပါသည်။`;
  } else if (lastReached?.station_name && resolvedNext?.station_name) {
    headline = `ရထားသည် ${lastReached.station_name} ဘူတာမှ ထွက်ခွာပြီး ${resolvedNext.station_name} ဘူတာသို့ ဦးတည်နေပါသည်။`;
  } else if (resolvedNext?.station_name) {
    headline = `ရထားသည် ${resolvedNext.station_name} ဘူတာသို့ ဦးတည်နေပါသည်။`;
  }

  return {
    ...ticket,
    schedule_status: statusValue(activeRun.status || ticket.schedule_status),
    headline,
    stops: mergedStops,
    last_reached: lastReached || ticket.last_reached,
    current_station: currentStation || null,
    next_station: resolvedNext || ticket.next_station,
    train_location: buildTrainLocation(activeRun, ticket.train_location),
    boarding,
    live_delay_minutes: liveDelay,
    runtime_source: 'active-trains',
  };
};

export const loadTicketRuntime = async (ticket) => {
  if (!ticket) return ticket;

  // The reference TrainMonitoringPage proves this endpoint is the working live
  // source. Keep ticket lookup resilient: if either auxiliary endpoint fails,
  // still return the booking endpoint data instead of failing the passenger.
  const [activeResult, stationResult] = await Promise.allSettled([
    adminDashboardApi.getActiveTrains(),
    getAllStationsCached(),
  ]);

  const activePayload = activeResult.status === 'fulfilled'
    ? activeResult.value
    : null;
  const allStations = stationResult.status === 'fulfilled'
    ? stationResult.value
    : null;

  return mergeTicketRuntime(ticket, activePayload, allStations);
};

export default loadTicketRuntime;
