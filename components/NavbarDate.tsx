// components/NavbarDate.tsx
'use client';

import React, { useEffect, useState } from 'react';

export const NavbarDate = () => {
    const [dateStr, setDateStr] = useState<string | null>(null);

    useEffect(() => {
        // This runs on the client, so it will pick up any window.Date patches (Time Machine)
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        };
        setDateStr(now.toLocaleDateString('en-US', options));
    }, []);

    // Return null on server/first render to avoid hydration mismatch
    if (!dateStr) return null;

    return (
        <span className="text-[11px] text-muted-foreground px-3 tracking-wide leading-relaxed" style={{ fontFamily: 'var(--font-garamond, serif)' }}>
            {dateStr}
        </span>
    );
};

export default NavbarDate;
