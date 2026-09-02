const statusValue = (value) => String(value || '').trim().toUpperCase();

export const ACTIVE_TRAIN_STATUS_LABELS = {
  ACTIVE: 'ပြေးဆွဲနေသည်',
  ARRIVED: 'ဘူတာတွင် ရပ်နားနေသည်',
  DEPARTED: 'ထွက်ခွာပြီး',
  SCHEDULED: 'မရောက်သေးပါ',
};

const sortedStations = (stations = []) => (
  [...stations].sort((a, b) => Number(a.order_number || 0) - Number(b.order_number || 0))
);

export const deriveActiveTrainRuntime = (train) => {
  const stations = sortedStations(train?.stations || []).map((station) => ({
    ...station,
    status: statusValue(station.status) || 'SCHEDULED',
  }));

  const currentStation = [...stations].reverse().find((station) => station.status === 'ARRIVED') || null;
  const lastDeparted = [...stations].reverse().find((station) => station.status === 'DEPARTED') || null;
  const anchor = currentStation || lastDeparted;

  let nextStation = null;
  if (anchor) {
    const anchorIndex = stations.findIndex(
      (station) => String(station.route_station_id) === String(anchor.route_station_id),
    );
    nextStation = stations.slice(anchorIndex + 1).find(
      (station) => station.status !== 'DEPARTED',
    ) || null;
  } else {
    nextStation = stations[0] || null;
  }

  const completedStations = stations.filter(
    (station) => station.status === 'DEPARTED',
  ).length;
  const calculatedProgress = stations.length
    ? Math.round((completedStations / stations.length) * 100)
    : 0;

  const progressPercent = Number.isFinite(Number(train?.progress_percent))
    ? Math.max(0, Math.min(100, Number(train.progress_percent)))
    : calculatedProgress;

  const delayMinutes = Number(
    currentStation?.delay_minutes
      ?? lastDeparted?.delay_minutes
      ?? 0,
  );

  let headline = 'ခရီးစဉ် စတင်ပြေးဆွဲနေပါသည်။';
  if (currentStation?.station_name) {
    headline = `${currentStation.station_name} ဘူတာတွင် ရပ်နားနေသည်`;
  } else if (lastDeparted?.station_name && nextStation?.station_name) {
    headline = `${lastDeparted.station_name} မှ ${nextStation.station_name} သို့ ဦးတည်နေသည်`;
  } else if (nextStation?.station_name) {
    headline = `${nextStation.station_name} ဘူတာသို့ ဦးတည်နေသည်`;
  }

  return {
    ...train,
    stations,
    currentStation,
    lastDeparted,
    nextStation,
    completedStations,
    totalStations: stations.length,
    progressPercent,
    delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : 0,
    headline,
  };
};

export const normalizeActiveTrainsPayload = (payload) => (
  (payload?.trains || []).map(deriveActiveTrainRuntime)
);

export const stationStatusLabel = (value) => (
  ACTIVE_TRAIN_STATUS_LABELS[statusValue(value)] || value || '--'
);
