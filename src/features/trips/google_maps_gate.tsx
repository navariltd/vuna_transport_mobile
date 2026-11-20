import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { nativeMaps } from '@vuna-transport/maps';
import { getSession, subscribeToSessionChange, type MobileSession } from '../../auth/session';
import { colors } from '../../shared/theme';
import { getMobileGoogleMapsKey } from './api';
import { googleSessionIdentity, prepareCustomerGoogle } from './google_maps_runtime';

// Every Google surface, including direct fullscreen URLs, crosses this gate
// before the Google SDK component or NavigationProvider can mount.
export function CustomerGoogleMaps({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [ready, setReady] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let changed = false;
    const unsubscribe = subscribeToSessionChange((value) => { changed = true; if (!disposed) setSession(value); });
    void getSession().then((value) => { if (!disposed && !changed) setSession(value); });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  const identity = googleSessionIdentity(session);
  useEffect(() => {
    let cancelled = false;
    setReady(''); setError('');
    if (!session || session.mapConfig?.provider !== 'google') return;
    if (!nativeMaps) { setError('Install the latest app update to use your company’s Google Maps configuration.'); return; }
    void prepareCustomerGoogle(session, {
      platform: Platform.OS, development: __DEV__, current: getSession,
      load: () => getMobileGoogleMapsKey(Platform.OS),
      configure: (site, key) => nativeMaps!.configure(site, key),
    }).then(() => { if (!cancelled) setReady(identity); })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Google Maps configuration is unavailable.'); });
    return () => { cancelled = true; };
    // Only authentication/provider changes should replace the native surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, attempt]);
  if (identity && ready === identity && session?.mapConfig?.provider === 'google') return <>{children}</>;
  return <View style={{ padding: 16, gap: 12, backgroundColor: colors.surface }}>
    <Text accessibilityRole={error ? 'alert' : undefined} style={{ color: colors.ink }}>{error || 'Loading your company’s Google Maps configuration…'}</Text>
    {error ? <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>Try again</Text></Pressable> : null}
    <Text style={{ color: colors.ink, fontSize: 12 }}>You can return to the stop and record proof without Google Maps.</Text>
  </View>;
}
