// components/ui/ToggleableAvatar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // +++ Import createPortal +++
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Toggle } from '@/components/ui/toggle';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { getPhotoUrl } from '@/lib/photo-urls';

// --- Helper: Generate random number in range ---
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;

// --- Types ---
type SparkleConfig = {
    id: string;
    top: string;
    left: string;
    size: string;
    delay: string;
    rotation: string;
};

// --- 1. The "Josh Comeau" Style Star SVG ---
const Star = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 68 68" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path
            d="M26.5 25.5C19.0043 33.3697 0 34 0 34C0 34 19.1013 35.3684 26.5 43.5C33.234 50.901 34 68 34 68C34 68 36.9884 50.7065 44.5 43.5C51.6431 36.647 68 34 68 34C68 34 51.6947 32.0939 44.5 25.5C36.5605 18.2235 34 0 34 0C34 0 33.6591 17.9837 26.5 25.5Z"
            fill="currentColor"
        />
    </svg>
);

// --- 2. Sparkle Component ---
const Sparkle = ({ data }: { data: SparkleConfig }) => (
    <div
        className="absolute pointer-events-none"
        style={{
            top: data.top,
            left: data.left,
            zIndex: 20,
            transform: `rotate(${data.rotation})`, // Random static rotation applied to wrapper
        }}
    >
        <div
            className="animate-sparkle"
            style={{
                animationDelay: data.delay,
                width: data.size,
                height: data.size,
            }}
        >
            <Star className="text-yellow-400 w-full h-full" />
        </div>
    </div>
);

// --- 3. Thunder Cloud SVG ---
// Simple cloud shape, slightly darker grey for "Storm" look
const StormCloud = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg
        version="1.0"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 20 1256 650" // Set viewBox to match the transformed scale of the path
        className={className}
        style={style}
        fill="currentColor"
    >
        <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" stroke="none">
            <path d="M6547 12789 c-239 -23 -521 -105 -752 -219 -249 -122 -442 -264 -639 -471 l-116 -122 -132 66 c-304 150 -581 221 -913 234 -875 34 -1697 -461 -2080 -1252 -72 -148 -132 -315 -165 -457 l-22 -98 -42 -11 c-329 -85 -635 -241 -880 -448 -98 -82 -246 -232 -317 -321 -202 -251 -364 -589 -433 -903 -44 -198 -50 -263 -50 -492 0 -238 16 -365 69 -569 111 -427 373 -841 715 -1129 614 -517 1443 -666 2200 -395 124 44 332 148 445 222 l98 64 66 -18 c225 -62 503 -89 733 -71 138 11 336 44 428 71 30 9 39 7 60 -10 301 -240 592 -385 935 -465 178 -41 268 -50 510 -50 259 1 382 17 595 79 278 80 496 190 734 368 l119 90 46 -26 c108 -62 283 -146 371 -179 544 -203 1127 -190 1661 39 71 31 137 53 145 50 39 -15 273 -36 402 -36 601 0 1146 225 1572 650 608 605 814 1479 539 2293 -285 848 -1052 1441 -1953 1509 l-151 11 -130 127 c-263 257 -530 420 -864 530 -157 52 -357 94 -502 106 l-85 6 -34 67 c-52 101 -183 291 -267 387 -217 248 -424 409 -707 550 -373 185 -794 263 -1209 223z" />
        </g>
    </svg>
);

