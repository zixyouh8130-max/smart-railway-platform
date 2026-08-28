import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export const requestLocationPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const fineLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Train location permission',
          message:
            'The railway app needs your current location while a journey is active so it can update the train position and detect station arrival/departure.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );

      return fineLocation === PermissionsAndroid.RESULTS.GRANTED;
    }

    if (Platform.OS === 'ios') {
      const authorization = await Geolocation.requestAuthorization('whenInUse');
      return authorization === 'granted';
    }

    return true;
  } catch (error) {
    console.error('Location permission request failed:', error);
    return false;
  }
};
