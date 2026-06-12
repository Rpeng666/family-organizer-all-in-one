import { init } from '@instantdb/react';

// export const { db, tx } = init({ appId: 'YOUR_APP_ID' });

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

export const db = init({
    appId: APP_ID,
    ...connectionConfig,
});
