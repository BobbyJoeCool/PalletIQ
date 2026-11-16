import { useStorageCodes } from '../../lib/useStorageCodes';

/**
 * "{code}: {description}" for a Storage Code (#172), looked up from the cached Storage Code
 * reference list (one fetch per session, shared with every Storage Code picker). Renders
 * nothing until the code resolves to a known description.
 */
export function StorageCodeDescription({ code, className }: { code: string | null | undefined; className?: string }) {
  const codes = useStorageCodes();
  const desc = code ? codes?.find((c) => c.code === code)?.desc : undefined;
  if (!code || !desc) return null;
  return <span className={className}>{code}: {desc}</span>;
}
