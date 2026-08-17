import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Load an image that sits behind an authenticated endpoint.
 *
 * A plain <img src="/api/v1/church/members/x/photo"> cannot work here: the
 * browser issues that request WITHOUT the Authorization header, so the server
 * rightly answers 401 and the user sees a broken image. Member photos are
 * personal data and the endpoint must stay protected, so the image is fetched
 * with the normal authenticated client and handed to the DOM as a blob URL.
 *
 * The object URL is revoked on change/unmount -- without that, browsing a long
 * member list would leak a blob per photo for the lifetime of the page.
 *
 * @param path API path relative to the axios baseURL, or null to load nothing.
 */
export function useAuthedImage(path?: string | null): {
  url: string | null;
  loading: boolean;
  error: boolean;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setError(false);
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setLoading(true);
    setError(false);

    api
      .get(path, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // A 404 simply means "no image set", which is not an error worth showing.
        if (!cancelled) {
          setUrl(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, loading, error };
}

export default useAuthedImage;
