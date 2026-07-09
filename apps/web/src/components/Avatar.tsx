import { AuthImage } from './AuthImage';

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-20 w-20 text-2xl',
} as const;

const COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length] ?? COLORS[0]!;
}

export interface AvatarUser {
  id: string;
  name: string;
  avatarKey?: string | null;
}

/**
 * User avatar: profile picture when set, otherwise initials on a color
 * derived deterministically from the user id.
 */
export function Avatar({
  user,
  size = 'md',
  className = '',
}: {
  user: AvatarUser;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = initialsOf(user.name);
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white ${SIZES[size]} ${colorFor(user.id)} ${className}`}
      title={user.name}
    >
      {user.avatarKey ? (
        <AuthImage
          path={`/files/${user.avatarKey}`}
          alt={user.name}
          className="h-full w-full object-cover"
          fallback={initials}
        />
      ) : (
        initials
      )}
    </span>
  );
}
