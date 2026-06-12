import { useEffect, useMemo } from 'react';
import { prefetchCachedFileUris } from '../lib/file-cache';
import { isDirectPhotoUrl } from '../lib/photo-urls';
import { useCachedFileUri } from './useCachedFileUri';
import { usePresignedUrl } from './usePresignedUrl';

export function usePhotoUri(fileKey, siblingKeys = []) {
  const cachedUri = useCachedFileUri(fileKey);
  const remoteUri = usePresignedUrl(fileKey);
  const normalizedPrefetchKeys = useMemo(
    () =>
      Array.from(
        new Set(
          [fileKey, ...(siblingKeys || [])]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value && !isDirectPhotoUrl(value))
        )
      ),
    [fileKey, ...(siblingKeys || [])]
  );

  useEffect(() => {
    if (normalizedPrefetchKeys.length === 0) return;
    void prefetchCachedFileUris(normalizedPrefetchKeys);
  }, [normalizedPrefetchKeys]);

  return cachedUri || remoteUri || null;
}
