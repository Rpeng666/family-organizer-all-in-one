import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(
        {
            ok: true,
            service: 'family-organizer',
            timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
