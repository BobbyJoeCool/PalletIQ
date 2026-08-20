import { useState } from 'react';
import { DataRow } from '../shared/DataRow';
import { StatusBadge } from '../shared/StatusBadge';
import type { CIIContainerData } from '../../context/CIIContext';
import { CIIReassignModal } from './CIIReassignModal';

type StrayEachData = Extract<CIIContainerData, { type: '95' }>;

interface Props {
  data: StrayEachData;
  isIM: boolean;
  token: string;
  onRefresh: () => void;
  onNavigateItem: (dept: number, cls: number, item: number) => void;
}

export function CIIStrayEachDetail({ data, isIM, token, onRefresh, onNavigateItem }: Props) {
  const [showReassign, setShowReassign] = useState(false);
  const canReassign = isIM && data.status === 'PENDING';

  return (
    <div className="flex flex-col gap-1">
      <DataRow label="Status"><StatusBadge status={data.status} /></DataRow>
      <DataRow label="DPCI">
        <button type="button" onClick={() => onNavigateItem(data.deptClassItem!.dept, data.deptClassItem!.class, data.deptClassItem!.item)} className="text-[#4499FF] underline">{data.dpci}</button>
      </DataRow>
      <DataRow label="Item">{data.itemDesc}</DataRow>
      <DataRow label="Storage Code">{data.storageCode}</DataRow>
      <DataRow label="Each Qty">{data.eachQty}</DataRow>
      <DataRow label="Destination">{data.destinationStore.name} (#{data.destinationStore.id})</DataRow>
      <DataRow label="Found By">{data.foundByZ}</DataRow>
      <DataRow label="Created">{new Date(data.createdAt).toLocaleString()}</DataRow>
      {data.packedAt && <DataRow label="Packed At">{new Date(data.packedAt).toLocaleString()}</DataRow>}
      {data.canceledAt && <DataRow label="Canceled At">{new Date(data.canceledAt).toLocaleString()}</DataRow>}

      {canReassign && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowReassign(true)}
            className="h-[48px] px-6 rounded-[10px] bg-[#003366] hover:bg-[#004488] font-ui text-[16px] font-semibold text-white transition-colors"
          >
            Reassign Destination
          </button>
        </div>
      )}

      {showReassign && (
        <CIIReassignModal
          cid={data.cid}
          currentStore={data.destinationStore}
          token={token}
          onClose={() => setShowReassign(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
