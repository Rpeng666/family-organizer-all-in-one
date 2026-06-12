import { Directory, File, Paths } from 'expo-file-system';
import { getMobileFileContentUrl } from './api-client';
import { getDeviceSessionToken } from './device-session-store';

const FILE_CACHE_DIRECTORY = new Directory(Paths.cache, 'family-organizer-files');
const inflightDownloads = new Map();

function ensureCacheDirectory() {
  FILE_CACHE_DIRECTORY.create({
    idempotent: true,
    intermediates: true,
  });
}

function extractExtension(fileKey) {
  const match = /\.([a-z0-9]{1,10})$/i.exec(String(fileKey || ''));
  return match ? `.${match[1].toLowerCase()}` : '';
}

function hashKey(value) {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ charCode, 2654435761);
    h2 = Math.imul(h2 ^ charCode, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function getCachedFileHandle(fileKey) {
  const normalizedKey = String(fileKey || '').trim();
  const extension = extractExtension(normalizedKey);
  const hash = hashKey(normalizedKey);
  return new File(FILE_CACHE_DIRECTORY, `${hash}${extension}`);
}

function getAuthorizationHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function getCachedFileUri(fileKey) {
  const normalizedKey = String(fileKey || '').trim();
  if (!normalizedKey) return null;

  const cachedFile = getCachedFileHandle(normalizedKey);
  return cachedFile.exists ? cachedFile.uri : null;
}

async function downloadFileToCache(fileKey) {
  const token = await getDeviceSessionToken();
  if (!token) {
    throw new Error('Device session missing');
  }

  ensureCacheDirectory();
  const cachedFile = getCachedFileHandle(fileKey);

  try {
    const downloadedFile = await File.downloadFileAsync(
      getMobileFileContentUrl(fileKey),
      cachedFile,
      {
        idempotent: true,
        headers: getAuthorizationHeaders(token),
      }
    );
    return downloadedFile.uri;
  } catch (error) {
    if (cachedFile.exists) {
      try {
        cachedFile.delete();
      } catch {
        // Android can leave partial files behind when a streamed download fails.
      }
    }
    throw error;
  }
}

export async function ensureCachedFileUri(fileKey) {
  const normalizedKey = String(fileKey || '').trim();
  if (!normalizedKey) return null;

  const cachedUri = getCachedFileUri(normalizedKey);
  if (cachedUri) {
    return cachedUri;
  }

  const existingDownload = inflightDownloads.get(normalizedKey);
  if (existingDownload) {
    return existingDownload;
  }

  const downloadPromise = downloadFileToCache(normalizedKey).finally(() => {
    inflightDownloads.delete(normalizedKey);
  });
  inflightDownloads.set(normalizedKey, downloadPromise);
  return downloadPromise;
}

export async function prefetchCachedFileUris(fileKeys) {
  const uniqueKeys = Array.from(
    new Set(
      (fileKeys || [])
        .map((fileKey) => String(fileKey || '').trim())
        .filter(Boolean)
    )
  );

  await Promise.allSettled(uniqueKeys.map((fileKey) => ensureCachedFileUri(fileKey)));
}
