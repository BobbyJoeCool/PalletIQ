import { fmt1, fmtPct, goalBg, type FunctionFieldValues } from '../../lib/irpFormat';

/** One field in an IRP row — value with an optional starred/emphasized bubble treatment. */
export function Field({ label, value, star, pct }: { label: string; value: string; star?: boolean; pct?: number | null }) {
  return (
    <div className="flex flex-col items-start gap-0.5 shrink-0">
      <span className="font-ui text-[11px] text-[#7A7A7A] uppercase tracking-wide">{label}</span>
      {star ? (
        <span className={`font-data text-[20px] font-bold rounded-[8px] px-2.5 py-0.5 ${goalBg(pct ?? null)}`}>{value}</span>
      ) : (
        <span className="font-data text-[16px] text-[#CFCFCF]">{value}</span>
      )}
    </div>
  );
}

/** Renders the field set for one function, per its own Row Layout template in
 *  DevNotes/DesignPrompts/IRP.md — the same set for both IRP's summary row and every
 *  hourly zoom-in row. */
export function FunctionFields({ summary }: { summary: FunctionFieldValues }) {
  switch (summary.functionCode) {
    case 'CA':
    case 'CF':
      return (
        <>
          <Field label="Locations" value={String(summary.locations ?? 0)} />
          <Field label="Cartons" value={String(summary.cartons ?? 0)} star pct={summary.pctToGoal} />
          <Field label="Density" value={fmt1(summary.density)} />
          <Field label="Cartons/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="% to Goal" value={fmtPct(summary.pctToGoal)} star pct={summary.pctToGoal} />
          <Field label="Hours" value={fmt1(summary.hours)} />
          <Field label="Hours of Work" value={fmt1(summary.hoursOfWork)} />
        </>
      );
    case 'FP':
      return (
        <>
          <Field label="Pallets" value={String(summary.pallets ?? 0)} star pct={summary.pctToGoal} />
          <Field label="Cartons" value={String(summary.cartons ?? 0)} />
          <Field label="Density" value={fmt1(summary.density)} />
          <Field label="Pallets/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="% to Goal" value={fmtPct(summary.pctToGoal)} star pct={summary.pctToGoal} />
          <Field label="Hours" value={fmt1(summary.hours)} />
          <Field label="Hours of Work" value={fmt1(summary.hoursOfWork)} />
        </>
      );
    case 'RP':
      return (
        <>
          <Field label="Puts" value={String(summary.puts ?? 0)} star pct={summary.pctToGoal} />
          <Field label="Puts/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="% to Goal" value={fmtPct(summary.pctToGoal)} star pct={summary.pctToGoal} />
          <Field label="Hours" value={fmt1(summary.hours)} />
          <Field label="Hours of Work" value={fmt1(summary.hoursOfWork)} />
        </>
      );
    case 'HP':
      return (
        <>
          <Field label="Locations" value={String(summary.locations ?? 0)} star pct={summary.pctToGoal} />
          <Field label="Cartons" value={String(summary.cartons ?? 0)} />
          <Field label="Density" value={fmt1(summary.density)} />
          <Field label="Cartons/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="% to Goal" value={fmtPct(summary.pctToGoal)} star pct={summary.pctToGoal} />
          <Field label="Hours" value={fmt1(summary.hours)} />
          <Field label="Hours of Work" value={fmt1(summary.hoursOfWork)} />
        </>
      );
    case 'GPM':
      return (
        <>
          <Field label="Pallets Staged" value={String(summary.pallets ?? 0)} />
          <Field label="Pallets/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="Hours" value={fmt1(summary.hours)} />
        </>
      );
    case 'CON':
      return (
        <>
          <Field label="Pallets Moved" value={String(summary.pallets ?? 0)} />
          <Field label="Pallets/Hour" value={fmt1(summary.ratePerHour)} />
          <Field label="Hours" value={fmt1(summary.hours)} />
        </>
      );
    default:
      // BK/BKP — no real pull flow in the app yet; permanently greyed per product decision.
      return <span className="font-ui text-[14px] text-[#555]">No data — not yet available</span>;
  }
}
