// Public build-time configuration, separate from the driver's ERPNext site.
// A user-entered business site must never redirect the trusted update publisher.
export const appUpdateConfig = {
  enabled: process.env.EXPO_PUBLIC_TRANSPORT_UPDATES_ENABLED !== 'false',
  serverUrl: process.env.EXPO_PUBLIC_TRANSPORT_UPDATE_SERVER_URL ?? 'https://releases.navari.co.ke',
  channel: process.env.EXPO_PUBLIC_TRANSPORT_UPDATE_CHANNEL === 'Preview' ? 'Preview' : 'Production',
} as const;
