import { DataRow } from './DataRow';

interface ItemDescriptionProps {
  value: string | null | undefined;
  /** `row` (label left, DataRow — detail screens) or `stacked` (label above, value below —
   *  entry forms like PAR). */
  layout?: 'row' | 'stacked';
  dense?: boolean;
  labelWidth?: number;
  /** Width class for the `stacked` layout. */
  width?: string;
}

/**
 * The item's short description (`descShort`) — presentational; the screen passes the value
 * it already fetched. The label is always "Description" (#172 — it was "Description",
 * "Item", "Short Description", or nothing depending on the screen).
 */
export function ItemDescription({ value, layout = 'row', dense, labelWidth, width = 'w-[600px]' }: ItemDescriptionProps) {
  if (layout === 'stacked') {
    return (
      <div className={`flex flex-col gap-1 ${width}`}>
        <span className="font-ui font-medium text-[#9A9A9A] uppercase tracking-wider text-[13px]">Description</span>
        <span className="flex items-center font-data font-medium text-[#CFCFCF] h-[60px] text-[20px]">
          {value || <span className="text-[#444]">—</span>}
        </span>
      </div>
    );
  }
  return (
    <DataRow label="Description" dense={dense} labelWidth={labelWidth}>
      {value ?? <span className="text-[#9A9A9A]">—</span>}
    </DataRow>
  );
}
