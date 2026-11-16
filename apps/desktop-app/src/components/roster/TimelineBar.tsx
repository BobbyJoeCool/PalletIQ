import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Segment, TimeSpan } from '@shared/workforce';
import { SNAP_MINUTES, gapsIn, normalizeSegments, snapTime } from '@shared/workforce';
import { colorFor, describeSection, sectionText, spanText } from '../../lib/rosterFormat';

interface TimelineBarProps {
  workerName: string;
  window: TimeSpan;
  breaks: TimeSpan[];
  scheduled: TimeSpan | null;
  segments: Segment[];
  /** Function being "called up": other sections are dimmed. */
  focusCode: string | null;
  now: number | null;
  disabled: boolean;
  onCommit: (segments: Segment[]) => void;
  onSectionClick: (section: Segment) => void;
  onSectionDoubleClick: (section: Segment, at: number) => void;
  onGapClick: (span: TimeSpan) => void;
  onHover: (t: number | null) => void;
}

/** A divider being dragged: which section edge, and the section it shares the edge with. */
interface Drag {
  index: number;
  edge: 'start' | 'end';
  /** Index of the touching neighbour that moves with this edge, if any. */
  partner: number | null;
  rect: DOMRect;
  original: Segment[];
}

const MIN_SECTION = SNAP_MINUTES * 60_000;
/** Longer than this between clicks is two single clicks, not a double-click. */
const DOUBLE_CLICK_MS = 250;

/**
 * One worker's shift as a horizontal bar (#145). Coloured sections are their
 * assignments; hatched stretches inside their scheduled time are unassigned; dimmed ends
 * are outside their schedule; faint bands are breaks.
 *
 * - Drag a section's edge to move it (snaps to 15 minutes). Where two sections touch,
 *   the divider moves both.
 * - Click a section to edit it; click a hatched stretch to assign it.
 * - Double-click a section to split it there.
 */
export function TimelineBar(props: TimelineBarProps) {
  const { window, breaks, scheduled, focusCode, now, disabled } = props;
  const length = window.end - window.start;
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Segment[] | null>(null);
  const segments = preview ?? props.segments;

  const pct = (t: number) => `${((t - window.start) / length) * 100}%`;
  const width = (span: TimeSpan) => `${((span.end - span.start) / length) * 100}%`;

  /** @returns the snapped instant under a pointer's x position */
  function timeAt(clientX: number, rect: DOMRect): number {
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snapTime(window.start + fraction * length);
  }

  function startDrag(event: ReactPointerEvent, index: number, edge: 'start' | 'end') {
    if (disabled || !barRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    const list = props.segments;
    const neighbour = edge === 'end' ? index + 1 : index - 1;
    const touching =
      list[neighbour] &&
      (edge === 'end'
        ? list[neighbour].start === list[index].end
        : list[neighbour].end === list[index].start);
    dragRef.current = {
      index,
      edge,
      partner: touching ? neighbour : null,
      rect: barRef.current.getBoundingClientRect(),
      original: list,
    };
  }

  function moveDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeAt(event.clientX, drag.rect);
    const next = drag.original.map((s) => ({ ...s }));
    const seg = next[drag.index];
    if (drag.edge === 'end') {
      const limit =
        drag.partner != null
          ? next[drag.partner].end - MIN_SECTION
          : (next[drag.index + 1]?.start ?? window.end);
      seg.end = Math.min(Math.max(t, seg.start + MIN_SECTION), limit);
      if (drag.partner != null) next[drag.partner].start = seg.end;
    } else {
      const limit =
        drag.partner != null
          ? next[drag.partner].start + MIN_SECTION
          : (next[drag.index - 1]?.end ?? window.start);
      seg.start = Math.max(Math.min(t, seg.end - MIN_SECTION), limit);
      if (drag.partner != null) next[drag.partner].end = seg.start;
    }
    setPreview(next);
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const changed =
      preview &&
      preview.some((s, i) => s.start !== drag.original[i].start || s.end !== drag.original[i].end);
    if (changed && preview) props.onCommit(normalizeSegments(preview));
    setPreview(null);
  }

  function clickSection(section: Segment) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      props.onSectionClick(section);
    }, DOUBLE_CLICK_MS);
  }

  function doubleClickSection(event: React.MouseEvent, section: Segment) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (!barRef.current) return;
    const at = timeAt(event.clientX, barRef.current.getBoundingClientRect());
    props.onSectionDoubleClick(
      section,
      Math.min(Math.max(at, section.start + MIN_SECTION), section.end - MIN_SECTION)
    );
  }

  const gaps = scheduled ? gapsIn(segments, scheduled) : [];

  return (
    <div
      ref={barRef}
      onPointerMove={(e) => {
        moveDrag(e);
        if (barRef.current)
          props.onHover(timeAt(e.clientX, barRef.current.getBoundingClientRect()));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => props.onHover(null)}
      className="relative h-9 overflow-hidden rounded border border-[var(--border-subtle)] bg-[var(--surface-1)]"
    >
      {/* Outside the scheduled time */}
      {scheduled ? (
        <>
          <div
            className="absolute inset-y-0 bg-black/60"
            style={{ left: 0, width: pct(scheduled.start) }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/60"
            style={{ left: pct(scheduled.end) }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/40" title="Not scheduled for this shift" />
      )}

      {breaks.map((b, i) => (
        <div
          key={i}
          className="absolute inset-y-0 bg-white/5"
          style={{ left: pct(b.start), width: width(b) }}
          title={`Break ${spanText(b)}`}
        />
      ))}

      {gaps.map((g, i) => (
        <button
          key={`gap-${i}`}
          type="button"
          disabled={disabled}
          onClick={() => props.onGapClick(g)}
          aria-label={`${props.workerName}: unassigned ${spanText(g)}`}
          title={`Unassigned ${spanText(g)} — click to assign`}
          className="absolute inset-y-0.5 rounded-sm border border-dashed border-[var(--warning-border)]"
          style={{
            left: pct(g.start),
            width: width(g),
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(240,165,0,.18) 0 4px, transparent 4px 9px)',
          }}
        />
      ))}

      {segments.map((s, i) => {
        const dim = focusCode != null && s.functionCode !== focusCode;
        return (
          <div
            key={`${s.start}-${i}`}
            className="absolute inset-y-0.5"
            style={{ left: pct(s.start), width: width(s) }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => clickSection(s)}
              onDoubleClick={(e) => doubleClickSection(e, s)}
              title={`${describeSection(s)} — click to edit, double-click to split`}
              aria-label={`${props.workerName}: ${describeSection(s)}`}
              className={[
                'flex h-full w-full items-center justify-center overflow-hidden rounded-sm text-[11px] font-semibold text-white',
                dim ? 'opacity-25' : '',
              ].join(' ')}
              style={{ backgroundColor: colorFor(s.functionCode) }}
            >
              <span className="truncate px-1">{sectionText(s)}</span>
            </button>
            {!disabled && (
              <>
                <span
                  role="separator"
                  aria-label={`Drag start of ${sectionText(s)}`}
                  onPointerDown={(e) => startDrag(e, i, 'start')}
                  className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize"
                />
                <span
                  role="separator"
                  aria-label={`Drag end of ${sectionText(s)}`}
                  onPointerDown={(e) => startDrag(e, i, 'end')}
                  className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize"
                />
              </>
            )}
          </div>
        );
      })}

      {now != null && now > window.start && now < window.end && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--red-primary)]"
          style={{ left: pct(now) }}
        />
      )}
    </div>
  );
}
