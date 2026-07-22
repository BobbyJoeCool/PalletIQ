import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ELAProvider } from './context/ELAContext';
import { ELZProvider } from './context/ELZContext';
import { IIDProvider } from './context/IIDContext';
import { ISIProvider } from './context/ISIContext';
import { LIIProvider } from './context/LIIContext';
import { MNPProvider } from './context/MNPContext';
import { PARProvider } from './context/PARContext';
import { PIIProvider } from './context/PIIContext';
import { PIPProvider } from './context/PIPContext';
import { SARProvider } from './context/SARContext';
import { SDPProvider } from './context/SDPContext';
import { StagingProvider } from './context/StagingContext';
import { WLHProvider } from './context/WLHContext';
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

      {/* All authenticated function screens share the app shell. Every per-screen
          persistence Provider (App-Wide screen-persistence item, v1.7.0 — StagingProvider/
          PIIProvider/ISIProvider/LIIProvider were the original 4; PIPProvider/SDPProvider/
          MNPProvider/IIDProvider/PARProvider/WLHProvider/SARProvider/ELAProvider/
          ELZProvider extend the same pattern to the remaining 9 screens) is mounted here
          (not inside each screen's own page component) so each screen's own last-loaded
          result survives navigating away and back, and is naturally cleared on logout when
          ProtectedRoute unmounts this whole subtree. Nesting order doesn't matter — none of
          these providers depend on each other. */}
      <Route element={<ProtectedRoute />}>
        <Route element={
          <StagingProvider><PIIProvider><ISIProvider><LIIProvider>
            <PIPProvider><SDPProvider><MNPProvider><IIDProvider><PARProvider>
              <WLHProvider><SARProvider><ELAProvider><ELZProvider>
                <AppShell />
              </ELZProvider></ELAProvider></SARProvider></WLHProvider>
            </PARProvider></IIDProvider></MNPProvider></SDPProvider></PIPProvider>
          </LIIProvider></ISIProvider></PIIProvider></StagingProvider>
        }>
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
