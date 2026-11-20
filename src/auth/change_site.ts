import { clearSessionForSiteChange } from './session';
import { assertSiteWorkSynced } from '../offline/site_work';
import { getOnboardingRecord, markSiteSetupRequired } from '../storage/onboarding';

export async function changeSite(expectedSiteUrl: string) {
  const record = await getOnboardingRecord();
  if (!record || record.siteUrl !== expectedSiteUrl) throw new Error('The connected site changed. Reopen this screen and try again.');
  await clearSessionForSiteChange(expectedSiteUrl,
    () => assertSiteWorkSynced(expectedSiteUrl),
    () => markSiteSetupRequired(expectedSiteUrl));
}
