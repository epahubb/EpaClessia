import api from './api';

export interface Branding {
  platformName: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginBackground?: string;
  maxUploadMb?: number;
}

// Public (no auth) branding used before login for the title, favicon and
// login-screen background image uploaded by the super admin.
export const brandingService = {
  getPublicBranding: async (): Promise<Branding> => {
    const response = await api.get('/public/branding');
    return response.data;
  }
};

// Two-factor authentication self-service for the logged-in user
// (super admin and church admins).
export const twoFactorService = {
  status: async (): Promise<{ enabled: boolean }> => {
    const response = await api.get('/auth/2fa/status');
    return response.data;
  },
  setup: async (): Promise<{ secret: string; otpauthUrl: string }> => {
    const response = await api.post('/auth/2fa/setup');
    return response.data;
  },
  enable: async (code: string) => {
    const response = await api.post('/auth/2fa/enable', { code });
    return response.data;
  },
  disable: async () => {
    const response = await api.post('/auth/2fa/disable');
    return response.data;
  }
};
