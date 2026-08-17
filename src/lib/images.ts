/**
 * Server-side image validation for images stored in Postgres.
 *
 * Images are compressed in the browser (see src/lib/imageCompress.ts) and sent
 * as base64 data URLs in the JSON body. The server must NEVER trust that, so
 * everything is re-validated here:
 *
 *  1. Size ceiling (1MB), enforced on the DECODED bytes, not the base64 text.
 *  2. MIME allow-list.
 *  3. Magic-byte sniffing, so a declared "image/png" that is really something
 *     else is rejected. SVG is deliberately NOT allowed: it can carry <script>
 *     and would be an XSS vector when served back to a browser.
 */

/** Hard ceiling on stored image size. */
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB

/** Raster formats only. SVG is excluded on purpose (script injection risk). */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export interface DecodedImage {
  buffer: Buffer;
  mimeType: AllowedImageMime;
  bytes: number;
}

/** Raised for any invalid upload. Carries an HTTP status for the route. */
export class ImageValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ImageValidationError';
    this.status = status;
  }
}

/** Identify a format from its leading bytes. Returns null when unrecognised. */
export function sniffMimeType(buffer: Buffer): AllowedImageMime | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => buffer[i] === b)) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Decode and fully validate a base64 data URL.
 *
 * @param dataUrl e.g. "data:image/jpeg;base64,/9j/4AAQ..."
 * @throws ImageValidationError with a message that is safe to show the user.
 */
export function decodeImageDataUrl(dataUrl: unknown): DecodedImage {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new ImageValidationError('No image data supplied.');
  }

  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new ImageValidationError(
      'Image must be a base64 data URL, e.g. data:image/jpeg;base64,...',
    );
  }

  const declaredMime = match[1].toLowerCase();
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(declaredMime)) {
    throw new ImageValidationError(
      `Unsupported image type "${declaredMime}". Allowed: ${ALLOWED_IMAGE_MIME.join(', ')}.`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw new ImageValidationError('Image data is not valid base64.');
  }

  if (buffer.length === 0) {
    throw new ImageValidationError('Image data is empty.');
  }

  // Enforce the ceiling on DECODED bytes. base64 inflates by ~33%, so checking
  // the string length would reject valid images and accept oversized ones.
  if (buffer.length > MAX_IMAGE_BYTES) {
    const kb = Math.round(buffer.length / 1024);
    throw new ImageValidationError(
      `Image is ${kb}KB, which exceeds the 1MB limit. Please choose a smaller image.`,
      413,
    );
  }

  const actualMime = sniffMimeType(buffer);
  if (!actualMime) {
    throw new ImageValidationError('File does not appear to be a JPEG, PNG, or WebP image.');
  }
  if (actualMime !== declaredMime) {
    // Declared type does not match the real bytes: treat as hostile.
    throw new ImageValidationError(
      `Image content (${actualMime}) does not match its declared type (${declaredMime}).`,
    );
  }

  return { buffer, mimeType: actualMime, bytes: buffer.length };
}

/**
 * Convert a stored bytea value back into a data URL for JSON responses.
 * Returns null when there is no image, so callers can fall back to a URL field.
 */
export function toDataUrl(
  photo: Buffer | Uint8Array | null | undefined,
  mimeType?: string | null,
): string | null {
  if (!photo) return null;
  const buf = Buffer.isBuffer(photo) ? photo : Buffer.from(photo);
  if (buf.length === 0) return null;
  const mime =
    mimeType && (ALLOWED_IMAGE_MIME as readonly string[]).includes(mimeType)
      ? mimeType
      : sniffMimeType(buf) || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
