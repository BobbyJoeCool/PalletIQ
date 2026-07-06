import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PinPad } from '../components/PinPad';
import { MessageBar } from '../components/shell/MessageBar';
import { MessageBarProvider, useMessageBar } from '../context/MessageBarContext';
import { useAuth } from '../context/AuthContext';
import { loginWithPin } from '../lib/api';
import { playAlert } from '../lib/audio';

interface LocationState {
  zNumber: string;
  firstName: string;
  lastName: string;
}

/**
 * Inner content of the PIN screen. Shows the user's first name (from LoginPage route state),
 * four PIN dot boxes that fill as digits are entered, and a PinPad. Auto-submits when the pin
 * reaches 4 digits — no separate OK tap is required. On success, calls auth context login()
 * (stores the JWT + user) and navigates to the app home screen with replace:true so Back doesn't
 * return here.
 *
 * @param state - Route state passed from LoginPage: zNumber, firstName, lastName
 */
function PinContent({ state }: { state: LocationState }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pin.length === 4 && !loading) void submit(pin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  /** Verifies the 4-digit PIN via loginWithPin(); on success logs in and navigates to Home. */
  const submit = async (currentPin: string) => {
    if (loading) return;
    clearMessage();
    setLoading(true);
    try {
      const { token, user } = await loginWithPin(state.zNumber, currentPin);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      playAlert('error');
      const code = err instanceof Error ? err.message : '';
      setMessage({
        type: 'error',
        text: code === 'INVALID_PIN' ? 'Incorrect PIN — try again' : 'Connection error — please try again',
      });
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  /** Updates the PIN field and clears any error message from a previous attempt. */
  const handleChange = (v: string) => {
    setPin(v);
    clearMessage();
  };

  // 4 PIN dot boxes
  const dots = Array.from({ length: 4 }, (_, i) => {
    const filled = i < pin.length;
    const isActive = i === pin.length;
    return { filled, isActive };
  });

  return (
    <div className="fixed inset-0 flex flex-col bg-black select-none">
      {/* Back button (login-only chrome) */}
      <div className="flex items-center px-6 pt-6">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="flex items-center justify-center h-[68px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[22px] font-medium text-white hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
        >
          ‹ Back
        </button>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10">
        {/* Greeting */}
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-ui text-[34px] font-semibold">
            <span className="text-white">Welcome: </span>
            <span className="text-[#9A9A9A]">{state.firstName}</span>
          </h2>
          <p className="font-ui text-[24px] text-[#9A9A9A]">Enter your PIN</p>
        </div>

        {/* PIN dot row */}
        <div className="flex items-center gap-[22px]">
          {dots.map(({ filled, isActive }, i) => (
            <div
              key={i}
              className={[
                'w-[96px] h-[108px] rounded-[12px] flex items-center justify-center border-2 transition-colors',
                isActive
                  ? 'bg-[#0D0D0D] border-[#CC0000]'
                  : 'bg-[#0D0D0D] border-[#3A3A3A]',
              ].join(' ')}
            >
              {filled ? (
                <div className="w-[26px] h-[26px] rounded-full bg-white" />
              ) : isActive ? (
                <div className="w-[3px] h-[48px] bg-[#CC0000] rounded-sm animate-pulse" />
              ) : null}
            </div>
          ))}
        </div>

        <PinPad value={pin} onChange={handleChange} disabled={loading} />
      </div>

      {/* Bottom: message bar (standalone) */}
      <MessageBar standalone />
    </div>
  );
}

/**
 * PIN entry screen.
 * Guards against direct URL access or stale navigation: if route state is missing, redirects
 * immediately to /login. Otherwise renders PinContent in an isolated MessageBarProvider.
 */
export function PinPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  if (!state) return <Navigate to="/login" replace />;

  return (
    <MessageBarProvider>
      <PinContent state={state} />
    </MessageBarProvider>
  );
}
