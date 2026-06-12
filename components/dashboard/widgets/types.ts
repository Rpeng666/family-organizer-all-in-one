import type { LucideIcon } from 'lucide-react';

export type WidgetSize = {
    colSpan: 1 | 2 | 3;
};

export interface WidgetMeta {
    id: string;
    label: string;
    icon: LucideIcon;
    defaultSize: WidgetSize;
    defaultEnabled: boolean;
    defaultOrder: number;
    /** If true, widget is always shown and cannot be disabled */
    required?: boolean;
    /** Description shown in settings panel */
    description?: string;
}

export interface WidgetProps {
    memberId: string;
    todayUtc: Date;
}

export interface WidgetRegistration {
    meta: WidgetMeta;
    component: React.ComponentType<WidgetProps>;
}
