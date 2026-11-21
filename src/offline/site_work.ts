import { getOfflineDatabase } from './database';

export async function assertSiteWorkSynced(siteUrl: string) {
  const database = await getOfflineDatabase();
  const prefix = `${siteUrl}|`;
  // Do not depend on getOfflineScope(): active credentials may already have
  // expired. Check every account on the departing site, not another site's work.
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM offline_outbox
     WHERE substr(scope, 1, length(?)) = ? AND status != 'Completed'`,
    prefix, prefix,
  );
  if (!row || !Number.isFinite(row.count)) throw new Error('Saved work could not be checked. Please try again; the site was not changed.');
  if (row.count > 0) throw new Error('Sync saved work for this site in Sync Center before changing sites. If your session expired, sign in with the original account first. Your saved work has not been deleted.');
}
