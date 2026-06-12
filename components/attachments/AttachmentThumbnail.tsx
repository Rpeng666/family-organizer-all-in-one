'use client';

import React, { useState } from 'react';
import { FileText, Film, Mic, Play } from 'lucide-react';
import {
    getAttachmentKind,
    getProtectedAttachmentPath,
    type AppAttachment,
} from '@family-organizer/shared-core';
import { cn } from '@/lib/utils';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThumbnailAttachment {
    id?: string;
    name?: string | null;
    url?: string | null;
    type?: string | null;
    kind?: string | null;
    thumbnailUrl?: string | null;
    durationSec?: number | null;
    waveformPeaks?: number[] | null;
    sizeBytes?: number | null;
}

interface AttachmentThumbnailProps {
    /** A single attachment to render. */
    attachment: ThumbnailAttachment;
    /** Pixel size for the square thumbnail container. Defaults to 48. Ignored when `responsive` is true. */
    size?: number;
    className?: string;
    /**
     * When true, renders at a responsive size — medium on large viewports,
     * scaling down on smaller ones — instead of a fixed pixel size.
     */
    responsive?: boolean;
}

interface AttachmentThumbnailRowProps {
    /** One or more attachments to render as a compact row of thumbnails. */
    attachments: ThumbnailAttachment[];
    /** Pixel size for each thumbnail. Defaults to 48. Ignored when `responsive` is true. */
    size?: number;
    className?: string;
    /** Maximum thumbnails to show before a "+N" overflow. Defaults to 4. */
    maxVisible?: number;
    /**
     * When true, renders thumbnails at a responsive size — medium on large
     * viewports and scaling down on smaller ones — instead of a fixed pixel size.
     */
    responsive?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(value?: number | null) {
    if (!Number.isFinite(Number(value))) return null;
    const totalSeconds = Math.max(0, Math.round(Number(value)));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function MiniWaveform({ peaks, className }: { peaks?: number[] | null; className?: string }) {
    const bars = Array.isArray(peaks) && peaks.length > 0 ? peaks.slice(0, 12) : Array.from({ length: 8 }, (_, i) => 0.2 + (i % 4) * 0.15);
    return (
        <div className={cn('flex h-4 items-end gap-px', className)}>
            {bars.map((value, i) => (
                <span
                    key={`${i}-${value}`}
                    className="w-[2px] rounded-full bg-current"
                    style={{ height: `${Math.max(20, Math.round(value * 100))}%` }}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Single Thumbnail
// ---------------------------------------------------------------------------

/**
 * Renders a single compact thumbnail for any attachment type.
 * Clicking opens the full attachment in a dialog.
 */
export const AttachmentThumbnail: React.FC<AttachmentThumbnailProps> = ({
    attachment,
    size = 48,
    className,
    responsive = false,
}) => {
    const [showFull, setShowFull] = useState(false);
    const kind = getAttachmentKind(attachment);
    const thumbUrl = attachment.thumbnailUrl
        ? getProtectedAttachmentPath(attachment.thumbnailUrl)
        : null;
    const mainUrl = attachment.url
        ? getProtectedAttachmentPath(attachment.url)
        : null;

    const sizeStyle = responsive
        ? undefined
        : { width: size, height: size, minWidth: size, minHeight: size };

    let content: React.ReactNode;

    switch (kind) {
        case 'image':
            content = (
                <img
                    src={thumbUrl || mainUrl || ''}
                    alt={attachment.name || 'Image'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
            );
            break;
        case 'video':
            content = (
                <>
                    {thumbUrl ? (
                        <img
                            src={thumbUrl}
                            alt={attachment.name || 'Video'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-600" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow">
                            <Play className="h-3 w-3 translate-x-px text-slate-900" />
                        </span>
                    </div>
                    {attachment.durationSec != null && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] font-semibold text-white">
                            {formatDuration(attachment.durationSec)}
                        </span>
                    )}
                </>
            );
            break;
        case 'audio':
            content = (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-500">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200">
                        <Play className="h-2.5 w-2.5 translate-x-px text-slate-600" />
                    </div>
                    <MiniWaveform peaks={attachment.waveformPeaks} className="text-slate-400" />
                </div>
            );
            break;
        case 'pdf':
            content = (
                <div className="flex h-full w-full items-center justify-center bg-rose-50 text-rose-500">
                    <div className="text-center">
                        <FileText className="mx-auto h-5 w-5" />
                        <span className="mt-0.5 block text-[7px] font-bold uppercase">PDF</span>
                    </div>
                </div>
            );
            break;
        default:
            content = (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                    <FileText className="h-5 w-5" />
                </div>
            );
            break;
    }

    return (
        <>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setShowFull(true);
                }}
                className={cn(
                    'relative overflow-hidden rounded-lg border border-slate-200 transition-all hover:ring-2 hover:ring-blue-300',
                    responsive && 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40',
                    className
                )}
                style={sizeStyle}
                title={attachment.name || 'View attachment'}
            >
                {content}
            </button>

            {showFull && (
                <AttachmentFullView
                    attachment={attachment}
                    onClose={() => setShowFull(false)}
                />
            )}
        </>
    );
};

// ---------------------------------------------------------------------------
// Thumbnail Row (multiple attachments)
// ---------------------------------------------------------------------------

/**
 * Renders a compact row of attachment thumbnails with overflow count.
 */
export const AttachmentThumbnailRow: React.FC<AttachmentThumbnailRowProps> = ({
    attachments,
    size = 48,
    maxVisible = 4,
    className,
    responsive = false,
}) => {
    if (!attachments || attachments.length === 0) return null;

    const visible = attachments.slice(0, maxVisible);
    const overflow = attachments.length - maxVisible;

    return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
            {visible.map((att, i) => (
                <AttachmentThumbnail
                    key={att.id || `att-${i}`}
                    attachment={att}
                    size={size}
                    responsive={responsive}
                />
            ))}
            {overflow > 0 && (
                <span
                    className={cn(
                        'flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-500',
                        responsive && 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40'
                    )}
                    style={responsive ? undefined : { width: size, height: size, minWidth: size }}
                >
                    +{overflow}
                </span>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Full-view dialog (reuses AttachmentCollection for rich media)
// ---------------------------------------------------------------------------

function AttachmentFullView({
    attachment,
    onClose,
}: {
    attachment: ThumbnailAttachment;
    onClose: () => void;
}) {
    const kind = getAttachmentKind(attachment);
    const src = attachment.url ? getProtectedAttachmentPath(attachment.url) : '';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={onClose}
        >
            <div
                className="relative flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-white px-5 py-3">
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                        {attachment.name || 'Attachment'}
                    </h3>
                    <div className="flex items-center gap-2">
                        {src && (
                            <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                                Open original
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* Body — delegate to AttachmentCollection for full rendering */}
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    <AttachmentCollection
                        attachments={[attachment as Partial<AppAttachment>]}
                        variant="panel"
                    />
                </div>
            </div>
        </div>
    );
}
