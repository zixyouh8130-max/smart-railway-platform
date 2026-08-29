import axios from 'axios';

import {
  clearSession,
  getStoredRefreshToken,
  getStoredToken,
  persistTokens,
} from '@/utils/authSession';

const ENV_API_URL = import.meta.env.VITE_API_URL;

const API_URL = (
  ENV_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:8000/api'
    : '')
).replace(/\/+$/, '');

if (!API_URL) {
  throw new Error(
    'VITE_API_URL is not configured'
  );
}

if (
  import.meta.env.PROD &&
  !API_URL.startsWith('https://')
) {
  throw new Error(
    'VITE_API_URL must use HTTPS in production'
  );
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 600000,
});

/*
 * Use plain Axios for token refresh.
 *
 * Do NOT use `api.post()` here because that would run through
 * this response interceptor again and could cause an infinite
 * refresh loop.
 */
const refreshClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

let refreshPromise = null;

const shouldSkipRefresh = (url = '') => {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/admin/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh')
  );
};

const redirectAfterAuthenticationFailure = () => {
  const currentPath = window.location.pathname;

  // Public passenger pages stay public.
  if (currentPath.startsWith('/admin')) {
    if (currentPath !== '/admin/login') {
      window.location.assign('/admin/login');
    }

    return;
  }

  if (currentPath.startsWith('/train-rider')) {
    if (currentPath !== '/train-rider/login') {
      window.location.assign(
        '/train-rider/login'
      );
    }
  }
};

const refreshAccessToken = async () => {
  const refreshToken =
    getStoredRefreshToken();

  if (!refreshToken) {
    throw new Error(
      'No refresh token available'
    );
  }

  const response = await refreshClient.post(
    '/auth/refresh',
    {
      refresh_token: refreshToken,
    }
  );

  persistTokens(response.data);

  return response.data.access_token;
};

/*
 * Add access token to every authenticated request.
 */
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers =
        config.headers || {};

      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  },

  (error) => Promise.reject(error)
);

/*
 * Automatically refresh expired access tokens.
 */
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest =
      error.config;

    const status =
      error.response?.status;

    /*
     * Don't try refresh for:
     *
     * - non-401 responses
     * - requests without config
     * - requests already retried
     * - login/register/refresh endpoints
     */
    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      shouldSkipRefresh(
        originalRequest.url
      )
    ) {
      if (
        status === 401 &&
        shouldSkipRefresh(
          originalRequest?.url
        )
      ) {
        // Login failure should not automatically destroy
        // another session here.
      }

      if (import.meta.env.DEV) {
        console.error(
          'API Error:',
          error.response?.data ||
            error.message
        );
      }

      return Promise.reject(error);
    }

    const refreshToken =
      getStoredRefreshToken();

    /*
     * No refresh token means this is either:
     *
     * - an unauthenticated visitor, or
     * - an old/invalid session.
     */
    if (!refreshToken) {
      clearSession();
      redirectAfterAuthenticationFailure();

      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      /*
       * If several API calls return 401 at the same time,
       * only perform ONE refresh request.
       */
      if (!refreshPromise) {
        refreshPromise =
          refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
      }

      const newAccessToken =
        await refreshPromise;

      originalRequest.headers =
        originalRequest.headers || {};

      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      /*
       * Retry the original request using the
       * newly-issued access token.
       */
      return api(originalRequest);
    } catch (refreshError) {
      clearSession();

      redirectAfterAuthenticationFailure();

      if (import.meta.env.DEV) {
        console.error(
          'Token refresh failed:',
          refreshError.response?.data ||
            refreshError.message
        );
      }

      return Promise.reject(
        refreshError
      );
    }
  }
);

export default api;