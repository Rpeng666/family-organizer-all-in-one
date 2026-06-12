'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import WaveSurfer from 'wavesurfer.js';
import {
    Loader2,
    Pause,
    Play,
    Video,
} from 'lucide-react';
import type { AppAttachment } from '@family-organizer/shared-core';
import {
    getAttachmentKind,
    getProtectedAttachmentPath,
    isAudioAttachment,
    isImageAttachment,
    isPdfAttachment,
    isTextAttachment,
    isVideoAttachment,
    normalizeAttachment,
} from '@family-organizer/shared-core';
import { PDFPreview } from '@/components/PDFPreview';
import { cn } from '@/lib/utils';

import 'yet-another-react-lightbox/styles.css';

type Variant = 'panel' | 'bubble-own' | 'bubble-other' | 'compact';

interface Props {
    attachments?: Array<Partial<AppAttachment> | null | undefined> | null;
    className?: string;
    variant?: Variant;
    emptyState?: React.ReactNode;
}

type NormalizedAttachment = AppAttachment & {
    id: string;
    name: string;
    url: string;
    type: string;
};

function formatDuration(value?: number | null) {
    if (!Number.isFinite(Number(value))) return null;
    const totalSeconds = Math.max(0, Math.round(Number(value)));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value?: number | null) {
    if (!Number.isFinite(Number(value))) return null;
    const amount = Number(value);
    if (amount < 1024) return `${amount} B`;
    if (amount < 1024 * 1024) return `${(amount / 1024).toFixed(1)} KB`;
    return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
}

function toneClasses(variant: Variant) {
    if (variant === 'bubble-own') {
        return {
            card: 'border-sky-200/40 bg-sky-500/20 text-white',
            cardMuted: 'text-sky-100/80',
            tile: 'border-sky-200/30 bg-sky-500/10',
            label: 'text-white',
        };
    }
    if (variant === 'bubble-other') {
        return {
            card: 'border-slate-300 bg-white text-slate-900',
            cardMuted: 'text-slate-500',
            tile: 'border-slate-300 bg-white',
            label: 'text-slate-900',
        };
    }
    if (variant === 'compact') {
        return {
            card: 'border-slate-200 bg-slate-50 text-slate-900',
            cardMuted: 'text-slate-500',
            tile: 'border-slate-200 bg-slate-50',
            label: 'text-slate-900',
        };
    }
    return {
        card: 'border-slate-200 bg-white text-slate-900',
        cardMuted: 'text-slate-500',
        tile: 'border-slate-200 bg-white',
        label: 'text-slate-900',
    };
}

function StaticWaveform({ peaks }: { peaks?: number[] | null }) {
    const bars = Array.isArray(peaks) && peaks.length > 0 ? peaks.slice(0, 32) : Array.from({ length: 24 }, (_, index) => 0.2 + ((index % 5) * 0.13));

    return (
        <div className="flex h-10 items-end gap-[2px]">
            {bars.map((value, index) => (
                <span
                    key={`${index}-${value}`}
                    className="w-[3px] rounded-full bg-current/70"
                    style={{ height: `${Math.max(18, Math.round(value * 100))}%` }}
                />
            ))}
        </div>
    );
}

