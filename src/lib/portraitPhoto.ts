import { compressImage, PROFILE_PHOTO_OPTIONS, type CompressResult } from './imageCompress';

export const MAX_PROFILE_PHOTO_BYTES = 999999;
/** Segmentation happens locally; only the final white-background JPEG is uploaded. */
export async function preparePortrait(file: File, report?: (message: string) => void): Promise<CompressResult> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP portrait.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a portrait smaller than 25 MB.');
  report?.('Preparing portrait…');
  const input = await compressImage(file, { maxDimension: 1024, mimeType: 'image/png', maxBytes: 4 * 1024 * 1024 });
  const binary = atob(input.dataUrl.split(',')[1]);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const inputBlob = new Blob([bytes], { type: input.mimeType });
  report?.('Removing background on this device… First use may take longer.');
  try {
    const foreground = await new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(new URL('./portraitWorker.ts', import.meta.url), { type: 'module' });
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error('Portrait processing timed out.')); }, 300000);
      const finish = () => { window.clearTimeout(timeout); worker.terminate(); };
      worker.onmessage = event => {
        if (event.data.progress) report?.(event.data.progress);
        else if (event.data.foreground) { finish(); resolve(event.data.foreground); }
        else if (event.data.error) { finish(); reject(new Error(event.data.error)); }
      };
      worker.onerror = event => { finish(); reject(new Error(event.message || 'Portrait worker could not start.')); };
      worker.postMessage({ image: inputBlob, publicPath: new URL('/portrait-model/', window.location.origin).href });
    });
    report?.('Adding white background and compressing…');
    return await compressImage(new File([foreground], 'portrait.png', { type: 'image/png' }), { ...PROFILE_PHOTO_OPTIONS, maxBytes: MAX_PROFILE_PHOTO_BYTES });
  } catch (error) {
    console.error('Portrait background removal failed:', error);
    throw new Error('Could not remove the portrait background. Check your connection, try a clear single-person portrait, and retry. The original image has not been uploaded.');
  }
}
