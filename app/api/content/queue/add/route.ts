import { NextRequest, NextResponse } from 'next/server';
import { id } from '@instantdb/admin';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getInstantAdminDb } from '@/lib/instant-admin';

export const dynamic = 'force-dynamic';

interface AddItemBody {
    categorySlug: string;
    title: string;
    richTextContent?: string;
    linkUrl?: string;
    durationMs?: number;
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

    let body: AddItemBody;
    try {
        body = (await request.json()) as AddItemBody;
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 },
        );
    }

    if (!body.categorySlug || !body.title) {
        return NextResponse.json(
            { error: 'categorySlug and title are required' },
            { status: 400 },
        );
    }

    try {
        const adminDb = getInstantAdminDb();

        // Look up category by slug
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

        // Compute next sort order
        const items = (category.items ?? []) as any[];
        const maxOrder = items.reduce(
            (max: number, item: any) =>
                Math.max(max, item.sortOrder ?? 0),
            0,
        );

        const now = new Date().toISOString();
        const itemId = id();

        await adminDb.transact(
            (adminDb.tx as any).contentQueueItems[itemId]
                .create({
                    title: body.title,
                    richTextContent: body.richTextContent ?? '',
                    linkUrl: body.linkUrl ?? '',
                    status: 'queued',
                    sortOrder: maxOrder + 1,
                    durationMs: body.durationMs ?? 0,
                    createdAt: now,
                    updatedAt: now,
                })
                .link({ category: category.id }),
        );

        return NextResponse.json(
            { id: itemId, status: 'queued', sortOrder: maxOrder + 1 },
            { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Failed to add content queue item', error);
        return NextResponse.json(
            { error: 'Failed to add item to queue' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
