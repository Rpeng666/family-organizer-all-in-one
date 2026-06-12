'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    CheckSquare,
    Timer,
    ListTodo,
    List,
    CalendarDays,
    MessageSquare,
    Wallet,
    DollarSign,
    BookOpen,
    Clock,
    Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/chores', label: 'Chores', icon: CheckSquare },
    { href: '/countdown', label: 'Countdown', icon: Timer },
    { href: '/tasks', label: 'Tasks', icon: ListTodo },
    { href: '/task-series', label: 'Task Series', icon: List },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/familyMemberDetail', label: 'Finance', icon: Wallet },
    { href: '/allowance-distribution', label: 'Allowance', icon: DollarSign },
    { href: '/content', label: 'Content', icon: BookOpen },
    { href: '/history', label: 'History', icon: Clock },
    { href: '/settings', label: 'Settings', icon: Settings },
] as const;

interface MainNavProps {
    className?: string;
    onNavigate?: () => void;
}

export function MainNav({ className, onNavigate }: MainNavProps) {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname.startsWith(href);
    };

    return (
        <nav className={cn('flex flex-col gap-0', className)}>
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        onClick={onNavigate}
                        data-testid={`main-nav-link-${label.toLowerCase().replace(/\s+/g, '-')}`}
                        className={cn(
                            'relative flex items-center gap-3.5 border-l-[2px] px-5 py-2.5 text-[13px] transition-all duration-300',
                            active
                                ? 'border-foreground/70 bg-accent/70 text-foreground'
                                : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground',
                        )}
                    >
                        <Icon
                            className={cn(
                                'h-3.5 w-3.5 shrink-0 transition-opacity duration-300',
                                active ? 'opacity-60' : 'opacity-40',
                            )}
                        />
                        <span
                            style={{
                                fontFamily: 'var(--font-garamond, Georgia, serif)',
                                letterSpacing: '0.03em',
                                fontWeight: active ? 500 : 400,
                            }}
                        >
                            {label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}


