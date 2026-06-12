'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import { LoginModal } from '@/components/auth/LoginModal';

export function FamilyAppGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated, isLoading } = useAuth();
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    const isPublicRoute = pathname === '/activate';

    useEffect(() => {
        if (isPublicRoute) return;
        if (isLoading) return;
        if (!isAuthenticated) {
            setIsLoginOpen(true);
        }
    }, [isAuthenticated, isLoading, isPublicRoute]);

    if (isPublicRoute) {
        return <>{children}</>;
    }

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <>
                <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
                    <LockKeyhole className="h-16 w-16 text-slate-300" />
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold text-slate-900">Choose a family member to continue</h1>
                        <p className="max-w-md text-sm text-slate-500">
                            This device needs an active family member session before the organizer can load live family data.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button type="button" onClick={() => setIsLoginOpen(true)}>
                            Open Login
                        </Button>
                        <Button type="button" variant="outline" asChild>
                            <Link href="/activate">Device Activation</Link>
                        </Button>
                    </div>
                </div>
                <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
            </>
        );
    }

    return <>{children}</>;
}
