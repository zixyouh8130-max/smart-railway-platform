const MYANMAR_OFFSET_MINUTES = 6 * 60 + 30;
const MYANMAR_TIME_ZONE = 'Asia/Yangon';

const parseRailwayParts = (value) => {
  if (!value) return null;

  let clean = String(value).trim();

  // Current railway runtime endpoints sometimes append Z to values that are
  // already Myanmar-local naive datetimes. Treat those as local railway time.
  if (clean.endsWith('Z')) {
    clean = clean.slice(0, -1);
  }

  const match = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
  };
};

export const railwayDateTimeToInstant = (value) => {
  if (!value) return null;

  const raw = String(value).trim();

  // If the backend later returns an explicit offset, honor it directly.
  if (/[+-]\d{2}:\d{2}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parts = parseRailwayParts(raw);
  if (!parts) return null;

  const utcMillis =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) -
    MYANMAR_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcMillis);
};

export const formatRailwayTime = (
  value,
  locale = 'en-US',
  options = {}
) => {
  if (!value) return '--:--';

  const plainTime = String(value).match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/
  );

  let date;

  if (plainTime) {
    const hour = Number(plainTime[1]);
    const minute = Number(plainTime[2]);

    date = new Date(
      Date.UTC(2000, 0, 1, hour, minute) -
      MYANMAR_OFFSET_MINUTES * 60 * 1000
    );
  } else {
    date = railwayDateTimeToInstant(value);
  }

  if (!date) return String(value);

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MYANMAR_TIME_ZONE,
    ...options,
  });
};

export const formatRailwayDate = (
  value,
  locale = 'en-GB',
  options = {}
) => {
  if (!value) return '';

  const date = railwayDateTimeToInstant(value);
  if (!date) return String(value);

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: MYANMAR_TIME_ZONE,
    ...options,
  });
};

export const getRailwayTodayISO = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MYANMAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${map.year}-${map.month}-${map.day}`;
};

export const addMonthsToISODate = (isoDate, months) => {
  const match = String(isoDate).match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return isoDate;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );

  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};
