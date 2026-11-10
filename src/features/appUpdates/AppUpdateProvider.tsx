import { usePathname } from 'expo-router';
import { AppState } from 'react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getNativeUpdater, type NativeUpdateSnapshot } from '@vuna-transport/updater';
import { appUpdateConfig } from '../../config/updateConfig';
import { useConnectivity } from '../../offline/connectivity';
import { getOfflineOperations } from '../../offline/outbox';
import { checkForAppUpdate, type AvailableAppUpdate } from './appUpdateApi';
import { hasUnsyncedWork, isSafeUpdateScreen } from './updatePolicy';

type Status = 'idle' | 'checking' | 'current' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';
type Updates = {
  release: AvailableAppUpdate | null;
  status: Status;
  error: string | null;
  supported: boolean;
  showPrompt: boolean;
  check: (force?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
};
const Context = createContext<Updates>({ release: null, status: 'idle', error: null, supported: false, showPrompt: false, check: async () => {}, install: async () => {}, dismiss: () => {} });
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function AppUpdateProvider({ children }: PropsWithChildren) {
  const { isOffline } = useConnectivity();
  const pathname = usePathname();
  const safeScreen = isSafeUpdateScreen(pathname);
  const [release, setRelease] = useState<AvailableAppUpdate | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const busy = useRef(false);
  const verifying = useRef(false);
  const native = getNativeUpdater();
  const supported = Boolean(native && appUpdateConfig.enabled);

  const reconcile = useCallback(async () => {
    if (!native || !appUpdateConfig.enabled || AppState.currentState !== 'active') return;
    try {
      const snapshot = await native.getSnapshot();
      setRelease(current => current?.release === snapshot.release?.release ? current : snapshot.release ? { ...snapshot.release, mandatory: false, releaseNotes: '' } : null);
      const states: Record<NativeUpdateSnapshot['status'], Status> = { idle: 'idle', pending: 'downloading', running: 'downloading', successful: 'verifying', failed: 'error', ready: 'ready' };
      setStatus(states[snapshot.status]);
      if (snapshot.status === 'failed') setError(snapshot.error || 'The update download failed. Check again to retry.');
      if (snapshot.status === 'successful' && !verifying.current) {
        verifying.current = true;
        try { await native.verifyDownloadedUpdate(); setError(null); setStatus('ready'); }
        catch (failure) { await native.clearUpdate(); throw failure; }
        finally { verifying.current = false; }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not verify the app update.');
      setStatus('error');
    }
  }, [native]);

  const check = useCallback(async (force = false) => {
    if (!native || !appUpdateConfig.enabled || busy.current) return;
    if (isOffline) { if (force) setError('Connect to the internet to check for app updates.'); return; }
    busy.current = true;
    try {
      const snapshot = await native.getSnapshot();
      if (!force && snapshot.lastCheckAt && Date.now() - snapshot.lastCheckAt < SIX_HOURS) { await reconcile(); return; }
      setError(null); setStatus('checking');
      const installed = await native.getInstalledApplication();
      const available = await checkForAppUpdate({ applicationId: installed.packageName, versionCode: installed.versionCode });
      await native.setLastCheckAt(Date.now());
      if (!available) {
        await native.clearUpdate(); setRelease(null); setStatus('current'); return;
      }
      setRelease(available);
      await native.enqueueDownload({ downloadUrl: available.downloadUrl, fileSize: available.fileSize, release: available.release, sha256: available.sha256, versionCode: available.versionCode, versionName: available.versionName });
      await reconcile();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check for app updates.');
      setStatus('error');
    } finally { busy.current = false; }
  }, [isOffline, native, reconcile]);

  useEffect(() => {
    if (!supported || isOffline) return;
    const timer = setTimeout(() => { void reconcile(); void check(); }, 1200);
    return () => clearTimeout(timer);
  }, [check, isOffline, reconcile, supported]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') { void reconcile(); void check(); } });
    return () => listener.remove();
  }, [check, reconcile]);
  useEffect(() => {
    if (status !== 'downloading' && status !== 'verifying') return;
    const timer = setInterval(() => { void reconcile(); }, 4000);
    return () => clearInterval(timer);
  }, [reconcile, status]);

  const install = useCallback(async () => {
    if (!native || !release || status !== 'ready') return;
    if (!safeScreen) { setError('Return to Home or Profile before installing an update.'); return; }
    try {
      const pending = hasUnsyncedWork(await getOfflineOperations());
      if (pending) { setError('Sync your pending work in Sync Center before installing the update.'); return; }
      setError(null); setStatus('installing');
      if (!(await native.isInstallPermissionGranted())) {
        setError('Allow this app to install updates in Android settings, then tap Install update again.');
        await native.openInstallPermissionSettings();
      } else await native.installVerifiedUpdate();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Android could not open the update installer.'); }
    finally { setStatus('ready'); }
  }, [native, release, safeScreen, status]);

  return <Context.Provider value={{ release, status, error, supported, showPrompt: safeScreen && status === 'ready' && Boolean(release) && dismissed !== release?.release, check, install, dismiss: () => setDismissed(release?.release || null) }}>{children}</Context.Provider>;
}

export function useAppUpdate() { return useContext(Context); }
