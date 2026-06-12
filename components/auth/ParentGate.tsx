// components/auth/ParentGate.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { LoginModal } from '@/components/auth/LoginModal';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParentMode } from '@/components/auth/useParentMode';

interface ParentGateProps {
    children: React.ReactNode;
}

export function ParentGate({ children }: ParentGateProps) {
    // +++ CHANGED: Consume isLoading from context +++
    const { currentUser, isAuthenticated, isLoading } = useAuth();
    const { isParentMode } = useParentMode();
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    // +++ CHANGED: Logic update.
    // Instead of a timer, we react to the loading state finishing.
    // If loading finishes and we aren't authorized, open the modal.
    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated || !isParentMode) {
                setIsLoginOpen(true);
            }
        }
    }, [isLoading, isAuthenticated, currentUser, isParentMode]);

    // +++ CHANGED: Show loader while AuthProvider is initializing or DB is fetching +++
    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isAuthenticated && isParentMode) {
        return <>{children}</>;
    }

    return (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center px-4">
            <ShieldAlert className="h-16 w-16 text-destructive/50" />
            <h2 className="text-2xl font-bold">Access Restricted</h2>
            <p className="text-muted-foreground max-w-md">
                This area is restricted to parents only. You cannot view this page unless you are logged in as a parent.
            </p>
            <Button onClick={() => setIsLoginOpen(true)} variant="outline">
                Open Login
            </Button>

            <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </div>
    );
}
