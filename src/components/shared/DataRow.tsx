interface DataRowProps {
  label: string;
  children: React.ReactNode;
}

/**
 * Generic label + value row shared by detail/lookup screens (PII, LII, IID). Matches
 * the row style first established locally in SDPPage/MNPPage — extracted here per
 * Phase 5.2/9.0's deferred "generic data-row component" scaffolding step. Existing
 * screens keep their own local copies rather than being refactored to this one.
 */
export function DataRow({ label, children }: DataRowProps) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-[#1A1A1A]">
      <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
        {label}
      </span>
      <div className="font-data text-[22px] text-white">{children}</div>
    </div>
  );
}
