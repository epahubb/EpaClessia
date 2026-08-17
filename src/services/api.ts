import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
});

api.interceptors.request.use(async (config) => {
  // Use local token from JWT auth
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const currentContext = localStorage.getItem('currentContext');
  if (currentContext) {
    try {
      const context = JSON.parse(currentContext);
      config.headers['X-Tenant-ID'] = context.tenantId;
      config.headers['X-User-Role'] = context.role;
      if (context.ministryId) {
        config.headers['X-Ministry-ID'] = context.ministryId;
      }
    } catch (e) {
      console.error('Error parsing currentContext', e);
    }
  }

  return config;
});

/**
 * Turn any Axios/HTTP failure into a clear, human-readable sentence.
 * We prefer a message the server explicitly sent, then fall back to a
 * friendly explanation per status code. Raw "Request failed with status
 * code XYZ" strings are never shown to the user.
 */
function toFriendlyMessage(error: AxiosError): string {
  const res = error.response;
  const data: any = res?.data;
  const serverMsg =
    (typeof data === 'string' ? data : data?.error || data?.message) || '';

  // No response at all -> network / server unreachable.
  if (!res) {
    if (error.code === 'ECONNABORTED') {
      return 'The request took too long to respond. Please check your connection and try again.';
    }
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }

  // Use the server's own message when it is meaningful (not a raw axios code).
  if (
    serverMsg &&
    typeof serverMsg === 'string' &&
    !/^request failed with status code/i.test(serverMsg)
  ) {
    return serverMsg;
  }

  switch (res.status) {
    case 400:
      return 'Some of the information provided was invalid. Please review your entries and try again.';
    case 401:
      return 'Your session has expired or your sign-in details are incorrect. Please sign in again.';
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return "We couldn't find what you were looking for. It may have been moved or deleted.";
    case 409:
      return 'This conflicts with an existing record. Please use different details.';
    case 413:
      return 'The file you are trying to upload is too large. Please choose a smaller file and try again.';
    case 422:
      return 'Some of the information provided was invalid. Please review your entries and try again.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    case 500:
      return 'Something went wrong on our end. Please try again in a moment.';
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again in a few moments.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('currentContext');
  localStorage.removeItem('refresh_token');
}

function forceLogout() {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// --- Silent access-token refresh ---------------------------------------
// When the short-lived access token expires the server responds 401. Instead
// of dumping the user back to the login screen, we transparently exchange the
// refresh token for a new access token and replay the original request. This
// is what fixes the "TokenExpiredError: jwt expired" experience.
let isRefreshing = false;
let refreshWaiters: Array<(token: string | null) => void> = [];

function onRefreshed(token: string | null) {
  refreshWaiters.forEach((cb) => cb(token));
  refreshWaiters = [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  // Coalesce concurrent 401s into a single refresh request.
  if (isRefreshing) {
    return new Promise((resolve) => refreshWaiters.push(resolve));
  }
  isRefreshing = true;
  try {
    // Use a bare axios call so this request does not re-enter the interceptor.
    const resp = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    const newToken: string | null = resp.data?.token || null;
    if (newToken) {
      localStorage.setItem('token', newToken);
      if (resp.data?.user) {
        localStorage.setItem('user', JSON.stringify(resp.data.user));
      }
    }
    onRefreshed(newToken);
    return newToken;
  } catch (e) {
    onRefreshed(null);
    return null;
  } finally {
    isRefreshing = false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original: any = error.config || {};
    const url: string = original.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    // Genuine auth failure on a normal request: try a silent refresh once,
    // then replay the original request. If refresh fails, send to login.
    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      forceLogout();
    } else if (status === 401 && isAuthCall) {
      // The refresh endpoint itself rejected us -> the session is truly over.
      if (url.includes('/auth/refresh')) forceLogout();
    }

    const friendly = toFriendlyMessage(error);
    // Expose the friendly text everywhere the app reads an error message.
    (error as any).friendlyMessage = friendly;
    error.message = friendly;
    return Promise.reject(error);
  }
);

export default api;
