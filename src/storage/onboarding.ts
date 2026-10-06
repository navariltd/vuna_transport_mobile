import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const ONBOARDING_KEY = 'vuna_transport_mobile_onboarding';

export type OnboardingRecord = {
  siteUrl: string;
  installationId: string;
  deviceIdentifier: string | null;
  platform: string;
  manufacturer: string | null;
  modelName: string | null;
  osName: string | null;
  osVersion: string | null;
  capturedAt: string;
};

export async function getOnboardingRecord(): Promise<OnboardingRecord | null> {
  if (Platform.OS === 'web') return null;
  const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
  return value ? (JSON.parse(value) as OnboardingRecord) : null;
}

export async function saveOnboardingRecord(siteUrl: string): Promise<OnboardingRecord> {
  const existing = await getOnboardingRecord();
  const deviceIdentifier = Platform.OS === 'android'
    ? Application.getAndroidId()
    : Platform.OS === 'ios'
      ? await Application.getIosIdForVendorAsync()
      : null;
  const record: OnboardingRecord = {
    siteUrl,
    installationId: existing?.installationId ?? Crypto.randomUUID(),
    deviceIdentifier,
    platform: Platform.OS,
    manufacturer: Device.manufacturer ?? null,
    modelName: Device.modelName ?? null,
    osName: Device.osName ?? null,
    osVersion: Device.osVersion ?? null,
    capturedAt: new Date().toISOString(),
  };

  if (Platform.OS !== 'web') await SecureStore.setItemAsync(ONBOARDING_KEY, JSON.stringify(record));
  return record;
}
