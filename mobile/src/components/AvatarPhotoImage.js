import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { usePhotoUri } from '../hooks/usePhotoUri';
import { getPhotoKey, getPhotoKeys } from '../lib/photo-urls';

function getContentFit(resizeMode) {
  if (resizeMode === 'contain') return 'contain';
  if (resizeMode === 'stretch') return 'fill';
  return 'cover';
}

export function AvatarPhotoImage({
  photoUrls,
  preferredSize = '320',
  style,
  fallback = null,
  testID,
  resizeMode = 'cover',
}) {
  const fileKey = getPhotoKey(photoUrls, preferredSize);
  const uri = usePhotoUri(fileKey, getPhotoKeys(photoUrls));

  if (!uri) return fallback;

  return (
    <ExpoImage
      testID={testID}
      source={{ uri, cacheKey: fileKey || undefined }}
      style={style}
      contentFit={getContentFit(resizeMode)}
      cachePolicy="disk"
      recyclingKey={fileKey || null}
      transition={120}
    />
  );
}
