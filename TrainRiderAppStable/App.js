import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import StaffLoginScreen from './screens/StaffLoginScreen';
import TrainRiderHomeScreen from './screens/TrainRiderHomeScreen';
import LiveTrackingScreen from './screens/LiveTrackingScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import TrackEngineerHomeScreen from './screens/TrackEngineerHomeScreen';
import TrackIssueDetailScreen from './screens/TrackIssueDetailScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="StaffLogin">
        <Stack.Screen name="StaffLogin" component={StaffLoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TrainRiderHome" component={TrainRiderHomeScreen} options={{ title: 'Train Rider', headerShown: false }} />
        <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TrackEngineerHome" component={TrackEngineerHomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TrackIssueDetail" component={TrackIssueDetailScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}