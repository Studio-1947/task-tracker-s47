const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'SettingsPage.tsx');
let content = fs.readFileSync(file, 'utf8');

const profileCardRegex = /function ProfileCard\(\) \{[\s\S]*?<\/Card>\s*\);\s*\}/;

const newProfileCard = `function ProfileCard() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [designation, setDesignation] = useState(user?.designation ?? '');
  const [gender, setGender] = useState(user?.gender ?? 'UNSPECIFIED');

  if (!user) return null;

  const afterChange = (updated: AuthUser) => {
    setUser(updated);
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

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated = await http.patch<AuthUser>('/me', {
        name,
        designation: designation || null,
        gender
      });
      afterChange(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to update profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Profile Details</h2>
        {!editing ? (
          <Button variant="ghost" className="text-xs py-1.5 px-3 font-semibold" onClick={() => {
            setName(user.name);
            setDesignation(user.designation ?? '');
            setGender(user.gender ?? 'UNSPECIFIED');
            setEditing(true);
          }}>
            Edit Profile
          </Button>
        ) : null}
      </div>
      <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-3">
          <Avatar user={user} size="lg" className="ring-4 ring-slate-100 dark:ring-slate-800/40" />
          <div className="flex flex-wrap gap-2 justify-center">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Choose profile picture"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button variant="ghost" className="text-xs py-1.5 px-2" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? 'Working…' : user.avatarKey ? 'Change' : 'Upload'}
            </Button>
            {user.avatarKey ? (
              <Button variant="danger" className="text-xs py-1.5 px-2" disabled={busy} onClick={() => void onRemove()}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={saveProfile} className="space-y-3 max-w-sm">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Name</label>
                <input required className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:text-white" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Designation</label>
                <input className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:text-white" value={designation} onChange={e => setDesignation(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Gender</label>
                <select className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:text-white" value={gender} onChange={e => setGender(e.target.value as any)}>
                  <option value="UNSPECIFIED">Unspecified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={busy}>Save changes</Button>
                <Button variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-lg">{user.name}</p>
              <p className="text-sm font-semibold text-slate-450 dark:text-slate-500 mt-0.5">{user.email}</p>
              {user.designation ? <p className="text-sm font-semibold text-slate-450 dark:text-slate-500 mt-0.5">{user.designation}</p> : null}
              {user.gender && user.gender !== 'UNSPECIFIED' ? <p className="text-sm font-semibold text-slate-450 dark:text-slate-500 mt-0.5 capitalize">{user.gender.toLowerCase()}</p> : null}
            </>
          )}
          {error ? <p className="mt-3 text-sm text-red-650 dark:text-red-400 font-medium">{error}</p> : null}
        </div>
      </div>
    </Card>
  );
}`;

content = content.replace(profileCardRegex, newProfileCard);
fs.writeFileSync(file, content);
console.log('updated ProfileCard');
