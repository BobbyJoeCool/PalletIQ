import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { EmbeddedSessionGate } from './components/embed/EmbeddedSessionGate.tsx';
import { ScaleToFit } from './components/shell/ScaleToFit.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScaleToFit>
          <EmbeddedSessionGate>
            <App />
          </EmbeddedSessionGate>
        </ScaleToFit>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
