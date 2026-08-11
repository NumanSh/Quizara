const VIDEO_MEDIA_PATTERN = /\.(mp4|webm|ogv|ogg|m4v|mov)(?:[?#].*)?$/i;
const ANIMATED_IMAGE_PATTERN = /\.(gif|webp|avif)(?:[?#].*)?$/i;

export function isVideoMediaUrl(url: string): boolean {
  const value = url.trim();
  return value.startsWith("data:video/") || VIDEO_MEDIA_PATTERN.test(value);
}

export function isPotentiallyAnimatedMediaUrl(url: string): boolean {
  const value = url.trim();
  return isVideoMediaUrl(value) || ANIMATED_IMAGE_PATTERN.test(value);
}

export function isSafeMediaUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
