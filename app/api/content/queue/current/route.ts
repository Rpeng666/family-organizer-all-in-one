import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getInstantAdminDb } from '@/lib/instant-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json(
            { error: 'Unauthorized device', reason },
            { status: 401 },
        );
    }

    const categorySlug = request.nextUrl.searchParams.get('category');
    if (!categorySlug) {
        return NextResponse.json(
            { error: 'category query parameter is required' },
            { status: 400 },
        );
    }

    try {
        const adminDb = getInstantAdminDb();

        const result = await adminDb.query({
            contentCategories: {
                $: { where: { slug: categorySlug } },
                items: {
                    $: { where: { status: 'live' } },
                    attachments: {},
                },
            },
        });

        const categories = result.contentCategories as any[];
        const category = categories[0];
        if (!category) {
            return NextResponse.json(
                { error: `Category not found: ${categorySlug}` },
                { status: 404 },
            );
        }

        const liveItem =
            (category.items ?? []).find(
                (i: any) => i.status === 'live',
            ) ?? null;

        return NextResponse.json(
            {
                category: {
                    id: category.id,
                    name: category.name,
                    slug: category.slug,
                },
                currentItem: liveItem,
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Failed to get current content queue item', error);
        return NextResponse.json(
            { error: 'Failed to get current item' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
