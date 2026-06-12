import 'server-only';

import { createHash } from 'crypto';

export function buildNormalizedEventHash(event: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

export function buildInstantCalendarItemPayload(event: any, nowIso: string) {
    return {
        ...event,
        updatedAt: nowIso,
        sourceImportedAt: event.sourceImportedAt || nowIso,
        sourceLastSeenAt: nowIso,
        sourceRawHash: buildNormalizedEventHash(event),
    };
}
