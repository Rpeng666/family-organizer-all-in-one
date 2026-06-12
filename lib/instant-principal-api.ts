export async function fetchPrincipalToken(url: string, init?: RequestInit) {
    const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        ...init,
    });

    let payload: any = null;
    try {
        payload = await response.json();
    } catch {}

    if (!response.ok) {
        const error = new Error(payload?.error || `Token endpoint failed with ${response.status}`);
        (error as any).status = response.status;
        (error as any).code = payload?.code;
        throw error;
    }

    if (!payload?.token || typeof payload.token !== 'string') {
        throw new Error('Token endpoint returned an invalid response');
    }

    return payload.token as string;
}
