import { useNavigate } from 'react-router-dom';
import { fmtLocation } from '../../lib/fmt';

interface LiveIdProps {
  id: string;
  type: 'pallet' | 'location';
  className?: string;
}

/**
 * Inline tappable ID chip. Renders a Pallet ID or Location ID as underlined text;
 * tapping navigates to the corresponding detail screen (/pallet or /location).
 * Location IDs are formatted via fmtLocation (adds dashes); pallet IDs are shown as-is.
 *
 * @param id - Raw ID string (8-digit location barcode or numeric pallet ID)
 * @param type - Controls route and display format: 'pallet' → /pallet?id=, 'location' → /location?id=
 * @param className - Optional extra Tailwind classes to override text size or color
 */
export function LiveId({ id, type, className = '' }: LiveIdProps) {
  const navigate = useNavigate();
  const route = type === 'pallet' ? `/pallet?id=${id}` : `/location?id=${id}`;
  const label = type === 'location' ? fmtLocation(id) : id;

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
