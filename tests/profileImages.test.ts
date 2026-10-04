import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { decodeProfileImageDataUrl, MAX_PROFILE_PHOTO_BYTES } from '../src/lib/profileImages';
test('server compresses an oversized photo to JPEG below one MB and 512px', async () => {
  const raw = Buffer.alloc(1800 * 1800 * 3);
  for (let i=0; i<raw.length; i++) raw[i] = (i * 73 + Math.floor(i / 11)) % 256;
  const source = await sharp(raw, { raw: { width: 1800, height: 1800, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(source.length > 1_000_000);
  const result = await decodeProfileImageDataUrl(`data:image/png;base64,${source.toString('base64')}`);
  assert.ok(result.bytes <= MAX_PROFILE_PHOTO_BYTES); assert.equal(result.mimeType, 'image/jpeg');
  const meta = await sharp(result.buffer).metadata(); assert.ok(meta.width! <= 512 && meta.height! <= 512);
});
test('transparent photo backgrounds become white, not black', async () => {
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const result = await decodeProfileImageDataUrl(`data:image/png;base64,${source.toString('base64')}`);
  const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
});
test('server rejects spoofed and undecodable images', async () => {
  await assert.rejects(decodeProfileImageDataUrl('data:image/png;base64,bm90IGEgcGhvdG8='));
  await assert.rejects(decodeProfileImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+'));
});
