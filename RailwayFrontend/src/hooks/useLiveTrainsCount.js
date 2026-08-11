// src/hooks/useLiveTrainsCount.js
import { useState, useEffect } from 'react';
import { apiService } from '@/services/api';

export const useLiveTrainsCount = () => {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const activeCount = await apiService.getActiveTrainsCount();
        setCount(activeCount);
      } catch (error) {
        console.error('Failed to fetch live trains count:', error);
        setCount('--');
      } finally {
        setLoading(false);
      }
    };

    fetchCount();

    // Refresh count every 30 seconds
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return { count, loading };
};