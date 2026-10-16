import { getDriverProfile } from '../auth/session';
import { readThroughCache } from './read_through';

export type MobileDriverProfile = {
  linked: boolean;
  message?: string;
  driver?: {
    name: string;
    full_name: string;
    status: string;
    cell_number?: string;
    license_number?: string;
    expiry_date?: string;
    employee_details?: { company?: string; designation?: string };
  };
};

export function loadDriverProfile(installationId: string, deviceIdentifier?: string | null) {
  return readThroughCache<MobileDriverProfile>('driver-profile', 'current', () =>
    getDriverProfile(installationId, deviceIdentifier),
  );
}
