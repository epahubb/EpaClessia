import sharp from 'sharp';
import { decodeImageDataUrl, ImageValidationError, type DecodedImage } from './images';
export const MAX_PROFILE_PHOTO_BYTES = 999999;
/** Enforce storage size even for API clients bypassing browser compression. */
export async function decodeProfileImageDataUrl(value: unknown): Promise<DecodedImage> {
  const source = decodeImageDataUrl(value, 25 * 1024 * 1024);
  try {
    const base = sharp(source.buffer, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' });
    for (const quality of [85, 70, 55, 40]) {
      const buffer = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
      if (buffer.length < 1_000_000) return { buffer, bytes: buffer.length, mimeType: 'image/jpeg' };
    }
    throw new ImageValidationError('Photo could not be compressed below 1 MB.', 413);
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError('That photo could not be decoded. Please upload a valid JPG, PNG or WebP portrait.');
  }
}
