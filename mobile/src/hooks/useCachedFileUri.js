import { useEffect, useState } from 'react';
import { ensureCachedFileUri, getCachedFileUri } from '../lib/file-cache';
import { isDirectPhotoUrl } from '../lib/photo-urls';

export function useCachedFileUri(fileKey) {
  const normalizedKey = typeof fileKey === 'string' ? fileKey.trim() : '';
  const [uri, setUri] = useState(() => (isDirectPhotoUrl(normalizedKey) ? normalizedKey : getCachedFileUri(normalizedKey)));

  useEffect(() => {
    if (!normalizedKey) {
      setUri(null);
      return;
    }

    if (isDirectPhotoUrl(normalizedKey)) {
      setUri(normalizedKey);
      return;
    }

    const cachedUri = getCachedFileUri(normalizedKey);
    if (cachedUri) {
      setUri(cachedUri);
      return;
    }

    let cancelled = false;
    ensureCachedFileUri(normalizedKey)
      .then((resolvedUri) => {
        if (!cancelled) {
          setUri(resolvedUri);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUri(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedKey]);

  return uri;
}
