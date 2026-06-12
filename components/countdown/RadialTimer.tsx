'use client';

import React, { useRef, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RadialTimerState = 'upcoming' | 'active' | 'overdue' | 'completed' | 'celebrating';

interface RadialTimerProps {
    /** Slot start timestamp (ms). When provided with endMs, the ring self-animates at 60fps. */
    startMs?: number;
    /** Slot end timestamp (ms). */
    endMs?: number;
    /** Fallback static progress (0 → 1) used when startMs/endMs aren't provided. */
    progress?: number;
    state: RadialTimerState;
    /** Unique key that changes when the chore changes — triggers crossfade. */
    choreKey: string;
    children?: React.ReactNode;
    className?: string;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

function getHueForProgress(progress: number, state: RadialTimerState): number {
    // cool purple → warm amber → red
    if (state === 'completed' || state === 'celebrating') return 145; // green
    if (state === 'overdue') return 15; // red-orange
    if (state === 'upcoming') return 220; // cool blue-purple
    // active: interpolate 220 → 15 over progress
    const startHue = 220;
    const endHue = 15;
    return startHue - progress * (startHue - endHue);
}

function getPlasmaColor(state: RadialTimerState, progress: number): string {
    if (state === 'completed' || state === 'celebrating') return '120, 255, 80'; // green
    if (state === 'overdue') return '255, 60, 30'; // red
    // active: fuchsia → warm orange
    const r = Math.round(255);
    const g = Math.round(0 + progress * 120);
    const b = Math.round(255 - progress * 200);
    return `${r}, ${g}, ${Math.max(0, b)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RadialTimer({
    startMs,
    endMs,
    progress: staticProgress,
    state,
    choreKey,
    children,
    className,
}: RadialTimerProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [rippleActive, setRippleActive] = useState(false);
    const prevChoreKeyRef = useRef(choreKey);

    // Compute initial progress synchronously so there's no 1-frame flash at 0.
    const computeProgress = (): number => {
        if (state === 'completed' || state === 'celebrating') return 1;
        if (state === 'overdue') return 1;
        if (state === 'upcoming') return 0;
        if (typeof startMs === 'number' && typeof endMs === 'number' && endMs > startMs) {
            const elapsed = Date.now() - startMs;
            const total = endMs - startMs;
            return Math.max(0, Math.min(1, elapsed / total));
        }
        if (typeof staticProgress === 'number') {
            return Math.max(0, Math.min(1, staticProgress));
        }
        return 0;
    };

    const [animatedProgress, setAnimatedProgress] = useState<number>(computeProgress);

    // Run a requestAnimationFrame loop while the ring is actively ticking so the
    // arc updates smoothly at 60fps independent of any parent re-render cadence.
    useEffect(() => {
        const selfAnimate =
            state === 'active' &&
            typeof startMs === 'number' &&
            typeof endMs === 'number' &&
            endMs > startMs;

        if (!selfAnimate) {
            // Snap to the correct static value for this state.
            setAnimatedProgress(computeProgress());
            return;
        }

        let rafId = 0;
        const total = endMs! - startMs!;
        const tick = () => {
            const elapsed = Date.now() - startMs!;
            const p = Math.max(0, Math.min(1, elapsed / total));
            setAnimatedProgress(p);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, startMs, endMs, choreKey]);

    // Clamp progress
    const p = state === 'overdue' ? 1 : Math.max(0, Math.min(1, animatedProgress));

    // Trigger ripple on completion
    useEffect(() => {
        if (state === 'celebrating') {
            setRippleActive(true);
            const timeout = setTimeout(() => setRippleActive(false), 2000);
            return () => clearTimeout(timeout);
        }
        setRippleActive(false);
    }, [state]);

    // Track chore transitions for crossfade
    useEffect(() => {
        prevChoreKeyRef.current = choreKey;
    }, [choreKey]);

    const hue = getHueForProgress(p, state);
    const plasmaRGB = getPlasmaColor(state, p);

    // --- SVG ring geometry ---
    const viewBox = 1000;
    const cx = viewBox / 2;
    const cy = viewBox / 2;
    const radius = 420;
    const circumference = 2 * Math.PI * radius;

    // Progress arc: how much of the ring is filled
    const arcOffset = circumference * (1 - p);

    // --- Tick marks ---
    const tickCount = 120;
    const ticks = [];
    for (let i = 0; i < tickCount; i++) {
        const angle = (i / tickCount) * 360;
        const isMajor = i % 10 === 0;
        const tickProgress = i / tickCount;
        const isPast = tickProgress <= p;
        ticks.push(
            <line
                key={i}
                x1={cx}
                y1={cy - radius - 30}
                x2={cx}
                y2={cy - radius - 30 - (isMajor ? 18 : 8)}
                stroke="white"
                strokeWidth={isMajor ? 3 : 1.5}
                strokeOpacity={isPast ? 0.15 : 0.7}
                transform={`rotate(${angle} ${cx} ${cy})`}
            />,
        );
    }

    // --- Plasma conic gradient CSS ---
    const angle = p * 360;
    const fadeLength = 180;
    let gradientStr: string;

    if (state === 'completed' || state === 'celebrating') {
        // Full green ring
        gradientStr = `conic-gradient(from 0deg, rgba(${plasmaRGB}, 0.9) 0deg, rgba(${plasmaRGB}, 0.9) 360deg)`;
    } else if (angle <= fadeLength) {
        const fadeFactor = angle / fadeLength;
        const tailColor = `rgba(${plasmaRGB}, ${fadeFactor})`;
        gradientStr = `conic-gradient(from 0deg,
            ${tailColor} 0deg,
            rgba(${plasmaRGB}, ${0.8 * fadeFactor}) ${angle * 0.16}deg,
            rgba(${plasmaRGB}, ${0.4 * fadeFactor}) ${angle * 0.50}deg,
            rgba(${plasmaRGB}, ${0.1 * fadeFactor}) ${angle * 0.83}deg,
            rgba(${plasmaRGB}, 0) ${angle}deg,
            rgba(${plasmaRGB}, 0) ${angle + 2}deg,
            transparent ${angle + 2.1}deg,
            transparent 350deg,
            ${tailColor} 350.1deg,
            ${tailColor} 360deg
        )`;
    } else {
        const fadeStart = angle - fadeLength;
        let tailStartOpacity = 1;
        let fullColorAngle = 0;
        if (angle > 340) {
            const overlap = (angle - 340) / 20;
            tailStartOpacity = 1 - overlap;
            fullColorAngle = overlap * 30;
        }
        const tailColor = `rgba(${plasmaRGB}, ${tailStartOpacity})`;

        if (angle < 345) {
            gradientStr = `conic-gradient(from 0deg,
                ${tailColor} 0deg,
                rgba(${plasmaRGB}, 1) ${fullColorAngle}deg,
                rgba(${plasmaRGB}, 1) ${fadeStart}deg,
                rgba(${plasmaRGB}, 0.8) ${fadeStart + fadeLength * 0.16}deg,
                rgba(${plasmaRGB}, 0.4) ${fadeStart + fadeLength * 0.50}deg,
                rgba(${plasmaRGB}, 0.1) ${fadeStart + fadeLength * 0.83}deg,
                rgba(${plasmaRGB}, 0) ${angle}deg,
                rgba(${plasmaRGB}, 0) ${angle + 2}deg,
                transparent ${angle + 2.1}deg,
                transparent 350deg,
                ${tailColor} 350.1deg,
                ${tailColor} 360deg
            )`;
        } else {
            gradientStr = `conic-gradient(from 0deg,
                ${tailColor} 0deg,
                rgba(${plasmaRGB}, 1) ${fullColorAngle}deg,
                rgba(${plasmaRGB}, 1) ${fadeStart}deg,
                rgba(${plasmaRGB}, 0.8) ${fadeStart + fadeLength * 0.16}deg,
                rgba(${plasmaRGB}, 0.4) ${fadeStart + fadeLength * 0.50}deg,
                rgba(${plasmaRGB}, 0.1) ${fadeStart + fadeLength * 0.83}deg,
                rgba(${plasmaRGB}, 0) ${angle}deg,
                ${tailColor} 360deg
            )`;
        }
    }

    const bgGradient = `radial-gradient(circle at 50% 50%, hsl(${hue}, 80%, 75%), hsl(${hue + 30}, 70%, 55%))`;

    return (
        <div
            className={`relative flex items-center justify-center select-none ${className ?? ''}`}
            style={{
                width: 'min(92vw, 80vh)',
                height: 'min(92vw, 80vh)',
            }}
        >
            {/* Background gradient fills the parent container via absolute positioning */}
            <div
                className="pointer-events-none fixed inset-0 -z-10 transition-[background] duration-1000 ease-in-out"
                style={{ background: bgGradient }}
            />

            <svg viewBox={`0 0 ${viewBox} ${viewBox}`} className="h-full w-full" style={{ pointerEvents: 'none' }}>
                <defs>
                    <filter id="radial-super-glow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="6" result="blur1" />
                        <feGaussianBlur stdDeviation="14" result="blur2" />
                        <feMerge>
                            <feMergeNode in="blur2" />
                            <feMergeNode in="blur1" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="radial-soft-edge" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="5" />
                    </filter>
                    <mask id="radial-core-mask">
                        <circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            fill="none"
                            stroke="white"
                            strokeWidth={20}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${cx} ${cy})`}
                            strokeDasharray={circumference}
                            strokeDashoffset={arcOffset}
                            filter="url(#radial-soft-edge)"
                            style={{ transition: 'none' }}
                        />
                    </mask>
                </defs>

                {/* Background track ring */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth={6}
                />

                {/* Tick marks */}
                <g>{ticks}</g>

                {/* Progress ring group with glow */}
                <g
                    filter="url(#radial-super-glow)"
                    style={{
                        animation: state === 'active' ? 'radial-gentle-pulse 4s ease-in-out infinite' : 'none',
                        opacity: 1,
                    }}
                >
                    {/* White outer wrapper arc */}
                    <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="none"
                        stroke="white"
                        strokeWidth={32}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${cx} ${cy})`}
                        strokeDasharray={circumference}
                        strokeDashoffset={arcOffset}
                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />

                    {/* Plasma conic gradient fill (masked to the arc) */}
                    <g mask="url(#radial-core-mask)">
                        <foreignObject x="0" y="0" width={viewBox} height={viewBox}>
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <div
                                    ref={canvasRef}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: gradientStr,
                                        transition: 'background 0.3s ease',
                                    }}
                                />
                            </div>
                        </foreignObject>
                    </g>
                </g>

                {/* Completion ripple */}
                {rippleActive && (
                    <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="none"
                        stroke={state === 'celebrating' ? 'rgba(120, 255, 80, 0.8)' : 'fuchsia'}
                        strokeWidth={4}
                        className="animate-radial-ripple"
                        style={{ transformOrigin: 'center' }}
                    />
                )}
            </svg>

            {/* Center content (chore info, countdown, avatar) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center">
                    {children}
                </div>
            </div>

            {/* Inline keyframe styles */}
            <style jsx global>{`
                @keyframes radial-gentle-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.85; }
                }
                @keyframes radial-ripple {
                    0% { transform: scale(1); opacity: 0.8; stroke-width: 8px; }
                    100% { transform: scale(1.4); opacity: 0; stroke-width: 0px; }
                }
                .animate-radial-ripple {
                    transform-origin: center;
                    animation: radial-ripple 2s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
                }
            `}</style>
        </div>
    );
}
