// components/ui/RestrictedButton.tsx
'use client';

import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface RestrictedButtonProps extends ButtonProps {
    isRestricted: boolean;
    restrictionMessage: string;
}

/**
 * A button that appears disabled (opacity/grayscale) when restricted,
 * but remains clickable to show a toast message explaining why.
 */
export const RestrictedButton = React.forwardRef<HTMLButtonElement, RestrictedButtonProps>(
    ({ isRestricted, restrictionMessage, className, onClick, children, ...props }, ref) => {
        const { toast } = useToast();

        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (isRestricted) {
                e.preventDefault();
                e.stopPropagation();
                toast({
                    title: 'Access Denied',
                    description: restrictionMessage,
                    variant: 'destructive',
                });
                return;
            }
            if (onClick) {
                onClick(e);
            }
        };

        return (
            <Button
                ref={ref}
                onClick={handleClick}
                className={cn(isRestricted && 'opacity-50 grayscale cursor-not-allowed hover:bg-primary/50', className)}
                {...props}
            >
                {children}
            </Button>
        );
    }
);
RestrictedButton.displayName = 'RestrictedButton';
