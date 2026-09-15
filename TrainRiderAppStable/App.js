import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import StaffLoginScreen from './screens/StaffLoginScreen';
import TrainRiderHomeScreen from './screens/TrainRiderHomeScreen';
import LiveTrackingScreen from './screens/LiveTrackingScreen';
import TrackEngineerHomeScreen from './screens/TrackEngineerHomeScreen';
import TrackIssueDetailScreen from './screens/TrackIssueDetailScreen';
import { colors } from './theme/mobileTheme';

const Stack = createStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primaryStrong,
  },
};

export default function App() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator initialRouteName="StaffLogin" screenOptions={{ cardStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="StaffLogin" component={StaffLoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TrainRiderHome" component={TrainRiderHomeScreen} options={{ title: 'Train Rider', headerShown: false }} />
          <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TrackEngineerHome" component={TrackEngineerHomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TrackIssueDetail" component={TrackIssueDetailScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
