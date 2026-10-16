import { isConnectivityFailure } from '../auth/session';
import { getCachedValue, setCachedValue } from './cache';

export type ReadThroughResult<T> = {
  data: T;
  source: 'server' | 'cache';
  cachedAt?: string;
};

export async function readThroughCache<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<ReadThroughResult<T>> {
  try {
    const data = await loader();
    await setCachedValue(namespace, key, data);
    return { data, source: 'server' };
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    const cached = await getCachedValue<T>(namespace, key);
    if (!cached) throw error;
    return { data: cached.value, source: 'cache', cachedAt: cached.updatedAt };
  }
}
