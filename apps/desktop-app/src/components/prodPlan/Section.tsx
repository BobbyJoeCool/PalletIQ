import type { ReactNode } from 'react';

/** A titled panel on the Prod Goal / Ramping / Daily Plan screen. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