// --- 4. Lightning Storm Component (Canvas) ---
const LightningStorm = ({ coords, onComplete }: { coords: { top: number; left: number; width: number; height: number }; onComplete?: () => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cloudRef = useRef<HTMLDivElement>(null); // +++ Added Ref for tracking cloud position +++
    const [cloudOpacity, setCloudOpacity] = useState(0);

    // Height reserved for the cloud area above the avatar
    const CLOUD_HEIGHT = 50;
    // Extra padding for canvas
    const CANVAS_WIDTH = coords.width + 60;
    const CANVAS_HEIGHT = coords.height + CLOUD_HEIGHT + 20;

    useEffect(() => {
        // 1. Fade in cloud immediately
        // (CSS transition handles the 300ms duration)
        setCloudOpacity(1);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Configuration
        const startY = CLOUD_HEIGHT - 15; // Start slightly inside the cloud
        const endY = CANVAS_HEIGHT - 10; // End near bottom of avatar

        // Helper: Recursive Lightning Draw function
        // Based on simplified midpoint displacement
        const drawLightning = (x1: number, y1: number, x2: number, y2: number, displace: number) => {
            if (displace < 1.5) {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else {
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const newX = midX + (Math.random() - 0.5) * displace;
                const newY = midY; // Keep vertical progress relatively steady
                drawLightning(x1, y1, newX, newY, displace / 1.8);
                drawLightning(newX, newY, x2, y2, displace / 1.8);
            }
        };

        const flashBolt = () => {
            // +++ Calculate current cloud position dynamically +++
            // This ensures the bolt starts from the cloud even as it animates via CSS
            const cloudEl = cloudRef.current;
            const canvasEl = canvasRef.current;

            // Default center if refs are missing (fallback)
            let currentCloudCenter = CANVAS_WIDTH / 2;

            if (cloudEl && canvasEl) {
                const cloudRect = cloudEl.getBoundingClientRect();
                const canvasRect = canvasEl.getBoundingClientRect();
                // Determine the center of the cloud relative to the canvas
                currentCloudCenter = cloudRect.left - canvasRect.left + cloudRect.width / 2;
            }

            // Clear previous bolt
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            // Randomize end X near the bottom width of avatar
            const offset = (Math.random() - 0.5) * coords.width;
            const endX = CANVAS_WIDTH / 2 + offset;

            // --- Shallow Bell Curve for Start X ---
            // Summing two randoms (0..1) gives a triangular distribution centered at 1.
            // Subtracting 1 gives a range of -1 to 1 centered at 0.
            const bellRandom = Math.random() + Math.random() - 1;
            // Cloud width is approx 48px. We allow +/- 20px from center.
            const startOffset = bellRandom * 20;

            // +++ Use the dynamic center +++
            const startX = currentCloudCenter + startOffset;

            // Draw Glow & Styling
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(255, 235, 59, 0.9)'; // Bright Yellow Glow
            ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; // Pure White Core
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            drawLightning(startX, startY, endX, endY, 60); // 60 is initial displacement amount

            // Fade out bolt quickly
            setTimeout(() => {
                ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            }, 120); // Flash duration
        };

        // Schedule Animation Sequence
        // Randomize 1 to 3 bolts
        const boltCount = Math.floor(Math.random() * 3) + 1;
        const timeouts: NodeJS.Timeout[] = [];

        // Timing Constants
        const FADE_IN_DURATION = 300; // Matches CSS duration-300
        const MIN_INTERVAL = 220; // Minimum gap between bolts

        // First bolt: Between 300ms (fade complete) and 330ms (30ms window)
        let nextBoltTime = FADE_IN_DURATION + Math.random() * 30;

        for (let i = 0; i < boltCount; i++) {
            const t = setTimeout(() => flashBolt(), nextBoltTime);
            timeouts.push(t);

            // Calculate next time: Previous Time + Min Interval + Variance (0-300ms)
            nextBoltTime += MIN_INTERVAL + Math.random() * 300;
        }

        // Fade Out Cloud
        // Ensure cloud fades out after the last bolt + a small buffer
        // Or simply trigger it near the end of the parent's lifecycle (1600ms)
        const fadeOutTimer = setTimeout(() => {
            setCloudOpacity(0);
        }, 1300);

        return () => {
            timeouts.forEach((t) => clearTimeout(t));
            clearTimeout(fadeOutTimer);
        };
    }, []);

    return (
        <div
            className="fixed z-[9999] pointer-events-none"
            style={{
                top: coords.top - CLOUD_HEIGHT, // Shift up to make room for cloud
                left: coords.left - 30, // Center horizontally relative to padded width
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
            }}
        >
            {/* The Cloud */}
            <div
                ref={cloudRef} // +++ Attached Ref +++
                // +++ Changed: Added 'animate-cloud-drift' and removed '-translate-x-1/2' +++
                // This allows the animation to control the horizontal transform
                className="absolute left-1/2 transition-opacity duration-300 ease-in z-10 animate-cloud-drift"
                style={{
                    top: 0,
                    width: '48px',
                    height: '48px',
                    opacity: cloudOpacity,
                }}
            >
                <StormCloud className="text-black w-full h-full drop-shadow-lg" />
            </div>

            {/* The Lightning Canvas (Z-Index higher to flash over cloud slightly or under depending on preference, here it is under the cloud div but absolutely positioned) */}
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute top-0 left-0 z-0" />
        </div>
    );
};

const ToggleableAvatar = ({
    name,
    photoUrls,
    isComplete,
    onToggle,
    onMarkNotDone,
    isDisabled = false,
    isNotDone = false,
    completerName = '',
    choreTitle = '',
    isNegative = false, // +++ NEW PROP +++
    taskSeriesProgress = null as number | null, // 0-1 ratio, null = no task series
}: {
    name: string;
    photoUrls?: any;
    isComplete: boolean;
    onToggle: (pressed: boolean) => void;
    onMarkNotDone?: () => void;
    isDisabled?: boolean;
    isNotDone?: boolean;
    completerName?: string;
    choreTitle?: string;
    isNegative?: boolean;
    taskSeriesProgress?: number | null;
}) => {
    const { toast } = useToast();
    // State now holds the array of sparkle data instead of just a boolean
    const [sparkles, setSparkles] = useState<SparkleConfig[]>([]);
    const [showLightning, setShowLightning] = useState(false); // +++ State for negative effect

    // +++ New State for Portal Positioning +++
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null); // Ref to measure the avatar button

    // We use this ref to track if the completion was triggered by a user click.
    // This prevents sparkles from showing when navigating to a day where the task is already complete.
    const wasToggledRef = useRef(false);

    // Long-press detection for "not done" marking
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggeredRef = useRef(false);

    const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase();

    const photoUrl64 = getPhotoUrl(photoUrls, '64');

    // Function to generate random sparkles (Positive Effect)
    const generateSparkles = () => {
        const count = random(4, 7); // Generate between 4 and 7 sparkles
        const newSparkles: SparkleConfig[] = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            // Random position roughly around the border ring (-40% to 120% range relative to container)
            const top = random(-40, 120) + '%';
            const left = random(-40, 120) + '%';
            // Random size between 12px and 28px
            const size = random(12, 28) + 'px';
            // Random delay up to 800ms so they don't all pop at once
            const delay = random(0, 800) + 'ms';
            // Random rotation for variety
            const rotation = random(0, 360) + 'deg';

            newSparkles.push({
                id: `sparkle-${now}-${i}`,
                top,
                left,
                size,
                delay,
                rotation,
            });
        }
        return newSparkles;
    };

    // +++ Effect to handle the temporary sparkle/lightning state +++
    useEffect(() => {
        // Only trigger sparkles if complete, not disabled, AND the user just toggled it.
        if (isComplete && !isDisabled && wasToggledRef.current) {
            // 1. Capture current position for the Portal
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                });
            }

            if (isNegative) {
                // +++ Trigger Lightning +++
                setShowLightning(true);
                const timer = setTimeout(() => {
                    setShowLightning(false);
                }, 1600); // Slightly longer than 1.5s to ensure cleanup
                wasToggledRef.current = false;
                return () => clearTimeout(timer);
            } else {
                // +++ Trigger Sparkles +++
                setSparkles(generateSparkles());

                // 2. Clear sparkles after 2.5 seconds
                const timer = setTimeout(() => {
                    setSparkles([]);
                }, 2500);

                // Reset the toggle ref so it doesn't fire again on re-renders/navigation
                wasToggledRef.current = false;

                return () => clearTimeout(timer);
            }
        } else if (!isComplete) {
            // If toggled off (or loaded as incomplete), clear immediately
            setSparkles([]);
            setShowLightning(false);
        }
    }, [isComplete, isDisabled, isNegative]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (isDisabled || !onMarkNotDone) return;
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            onMarkNotDone();
        }, 600);
    };

    const handlePointerUp = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handlePointerCancel = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (isDisabled || !onMarkNotDone) return;
        e.preventDefault();
        // Clear long-press timer since context menu fires instead on some platforms
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        onMarkNotDone();
    };

    const handleToggle = (pressed: boolean) => {
        // If this click was actually the end of a long-press, ignore it
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }
        if (isDisabled) {
            // +++ Show toast if disabled +++
            toast({
                title: 'Already Completed',
                description: `${choreTitle} was completed by ${completerName}.`,
            });
        } else {
            // +++ Call original onToggle only if not disabled +++
            // Record that this action came from the user
            wasToggledRef.current = pressed;
            onToggle(pressed);
        }
    };

    // Determine colors based on isNegative and state
    let borderClass = 'border-amber-500 bg-transparent'; // Default Idle
    let activeClass = 'border-green-500 bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-110'; // Default Active

    if (isNotDone) {
        borderClass = 'border-gray-400 bg-gray-400'; // Not Done = gray ring with gray fill
        activeClass = borderClass; // Same styling whether "pressed" or not
    } else if (isDisabled) {
        borderClass = 'border-gray-400 bg-transparent';
        activeClass = 'border-gray-400 bg-transparent'; // Shouldn't be active if disabled usually, but handled below
    } else if (isNegative) {
        // +++ Invert for Negative Chores +++
        borderClass = 'border-green-500 bg-transparent'; // Idle = Green (Safe)
        activeClass = 'border-red-500 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] scale-110'; // Active = Red (Bad)
    }

    return (
        <>
            {/* Inject custom keyframes for the "Grow, Rotate, Shrink" effect AND cloud drift */}
            <style jsx global>{`
                @keyframes sparkle-spin {
                    0% {
                        transform: scale(0) rotate(0deg);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1) rotate(180deg);
                        opacity: 1;
                    }
                    100% {
                        transform: scale(0) rotate(360deg);
                        opacity: 0;
                    }
                }
                .animate-sparkle {
                    // Changed 'forwards' to 'both' to ensure opacity:0 applies during the animation-delay
                    animation: sparkle-spin 1000ms linear both;
                }

                @keyframes cloud-drift {
                    0% {
                        transform: translateX(-110%);
                    }
                    100% {
                        transform: translateX(0%);
                    }
                }
                .animate-cloud-drift {
                    /* Drifts from left (-100%) to right (0%) over 1.6s */
                    animation: cloud-drift 1600ms ease-out forwards;
                }
            `}</style>

            <Toggle
                ref={buttonRef} // +++ Attach Ref here +++
                pressed={isComplete && !isDisabled && !isNotDone} // Visually unpress if disabled or notDone
                // +++ Use the new handler +++
                onPressedChange={handleToggle}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onContextMenu={handleContextMenu}
                // +++ Apply disabled styles conditionally +++
                className={cn(
                    'p-0 data-[state=on]:bg-transparent data-[state=off]:bg-transparent group relative', // Added 'group' and 'relative'
                    isDisabled && 'opacity-50 cursor-not-allowed'
                )}
                // +++ Disable the underlying button semantics +++
                disabled={isDisabled}
            >
                {/* --- Sparkles/Lightning Portal --- */}
                {/* By moving this to a Portal, we break out of the overflow:hidden/scroll containers of the list */}
                {typeof document !== 'undefined' &&
                    createPortal(
                        <>
                            {/* Render Positive Sparkles */}
                            {sparkles.length > 0 && (
                                <div
                                    className="fixed z-[9999] pointer-events-none overflow-visible"
                                    style={{
                                        top: coords.top,
                                        left: coords.left,
                                        width: coords.width,
                                        height: coords.height,
                                    }}
                                >
                                    {sparkles.map((sparkle) => (
                                        <Sparkle key={sparkle.id} data={sparkle} />
                                    ))}
                                </div>
                            )}

                            {/* Render Negative Lightning */}
                            {showLightning && <LightningStorm coords={coords} />}
                        </>,
                        document.body
                    )}

                <div
                    className={cn(
                        'rounded-full p-1 border-2 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative z-10', // +++ Added 'relative' and z-10 +++
                        // Style based on completion only if NOT disabled
                        !isDisabled && isComplete ? activeClass : borderClass
                    )}
                >
                    {/* SVG Progress Ring for Task Series */}
                    {taskSeriesProgress !== null && taskSeriesProgress > 0 && !isComplete && !isDisabled && (
                        <svg
                            className="absolute pointer-events-none z-30"
                            style={{
                                top: '-2px',
                                left: '-2px',
                                width: 'calc(100% + 4px)',
                                height: 'calc(100% + 4px)',
                            }}
                            viewBox="0 0 56 56"
                        >
                            <circle
                                cx="28"
                                cy="28"
                                r="27"
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="2"
                                strokeDasharray={2 * Math.PI * 27}
                                strokeDashoffset={2 * Math.PI * 27 * (1 - taskSeriesProgress)}
                                strokeLinecap="round"
                                transform="rotate(-90 28 28)"
                                style={{ transition: 'stroke-dashoffset 500ms ease' }}
                            />
                        </svg>
                    )}
                    <Avatar className={cn("h-11 w-11 relative z-20", isNotDone && "grayscale")}>
                        {photoUrl64 ? <AvatarImage src={photoUrl64} alt={name} /> : <AvatarFallback>{initials}</AvatarFallback>}
                    </Avatar>
                </div>
            </Toggle>
        </>
    );
};

export default ToggleableAvatar;
