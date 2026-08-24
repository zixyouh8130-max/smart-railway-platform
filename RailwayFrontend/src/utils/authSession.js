const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const STAFF_KEY = 'staffInfo';

// Legacy keys from the older split admin-session implementation.
const LEGACY_ADMIN_TOKEN_KEY = 'adminToken';
const LEGACY_ADMIN_USER_KEY = 'adminUser';

export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export const isAdminUser = (user) =>
  !!user && ADMIN_ROLES.includes(user.role);

export const isStaffUser = (user) =>
  !!user?.staff;

export const isRegularUser = (user) =>
  !!user && user.role === 'USER' && !user.staff;

export const getDefaultPathForUser = (user) => {
  if (isAdminUser(user)) return '/admin/dashboard';
  if (isStaffUser(user)) return '/train-rider';
  return '/';
};

export const getStoredToken = () =>
  localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const persistSession = ({ access_token, user }) => {
  if (!access_token || !user) {
    throw new Error('Invalid authentication response');
  }

  localStorage.setItem(TOKEN_KEY, access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  if (user.staff) {
    localStorage.setItem(
      STAFF_KEY,
      JSON.stringify(user.staff)
    );
  } else {
    localStorage.removeItem(STAFF_KEY);
  }

  // Remove the old parallel admin session so there is only one source.
  localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ADMIN_USER_KEY);
};

export const persistUser = (user) => {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(STAFF_KEY);
    return;
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user));

  if (user.staff) {
    localStorage.setItem(
      STAFF_KEY,
      JSON.stringify(user.staff)
    );
  } else {
    localStorage.removeItem(STAFF_KEY);
  }
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(STAFF_KEY);

  // Clean stale keys created by the previous frontend.
  localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ADMIN_USER_KEY);
};
