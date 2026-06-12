'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MEMBER_COLOR_SWATCHES, getReadableTextColor, hexToRgbaString, normalizeHexColor } from '@/lib/family-member-colors';
import { cn } from '@/lib/utils';

interface MemberColorFieldProps {
    color: string;
    inputId: string;
    onColorChange: (nextColor: string) => void;
    previewName: string;
    warningMessage?: string | null;
}

export function MemberColorField({ color, inputId, onColorChange, previewName, warningMessage }: MemberColorFieldProps) {
    const readableTextColor = getReadableTextColor(color);
    const normalizedPreviewName = previewName.trim() || 'New family member';

    return (
        <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={inputId} className="text-right pt-2">Calendar color</Label>
            <div className="col-span-3 space-y-3">
                <p className="text-sm text-muted-foreground">This color will be used for calendar events associated with this family member.</p>

                {/* Preview card */}
                <div
                    className="rounded-2xl border p-3"
                    style={{ backgroundColor: hexToRgbaString(color, 0.08), borderColor: hexToRgbaString(color, 0.22) }}
                >
                    <div
                        className="rounded-xl border px-4 py-4 shadow-sm"
                        style={{
                            background: `linear-gradient(135deg, ${hexToRgbaString(color, 0.96)} 0%, ${hexToRgbaString(color, 0.76)} 100%)`,
                            borderColor: hexToRgbaString(color, 0.38),
                            color: readableTextColor,
                        }}
                    >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-80">Calendar preview</div>
                        <div className="mt-3 flex items-center gap-3">
                            <div
                                className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-full border px-3 text-sm font-semibold"
                                style={{ borderColor: hexToRgbaString(readableTextColor, 0.28), backgroundColor: hexToRgbaString(readableTextColor, 0.12) }}
                            >
                                {normalizedPreviewName.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-lg font-semibold leading-none">{normalizedPreviewName}</div>
                                <div className="mt-1 text-sm opacity-80">Sample event color for this person</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Swatches + custom picker */}
                <div className="rounded-xl border bg-background/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Quick picks</div>
                            <div className="mt-1 text-sm text-muted-foreground">Choose a built-in swatch or fine-tune with the picker.</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div aria-hidden className="h-10 w-10 rounded-lg border shadow-sm" style={{ backgroundColor: color, borderColor: hexToRgbaString(color, 0.3) }} />
                            <Input
                                id={inputId}
                                type="color"
                                value={color}
                                onChange={(e) => { const next = normalizeHexColor(e.target.value); if (next) onColorChange(next); }}
                                aria-label={`${normalizedPreviewName} custom calendar color`}
                                className="h-10 w-16 cursor-pointer rounded-lg border p-1"
                            />
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {MEMBER_COLOR_SWATCHES.map((swatch) => {
                            const isSelected = swatch.value === color;
                            return (
                                <button
                                    key={swatch.value}
                                    type="button"
                                    aria-label={`Use ${swatch.label} for ${normalizedPreviewName}'s calendar color`}
                                    title={swatch.label}
                                    onClick={() => onColorChange(swatch.value)}
                                    className={cn(
                                        'h-10 rounded-xl border transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
                                        isSelected && 'scale-[1.04] ring-2 ring-slate-900/15 ring-offset-2',
                                    )}
                                    style={{ backgroundColor: swatch.value, borderColor: isSelected ? hexToRgbaString(swatch.value, 0.72) : hexToRgbaString(swatch.value, 0.25) }}
                                >
                                    <span className="sr-only">{swatch.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected color display */}
                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2">
                    <div aria-hidden className="h-10 w-10 rounded-lg border shadow-sm" style={{ backgroundColor: color, borderColor: hexToRgbaString(color, 0.32) }} />
                    <div className="min-w-0">
                        <div className="text-sm font-medium">Selected color</div>
                        <div className="font-mono text-xs uppercase text-muted-foreground">{color}</div>
                    </div>
                </div>

                {warningMessage
                    ? <p className="text-sm font-medium text-amber-700">{warningMessage}</p>
                    : <p className="text-xs text-muted-foreground">You can still save if colors are close — we'll only show a warning.</p>}
            </div>
        </div>
    );
}
