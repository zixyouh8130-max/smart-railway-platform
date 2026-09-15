export const colors = {
  background: '#F6FBFF',
  surface: '#FFFFFF',
  surfaceSoft: '#EFF8FF',
  surfaceBlue: '#E7F4FF',
  primary: '#8FD0FF',
  primaryHover: '#73C3FB',
  primaryStrong: '#3787C8',
  primaryDark: '#1F5F91',
  primaryText: '#123B5B',
  border: '#D8EAF6',
  borderStrong: '#B9DDF2',
  text: '#102A43',
  textSoft: '#486581',
  muted: '#829AB1',
  success: '#2F9E74',
  successSoft: '#E8F8F1',
  warning: '#D88A23',
  warningSoft: '#FFF7E8',
  danger: '#E34D59',
  dangerSoft: '#FFF0F2',
  violet: '#7559B8',
  violetSoft: '#F2EEFF',
  shadow: '#0B3A5B',
  white: '#FFFFFF',
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const shadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
};

export const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radii.lg,
  ...shadow,
};
