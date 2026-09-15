import api from './axios';

let cachedYangonPyayRailway = null;
let pendingYangonPyayRequest = null;

/**
 * Get Yangon-Pyay railway GeoJSON.
 *
 * The result is cached in memory so opening multiple
 * defects does not repeatedly download the same
 * 1,159 railway coordinates.
 */
const getYangonPyayRailway = async () => {
  if (cachedYangonPyayRailway) {
    return cachedYangonPyayRailway;
  }

  if (pendingYangonPyayRequest) {
    return pendingYangonPyayRequest;
  }

  pendingYangonPyayRequest = api
    .get('/railways/yangon-pyay')
    .then(response => {
      const data = response.data;

      if (
        data?.type !== 'Feature' ||
        data?.geometry?.type !== 'LineString' ||
        !Array.isArray(data?.geometry?.coordinates) ||
        data.geometry.coordinates.length < 2
      ) {
        throw new Error(
          'Invalid Yangon-Pyay railway GeoJSON returned by server.',
        );
      }

      cachedYangonPyayRailway = data;

      if (__DEV__) {
        console.log(
          `[Railway] Yangon-Pyay route loaded: ${data.geometry.coordinates.length} coordinates`,
        );
      }

      return data;
    })
    .catch(error => {
      console.error(
        '[Railway] Unable to load Yangon-Pyay railway:',
        error?.response?.data || error?.message,
      );

      throw error;
    })
    .finally(() => {
      pendingYangonPyayRequest = null;
    });

  return pendingYangonPyayRequest;
};

/**
 * Usually not necessary.
 * Useful if the railway GeoJSON is changed while the app is running.
 */
const clearYangonPyayRailwayCache = () => {
  cachedYangonPyayRailway = null;
  pendingYangonPyayRequest = null;
};

const railwaysApi = {
  getYangonPyayRailway,
  clearYangonPyayRailwayCache,
};

export default railwaysApi;