'use client';

import React from 'react';
import { StarRating } from '@/components/responses/StarRating';
import { formatGradeDisplay } from '@/lib/grade-utils';
import type { GradeTypeLike } from '@/lib/task-response-types';

interface Props {
    numericValue: number;
    displayValue: string;
    gradeType?: GradeTypeLike | null;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const GradeDisplay: React.FC<Props> = ({
    numericValue,
    displayValue,
    gradeType,
    className,
    size = 'md',
}) => {
    if (gradeType?.kind === 'stars') {
        return (
            <div className={className}>
                <StarRating
                    value={numericValue}
                    maxStars={gradeType.highValue}
                    disabled
                    size={size}
                />
            </div>
        );
    }

    // For number and letter grades, show the formatted display
    const formatted = gradeType
        ? formatGradeDisplay(numericValue, gradeType)
        : displayValue;

    const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

    return (
        <span className={`${textSize} font-semibold text-emerald-700 ${className || ''}`}>
            {formatted}
            {gradeType?.kind === 'number' && (
                <span className="text-emerald-500 font-normal">/{gradeType.highValue}</span>
            )}
        </span>
    );
};
