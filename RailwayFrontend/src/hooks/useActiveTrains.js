import { useCallback, useEffect, useState } from 'react';

import adminDashboardApi from '@/api/adminDashboard';
import { normalizeActiveTrainsPayload } from '@/utils/trainRuntimeView';

export const useActiveTrains = ({ refreshMs = 30000 } = {}) => {
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const payload = await adminDashboardApi.getActiveTrains();
      setTrains(normalizeActiveTrainsPayload(payload));
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.detail || err?.message || 'လက်ရှိပြေးဆွဲနေသော ရထားများကို ရယူ၍ မရပါ။');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!refreshMs) return undefined;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh({ silent: true });
      }
    }, refreshMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh({ silent: true });
      }
    };

    window.addEventListener('online', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh, refreshMs]);

  return {
    trains,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  };
};

export default useActiveTrains;
