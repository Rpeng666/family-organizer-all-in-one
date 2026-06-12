'use client';

import React from 'react';
import Link from 'next/link';

interface DashboardSectionHeaderProps {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    href: string;
    countLabel: string;
}

export function DashboardSectionHeader({ icon: Icon, title, href, countLabel }: DashboardSectionHeaderProps) {
    return (
        <div className="flex h-7 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <p
                    className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70"
                    style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}
                >
                    {title}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground/50 sm:inline">{countLabel}</span>
                <Link
                    href={href}
                    className="text-[11px] text-muted-foreground/60 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                    View all
                </Link>
            </div>
        </div>
    );
}
