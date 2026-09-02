import { useEffect, useState } from 'react';

import adminDashboardApi from '@/api/adminDashboard';

export const useLiveTrainsCount = () => {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchCount = async () => {
      try {
        const payload = await adminDashboardApi.getActiveTrains();
        if (mounted) setCount(Number(payload?.active_count ?? payload?.trains?.length ?? 0));
      } catch (error) {
        console.error('Failed to fetch live trains count:', error);
        if (mounted) setCount('--');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCount();
    const interval = window.setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return { count, loading };
};

export default useLiveTrainsCount;
