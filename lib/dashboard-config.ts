export interface DashboardConfig {
    widgetOrder: string[];
    disabledWidgets: string[];
    widgetSettings: Record<string, Record<string, unknown>>;
}

/**
 * Merge a stored config (from InstantDB) with the set of all known widget IDs.
 * - Removes stale widget IDs that no longer exist in the registry
 * - Appends newly-registered widgets at the end
 * - Falls back to defaults when no stored config exists
 */
export function resolveDashboardConfig(
    stored: Partial<DashboardConfig> | null | undefined,
    allWidgetIds: string[],
    defaultOrder: string[],
    defaultDisabled: string[]
): DashboardConfig {
    const knownIds = new Set(allWidgetIds);

    if (!stored?.widgetOrder?.length) {
        return {
            widgetOrder: defaultOrder,
            disabledWidgets: defaultDisabled,
            widgetSettings: stored?.widgetSettings ?? {},
        };
    }

    // Filter out stale IDs
    const existingOrder = stored.widgetOrder.filter((id) => knownIds.has(id));
    const existingSet = new Set(existingOrder);

    // Append any new widgets not in stored order
    const newWidgets = defaultOrder.filter((id) => !existingSet.has(id));

    return {
        widgetOrder: [...existingOrder, ...newWidgets],
        disabledWidgets: (stored.disabledWidgets || []).filter((id) => knownIds.has(id)),
        widgetSettings: stored.widgetSettings ?? {},
    };
}

export function getEnabledWidgetsInOrder(config: DashboardConfig): string[] {
    const disabled = new Set(config.disabledWidgets);
    return config.widgetOrder.filter((id) => !disabled.has(id));
}