function AttachmentAudioPlayer({
    attachment,
    isActive,
    onActivate,
    variant,
}: {
    attachment: NormalizedAttachment;
    isActive: boolean;
    onActivate: () => void;
    variant: Variant;
}) {
    const waveformRef = useRef<HTMLDivElement | null>(null);
    const waveSurferRef = useRef<WaveSurfer | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState<number | null>(attachment.durationSec ?? null);
    const tone = toneClasses(variant);
    const src = getProtectedAttachmentPath(attachment.url);

    useEffect(() => {
        if (!isActive || !waveformRef.current) return;

        const waveSurfer = WaveSurfer.create({
            container: waveformRef.current,
            height: 52,
            waveColor: variant === 'bubble-own' ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.18)',
            progressColor: variant === 'bubble-own' ? 'rgba(255,255,255,0.95)' : '#0f172a',
            cursorColor: variant === 'bubble-own' ? '#ffffff' : '#0f172a',
            barWidth: 3,
            barGap: 2,
            barRadius: 999,
            normalize: true,
            hideScrollbar: true,
        });

        waveSurferRef.current = waveSurfer;
        waveSurfer.on('ready', () => {
            setIsReady(true);
            const nextDuration = waveSurfer.getDuration();
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
                setDuration(nextDuration);
            }
            void waveSurfer.play();
        });
        waveSurfer.on('play', () => setIsPlaying(true));
        waveSurfer.on('pause', () => setIsPlaying(false));
        waveSurfer.on('finish', () => setIsPlaying(false));
        waveSurfer.load(src);

        return () => {
            waveSurfer.destroy();
            waveSurferRef.current = null;
            setIsReady(false);
            setIsPlaying(false);
        };
    }, [isActive, src, variant]);

    return (
        <div className={cn('rounded-2xl border p-3', tone.card)}>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => {
                        if (!isActive) {
                            onActivate();
                            return;
                        }
                        if (waveSurferRef.current) {
                            void waveSurferRef.current.playPause();
                        }
                    }}
                    className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors',
                        variant === 'bubble-own'
                            ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                            : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                    )}
                    aria-label={isPlaying ? 'Pause audio attachment' : 'Play audio attachment'}
                >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm font-semibold', tone.label)}>{attachment.name}</div>
                    <div className={cn('mt-1 text-xs', tone.cardMuted)}>
                        {formatDuration(duration) || 'Audio'}
                        {formatBytes(attachment.sizeBytes) ? ` • ${formatBytes(attachment.sizeBytes)}` : ''}
                    </div>
                </div>
                <a
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        variant === 'bubble-own'
                            ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    )}
                >
                    Open
                </a>
            </div>

            <div className="mt-3 rounded-xl border border-current/10 bg-black/5 px-3 py-2">
                {isActive ? (
                    <div className="min-h-[52px]">
                        {!isReady ? (
                            <div className={cn('flex min-h-[52px] items-center justify-center gap-2 text-xs', tone.cardMuted)}>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading waveform…
                            </div>
                        ) : null}
                        <div ref={waveformRef} className={cn(!isReady && 'opacity-0')} />
                    </div>
                ) : (
                    <div className={cn('overflow-hidden', tone.cardMuted)}>
                        <StaticWaveform peaks={attachment.waveformPeaks} />
                    </div>
                )}
            </div>
        </div>
    );
}

