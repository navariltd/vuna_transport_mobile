import type { MobileSession } from '../../auth/session';

export const googleSessionIdentity = (session: MobileSession | null) => session
  ? JSON.stringify([session.siteUrl.replace(/\/+$/, ''), session.user, session.sid, session.mapConfig?.provider]) : '';

type KeyContract = { version: number; platform: string; api_key: string };
type Dependencies = {
  platform: string;
  development: boolean;
  current: () => Promise<MobileSession | null>;
  load: () => Promise<unknown>;
  configure: (site: string, key: string) => Promise<string>;
};

// Keys are transient arguments only: never stored in sessions, SQLite, URLs,
// logs, public Expo configuration or fullscreen map handoffs.
export async function prepareCustomerGoogle(session: MobileSession, dependencies: Dependencies) {
  const { platform, current, load, configure } = dependencies;
  if (!['android', 'ios'].includes(platform)) throw new Error('Google mobile maps are not supported on this platform.');
  if (session.mapConfig?.provider !== 'google') throw new Error('Google maps are not enabled for this site.');
  const site = new URL(session.siteUrl);
  if (site.protocol !== 'https:' && !(dependencies.development && site.protocol === 'http:')) {
    throw new Error('Use an HTTPS site connection to load your company’s Google Maps configuration.');
  }
  const identity = googleSessionIdentity(session);
  const assertCurrent = async () => {
    if (googleSessionIdentity(await current()) !== identity) throw new Error('Your account changed. Reopen the map from your current trip.');
  };
  await assertCurrent();
  const value = await load() as KeyContract | null;
  await assertCurrent();
  if (!value || value.version !== 1 || value.platform !== platform || typeof value.api_key !== 'string'
      || !/^[A-Za-z0-9_-]{20,256}$/.test(value.api_key)) {
    throw new Error('Ask your administrator to configure this site’s mobile Google Maps key.');
  }
  let result: string;
  try { result = await configure(site.origin + site.pathname.replace(/\/+$/, ''), value.api_key); }
  catch { throw new Error('Google Maps could not initialize. Fully close and reopen the app, then try again.'); }
  await assertCurrent();
  if (result === 'restart_required') throw new Error('Your company site or Google Maps key has changed. Fully close the app and reopen it to use this site’s key.');
  if (result !== 'ready') throw new Error('Install the latest app update to use your company’s Google Maps configuration.');
}
