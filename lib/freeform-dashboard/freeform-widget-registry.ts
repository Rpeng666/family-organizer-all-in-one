import type { FreeformWidgetMeta, FreeformWidgetRegistration } from './types';

const registry = new Map<string, FreeformWidgetRegistration>();

export function registerFreeformWidget(registration: FreeformWidgetRegistration) {
    registry.set(registration.meta.type, registration);
}

export function getFreeformWidget(type: string): FreeformWidgetRegistration | undefined {
    return registry.get(type);
}

export function getAllFreeformWidgets(): FreeformWidgetRegistration[] {
    return Array.from(registry.values());
}

export function getFreeformWidgetMeta(type: string): FreeformWidgetMeta | undefined {
    return registry.get(type)?.meta;
}
