import { DataRow } from '../shared/DataRow';
import { StatusBadge } from '../shared/StatusBadge';
import type { CIIContainerData } from '../../context/CIIContext';

type SSPUnitData = Extract<CIIContainerData, { type: '94' }>;

interface Props {
  data: SSPUnitData;
  onNavigateContainer: (cid: string) => void;
  onNavigateItem: (dept: number, cls: number, item: number) => void;
}

export function CIISSPUnitDetail({ data, onNavigateContainer, onNavigateItem }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-6">
        <div className="flex-1 flex flex-col gap-1">
          <DataRow label="Status"><StatusBadge status={data.status} /></DataRow>
          <DataRow label="DPCI">
            <button type="button" onClick={() => onNavigateItem(data.deptClassItem!.dept, data.deptClassItem!.class, data.deptClassItem!.item)} className="text-[#4499FF] underline">{data.dpci}</button>
          </DataRow>
          <DataRow label="Item">{data.itemDesc}</DataRow>
          <DataRow label="Storage Code">{data.storageCode}</DataRow>
          <DataRow label="Standard Qty">{data.standardEachQty}</DataRow>
          <DataRow label="Actual Qty">{data.actualEachQty}</DataRow>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <DataRow label="Destination">{data.destinationStore.name} (#{data.destinationStore.id})</DataRow>
          <DataRow label="Created">{new Date(data.createdAt).toLocaleString()}</DataRow>
          {data.packedAt && <DataRow label="Packed At">{new Date(data.packedAt).toLocaleString()}</DataRow>}
          {data.canceledAt && <DataRow label="Canceled At">{new Date(data.canceledAt).toLocaleString()}</DataRow>}
          <DataRow label="Source Master">
            <button type="button" onClick={() => onNavigateContainer(data.sourceMaster.cid)} className="text-[#4499FF] underline">{data.sourceMaster.cid}</button>
          </DataRow>
          <DataRow label="Master Status"><StatusBadge status={data.sourceMaster.status} /></DataRow>
        </div>
      </div>
    </div>
  );
}
