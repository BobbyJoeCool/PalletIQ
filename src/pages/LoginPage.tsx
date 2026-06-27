import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZnumPad } from '../components/ZnumPad';
import { identify } from '../lib/api';
import { playErrorBeep } from '../lib/audio';

export function LoginPage() {
  const navigate = useNavigate();
  const [znumber, setZnumber] = useState('z');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (znumber.length < 3 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const { firstName, lastName } = await identify(znumber);
      navigate('/pin', { state: { zNumber: znumber, firstName, lastName } });
    } catch (err) {
      playErrorBeep();
      const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
      setError(code === 'NOT_FOUND' ? 'Employee not found. Please try again.' : 'Something went wrong. Please try again.');
      setZnumber('z');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold text-white tracking-wide">PalletIQ</h1>

      {/* display field */}
      <div className="w-64 h-16 bg-slate-800 rounded-xl flex items-center px-5 border-2 border-slate-600">
        <span className="text-3xl font-mono text-white tracking-widest">
          {znumber.length === 1 ? (
            <>
              <span className="text-slate-400">z</span>
              <span className="animate-pulse text-slate-400">_</span>
            </>
          ) : (
            znumber
          )}
        </span>
      </div>

      {error && (
        <div className="w-64 bg-red-900/60 border border-red-500 rounded-lg px-4 py-3 text-red-200 text-sm text-center">
          {error}
        </div>
      )}

      <ZnumPad
        value={znumber}
        onChange={(v) => { setZnumber(v); setError(null); }}
        onSubmit={handleSubmit}
        disabled={loading}
      />

      <p className="text-slate-500 text-sm">Enter your employee number or scan your badge</p>
    </div>
  );
}
