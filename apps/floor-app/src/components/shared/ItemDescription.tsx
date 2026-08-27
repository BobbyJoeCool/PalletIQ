import { DataRow } from './DataRow';

interface ItemDescriptionProps {
  value: string | null | undefined;
  label?: string;
  dense?: boolean;
  labelWidth?: number;
}

export function ItemDescription({ value, label = 'Description', dense, labelWidth }: ItemDescriptionProps) {
  return (
    <DataRow label={label} dense={dense} labelWidth={labelWidth}>
      {value ?? <span className="text-[#9A9A9A]">—</span>}
    </DataRow>
  );
}
