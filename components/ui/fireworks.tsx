// components/ui/fireworks.tsx
import React, { useEffect, useState, useRef } from 'react';

export function Fireworks({ active }: { active: boolean }) {
    const [isSparkling, setIsSparkling] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        // Prevent fireworks on initial page load if item is already done
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        if (active) {
            setIsSparkling(true);
            const timer = setTimeout(() => setIsSparkling(false), 1000);
            return () => clearTimeout(timer);
        }
    }, [active]);

    if (!isSparkling) return null;

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            {[...Array(8)].map((_, i) => (
                <div
                    key={i}
                    className="absolute w-1 h-0.5 bg-yellow-500 rounded-full animate-firework"
                    style={{
                        // @ts-ignore
                        '--angle': `${i * 45}deg`,
                        transform: `rotate(${i * 45}deg) translateX(0)`,
                    }}
                />
            ))}
            <style jsx>{`
                @keyframes firework {
                    0% {
                        transform: rotate(var(--angle)) translateX(0);
                        opacity: 1;
                    }
                    100% {
                        transform: rotate(var(--angle)) translateX(24px);
                        opacity: 0;
                    }
                }
                .animate-firework {
                    animation: firework 0.6s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
