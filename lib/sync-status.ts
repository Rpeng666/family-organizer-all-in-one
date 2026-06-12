type BadgePresentation = {
    label: string;
    className: string;
    icon: 'cloud' | 'cloud-off' | 'refresh';
    spinning?: boolean;
};

export function getSyncBadgePresentation(params: { online: boolean; instantStatus: string }): BadgePresentation {
    if (!params.online) {
        return {
            label: 'Offline',
            className: 'border-amber-300/70 bg-amber-50 text-amber-700',
            icon: 'cloud-off',
        };
    }

    if (params.instantStatus === 'authenticated') {
        return {
            label: 'Synced',
            className: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
            icon: 'cloud',
        };
    }

    if (params.instantStatus === 'connecting' || params.instantStatus === 'opened') {
        return {
            label: 'Syncing',
            className: 'border-sky-300/70 bg-sky-50 text-sky-700',
            icon: 'refresh',
            spinning: true,
        };
    }

    return {
        label: 'Reconnecting',
        className: 'border-orange-300/70 bg-orange-50 text-orange-700',
        icon: 'refresh',
        spinning: true,
    };
}

export type { BadgePresentation as SyncBadgePresentation };
