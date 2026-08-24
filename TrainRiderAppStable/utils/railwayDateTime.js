// utils/railwayDateTime.js
//
// The railway backend currently stores operational timestamps as
// Asia/Yangon local wall-clock values. Some endpoints return a naive ISO
// string, while a few tracking responses append "Z" even though the value
// is still Yangon-local. Do not pass these values through UTC conversion,
// otherwise the mobile UI can shift them by +6:30.

export const formatRailwayTime = (value) => {
  if (!value) return null;

  const text = String(value).trim();

  // Supports both "HH:mm" and ISO-like "YYYY-MM-DDTHH:mm:ss[Z]" values.
  const match = text.match(/(?:^|T|\s)(\d{2}):(\d{2})/);

  if (!match) return text;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return text;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
};
