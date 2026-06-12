// components/auth/LoginModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useInstantPrincipal } from '@/components/InstantFamilySessionProvider';
import { useToast } from '@/components/ui/use-toast';
import { getPhotoUrl } from '@/lib/photo-urls';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type RosterMember = {
    id: string;
    name: string;
    role?: string | null;
    photoUrls?: Record<string, string> | null;
    hasPin?: boolean;
};

async function fetchFamilyMemberRoster() {
    const response = await fetch('/api/family-members', {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load family members');
    }
    return (payload?.familyMembers as RosterMember[]) || [];
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const { login } = useAuth();
    const { toast } = useToast();
    const { canUseCachedParentPrincipal, isParentSessionSharedDevice, signInFamilyMember } = useInstantPrincipal();
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [pin, setPin] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [parentSharedDevice, setParentSharedDevice] = useState(true);
    const [familyMembers, setFamilyMembers] = useState<RosterMember[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [membersError, setMembersError] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                document.body.style.pointerEvents = '';
            }, 0);
            return () => clearTimeout(timer);
        }

        document.body.style.pointerEvents = 'auto';
        return () => {
            document.body.style.pointerEvents = 'auto';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedMemberId(null);
        setPin('');
        setIsVerifying(false);
        setRememberMe(false);
        setParentSharedDevice(isParentSessionSharedDevice);
        setMembersError('');
        setIsLoadingMembers(true);

        let cancelled = false;
        void fetchFamilyMemberRoster()
            .then((members) => {
                if (!cancelled) {
                    setFamilyMembers(members);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setMembersError(error instanceof Error ? error.message : 'Failed to load family members');
                    setFamilyMembers([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingMembers(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, isParentSessionSharedDevice]);

    const selectedMemberData = useMemo(
        () => familyMembers.find((member) => member.id === selectedMemberId) || null,
        [familyMembers, selectedMemberId]
    );
    const isParentSelection = selectedMemberData?.role === 'parent';
    const parentPinCanBeSkipped = Boolean(isParentSelection && canUseCachedParentPrincipal);
    const loginButtonDisabled = isVerifying || (Boolean(selectedMemberData?.hasPin || isParentSelection) && !pin && !parentPinCanBeSkipped);

    const handleMemberSelect = (id: string) => {
        setSelectedMemberId(id);
        setPin('');
        setRememberMe(false);
        setParentSharedDevice(isParentSessionSharedDevice);
    };

    const handlePinSubmit = async (event?: React.FormEvent) => {
        if (event) event.preventDefault();
        if (!selectedMemberId) return;

        const member = familyMembers.find((entry) => entry.id === selectedMemberId);
        if (!member) return;

        setIsVerifying(true);
        try {
            if (member.role === 'parent' && !parentPinCanBeSkipped && typeof navigator !== 'undefined' && navigator.onLine === false) {
                toast({
                    title: 'Internet required for parent mode',
                    description: 'Parent sign-in needs a server check. Try again when this device is back online.',
                    variant: 'destructive',
                });
                return;
            }

            await signInFamilyMember({
                familyMemberId: member.id,
                pin,
                sharedDevice: member.role === 'parent' ? parentSharedDevice : undefined,
            });

            login(
                {
                    id: member.id,
                    name: member.name,
                    role: member.role || 'child',
                    photoUrls: member.photoUrls || null,
                },
                rememberMe
            );
            toast({ title: `Welcome back, ${member.name}!` });
            onClose();
        } catch (error) {
            console.error('Login error', error);
            toast({
                title: 'Error logging in',
                description: error instanceof Error ? error.message : 'Please try again.',
                variant: 'destructive',
            });
            setPin('');
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{selectedMemberId ? `Welcome, ${selectedMemberData?.name}` : 'Who are you?'}</DialogTitle>
                    <DialogDescription>
                        {selectedMemberId
                            ? parentPinCanBeSkipped
                                ? 'Parent mode is already unlocked on this device.'
                                : 'Enter your PIN to continue.'
                            : 'Select your profile to log in.'}
                    </DialogDescription>
                </DialogHeader>

                {isLoadingMembers ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : membersError ? (
                    <div className="space-y-4 py-4">
                        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{membersError}</p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setMembersError('');
                                setIsLoadingMembers(true);
                                void fetchFamilyMemberRoster()
                                    .then((members) => setFamilyMembers(members))
                                    .catch((error) => setMembersError(error instanceof Error ? error.message : 'Failed to load family members'))
                                    .finally(() => setIsLoadingMembers(false));
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                ) : (
                    <div className="py-4">
                        {!selectedMemberId ? (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                {familyMembers.map((member) => (
                                    <button
                                        key={member.id}
                                        onClick={() => handleMemberSelect(member.id)}
                                        className="flex flex-col items-center rounded-lg p-4 transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <Avatar className="mb-2 h-20 w-20 border-2 border-transparent hover:border-primary">
                                            <AvatarImage src={getPhotoUrl(member.photoUrls, '320')} />
                                            <AvatarFallback className="text-xl">{member.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-center text-sm font-medium">{member.name}</span>
                                        <span className="mt-1 text-center text-xs text-muted-foreground">
                                            {member.role === 'parent' ? 'Parent' : member.hasPin ? 'PIN required' : 'Tap to enter'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="mb-4 flex justify-center">
                                    <Avatar className="h-24 w-24">
                                        <AvatarImage src={getPhotoUrl(selectedMemberData?.photoUrls, '320')} />
                                        <AvatarFallback className="text-2xl">{selectedMemberData?.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                </div>

                                <form onSubmit={handlePinSubmit} className="space-y-4">
                                    <div className="flex justify-center">
                                        <Input
                                            type="password"
                                            inputMode="numeric"
                                            autoFocus
                                            placeholder={parentPinCanBeSkipped ? 'PIN optional on this device' : 'Enter PIN'}
                                            value={pin}
                                            onChange={(event) => setPin(event.target.value)}
                                            disabled={isVerifying}
                                            className="max-w-[220px] text-center text-lg tracking-[0.4em]"
                                        />
                                    </div>

                                    {isParentSelection ? (
                                        <div className="flex items-start justify-center gap-3 rounded-xl border bg-slate-50 px-4 py-3">
                                            <Checkbox
                                                id="shared-device"
                                                checked={parentSharedDevice}
                                                onCheckedChange={(checked) => setParentSharedDevice(Boolean(checked))}
                                            />
                                            <div className="space-y-1">
                                                <Label htmlFor="shared-device" className="font-semibold">
                                                    Shared device mode
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Parent access auto-locks after inactivity when enabled.
                                                </p>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="remember-me"
                                                checked={rememberMe}
                                                onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                                            />
                                            <Label htmlFor="remember-me">Remember me on this browser</Label>
                                        </div>
                                    </div>

                                    <div className="flex justify-between gap-3">
                                        <Button type="button" variant="ghost" onClick={() => setSelectedMemberId(null)} disabled={isVerifying}>
                                            <ArrowLeft className="mr-2 h-4 w-4" />
                                            Back
                                        </Button>
                                        <Button type="submit" disabled={loginButtonDisabled}>
                                            {isVerifying ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Signing in...
                                                </>
                                            ) : (
                                                'Continue'
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
