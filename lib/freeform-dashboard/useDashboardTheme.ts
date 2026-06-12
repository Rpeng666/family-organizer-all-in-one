import { useCallback, useMemo } from 'react';
import { id as instantId } from '@instantdb/react';
import { db } from '@/lib/db';
import {
    DASHBOARD_THEME_SETTING_NAME,
    DEFAULT_DASHBOARD_THEME,
    isDashboardTheme,
    type DashboardTheme,
} from './dashboard-theme';

export function useDashboardTheme() {
    const { data, isLoading } = db.useQuery({
        settings: {
            $: { where: { name: DASHBOARD_THEME_SETTING_NAME } },
        },
    });

    const settingsRecord = useMemo(
        () => ((data?.settings ?? []) as any[])[0] ?? null,
        [data?.settings],
    );

    const theme: DashboardTheme = useMemo(() => {
        const raw = settingsRecord?.value;
        return typeof raw === 'string' && isDashboardTheme(raw)
            ? raw
            : DEFAULT_DASHBOARD_THEME;
    }, [settingsRecord]);

    const setTheme = useCallback(
        (newTheme: DashboardTheme) => {
            const recordId = settingsRecord?.id ?? instantId();
            db.transact(
                (db.tx as any).settings[recordId].update({
                    name: DASHBOARD_THEME_SETTING_NAME,
                    value: newTheme,
                }),
            );
        },
        [settingsRecord],
    );

    return { theme, setTheme, isLoading };
}
