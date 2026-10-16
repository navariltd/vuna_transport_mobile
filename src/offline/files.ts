import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const podDirectory = new Directory(Paths.document, 'offline-pod');

export async function persistPODPhoto(sourceUri: string, filename: string) {
  podDirectory.create({ idempotent: true, intermediates: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const destination = new File(podDirectory, `${Crypto.randomUUID()}-${safeName}`);
  await new File(sourceUri).copy(destination, { overwrite: true });
  return destination.uri;
}

export async function readPODPhotoBase64(uri: string) {
  const file = new File(uri);
  if (!file.exists) throw new Error('The saved delivery photo is no longer available. Take the photo again.');
  return file.base64();
}

export function removePODPhoto(uri?: string | null) {
  if (!uri) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
