// lib/time-machine.ts
'use client';

const STORAGE_KEY = 'debug_time_offset';

// Helper to get offset (safe for server or client)
export const getTimeOffset = (): number => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
};

export const enableTimeTravel = (targetDate: Date) => {
    if (typeof window === 'undefined') return;

    // We need the REAL Date to calculate the offset.
    // If we are already patched, window.Date is the Mock.
    // The inline script saves the real one to window.__RealDate.
    // @ts-ignore
    const NativeDate = window.__RealDate || window.Date;

    const offset = targetDate.getTime() - NativeDate.now();
    localStorage.setItem(STORAGE_KEY, offset.toString());

    window.location.reload();
};

export const disableTimeTravel = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
};

export const initTimeMachine = () => {
    // Logic moved to inline script in layout.tsx for hydration safety.
    // This function is kept for compatibility with the widget but does nothing now.
};
