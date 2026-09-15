import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// Production Cloud Run backend used by the mobile app.
// Keep /api here because all mobile API modules use paths such as /auth/login.
export const PRODUCTION_API_BASE_URL =
  'https://smart-railway-api.onrender.com/api';

// Server mode is the default even in React Native development builds.
// Change this to true only when you intentionally want to use a backend
// running on your development computer.
const USE_LOCAL_BACKEND = false;

// Optional local-development override for a real phone on the same Wi-Fi.
// Example: const LOCAL_API_HOST_OVERRIDE = '192.168.1.25';
const LOCAL_API_HOST_OVERRIDE = '';

const getMetroHost = () => {
  const scriptURL = NativeModules.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match?.[1] || null;
};

const getLocalApiBaseUrl = () => {
  if (LOCAL_API_HOST_OVERRIDE) {
    return `http://${LOCAL_API_HOST_OVERRIDE}:8000/api`;
  }

  const metroHost = getMetroHost();
  if (metroHost && !['localhost', '127.0.0.1'].includes(metroHost)) {
    return `http://${metroHost}:8000/api`;
  }

  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  return `http://${fallbackHost}:8000/api`;
};

export const DEFAULT_API_BASE_URL = USE_LOCAL_BACKEND
  ? getLocalApiBaseUrl()
  : PRODUCTION_API_BASE_URL;

const api = axios.create({
  baseURL: DEFAULT_API_BASE_URL,
  timeout: 45000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Add the stored access token to authenticated requests.
// We intentionally do NOT load an `api_base_url` value from AsyncStorage here.
// Older builds used that key, which could silently redirect a newly installed
// app back to localhost/10.0.2.2 and produce Axios "Network Error" messages.
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (__DEV__) {
    const method = String(config.method || 'get').toUpperCase();
    console.log(`[API] ${method} ${config.baseURL}${config.url}`);
  }

  return config;
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetryGet = error => {
  const config = error?.config || {};
  const method = String(config.method || '').toLowerCase();
  if (method !== 'get') return false;

  // React Native reports DNS/TLS/socket interruptions as a generic Network Error.
  // GET is safe to retry; mutation requests are deliberately NOT retried here
  // because doing so could create duplicate activities/comments on the backend.
  if (!error.response) return true;
  return [502, 503, 504].includes(Number(error.response.status));
};

api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config || {};
    const method = String(config.method || 'request').toUpperCase();
    const target = `${config.baseURL || DEFAULT_API_BASE_URL}${config.url || ''}`;

    if (__DEV__) {
      const code = error.code ? ` (${error.code})` : '';
      if (error.response) {
        console.error(`[API] ${method} ${target} -> HTTP ${error.response.status}${code}`);
      } else {
        console.error(`[API] ${method} ${target} -> ${error.message}${code}`);
      }
    }

    if (shouldRetryGet(error)) {
      const retryCount = Number(config.__networkRetryCount || 0);
      if (retryCount < 2) {
        config.__networkRetryCount = retryCount + 1;
        const delay = retryCount === 0 ? 700 : 1600;
        if (__DEV__) {
          console.log(`[API] GET retry ${config.__networkRetryCount}/2 in ${delay}ms -> ${target}`);
        }
        await wait(delay);
        return api(config);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
