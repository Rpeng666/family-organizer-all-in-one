import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { createMobilePresignedUpload, finalizeMobileUploadedAttachment } from './api-client';

function inferAttachmentKind(type, name) {
  const mime = String(type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';

  const lowerName = String(name || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/.test(lowerName)) return 'image';
  if (/\.(mp4|mov|m4v|webm|ogv|mkv)$/.test(lowerName)) return 'video';
  if (/\.(mp3|m4a|aac|wav|ogg|oga|flac)$/.test(lowerName)) return 'audio';
  if (/\.pdf$/.test(lowerName)) return 'pdf';
  if (/\.(txt|md|csv|log|json)$/.test(lowerName)) return 'text';
  return 'file';
}

function createPendingAttachment(input) {
  const kind = input.kind || inferAttachmentKind(input.type, input.name);
  return {
    uri: input.uri,
    name: input.name,
    type: input.type || 'application/octet-stream',
    kind,
    sizeBytes: input.sizeBytes ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSec: input.durationSec ?? null,
    blurhash: input.blurhash ?? null,
    waveformPeaks: input.waveformPeaks ?? null,
  };
}

async function maybeGenerateBlurhash(uri, kind) {
  if (kind !== 'image' || !uri) return null;
  try {
    return await ExpoImage.generateBlurhashAsync(uri, [4, 4]);
  } catch (error) {
    console.error('Unable to generate mobile blurhash', error);
    return null;
  }
}

export async function pickAttachmentDocuments() {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return [];

  return Promise.all(result.assets.map(async (asset) => {
    const kind = inferAttachmentKind(asset.mimeType, asset.name);
    const blurhash = await maybeGenerateBlurhash(asset.uri, kind);
    return createPendingAttachment({
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || 'application/octet-stream',
      kind,
      sizeBytes: asset.size ?? null,
      blurhash,
    });
  }));
}

async function ensureCameraPermission() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required.');
  }
}

export async function captureCameraImage() {
  await ensureCameraPermission();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.length) return [];
  const asset = result.assets[0];
  const blurhash = await maybeGenerateBlurhash(asset.uri, 'image');
  return [
    createPendingAttachment({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
      kind: 'image',
      sizeBytes: asset.fileSize ?? null,
      width: asset.width || null,
      height: asset.height || null,
      blurhash,
    }),
  ];
}

export async function captureCameraVideo() {
  await ensureCameraPermission();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    quality: 0.8,
    videoMaxDuration: 180,
  });

  if (result.canceled || !result.assets?.length) return [];
  const asset = result.assets[0];
  return [
    createPendingAttachment({
      uri: asset.uri,
      name: asset.fileName || `video-${Date.now()}.mov`,
      type: asset.mimeType || 'video/quicktime',
      kind: 'video',
      sizeBytes: asset.fileSize ?? null,
      width: asset.width || null,
      height: asset.height || null,
      durationSec: Number.isFinite(Number(asset.duration)) ? Number(asset.duration) / 1000 : null,
    }),
  ];
}

export async function pickLibraryMedia() {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    mediaTypes: ['images', 'videos'],
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.length) return [];

  return Promise.all(result.assets.map(async (asset) => {
    const kind = asset.type === 'video' ? 'video' : 'image';
    const blurhash = await maybeGenerateBlurhash(asset.uri, kind);
    return createPendingAttachment({
      uri: asset.uri,
      name: asset.fileName || `${kind}-${Date.now()}`,
      type: asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind,
      sizeBytes: asset.fileSize ?? null,
      width: asset.width || null,
      height: asset.height || null,
      durationSec: Number.isFinite(Number(asset.duration)) ? Number(asset.duration) / 1000 : null,
      blurhash,
    });
  }));
}

export async function uploadPendingAttachments(files, createId) {
  const uploaded = [];

  for (const file of files || []) {
    const presigned = await createMobilePresignedUpload({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      scope: 'task-attachment',
    });

    const formData = new FormData();
    Object.entries(presigned.fields || {}).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
    });

    const response = await fetch(presigned.uploadUrl, {
      method: presigned.method || 'POST',
      body: formData,
    });

    if (response.status >= 400) {
      throw new Error(`Upload failed for ${file.name}`);
    }

    const finalized = await finalizeMobileUploadedAttachment({
      objectKey: presigned.objectKey,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      width: file.width ?? null,
      height: file.height ?? null,
      durationSec: file.durationSec ?? null,
      blurhash: file.blurhash ?? null,
      waveformPeaks: file.waveformPeaks ?? null,
    });

    uploaded.push({
      id: createId(),
      ...finalized,
    });
  }

  return uploaded;
}

export function createRecordedAudioAttachment({ uri, durationMillis, name }) {
  return createPendingAttachment({
    uri,
    name: name || `voice-note-${Date.now()}.m4a`,
    type: 'audio/m4a',
    kind: 'audio',
    durationSec: Number.isFinite(Number(durationMillis)) ? Number(durationMillis) / 1000 : null,
  });
}
