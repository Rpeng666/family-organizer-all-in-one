'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type RecurrenceEditScope = 'single' | 'following' | 'all' | 'cancel';
export type RecurrenceSeriesScopeMode = 'all' | 'following';

interface RecurrenceScopeDialogProps {
    open: boolean;
    action: 'edit' | 'drag' | 'delete';
    scopeMode?: RecurrenceSeriesScopeMode;
    onSelect: (scope: RecurrenceEditScope) => void;
}

export function RecurrenceScopeDialog({ open, action, scopeMode = 'following', onSelect }: RecurrenceScopeDialogProps) {
    const title = action === 'drag' ? 'Move Repeating Event' : action === 'delete' ? 'Delete Repeating Event' : 'Edit Repeating Event';
    const secondScope = scopeMode;
    const description = (() => {
        if (action === 'drag') {
            return scopeMode === 'all'
                ? 'Choose whether this move applies only to this occurrence, or to all events in the series.'
                : 'Choose whether this move applies only to this occurrence, or to this and all following occurrences.';
        }
        if (action === 'delete') {
            return scopeMode === 'all'
                ? 'Choose whether this deletion applies only to this occurrence, or to all events in the series.'
                : 'Choose whether this deletion applies only to this occurrence, or to this and all following occurrences.';
        }
        return scopeMode === 'all'
            ? 'Choose whether your changes apply only to this occurrence, or to all events in the series.'
            : 'Choose whether your changes apply only to this occurrence, or to this and all following occurrences.';
    })();
    const secondaryLabel =
        action === 'delete'
            ? scopeMode === 'all'
                ? 'All events'
                : 'This and all following events'
            : scopeMode === 'all'
              ? 'All events'
              : 'This and following events';

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onSelect('cancel');
                }
            }}
        >
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => onSelect('cancel')}>
                        Cancel
                    </Button>
                    <Button type="button" variant="outline" onClick={() => onSelect('single')}>
                        Only this event
                    </Button>
                    <Button type="button" onClick={() => onSelect(secondScope)}>
                        {secondaryLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
