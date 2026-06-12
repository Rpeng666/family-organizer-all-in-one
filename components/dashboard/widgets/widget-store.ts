import type { WidgetRegistration } from './types';

const widgetRegistry = new Map<string, WidgetRegistration>();

export function registerWidget(registration: WidgetRegistration): void {
    widgetRegistry.set(registration.meta.id, registration);
}

export function getWidget(id: string): WidgetRegistration | undefined {
    return widgetRegistry.get(id);
}

export function getAllWidgets(): WidgetRegistration[] {
    return Array.from(widgetRegistry.values());
}

export function getDefaultWidgetOrder(): string[] {
    return getAllWidgets()
        .filter((w) => w.meta.defaultEnabled)
        .sort((a, b) => a.meta.defaultOrder - b.meta.defaultOrder)
        .map((w) => w.meta.id);
}

export function getDefaultDisabledWidgets(): string[] {
    return getAllWidgets()
        .filter((w) => !w.meta.defaultEnabled)
        .map((w) => w.meta.id);
}
