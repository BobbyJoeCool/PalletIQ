import { useNavigate } from 'react-router-dom';
import { fmtLocation } from '../../lib/fmt';
import { useNavLockContext } from '../../context/NavLockContext';

interface LiveIdProps {
  id: string;
  type: 'pallet' | 'location' | 'dpci' | 'upc';
  className?: string;
}

const ROUTES: Record<LiveIdProps['type'], string> = {
  pallet: '/pallet?id=',
  location: '/location?id=',
  dpci: '/item?dpci=',
  upc: '/item?upc=',
};

/**
 * Inline tappable ID chip. Renders a Pallet ID, Location ID, DPCI, or UPC as underlined
 * text; tapping navigates to the corresponding detail screen (/pallet, /location, or
 * /item for DPCI/UPC — issue #47). Location IDs are formatted via fmtLocation (adds
 * dashes); the rest are shown as-is (DPCI is expected pre-formatted by the caller, e.g.
 * via fmtDpci()).
 *
 * Respects the shell-wide navigation lock (see NavLockContext / useNavLock): while a screen
 * has an active transaction locked (e.g. an open SDP reservation), this chip must not offer an
 * escape hatch around that lock — Header's Back/Home/Jump/Logout are already disabled during a
 * lock, but this component navigates directly via useNavigate() and previously ignored the lock
 * entirely, so tapping any ID chip (including ones in a persistent history log) could unmount
 * the locked screen and abandon the in-progress transaction. Renders as inert, unstyled text
 * instead of a button while locked.
 *
 * @param id - Raw ID string (8-digit location barcode, numeric pallet ID, DPCI, or UPC)
 * @param type - Controls route and display format — see ROUTES above
 * @param className - Optional extra Tailwind classes to override text size or color
 */
export function LiveId({ id, type, className = '' }: LiveIdProps) {
  const navigate = useNavigate();
  const { locked } = useNavLockContext();
  const route = `${ROUTES[type]}${encodeURIComponent(id)}`;
  const label = type === 'location' ? fmtLocation(id) : id;

  if (locked) {
    return <span className={`font-data text-white select-none ${className}`}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className={`font-data text-white underline decoration-dotted decoration-2 underline-offset-4 hover:text-[#CFCFCF] active:text-[#9A9A9A] transition-colors cursor-pointer select-none ${className}`}
    >
      {label}
    </button>
  );
}
