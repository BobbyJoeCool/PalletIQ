import { useState } from 'react';
import type { TeamProdCard } from '@shared/teamProd';
import { clockText } from '../../lib/rosterFormat';
import { Gauge } from './Gauge';
import { GoalPercent } from './GoalPercent';

/** @returns a duration as "1h 20m" */
function durationText(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

const fmt = (n: number | null, digits = 0) =>
  n == null
    ? '—'
    : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/**
 * One function's card on Team Prod Summary (#147). PULL and PROD cards show plan, staffing,
 * Team Prod % and % to Plan (PULL adds the estimated finish); SCAN cards show staffing,
 * count and rate; the Downtime card shows headcount. Every card expands into a per-worker
 * table (IRP-style figures, % to goal against each worker's ramping-adjusted goal, highest
 * first; names only for Downtime).
 *
 * `elapsedPct` is how much of the shift has passed: % to Plan is coloured against it, so a
 * team on pace mid-shift reads green rather than red.
 */
export function FunctionCard({ card, elapsedPct }: { card: TeamProdCard; elapsedPct: number }) {
  const [open, setOpen] = useState(false);
  const big = card.tier === 'PULL' || card.tier === 'PROD';
  const unit = card.unit ?? '';

  return (
    <section
      aria-label={`${card.functionCode} ${card.label}`}
      className={[
        'flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-4',
        big ? '' : 'text-sm',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">
            {card.functionCode === 'DTM' ? 'Downtime' : card.functionCode}{' '}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              {card.functionCode === 'DTM' ? '' : card.label}
            </span>
          </h3>
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-disabled)]">
            {card.tier}
          </span>
        </div>
        <div className="text-right">
          <span className="block font-data text-lg font-semibold">{card.staffed}</span>
          <span className="text-[11px] text-[var(--text-muted)]">
            staffed{card.ramping > 0 ? ` · ${card.ramping} ramping` : ''}
          </span>
        </div>
      </div>

      {big && !card.tracked && (
        <p className="m-0 text-xs text-[var(--text-muted)]">
          Output for {card.functionCode} is not tracked yet.
        </p>
      )}

      {big && card.tracked && (
        <>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Plan{' '}
            {card.target != null
              ? `${fmt(card.target)} ${unit}${card.targetSimulated ? ' (simulated)' : ''}`
              : 'not set'}
          </p>
          <Gauge
            label="Team Prod"
            percent={card.teamProdPct}
            detail={
              card.ratePerHour != null
                ? `${fmt(card.ratePerHour, 1)} ${unit}/hr vs ${fmt(card.rate)} standard`
                : 'No time on this function yet'
            }
          />
          <Gauge
            label="% to Plan"
            percent={card.percentToPlan}
            goodAt={Math.max(1, elapsedPct)}
            detail={
              card.target != null
                ? `${fmt(card.actual)} / ${fmt(card.target)} ${unit}`
                : `${fmt(card.actual)} ${unit} — no plan set`
            }
          />
          {card.tier === 'PULL' && card.finish && (
            <div className="text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Est. finish{' '}
              </span>
              <span
                className={[
                  'font-data font-semibold',
                  card.finish.overrunMs > 0 ? 'text-[var(--warning)]' : '',
                ].join(' ')}
              >
                {clockText(card.finish.at)}
              </span>
              {card.finish.overrunMs > 0 && (
                <span className="block text-xs text-[var(--warning)]">
                  after shift end (+{durationText(card.finish.overrunMs)})
                </span>
              )}
            </div>
          )}
        </>
      )}

      {card.tier === 'SCAN' && (
        <p className="m-0 font-data">
          {fmt(card.actual)} {unit}
          <span className="ml-2 text-xs text-[var(--text-muted)]">
            {card.ratePerHour != null ? `${fmt(card.ratePerHour, 1)}/hr` : ''}
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="h-7 w-fit rounded border border-[var(--border-strong)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-5)]"
      >
        {open ? '▴ Collapse' : `▾ Expand (${card.workers.length})`}
      </button>

      {open &&
        (card.workers.length === 0 ? (
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Nobody has worked this function this shift.
          </p>
        ) : card.tier === 'OTHER' ? (
          <ul className="m-0 list-none p-0 text-xs">
            {card.workers.map((w) => (
              <li key={w.zNumber}>
                {w.lastName}, {w.firstName}{' '}
                <span className="text-[var(--text-muted)]">{fmt(w.hours, 2)}h</span>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[var(--text-muted)]">
                <th className="py-1 pr-2 font-semibold">Worker</th>
                <th className="py-1 pr-2 text-right font-semibold">Hours</th>
                <th className="py-1 pr-2 text-right font-semibold">{unit || 'Count'}</th>
                <th className="py-1 pr-2 text-right font-semibold">Per hr</th>
                {card.tier !== 'SCAN' && <th className="py-1 text-right font-semibold">% goal</th>}
              </tr>
            </thead>
            <tbody>
              {card.workers.map((w) => (
                <tr key={w.zNumber} className="border-t border-[var(--border-subtle)]">
                  <td className="py-1 pr-2">
                    {w.lastName}, {w.firstName}
                    {w.rampPercent != null && (
                      <span className="ml-1 rounded bg-[var(--warning-bg)] px-1 text-[10px] font-semibold text-[var(--warning)]">
                        RAMP {w.rampPercent}%
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right font-data">{fmt(w.hours, 2)}</td>
                  <td className="py-1 pr-2 text-right font-data">{fmt(w.count)}</td>
                  <td className="py-1 pr-2 text-right font-data">{fmt(w.ratePerHour, 1)}</td>
                  {card.tier !== 'SCAN' && (
                    <td className="py-1 text-right font-data">
                      <GoalPercent percent={w.pctToGoal} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}
