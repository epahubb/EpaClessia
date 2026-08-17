/**
 * Browser-side image compression.
 *
 * WHY IN THE BROWSER
 * ------------------
 * Images are stored in Postgres with a hard 1MB ceiling, so they must be
 * compressed BEFORE upload. Doing it server-side would mean `sharp`, a native
 * libvips binary that is awkward on the Alpine/musl runtime image and adds tens
 * of megabytes to the build. The canvas API is already available in every
 * supported browser, costs no dependency, and moves the CPU work off the
 * server. The server still re-validates everything (see src/lib/images.ts) --
 * this is a convenience, never a trust boundary.
 */

export const MAX_IMAGE_BYTES = 1024 * 1024; // keep in sync with src/lib/images.ts

export interface CompressOptions {
  /** Longest edge in pixels. Portraits do not need more than ~512. */
  maxDimension?: number;
  /** Byte ceiling for the encoded result. */
  maxBytes?: number;
  /** Output format. JPEG gives the best size for photos. */
  mimeType?: 'image/jpeg' | 'image/webp' | 'image/png';
  /** Starting quality, reduced automatically until the size fits. */
  quality?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 512,
  maxBytes: MAX_IMAGE_BYTES,
  mimeType: 'image/jpeg',
  quality: 0.85,
};

/** Presets so callers do not have to think about dimensions. */
export const PROFILE_PHOTO_OPTIONS: CompressOptions = {
  maxDimension: 512,
  mimeType: 'image/jpeg',
  quality: 0.85,
};

/** Logos need more width and a transparent background, so PNG is kept. */
export const CHURCH_LOGO_OPTIONS: CompressOptions = {
  maxDimension: 1024,
  mimeType: 'image/png',
  quality: 0.92,
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      mimeType,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not encode the image.'));
    reader.readAsDataURL(blob);
  });
}

export interface CompressResult {
  /** base64 data URL, ready to POST as JSON. */
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Resize and compress an image until it fits under the byte ceiling.
 *
 * Strategy: scale to maxDimension first (the single biggest saving), then step
 * quality down, and only if that is still not enough shrink the dimensions
 * further. PNG ignores the quality argument, so for PNG we go straight to
 * dimension reduction.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const opts = { ...DEFAULTS, ...options };

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const img = await loadImage(file);

  let { width, height } = img;
  if (width === 0 || height === 0) {
    throw new Error('That image appears to be empty.');
  }

  // Scale the longest edge down to maxDimension, preserving aspect ratio.
  // Never upscale a small image.
  const scale = Math.min(1, opts.maxDimension / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported in this browser.');

  let quality = opts.quality;
  let blob: Blob | null = null;

  // Up to 8 attempts: reduce quality, then dimensions.
  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    // JPEG has no alpha channel: fill white first so transparent PNGs do not
    // turn black when converted.
    if (opts.mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvasToBlob(canvas, opts.mimeType, quality);

    if (blob.size <= opts.maxBytes) break;

    if (opts.mimeType !== 'image/png' && quality > 0.4) {
      quality = Math.max(0.4, quality - 0.15);
    } else {
      // Quality is exhausted (or PNG): shrink instead.
      width = Math.round(width * 0.8);
      height = Math.round(height * 0.8);
      if (width < 64 || height < 64) break;
    }
  }

  if (!blob) throw new Error('Image could not be processed.');

  if (blob.size > opts.maxBytes) {
    const kb = Math.round(blob.size / 1024);
    throw new Error(
      `Could not compress this image below 1MB (best was ${kb}KB). Please try a simpler or smaller image.`,
    );
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    bytes: blob.size,
    width,
    height,
    mimeType: opts.mimeType,
  };
}
