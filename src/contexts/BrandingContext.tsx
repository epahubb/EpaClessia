import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { brandingService, Branding } from '../services/brandingService';
import { useAuth } from './AuthContext';

interface BrandingContextValue {
  branding: Branding;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_BRANDING: Branding = {
  platformName: 'EpaChurch',
  logoUrl: '',
  faviconUrl: '',
  loginBackground: '',
  maxUploadMb: 10,
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: true,
  refresh: async () => {},
});

export const useBranding = () => useContext(BrandingContext);

const APP_NAME = 'EpaChurch';

function setFavicon(href: string) {
  if (!href) return;
  let link = document.getElementById('app-favicon') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  // AuthContext gives us the current signed-in tenant (church) context.
  let auth: any = {};
  try { auth = useAuth(); } catch { auth = {}; }
  const currentContext = auth?.currentContext;
  const isChurchPortal =
    currentContext && currentContext.role && currentContext.role !== 'SUPER_ADMIN';
  const churchName = isChurchPortal ? currentContext?.tenantName : '';
  const churchLogo = isChurchPortal ? (currentContext?.logo || currentContext?.tenantLogo) : '';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await brandingService.getPublicBranding();
      setBranding({ ...DEFAULT_BRANDING, ...data });
    } catch {
      setBranding(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 1. Application title: "EpaChurch | <church name>" once a church portal is active.
  useEffect(() => {
    document.title = churchName ? `${APP_NAME} | ${churchName}` : APP_NAME;
  }, [churchName]);

  // 2. Favicon: church logo when inside a church portal, else the super admin
  //    default favicon uploaded in system settings.
  useEffect(() => {
    const icon = churchLogo || branding.faviconUrl || branding.logoUrl;
    if (icon) setFavicon(icon);
  }, [churchLogo, branding.faviconUrl, branding.logoUrl]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
};
