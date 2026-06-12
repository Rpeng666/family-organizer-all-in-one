import 'server-only';

import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getS3ObjectDownload } from '@/lib/s3-file-service';

const DEFAULT_FILE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

function toWebStream(body: any): ReadableStream<Uint8Array> {
    if (!body) {
        throw new Error('File body missing');
    }

    if (typeof body.transformToWebStream === 'function') {
        return body.transformToWebStream() as ReadableStream<Uint8Array>;
    }

    if (body instanceof Readable) {
        return Readable.toWeb(body) as ReadableStream<Uint8Array>;
    }

    if (typeof body[Symbol.asyncIterator] === 'function') {
        return Readable.toWeb(Readable.from(body)) as ReadableStream<Uint8Array>;
    }

    throw new Error('Unsupported file body');
}

function resolveCacheControl(cacheControl: string | undefined) {
    if (typeof cacheControl === 'string' && cacheControl.trim()) {
        return cacheControl;
    }
    return DEFAULT_FILE_CACHE_CONTROL;
}

export async function createS3FileResponse(key: string) {
    const object = await getS3ObjectDownload(key);
    const body = toWebStream(object.Body);
    const headers = new Headers();

    headers.set('Cache-Control', resolveCacheControl(object.CacheControl));
    headers.set('Content-Type', object.ContentType || 'application/octet-stream');

    if (typeof object.ContentLength === 'number' && Number.isFinite(object.ContentLength)) {
        headers.set('Content-Length', String(object.ContentLength));
    }
    if (object.ContentDisposition) {
        headers.set('Content-Disposition', object.ContentDisposition);
    }
    if (object.ETag) {
        headers.set('ETag', object.ETag);
    }
    if (object.LastModified) {
        headers.set('Last-Modified', object.LastModified.toUTCString());
    }

    return new NextResponse(body, {
        status: 200,
        headers,
    });
}
