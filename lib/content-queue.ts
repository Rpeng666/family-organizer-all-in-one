// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactFn = (txs: any[]) => void;

/**
 * Returns transactions to archive a live item and promote the next queued item.
 * Called lazily on widget render — idempotent across concurrent clients.
 */
export function buildAdvanceTransactions(
    items: any[],
    category: any,
    now: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
): any[] {
    const txs: any[] = [];

    const liveItem = items.find((i) => i.status === 'live');

    if (liveItem) {
        if (!liveItem.liveUntil || new Date(liveItem.liveUntil) > now) {
            return []; // still live, nothing to do
        }
        // Archive expired item
        txs.push(
            tx.contentQueueItems[liveItem.id].update({
                status: 'archived',
                archivedAt: now.toISOString(),
                updatedAt: now.toISOString(),
            }),
        );
    }

    // Promote next queued item
    let queued = items
        .filter((i) => i.status === 'queued')
        .sort((a, b) => a.sortOrder - b.sortOrder);

    // If no queued items and looping is enabled, re-queue all archived items
    if (queued.length === 0 && category.loopWhenEmpty) {
        const archived = items
            .filter((i) => i.status === 'archived' || (liveItem && i.id === liveItem.id))
            .filter((i) => !liveItem || i.id !== liveItem.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);

        for (const item of archived) {
            txs.push(
                tx.contentQueueItems[item.id].update({
                    status: 'queued',
                    liveAt: '',
                    liveUntil: '',
                    archivedAt: '',
                    updatedAt: now.toISOString(),
                }),
            );
        }

        queued = archived;
    }

    const nextQueued = queued[0];

    if (nextQueued) {
        const duration = nextQueued.durationMs ?? category.defaultDurationMs;
        const liveUntil = new Date(now.getTime() + duration).toISOString();
        txs.push(
            tx.contentQueueItems[nextQueued.id].update({
                status: 'live',
                liveAt: now.toISOString(),
                liveUntil,
                updatedAt: now.toISOString(),
            }),
        );
    }

    return txs;
}

/**
 * Check if the current live item has expired and advance the queue.
 * Designed to be called on every widget render.
 */
export function checkAndAdvanceCategory(
    items: any[],
    category: any,
    now: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    transact: TransactFn,
): void {
    const txs = buildAdvanceTransactions(items, category, now, tx);
    if (txs.length > 0) {
        transact(txs);
    }
}

/**
 * Get the next sort order value for a new queue item.
 */
export function getNextSortOrder(items: any[]): number {
    const maxOrder = items.reduce(
        (max: number, item: any) => Math.max(max, item.sortOrder ?? 0),
        0,
    );
    return maxOrder + 1;
}

/**
 * Get the currently live item from a list of items.
 */
export function getLiveItem(items: any[]): any | undefined {
    return items.find((i) => i.status === 'live');
}

/**
 * Get queued items sorted by sortOrder.
 */
export function getQueuedItems(items: any[]): any[] {
    return items
        .filter((i) => i.status === 'queued')
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get archived items sorted by archivedAt descending.
 */
export function getArchivedItems(items: any[]): any[] {
    return items
        .filter((i) => i.status === 'archived')
        .sort(
            (a, b) =>
                new Date(b.archivedAt ?? 0).getTime() -
                new Date(a.archivedAt ?? 0).getTime(),
        );
}
