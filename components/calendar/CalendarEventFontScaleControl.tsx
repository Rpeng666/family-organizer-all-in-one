'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CALENDAR_YEAR_FONT_SCALE_MAX, CALENDAR_YEAR_FONT_SCALE_MIN } from '@/lib/calendar-controls';

interface CalendarEventFontScaleControlProps {
    id: string;
    value: number;
    onChange: (nextValue: number) => void;
    description: React.ReactNode;
    className?: string;
    hintClassName?: string;
    descriptionClassName?: string;
}

export default function CalendarEventFontScaleControl({
    id,
    value,
    onChange,
    description,
    className,
    hintClassName,
    descriptionClassName,
}: CalendarEventFontScaleControlProps) {
    return (
        <div className={cn('grid gap-2', className)}>
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={id}>Event Font Size</Label>
                <div className={cn('flex items-center gap-2 text-[11px] text-muted-foreground', hintClassName)}>
                    <span>Small</span>
                    <span>Large</span>
                </div>
            </div>
            <input
                id={id}
                type="range"
                min={CALENDAR_YEAR_FONT_SCALE_MIN}
                max={CALENDAR_YEAR_FONT_SCALE_MAX}
                step={0.02}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
            />
            <p className={cn('text-xs text-muted-foreground', descriptionClassName)}>{description}</p>
        </div>
    );
}
