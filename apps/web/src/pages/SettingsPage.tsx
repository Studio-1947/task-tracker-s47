import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Avatar } from '../components/Avatar';
import { Button, Card } from '../components/ui';
import { ChangePasswordPage } from './ChangePasswordPage';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

function ProfileCard() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const afterChange = (updated: AuthUser) => {
    setUser(updated);
    // User refs (comments, activity, assignees, search) embed the avatar key.
    void queryClient.invalidateQueries();
  };

  const onPick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be 2 MB or smaller.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      afterChange(await http.upload<AuthUser>('/me/avatar', form));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      afterChange(await http.del<AuthUser>('/me/avatar'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to remove picture');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-sm font-medium text-slate-600">Profile</h2>
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <p className="font-medium text-slate-700">{user.name}</p>
          <p className="text-sm text-slate-400">{user.email}</p>
          {user.designation ? <p className="text-sm text-slate-400">{user.designation}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Choose profile picture"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button variant="ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? 'Working…' : user.avatarKey ? 'Change picture' : 'Upload picture'}
            </Button>
            {user.avatarKey ? (
              <Button variant="danger" disabled={busy} onClick={() => void onRemove()}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-slate-400">PNG, JPG, WebP or GIF — up to 2 MB.</p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
      <ProfileCard />
      <ChangePasswordPage embedded />
    </div>
  );
}
