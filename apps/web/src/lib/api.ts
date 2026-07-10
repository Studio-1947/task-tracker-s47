import type { ApiError, LoginResponse } from '@task-tracker/shared';

/**
 * Access token is held in memory only (never localStorage) — the refresh token
 * lives in an httpOnly cookie. On a 401 we transparently try /auth/refresh once.
 */
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const BASE = '/api';

async function raw(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // FormData bodies must set their own multipart boundary — don't override.
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await raw('/auth/refresh', { method: 'POST' });
      if (!res.ok) return false;
      const data = (await res.json()) as LoginResponse;
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      // reset after the microtask so concurrent callers share this attempt
      queueMicrotask(() => (refreshInFlight = null));
    }
  })();
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let res = await raw(path, init);

  if (res.status === 401 && retry && path !== '/auth/refresh' && path !== '/auth/login') {
    const ok = await tryRefresh();
    if (ok) res = await raw(path, init);
  }

  if (!res.ok) {
    let body: Partial<ApiError> = {};
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error */
    }
    throw new ApiRequestError(res.status, body.message ?? res.statusText, body.details, body.error);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string) => api<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
  /** Multipart upload — the browser sets the boundary Content-Type itself. */
  upload: <T>(path: string, form: FormData) => api<T>(path, { method: 'POST', body: form }),
};

/** Authenticated binary fetch (avatars, attachments) with the same one-shot refresh retry. */
export async function apiBlob(path: string): Promise<Blob> {
  let res = await raw(path, { method: 'GET' });
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) res = await raw(path, { method: 'GET' });
  }
  if (!res.ok) {
    let body: Partial<ApiError> = {};
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error */
    }
    throw new ApiRequestError(res.status, body.message ?? res.statusText, body.details, body.error);
  }
  return res.blob();
}
