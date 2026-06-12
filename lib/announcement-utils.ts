// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactFn = (txs: any[]) => void;

/**
 * Check for expired announcements and deactivate them.
 * Called lazily on widget render — idempotent.
 */
export function checkAnnouncementExpiry(
    announcements: any[],
    now: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    transact: TransactFn,
): void {
    const expiredTxs: any[] = [];

    for (const ann of announcements) {
        if (ann.isActive && ann.expiresAt && new Date(ann.expiresAt) <= now) {
            expiredTxs.push(
                tx.announcements[ann.id].update({
                    isActive: false,
                    archivedAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                }),
            );
        }
    }

    if (expiredTxs.length > 0) {
        transact(expiredTxs);
    }
}

/**
 * Get active announcements sorted by creation date (newest first).
 */
export function getActiveAnnouncements(announcements: any[]): any[] {
    return announcements
        .filter((a) => a.isActive)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
        );
}

/**
 * Get archived/expired announcements sorted by archivedAt descending.
 */
export function getArchivedAnnouncements(announcements: any[]): any[] {
    return announcements
        .filter((a) => !a.isActive)
        .sort(
            (a, b) =>
                new Date(b.archivedAt ?? b.createdAt).getTime() -
                new Date(a.archivedAt ?? a.createdAt).getTime(),
        );
}
