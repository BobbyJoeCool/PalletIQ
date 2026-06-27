import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PinPad } from '../components/PinPad';
import { useAuth } from '../context/AuthContext';
import { loginWithPin } from '../lib/api';
import { playErrorBeep } from '../lib/audio';

interface LocationState {
  zNumber: string;
  firstName: string;
  lastName: string;
}

export function PinPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const state = location.state as LocationState | null;

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && !loading) {
      void handleSubmit(pin);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (!state) return <Navigate to="/login" replace />;

  const handleSubmit = async (currentPin: string) => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await loginWithPin(state.zNumber, currentPin);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      playErrorBeep();
      const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
      setError(code === 'INVALID_PIN' ? 'Incorrect PIN. Please try again.' : 'Something went wrong. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold text-white tracking-wide">PalletIQ</h1>

      <p className="text-2xl text-slate-200">
        Welcome, <span className="font-semibold text-white">{state.firstName}</span>. Enter your PIN.
      </p>

      {/* PIN dots */}
      <div className="flex gap-4">
        {dots.map((filled, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-colors ${
              filled ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-slate-500'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="w-64 bg-red-900/60 border border-red-500 rounded-lg px-4 py-3 text-red-200 text-sm text-center">
          {error}
        </div>
      )}

      <PinPad value={pin} onChange={setPin} disabled={loading} />
    </div>
  );
}
