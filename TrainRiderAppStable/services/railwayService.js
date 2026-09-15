import apiClient from '../api/client';

let cachedYangonPyayRoute = null;
let pendingRequest = null;

export const getYangonPyayRailway = async () => {
  if (cachedYangonPyayRoute) {
    return cachedYangonPyayRoute;
  }

  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = apiClient
    .get('/api/railways/yangon-pyay')
    .then(response => {
      const data = response.data;

      if (
        data?.type !== 'Feature' ||
        data?.geometry?.type !== 'LineString' ||
        !Array.isArray(data?.geometry?.coordinates) ||
        data.geometry.coordinates.length < 2
      ) {
        throw new Error(
          'Invalid Yangon-Pyay railway GeoJSON.'
        );
      }

      cachedYangonPyayRoute = data;

      return data;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
};

export const clearYangonPyayRailwayCache = () => {
  cachedYangonPyayRoute = null;
  pendingRequest = null;
};