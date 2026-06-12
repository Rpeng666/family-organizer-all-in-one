// components/debug/DebugTimeWidget.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { enableTimeTravel, disableTimeTravel, getTimeOffset, initTimeMachine } from '@/lib/time-machine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, RefreshCcw, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';

// Helper to format Date for datetime-local input (YYYY-MM-DDTHH:mm)
const formatForDateTimeLocal = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};

export default function DebugTimeWidget() {
    const [mounted, setMounted] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [simulatedTime, setSimulatedTime] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [stepDays, setStepDays] = useState(1); // Default jump step to 1 day

    useEffect(() => {
        // 1. Initialize the patch immediately on mount
        initTimeMachine();
        setMounted(true);

        // 2. Check if we are currently time traveling to show the "Active" state
        const offset = getTimeOffset();
        if (offset !== 0) {
            setIsActive(true);
        }

        // 3. Initialize the input with the current effective time (Real or Simulated)
        // Since window.Date is patched in layout.tsx, new Date() returns the correct time context.
        setSimulatedTime(formatForDateTimeLocal(new Date()));
    }, []);

    // Don't render anything until client-side hydration is done
    if (!mounted) return null;

    // Optional: Safety check to completely hide in production
    if (process.env.NODE_ENV === 'production') return null;

    const handleSetTime = (e: React.FormEvent) => {
        e.preventDefault();
        if (!simulatedTime) return;
        const target = new Date(simulatedTime);
        enableTimeTravel(target);
    };

    const handleReset = () => {
        disableTimeTravel();
    };

    // Updates the input field date without reloading page
    const handleJump = (direction: number) => {
        const current = simulatedTime ? new Date(simulatedTime) : new Date();
        if (isNaN(current.getTime())) return;

        const newDate = new Date(current);
        newDate.setDate(newDate.getDate() + direction * stepDays);

        setSimulatedTime(formatForDateTimeLocal(newDate));
    };

    if (!isOpen) {
        return (
            // MODIFIED: Changed 'right-4' to 'right-24' to avoid InstantDB icon
            <div className="fixed bottom-4 right-24 z-50">
                <Button
                    variant={isActive ? 'destructive' : 'secondary'}
                    size="icon"
                    className="rounded-full shadow-lg h-12 w-12"
                    onClick={() => setIsOpen(true)}
                    aria-label="Open Time Machine"
                    title="Open Time Machine"
                >
                    <Clock className="h-6 w-6" />
                </Button>
                {isActive && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                )}
            </div>
        );
    }

    return (
        // MODIFIED: Changed 'right-4' to 'right-24'
        <div className="fixed bottom-4 right-24 z-50 w-80 shadow-2xl">
            <Card className="border-2 border-primary/20 bg-background/95 backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Time Machine
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                        Current Simulated Time:
                        {/* We use a key here to force re-render when isActive changes */}
                        <div key={isActive ? 'active' : 'inactive'} className="font-mono font-medium text-foreground mt-1">
                            {new Date().toLocaleString()}
                        </div>
                    </div>

                    {/* --- Quick Navigation Controls --- */}
                    <div className="flex items-end gap-2 border-b pb-4 mb-4">
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Jump (Days)</label>
                            <Input
                                type="number"
                                min="1"
                                value={stepDays}
                                onChange={(e) => setStepDays(parseInt(e.target.value) || 1)}
                                className="text-xs h-8"
                            />
                        </div>
                        <div className="flex gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => handleJump(-1)} className="h-8 px-2 text-xs" title="Go Back">
                                <ChevronLeft className="h-3 w-3 mr-1" />
                                Back
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleJump(1)} className="h-8 px-2 text-xs" title="Go Forward">
                                Fwd
                                <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                        </div>
                    </div>

                    <form onSubmit={handleSetTime} className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Travel To:</label>
                        <Input
                            type="datetime-local"
                            required
                            value={simulatedTime} // Controlled input
                            onChange={(e) => setSimulatedTime(e.target.value)}
                            className="text-xs"
                        />
                        <div className="flex gap-2">
                            <Button type="submit" size="sm" className="w-full">
                                Travel
                            </Button>
                            {isActive && (
                                <Button type="button" variant="destructive" size="sm" onClick={handleReset} title="Reset to Real Time">
                                    <span className="sr-only">Reset to Real Time</span>
                                    <RefreshCcw className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </form>
                    {isActive && (
                        <div className="text-[10px] text-red-500 font-semibold text-center border-t pt-2 mt-2">
                            ⚠ SIMULATION ACTIVE
                            <div className="text-muted-foreground font-normal">Page will reload on change</div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
