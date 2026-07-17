import type { ApiError } from '@task-tracker/shared';
import { ApiRequestError } from './api';

/**
 * Client for the hidden /super-dev console. Auth is a separate httpOnly cookie
 * (sd_session) set by the server — NOT the normal user access token — so these
 * calls carry no Authorization header and just rely on `credentials: include`.
 * A 401 means the super-dev session is gone; callers handle that by logging out.
 */
const BASE = '/api/super-dev';

async function sd<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

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

export const sdApi = {
  get: <T>(path: string) => sd<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    sd<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    sd<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => sd<T>(path, { method: 'DELETE' }),
};
