/** At or above this % to goal a worker made goal: full green. */
const GOAL_PCT = 100;
/** At or below this % to goal: full red. */
const RED_PCT = 60;

/**
 * The colour for a worker's % to goal (direct instruction 2026-11-17): green at goal or
 * above, then a gradual blend toward red, reaching full red at 60%. The blend runs in
 * OKLCH between the theme's success and error tokens, so it passes through amber rather
 * than muddy brown, and follows the tokens if they change (e.g. print).
 *
 * @returns a CSS colour value
 */
export function goalPercentColor(percent: number): string {
  if (percent >= GOAL_PCT) return 'var(--success)';
  if (percent <= RED_PCT) return 'var(--error)';
  const greenShare = ((percent - RED_PCT) / (GOAL_PCT - RED_PCT)) * 100;
  return `color-mix(in oklch, var(--success) ${greenShare.toFixed(1)}%, var(--error))`;
}

/**
 * A worker's % to goal in Team Prod Summary's expanded table (#147), coloured by
 * `goalPercentColor`. Renders "—" when there is no goal to measure against.
 */
export function GoalPercent({ percent }: { percent: number | null }) {
  if (percent == null) return <>—</>;
  return (
    <span className="font-semibold" style={{ color: goalPercentColor(percent) }}>
      {Math.round(percent)}%
    </span>
  );
}
