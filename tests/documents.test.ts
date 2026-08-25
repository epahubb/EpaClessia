/**
 * Tests for the documents attached to register entries.
 *
 * The rules here are a security boundary, not a convenience: a file uploaded by
 * a church secretary is handed back to other people's browsers later. The two
 * checks that matter are that the bytes agree with the declared type, and that
 * nothing dressed up as a certificate can carry script.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DOCUMENT_BYTES,
  ALLOWED_DOCUMENT_MIME,
  DocumentValidationError,
  decodeDocumentDataUrl,
  documentToDataUrl,
  sniffDocumentMime,
  safeFileName,
  humanFileSize,
  CERTIFICATE_STATUSES,
  INITIAL_CERTIFICATE_STATUS,
  isCertificateStatus,
  certificateStatusLabel,
  statusAfterCertificateUpload,
} from '../src/lib/documents';

/** A minimal but genuine PDF: the magic bytes are what the sniffer reads. */
const pdfBuffer = (padding = 32) =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(padding, 0x20)]);

const pngBuffer = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 0),
  ]);

const dataUrl = (mime: string, buffer: Buffer) =>
  `data:${mime};base64,${buffer.toString('base64')}`;

test('a scanned certificate may be a PDF or a photograph, and nothing else', () => {
  assert.deepEqual(
    [...ALLOWED_DOCUMENT_MIME],
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  );
  // SVG is deliberately absent: it can carry script, and these files are served
  // back to browsers.
  assert.ok(!(ALLOWED_DOCUMENT_MIME as readonly string[]).includes('image/svg+xml'));
});

test('a PDF is recognised from its leading bytes', () => {
  assert.equal(sniffDocumentMime(pdfBuffer()), 'application/pdf');
  assert.equal(sniffDocumentMime(pngBuffer()), 'image/png');
  assert.equal(sniffDocumentMime(Buffer.from('just some text here')), null);
  // Too short to judge, so judged as nothing rather than guessed at.
  assert.equal(sniffDocumentMime(Buffer.from('%PD')), null);
});

test('a genuine document decodes with its size measured in real bytes', () => {
  const buffer = pdfBuffer(100);
  const decoded = decodeDocumentDataUrl(dataUrl('application/pdf', buffer));
  assert.equal(decoded.mimeType, 'application/pdf');
  // Measured on the decoded bytes, not on the base64 text, which is a third
  // larger and would make the ceiling meaningless.
  assert.equal(decoded.bytes, buffer.length);
  assert.ok(decoded.bytes < MAX_DOCUMENT_BYTES);
});

test('a file whose contents disagree with its label is refused', () => {
  // The dangerous case: something claiming to be a PDF while holding other
  // bytes entirely.
  assert.throws(
    () => decodeDocumentDataUrl(dataUrl('application/pdf', pngBuffer())),
    (error: unknown) => {
      assert.ok(error instanceof DocumentValidationError);
      assert.equal((error as DocumentValidationError).status, 400);
      assert.match((error as Error).message, /do not match the declared type/);
      return true;
    },
  );
});

test('a type we cannot store is named in the refusal', () => {
  assert.throws(
    () => decodeDocumentDataUrl(dataUrl('image/svg+xml', Buffer.from('<svg />'))),
    /cannot store a "image\/svg\+xml" file/,
  );
});

test('an oversized scan is refused with the size and the limit in plain words', () => {
  const huge = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_DOCUMENT_BYTES, 0x20)]);
  assert.throws(
    () => decodeDocumentDataUrl(dataUrl('application/pdf', huge)),
    (error: unknown) => {
      // 413 rather than 400: the file is legitimate, only too large, and the
      // status should tell the client which of the two it is.
      assert.equal((error as DocumentValidationError).status, 413);
      assert.match((error as Error).message, /over the 5MB limit/);
      return true;
    },
  );
});

test('an empty or malformed upload is refused kindly', () => {
  assert.throws(() => decodeDocumentDataUrl(undefined), /No document was supplied/);
  assert.throws(() => decodeDocumentDataUrl('not-a-data-url'), /base64 data URL/);
  assert.throws(() => decodeDocumentDataUrl(dataUrl('application/pdf', Buffer.alloc(0))), /base64 data URL/);
});

test('a stored document comes back as a data URL a browser can save', () => {
  const buffer = pdfBuffer();
  const url = documentToDataUrl(buffer, 'application/pdf');
  assert.ok(url!.startsWith('data:application/pdf;base64,'));
  assert.equal(documentToDataUrl(null), null);
  assert.equal(documentToDataUrl(Buffer.alloc(0)), null);
  // A row with a lost or wrong mime type still yields the right document,
  // because the bytes are the authority.
  assert.ok(documentToDataUrl(pngBuffer(), 'application/x-nonsense')!.startsWith('data:image/png;'));
});

test('a file name cannot escape its folder or carry surprises', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('Baptism Certificate (2026).pdf'), 'Baptism Certificate _2026_.pdf');
  assert.equal(safeFileName('   '), 'document');
  assert.equal(safeFileName(undefined, 'transfer-letter'), 'transfer-letter');
  assert.ok(safeFileName('x'.repeat(400)).length <= 120);
});

test('sizes read the way a person would say them', () => {
  assert.equal(humanFileSize(0), '0KB');
  assert.equal(humanFileSize(900), '900B');
  assert.equal(humanFileSize(2048), '2KB');
  assert.equal(humanFileSize(1.5 * 1024 * 1024), '1.5MB');
  assert.equal(humanFileSize(5 * 1024 * 1024), '5MB');
});

/* -------------------------------------------------------- certificates */

test('filing a baptism starts the certificate on its way', () => {
  // The point of tracking it at all: nobody should be baptised and then quietly
  // forgotten at the certificate stage.
  assert.equal(INITIAL_CERTIFICATE_STATUS, 'processing');
  assert.ok(isCertificateStatus(INITIAL_CERTIFICATE_STATUS));
});

test('the certificate has three honest stages and no others', () => {
  assert.deepEqual(
    CERTIFICATE_STATUSES.map((s) => s.value),
    ['processing', 'ready', 'delivered'],
  );
  assert.equal(isCertificateStatus('lost in the post'), false);
});

test('uploading the certificate is what marks it delivered', () => {
  // The file is the evidence of delivery, so asking the church to attach it and
  // then separately declare it handed over would be asking twice.
  assert.equal(statusAfterCertificateUpload(), 'delivered');
  assert.equal(certificateStatusLabel('delivered'), 'Delivered');
  assert.equal(certificateStatusLabel(null), 'Not yet processed');
});
