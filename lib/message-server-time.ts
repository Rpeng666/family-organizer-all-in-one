export type MessageServerTimeAnchor = {
    serverNowMs: number;
    clientMonotonicMs: number;
};

export function getMonotonicNowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

export function createMessageServerTimeAnchor(
    serverNow: string | null | undefined,
    clientMonotonicMs = getMonotonicNowMs()
): MessageServerTimeAnchor | null {
    const serverNowMs = new Date(serverNow || '').getTime();
    if (!Number.isFinite(serverNowMs)) {
        return null;
    }
    return {
        serverNowMs,
        clientMonotonicMs,
    };
}

export function getMessageServerNowMs(
    anchor: MessageServerTimeAnchor | null | undefined,
    clientMonotonicMs = getMonotonicNowMs(),
    fallbackNowMs = Date.now()
) {
    if (!anchor || !Number.isFinite(anchor.serverNowMs) || !Number.isFinite(anchor.clientMonotonicMs)) {
        return fallbackNowMs;
    }
    return anchor.serverNowMs + Math.max(0, clientMonotonicMs - anchor.clientMonotonicMs);
}
