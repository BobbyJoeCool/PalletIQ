interface DataRowProps {
  label: string;
  children: React.ReactNode;
  /** Label column width in px. Defaults to 180 (PII/LII/IID/SDP/MNP's shared width);
   *  PIP's pull-data panel uses the narrower 160 to match its own denser layout. */
  labelWidth?: number;
  /** Tighter vertical padding (py-1.5 instead of py-2) — PIP's own denser variant. */
  dense?: boolean;
}

/**
 * Generic label + value row shared by detail/lookup screens (PII, LII, IID, SDP, MNP,
 * PIP). Matches the row style first established locally in SDPPage/MNPPage — extracted
 * here per Phase 5.2/9.0's deferred "generic data-row component" scaffolding step.
 */
export function DataRow({ label, children, labelWidth = 180, dense = false }: DataRowProps) {
  return (
    <div className={`flex items-center gap-2 ${dense ? 'py-1.5' : 'py-2'} border-b border-[#1A1A1A]`}>
      <span
        className="shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider"
        style={{ width: labelWidth }}
      >
        {label}
      </span>
      <div className="font-data text-[22px] text-white">{children}</div>
    </div>
  );
}
