import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({
    region: 'us-east-1', // MinIO requires a region, even if it's dummy
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true, // REQUIRED for local MinIO (or it tries to use DNS subdomains)
});
