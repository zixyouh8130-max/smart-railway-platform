import {
  PermissionsAndroid,
  Platform,
} from 'react-native';

export const requestLocationPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const fineGranted =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;

    const coarseGranted =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;

    console.log('Fine location:', fineGranted);
    console.log('Coarse location:', coarseGranted);

    // For railway live tracking, require precise GPS.
    return fineGranted;
  } catch (error) {
    console.error('Location permission error:', error);
    return false;
  }
};