import React, { useState, useEffect, useMemo, useRef } from 'react';
import { addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DateCarouselProps {
    onDateSelect: (date: Date) => void;
    initialDate?: Date;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Layout constants (px) for responsive calculation
// Card: w-16 = 4rem = 64px, gap-1.5 = 0.375rem = 6px
const CARD_PX = 64;
const GAP_PX = 6;
const SLOT_PX = CARD_PX + GAP_PX;
// Nav buttons: size="icon" (36px) + gap-2 (8px) on each side
const NAV_AREA_PX = 2 * (36 + 8);

const DateCarousel: React.FC<DateCarouselProps> = ({ onDateSelect, initialDate }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleDays, setVisibleDays] = useState(7);

    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const date = initialDate || new Date();
        if (initialDate) return initialDate;
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    });

    const [dateRange, setDateRange] = useState<Date[]>([]);
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Responsive: measure container and compute how many day cards fit
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = (width: number) => {
            const available = width - NAV_AREA_PX;
            const max = Math.floor((available + GAP_PX) / SLOT_PX);
            const odd = max % 2 === 0 ? max - 1 : max;
            setVisibleDays(Math.max(3, Math.min(9, odd)));
        };
        const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const spread = Math.floor(visibleDays / 2);

    useEffect(() => {
        const range = [];
        for (let i = -spread; i <= spread; i++) {
            range.push(addDays(selectedDate, i));
        }
        setDateRange(range);
    }, [selectedDate, spread]);

    const centerIndex = spread;

    // Compute month label positions
    const monthLabels = useMemo(() => {
        if (dateRange.length === 0) return [];

        const groups: { month: number; year: number; startIdx: number; endIdx: number }[] = [];
        let curr = {
            month: dateRange[0].getUTCMonth(),
            year: dateRange[0].getUTCFullYear(),
            startIdx: 0,
            endIdx: 0,
        };

        for (let i = 1; i < dateRange.length; i++) {
            const m = dateRange[i].getUTCMonth();
            const y = dateRange[i].getUTCFullYear();
            if (m !== curr.month || y !== curr.year) {
                groups.push(curr);
                curr = { month: m, year: y, startIdx: i, endIdx: i };
            } else {
                curr.endIdx = i;
            }
        }
        groups.push(curr);

        if (groups.length === 1) {
            return [{
                key: `${groups[0].year}-${groups[0].month}`,
                name: MONTH_NAMES[groups[0].month],
                position: centerIndex,
            }];
        }

        return groups.map((g, idx) => ({
            key: `${g.year}-${g.month}`,
            name: MONTH_NAMES[g.month],
            position: idx === 0 ? g.endIdx : g.startIdx,
        }));
    }, [dateRange, centerIndex]);

    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        onDateSelect(date);
    };

    const handleNavigate = (direction: 'prev' | 'next') => {
        const newDate = direction === 'prev' ? subDays(selectedDate, 1) : addDays(selectedDate, 1);
        setSelectedDate(newDate);
        onDateSelect(newDate);
    };

    return (
        <div ref={containerRef} className="flex items-center justify-center gap-2 p-3 w-full overflow-hidden">
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => handleNavigate('prev')}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
                {/* Month labels */}
                <div className="relative h-5 mb-0.5">
                    {monthLabels.map((label) => (
                        <span
                            key={label.key}
                            className="absolute top-0 text-xs font-medium text-muted-foreground -translate-x-1/2 whitespace-nowrap transition-[left] duration-200 ease-out"
                            style={{
                                left: `calc(${label.position} * (4rem + 0.375rem) + 2rem)`,
                            }}
                        >
                            {label.name}
                        </span>
                    ))}
                </div>
                {/* Date cards */}
                <div className="flex gap-1.5">
                    {dateRange.map((date) => {
                        const isSelected = date.getTime() === selectedDate.getTime();
                        const today = new Date();
                        const todayKey = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).getTime();
                        const isToday = date.getTime() === todayKey;
                        return (
                            <div
                                key={date.toISOString()}
                                className={`flex flex-col items-center justify-center w-16 h-20 rounded-lg cursor-pointer transition-all duration-200 ${
                                    isSelected ? 'bg-primary text-primary-foreground shadow-lg transform scale-105' : 'bg-background hover:bg-secondary'
                                }`}
                                onClick={() => handleDateClick(date)}
                            >
                                <div className={`text-xs ${isToday ? 'interBold' : ''}`}>{daysOfWeek[date.getUTCDay()]}</div>
                                <div className={`text-xl ${isToday ? 'interBold' : ''}`}>{date.getUTCDate()}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => handleNavigate('next')}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
};

export default DateCarousel;
