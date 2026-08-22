import { useEffect, useState } from 'react';
import churchApi from '../services/churchApi';
import {
  getPortalProfile,
  DEFAULT_DENOMINATION,
  type PortalFeature,
  type PortalProfile,
} from '../lib/denominations';

/**
 * The portal layout for the signed-in church, decided by the denomination the
 * superadmin chose when registering it.
 *
 * While the profile is loading - and if the request fails - the full portal is
 * used. Hiding parts of the sidebar on a slow network or a failed call would be
 * far worse than briefly showing an area the denomination does not use.
 */
export function usePortalProfile(): {
  profile: PortalProfile;
  loading: boolean;
  /** True once the server's answer (rather than the fallback) is in hand. */
  loaded: boolean;
  has: (feature: PortalFeature) => boolean;
  label: (feature: PortalFeature, fallback: string) => string;
} {
  const [profile, setProfile] = useState<PortalProfile>(
    getPortalProfile(DEFAULT_DENOMINATION),
  );
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await churchApi.getPortalProfile();
        if (cancelled) return;
        setProfile({
          denomination: data?.denomination || DEFAULT_DENOMINATION,
          label: data?.denominationLabel || 'Church',
          features: Array.isArray(data?.features)
            ? data.features
            : getPortalProfile(DEFAULT_DENOMINATION).features,
          terminology: data?.terminology || {},
        });
        setLoaded(true);
      } catch {
        // Keep the full portal; the church admin is not left stranded.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    profile,
    loading,
    loaded,
    has: (feature: PortalFeature) => profile.features.includes(feature),
    label: (feature: PortalFeature, fallback: string) =>
      profile.terminology[feature] || fallback,
  };
}

export default usePortalProfile;
