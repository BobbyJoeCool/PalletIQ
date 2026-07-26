import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  title: string;
  onJump: () => void;
  onActivity: () => void;
  disableNav?: boolean;
  locked?: boolean;
}

/**
 * Persistent top bar rendered on all authenticated screens.
 * Contains Back and Home navigation buttons (disabled on the Home screen itself),
 * a Jump button that opens the HotJump code overlay, an Activity button that opens the
 * app-wide 12-hour activity log overlay (issue #46), the current screen title,
 * the logged-in user's display name, and a Logout button.
 *
 * Back and Home are visually dimmed and non-interactive when disableNav is true
 * to prevent navigating "back" from the Home screen into the login flow.
 *
 * When locked is true (an active transaction on the current screen — e.g. an SDP
 * reservation awaiting put), Back, Home, Jump, Activity, and Logout are all disabled so
 * the worker can't leave the screen until the transaction resolves.
 *
 * @param title - Screen title displayed centered in the header
 * @param onJump - Callback to open the HotJump overlay
 * @param onActivity - Callback to open the app-wide activity log overlay
 * @param disableNav - When true, dims and disables Back and Home buttons
 * @param locked - When true, dims and disables Back, Home, Jump, Activity, and Logout
 */
export function Header({ title, onJump, onActivity, disableNav = false, locked = false }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const displayName = user ? `${user.firstName} ${user.lastName.charAt(0)}.` : '';

  const navBtn =
    'flex items-center justify-center h-[68px] px-5 rounded-[10px] ' +
    'border border-[#3A3A3A] font-ui text-[22px] font-medium text-white ' +
    'select-none whitespace-nowrap transition-colors';

  const activeNavBtn = navBtn + ' hover:bg-[#1A1A1A] active:bg-[#262626]';
  const disabledNavBtn = navBtn + ' opacity-25 pointer-events-none cursor-default';

  const navDisabled = disableNav || locked;

  return (
    <header className="shrink-0 flex items-center gap-3 px-6 h-[104px] bg-black border-b border-[#2A2A2A]">
      <button type="button" onClick={() => navigate(-1)} className={navDisabled ? disabledNavBtn : activeNavBtn}>
        ‹ Back
      </button>

      <button type="button" onClick={() => navigate('/')} className={navDisabled ? disabledNavBtn : activeNavBtn}>
        ⌂ Home
      </button>

      <button
        type="button"
        onClick={onJump}
        disabled={locked}
        className="flex items-center justify-center h-[68px] px-5 rounded-[10px] bg-[#CC0000] font-ui text-[22px] font-medium text-white select-none whitespace-nowrap hover:bg-[#AA0000] active:bg-[#990000] transition-colors disabled:opacity-25 disabled:pointer-events-none"
      >
        &gt;_ Jump
      </button>

      <button
        type="button"
        onClick={onActivity}
        disabled={locked}
        className="flex items-center justify-center h-[68px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[22px] font-medium text-white select-none whitespace-nowrap hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors disabled:opacity-25 disabled:pointer-events-none"
      >
        ☰ Activity
      </button>

      <div className="flex-1 flex items-center justify-center">
        <span className="font-ui text-[30px] font-semibold text-white tracking-wide uppercase">
          {title}
        </span>
      </div>

      <span className="font-ui text-[20px] text-[#CFCFCF] whitespace-nowrap select-none">
        {displayName}
      </span>

      <button
        type="button"
        onClick={logout}
        disabled={locked}
        className="flex items-center justify-center h-[68px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[22px] font-medium text-white select-none whitespace-nowrap hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors disabled:opacity-25 disabled:pointer-events-none"
      >
        Logout
      </button>
    </header>
  );
}
