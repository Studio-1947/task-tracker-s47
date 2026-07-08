import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceTasksPage } from './pages/WorkspaceTasksPage';
import { useAuth } from './stores/auth';

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const { status, bootstrap } = useAuth();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route
        path="/login"
        element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="workspaces/:id" element={<WorkspaceTasksPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
