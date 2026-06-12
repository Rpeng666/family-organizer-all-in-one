'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { LoginModal } from './LoginModal';
import { useParentMode } from '@/components/auth/useParentMode';
import { getPhotoUrl } from '@/lib/photo-urls';

export function UserMenu() {
    const { currentUser, logout } = useAuth();
    const { isParentMode, isParentSessionSharedDevice, parentSharedDeviceIdleTimeoutMs } = useParentMode();
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    const handleSwitchUser = () => {
        setIsLoginOpen(true);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="relative h-10 w-10 rounded-full"
                        aria-label={currentUser ? 'Open user menu' : 'Open login menu'}
                    >
                        <Avatar className="h-9 w-9 border">
                            <AvatarImage src={getPhotoUrl(currentUser?.photoUrls, '64')} />
                            <AvatarFallback>{currentUser ? currentUser.name.charAt(0) : <User className="h-5 w-5" />}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    {currentUser ? (
                        <>
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                                    <p className="text-xs leading-none text-muted-foreground capitalize">{currentUser.role || 'Family Member'}</p>
                                    {isParentMode && (
                                        <p className="text-xs leading-none text-amber-600">
                                            Parent mode{isParentSessionSharedDevice ? ' (shared device)' : ''}
                                        </p>
                                    )}
                                    {isParentMode && isParentSessionSharedDevice && (
                                        <p className="text-[11px] leading-none text-muted-foreground">
                                            Auto-expires after {Math.round(parentSharedDeviceIdleTimeoutMs / 60000)} min idle
                                        </p>
                                    )}
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSwitchUser}>
                                <User className="mr-2 h-4 w-4" />
                                <span>Switch User</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </>
                    ) : (
                        <>
                            <DropdownMenuLabel>Guest Access</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setIsLoginOpen(true)}>
                                <LogIn className="mr-2 h-4 w-4" />
                                <span>Log in</span>
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </>
    );
}
