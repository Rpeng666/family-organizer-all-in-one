export type DashboardTheme = 'light' | 'dark';

export const DEFAULT_DASHBOARD_THEME: DashboardTheme = 'light';

export const DASHBOARD_THEME_SETTING_NAME = 'dashboard_theme';

export interface DashboardThemeDefinition {
    id: DashboardTheme;
    label: string;
    description: string;
    /** Preview swatch colors: [canvas, panel, ink, accent] */
    previewColors: [string, string, string, string];
}

export const DASHBOARD_THEMES: DashboardThemeDefinition[] = [
    {
        id: 'light',
        label: 'Light',
        description: 'Clean white panels on a soft gray canvas',
        previewColors: ['#f1f3f8', '#ffffff', '#0e1c33', '#3b82f6'],
    },
    {
        id: 'dark',
        label: 'Dark',
        description: 'Deep dark canvas with subtle panel separation',
        previewColors: ['#08090f', '#111827', '#fafbff', '#8e8bff'],
    },
];

export function isDashboardTheme(value: string): value is DashboardTheme {
    return DASHBOARD_THEMES.some((t) => t.id === value);
}
