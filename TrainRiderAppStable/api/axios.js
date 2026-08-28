import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// Optional development override for a real phone on the same Wi-Fi.
// Example: const API_HOST_OVERRIDE = '192.168.1.25';
// Leave blank to derive the backend host from the Metro development server.
const API_HOST_OVERRIDE = '';

const getMetroHost = () => {
  const scriptURL = NativeModules.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match?.[1] || null;
};

const getDefaultApiBaseUrl = () => {
  if (API_HOST_OVERRIDE) {
    return `http://${API_HOST_OVERRIDE}:8000/api`;
  }

  const metroHost = getMetroHost();
  if (metroHost && !['localhost', '127.0.0.1'].includes(metroHost)) {
    return `http://${metroHost}:8000/api`;
  }

  // Android emulator reaches the development computer through 10.0.2.2.
  // iOS simulator can use the host loopback interface directly.
  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  return `http://${fallbackHost}:8000/api`;
};

export const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();

const api = axios.create({
  baseURL: DEFAULT_API_BASE_URL,
  timeout: 20000,
});

// Add token interceptor. An optional `api_base_url` AsyncStorage value can
// override the default without rebuilding the app (useful for physical phones).
api.interceptors.request.use(async config => {
  const [token, storedBaseUrl] = await Promise.all([
    AsyncStorage.getItem('token'),
    AsyncStorage.getItem('api_base_url'),
  ]);

  if (storedBaseUrl) {
    config.baseURL = storedBaseUrl.replace(/\/$/, '');
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
