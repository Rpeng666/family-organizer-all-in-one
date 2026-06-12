'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    value: number;
    maxStars: number;
    onChange?: (value: number) => void;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const sizeClassMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
};

export const StarRating: React.FC<Props> = ({
    value,
    maxStars,
    onChange,
    disabled = false,
    size = 'md',
}) => {
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const displayValue = hoverValue ?? value;
    const interactive = !disabled && !!onChange;

    return (
        <div className="inline-flex items-center gap-0.5">
            {Array.from({ length: maxStars }, (_, i) => {
                const starValue = i + 1;
                const filled = starValue <= displayValue;
                return (
                    <button
                        key={starValue}
                        type="button"
                        disabled={!interactive}
                        onClick={() => onChange?.(starValue)}
                        onMouseEnter={() => interactive && setHoverValue(starValue)}
                        onMouseLeave={() => interactive && setHoverValue(null)}
                        className={cn(
                            'transition-colors',
                            interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default',
                            filled ? 'text-amber-400' : 'text-slate-200'
                        )}
                    >
                        <Star
                            className={cn(sizeClassMap[size], filled && 'fill-current')}
                        />
                    </button>
                );
            })}
        </div>
    );
};
