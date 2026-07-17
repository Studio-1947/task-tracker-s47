/** httpOnly cookie holding the super-dev session JWT. Scoped to the super-dev path only. */
export const SUPERDEV_COOKIE = 'sd_session';

/** JWT `scope` claim marking a token as a super-dev token (distinct from user tokens). */
export const SUPERDEV_SCOPE = 'superdev';

/** Cookie/route path prefix (already behind the global `api` prefix at runtime). */
export const SUPERDEV_COOKIE_PATH = '/api/super-dev';

/** Well-known feature-flag keys the app itself reacts to. */
export const FLAG_MAINTENANCE_MODE = 'maintenance_mode';

export interface SuperDevJwtPayload {
  scope: typeof SUPERDEV_SCOPE;
  email: string;
}
