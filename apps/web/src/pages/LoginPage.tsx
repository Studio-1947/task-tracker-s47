import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { Button, Card, Input, PasswordInput } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-[#f8fafc] via-slate-50 to-indigo-50/20 dark:from-[#121212] dark:via-[#181818] dark:to-[#121212] px-4 py-12 animate-fade-in">
      <Card className="w-full max-w-md p-8 sm:p-10 shadow-2xl shadow-indigo-500/[0.02] border border-slate-200/50 dark:border-slate-800/40 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818] rounded-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/60 shadow-inner mb-4 p-3.5">
            <svg viewBox="0 0 683 680" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <path d="M332.195 0.11376C423.313 -2.19948 509.656 30.8293 575.866 93.4175C641.945 155.876 679.634 240.441 681.956 331.175C684.279 421.908 651.238 508.145 588.385 574.075C525.66 640.003 440.996 677.53 349.875 679.844C258.757 682.158 172.414 649.128 106.204 586.54C40.124 524.079 2.43767 439.514 0.114657 348.782C-2.20845 258.047 30.8312 171.813 93.685 105.883C156.409 39.9537 241.204 2.42702 332.195 0.11376ZM365.621 231.187C356.845 229.003 347.553 228.104 338.132 228.362C328.71 228.618 319.417 230.289 310.771 232.601L306.253 59.4888C248.82 66.4288 196.806 90.4615 155.377 126.446L281.343 245.71C265.727 255.606 252.691 269.359 243.529 285.422L117.562 166.16C83.7474 209.213 62.4516 262.417 58.3217 319.866L231.912 315.369C229.717 324.236 228.815 333.489 229.073 342.871C229.331 352.252 231.01 361.377 233.332 370.117L59.7416 374.615C66.8401 431.933 91.1042 483.854 126.984 525.108L246.496 399.547C256.434 415.098 270.244 428.077 286.376 437.203L166.865 562.635C210.1 596.435 263.404 617.642 320.965 621.753L316.449 448.64C325.225 450.826 334.517 451.724 343.94 451.468C353.36 451.21 362.653 449.54 371.301 447.226L375.819 620.339C433.252 613.4 485.264 589.239 526.693 553.381L400.727 434.117C416.343 424.221 429.379 410.471 438.543 394.406L564.509 513.67C598.324 470.617 619.617 417.41 623.748 359.963L450.159 364.461C452.353 355.594 453.256 346.34 452.997 336.958C452.739 327.577 451.062 318.452 448.738 309.712L622.329 305.214C615.231 247.896 591.096 195.974 555.086 154.72L435.575 280.283C425.636 264.732 411.826 251.752 395.694 242.626L515.206 117.064H515.335C472.098 83.3928 418.795 62.0585 361.104 57.9458L365.621 231.187ZM338.8 252.894C387.071 251.736 427.21 289.65 428.5 337.843C429.663 386.038 391.588 426.136 343.317 427.292C295.048 428.449 254.91 390.535 253.62 342.34C252.457 294.147 290.531 254.05 338.8 252.894Z" fill="#FF0000"/>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Studio 1947</h1>
          <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500 font-medium">Task Tracker Control Center</p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address</label>
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password</label>
            <PasswordInput placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <p className="text-sm text-red-500 dark:text-red-400 font-semibold">{error}</p> : null}
          <Button type="submit" className="w-full py-3 font-semibold text-sm shadow-md" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to dashboard'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
