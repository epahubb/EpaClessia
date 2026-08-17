import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeImageDataUrl,
  sniffMimeType,
  toDataUrl,
  ImageValidationError,
  MAX_IMAGE_BYTES,
} from '../src/lib/images';

/** Minimal valid magic-byte headers, padded so sniffing has >= 12 bytes. */
const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 1)]);
const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1),
]);
const webpBytes = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.alloc(16, 1),
]);

const asDataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`;

test('sniffMimeType identifies JPEG, PNG, and WebP', () => {
  assert.equal(sniffMimeType(jpegBytes), 'image/jpeg');
  assert.equal(sniffMimeType(pngBytes), 'image/png');
  assert.equal(sniffMimeType(webpBytes), 'image/webp');
});

test('sniffMimeType rejects unknown and too-short buffers', () => {
  assert.equal(sniffMimeType(Buffer.from('not an image at all')), null);
  assert.equal(sniffMimeType(Buffer.from([0xff, 0xd8])), null);
});

test('decodeImageDataUrl accepts a valid JPEG data URL', () => {
  const result = decodeImageDataUrl(asDataUrl('image/jpeg', jpegBytes));
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.bytes, jpegBytes.length);
});

test('decodeImageDataUrl rejects a missing or non-string payload', () => {
  assert.throws(() => decodeImageDataUrl(undefined), ImageValidationError);
  assert.throws(() => decodeImageDataUrl(''), ImageValidationError);
  assert.throws(() => decodeImageDataUrl(12345 as unknown as string), ImageValidationError);
});

test('decodeImageDataUrl rejects a plain base64 string with no data URL prefix', () => {
  assert.throws(() => decodeImageDataUrl(jpegBytes.toString('base64')), ImageValidationError);
});

test('decodeImageDataUrl rejects SVG (script injection vector)', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  assert.throws(
    () => decodeImageDataUrl(asDataUrl('image/svg+xml', svg)),
    /Unsupported image type/,
  );
});

test('decodeImageDataUrl rejects a spoofed MIME type', () => {
  // Declared PNG, actually JPEG bytes.
  assert.throws(
    () => decodeImageDataUrl(asDataUrl('image/png', jpegBytes)),
    /does not match its declared type/,
  );
});

test('decodeImageDataUrl rejects a non-image disguised as an image', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(16, 1)]);
  assert.throws(
    () => decodeImageDataUrl(asDataUrl('image/png', pdf)),
    /does not appear to be a JPEG, PNG, or WebP/,
  );
});

test('decodeImageDataUrl enforces the 1MB ceiling on decoded bytes', () => {
  const tooBig = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(MAX_IMAGE_BYTES + 1024, 7),
  ]);
  try {
    decodeImageDataUrl(asDataUrl('image/jpeg', tooBig));
    assert.fail('expected an oversized image to be rejected');
  } catch (err) {
    assert.ok(err instanceof ImageValidationError);
    assert.equal(err.status, 413, 'oversized uploads should report HTTP 413');
    assert.match(err.message, /exceeds the 1MB limit/);
  }
});

test('decodeImageDataUrl accepts an image exactly at the ceiling', () => {
  const exact = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(MAX_IMAGE_BYTES - 4, 7),
  ]);
  assert.equal(exact.length, MAX_IMAGE_BYTES);
  const result = decodeImageDataUrl(asDataUrl('image/jpeg', exact));
  assert.equal(result.bytes, MAX_IMAGE_BYTES);
});

test('toDataUrl round-trips a stored buffer and handles empty values', () => {
  const url = toDataUrl(pngBytes, 'image/png');
  assert.ok(url && url.startsWith('data:image/png;base64,'));
  assert.equal(decodeImageDataUrl(url).mimeType, 'image/png');

  assert.equal(toDataUrl(null, 'image/png'), null);
  assert.equal(toDataUrl(undefined, null), null);
  assert.equal(toDataUrl(Buffer.alloc(0), 'image/png'), null);
});

test('toDataUrl falls back to sniffing when the stored MIME type is missing', () => {
  const url = toDataUrl(jpegBytes, null);
  assert.ok(url && url.startsWith('data:image/jpeg;base64,'));
});
