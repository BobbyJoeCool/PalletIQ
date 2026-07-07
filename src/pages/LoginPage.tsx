import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZnumPad } from '../components/ZnumPad';
import { MessageBar } from '../components/shell/MessageBar';
import { MessageBarProvider } from '../context/MessageBarContext';
import { identify, wakeDatabase } from '../lib/api';
import { playAlert } from '../lib/audio';
import { useMessageBar } from '../context/MessageBarContext';

/**
 * Inner content of the Login screen. Renders a two-panel layout: a badge-scan placeholder
 * zone on the left (the hardware scanner routes its barcode here via AppShell) and a ZnumPad
 * on the right for manual zNumber entry. On submit, calls identify(); on success navigates to
 * /pin with the user's name in route state for the PIN screen greeting.
 *
 * Uses its own MessageBarProvider (provided by LoginPage) so error messages don't bleed into
 * the shell's message bar.
 */
function LoginContent() {
  const navigate = useNavigate();
  const { setMessage, clearMessage } = useMessageBar();
  const [znumber, setZnumber] = useState('z');
  const [loading, setLoading] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'waking' | 'ready' | 'error'>('idle');

  /** Submits the entered zNumber via identify(); on success advances to the PIN screen. */
  const handleSubmit = async () => {
    if (znumber.length < 3 || loading) return;
    clearMessage();
    setLoading(true);
    try {
      const { firstName, lastName } = await identify(znumber);
      navigate('/pin', { state: { zNumber: znumber, firstName, lastName } });
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({
        type: 'error',
        text: code === 'NOT_FOUND'
          ? 'zNumber not found — rescan badge or re-enter'
          : 'Connection error — please try again',
      });
      setZnumber('z');
    } finally {
      setLoading(false);
    }
  };

  /** Updates the zNumber field and clears any error message from a previous attempt. */
  const handleChange = (v: string) => {
    setZnumber(v);
    clearMessage();
  };

  /**
   * Hits the health-check endpoint to force Azure SQL out of auto-pause before the worker
   * attempts to log in. A cold resume can take up to a minute, so this is offered as an
   * optional pre-warm step rather than something the login flow waits on automatically.
   */
  const handleWakeDatabase = async () => {
    if (wakeStatus === 'waking') return;
    setWakeStatus('waking');
    try {
      await wakeDatabase();
      setWakeStatus('ready');
    } catch {
      setWakeStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-black select-none">
      {/* Top: wordmark + headlines */}
      <div className="flex flex-col items-center pt-14 gap-3">
        <h1 className="font-ui text-[40px] font-bold tracking-tight">
          <span className="text-white">Pallet</span>
          <span className="text-[#CC0000]">IQ</span>
        </h1>
        <h2 className="font-ui text-[32px] font-semibold text-white">Welcome to PalletIQ</h2>
        <p className="font-ui text-[24px] text-[#9A9A9A]">
          Please scan your badge or enter your zNumber
        </p>
      </div>

      {/* Middle: badge scanner | OR | zNumber pad */}
      <div className="flex-1 flex items-center justify-center gap-0">
        {/* Badge scanner zone */}
        <div className="flex flex-col items-center justify-center w-[504px] h-[544px] rounded-[16px] border-2 border-dashed border-[#2C2C2C] bg-[#0A0A0A] gap-6">
          {/* Badge icon placeholder */}
          <div className="flex flex-col items-center gap-3 opacity-40">
            <div className="w-[80px] h-[60px] rounded-[8px] bg-[#3A3A3A] flex items-center justify-center">
              <div className="w-[34px] h-[34px] rounded-full bg-[#555]" />
            </div>
            <div className="w-[96px] h-[10px] rounded-full bg-[#3A3A3A]" />
            <div className="w-[70px] h-[10px] rounded-full bg-[#2C2C2C]" />
          </div>
          <p className="font-data text-[22px] font-semibold tracking-[0.09em] text-[#CC0000]">
            TAP BADGE TO SCANNER
          </p>
          <p className="font-ui text-[20px] text-[#777777]">Primary sign-in</p>
        </div>

        {/* OR divider */}
        <div className="flex flex-col items-center mx-6">
          <div className="w-[2px] h-[196px] bg-[#1F1F1F]" />
          <div className="w-[56px] h-[56px] rounded-full border-2 border-[#2A2A2A] bg-black flex items-center justify-center my-[-1px]">
            <span className="font-ui text-[20px] text-[#777777]">or</span>
          </div>
          <div className="w-[2px] h-[196px] bg-[#1F1F1F]" />
        </div>

        {/* zNumber entry */}
        <div className="flex flex-col gap-4">
          <p className="font-ui text-[22px] font-medium text-[#CFCFCF]">Enter your zNumber</p>

          {/* Input display field */}
          <div className="flex items-center h-[92px] px-5 rounded-[12px] bg-[#0D0D0D] border-2 border-[#3A3A3A] w-[504px]">
            <span className="font-data text-[40px] font-medium text-[#CC0000]">z</span>
            <span className="font-data text-[40px] font-medium text-white tracking-[0.04em] ml-1">
              {znumber.slice(1)}
            </span>
            <span className="inline-block w-[3px] h-[46px] bg-[#CC0000] ml-1 animate-pulse rounded-sm" />
          </div>

          <ZnumPad
            value={znumber}
            onChange={handleChange}
            onSubmit={handleSubmit}
            disabled={loading}
          />
        </div>
      </div>

      {/* Wake database — optional pre-warm for a paused Azure SQL serverless instance */}
      <div className="flex flex-col items-center gap-1 pb-2">
        <button
          type="button"
          onClick={handleWakeDatabase}
          disabled={wakeStatus === 'waking'}
          className="flex items-center gap-2 font-ui text-[16px] text-[#666666] underline decoration-dotted hover:text-[#999999] disabled:no-underline disabled:cursor-default"
        >
          {wakeStatus === 'waking' && (
            <span className="inline-block w-[14px] h-[14px] rounded-full border-2 border-[#666666] border-t-transparent animate-spin" />
          )}
          {wakeStatus === 'waking' ? 'Waking up database…' : 'Wake database'}
        </button>
        {wakeStatus === 'waking' && (
          <p className="font-ui text-[14px] text-[#555555]">This can take up to a minute on a cold start</p>
        )}
        {wakeStatus === 'ready' && (
          <p className="font-ui text-[14px] text-[#3FA34D]">Database ready</p>
        )}
        {wakeStatus === 'error' && (
          <p className="font-ui text-[14px] text-[#CC0000]">Could not reach database — try again</p>
        )}
      </div>

      {/* Bottom: message bar (standalone 84 px) */}
      <MessageBar standalone />
    </div>
  );
}

/**
 * Login screen — the first unauthenticated screen a worker sees.
 * Wraps LoginContent in an isolated MessageBarProvider so login error messages are
 * shown in the standalone bottom bar without touching the app shell's context.
 */
export function LoginPage() {
  return (
    <MessageBarProvider>
      <LoginContent />
    </MessageBarProvider>
  );
}
