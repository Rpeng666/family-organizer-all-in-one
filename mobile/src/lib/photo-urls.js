const SIZE_FALLBACKS = {
  '64': ['64', '320', '1200'],
  '320': ['320', '1200', '64'],
  '1200': ['1200', '320', '64'],
};

function asString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function isDirectPhotoUrl(value) {
  const normalized = asString(value);
  if (!normalized) return false;
  return /^(https?:\/\/|file:\/\/|data:|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(normalized);
}

export function getPhotoKey(photoUrls, preferredSize = '64') {
  if (!photoUrls) return null;

  const values = photoUrls || {};
  const candidates = SIZE_FALLBACKS[preferredSize] || SIZE_FALLBACKS['64'];
  for (const size of candidates) {
    const key = asString(values[size]);
    if (key) return key;
  }

  return null;
}

export function getPhotoKeys(photoUrls) {
  const keys = new Set();

  ['64', '320', '1200'].forEach((size) => {
    const key = asString(photoUrls?.[size]);
    if (key) {
      keys.add(key);
    }
  });

  return Array.from(keys);
}