function AttachmentPreviewDialog({
    attachment,
    onClose,
}: {
    attachment: NormalizedAttachment | null;
    onClose: () => void;
}) {
    const [textContent, setTextContent] = useState<string>('');
    const [loadingText, setLoadingText] = useState(false);

    useEffect(() => {
        if (!attachment || !isTextAttachment(attachment)) {
            setTextContent('');
            setLoadingText(false);
            return;
        }

        let cancelled = false;
        setLoadingText(true);
        fetch(getProtectedAttachmentPath(attachment.url))
            .then((response) => response.text())
            .then((value) => {
                if (!cancelled) {
                    setTextContent(value);
                }
            })
            .catch((error) => {
                console.error('Unable to load text attachment', error);
                if (!cancelled) {
                    setTextContent('Unable to load file preview.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingText(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [attachment]);

    if (!attachment) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close attachment preview" onClick={onClose} />
            <div className="relative flex max-h-[88vh] w-[92vw] max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
                    <h2 className="truncate pr-4 text-lg font-semibold text-slate-900">{attachment.name || 'Attachment'}</h2>
                    <div className="flex items-center gap-2">
                        {attachment?.url ? (
                            <a
                                href={getProtectedAttachmentPath(attachment.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Download File
                            </a>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                            Close
                        </button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
                    {isPdfAttachment(attachment) ? (
                        <div className="h-[70vh]">
                            <PDFPreview url={getProtectedAttachmentPath(attachment.url)} />
                        </div>
                    ) : isTextAttachment(attachment) ? (
                        <div className="flex justify-center p-6">
                            {loadingText ? (
                                <div className="mt-12 flex items-center gap-2 text-sm text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Loading text preview…
                                </div>
                            ) : (
                                <pre className="w-full max-w-4xl overflow-x-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-800 shadow-sm">
                                    {textContent}
                                </pre>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-10 text-center">
                            <div className="rounded-full border border-slate-200 bg-white p-5 shadow-sm">
                                <span className="text-sm font-black">FILE</span>
                            </div>
                            <div>
                                <div className="text-base font-semibold text-slate-900">{attachment.name}</div>
                                <div className="mt-1 text-sm text-slate-500">Preview not available for this file type</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ImageAttachmentGrid({
    attachments,
    onOpen,
    variant,
}: {
    attachments: NormalizedAttachment[];
    onOpen: (index: number) => void;
    variant: Variant;
}) {
    const tone = toneClasses(variant);
    const single = attachments.length === 1;

    return (
        <div
            className={cn(
                'grid gap-2',
                single ? 'grid-cols-1' : 'grid-cols-2',
                attachments.length >= 3 && 'auto-rows-[140px]'
            )}
        >
            {attachments.map((attachment, index) => (
                <button
                    key={attachment.id}
                    type="button"
                    onClick={() => onOpen(index)}
                    title={attachment.name}
                    className={cn(
                        'group relative overflow-hidden rounded-2xl border transition-all hover:scale-[1.01]',
                        tone.tile,
                        single ? 'min-h-[240px]' : 'min-h-[140px]'
                    )}
                >
                    <img
                        src={getProtectedAttachmentPath(attachment.url)}
                        alt={attachment.name}
                        className={cn(
                            'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                            single ? 'max-h-[420px]' : ''
                        )}
                        loading="lazy"
                    />
                </button>
            ))}
        </div>
    );
}

function VideoAttachmentCard({
    attachment,
    isActive,
    onActivate,
    variant,
}: {
    attachment: NormalizedAttachment;
    isActive: boolean;
    onActivate: () => void;
    variant: Variant;
}) {
    const tone = toneClasses(variant);
    const poster = attachment.thumbnailUrl ? getProtectedAttachmentPath(attachment.thumbnailUrl) : '';
    const src = getProtectedAttachmentPath(attachment.url);

    if (isActive) {
        return (
            <div className={cn('overflow-hidden rounded-2xl border', tone.tile)}>
                <video
                    className="aspect-video w-full bg-black"
                    src={src}
                    poster={poster}
                    controls
                    autoPlay
                    playsInline
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onActivate}
            className={cn('group relative overflow-hidden rounded-2xl border text-left', tone.tile)}
        >
            <div className="relative aspect-video w-full overflow-hidden">
                {poster ? (
                    <img src={poster} alt={attachment.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                    <div className="h-full w-full bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/88 text-slate-900 shadow-lg">
                        <Play className="h-7 w-7 translate-x-0.5" />
                    </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-white">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{attachment.name}</div>
                        <div className="mt-1 text-xs text-white/80">{formatBytes(attachment.sizeBytes) || 'Video'}</div>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                        <Video className="h-3.5 w-3.5" />
                        {formatDuration(attachment.durationSec) || 'Play'}
                    </div>
                </div>
            </div>
        </button>
    );
}

function DocumentAttachmentCard({
    attachment,
    onOpen,
    variant,
}: {
    attachment: NormalizedAttachment;
    onOpen: () => void;
    variant: Variant;
}) {
    const tone = toneClasses(variant);
    const [previewText, setPreviewText] = useState<string>('');

    useEffect(() => {
        if (!isTextAttachment(attachment)) {
            setPreviewText('');
            return;
        }

        let cancelled = false;
        fetch(getProtectedAttachmentPath(attachment.url))
            .then((response) => response.text())
            .then((value) => {
                if (!cancelled) {
                    setPreviewText(value.slice(0, 150));
                }
            })
            .catch((error) => {
                console.error('Unable to load text preview snippet', error);
            });

        return () => {
            cancelled = true;
        };
    }, [attachment]);

    return (
        <button
            type="button"
            onClick={onOpen}
            title={attachment.name}
            className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-black/[0.03]', tone.card)}
        >
            <div className="rounded-2xl border border-current/10 bg-black/[0.03] p-3">
                <span className="text-sm font-black">FILE</span>
            </div>
            <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-semibold', tone.label)}>{attachment.name}</div>
                <div className={cn('mt-1 text-xs', tone.cardMuted)}>
                    {getAttachmentKind(attachment).toUpperCase()}
                    {formatBytes(attachment.sizeBytes) ? ` • ${formatBytes(attachment.sizeBytes)}` : ''}
                </div>
                {previewText ? <div className={cn('mt-2 line-clamp-2 whitespace-pre-wrap text-[11px]', tone.cardMuted)}>{previewText}</div> : null}
            </div>
            <span
                className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    variant === 'bubble-own'
                        ? 'border-white/25 bg-white/10 text-white'
                        : 'border-slate-300 bg-white text-slate-700'
                )}
            >
                Open
            </span>
        </button>
    );
}

export function AttachmentCollection({
    attachments,
    className,
    variant = 'panel',
    emptyState = null,
}: Props) {
    const normalizedAttachments = useMemo<NormalizedAttachment[]>(
        () =>
            (attachments || [])
                .filter((attachment): attachment is Partial<AppAttachment> => Boolean(attachment?.url && attachment?.id))
                .map((attachment) => {
                    const normalized = normalizeAttachment(attachment as AppAttachment);
                    return {
                        ...normalized,
                        id: normalized.id,
                        name: String(normalized.name || 'Attachment'),
                        url: String(normalized.url || ''),
                        type: String(normalized.type || 'application/octet-stream'),
                    };
                }),
        [attachments]
    );
    const [activeInlineAttachmentId, setActiveInlineAttachmentId] = useState<string | null>(null);
    const [previewAttachment, setPreviewAttachment] = useState<NormalizedAttachment | null>(null);
    const [imageLightboxIndex, setImageLightboxIndex] = useState(-1);

    const imageAttachments = normalizedAttachments.filter((attachment) => isImageAttachment(attachment));
    const otherAttachments = normalizedAttachments.filter((attachment) => !isImageAttachment(attachment));
    const imageSlides = imageAttachments.map((attachment) => ({
        src: getProtectedAttachmentPath(attachment.url),
        alt: attachment.name,
    }));

    useEffect(() => {
        if (activeInlineAttachmentId && !normalizedAttachments.some((attachment) => attachment.id === activeInlineAttachmentId)) {
            setActiveInlineAttachmentId(null);
        }
    }, [activeInlineAttachmentId, normalizedAttachments]);

    if (normalizedAttachments.length === 0) {
        return emptyState ? <>{emptyState}</> : null;
    }

    return (
        <>
            <div className={cn('space-y-2', className)}>
                {imageAttachments.length > 0 ? (
                    <ImageAttachmentGrid attachments={imageAttachments} onOpen={(index) => setImageLightboxIndex(index)} variant={variant} />
                ) : null}

                {otherAttachments.length > 0 ? (
                    <div className="space-y-2">
                        {otherAttachments.map((attachment) => {
                            if (isVideoAttachment(attachment)) {
                                return (
                                    <VideoAttachmentCard
                                        key={attachment.id}
                                        attachment={attachment}
                                        isActive={activeInlineAttachmentId === attachment.id}
                                        onActivate={() => setActiveInlineAttachmentId((current) => (current === attachment.id ? null : attachment.id))}
                                        variant={variant}
                                    />
                                );
                            }

                            if (isAudioAttachment(attachment)) {
                                return (
                                    <AttachmentAudioPlayer
                                        key={attachment.id}
                                        attachment={attachment}
                                        isActive={activeInlineAttachmentId === attachment.id}
                                        onActivate={() => setActiveInlineAttachmentId((current) => (current === attachment.id ? null : attachment.id))}
                                        variant={variant}
                                    />
                                );
                            }

                            return (
                                <DocumentAttachmentCard
                                    key={attachment.id}
                                    attachment={attachment}
                                    onOpen={() => setPreviewAttachment(attachment)}
                                    variant={variant}
                                />
                            );
                        })}
                    </div>
                ) : null}
            </div>

            <Lightbox
                open={imageLightboxIndex >= 0}
                close={() => setImageLightboxIndex(-1)}
                slides={imageSlides}
                index={imageLightboxIndex}
                plugins={[Zoom]}
                carousel={{ finite: imageSlides.length <= 1 }}
                controller={{ closeOnBackdropClick: true }}
                render={{
                    buttonPrev: imageSlides.length <= 1 ? () => null : undefined,
                    buttonNext: imageSlides.length <= 1 ? () => null : undefined,
                    slideHeader: ({ slide }) =>
                        slide.alt ? (
                            <div className="absolute left-0 right-0 top-0 z-[1] flex justify-center p-4">
                                <h2 className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">{slide.alt}</h2>
                            </div>
                        ) : null,
                }}
            />

            <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
        </>
    );
}
