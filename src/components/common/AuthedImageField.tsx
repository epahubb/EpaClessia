import React from 'react';
import ImageUploadField, { type ImageUploadVariant } from './ImageUploadField';
import useAuthedImage from '../../hooks/useAuthedImage';

/**
 * An ImageUploadField that can display an image already stored behind an
 * authenticated endpoint.
 *
 * `existingPath` is fetched with the authenticated client (see useAuthedImage);
 * once the user picks a new file, `value` takes over as the preview. This is a
 * component rather than a hook call inside a form loop so that it can be
 * rendered conditionally without breaking the rules of hooks.
 */
interface AuthedImageFieldProps {
  /** API path of the currently stored image, or null when none exists. */
  existingPath?: string | null;
  /** Newly picked image as a data URL, null when cleared, undefined when untouched. */
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  variant?: ImageUploadVariant;
  label?: string;
  disabled?: boolean;
}

const AuthedImageField: React.FC<AuthedImageFieldProps> = ({
  existingPath,
  value,
  onChange,
  variant = 'avatar',
  label,
  disabled,
}) => {
  const { url: storedUrl, loading } = useAuthedImage(existingPath);

  // `value === null` means the user explicitly cleared the image, so the stored
  // one must not reappear as the preview.
  const preview = value !== undefined && value !== null ? value : value === null ? null : storedUrl;

  return (
    <div>
      <ImageUploadField
        label={label}
        value={preview}
        onChange={onChange}
        variant={variant}
        disabled={disabled || loading}
      />
      {loading && <p className="text-xs text-gray-500 mt-1">Loading current image...</p>}
    </div>
  );
};

export default AuthedImageField;
