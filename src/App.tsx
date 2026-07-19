import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ISIProvider } from './context/ISIContext';
import { PIIProvider } from './context/PIIContext';
import { StagingProvider } from './context/StagingContext';
import { AppShell } from './components/shell/AppShell';
import { ELAPage } from './pages/ELAPage';
import { ELZPage } from './pages/ELZPage';
import { HomePage } from './pages/HomePage';
import { IIDPage } from './pages/IIDPage';
import { ISIPage } from './pages/ISIPage';
import { LIIPage } from './pages/LIIPage';
import { LoginPage } from './pages/LoginPage';
import { MNPPage } from './pages/MNPPage';
import { PARPage } from './pages/PARPage';
import { PIIPage } from './pages/PIIPage';
import { PIPPage } from './pages/PIPPage';
import { PinPage } from './pages/PinPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SARPage } from './pages/SARPage';
import { SDPPage } from './pages/SDPPage';
import { STGPage } from './pages/STGPage';
import { WLHPage } from './pages/WLHPage';

/**
 * Route guard that redirects unauthenticated users to /login.
 * All routes nested under this component require a valid session token.
 * Renders the nested route content via Outlet when authenticated.
 */
function ProtectedRoute() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * Root router for the application.
 * Unauthenticated flows (Login, PIN) render without the AppShell chrome.
 * All function screens are nested under ProtectedRoute and share the AppShell layout
 * (Header, MessageBar, Footer, numpad/keyboard panel).
 * Unbuilt screens render PlaceholderPage with their jump code displayed.
 */
export default function App() {
  return (
    <Routes>
      {/* Unauthenticated flows — no app shell */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pin"   element={<PinPage />} />

      {/* All authenticated function screens share the app shell. StagingProvider/PIIProvider/
          ISIProvider are mounted here (not inside STGPage/PIIPage/ISIPage) so STG's fork
          state, PII's last-loaded pallet, and ISI's last search all survive navigating away
          and back, and are naturally cleared on logout when ProtectedRoute unmounts this
          whole subtree. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<StagingProvider><PIIProvider><ISIProvider><AppShell /></ISIProvider></PIIProvider></StagingProvider>}>
          <Route path="/"                        element={<HomePage />} />
          {/* Phase 6 screens */}
          <Route path="/pull"                    element={<PIPPage />} />
          <Route path="/put/directed"            element={<SDPPage />} />
          <Route path="/put/manual"              element={<MNPPage />} />
          <Route path="/pallet"                  element={<PIIPage />} />
          <Route path="/item"                    element={<IIDPage />} />
          <Route path="/pallet/reinstate"        element={<PARPage />} />
          <Route path="/location"                element={<LIIPage />} />
          <Route path="/hold"                    element={<WLHPage />} />
          <Route path="/staged-aisle"            element={<SARPage />} />
          <Route path="/storage-inquiry"         element={<ISIPage />} />
          <Route path="/empty/aisle"             element={<ELAPage />} />
          <Route path="/empty/zone"              element={<ELZPage />} />
          <Route path="/stage"                   element={<STGPage />} />
          <Route path="/reporting/individual"    element={<PlaceholderPage code="IRP" />} />
          <Route path="/reporting/pull-request"  element={<PlaceholderPage code="PRQ" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
