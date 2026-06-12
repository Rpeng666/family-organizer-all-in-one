// lib/db.ts
'use client';

import { init } from '@instantdb/react';
import schema from '@/instant.schema';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!APP_ID) {
    throw new Error('NEXT_PUBLIC_INSTANT_APP_ID is not defined');
}

const connectionConfig =
    process.env.NEXT_PUBLIC_INSTANT_API_URI && process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI
        ? {
              apiURI: process.env.NEXT_PUBLIC_INSTANT_API_URI,
              websocketURI: process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI,
          }
        : {};

const db = init({
    appId: APP_ID,
    schema, // gives us typed queries / tx
    ...connectionConfig,
});

export { db };
