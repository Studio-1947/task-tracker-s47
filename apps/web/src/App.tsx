import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { DashboardPage } from './pages/DashboardPage';
import { AttendancePage } from './pages/AttendancePage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceTasksPage } from './pages/WorkspaceTasksPage';
import { SuperDevLoginPage } from './pages/superdev/SuperDevLoginPage';
import { SuperDevConsole } from './pages/superdev/SuperDevConsole';
import { useAuth } from './stores/auth';
import { useSuperDev } from './stores/superdev';

/** Requires authentication only (used by the forced password-change route). */
function RequireAuthRaw() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Requires auth AND that the user isn't pending a forced password reset. */
function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Fully isolated entry for the hidden developer console. Runs its own auth
 * (separate cookie/store), lives outside the app shell + normal auth tree, and is
 * never linked from anywhere in the product. Real access control is server-side —
 * this route being obscure is only a thin extra layer.
 */
function SuperDevGate() {
  const { status, bootstrap } = useSuperDev();
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  if (status === 'loading') return <div className="min-h-screen bg-[#0a0a0b]" />;
  return status === 'authenticated' ? <SuperDevConsole /> : <SuperDevLoginPage />;
}

export default function App() {
  const { status, user, bootstrap } = useAuth();
  const location = useLocation();

  // The super-dev console runs its own auth tier — don't fire the normal
  // /auth/refresh session-restore there (it would 401 with no user cookie).
  const onSuperDev = location.pathname.startsWith('/super-dev');
  useEffect(() => {
    if (!onSuperDev) void bootstrap();
  }, [bootstrap, onSuperDev]);

  return (
    <Routes>
      {/* Hidden developer console — isolated from the rest of the routing tree. */}
      <Route path="/super-dev" element={<SuperDevGate />} />

      <Route
        path="/login"
        element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />}
      />

      {/* Forced first-login reset — authenticated, outside the app shell. */}
      <Route element={<RequireAuthRaw />}>
        <Route
          path="/change-password"
          element={
            user && !user.mustChangePassword ? <Navigate to="/" replace /> : <ChangePasswordPage forced />
          }
        />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="workspaces/:id" element={<WorkspaceTasksPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
