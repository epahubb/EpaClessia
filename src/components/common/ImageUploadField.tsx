import React, { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import {
  compressImage,
  PROFILE_PHOTO_OPTIONS,
  CHURCH_LOGO_OPTIONS,
  type CompressOptions,
} from '../../lib/imageCompress';

/**
 * Reusable image picker for profile pictures and church logos.
 *
 * The file is resized and compressed in the browser before it ever leaves the
 * page, then handed to the parent as a base64 data URL ready to POST as JSON.
 * The server re-validates it (src/lib/images.ts), so this is convenience and
 * fast feedback -- not a security control.
 */

export type ImageUploadVariant = 'avatar' | 'logo';

interface ImageUploadFieldProps {
  /** Current image, as a data URL or an existing image endpoint URL. */
  value?: string | null;
  /** Receives the compressed data URL, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  variant?: ImageUploadVariant;
  label?: string;
  disabled?: boolean;
  /** Overrides the variant preset if needed. */
  options?: CompressOptions;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  variant = 'avatar',
  label,
  disabled = false,
  options,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const preset = variant === 'logo' ? CHURCH_LOGO_OPTIONS : PROFILE_PHOTO_OPTIONS;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await compressImage(file, { ...preset, ...options });
      onChange(result.dataUrl);
      const kb = Math.max(1, Math.round(result.bytes / 1024));
      setInfo(`${result.width}x${result.height}, ${kb}KB`);
    } catch (err: any) {
      // compressImage throws user-facing messages, so show them directly.
      setError(err?.message || 'That image could not be processed.');
    } finally {
      setBusy(false);
      // Reset the input so picking the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = () => {
    onChange(null);
    setError(null);
    setInfo(null);
  };

  const isAvatar = variant === 'avatar';
  const previewClass = isAvatar
    ? 'w-24 h-24 rounded-full object-cover border border-gray-200'
    : 'h-24 max-w-[220px] object-contain border border-gray-200 rounded bg-white p-2';

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}

      <div className="flex items-center gap-4">
        {value ? (
          <img src={value} alt={label || 'Selected image'} className={previewClass} />
        ) : (
          <div
            className={
              isAvatar
                ? 'w-24 h-24 rounded-full bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400'
                : 'h-24 w-[220px] bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400'
            }
          >
            <Upload className="w-6 h-6" />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy ? 'Processing...' : value ? 'Change' : 'Upload'}
            </button>

            {value && !busy && (
              <button
                type="button"
                onClick={clear}
                disabled={disabled}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded border border-gray-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500">
            JPG, PNG or WebP. Large images are resized automatically.
          </p>
          {info && <p className="text-xs text-green-600">Ready to save: {info}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
};

export default ImageUploadField;
