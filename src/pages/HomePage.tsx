import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-white tracking-wide">PalletIQ</h1>
      <p className="text-xl text-slate-300">
        Logged in as <span className="font-semibold text-white">{user?.firstName} {user?.lastName}</span>
        <span className="ml-3 text-slate-400 text-base">({user?.role})</span>
      </p>
      <p className="text-slate-500 text-sm">[Home screen — Phase 5]</p>
      <button
        type="button"
        onClick={logout}
        className="mt-4 px-6 py-3 bg-slate-700 text-slate-200 rounded-xl hover:bg-slate-600 transition-colors"
      >
        Log out
      </button>
    </div>
  );
}
