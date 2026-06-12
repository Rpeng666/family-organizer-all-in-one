import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getInstantAdminDb } from '@/lib/instant-admin';

export const dynamic = 'force-dynamic';

interface AdvanceBody {
    categorySlug: string;
}

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json(
            { error: 'Unauthorized device', reason },
            { status: 401 },
        );
    }

    let body: AdvanceBody;
    try {
        body = (await request.json()) as AdvanceBody;
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 },
        );
    }

    if (!body.categorySlug) {
        return NextResponse.json(
            { error: 'categorySlug is required' },
            { status: 400 },
        );
    }

    try {
        const adminDb = getInstantAdminDb();

        const result = await adminDb.query({
            contentCategories: {
                $: { where: { slug: body.categorySlug } },
                items: {},
            },
        });

        const categories = result.contentCategories as any[];
        const category = categories[0];
        if (!category) {
            return NextResponse.json(
                { error: `Category not found: ${body.categorySlug}` },
                { status: 404 },
            );
        }

        const items = (category.items ?? []) as any[];
        const now = new Date();
        const txs: any[] = [];

        // Archive the current live item
        const liveItem = items.find((i: any) => i.status === 'live');
        if (liveItem) {
            txs.push(
                (adminDb.tx as any).contentQueueItems[liveItem.id].update({
                    status: 'archived',
                    archivedAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                }),
            );
        }

        // Promote the next queued item
        const queued = items
            .filter((i: any) => i.status === 'queued')
            .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

        let promotedId: string | null = null;
        if (queued.length > 0) {
            const next = queued[0];
            const duration =
                (next.durationMs && next.durationMs > 0
                    ? next.durationMs
                    : null) ?? category.defaultDurationMs;
            const liveUntil = new Date(
                now.getTime() + duration,
            ).toISOString();
            txs.push(
                (adminDb.tx as any).contentQueueItems[next.id].update({
                    status: 'live',
                    liveAt: now.toISOString(),
                    liveUntil,
                    updatedAt: now.toISOString(),
                }),
            );
            promotedId = next.id;
        }

        if (txs.length > 0) {
            await adminDb.transact(txs);
        }

        return NextResponse.json(
            {
                advanced: true,
                archivedId: liveItem?.id ?? null,
                promotedId,
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Failed to advance content queue', error);
        return NextResponse.json(
            { error: 'Failed to advance queue' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
