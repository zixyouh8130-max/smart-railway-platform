// src/hooks/useStationSearch.js
import { useState, useEffect, useCallback } from 'react';
import stationsApi from '@/api/stations';

export const useStationSearch = () => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchStations = useCallback(async (query) => {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      setLoading(true);
      setError(null);
      const response = await stationsApi.search(query, 10);
      return response.stations || response.data || [];
    } catch (err) {
      setError('Failed to search stations');
      console.error('Station search error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAllStations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await stationsApi.getAll({ limit: 200 });
      const stationList = response.stations || response.data || [];
      setStations(stationList);
      return stationList;
    } catch (err) {
      setError('Failed to load stations');
      console.error('Get stations error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    stations,
    loading,
    error,
    searchStations,
    getAllStations
  };
};