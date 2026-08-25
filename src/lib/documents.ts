/**
 * Documents attached to register entries: baptism certificates, letters of
 * transfer, death certificates, birth certificates.
 *
 * These are handled apart from `images.ts` because the rules are genuinely
 * different. A profile photo is a small raster image the browser compresses
 * first; a scanned certificate is usually a PDF, arrives at whatever size the
 * scanner produced, and is never rendered inline as an avatar. Sharing one
 * validator would mean loosening the photo rules, which is the wrong trade:
 * photos are shown back to browsers and so need the tighter allow-list.
 *
 * What is kept from `images.ts` is the discipline: the ceiling is enforced on
 * decoded bytes, the type is checked against an allow-list, and the leading
 * bytes must agree with the declared type. SVG is still refused outright, since
 * it can carry script and would be an XSS vector when handed back to a browser.
 */

import { sniffMimeType } from './images';

/**
 * Hard ceiling on a stored document. Larger than the 1MB photo limit because a
 * scanned certificate legitimately runs to a few hundred KB per page, but still
 * small enough that a row stays readable out of the database.
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIME)[number];

export interface DecodedDocument {
  buffer: Buffer;
  mimeType: AllowedDocumentMime;
  bytes: number;
}

/** Raised for any invalid upload. Carries an HTTP status for the route. */
export class DocumentValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DocumentValidationError';
    this.status = status;
  }
}

/** Identify a document from its leading bytes. Returns null when unrecognised. */
export function sniffDocumentMime(buffer: Buffer): AllowedDocumentMime | null {
  if (buffer.length < 5) return null;
  // PDF: "%PDF-"
  if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  // Anything else must be one of the raster formats the image sniffer knows.
  return sniffMimeType(buffer);
}

/** A file name that is safe to store and to offer back as a download. */
export function safeFileName(name: unknown, fallback = 'document'): string {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return fallback;
  // Strip any path, then anything that is not plainly a file-name character, so
  // a crafted name cannot escape a folder or confuse a download header.
  const base = raw.split(/[\\/]/).pop() || fallback;
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/_{2,}/g, '_').trim();
  return (cleaned || fallback).slice(0, 120);
}

/**
 * Decode and fully validate a base64 data URL holding a document.
 *
 * @param dataUrl e.g. "data:application/pdf;base64,JVBERi0..."
 * @throws DocumentValidationError with a message that is safe to show the user.
 */
export function decodeDocumentDataUrl(dataUrl: unknown): DecodedDocument {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new DocumentValidationError('No document was supplied.');
  }

  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new DocumentValidationError(
      'The document must be sent as a base64 data URL, e.g. data:application/pdf;base64,...',
    );
  }

  const declaredMime = match[1].toLowerCase();
  if (!(ALLOWED_DOCUMENT_MIME as readonly string[]).includes(declaredMime)) {
    throw new DocumentValidationError(
      `We cannot store a "${declaredMime}" file. Attach a PDF or a photograph of the document.`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw new DocumentValidationError('The document data is not valid base64.');
  }

  if (buffer.length === 0) {
    throw new DocumentValidationError('The document is empty.');
  }

  // The ceiling is checked on decoded bytes: base64 inflates by about a third,
  // so measuring the text would reject good files and admit oversized ones.
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError(
      `The document is ${humanFileSize(buffer.length)}, over the ${humanFileSize(
        MAX_DOCUMENT_BYTES,
      )} limit. Scan it at a lower resolution and try again.`,
      413,
    );
  }

  const actualMime = sniffDocumentMime(buffer);
  if (!actualMime) {
    throw new DocumentValidationError(
      'That file is not a PDF, JPEG, PNG or WebP document.',
    );
  }
  if (actualMime !== declaredMime) {
    // The bytes disagree with the declared type: treat it as hostile.
    throw new DocumentValidationError(
      `The file contents (${actualMime}) do not match the declared type (${declaredMime}).`,
    );
  }

  return { buffer, mimeType: actualMime, bytes: buffer.length };
}

/** Turn a stored document back into a data URL for a download link. */
export function documentToDataUrl(
  content: Buffer | Uint8Array | null | undefined,
  mimeType?: string | null,
): string | null {
  if (!content) return null;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (buf.length === 0) return null;
  const mime =
    mimeType && (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(mimeType)
      ? mimeType
      : sniffDocumentMime(buf) || 'application/pdf';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Sizes as a person would say them, for messages and for the file list. */
export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0KB';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

/* ------------------------------------------------------------------ */
/* Baptism certificates                                               */
/* ------------------------------------------------------------------ */

/**
 * A certificate is a small piece of administration with a life of its own: the
 * baptism happens, the certificate is written, then it is handed over. Filing a
 * baptism starts that clock rather than leaving the church to remember.
 */
export const CERTIFICATE_STATUSES = [
  { value: 'processing', label: 'Being processed' },
  { value: 'ready', label: 'Ready for collection' },
  { value: 'delivered', label: 'Delivered' },
] as const;

export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]['value'];

/** The status a baptism entry starts in, the moment it is filed. */
export const INITIAL_CERTIFICATE_STATUS: CertificateStatus = 'processing';

export function isCertificateStatus(value: unknown): value is CertificateStatus {
  return CERTIFICATE_STATUSES.some((s) => s.value === value);
}

export function certificateStatusLabel(value: unknown): string {
  return (
    CERTIFICATE_STATUSES.find((s) => s.value === value)?.label ||
    'Not yet processed'
  );
}

/**
 * Uploading the certificate is what proves it was delivered, so the two are
 * treated as one act: attaching the file advances the status to delivered.
 * Anything else the church sets by hand is respected as given.
 */
export function statusAfterCertificateUpload(): CertificateStatus {
  return 'delivered';
}
