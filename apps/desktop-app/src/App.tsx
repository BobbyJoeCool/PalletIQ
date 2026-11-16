import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { DesktopShell } from './components/shell/DesktopShell';
import { useAuth } from './context/authContext';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

/**
 * Route guard: renders the nested routes only while a session exists, otherwise
 * redirects to the login screen. Because it reads `token` from context, signing out or
 * the session expiring returns the user to login without any explicit navigation.
 */
function RequireAuth() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Route table: the public login screen, and everything else inside the guarded shell. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<DesktopShell />}>
          <Route index element={<HomePage />} />
          <Route path="screens/:screenId" element={<ComingSoonPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
