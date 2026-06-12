'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import { getSyncBadgePresentation } from '@/lib/sync-status';

export function SyncStatusBadge() {
    const instantStatus = db.useConnectionStatus();
    const [online, setOnline] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const syncOnline = () => setOnline(window.navigator.onLine);
        syncOnline();
        window.addEventListener('online', syncOnline);
        window.addEventListener('offline', syncOnline);
        return () => {
            window.removeEventListener('online', syncOnline);
            window.removeEventListener('offline', syncOnline);
        };
    }, []);

    const presentation = useMemo(() => getSyncBadgePresentation({ online, instantStatus }), [online, instantStatus]);
    const Icon = presentation.icon === 'cloud-off' ? CloudOff : presentation.icon === 'refresh' ? RefreshCw : Cloud;

    return (
        <div
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.className}`}
            title={`Network: ${online ? 'online' : 'offline'} · Instant: ${instantStatus}`}
            aria-live="polite"
        >
            <Icon className={`h-3.5 w-3.5 ${presentation.spinning ? 'animate-spin' : ''}`} />
            <span>{presentation.label}</span>
        </div>
    );
}
