// lib/auth-utils.ts
import { toast } from '@/components/ui/use-toast';

/**
 * Checks if the current user has permission to manage the target member's resources.
 * Shows a toast if access is denied.
 * * Rules:
 * 1. Parents can do everything.
 * 2. Members can manage their own resources (self).
 * 3. Otherwise denied.
 * * @param currentUser The currently logged-in user object
 * @param targetMemberId The ID of the member whose resource is being accessed
 * @param targetMemberName The name of the member (for the toast message)
 * @returns true if allowed, false if denied
 */
export function validateRestriction(currentUser: any, targetMemberId: string | null, targetMemberName: string): boolean {
    if (!currentUser) {
        toast({ title: 'Access Denied', description: 'You must be logged in to perform this action.', variant: 'destructive' });
        return false;
    }

    // Rule 1: Parent Override
    if (currentUser.role === 'parent') return true;

    // Rule 2: Self Management
    if (targetMemberId && currentUser.id === targetMemberId) return true;

    // Denied
    toast({
        title: 'Access Denied',
        description: `You need to be logged in as ${targetMemberName} or a parent to use this function.`,
        variant: 'destructive',
    });
    return false;
}
