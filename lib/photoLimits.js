/** Default plan: one gallery per event, up to 200 media items. */
export const MAX_EVENT_PHOTOS = 200;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
export const ALLOWED_MEDIA_TYPES = new Set([...ALLOWED_PHOTO_TYPES, ...ALLOWED_VIDEO_TYPES]);

export function isAllowedMediaType(contentType) {
  return ALLOWED_MEDIA_TYPES.has(String(contentType || '').toLowerCase());
}

export function isVideoType(contentType) {
  return String(contentType || '').toLowerCase().startsWith('video/');
}

export function maxBytesForContentType(contentType) {
  return isVideoType(contentType) ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
}
