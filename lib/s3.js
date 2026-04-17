import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client;

export function isS3Configured() {
  return Boolean(
    process.env.AWS_S3_BUCKET &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function getS3Client() {
  if (!isS3Configured()) return null;
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

export function bucketName() {
  return process.env.AWS_S3_BUCKET;
}

/** Public or CDN base URL for objects (no trailing slash). If unset, use presigned GET URLs. */
export function publicBaseUrl() {
  const base = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_S3_PUBLIC_BASE_URL;
  return (base || '').replace(/\/$/, '');
}

export function objectPublicUrl(key) {
  const base = publicBaseUrl();
  if (base) return `${base}/${key.replace(/^\//, '')}`;
  return null;
}

export async function presignedPut(key, contentType, expiresIn = 3600) {
  const s3 = getS3Client();
  if (!s3) throw new Error('S3 not configured');
  const cmd = new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function presignedGet(key, expiresIn = 3600) {
  const s3 = getS3Client();
  if (!s3) throw new Error('S3 not configured');
  const cmd = new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function deleteObject(key) {
  const s3 = getS3Client();
  if (!s3) throw new Error('S3 not configured');
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName(),
      Key: key,
    })
  );
}
