export type NavigationDestination = {
  version: 1; trip_name: string; stop_name: string; title: string;
  latitude: number; longitude: number;
};

export function parseNavigationDestination(value: unknown, trip: string, stop: string): NavigationDestination {
  if (!value || typeof value !== 'object') throw new Error('Navigation destination unavailable.');
  const row = value as NavigationDestination;
  if (row.version !== 1 || row.trip_name !== trip || row.stop_name !== stop
      || typeof row.title !== 'string' || !row.title.trim()
      || typeof row.latitude !== 'number' || typeof row.longitude !== 'number'
      || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
      || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180
      || (row.latitude === 0 && row.longitude === 0)) throw new Error('Check the stop’s exact coordinates before navigating.');
  return row;
}

type NavigationSteps = {
  prepare: () => Promise<void>;
  authorize: () => Promise<NavigationDestination>;
  setDestination: (destination: NavigationDestination) => Promise<void>;
  guide: () => Promise<void>;
  cleanup: () => Promise<void>;
};

type GuidanceView = {
  setNavigationUIEnabled: (enabled: boolean) => Promise<void>;
  setFollowingPerspective: (perspective: number) => Promise<void>;
};

type AccessSteps = {
  getPermission: () => Promise<{ granted: boolean }>;
  requestPermission: () => Promise<{ granted: boolean }>;
  termsAccepted: () => Promise<boolean>;
  showTerms: () => Promise<boolean>;
  prompt: <T>(action: () => Promise<T>) => Promise<T>;
  assertActive: () => void;
};

// Even an already-granted Android permission request can launch a temporary
// Activity. Check first; only genuine prompts get the lifecycle exemption.
export async function prepareNavigationAccess(steps: AccessSteps) {
  let permission = await steps.getPermission();
  steps.assertActive();
  if (!permission.granted) permission = await steps.prompt(steps.requestPermission);
  if (!permission.granted) throw new Error('Allow location access to start navigation.');
  steps.assertActive();
  if (!(await steps.termsAccepted())) {
    steps.assertActive();
    if (!(await steps.prompt(steps.showTerms))) throw new Error('Accept Google’s navigation terms to continue.');
  }
  steps.assertActive();
}

export function assertNavigationRoute(status: string) {
  if (status === 'OK') return;
  const messages: Record<string, string> = {
    NO_ROUTE_FOUND: 'Google could not find a driving route. Check the stop’s coordinates and road access.',
    NETWORK_ERROR: 'Google could not load directions. Check the internet connection and try again.',
    QUOTA_CHECK_FAILED: 'Google could not authorize navigation. Ask your administrator to check Navigation SDK billing, quota and API restrictions.',
    ROUTE_CANCELED: 'The route calculation was cancelled. Return to the map and try again.',
    LOCATION_DISABLED: 'Turn on your phone’s location services, then try again.',
    LOCATION_UNKNOWN: 'Google has not acquired your current location. Check GPS reception and try again.',
    WAYPOINT_ERROR: 'Google could not use this destination. Check the stop’s exact coordinates.',
    DUPLICATE_WAYPOINTS_ERROR: 'Google found duplicate destinations. Check the stop’s coordinates.',
    ROUTING_TIMEOUT: 'Google took too long to calculate directions. Check the connection and try again.',
  };
  const message = messages[status];
  throw new Error(message ? `${message} (${status})` : 'Google returned an unrecognized routing status. Ask your administrator to review the Navigation SDK setup.');
}

export async function attachGuidanceView(view: GuidanceView | null, perspective: number) {
  if (!view) throw new Error('Map is not ready. Reopen the map and try again.');
  await view.setNavigationUIEnabled(true);
  await view.setFollowingPerspective(perspective);
}

// One explicit start = at most one destination request. Disposing during any
// await prevents the next step. Cleanup waits for native initialization to end.
export function createNavigationRun(steps: NavigationSteps) {
  let disposed = false;
  let started = false;
  let work: Promise<void> | undefined;
  let cleanup: Promise<void> | undefined;
  const clean = () => cleanup ??= steps.cleanup();
  return {
    get disposed() { return disposed; },
    start() {
      if (started || disposed) return work ?? Promise.resolve();
      started = true;
      work = (async () => {
        try {
          await steps.prepare();
          if (disposed) return;
          const destination = await steps.authorize();
          if (disposed) return;
          await steps.setDestination(destination);
          if (disposed) return;
          await steps.guide();
        } catch (error) {
          disposed = true;
          throw error;
        } finally {
          if (disposed) await clean();
        }
      })();
      return work;
    },
    async dispose() {
      disposed = true;
      try { await work; } catch { /* Reported by start, not by teardown. */ }
      await clean();
    },
  };
}
