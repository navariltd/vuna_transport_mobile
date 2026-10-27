import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { callMobileMethod } from '../auth/session';
import { getOnboardingRecord } from '../storage/onboarding';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registeredToken: string | null = null;

export async function registerPushNotifications() {
  if (!Device.isDevice || Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('transport', {
      name: 'Transport updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#111111',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  if (!token || token === registeredToken) return true;

  const record = await getOnboardingRecord();
  if (!record) return false;
  await callMobileMethod(
    'vuna_transport.api.register_mobile_device_push_token',
    {
      installation_id: record.installationId,
      device_identifier: record.deviceIdentifier,
      provider: 'expo',
      push_token: token,
    },
    'Could not register push notifications.',
  );
  registeredToken = token;
  return true;
}
