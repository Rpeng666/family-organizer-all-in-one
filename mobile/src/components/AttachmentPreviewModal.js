import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getAttachmentKind } from '@family-organizer/shared-core';
import { getPresignedFileUrl } from '../lib/api-client';
import { radii, spacing, withAlpha } from '../theme/tokens';
import { useAppTheme } from '../theme/ThemeProvider';

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(6, 10, 18, 0.88)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: withAlpha(colors.panelElevated, 0.18),
      backgroundColor: colors.panel,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    title: {
      flex: 1,
      color: colors.ink,
      fontWeight: '800',
    },
    close: {
      color: colors.inkMuted,
      fontWeight: '700',
    },
    body: {
      minHeight: 320,
      maxHeight: '78%',
      padding: spacing.md,
      gap: spacing.md,
    },
    centered: {
      minHeight: 280,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    helper: {
      color: colors.inkMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
    image: {
      width: '100%',
      minHeight: 320,
      maxHeight: 520,
      borderRadius: radii.md,
      backgroundColor: withAlpha(colors.ink, 0.06),
    },
    videoFrame: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: '#000',
    },
    audioCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      padding: spacing.md,
      gap: spacing.sm,
    },
    audioTitle: {
      color: colors.ink,
      fontWeight: '700',
    },
    audioMeta: {
      color: colors.inkMuted,
      fontSize: 12,
    },
    audioButton: {
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.accentCalendar,
      backgroundColor: withAlpha(colors.accentCalendar, 0.14),
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    audioButtonText: {
      color: colors.accentCalendar,
      fontWeight: '800',
    },
    footerAction: {
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    footerActionText: {
      color: colors.ink,
      fontWeight: '700',
    },
  });
}

export function AttachmentPreviewModal({ attachment, visible, onClose }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const kind = useMemo(
    () => getAttachmentKind(attachment || {}),
    [attachment]
  );

  const videoSource = visible && kind === 'video' && resolvedUrl ? { uri: resolvedUrl } : null;
  const audioSource = visible && kind === 'audio' && resolvedUrl ? resolvedUrl : null;
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
    player.play();
  });
  const audioPlayer = useAudioPlayer(audioSource);
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  useEffect(() => {
    if (!visible || !attachment?.url) {
      setResolvedUrl('');
      setLoadError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getPresignedFileUrl(attachment.url)
      .then((url) => {
        if (!cancelled) {
          setResolvedUrl(url);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error?.message || 'Unable to open attachment.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, visible]);

  useEffect(() => {
    if (!visible) {
      audioPlayer.pause();
    }
  }, [audioPlayer, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{attachment?.name || 'Attachment'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close attachment preview" onPress={onClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.accentCalendar} />
                <Text style={styles.helper}>Loading attachment…</Text>
              </View>
            ) : loadError ? (
              <View style={styles.centered}>
                <Text style={styles.helper}>{loadError}</Text>
              </View>
            ) : kind === 'image' && resolvedUrl ? (
              <ExpoImage
                source={{ uri: resolvedUrl }}
                placeholder={attachment?.blurhash || undefined}
                contentFit="contain"
                style={styles.image}
              />
            ) : kind === 'video' && resolvedUrl ? (
              <View style={styles.videoFrame}>
                <VideoView
                  player={videoPlayer}
                  allowsFullscreen
                  allowsPictureInPicture
                  contentFit="contain"
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            ) : kind === 'audio' && resolvedUrl ? (
              <View style={styles.audioCard}>
                <Text style={styles.audioTitle}>{attachment?.name || 'Audio attachment'}</Text>
                <Text style={styles.audioMeta}>
                  {Number.isFinite(Number(attachment?.durationSec))
                    ? `${Math.round(Number(attachment.durationSec))} seconds`
                    : 'Audio attachment'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={audioStatus.playing ? 'Pause audio attachment' : 'Play audio attachment'}
                  onPress={() => {
                    if (audioStatus.playing) {
                      audioPlayer.pause();
                    } else {
                      audioPlayer.play();
                    }
                  }}
                  style={styles.audioButton}
                >
                  <Text style={styles.audioButtonText}>{audioStatus.playing ? 'Pause' : 'Play'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.helper}>Preview is not available for this file type.</Text>
              </View>
            )}

            {resolvedUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open attachment in system viewer"
                onPress={() => {
                  void Linking.openURL(resolvedUrl);
                }}
                style={styles.footerAction}
              >
                <Text style={styles.footerActionText}>Open original</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
