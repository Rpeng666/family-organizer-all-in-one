'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useParentMode } from '@/components/auth/useParentMode';
import { useDashboardViewMode } from '@/lib/dashboard-view-mode';

export const FREEFORM_EDIT_TOGGLE_EVENT = 'freeform-dashboard:toggle-edit';

export default function DashboardEditButton() {
    const pathname = usePathname();
    const { isParentMode } = useParentMode();
    const [viewMode] = useDashboardViewMode();
    const [editMode, setEditMode] = useState(false);

    // Listen for external state changes (e.g. when dashboard exits edit)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<boolean | undefined>).detail;
            if (typeof detail === 'boolean') {
                setEditMode(detail);
            }
        };
        window.addEventListener('freeform-dashboard:edit-state', handler);
        return () => window.removeEventListener('freeform-dashboard:edit-state', handler);
    }, []);

    // Reset edit mode when leaving family view
    useEffect(() => {
        if (viewMode !== 'family' || pathname !== '/') {
            setEditMode(false);
        }
    }, [viewMode, pathname]);

    const handleToggle = useCallback(() => {
        setEditMode((prev) => !prev);
        window.dispatchEvent(new CustomEvent(FREEFORM_EDIT_TOGGLE_EVENT));
    }, []);

    // Only show on dashboard route, in family view, when parent
    if (pathname !== '/' || viewMode !== 'family' || !isParentMode) {
        return null;
    }

    return (
        <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                editMode
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100'
            }`}
        >
            {editMode ? (
                <>
                    <Check size={14} />
                    Done
                </>
            ) : (
                <Pencil size={14} />
            )}
        </button>
    );
}
